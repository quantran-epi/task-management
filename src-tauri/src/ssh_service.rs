use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpStream;
use std::path::Path;
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshConfig {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_type: String, // "password" | "key_file" | "agent"
    pub key_path: Option<String>,
    pub default_remote_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteFileInfo {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_symlink: bool,
    pub size: u64,
    pub modified: u64,
    pub permissions: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteFileSliceResult {
    pub lines: Vec<String>,
    pub total_lines: usize,
    pub offset: usize,
    pub limit: usize,
    pub has_more: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandOutput {
    pub stdout: String,
    pub stderr: String,
    pub exit_status: i32,
    /// `complete` | `cancelled` | `error` — why the task ended. No timeout reason exists.
    #[serde(default = "default_finish_reason")]
    pub finish_reason: String,
}

fn default_finish_reason() -> String {
    "complete".to_string()
}

/// Tracks remote PIDs of streaming commands so they can be terminated (T-32-02).
#[derive(Default)]
pub struct SshStreamRegistry {
    pub active_processes: Mutex<HashMap<String, u32>>,
}

/// Drop every tracked PID when the app exits.
///
/// ponytail: this only clears the map — it does not SIGTERM the remote processes, because
/// the registry deliberately does not retain SSH configs or secrets. Remote orphans are
/// still possible on a hard quit; adding a config-carrying entry here is the upgrade path.
pub fn cleanup_on_exit(registry: &SshStreamRegistry) {
    if let Ok(mut procs) = registry.active_processes.lock() {
        procs.clear();
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshStreamEvent {
    pub session_id: String,
    pub stream: String, // "stdout" | "stderr"
    pub line: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshStreamExitEvent {
    pub session_id: String,
    pub exit_status: i32,
    pub error: Option<String>,
}

/// Short one-shot commands (FS, test, git) reuse the pooled authenticated transport. Each
/// command still opens a fresh channel, so no two calls share stream state.
pub fn connect_and_auth(config: &SshConfig, secret: Option<&str>) -> Result<ssh2::Session, String> {
    crate::ssh_pool::runtime().pool.acquire(config, secret, SocketTimeout::Interactive)
}

/// Long-lived consumers (PTY, ghost-dev, kill threads) need a dedicated transport: they call
/// `set_blocking(false)` or hold a channel open forever and must not share libssh2's session
/// mutex with short tools.
pub fn connect_and_auth_dedicated(
    config: &SshConfig,
    secret: Option<&str>,
) -> Result<ssh2::Session, String> {
    connect_and_auth_inner(config, secret, SocketTimeout::None)
}

/// Dedicated SSH transport with a short libssh2 poll timeout. Never pooled: a long-lived reader
/// must not share its raw libssh2 session (or timeout) with unrelated SSH tool calls.
pub(crate) fn connect_and_auth_dedicated_wakeup(
    config: &SshConfig,
    secret: Option<&str>,
) -> Result<ssh2::Session, String> {
    connect_and_auth_inner(config, secret, SocketTimeout::Wakeup)
}

/// Variant for long-running tool tasks: NO socket read timeout. A 30s socket error used to
/// become `Done{error}` even though the user never cancelled — forbidden by the lifecycle
/// contract. Only an explicit `cancel_tool_call` may end a tool task.
pub fn connect_and_auth_without_socket_timeout(
    config: &SshConfig,
    secret: Option<&str>,
) -> Result<ssh2::Session, String> {
    connect_and_auth_dedicated(config, secret)
}

#[derive(Clone, Copy)]
pub(crate) enum SocketTimeout {
    None,
    Interactive,
    Wakeup,
}

impl SocketTimeout {
    pub(crate) fn class(&self) -> u8 {
        match self {
            SocketTimeout::None => 0,
            SocketTimeout::Interactive => 1,
            SocketTimeout::Wakeup => 2,
        }
    }
}

pub(crate) fn connect_and_auth_inner(
    config: &SshConfig,
    secret: Option<&str>,
    socket_timeout: SocketTimeout,
) -> Result<ssh2::Session, String> {
    let host = config.host.trim();
    if host.is_empty() {
        return Err("SSH Host không được để trống".to_string());
    }
    let username = config.username.trim();
    if username.is_empty() {
        return Err("SSH Username không được để trống".to_string());
    }

    let addr = format!("{}:{}", host, config.port);
    let socket_addrs: Vec<_> = std::net::ToSocketAddrs::to_socket_addrs(&addr)
        .map_err(|e| format!("Không thể phân giải địa chỉ {}: {}", addr, e))?
        .collect();

    if socket_addrs.is_empty() {
        return Err(format!("Không tìm thấy địa chỉ IP cho host: {}", host));
    }

    let mut tcp_opt = None;
    let timeout = Duration::from_secs(10);
    for sa in socket_addrs {
        if let Ok(stream) = TcpStream::connect_timeout(&sa, timeout) {
            tcp_opt = Some(stream);
            break;
        }
    }

    let tcp = tcp_opt.ok_or_else(|| format!("Kết nối TCP tới {}:{} thất bại (timeout 10s)", host, config.port))?;
    match socket_timeout {
        SocketTimeout::None => {}
        SocketTimeout::Interactive => {
            let _ = tcp.set_read_timeout(Some(Duration::from_secs(30)));
            let _ = tcp.set_write_timeout(Some(Duration::from_secs(30)));
        }
        SocketTimeout::Wakeup => {
            // Wake-up only: the reader treats a timeout as "check token, loop again".
            let _ = tcp.set_read_timeout(Some(Duration::from_millis(250)));
        }
    }

    let mut session = ssh2::Session::new().map_err(|e| format!("Khởi tạo SSH session thất bại: {}", e))?;
    session.set_tcp_stream(tcp);
    // TcpStream::set_read_timeout does not bound libssh2's channel reads: libssh2 uses its own
    // timeout via libssh2_session_set_timeout. Without this, Wakeup reads block forever.
    if matches!(socket_timeout, SocketTimeout::Wakeup) {
        session.set_timeout(250);
    }
    session.handshake().map_err(|e| format!("SSH handshake thất bại: {}", e))?;

    match config.auth_type.as_str() {
        "password" => {
            let pass = secret.unwrap_or("");
            session
                .userauth_password(username, pass)
                .map_err(|e| format!("Xác thực mật khẩu thất bại: {}", e))?;
        }
        "key_file" => {
            let key_path_str = config
                .key_path
                .as_deref()
                .filter(|s| !s.trim().is_empty())
                .ok_or_else(|| "Chưa cung cấp đường dẫn khóa riêng tư (private key)".to_string())?;

            let key_path = Path::new(key_path_str);
            if !key_path.exists() {
                return Err(format!("Tệp khóa riêng tư không tồn tại: {}", key_path_str));
            }

            session
                .userauth_pubkey_file(username, None, key_path, secret)
                .map_err(|e| format!("Xác thực khóa riêng tư thất bại: {}", e))?;
        }
        "agent" => {
            let mut agent = session.agent().map_err(|e| format!("Không thể kết nối SSH Agent: {}", e))?;
            agent.connect().map_err(|e| format!("SSH Agent connect thất bại: {}", e))?;
            agent.list_identities().map_err(|e| format!("SSH Agent list identities thất bại: {}", e))?;
            let identities = agent.identities().map_err(|e| format!("SSH Agent read identities thất bại: {}", e))?;

            let mut authed = false;
            for id in identities {
                if agent.userauth(username, &id).is_ok() && session.authenticated() {
                    authed = true;
                    break;
                }
            }
            if !authed {
                return Err("Xác thực qua SSH Agent thất bại: Không tìm thấy key hợp lệ".to_string());
            }
        }
        other => {
            return Err(format!("Phương thức xác thực không hỗ trợ: {}", other));
        }
    }

    if !session.authenticated() {
        return Err("Xác thực SSH không thành công".to_string());
    }

    Ok(session)
}

#[tauri::command]
pub fn ssh_test_connection(config: SshConfig, secret: Option<String>) -> Result<String, String> {
    let session = connect_and_auth(&config, secret.as_deref())?;
    let banner = session.banner().unwrap_or("SSH-2.0");
    Ok(format!("Kết nối thành công! Server banner: {}", banner))
}

#[tauri::command]
pub fn ssh_list_dir(
    config: SshConfig,
    secret: Option<String>,
    remote_path: Option<String>,
) -> Result<Vec<RemoteFileInfo>, String> {
    let session = connect_and_auth(&config, secret.as_deref())?;
    let sftp = session.sftp().map_err(|e| format!("Khởi tạo SFTP subsystem thất bại: {}", e))?;

    let path_str = remote_path
        .filter(|p| !p.trim().is_empty())
        .or_else(|| config.default_remote_path.clone())
        .unwrap_or_else(|| ".".to_string());

    let target_path = Path::new(&path_str);
    let entries = sftp
        .readdir(target_path)
        .map_err(|e| format!("Không thể đọc thư mục '{}': {}", path_str, e))?;

    let mut result = Vec::new();
    for (pb, stat) in entries {
        let file_name = pb
            .file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or_else(|| pb.to_string_lossy().to_string());

        // Skip . and ..
        if file_name == "." || file_name == ".." {
            continue;
        }

        let full_path_str = pb.to_string_lossy().to_string();
        let is_dir = stat.is_dir();
        let is_symlink = stat.file_type() == ssh2::FileType::Symlink;
        let size = stat.size.unwrap_or(0);
        let modified = stat.mtime.unwrap_or(0);
        let permissions = stat.perm;

        result.push(RemoteFileInfo {
            name: file_name,
            path: full_path_str,
            is_dir,
            is_symlink,
            size,
            modified,
            permissions,
        });
    }

    // Sort: directories first, then alphabetically by name
    result.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            b.is_dir.cmp(&a.is_dir)
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });

    Ok(result)
}

#[tauri::command]
pub fn ssh_read_file_all(
    config: SshConfig,
    secret: Option<String>,
    remote_path: String,
) -> Result<String, String> {
    let session = connect_and_auth(&config, secret.as_deref())?;
    let sftp = session.sftp().map_err(|e| format!("Khởi tạo SFTP subsystem thất bại: {}", e))?;

    let mut file = sftp
        .open(Path::new(&remote_path))
        .map_err(|e| format!("Không thể mở tệp '{}': {}", remote_path, e))?;

    let mut content_bytes = Vec::new();
    file.read_to_end(&mut content_bytes)
        .map_err(|e| format!("Không thể đọc nội dung tệp: {}", e))?;

    String::from_utf8(content_bytes)
        .map_err(|_| "Tệp chứa dữ liệu nhị phân hoặc không phải UTF-8 hợp lệ".to_string())
}

/// Cap for binary documents read for AI parsing. `Response` avoids serializing these
/// bytes as a JSON number[] (which would quadruple memory on the TS side).
const SSH_DOC_MAX_BYTES: u64 = 10 * 1024 * 1024;

fn check_doc_size(size: u64) -> Result<(), String> {
    if size > SSH_DOC_MAX_BYTES {
        return Err("Tệp vượt quá 10 MB, tool chỉ hỗ trợ tài liệu không vượt quá 10 MB.".to_string());
    }
    Ok(())
}

/// Read a remote file as raw bytes for the JS docx/xlsx/pdf parsers.
/// The metadata check happens before `read_to_end` so an oversized file is never buffered.
#[tauri::command]
pub fn ssh_read_file_bytes(
    config: SshConfig,
    secret: Option<String>,
    remote_path: String,
) -> Result<tauri::ipc::Response, String> {
    let session = connect_and_auth(&config, secret.as_deref())?;
    let sftp = session.sftp().map_err(|e| format!("Khởi tạo SFTP subsystem thất bại: {}", e))?;

    let path = Path::new(&remote_path);
    let mut file = sftp
        .open(path)
        .map_err(|e| format!("Không thể mở tệp '{}': {}", remote_path, e))?;

    let stat = file
        .stat()
        .map_err(|e| format!("Không thể đọc thông tin tệp '{}': {}", remote_path, e))?;
    if let Some(size) = stat.size {
        check_doc_size(size)?;
    }

    // Bound the read itself: stat.size may be None, and the file can grow between stat and read.
    // Reading at most cap+1 bytes keeps memory bounded even for a 2 GB remote file.
    let mut bytes = Vec::new();
    file.take(SSH_DOC_MAX_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| format!("Không thể đọc nội dung tệp: {}", e))?;
    check_doc_size(bytes.len() as u64)?;

    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
pub fn ssh_read_file_slice(
    config: SshConfig,
    secret: Option<String>,
    remote_path: String,
    offset: Option<usize>,
    limit: Option<usize>,
) -> Result<RemoteFileSliceResult, String> {
    let session = connect_and_auth(&config, secret.as_deref())?;
    let sftp = session.sftp().map_err(|e| format!("Khởi tạo SFTP subsystem thất bại: {}", e))?;

    let file = sftp
        .open(Path::new(&remote_path))
        .map_err(|e| format!("Không thể mở tệp '{}': {}", remote_path, e))?;

    let reader = BufReader::new(file);
    let start_offset = offset.unwrap_or(1).max(1);
    let max_lines = limit.unwrap_or(200).min(2000);

    let mut lines = Vec::new();
    let mut total_lines = 0;
    let mut current_line_num = 0;

    for line_res in reader.lines() {
        let line = line_res.map_err(|e| format!("Lỗi đọc dòng tệp: {}", e))?;
        current_line_num += 1;
        total_lines += 1;

        if current_line_num >= start_offset && lines.len() < max_lines {
            lines.push(line);
        }
    }

    let has_more = total_lines >= (start_offset + lines.len());

    Ok(RemoteFileSliceResult {
        lines,
        total_lines,
        offset: start_offset,
        limit: max_lines,
        has_more,
    })
}

#[tauri::command]
pub fn ssh_write_file(
    config: SshConfig,
    secret: Option<String>,
    remote_path: String,
    content: String,
) -> Result<(), String> {
    let session = connect_and_auth(&config, secret.as_deref())?;
    let sftp = session.sftp().map_err(|e| format!("Khởi tạo SFTP subsystem thất bại: {}", e))?;

    let mut file = sftp
        .create(Path::new(&remote_path))
        .map_err(|e| format!("Không thể tạo/ghi tệp '{}': {}", remote_path, e))?;

    file.write_all(content.as_bytes())
        .map_err(|e| format!("Không thể ghi dữ liệu vào tệp: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn ssh_create_dir(
    config: SshConfig,
    secret: Option<String>,
    remote_path: String,
) -> Result<(), String> {
    let session = connect_and_auth(&config, secret.as_deref())?;
    let sftp = session.sftp().map_err(|e| format!("Khởi tạo SFTP subsystem thất bại: {}", e))?;

    sftp.mkdir(Path::new(&remote_path), 0o755)
        .map_err(|e| format!("Không thể tạo thư mục '{}': {}", remote_path, e))?;

    Ok(())
}

#[tauri::command]
pub fn ssh_delete_entry(
    config: SshConfig,
    secret: Option<String>,
    remote_path: String,
    is_dir: bool,
) -> Result<(), String> {
    let session = connect_and_auth(&config, secret.as_deref())?;
    let sftp = session.sftp().map_err(|e| format!("Khởi tạo SFTP subsystem thất bại: {}", e))?;

    let p = Path::new(&remote_path);
    if is_dir {
        sftp.rmdir(p)
            .map_err(|e| format!("Không thể xóa thư mục '{}': {}", remote_path, e))?;
    } else {
        sftp.unlink(p)
            .map_err(|e| format!("Không thể xóa tệp '{}': {}", remote_path, e))?;
    }

    Ok(())
}

#[tauri::command]
pub fn ssh_rename(
    config: SshConfig,
    secret: Option<String>,
    old_path: String,
    new_path: String,
) -> Result<(), String> {
    let session = connect_and_auth(&config, secret.as_deref())?;
    let sftp = session.sftp().map_err(|e| format!("Khởi tạo SFTP subsystem thất bại: {}", e))?;

    sftp.rename(Path::new(&old_path), Path::new(&new_path), None)
        .map_err(|e| format!("Không thể đổi tên từ '{}' sang '{}': {}", old_path, new_path, e))?;

    Ok(())
}

/// Every heavy tool uses this one primitive. The `call_id` comes from the model tool call and
/// is the ONLY key needed to cancel: the registry retains the SSH config/secret and PID.
/// Output streams as coalesced `tool-task-update` events; the detached reader never blocks
/// the Tauri command thread with `read_to_end`.
#[tauri::command]
pub async fn ssh_exec_command(
    app: tauri::AppHandle,
    config: SshConfig,
    secret: Option<String>,
    command: String,
    call_id: String,
) -> Result<CommandOutput, String> {
    // Reserve liveness on the main thread BEFORE any blocking work. A Cancel clicked while
    // this task queues or connects must find the call_id and flip its token. `State<'_, T>`
    // borrows from Invoke and cannot enter a 'static closure, so use the owned AppHandle.
    let registry = app.state::<crate::tool_cancel::ToolTaskRegistry>();
    let cancelled = registry.reserve(call_id.clone(), config.clone(), secret.clone());
    let handle = app.clone();
    // Tool task path: no socket read timeout — only explicit cancel/app exit may stop it.
    // spawn_blocking keeps connect/exec/recv_timeout OFF the Tauri main thread: the UI never
    // freezes while a heavy tool runs (ai-chat-input-lag, user criterion 3).
    let out = tauri::async_runtime::spawn_blocking(move || {
        let registry = handle.state::<crate::tool_cancel::ToolTaskRegistry>();
        let runtime = crate::ssh_pool::runtime();
        // SQLcl heredocs are handled by a persistent remote session (sentinel parsing stays in
        // Rust). All other commands keep the existing channel-per-call runner.
        if let Some((env, bin, conn, sql)) = crate::ssh_pool::parse_sqlcl_command(&command) {
            let outcome = crate::ssh_pool::run_persistent_sqlcl(
                &runtime,
                &config,
                secret.as_deref(),
                &bin,
                &conn,
                &env,
                &sql,
                &cancelled,
            );
            let finish_call = |result: crate::tool_cancel::ToolExecOutput| {
                registry.remove(&call_id);
                let status = if result.finish_reason == "cancelled" { "cancelled" }
                    else if result.finish_reason == "error" { "error" } else { "done" };
                let _ = handle.emit(
                    "tool-task-status",
                    crate::tool_cancel::ToolTaskStatusEvent {
                        call_id: call_id.clone(),
                        status: status.to_string(),
                        finish_reason: Some(result.finish_reason.clone()),
                    },
                );
                result
            };
            return match outcome {
                Ok((stdout, stderr, was_cancelled)) => Ok(finish_call(crate::tool_cancel::ToolExecOutput {
                    stdout,
                    stderr,
                    exit_status: if was_cancelled { -1 } else { 0 },
                    finish_reason: if was_cancelled { "cancelled" } else { "complete" }.to_string(),
                })),
                Err(e) => Ok(finish_call(crate::tool_cancel::ToolExecOutput {
                    stdout: String::new(),
                    stderr: e,
                    exit_status: -1,
                    finish_reason: "error".to_string(),
                })),
            };
        }
        crate::tool_cancel::run_cancellable_remote_command(
            &registry,
            handle.clone(),
            &runtime,
            &config,
            secret.as_deref(),
            call_id,
            command,
            cancelled,
        )
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(CommandOutput {
        stdout: out.stdout,
        stderr: out.stderr,
        exit_status: out.exit_status,
        finish_reason: out.finish_reason,
    })
}

/// Run a remote command without a PTY and stream stdout/stderr line by line.
///
/// The command is wrapped once by `build_remote_command` (base64 payload inside a
/// fixed single-quoted `setsid sh -c` launcher), never interpolated raw into a second
/// shell string. Single-quoted arguments and heredocs from the frontend survive intact.
#[tauri::command]
pub async fn ssh_exec_stream(
    app: AppHandle,
    config: SshConfig,
    secret: Option<String>,
    session_id: String,
    command: String,
) -> Result<(), String> {
    // Same primitive as ssh_exec_command: connect + channel.exec are blocking SSH work and
    // must never run on the Tauri main thread while an AI stream tool is active. Payload,
    // events and reader-thread lifecycle stay byte-for-byte unchanged; only the invoke
    // wrapper moves to a blocking pool.
    tauri::async_runtime::spawn_blocking(move || {
        ssh_exec_stream_blocking(app, config, secret, session_id, command)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn ssh_exec_stream_blocking(
    app: AppHandle,
    config: SshConfig,
    secret: Option<String>,
    session_id: String,
    command: String,
) -> Result<(), String> {
    // Streamed tools also run indefinitely: no socket read timeout may end them.
    let session = connect_and_auth_without_socket_timeout(&config, secret.as_deref())?;
    let mut channel = session
        .channel_session()
        .map_err(|e| format!("Không thể mở channel session: {}", e))?;

    // `setsid` makes the reported pid a real process-group leader, so the id-only
    // `ssh_kill_process` can terminate the whole job with `kill -<pgid>`.
    let remote_command = crate::tool_cancel::build_remote_command(&command);
    channel
        .exec(&remote_command)
        .map_err(|e| format!("Thực thi lệnh stream thất bại: {}", e))?;

    let app_handle = app.clone();
    let sid = session_id.clone();
    let data_event = format!("ssh-stream:data:{}", sid);
    let exit_event = format!("ssh-stream:exit:{}", sid);

    thread::Builder::new()
        .name(format!("ssh-stream-{}", session_id))
        .spawn(move || {
            // State guards are borrowed; resolve the managed registry inside the thread.
            let registry = app_handle.state::<SshStreamRegistry>();
            let mut pid_registered = false;
            // A login banner or `.bashrc` echo can precede the PID line, so keep scanning
            // for it instead of only checking line 1 — otherwise the PID is never registered
            // and `ssh_kill_process` can never cancel this run.
            let mut pid_scan_lines_left = 5;
            // A mid-stream read error must reach the frontend: without it the exit event
            // reports success and the caller parses truncated output as a complete run.
            let mut stream_error: Option<String> = None;

            // `channel.stream(0)` yields an owned `Stream` that implements Read while the
            // channel itself stays usable for stderr()/exit_status(). Moving `channel` into
            // BufReader would consume it and break those later calls.
            let mut stdout_reader = BufReader::new(channel.stream(0));
            let mut raw_line = String::new();
            loop {
                raw_line.clear();
                match stdout_reader.read_line(&mut raw_line) {
                    Ok(0) => break,
                    Ok(_) => {}
                    Err(e) => {
                        stream_error = Some(format!("Đọc stdout thất bại: {}", e));
                        break;
                    }
                }
                let line = raw_line.trim_end_matches(['\n', '\r']).to_string();

                if !pid_registered && pid_scan_lines_left > 0 {
                    pid_scan_lines_left -= 1;
                    if let Ok(pid) = line.trim().parse::<u32>() {
                        if let Ok(mut procs) = registry.active_processes.lock() {
                            procs.insert(sid.clone(), pid);
                        }
                        pid_registered = true;
                        continue;
                    }
                }

                let _ = app_handle.emit(
                    &data_event,
                    SshStreamEvent {
                        session_id: sid.clone(),
                        stream: "stdout".to_string(),
                        line,
                    },
                );
            }

            let mut stderr_buf = String::new();
            let mut stderr_stream = channel.stderr();
            let _ = stderr_stream.read_to_string(&mut stderr_buf);
            for line in stderr_buf.lines() {
                if line.is_empty() {
                    continue;
                }
                let _ = app_handle.emit(
                    &data_event,
                    SshStreamEvent {
                        session_id: sid.clone(),
                        stream: "stderr".to_string(),
                        line: line.to_string(),
                    },
                );
            }

            if pid_registered {
                if let Ok(mut procs) = registry.active_processes.lock() {
                    procs.remove(&sid);
                }
            }

            let _ = app_handle.emit(
                &exit_event,
                SshStreamExitEvent {
                    session_id: sid.clone(),
                    // libssh2 only guarantees the exit-status packet is processed once the
                    // channel closes; reading it before `wait_close` can report a stale value.
                    exit_status: {
                        let _ = channel.wait_close();
                        channel.exit_status().unwrap_or(-1)
                    },
                    error: stream_error,
                },
            );
        })
        .map_err(|e| format!("Không thể tạo thread stream: {}", e))?;

    Ok(())
}

/// Send SIGTERM to the remote process started by `ssh_exec_stream` for this session (T-32-02).
#[tauri::command]
pub fn ssh_kill_process(
    registry: State<'_, SshStreamRegistry>,
    config: SshConfig,
    secret: Option<String>,
    session_id: String,
) -> Result<(), String> {
    // Peek first: removing the PID up front would strand the process if the kill connection
    // fails, and no later retry could ever find it again.
    let pid = {
        let procs = registry.active_processes.lock().map_err(|e| e.to_string())?;
        procs.get(&session_id).copied()
    };

    let Some(pid) = pid else {
        return Ok(());
    };

    // Fire-and-forget kill: Cancel/app-exit must not block the event loop on SSH.
    let config_clone = config.clone();
    let secret_clone = secret.clone();
    thread::Builder::new()
        .name(format!("ssh-kill-{}", pid))
        .spawn(move || {
            let Ok(session) = connect_and_auth_without_socket_timeout(&config_clone, secret_clone.as_deref()) else { return };
            let Ok(mut channel) = session.channel_session() else { return };
            // Negative pid targets the process group (setsid made this pid its leader).
            let _ = channel.exec(&format!("kill -TERM -{} 2>/dev/null || true", pid));
            let mut sink = Vec::new();
            let _ = channel.read_to_end(&mut sink);
        })
        .map_err(|e| format!("Không thể tạo thread hủy process: {}", e))?;

    if let Ok(mut procs) = registry.active_processes.lock() {
        procs.remove(&session_id);
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::check_doc_size;

    #[test]
    fn check_doc_size_accepts_files_at_or_below_the_10mb_cap() {
        assert!(check_doc_size(0).is_ok());
        assert!(check_doc_size(10 * 1024 * 1024).is_ok());
    }

    #[test]
    fn check_doc_size_rejects_files_above_the_10mb_cap_with_vietnamese_error() {
        let err = check_doc_size(10 * 1024 * 1024 + 1).unwrap_err();
        assert!(err.contains("vượt quá 10 MB"), "unexpected error: {err}");
    }
}
