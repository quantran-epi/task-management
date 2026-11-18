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

use serde::Serialize;
use std::collections::HashMap;
use std::io::Read;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter};

use crate::ssh_service::connect_and_auth_tool_task;
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
struct LiveTask {
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
    pub fn cancel_all(&self) {
        let tasks: Vec<LiveTask> = self
            .tasks
            .lock()
            .map(|tasks| tasks.values().cloned().collect())
            .unwrap_or_default();
        for task in tasks {
            let _ = task.cancel();
        }
        if let Ok(mut tasks) = self.tasks.lock() {
            tasks.clear();
        }
    }
}

impl LiveTask {
    fn cancel(&self) -> Result<(), String> {
        self.cancelled.store(true, Ordering::SeqCst);
        if let Some(pgid) = self.pgid {
            self.kill_pgid(pgid)?;
        }
        Ok(())
    }

    /// SIGTERM an explicitly known process group (used when cancel preceded PGID discovery).
    fn kill_pgid(&self, pgid: u32) -> Result<(), String> {
        kill_remote_process_group(&self.config, self.secret.as_deref(), pgid)
    }
}

pub fn cleanup_on_exit(registry: &ToolTaskRegistry) {
    registry.cancel_all();
}

/// SIGTERM the remote process group, asynchronously: this function returns immediately so
/// app shutdown (and explicit Cancel) never waits on an SSH connection. The spawned thread
/// owns its own config/secret clone and sends SIGTERM to the negative PGID printed by
/// `setsid`, which also terminates children spawned by the tool.
fn spawn_kill_remote_process_group(
    config: &SshConfig,
    secret: Option<&str>,
    pgid: u32,
) -> Result<(), String> {
    let config = config.clone();
    let secret = secret.map(str::to_string);
    thread::Builder::new()
        .name(format!("tool-kill-{}", pgid))
        .spawn(move || {
            let session = match connect_and_auth_without_socket_timeout(&config, secret.as_deref()) {
                Ok(session) => session,
                Err(_) => return,
            };
            let mut channel = match session.channel_session() {
                Ok(channel) => channel,
                Err(_) => return,
            };
            // Negative target = process group. `setsid` made the command its own leader.
            let _ = channel.exec(&format!("kill -TERM -{} 2>/dev/null || true", pgid));
            let mut sink = Vec::new();
            let _ = channel.read_to_end(&mut sink);
        })
        .map_err(|e| format!("Không thể tạo thread hủy tool: {}", e))?;
    Ok(())
}

/// Backward-compatible synchronous variant used only by registry unit tests / direct callers.
fn kill_remote_process_group(config: &SshConfig, secret: Option<&str>, pgid: u32) -> Result<(), String> {
    spawn_kill_remote_process_group(config, secret, pgid)
}

