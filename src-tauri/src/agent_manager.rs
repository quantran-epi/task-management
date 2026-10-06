use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, LazyLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::sync::{oneshot, Mutex};

// Max global running processes cap per D-08 (Master + Workers <= 6)
pub const MAX_GLOBAL_PROCESSES: usize = 6;
static RUNNING_PROCESS_COUNT: AtomicUsize = AtomicUsize::new(0);

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

pub fn hidden_std_command<P: AsRef<std::ffi::OsStr>>(program: P) -> std::process::Command {
    let mut cmd = std::process::Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

pub fn hidden_tokio_command<P: AsRef<std::ffi::OsStr>>(program: P) -> tokio::process::Command {
    let mut cmd = tokio::process::Command::new(program);
    #[cfg(windows)]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

// Shell command safe prefixes per D-16 and ASVS V14.2
pub static SAFE_COMMAND_PREFIXES: &[&str] = &[
    "git status",
    "git diff",
    "git log",
    "npm test",
    "npx vitest",
    "cargo check",
    "cargo test",
    "pytest",
    "go test",
];

pub fn format_user_text_envelope(text: &str) -> serde_json::Value {
    serde_json::json!({
        "type": "user",
        "message": {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": text
                }
            ]
        }
    })
}

pub fn format_tool_result_envelope(tool_use_id: &str, content: &str, is_error: bool) -> serde_json::Value {
    serde_json::json!({
        "type": "user",
        "message": {
            "role": "user",
            "content": [
                {
                    "type": "tool_result",
                    "tool_use_id": tool_use_id,
                    "content": content,
                    "is_error": is_error
                }
            ]
        }
    })
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StartSessionPayload {
    pub task_id: String,
    pub task_title: String,
    pub repo_path: String,
    pub master_model: String,
    pub worker_model: String,
    pub initial_prompt: String,
    pub concurrency_cap: Option<usize>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkerSession {
    pub worker_id: String,
    pub role: String,
    pub pid: u32,
    pub model: String,
    pub status: String,
    pub subtask_prompt: String,
    pub started_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionState {
    pub task_id: String,
    pub task_title: String,
    pub repo_path: String,
    pub worktree_path: String,
    pub branch_name: String,
    pub master_pid: u32,
    pub master_model: String,
    pub worker_model: String,
    pub status: String,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub active_workers: Vec<WorkerSession>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StreamEventChunk {
    pub task_id: String,
    pub worker_id: Option<String>,
    pub source: String, // 'master' | 'worker'
    pub timestamp: String,
    #[serde(rename = "type")]
    pub chunk_type: String, // 'log' | 'tool_call' | 'tool_result' | 'error' | 'status_change'
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ShellPermissionRequest {
    pub task_id: String,
    pub request_id: String,
    pub command: String,
    pub working_dir: String,
}

// Active session internal handle
struct ActiveSessionHandle {
    state: AgentSessionState,
    master_pid: u32,
    stdin_tx: Option<tokio::sync::mpsc::Sender<String>>,
    worker_pids: Vec<u32>,
}

pub struct GlobalAgentPool {
    sessions: HashMap<String, ActiveSessionHandle>,
    pending_permissions: HashMap<String, oneshot::Sender<bool>>,
}

impl GlobalAgentPool {
    fn new() -> Self {
        Self {
            sessions: HashMap::new(),
            pending_permissions: HashMap::new(),
        }
    }
}

pub static AGENT_POOL: LazyLock<Arc<Mutex<GlobalAgentPool>>> =
    LazyLock::new(|| Arc::new(Mutex::new(GlobalAgentPool::new())));

/// Check if shell command is strictly within safe whitelist
pub fn is_command_whitelisted(command: &str) -> bool {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return false;
    }
    // Reject shell chaining characters (; & |) per ASVS V14.2 & STRIDE T-15-01
    if trimmed.contains(';') || trimmed.contains('&') || trimmed.contains('|') {
        return false;
    }

    SAFE_COMMAND_PREFIXES.iter().any(|prefix| {
        trimmed == *prefix || trimmed.starts_with(&format!("{} ", prefix))
    })
}

/// Ensure Git worktree exists under .plannermate/worktrees/task-<id>
/// Branch: pm-agent/task-<id>
/// Exclude entry appended to .git/info/exclude so it never dirties git status.
pub fn ensure_git_worktree(repo_root: &Path, task_id: &str) -> Result<PathBuf, String> {
    if !repo_root.exists() || !repo_root.is_dir() {
        return Err(format!("Repository path {:?} does not exist", repo_root));
    }

    let plannermate_dir = repo_root.join(".plannermate");
    let worktrees_dir = plannermate_dir.join("worktrees");
    let worktree_path = worktrees_dir.join(format!("task-{}", task_id));

    // Ensure .plannermate is in .git/info/exclude
    let git_dir = repo_root.join(".git");
    if git_dir.exists() {
        let exclude_file = if git_dir.is_dir() {
            git_dir.join("info").join("exclude")
        } else {
            // In a worktree or submodule, .git is a file pointing to gitdir
            if let Ok(content) = std::fs::read_to_string(&git_dir) {
                if let Some(gitdir_line) = content.lines().find(|l| l.starts_with("gitdir: ")) {
                    let actual_git_dir = PathBuf::from(gitdir_line.trim_start_matches("gitdir: ").trim());
                    actual_git_dir.join("info").join("exclude")
                } else {
                    git_dir.join("info").join("exclude")
                }
            } else {
                git_dir.join("info").join("exclude")
            }
        };

        if let Some(parent) = exclude_file.parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        let existing = std::fs::read_to_string(&exclude_file).unwrap_or_default();
        if !existing.lines().any(|l| l.trim() == ".plannermate/" || l.trim() == ".plannermate") {
            let mut updated = existing;
            if !updated.ends_with('\n') && !updated.is_empty() {
                updated.push('\n');
            }
            updated.push_str(".plannermate/\n");
            let _ = std::fs::write(&exclude_file, updated);
        }
    }

    let branch_name = format!("pm-agent/task-{}", task_id);

    // If worktree already exists, reuse it per D-18 resume capability
    if worktree_path.exists() && worktree_path.is_dir() {
        return Ok(worktree_path);
    }

    if let Some(parent) = worktree_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create worktree parent dir: {}", e))?;
    }

    // git worktree add -B <branch_name> <worktree_path> HEAD
    let output = hidden_std_command("git")
        .current_dir(repo_root)
        .args([
            "worktree",
            "add",
            "-B",
            &branch_name,
            worktree_path.to_str().ok_or("Invalid worktree path UTF-8")?,
            "HEAD",
        ])
        .output()
        .map_err(|e| format!("Failed to invoke git worktree: {}", e))?;

    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git worktree add failed: {}", err_msg.trim()));
    }

    Ok(worktree_path)
}

/// Instant Hard Kill for a process group / process tree per D-10
pub fn kill_process_tree(pid: u32) {
    if pid == 0 {
        return;
    }
    #[cfg(unix)]
    {
        unsafe {
            // Try killing process group first (-pid)
            let pgid = libc::getpgid(pid as libc::pid_t);
            if pgid > 0 {
                libc::kill(-pgid, libc::SIGKILL);
            }
            // Also kill the specific PID
            libc::kill(pid as libc::pid_t, libc::SIGKILL);
        }
    }

    #[cfg(windows)]
    {
        let mut cmd = hidden_std_command("taskkill");
        let _ = cmd
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .output();
    }
}

/// Cleanup on exit handler (preserving worktrees on disk per D-18)
pub fn cleanup_on_exit() {
    if let Ok(mut pool) = AGENT_POOL.try_lock() {
        for (_, session) in pool.sessions.drain() {
            kill_process_tree(session.master_pid);
            for worker_pid in session.worker_pids {
                kill_process_tree(worker_pid);
            }
        }
    }
    RUNNING_PROCESS_COUNT.store(0, Ordering::SeqCst);
}

// ==================== TAURI COMMANDS ====================

#[tauri::command]
pub async fn start_ghost_dev_session(
    app: AppHandle,
    payload: StartSessionPayload,
) -> Result<AgentSessionState, String> {
    // Check concurrency cap (respect user setting, clamp 1..=12)
    let max_processes = payload.concurrency_cap.unwrap_or(MAX_GLOBAL_PROCESSES).clamp(1, 12);
    let current_running = RUNNING_PROCESS_COUNT.load(Ordering::SeqCst);
    if current_running >= max_processes {
        return Err(format!(
            "Global process limit reached ({}/{}). Please stop an existing session first.",
            current_running, max_processes
        ));
    }

    let repo_path = PathBuf::from(&payload.repo_path);
    let worktree_path = ensure_git_worktree(&repo_path, &payload.task_id)?;
    let branch_name = format!("pm-agent/task-{}", payload.task_id);

    // Resolve claude executable
    let claude_binary = std::env::var("CLAUDE_PATH").unwrap_or_else(|_| "claude".to_string());

    let mut cmd = hidden_tokio_command(&claude_binary);
    cmd.current_dir(&worktree_path)
        .args([
            "-p",
            "--verbose",
            "--output-format",
            "stream-json",
            "--input-format",
            "stream-json",
            "--permission-mode",
            "acceptEdits",
            "--model",
            &payload.master_model,
        ])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    #[cfg(unix)]
    {
        // Set new process group on Unix so child and workers can be killed together
        unsafe {
            cmd.pre_exec(|| {
                libc::setpgid(0, 0);
                Ok(())
            });
        }
    }

    let mut child = cmd.spawn().map_err(|e| {
        format!(
            "Failed to spawn Claude Code CLI ('{}'): {}. Make sure 'claude' is installed and in PATH.",
            claude_binary, e
        )
    })?;

    let master_pid = child.id().unwrap_or(0);
    RUNNING_PROCESS_COUNT.fetch_add(1, Ordering::SeqCst);

    let started_at = chrono_iso_now();
    let initial_state = AgentSessionState {
        task_id: payload.task_id.clone(),
        task_title: payload.task_title.clone(),
        repo_path: payload.repo_path.clone(),
        worktree_path: worktree_path.to_string_lossy().to_string(),
        branch_name: branch_name.clone(),
        master_pid,
        master_model: payload.master_model.clone(),
        worker_model: payload.worker_model.clone(),
        status: "running".to_string(),
        started_at: started_at.clone(),
        finished_at: None,
        active_workers: vec![],
    };

    let (stdin_tx, mut stdin_rx) = tokio::sync::mpsc::channel::<String>(32);
    let mut stdin_writer = child.stdin.take();

    // Spawn stdin writer task
    tokio::spawn(async move {
        if let Some(mut writer) = stdin_writer.take() {
            while let Some(msg) = stdin_rx.recv().await {
                if writer.write_all(msg.as_bytes()).await.is_err() {
                    break;
                }
                if !msg.ends_with('\n') {
                    let _ = writer.write_all(b"\n").await;
                }
                let _ = writer.flush().await;
            }
        }
    });

    // Send initial prompt via stream-json envelope
    let _ = stdin_tx.send(format_user_text_envelope(&payload.initial_prompt).to_string()).await;

    let stdin_tx_for_reader = stdin_tx.clone();

    // Record into pool
    {
        let mut pool = AGENT_POOL.lock().await;
        pool.sessions.insert(
            payload.task_id.clone(),
            ActiveSessionHandle {
                state: initial_state.clone(),
                master_pid,
                stdin_tx: Some(stdin_tx),
                worker_pids: Vec::new(),
            },
        );
    }

    // Stream reader and batcher setup
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let task_id_clone = payload.task_id.clone();
    let app_clone = app.clone();
    let worktree_path_str = worktree_path.to_string_lossy().to_string();
    let worktree_dir = worktree_path.clone();
    let worker_model_default = payload.worker_model.clone();
    let claude_binary_clone = claude_binary.clone();
    let max_processes_cap = max_processes;

    tokio::spawn(async move {
        let (batch_tx, mut batch_rx) = tokio::sync::mpsc::channel::<StreamEventChunk>(500);

        // 50ms batch flusher to frontend
        let app_flush = app_clone.clone();
        let batch_flusher = tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_millis(50));
            let mut buffer = Vec::new();
            loop {
                tokio::select! {
                    _ = interval.tick() => {
                        if !buffer.is_empty() {
                            for chunk in buffer.drain(..) {
                                let _ = app_flush.emit("ghost-dev:stream-chunk", chunk);
                            }
                        }
                    }
                    chunk = batch_rx.recv() => {
                        match chunk {
                            Some(c) => buffer.push(c),
                            None => {
                                // Channel closed, flush remaining
                                for c in buffer.drain(..) {
                                    let _ = app_flush.emit("ghost-dev:stream-chunk", c);
                                }
                                break;
                            }
                        }
                    }
                }
            }
        });

        // Stdout line processor
        if let Some(stdout_stream) = stdout {
            let mut reader = BufReader::new(stdout_stream).lines();
            let b_tx = batch_tx.clone();
            let tid = task_id_clone.clone();

            while let Ok(Some(line)) = reader.next_line().await {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }

                // Check if this line is a stream-json event
                let mut chunk_type = "log";
                if trimmed.starts_with('{') {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(trimmed) {
                        let msg_type = val.get("type").and_then(|v| v.as_str()).unwrap_or("");
                        if msg_type == "tool_use" || msg_type == "tool_call" {
                            chunk_type = "tool_call";
                            // Intercept tool calls: shell permission check & master-worker subtask dispatch
                            if let Some(tool_name) = val.get("name").and_then(|v| v.as_str()) {
                                if tool_name == "dispatch_subtask" || tool_name == "Agent" {
                                    let tool_use_id = val.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                    let input = val.get("input").cloned().unwrap_or_default();
                                    let role = input.get("role")
                                        .or_else(|| input.get("subagent_type"))
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("subagent")
                                        .to_string();
                                    let subtask_prompt = input.get("prompt")
                                        .or_else(|| input.get("task_prompt"))
                                        .or_else(|| input.get("description"))
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("")
                                        .to_string();
                                    let subtask_model = input.get("model")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or(&worker_model_default)
                                        .to_string();

                                    let active_workers_count = {
                                        let pool = AGENT_POOL.lock().await;
                                        pool.sessions.get(&tid)
                                            .map(|s| s.state.active_workers.iter().filter(|w| w.status == "running").count())
                                            .unwrap_or(0)
                                    };
                                    let global_count = RUNNING_PROCESS_COUNT.load(Ordering::SeqCst);

                                    if active_workers_count >= 2 || global_count >= max_processes_cap {
                                        let limit_msg = if active_workers_count >= 2 {
                                            "Worker concurrency limit reached (max 2 active workers per task). Please wait for active workers to complete."
                                        } else {
                                            "Global process limit reached. Cannot spawn new worker."
                                        };
                                        let resp = format_tool_result_envelope(&tool_use_id, limit_msg, true);
                                        let _ = stdin_tx_for_reader.send(resp.to_string()).await;
                                    } else {
                                        let worker_id = format!("w-{}-{}", tid, chrono_iso_now());
                                        let mut wcmd = hidden_tokio_command(&claude_binary_clone);
                                        wcmd.current_dir(&worktree_dir)
                                            .args([
                                                "-p",
                                                "--verbose",
                                                "--output-format",
                                                "stream-json",
                                                "--model",
                                                &subtask_model,
                                                &subtask_prompt,
                                            ])
                                            .stdout(std::process::Stdio::piped())
                                            .stderr(std::process::Stdio::piped());

                                        #[cfg(unix)]
                                        {
                                            unsafe {
                                                wcmd.pre_exec(|| {
                                                    libc::setpgid(0, 0);
                                                    Ok(())
                                                });
                                            }
                                        }

                                        match wcmd.spawn() {
                                            Ok(mut wchild) => {
                                                let wpid = wchild.id().unwrap_or(0);
                                                RUNNING_PROCESS_COUNT.fetch_add(1, Ordering::SeqCst);

                                                let winfo = WorkerSession {
                                                    worker_id: worker_id.clone(),
                                                    role: role.clone(),
                                                    pid: wpid,
                                                    model: subtask_model.clone(),
                                                    status: "running".to_string(),
                                                    subtask_prompt: subtask_prompt.clone(),
                                                    started_at: chrono_iso_now(),
                                                };

                                                {
                                                    let mut pool = AGENT_POOL.lock().await;
                                                    if let Some(session) = pool.sessions.get_mut(&tid) {
                                                        session.state.active_workers.push(winfo);
                                                        session.worker_pids.push(wpid);
                                                    }
                                                }
                                                let _ = app_clone.emit("ghost-dev:session-updated", ());

                                                let w_tid = tid.clone();
                                                let w_wid = worker_id.clone();
                                                let w_app = app_clone.clone();
                                                let w_btx = b_tx.clone();
                                                let w_stdin_tx = stdin_tx_for_reader.clone();
                                                let w_tuid = tool_use_id.clone();

                                                tokio::spawn(async move {
                                                    let w_stdout = wchild.stdout.take();
                                                    if let Some(stream) = w_stdout {
                                                        let mut w_reader = BufReader::new(stream).lines();
                                                        while let Ok(Some(w_line)) = w_reader.next_line().await {
                                                            if !w_line.trim().is_empty() {
                                                                let _ = w_btx.send(StreamEventChunk {
                                                                    task_id: w_tid.clone(),
                                                                    worker_id: Some(w_wid.clone()),
                                                                    source: "worker".to_string(),
                                                                    timestamp: chrono_iso_now(),
                                                                    chunk_type: "log".to_string(),
                                                                    content: w_line,
                                                                }).await;
                                                            }
                                                        }
                                                    }

                                                    let w_status = wchild.wait().await;
                                                    let _ = RUNNING_PROCESS_COUNT.fetch_update(Ordering::SeqCst, Ordering::SeqCst, |c| {
                                                        Some(c.saturating_sub(1))
                                                    });

                                                    let w_success = w_status.map(|s| s.success()).unwrap_or(false);
                                                    let w_final = if w_success { "done" } else { "error" };

                                                    {
                                                        let mut pool = AGENT_POOL.lock().await;
                                                        if let Some(session) = pool.sessions.get_mut(&w_tid) {
                                                            if let Some(w) = session.state.active_workers.iter_mut().find(|w| w.worker_id == w_wid) {
                                                                w.status = w_final.to_string();
                                                            }
                                                        }
                                                    }
                                                    let _ = w_app.emit("ghost-dev:session-updated", ());

                                                    let completion_content = format!("Worker {} completed with status: {}", w_wid, w_final);
                                                    let result_payload = format_tool_result_envelope(&w_tuid, &completion_content, !w_success);
                                                    let _ = w_stdin_tx.send(result_payload.to_string()).await;
                                                });
                                            }
                                            Err(e) => {
                                                let err_msg = format!("Failed to spawn worker process: {}", e);
                                                let err_resp = format_tool_result_envelope(&tool_use_id, &err_msg, true);
                                                let _ = stdin_tx_for_reader.send(err_resp.to_string()).await;
                                            }
                                        }
                                    }
                                } else if tool_name == "bash" || tool_name == "sh" || tool_name == "execute_command" {
                                    let cmd = val.get("input")
                                        .and_then(|i| i.get("command"))
                                        .and_then(|c| c.as_str())
                                        .unwrap_or("");
                                    if !cmd.is_empty() && !is_command_whitelisted(cmd) {
                                        // Request permission from user via oneshot channel
                                        let req_id = format!("perm-{}-{}", tid, chrono_iso_now());
                                        let (perm_tx, perm_rx) = oneshot::channel::<bool>();
                                        {
                                            let mut pool = AGENT_POOL.lock().await;
                                            pool.pending_permissions.insert(req_id.clone(), perm_tx);
                                        }

                                        let req = ShellPermissionRequest {
                                            task_id: tid.clone(),
                                            request_id: req_id.clone(),
                                            command: cmd.to_string(),
                                            working_dir: worktree_path_str.clone(),
                                        };
                                        let _ = app_clone.emit("ghost-dev:permission-request", req);

                                        // Pause line processor awaiting user approval/rejection
                                        let approved = perm_rx.await.unwrap_or(false);

                                        // Feed response to Claude stdin
                                        let response_payload = serde_json::json!({
                                            "type": "permission_response",
                                            "requestId": req_id,
                                            "approved": approved,
                                            "decision": if approved { "allow" } else { "deny" }
                                        });
                                        let _ = stdin_tx_for_reader.send(response_payload.to_string()).await;

                                        let audit_chunk = StreamEventChunk {
                                            task_id: tid.clone(),
                                            worker_id: None,
                                            source: "master".to_string(),
                                            timestamp: chrono_iso_now(),
                                            chunk_type: "log".to_string(),
                                            content: format!(
                                                "[Security] Shell command '{}' was {}",
                                                cmd,
                                                if approved { "approved by user" } else { "denied by user" }
                                            ),
                                        };
                                        let _ = b_tx.send(audit_chunk).await;
                                    }
                                }
                            }
                        } else if msg_type == "tool_result" {
                            chunk_type = "tool_result";
                        }
                    }
                }

                let chunk = StreamEventChunk {
                    task_id: tid.clone(),
                    worker_id: None,
                    source: "master".to_string(),
                    timestamp: chrono_iso_now(),
                    chunk_type: chunk_type.to_string(),
                    content: line,
                };
                let _ = b_tx.send(chunk).await;
            }
        }

        // Stderr line processor
        if let Some(stderr_stream) = stderr {
            let mut reader = BufReader::new(stderr_stream).lines();
            let b_tx = batch_tx.clone();
            let tid = task_id_clone.clone();

            while let Ok(Some(line)) = reader.next_line().await {
                if !line.trim().is_empty() {
                    let chunk = StreamEventChunk {
                        task_id: tid.clone(),
                        worker_id: None,
                        source: "master".to_string(),
                        timestamp: chrono_iso_now(),
                        chunk_type: "error".to_string(),
                        content: line,
                    };
                    let _ = b_tx.send(chunk).await;
                }
            }
        }

        drop(batch_tx);
        let _ = batch_flusher.await;

        // Wait for child process exit
        let status = child.wait().await;
        let _ = RUNNING_PROCESS_COUNT.fetch_update(Ordering::SeqCst, Ordering::SeqCst, |c| {
            Some(c.saturating_sub(1))
        });

        let final_status = match status {
            Ok(s) if s.success() => "done",
            _ => "error",
        };

        // Update state in pool (preserve "interrupted" if manually stopped)
        let mut reported_status = final_status.to_string();
        {
            let mut pool = AGENT_POOL.lock().await;
            if let Some(session) = pool.sessions.get_mut(&task_id_clone) {
                if session.state.status == "interrupted" {
                    reported_status = "interrupted".to_string();
                } else {
                    session.state.status = final_status.to_string();
                    session.state.finished_at = Some(chrono_iso_now());
                }
            }
        }

        let _ = app_clone.emit("ghost-dev:session-updated", ());
        let _ = app_clone.emit("ghost-dev:session-finished", ());

        let _ = app_clone.emit(
            "ghost-dev:stream-chunk",
            StreamEventChunk {
                task_id: task_id_clone.clone(),
                worker_id: None,
                source: "master".to_string(),
                timestamp: chrono_iso_now(),
                chunk_type: "status_change".to_string(),
                content: format!("Session finished with status: {}", reported_status),
            },
        );
    });

    Ok(initial_state)
}

