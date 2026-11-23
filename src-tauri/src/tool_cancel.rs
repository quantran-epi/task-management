//! Tool task lifecycle: liveness, cancellation and output streaming (ai-chat-input-lag,
//! architect-approved design).
//!
//! A task lives here for exactly two reasons: the user cancels it by `call_id`, or the app
//! exits. There is deliberately NO timeout — no wall-clock, no idle timeout, no watchdog
//! under any name. A query that runs for an hour still runs; only an explicit cancel or app
//! shutdown stops it.
//!
//! Ownership:
//! - This Rust registry owns liveness (cancel token), remote process-group id and the SSH
//!   config/secret needed to SIGTERM that group.
//! - The reader thread owns the SSH channel and streams bounded output chunks over `mpsc`.
//!   It checks the cancel token on every loop iteration — `read()` is never allowed to block
//!   until EOF uncountably, because a cancelled command must always resolve the invoke.
//! - The frontend stores the last snapshot in a module-level store so drawer/tab unmounts
//!   cannot kill a task.

use base64::Engine;
use serde::Serialize;
use std::collections::HashMap;
use std::io::Read;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter};

use crate::ssh_service::{connect_and_auth_tool_task, connect_and_auth_without_socket_timeout};
use crate::ssh_service::SshConfig;