enum Chunk {
    Out(Vec<u8>),
    Err(Vec<u8>),
    /// Reader exited. The command thread resolves ONLY after this message arrives.
    ReaderExited {
        exit_status: i32,
        cancelled: bool,
        error: Option<String>,
    },
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
fn build_remote_command(command: &str) -> String {
    format!("setsid sh -c 'echo $$; exec {command}'", command = command)
}

/// Read a PGID from one output chunk. The first numeric line is the leader; banner lines are
/// skipped so login banners cannot spoof the id.
fn read_pgid_line(text: &str) -> Option<u32> {
    text.lines().find_map(|line| line.trim().parse::<u32>().ok())
}

/// The short socket timeout on the tool session is a wake-up, never a termination reason.
/// Any error that merely means "no bytes yet" must loop again, not produce `Done{error}`.
fn is_wakeup_timeout(err: &std::io::Error) -> bool {
    let text = err.to_string().to_lowercase();
    text.contains("timed out")
        || text.contains("would block")
        || text.contains("resource temporarily unavailable")
        || text.contains("socket error")
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
) -> Result<ToolExecOutput, String> {
    // Wake-up-only socket timeout: lets the reader check the cancel token every 250ms, but
    // a timeout NEVER ends the task. Only explicit cancel/app exit may end it.
    let session = connect_and_auth_tool_task(config, secret)?;
    let mut channel = session
        .channel_session()
        .map_err(|e| format!("Không thể mở channel session: {}", e))?;

    let remote_command = build_remote_command(&command);
    channel
        .exec(&remote_command)
        .map_err(|e| format!("Thực thi lệnh thất bại: {}", e))?;

    let (tx, rx) = mpsc::channel::<Chunk>();
    let cancelled = Arc::new(AtomicBool::new(false));

    registry.register(
        call_id.clone(),
        LiveTask {
            cancelled: Arc::clone(&cancelled),
            pgid: None,
            config: config.clone(),
            secret: secret.map(str::to_string),
        },
    );

    let reader_call_id = call_id.clone();
    let reader_registry = registry;
    let reader_cancelled = Arc::clone(&cancelled);
    thread::Builder::new()
        .name(format!("tool-reader-{}", call_id))
        .spawn(move || {
            let mut buf = [0u8; READ_CHUNK_BYTES];
            let mut stdout_len = 0usize;
            let mut stderr_len = 0usize;
            let mut pgid_scanned = false;
            let mut prefix = String::new(); // bytes before the first newline while scanning PGID
            let mut read_error: Option<String> = None;

            // Single reader thread: read stdout fully, then stderr. A single channel cannot
            // be read by two threads concurrently without corrupting the stream.
            loop {
                if reader_cancelled.load(Ordering::SeqCst) {
                    break;
                }
                match channel.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let mut payload = &buf[..n];
                        if !pgid_scanned {
                            // Accumulate until the first newline; that line is the PGID.
                            let end = payload.iter().position(|b| *b == b'\n');
                            match end {
                                Some(idx) => {
                                    prefix.push_str(&String::from_utf8_lossy(&payload[..idx + 1]));
                                    if let Some(pgid) = read_pgid_line(&prefix) {
                                        reader_registry.set_pgid(&reader_call_id, pgid);
                                        // Cancel may have arrived before the PGID was known.
                                        // Kill now so the blocking read unblocks.
                                        if reader_cancelled.load(Ordering::SeqCst) {
                                            if let Ok(Some(task)) = reader_registry.take_for_kill(&reader_call_id) {
                                                let _ = task.kill_pgid(pgid);
                                            }
                                        }
                                    }
                                    pgid_scanned = true;
                                    payload = &payload[idx + 1..];
                                }
                                None => prefix.push_str(&String::from_utf8_lossy(payload)),
                            }
                        }
                        if stdout_len < MAX_OUTPUT_BYTES && !payload.is_empty() {
                            let take = payload.len().min(MAX_OUTPUT_BYTES - stdout_len);
                            stdout_len += take;
                            let _ = tx.send(Chunk::Out(payload[..take].to_vec()));
                        }
                    }
                    Err(e) => {
                        if reader_cancelled.load(Ordering::SeqCst) {
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

            // SQLcl prompts/errors arrive on stderr; read it on the same reader thread.
            if read_error.is_none() {
                let mut stderr_stream = channel.stderr();
                loop {
                    if reader_cancelled.load(Ordering::SeqCst) {
                        break;
                    }
                    match stderr_stream.read(&mut buf) {
                        Ok(0) => break,
                        Ok(n) => {
                            if stderr_len < MAX_OUTPUT_BYTES {
                                let take = n.min(MAX_OUTPUT_BYTES - stderr_len);
                                stderr_len += take;
                                let _ = tx.send(Chunk::Err(buf[..take].to_vec()));
                            }
                        }
                        Err(e) => {
                            if reader_cancelled.load(Ordering::SeqCst) {
                                break;
                            }
                            if is_wakeup_timeout(&e) {
                                continue; // Wake-up only: no error result from a timeout.
                            }
                            read_error = Some(format!("Lỗi đọc stderr: {}", e));
                            break;
                        }
                    }
                }
            }

            let was_cancelled = reader_cancelled.load(Ordering::SeqCst);
            let exit_status = if was_cancelled { -1 } else { channel.exit_status().unwrap_or(0) };
            let _ = tx.send(Chunk::ReaderExited {
                exit_status,
                cancelled: was_cancelled,
                error: read_error,
            });
        })
        .map_err(|e| format!("Không thể tạo thread đọc lệnh: {}", e))?;

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
            // ONLY exit path: the reader thread has actually exited, so the invoke never
            // resolves while a read is still pending. A cancel flips the token, the kill
            // unblocks the reader, and this message follows.
            Ok(Chunk::ReaderExited { exit_status, cancelled: was_cancelled, error }) => {
                stdout_coalescer.flush();
                stderr_coalescer.flush();
                let finish_reason = if was_cancelled || cancelled.load(Ordering::SeqCst) {
                    "cancelled"
                } else if error.is_some() {
                    "error"
                } else {
                    "complete"
                };
                break ToolExecOutput {
                    stdout: String::from_utf8_lossy(&stdout).to_string(),
                    stderr: match error {
                        Some(e) => format!("{}\n{}", String::from_utf8_lossy(&stderr), e),
                        None => String::from_utf8_lossy(&stderr).to_string(),
                    },
                    exit_status,
                    finish_reason: finish_reason.to_string(),
                };
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
    };

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
    fn cancel_all_marks_every_live_token() {
        let registry = ToolTaskRegistry::default();
        let a = Arc::new(AtomicBool::new(false));
        let b = Arc::new(AtomicBool::new(false));
        registry.register("a".into(), live_task(Arc::clone(&a)));
        registry.register("b".into(), live_task(Arc::clone(&b)));
        registry.cancel_all();
        assert!(a.load(Ordering::SeqCst));
        assert!(b.load(Ordering::SeqCst));
        assert_eq!(registry.cancel("a").unwrap(), false);
    }

    #[test]
    fn remote_command_wraps_in_setsid_and_execs_command() {
        let command = build_remote_command("sqlcl -S");
        assert!(command.contains("setsid sh -c"));
        assert!(command.contains("echo $$"));
        assert!(command.contains("exec sqlcl -S"));
        assert!(!command.contains("echo $$ &&"));
    }

    #[test]
    fn pgid_line_parses_first_numeric_line_and_skips_banners() {
        assert_eq!(read_pgid_line("12345\n"), Some(12345));
        assert_eq!(read_pgid_line("banner\n12345\n"), Some(12345));
        assert_eq!(read_pgid_line("not-a-pid\n"), None);
    }

    #[test]
    fn socket_wakeup_is_not_a_task_error() {
        use std::io::{Error, ErrorKind};
        assert!(is_wakeup_timeout(&Error::new(ErrorKind::WouldBlock, "Resource temporarily unavailable")));
        assert!(is_wakeup_timeout(&Error::new(ErrorKind::TimedOut, "connection timed out")));
        assert!(!is_wakeup_timeout(&Error::new(ErrorKind::BrokenPipe, "broken pipe")));
    }
}