#[tauri::command]
pub async fn stop_ghost_dev_session(app: AppHandle, task_id: String) -> Result<(), String> {
    let mut pool = AGENT_POOL.lock().await;
    if let Some(session) = pool.sessions.get_mut(&task_id) {
        kill_process_tree(session.master_pid);
        for worker_pid in session.worker_pids.drain(..) {
            kill_process_tree(worker_pid);
        }
        session.state.status = "interrupted".to_string();
        session.state.finished_at = Some(chrono_iso_now());
        session.stdin_tx = None;
    }
    let _ = app.emit("ghost-dev:session-updated", ());
    let _ = app.emit("ghost-dev:session-finished", ());
    Ok(())
}

#[tauri::command]
pub async fn list_agent_sessions() -> Result<Vec<AgentSessionState>, String> {
    let pool = AGENT_POOL.lock().await;
    let list: Vec<AgentSessionState> = pool.sessions.values().map(|s| s.state.clone()).collect();
    Ok(list)
}

#[tauri::command]
pub async fn get_worktree_diff(worktree_path: String) -> Result<String, String> {
    let path = PathBuf::from(&worktree_path);
    if !path.exists() {
        return Err(format!("Worktree path does not exist: {}", worktree_path));
    }

    // Combine git diff HEAD and git diff for staged/unstaged changes
    let output = hidden_std_command("git")
        .current_dir(&path)
        .args(["diff", "HEAD"])
        .output()
        .map_err(|e| format!("Failed to get git diff: {}", e))?;

    let mut full_diff = String::from_utf8_lossy(&output.stdout).to_string();

    // If HEAD diff is empty, check unstaged git diff (e.g. freshly created branch)
    if full_diff.trim().is_empty() {
        let unstaged = hidden_std_command("git")
            .current_dir(&path)
            .args(["diff"])
            .output()
            .map_err(|e| format!("Failed to get unstaged git diff: {}", e))?;
        full_diff = String::from_utf8_lossy(&unstaged.stdout).to_string();
    }

    Ok(full_diff)
}