/// How often the command thread wakes up only to check the cancel token. This is NOT a
/// termination condition: a `Timeout` simply loops again. Cancellation is signalled by the
/// token flipped from `cancel_tool_call` (or `cancel_all` on app exit).
const CANCEL_POLL_INTERVAL: Duration = Duration::from_millis(50);
/// Coalesce output events to at most one per this interval per task.
const EMIT_COALESCE_INTERVAL: Duration = Duration::from_millis(50);
/// Reader reads at most this many bytes per syscall (bounded chunk, never `read_to_end`).
const READ_CHUNK_BYTES: usize = 8 * 1024;
/// Hard cap on buffered stdout/stderr per task. Output beyond this is dropped, not blocking.
const MAX_OUTPUT_BYTES: usize = 2 * 1024 * 1024;
/// Coalescer flushes pending bytes when either timer OR size threshold is hit.
const EMIT_FLUSH_BYTES: usize = 16 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolExecOutput {
    pub stdout: String,
    pub stderr: String,
    pub exit_status: i32,
    /// `complete` | `cancelled` | `error`
    pub finish_reason: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolTaskUpdateEvent {
    pub call_id: String,
    pub stream: String, // "stdout" | "stderr"
    pub text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolTaskStatusEvent {
    pub call_id: String,
    /// `running` | `done` | `cancelled` | `error`
    pub status: String,
    pub finish_reason: Option<String>,
}

/// One live tool call. Cloned out of the registry before any kill so no lock is held across
/// an SSH connection (avoids deadlock).
#[derive(Clone)]
pub(crate) struct LiveTask {
    cancelled: Arc<AtomicBool>,
    /// Process-group id printed by `setsid` — `kill -TERM -<pgid>` hits the whole job.
    pgid: Option<u32>,
    config: SshConfig,
    secret: Option<String>,
}

/// Registry shared by every `#[tauri::command]` via Tauri's managed state.
#[derive(Default)]
pub struct ToolTaskRegistry {
    tasks: Mutex<HashMap<String, LiveTask>>,
}

impl ToolTaskRegistry {
    /// Reserve liveness BEFORE any SSH work starts. The async Tauri command calls this on the
    /// main thread, so a Cancel clicked during connect/exec still finds the call_id and flips
    /// its token. Without this, `cancel_tool_call` returns false for the whole connect phase.
    /// The returned token is moved into `spawn_blocking`; no borrowed state crosses threads.
    pub fn reserve(&self, call_id: String, config: SshConfig, secret: Option<String>) -> Arc<AtomicBool> {
        let cancelled = Arc::new(AtomicBool::new(false));
        self.register(
            call_id,
            LiveTask { cancelled: Arc::clone(&cancelled), pgid: None, config, secret },
        );
        cancelled
    }

    pub fn register(&self, call_id: String, task: LiveTask) {
        if let Ok(mut tasks) = self.tasks.lock() {
            tasks.insert(call_id, task);
        }
    }

    pub fn remove(&self, call_id: &str) {
        if let Ok(mut tasks) = self.tasks.lock() {
            tasks.remove(call_id);
        }
    }

    /// Record the remote PGID once the reader sees the `setsid` line.
    pub fn set_pgid(&self, call_id: &str, pgid: u32) {
        if let Ok(mut tasks) = self.tasks.lock() {
            if let Some(task) = tasks.get_mut(call_id) {
                task.pgid = Some(pgid);
            }
        }
    }

    /// Clone the registered task so a kill can happen without holding the registry lock.
    pub fn take_for_kill(&self, call_id: &str) -> Result<Option<LiveTask>, String> {
        let tasks = self.tasks.lock().map_err(|e| e.to_string())?;
        Ok(tasks.get(call_id).cloned())
    }

    /// Cancel by id only. Returns false (no-op) if the call is not live — idempotent both for
    /// the caller and for repeated clicks.
    pub fn cancel(&self, call_id: &str) -> Result<bool, String> {
        let task = {
            let tasks = self.tasks.lock().map_err(|e| e.to_string())?;
            tasks.get(call_id).cloned()
        };
        let Some(task) = task else { return Ok(false) };
        task.cancel()?;
        Ok(true)
    }

    /// Mark every live task cancelled and SIGTERM each remote process group. Called on app
    /// exit after the event loop stops accepting new work. Kills are spawned asynchronously
    /// so shutdown never blocks the event loop on SSH.
    ///
    /// The map is deliberately NOT cleared here. A task cancelled before its PGID line
    /// arrives has no group to kill yet; the reader kills on discovery, and the command
    /// thread's cancel-poll loops too. Both look the task up by id, so removing it here
    /// would leave the remote process running. `run_cancellable_remote_command` removes
    /// each task exactly once when its reader has exited.
    /// Returns one receiver per spawned SSH kill, so shutdown can wait for them.
    pub fn cancel_all(&self) -> Vec<mpsc::Receiver<()>> {
        let tasks: Vec<LiveTask> = self
            .tasks
            .lock()
            .map(|tasks| tasks.values().cloned().collect())
            .unwrap_or_default();
        tasks.iter().filter_map(|task| task.cancel().ok().flatten()).collect()
    }
}

impl LiveTask {
    fn cancel(&self) -> Result<Option<mpsc::Receiver<()>>, String> {
        self.cancelled.store(true, Ordering::SeqCst);
        match self.pgid {
            Some(pgid) => self.kill_pgid(pgid).map(Some),
            None => Ok(None),
        }
    }

    /// SIGTERM an explicitly known process group (used when cancel preceded PGID discovery).
    fn kill_pgid(&self, pgid: u32) -> Result<mpsc::Receiver<()>, String> {
        kill_remote_process_group(&self.config, self.secret.as_deref(), pgid)
    }
}

pub fn cleanup_on_exit(registry: &ToolTaskRegistry) {
    let pending = registry.cancel_all();
    let deadline = Instant::now() + SHUTDOWN_KILL_WAIT;
    // A process exit right after spawning the SSH kill threads can orphan the remote job.
    // Wait briefly for each kill to finish, with one total budget shared across all tasks.
    for rx in pending {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            break;
        }
        let _ = rx.recv_timeout(remaining);
    }
}

/// Overall budget for remote SIGTERM connections during app shutdown.
const SHUTDOWN_KILL_WAIT: Duration = Duration::from_secs(3);

/// SIGTERM the remote process group on a detached thread so explicit Cancel never waits on
/// SSH. The returned receiver fires when the kill attempt finishes, letting app shutdown
/// wait briefly instead of exiting while the remote job is still alive.
fn spawn_kill_remote_process_group(
    config: &SshConfig,
    secret: Option<&str>,
    pgid: u32,
) -> Result<mpsc::Receiver<()>, String> {
    let config = config.clone();
    let secret = secret.map(str::to_string);
    let (done_tx, done_rx) = mpsc::channel();
    thread::Builder::new()
        .name(format!("tool-kill-{}", pgid))
        .spawn(move || {
            let session = connect_and_auth_without_socket_timeout(&config, secret.as_deref()).ok();
            if let Some(session) = session {
                if let Ok(mut channel) = session.channel_session() {
                    // Negative target = process group. `setsid` made the command its own leader.
                    let _ = channel.exec(&format!("kill -TERM -{} 2>/dev/null || true", pgid));
                    let mut sink = Vec::new();
                    let _ = channel.read_to_end(&mut sink);
                }
            }
            let _ = done_tx.send(());
        })
        .map_err(|e| format!("Không thể tạo thread hủy tool: {}", e))?;
    Ok(done_rx)
}

fn kill_remote_process_group(
    config: &SshConfig,
    secret: Option<&str>,
    pgid: u32,
) -> Result<mpsc::Receiver<()>, String> {
    spawn_kill_remote_process_group(config, secret, pgid)
}

enum Chunk {
    Out(Vec<u8>),
    Err(Vec<u8>),
    /// The reader discovered the remote PGID. The command thread owns the registry reference
    /// and handles kill-on-cancel here; no borrowed registry is ever moved into a thread.
    Pgid(u32),
    /// Stdout reader exited. The command thread resolves ONLY after both readers exit.
    ReaderExited {
        exit_status: i32,
        cancelled: bool,
        error: Option<String>,
    },
    /// Stderr reader exited. Kept separate so stdout EOF cannot leave stderr unread.
    StderrExited { error: Option<String> },
}

/// Emits at most one event per `EMIT_COALESCE_INTERVAL`, or immediately when the pending
/// buffer crosses `EMIT_FLUSH_BYTES`. Keeps the event pipeline bounded and UI responsive.
struct OutputCoalescer {
    app: AppHandle,
    call_id: String,
    stream: &'static str,
    pending: String,
    last_emit: Instant,
}

impl OutputCoalescer {
    fn new(app: AppHandle, call_id: String, stream: &'static str) -> Self {
        Self { app, call_id, stream, pending: String::new(), last_emit: Instant::now() }
    }

    fn push(&mut self, bytes: &[u8]) {
        self.pending.push_str(&String::from_utf8_lossy(bytes));
        if self.pending.len() >= EMIT_FLUSH_BYTES {
            self.flush();
        }
    }

    fn tick(&mut self) {
        if !self.pending.is_empty() && self.last_emit.elapsed() >= EMIT_COALESCE_INTERVAL {
            self.flush();
        }
    }

    fn flush(&mut self) {
        if self.pending.is_empty() {
            return;
        }
        let text = std::mem::take(&mut self.pending);
        let _ = self.app.emit(
            "tool-task-update",
            ToolTaskUpdateEvent {
                call_id: self.call_id.clone(),
                stream: self.stream.to_string(),
                text,
            },
        );
        self.last_emit = Instant::now();
    }
}

/// Launch the command under a NEW session so `setsid sh` is the process-group leader. It
/// prints its own PGID as the first line; `exec` then replaces that shell with the real
/// command, preserving the same PID/PGID. `kill -<pgid>` therefore targets the exact job.
///
/// The command is carried as base64 through the SSH exec string, NOT interpolated inside
/// `sh -c '<raw>'`: Oracle's `<<'EOF_ORACLE_SQLCL'` heredoc and git's `escapeShellArg()`
/// single-quoted arguments would otherwise close the wrapper quote and execute a different
/// command. The outer wrapper's single quotes contain ONLY the base64 alphabet (plus the
/// fixed `echo $$; exec sh -c "$(...)"` code). The decoded payload becomes the single
/// argument of the inner `sh -c`; shell command substitution is not re-expanded, so single
/// quotes, heredocs and literal `$()` inside the original command survive byte-for-byte.
pub fn build_remote_command(command: &str) -> String {
    let encoded = base64::engine::general_purpose::STANDARD.encode(command.as_bytes());
    format!(
        "setsid sh -c 'echo {pgid_prefix}$$; exec sh -c \"$(printf %s {encoded} | base64 -d)\"'",
        encoded = encoded,
        pgid_prefix = PGID_LINE_PREFIX,
    )
}

/// Unique marker on the PGID line. SSH login banners and command output can contain arbitrary
/// numeric lines; only a line with this exact prefix is the `setsid` leader id.
const PGID_LINE_PREFIX: &str = "TASKMATE_PGID:";

/// Read a PGID from one output chunk. Only the sentinel-prefixed line is accepted; arbitrary
/// numeric banner lines can no longer be mistaken for the process-group leader.
fn read_pgid_line(text: &str) -> Option<u32> {
    text.lines()
        .find_map(|line| line.trim().strip_prefix(PGID_LINE_PREFIX)?.trim().parse::<u32>().ok())
}

/// The short socket timeout on the tool session is a wake-up, never a termination reason.
/// Match by `ErrorKind` only: a loose substring match on "socket error" also swallowed real
/// transport failures (broken pipe, reset connection), spinning forever with no output.
fn is_wakeup_timeout(err: &std::io::Error) -> bool {
    matches!(
        err.kind(),
        std::io::ErrorKind::TimedOut | std::io::ErrorKind::WouldBlock | std::io::ErrorKind::Interrupted
    )
}

/// Run a remote command with explicit cancellation only. The SSH read runs on a detached
/// reader thread; this command thread waits in short `recv_timeout(CANCEL_POLL_INTERVAL)`
/// loops whose ONLY purpose is to observe the cancel token. No deadline, no idle watchdog.
pub fn run_cancellable_remote_command(
    registry: &ToolTaskRegistry,
    app: AppHandle,
    config: &SshConfig,
    secret: Option<&str>,
    call_id: String,
    command: String,
    cancelled: Arc<AtomicBool>,
) -> Result<ToolExecOutput, String> {
    // The token was reserved by the async command BEFORE spawn_blocking. A cancel that
    // arrived during queueing/connect must skip SSH entirely — never open a connection for
    // a call the user already cancelled. `remove` below is the single cleanup on every path.
    let cancelled_output = || ToolExecOutput {
        stdout: String::new(),
        stderr: String::new(),
        exit_status: -1,
        finish_reason: "cancelled".to_string(),
    };
    let finish = |result: ToolExecOutput| {
        registry.remove(&call_id);
        let status = if result.finish_reason == "cancelled" { "cancelled" } else if result.finish_reason == "error" { "error" } else { "done" };
        let _ = app.emit(
            "tool-task-status",
            ToolTaskStatusEvent {
                call_id: call_id.clone(),
                status: status.to_string(),
                finish_reason: Some(result.finish_reason.clone()),
            },
        );
        Ok(result)
    };

    if cancelled.load(Ordering::SeqCst) {
        return finish(cancelled_output());
    }

    // Wake-up-only socket timeout: lets the reader check the cancel token every 250ms, but
    // a timeout NEVER ends the task. Only explicit cancel/app exit may end it.
    let session = match connect_and_auth_tool_task(config, secret) {
        Ok(session) => session,
        Err(e) => {
            registry.remove(&call_id);
            return Err(e);
        }
    };
    let mut channel = match session.channel_session() {
        Ok(channel) => channel,
        Err(e) => {
            registry.remove(&call_id);
            return Err(format!("Không thể mở channel session: {}", e));
        }
    };

    let remote_command = build_remote_command(&command);
    if let Err(e) = channel.exec(&remote_command) {
        registry.remove(&call_id);
        return Err(format!("Thực thi lệnh thất bại: {}", e));
    }
    // A cancel arriving during connect/exec is handled by the reader below: it sees the
    // token immediately, exits, and still reports the PGID (if any) for kill-on-discovery.

    let (tx, rx) = mpsc::channel::<Chunk>();

    let stdout_cancelled = Arc::clone(&cancelled);
    // ssh2 Channel/Stream are Send + Sync over a shared locked session; each reader owns a
    // clone so a full stderr pipe cannot block while stdout is drained to EOF.
    let stderr_channel = channel.clone();
    let stderr_tx = tx.clone();
    let stderr_cancelled = Arc::clone(&cancelled);
    let _stderr_thread = thread::Builder::new()
        .name(format!("tool-stderr-{}", call_id))
        .spawn(move || {
            let mut buf = [0u8; READ_CHUNK_BYTES];
            let mut stderr_len = 0usize;
            let mut error = None;
            let mut stream = stderr_channel.stderr();
            loop {
                if stderr_cancelled.load(Ordering::SeqCst) {
                    break;
                }
                match stream.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        if stderr_len < MAX_OUTPUT_BYTES {
                            let take = n.min(MAX_OUTPUT_BYTES - stderr_len);
                            stderr_len += take;
                            let _ = stderr_tx.send(Chunk::Err(buf[..take].to_vec()));
                        }
                    }
                    Err(e) => {
                        if stderr_cancelled.load(Ordering::SeqCst) {
                            break;
                        }
                        if is_wakeup_timeout(&e) {
                            continue; // Wake-up only: no error result from a timeout.
                        }
                        error = Some(format!("Lỗi đọc stderr: {}", e));
                        break;
                    }
                }
            }
            let _ = stderr_tx.send(Chunk::StderrExited { error });
        });
    let _stderr_thread = match _stderr_thread {
        Ok(handle) => Some(handle),
        Err(e) => {
            registry.remove(&call_id);
            return Err(format!("Không thể tạo thread đọc stderr: {}", e));
        }
    };

    thread::Builder::new()
        .name(format!("tool-reader-{}", call_id))
        .spawn(move || {
            let mut buf = [0u8; READ_CHUNK_BYTES];
            let mut stdout_len = 0usize;
            let mut pgid_scanned = false;
            let mut prefix = String::new(); // bytes before the first newline while scanning PGID
            let mut read_error: Option<String> = None;

            loop {
                if stdout_cancelled.load(Ordering::SeqCst) {
                    break;
                }
                match channel.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let mut payload = &buf[..n];
                        if !pgid_scanned {
                            // Scan line by line until the sentinel-marked PGID line arrives.
                            // A banner line before it must not consume the scan.
                            loop {
                                let Some(idx) = payload.iter().position(|b| *b == b'\n') else {
                                    prefix.push_str(&String::from_utf8_lossy(payload));
                                    break;
                                };
                                prefix.push_str(&String::from_utf8_lossy(&payload[..idx + 1]));
                                payload = &payload[idx + 1..];
                                if let Some(pgid) = read_pgid_line(&prefix) {
                                    // The command thread records the PGID in the registry
                                    // and kills it if cancel arrived before discovery.
                                    let _ = tx.send(Chunk::Pgid(pgid));
                                    pgid_scanned = true;
                                    break;
                                }
                            }
                        }
                        if stdout_len < MAX_OUTPUT_BYTES && !payload.is_empty() {
                            let take = payload.len().min(MAX_OUTPUT_BYTES - stdout_len);
                            stdout_len += take;
                            let _ = tx.send(Chunk::Out(payload[..take].to_vec()));
                        }
                    }
                    Err(e) => {
                        if stdout_cancelled.load(Ordering::SeqCst) {
                            break; // Cancelled: the kill closed the channel, expected.
                        }
                        if is_wakeup_timeout(&e) {
                            continue; // Wake-up only: check token again, never Done{error}.
                        }
                        read_error = Some(format!("Lỗi đọc stdout: {}", e));
                        break;
                    }
                }
            }

            let was_cancelled = stdout_cancelled.load(Ordering::SeqCst);
            let exit_status = if was_cancelled {
                -1
            } else {
                // libssh2 only delivers the real exit-status packet after the channel closes.
                // The tool session uses a 250ms wake-up socket timeout, so EAGAIN here is a
                // poll tick, not a command failure — retry until close or a real transport
                // error. If close never completes, keep -1 as "unknown" instead of claiming
                // success from unwrap_or(0).
                loop {
                    match channel.wait_close() {
                        Ok(()) => break,
                        Err(e) if is_wakeup_timeout(&e) => {
                            if stdout_cancelled.load(Ordering::SeqCst) {
                                break;
                            }
                            continue;
                        }
                        Err(_) => break,
                    }
                }
                channel.exit_status().unwrap_or(-1)
            };
            let _ = tx.send(Chunk::ReaderExited {
                exit_status,
                cancelled: was_cancelled,
                error: read_error,
            });
        })
        .map_err(|e| {
            registry.remove(&call_id);
            format!("Không thể tạo thread đọc lệnh: {}", e)
        })?;

    let _ = app.emit(
        "tool-task-status",
        ToolTaskStatusEvent {
            call_id: call_id.clone(),
            status: "running".to_string(),
            finish_reason: None,
        },
    );

    let mut stdout = Vec::new();
    let mut stderr = Vec::new();
    let mut stdout_coalescer = OutputCoalescer::new(app.clone(), call_id.clone(), "stdout");
    let mut stderr_coalescer = OutputCoalescer::new(app.clone(), call_id.clone(), "stderr");
    let mut stdout_exit: Option<(i32, bool, Option<String>)> = None;
    let mut stderr_error: Option<Option<String>> = None;

    let result = loop {
        match rx.recv_timeout(CANCEL_POLL_INTERVAL) {
            Ok(Chunk::Out(bytes)) => {
                stdout_coalescer.push(&bytes);
                stdout.extend_from_slice(&bytes);
            }
            Ok(Chunk::Err(bytes)) => {
                stderr_coalescer.push(&bytes);
                stderr.extend_from_slice(&bytes);
            }
            Ok(Chunk::Pgid(pgid)) => {
                registry.set_pgid(&call_id, pgid);
                // Cancel may have arrived before the PGID was known. Kill now so the
                // reader's blocking read unblocks and the invoke can resolve.
                if cancelled.load(Ordering::SeqCst) {
                    if let Ok(Some(task)) = registry.take_for_kill(&call_id) {
                        let _ = task.kill_pgid(pgid);
                    }
                }
            }
            // Resolve only after BOTH readers have exited: a full stderr pipe can no longer
            // be left unread while stdout is drained to EOF.
            Ok(Chunk::ReaderExited { exit_status, cancelled: was_cancelled, error }) => {
                stdout_exit = Some((exit_status, was_cancelled, error));
            }
            Ok(Chunk::StderrExited { error }) => {
                stderr_error = Some(error);
            }
            // Wake-up only: observe explicit cancel token, then keep waiting for the reader.
            // If PGID is already known, re-send SIGTERM to guarantee the process dies even
            // when the initial kill was lost; the reader's next read then unblocks and exits.
            Err(mpsc::RecvTimeoutError::Timeout) => {
                stdout_coalescer.tick();
                stderr_coalescer.tick();
                if cancelled.load(Ordering::SeqCst) {
                    if let Ok(Some(task)) = registry.take_for_kill(&call_id) {
                        if let Some(pgid) = task.pgid {
                            let _ = task.kill_pgid(pgid);
                        }
                    }
                }
                continue;
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                // Reader panicked without sending its exit message: still resolve with an
                // explicit error so the invoke never hangs.
                stdout_coalescer.flush();
                stderr_coalescer.flush();
                break ToolExecOutput {
                    stdout: String::from_utf8_lossy(&stdout).to_string(),
                    stderr: String::from_utf8_lossy(&stderr).to_string(),
                    exit_status: -1,
                    finish_reason: if cancelled.load(Ordering::SeqCst) { "cancelled" } else { "error" }.to_string(),
                };
            }
        }

        if let (Some((exit_status, was_cancelled, stdout_error)), Some(stderr_error)) =
            (stdout_exit.take(), stderr_error.take())
        {
            stdout_coalescer.flush();
            stderr_coalescer.flush();
            let errors: Vec<String> = [stdout_error, stderr_error].into_iter().flatten().collect();
            let finish_reason = if was_cancelled || cancelled.load(Ordering::SeqCst) {
                "cancelled"
            } else if !errors.is_empty() {
                "error"
            } else {
                "complete"
            };
            break ToolExecOutput {
                stdout: String::from_utf8_lossy(&stdout).to_string(),
                stderr: if errors.is_empty() {
                    String::from_utf8_lossy(&stderr).to_string()
                } else {
                    format!("{}\n{}", String::from_utf8_lossy(&stderr), errors.join("\n"))
                },
                exit_status,
                finish_reason: finish_reason.to_string(),
            };
        }
    };

    finish(result)
}

