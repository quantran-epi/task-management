//! Tool task lifecycle: liveness, cancellation and output streaming (ai-chat-input-lag,
//! architect-approved design).
//!
//! A task lives here for exactly two reasons: the user cancels it by `call_id`, or the app
//! exits. There is deliberately NO timeout — no wall-clock, no idle timeout, no watchdog
//! under any name. A query that runs for an hour still runs; only an explicit cancel or app
//! shutdown stops it.
//!
//! Ownership:
//! - This Rust registry owns liveness (cancel token), remote PID, and the SSH config/secret
//!   needed to SIGTERM the remote process group.
//! - The reader thread owns the SSH channel and streams bounded output chunks over `mpsc`.
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

use crate::ssh_service::{connect_and_auth, SshConfig};

/// How often the command thread wakes up only to check the cancel token. This is NOT a
/// termination condition: a `Timeout` simply loops again. Cancellation is signalled by the
/// token flipped from `cancel_tool_call` (or `cancel_all` on app exit).
const CANCEL_POLL_INTERVAL: Duration = Duration::from_millis(250);
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
    pid: Option<u32>,
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

    /// Record the remote PID once the reader sees the `echo $$` line.
    pub fn set_pid(&self, call_id: &str, pid: u32) {
        if let Ok(mut tasks) = self.tasks.lock() {
            if let Some(task) = tasks.get_mut(call_id) {
                task.pid = Some(pid);
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
    /// exit after the event loop stops accepting new work.
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
        if let Some(pid) = self.pid {
            self.kill_pid(pid)?;
        }
        Ok(())
    }

    /// SIGTERM an explicitly known pid (used when cancel preceded PID discovery).
    fn kill_pid(&self, pid: u32) -> Result<(), String> {
        kill_remote_process_group(&self.config, self.secret.as_deref(), pid)
    }
}

pub fn cleanup_on_exit(registry: &ToolTaskRegistry) {
    registry.cancel_all();
}

/// SIGTERM the remote process group. Negative PID also kills children spawned by the tool.
fn kill_remote_process_group(config: &SshConfig, secret: Option<&str>, pid: u32) -> Result<(), String> {
    let session = connect_and_auth(config, secret)?;
    let mut channel = session
        .channel_session()
        .map_err(|e| format!("Không thể mở channel để hủy tool: {}", e))?;
    channel
        .exec(&format!("kill -TERM -{} 2>/dev/null || kill -TERM {}", pid, pid))
        .map_err(|e| format!("Không thể gửi SIGTERM tới PID {}: {}", pid, e))?;
    let mut sink = String::new();
    let _ = channel.read_to_string(&mut sink);
    let _ = channel.wait_close();
    Ok(())
}

enum Chunk {
    Out(Vec<u8>),
    Err(Vec<u8>),
    Done { exit_status: i32, error: Option<String> },
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
    let session = connect_and_auth(config, secret)?;
    let mut channel = session
        .channel_session()
        .map_err(|e| format!("Không thể mở channel session: {}", e))?;

    // First line is the remote PID so cancellation can SIGTERM the real process group.
    let remote_command = format!("echo $$ && {}", command);
    channel
        .exec(&remote_command)
        .map_err(|e| format!("Thực thi lệnh thất bại: {}", e))?;

    let (tx, rx) = mpsc::channel::<Chunk>();
    let cancelled = Arc::new(AtomicBool::new(false));

    registry.register(
        call_id.clone(),
        LiveTask {
            cancelled: Arc::clone(&cancelled),
            pid: None,
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
            let mut pid_scanned = false;

            loop {
                match channel.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        if !pid_scanned {
                            pid_scanned = true;
                            // The PID may be preceded by a login banner: scan the first
                            // lines, never treating a non-numeric line as output.
                            if let Some(line) = buf[..n].split(|b| *b == b'\n').next() {
                                if let Ok(text) = std::str::from_utf8(line) {
                                    if let Ok(pid) = text.trim().parse::<u32>() {
                                        reader_registry.set_pid(&reader_call_id, pid);
                                        // Cancel may have arrived before the PID was known.
                                        // Kill now so the blocking read unblocks.
                                        if reader_cancelled.load(Ordering::SeqCst) {
                                            if let Ok(Some(task)) = reader_registry.take_for_kill(&reader_call_id) {
                                                let _ = task.kill_pid(pid);
                                            }
                                        }
                                        continue;
                                    }
                                }
                            }
                        }
                        if stdout_len < MAX_OUTPUT_BYTES {
                            let take = n.min(MAX_OUTPUT_BYTES - stdout_len);
                            stdout_len += take;
                            let _ = tx.send(Chunk::Out(buf[..take].to_vec()));
                        }
                    }
                    Err(e) => {
                        let _ = tx.send(Chunk::Done {
                            exit_status: -1,
                            error: Some(format!("Lỗi đọc stdout: {}", e)),
                        });
                        return;
                    }
                }
            }

            // SQLcl prompts/errors arrive on stderr; read it on the same reader thread.
            let mut stderr_stream = channel.stderr();
            loop {
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
                        let _ = tx.send(Chunk::Done {
                            exit_status: -1,
                            error: Some(format!("Lỗi đọc stderr: {}", e)),
                        });
                        return;
                    }
                }
            }

            let _ = channel.wait_close();
            let exit_status = channel.exit_status().unwrap_or(0);
            let _ = tx.send(Chunk::Done { exit_status, error: None });
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
            Ok(Chunk::Done { exit_status, error }) => {
                stdout_coalescer.flush();
                stderr_coalescer.flush();
                break ToolExecOutput {
                    stdout: String::from_utf8_lossy(&stdout).to_string(),
                    stderr: match error {
                        Some(e) => format!("{}\n{}", String::from_utf8_lossy(&stderr), e),
                        None => String::from_utf8_lossy(&stderr).to_string(),
                    },
                    exit_status,
                    finish_reason: if cancelled.load(Ordering::SeqCst) { "cancelled" } else { "complete" }.to_string(),
                };
            }
            // Wake-up only: observe explicit cancel token, then keep waiting. The poll
            // interval is NOT a deadline — without a cancel signal we loop forever.
            Err(mpsc::RecvTimeoutError::Timeout) => {
                stdout_coalescer.tick();
                stderr_coalescer.tick();
                if cancelled.load(Ordering::SeqCst) {
                    stdout_coalescer.flush();
                    stderr_coalescer.flush();
                    break ToolExecOutput {
                        stdout: String::from_utf8_lossy(&stdout).to_string(),
                        stderr: String::from_utf8_lossy(&stderr).to_string(),
                        exit_status: -1,
                        finish_reason: "cancelled".to_string(),
                    };
                }
                continue;
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                stdout_coalescer.flush();
                stderr_coalescer.flush();
                break ToolExecOutput {
                    stdout: String::from_utf8_lossy(&stdout).to_string(),
                    stderr: String::from_utf8_lossy(&stderr).to_string(),
                    exit_status: -1,
                    finish_reason: "error".to_string(),
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
        LiveTask { cancelled, pid: None, config: test_config(), secret: None }
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
        // No PID means no SSH kill connection; a second cancel is still a safe no-op.
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
}