#[tauri::command]
pub async fn accept_all_diff(worktree_path: String, commit_message: String) -> Result<String, String> {
    let path = PathBuf::from(&worktree_path);
    if !path.exists() {
        return Err(format!("Worktree path does not exist: {}", worktree_path));
    }

    // git add -A
    let add_out = hidden_std_command("git")
        .current_dir(&path)
        .args(["add", "-A"])
        .output()
        .map_err(|e| format!("Failed to git add: {}", e))?;

    if !add_out.status.success() {
        return Err(format!("git add -A failed: {}", String::from_utf8_lossy(&add_out.stderr)));
    }

    // git commit -m <msg>
    let msg = if commit_message.trim().is_empty() {
        "chore(ghost-dev): apply agent changes".to_string()
    } else {
        commit_message
    };

    let commit_out = hidden_std_command("git")
        .current_dir(&path)
        .args(["commit", "-m", &msg])
        .output()
        .map_err(|e| format!("Failed to git commit: {}", e))?;

    if !commit_out.status.success() {
        let err = String::from_utf8_lossy(&commit_out.stderr);
        // Maybe nothing to commit
        if err.contains("nothing to commit") || String::from_utf8_lossy(&commit_out.stdout).contains("nothing to commit") {
            return Ok("nothing_to_commit".to_string());
        }
        return Err(format!("git commit failed: {}", err));
    }

    // Return current commit sha
    let rev_out = hidden_std_command("git")
        .current_dir(&path)
        .args(["rev-parse", "--short", "HEAD"])
        .output()
        .map_err(|e| format!("Failed to get commit sha: {}", e))?;

    Ok(String::from_utf8_lossy(&rev_out.stdout).trim().to_string())
}