/// Tauri command: cancel a tool call by its UI id. Returns `false` if not live (idempotent).
#[tauri::command]
pub fn cancel_tool_call(
    registry: tauri::State<'_, ToolTaskRegistry>,
    call_id: String,
) -> Result<bool, String> {
    registry.cancel(&call_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_config() -> SshConfig {
        SshConfig {
            id: "s".into(), name: "s".into(), host: "".into(), port: 22,
            username: "u".into(), auth_type: "password".into(), key_path: None,
            default_remote_path: None,
        }
    }

    fn live_task(cancelled: Arc<AtomicBool>) -> LiveTask {
        LiveTask { cancelled, pgid: None, config: test_config(), secret: None }
    }

    #[test]
    fn cancelling_unknown_call_is_a_noop() {
        let registry = ToolTaskRegistry::default();
        assert_eq!(registry.cancel("missing").unwrap(), false);
    }

    #[test]
    fn reserve_before_connect_allows_cancel_of_not_yet_running_task() {
        // Regression guard for the cancel-before-register race: the async command reserves
        // the token before spawn_blocking, so Cancel during connect/exec finds the call_id.
        let registry = ToolTaskRegistry::default();
        let token = registry.reserve("early".into(), test_config(), None);
        assert!(!token.load(Ordering::SeqCst));
        // Cancel before any PGID exists (and before SSH connect in the real command).
        assert!(registry.cancel("early").unwrap());
        assert!(token.load(Ordering::SeqCst));
        // Cancelled token is observable from the command thread before it starts work.
        // Task stays in the registry (no PGID yet) so kill-on-discovery still works.
        assert!(registry.take_for_kill("early").unwrap().is_some());
        // Idempotent: repeated clicks do not error or remove the entry prematurely.
        assert!(registry.cancel("early").unwrap());
        assert!(registry.take_for_kill("early").unwrap().is_some());
        registry.remove("early");
        assert!(!registry.cancel("early").unwrap());
    }

    /// Extract one invocation's body up to its closing brace (top-level fn style).
    fn command_body<'a>(source: &'a str, marker: &str) -> &'a str {
        let start = source.find(marker).unwrap_or_else(|| panic!("missing {}", marker));
        let body = &source[start..];
        &body[..body.find("\n}\n").expect("command end")]
    }

    #[test]
    fn ssh_exec_command_is_async_and_offloads_blocking_work() {
        // Source guard: a "fix" that only clones AppHandle but leaves the command sync
        // reintroduces UI blocking on the Tauri main thread. Both markers are mandatory.
        let source = include_str!("ssh_service.rs");
        let body = command_body(source, "pub async fn ssh_exec_command(");
        assert!(body.contains("spawn_blocking"), "ssh_exec_command must use spawn_blocking");
        assert!(
            body.contains("registry.reserve"),
            "ssh_exec_command must reserve the cancel token before spawn_blocking"
        );
    }

    #[test]
    fn ssh_exec_stream_is_async_and_offloads_blocking_connect() {
        // RemoteExplore uses this path too; a sync command would still block the main
        // thread on connect/channel.exec even though the reader runs on its own thread.
        let source = include_str!("ssh_service.rs");
        let body = command_body(source, "pub async fn ssh_exec_stream(");
        assert!(body.contains("spawn_blocking"), "ssh_exec_stream must use spawn_blocking");
    }

    #[test]
    fn cancel_marks_token_and_is_idempotent() {
        let registry = ToolTaskRegistry::default();
        let token = Arc::new(AtomicBool::new(false));
        registry.register("call-1".into(), live_task(Arc::clone(&token)));
        assert_eq!(registry.cancel("call-1").unwrap(), true);
        assert!(token.load(Ordering::SeqCst));
        // No PGID means no SSH kill connection; a second cancel is still a safe no-op.
        assert_eq!(registry.cancel("call-1").unwrap(), true);
        registry.remove("call-1");
        assert_eq!(registry.cancel("call-1").unwrap(), false);
    }

    #[test]
    fn cancel_all_marks_every_live_token_without_dropping_tasks() {
        let registry = ToolTaskRegistry::default();
        let a = Arc::new(AtomicBool::new(false));
        let b = Arc::new(AtomicBool::new(false));
        registry.register("a".into(), live_task(Arc::clone(&a)));
        registry.register("b".into(), live_task(Arc::clone(&b)));
        registry.cancel_all();
        assert!(a.load(Ordering::SeqCst));
        assert!(b.load(Ordering::SeqCst));
        // D: the map must retain cancelled tasks until their reader discovers the PGID;
        // otherwise the kill-on-discovery lookup returns None and the remote job survives.
        assert_eq!(registry.cancel("a").unwrap(), true);
        assert!(registry.take_for_kill("b").unwrap().is_some());
        registry.remove("a");
        registry.remove("b");
        assert_eq!(registry.cancel("a").unwrap(), false);
    }

    #[test]
    fn cancel_all_returns_kill_completion_handles_for_known_pgids() {
        let registry = ToolTaskRegistry::default();
        let token = Arc::new(AtomicBool::new(false));
        let mut task = live_task(Arc::clone(&token));
        task.pgid = Some(4242);
        registry.register("exit".into(), task);
        let pending = registry.cancel_all();
        assert!(token.load(Ordering::SeqCst));
        assert_eq!(pending.len(), 1, "shutdown must be able to await the SSH kill");
        // test_config has an empty host, so the kill thread fails fast and signals completion.
        pending[0]
            .recv_timeout(Duration::from_secs(2))
            .expect("kill thread must signal completion");
        registry.remove("exit");
    }

    #[test]
    fn cancel_before_pgid_discovery_retains_task_for_kill_on_discovery() {
        let registry = ToolTaskRegistry::default();
        let token = Arc::new(AtomicBool::new(false));
        registry.register("early".into(), live_task(Arc::clone(&token)));
        // Cancelled while pgid is still None — exactly the app-exit race in finding D.
        registry.cancel("early").unwrap();
        assert!(token.load(Ordering::SeqCst));
        let retained = registry.take_for_kill("early").unwrap().expect("task retained");
        assert!(retained.pgid.is_none());
        // Reader discovers the PGID and kills it; config/secret are still available.
        registry.set_pgid("early", 4242);
        let discovered = registry.take_for_kill("early").unwrap().expect("task still retained");
        assert_eq!(discovered.pgid, Some(4242));
        assert_eq!(discovered.config.id, "s");
        registry.remove("early");
        assert!(registry.take_for_kill("early").unwrap().is_none());
    }

    /// Decode the payload the wrapper feeds to the inner `sh -c` so tests assert the exact
    /// original command, not just that the wrapper contains a base64-looking blob.
    fn decode_wrapped_command(wrapper: &str) -> String {
        let start = wrapper.find("printf %s ").expect("printf marker") + "printf %s ".len();
        let end = wrapper[start..].find(" | base64 -d").expect("decode marker") + start;
        let encoded = &wrapper[start..end];
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .expect("valid base64 payload");
        String::from_utf8(bytes).expect("utf-8 command")
    }

    #[test]
    fn remote_command_wraps_in_setsid_and_preserves_original_command() {
        let command = build_remote_command("sqlcl -S");
        assert!(command.contains("setsid sh -c"));
        assert!(command.contains(&format!("echo {PGID_LINE_PREFIX}$$")));
        assert!(command.contains("exec sh -c"));
        assert_eq!(decode_wrapped_command(&command), "sqlcl -S");
        // No raw command text inside the outer single-quoted wrapper: a quote/heredoc in
        // the payload can never close it.
        assert!(!command.contains("sqlcl"));
    }

    #[test]
    fn remote_command_preserves_single_quotes_heredocs_and_command_substitution() {
        let original = concat!(
            "sqlcl -S user/'pass' <<'EOF_ORACLE_SQLCL'\n",
            "select '$(literal)' from dual;\n",
            "EOF_ORACLE_SQLCL\n",
            "git -C '/srv/repo' diff --end-of-options 'main..feature/x' -- 'a b.txt'\n",
            "printf '%s' \"$(date +%s)\"\n"
        );
        let wrapper = build_remote_command(original);
        assert_eq!(decode_wrapped_command(&wrapper), original);
        // The outer wrapper has exactly one single-quoted region; its contents contain no
        // single quote, so nested quotes in the payload cannot break out.
        let outer = wrapper
            .split_once("setsid sh -c '")
            .unwrap()
            .1
            .split_once("'")
            .unwrap()
            .0;
        assert!(!outer.contains('\''));
        assert!(outer.contains(&format!("echo {PGID_LINE_PREFIX}$$; exec sh -c")));
    }

    #[test]
    fn reader_waits_for_channel_close_before_reading_exit_status() {
        // Source guard: libssh2 only exposes the real exit status after wait_close. Reading
        // exit_status first turns a successful remote command into a false -1 failure.
        let source = include_str!("tool_cancel.rs");
        let cancelled_marker = "let was_cancelled = stdout_cancelled.load(Ordering::SeqCst);";
        let start = source
            .find(cancelled_marker)
            .expect("cancelled marker in reader branch");
        let tail = &source[start..];
        let wait_close = tail
            .find("channel.wait_close()")
            .expect("wait_close before exit_status in the reader branch");
        let exit_status = tail
            .find("channel.exit_status()")
            .expect("exit_status in the reader branch");
        assert!(
            wait_close < exit_status,
            "wait_close() must precede exit_status() on the non-cancelled path"
        );
        // A wake-up timeout must be retried; otherwise a late close leaves exit_status
        // unavailable and the old unwrap_or(0) falsely reports success.
        assert!(
            source.contains("Err(e) if is_wakeup_timeout(&e)") &&
                source.contains("channel.exit_status().unwrap_or(-1)"),
            "close must retry wake-ups and unknown exit must stay -1"
        );
    }

    #[test]
    fn pgid_line_requires_sentinel_and_ignores_banner_numbers() {
        let marker = PGID_LINE_PREFIX;
        assert_eq!(read_pgid_line(&format!("{marker}12345\n")), Some(12345));
        // Login-banner numeric lines must never be mistaken for the process group.
        assert_eq!(read_pgid_line("12345\n"), None);
        assert_eq!(read_pgid_line(&format!("banner\n12345\n{marker}4242\n")), Some(4242));
        assert_eq!(read_pgid_line("not-a-pid\n"), None);
        // The remote wrapper actually emits the sentinel-prefixed line.
        let wrapper = build_remote_command("sqlcl -S");
        assert!(wrapper.contains(&format!("echo {marker}$$")));
    }

    #[test]
    fn stdout_and_stderr_are_drained_on_separate_threads() {
        let source = include_str!("tool_cancel.rs");
        let body = command_body(source, "pub fn run_cancellable_remote_command(");
        assert!(body.contains("tool-stderr-"), "stderr needs its own reader thread");
        assert!(body.contains("stderr_channel.stderr()"), "stderr thread must own the stderr stream");
        assert!(body.contains("Chunk::StderrExited"), "result must wait for stderr completion");
        assert!(
            body.contains("stdout_exit.take()") && body.contains("stderr_error.take()"),
            "invoke must resolve only after both readers exit"
        );
    }

    #[test]
    fn socket_wakeup_is_not_a_task_error_but_real_socket_errors_are() {
        use std::io::{Error, ErrorKind};
        assert!(is_wakeup_timeout(&Error::new(ErrorKind::WouldBlock, "Resource temporarily unavailable")));
        assert!(is_wakeup_timeout(&Error::new(ErrorKind::TimedOut, "connection timed out")));
        assert!(is_wakeup_timeout(&Error::new(ErrorKind::Interrupted, "interrupted")));
        // E: the old substring match swallowed "socket error" even when the kind said the
        // transport was gone, causing an infinite retry loop with no output.
        assert!(!is_wakeup_timeout(&Error::new(ErrorKind::Other, "socket error 9: bad file descriptor")));
        assert!(!is_wakeup_timeout(&Error::new(ErrorKind::BrokenPipe, "broken pipe")));
        assert!(!is_wakeup_timeout(&Error::new(ErrorKind::ConnectionReset, "connection reset by peer")));
    }
}