#[tauri::command]
pub async fn revert_all_diff(worktree_path: String) -> Result<(), String> {
    let path = PathBuf::from(&worktree_path);
    if !path.exists() {
        return Err(format!("Worktree path does not exist: {}", worktree_path));
    }

    // git reset --hard HEAD
    let reset_out = hidden_std_command("git")
        .current_dir(&path)
        .args(["reset", "--hard", "HEAD"])
        .output()
        .map_err(|e| format!("Failed to git reset: {}", e))?;

    if !reset_out.status.success() {
        return Err(format!("git reset --hard failed: {}", String::from_utf8_lossy(&reset_out.stderr)));
    }

    // git clean -fd
    let clean_out = hidden_std_command("git")
        .current_dir(&path)
        .args(["clean", "-fd"])
        .output()
        .map_err(|e| format!("Failed to git clean: {}", e))?;

    if !clean_out.status.success() {
        return Err(format!("git clean -fd failed: {}", String::from_utf8_lossy(&clean_out.stderr)));
    }

    Ok(())
}

#[tauri::command]
pub async fn revert_file_diff(worktree_path: String, file_path: String) -> Result<(), String> {
    let path = PathBuf::from(&worktree_path);
    if !path.exists() {
        return Err(format!("Worktree path does not exist: {}", worktree_path));
    }

    let canonical_worktree = path.canonicalize().map_err(|e| e.to_string())?;

    // Block path traversal attempts
    let relative = Path::new(&file_path);
    if file_path.contains("..") || relative.is_absolute() {
        return Err("Path traversal attempt detected".to_string());
    }

    let target_file = path.join(&file_path);
    if target_file.exists() {
        let canonical_target = target_file.canonicalize().map_err(|e| e.to_string())?;
        if !canonical_target.starts_with(&canonical_worktree) {
            return Err("Path traversal attempt detected".to_string());
        }
    }

    // git checkout HEAD -- <file>
    let checkout_out = hidden_std_command("git")
        .current_dir(&path)
        .args(["checkout", "HEAD", "--", &file_path])
        .output()
        .map_err(|e| format!("Failed to checkout file: {}", e))?;

    if !checkout_out.status.success() {
        // If file was newly added, remove it from disk safely within worktree
        let full_file = path.join(&file_path);
        if full_file.exists() {
            if let Ok(canonical_target) = full_file.canonicalize() {
                if !canonical_target.starts_with(&canonical_worktree) {
                    return Err("Path traversal attempt detected".to_string());
                }
                let _ = std::fs::remove_file(&canonical_target);
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn send_agent_feedback(task_id: String, feedback: String) -> Result<(), String> {
    let pool = AGENT_POOL.lock().await;
    if let Some(session) = pool.sessions.get(&task_id) {
        if let Some(tx) = &session.stdin_tx {
            let wrapped_feedback = format_user_text_envelope(&feedback).to_string();
            tx.send(wrapped_feedback).await.map_err(|e| format!("Failed to send feedback to agent stdin: {}", e))?;
            Ok(())
        } else {
            Err("Agent stdin channel is not active".to_string())
        }
    } else {
        Err(format!("Session {} not found", task_id))
    }
}

#[tauri::command]
pub async fn respond_shell_permission(
    _app: AppHandle,
    request_id: String,
    approved: bool,
) -> Result<(), String> {
    let mut pool = AGENT_POOL.lock().await;
    if let Some(tx) = pool.pending_permissions.remove(&request_id) {
        let _ = tx.send(approved);
        Ok(())
    } else {
        Err(format!("Permission request {} not found or already answered", request_id))
    }
}

fn chrono_iso_now() -> String {
    // Generate ISO-8601 UTC timestamp (YYYY-MM-DDTHH:MM:SSZ)
    match std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH) {
        Ok(dur) => {
            let total_secs = dur.as_secs();
            let sec = total_secs % 60;
            let total_mins = total_secs / 60;
            let min = total_mins % 60;
            let total_hours = total_mins / 60;
            let hour = total_hours % 24;
            let total_days = total_hours / 24;

            // Civil date from days since 1970-01-01 (Hinnant algorithm)
            let z = total_days as i64 + 719468;
            let era = (if z >= 0 { z } else { z - 146096 }) / 146097;
            let doe = (z - era * 146097) as u32;
            let yoe = (doe - doe / 1020 + doe / 1461 - doe / 146096) / 365;
            let y = yoe as i64 + era * 400;
            let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
            let mp = (5 * doy + 2) / 153;
            let d = doy - (153 * mp + 2) / 5 + 1;
            let m = if mp < 10 { mp + 3 } else { mp - 9 };
            let yr = if m <= 2 { y + 1 } else { y };

            format!(
                "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
                yr, m, d, hour, min, sec
            )
        }
        Err(_) => "1970-01-01T00:00:00Z".to_string(),
    }
}
