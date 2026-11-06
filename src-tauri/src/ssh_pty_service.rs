use crate::ssh_service::{self, SshConfig};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::mpsc;

pub struct SshPtySession {
    pub session_id: String,
    pub stdin_tx: mpsc::Sender<Vec<u8>>,
    pub is_closed: Arc<AtomicBool>,
    pub channel: Arc<Mutex<ssh2::Channel>>,
}

#[derive(Default)]
pub struct SshPtyRegistry {
    pub sessions: Mutex<HashMap<String, SshPtySession>>,
}

#[tauri::command]
pub fn ssh_pty_start(
    app: AppHandle,
    registry: State<'_, SshPtyRegistry>,
    config: SshConfig,
    secret: Option<String>,
    session_id: String,
    working_dir: Option<String>,
    cols: u32,
    rows: u32,
) -> Result<String, String> {
    // Check if session ID already exists
    {
        let sessions = registry.sessions.lock().map_err(|e| e.to_string())?;
        if sessions.contains_key(&session_id) {
            return Err(format!("Session PTY '{}' đã tồn tại", session_id));
        }
    }

    // Authenticate SSH session
    let session = ssh_service::connect_and_auth(&config, secret.as_deref())?;

    // Open channel session
    let mut channel = session
        .channel_session()
        .map_err(|e| format!("Không thể mở SSH channel: {}", e))?;

    // Request PTY
    let initial_cols = if cols == 0 { 80 } else { cols };
    let initial_rows = if rows == 0 { 24 } else { rows };
    channel
        .request_pty("xterm-256color", None, Some((initial_cols, initial_rows, 0, 0)))
        .map_err(|e| format!("Lỗi request_pty: {}", e))?;

    // Merge stdout and stderr so interactive ANSI prompts and error messages appear in terminal stream
    channel.handle_extended_data(ssh2::ExtendedDataMode::Merge);

    // Start remote interactive shell
    channel
        .shell()
        .map_err(|e| format!("Lỗi khởi động remote shell: {}", e))?;

    // If working_dir is specified, navigate to it immediately
    if let Some(ref dir) = working_dir {
        let clean_dir = dir.trim();
        if !clean_dir.is_empty() {
            let cd_cmd = format!("cd {}\n", clean_dir);
            let _ = channel.write_all(cd_cmd.as_bytes());
            let _ = channel.flush();
        }
    }

    let channel_arc = Arc::new(Mutex::new(channel));
    let is_closed = Arc::new(AtomicBool::new(false));

    // Stdin channel: frontend writes bytes to mpsc::Sender, dedicated background OS thread writes to channel
    let (stdin_tx, mut stdin_rx) = mpsc::channel::<Vec<u8>>(128);

    // Dedicated OS thread for writing stdin
    {
        let channel_clone = Arc::clone(&channel_arc);
        let is_closed_clone = Arc::clone(&is_closed);
        thread::Builder::new()
            .name(format!("ssh-pty-writer-{}", session_id))
            .spawn(move || {
                while let Some(bytes) = stdin_rx.blocking_recv() {
                    if is_closed_clone.load(Ordering::Relaxed) {
                        break;
                    }
                    if let Ok(mut ch) = channel_clone.lock() {
                        if ch.write_all(&bytes).is_err() || ch.flush().is_err() {
                            break;
                        }
                    } else {
                        break;
                    }
                }
            })
            .map_err(|e| format!("Không thể tạo thread writer: {}", e))?;
    }

    // Dedicated OS thread for reading stdout chunk stream
    {
        let channel_clone = Arc::clone(&channel_arc);
        let is_closed_clone = Arc::clone(&is_closed);
        let app_handle = app.clone();
        let sid = session_id.clone();

        thread::Builder::new()
            .name(format!("ssh-pty-reader-{}", session_id))
            .spawn(move || {
                let data_event_name = format!("ssh-pty:data:{}", sid);
                let exit_event_name = format!("ssh-pty:exit:{}", sid);
                let mut buf = [0u8; 4096];

                loop {
                    if is_closed_clone.load(Ordering::Relaxed) {
                        break;
                    }

                    let read_result = {
                        if let Ok(mut ch) = channel_clone.lock() {
                            ch.read(&mut buf)
                        } else {
                            break;
                        }
                    };

                    match read_result {
                        Ok(0) => {
                            // EOF received from remote shell
                            break;
                        }
                        Ok(n) => {
                            let text = String::from_utf8_lossy(&buf[..n]).to_string();
                            let _ = app_handle.emit(&data_event_name, text);
                        }
                        Err(e) => {
                            // If channel timed out or non-blocking would block, sleep briefly; otherwise break
                            if e.kind() == std::io::ErrorKind::WouldBlock || e.kind() == std::io::ErrorKind::TimedOut {
                                thread::sleep(Duration::from_millis(15));
                                continue;
                            }
                            break;
                        }
                    }
                }

                is_closed_clone.store(true, Ordering::Relaxed);
                let _ = app_handle.emit(&exit_event_name, ());
            })
            .map_err(|e| format!("Không thể tạo thread reader: {}", e))?;
    }

    // Store in registry
    let mut sessions = registry.sessions.lock().map_err(|e| e.to_string())?;
    sessions.insert(
        session_id.clone(),
        SshPtySession {
            session_id: session_id.clone(),
            stdin_tx,
            is_closed,
            channel: channel_arc,
        },
    );

    Ok(session_id)
}

#[tauri::command]
pub fn ssh_pty_write(
    registry: State<'_, SshPtyRegistry>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let sessions = registry.sessions.lock().map_err(|e| e.to_string())?;
    let session = sessions
        .get(&session_id)
        .ok_or_else(|| format!("Session PTY '{}' không tồn tại", session_id))?;

    if session.is_closed.load(Ordering::Relaxed) {
        return Err(format!("Session PTY '{}' đã kết thúc", session_id));
    }

    session
        .stdin_tx
        .blocking_send(data.into_bytes())
        .map_err(|e| format!("Không thể gửi input tới session: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn ssh_pty_resize(
    registry: State<'_, SshPtyRegistry>,
    session_id: String,
    cols: u32,
    rows: u32,
) -> Result<(), String> {
    let sessions = registry.sessions.lock().map_err(|e| e.to_string())?;
    let session = sessions
        .get(&session_id)
        .ok_or_else(|| format!("Session PTY '{}' không tồn tại", session_id))?;

    if session.is_closed.load(Ordering::Relaxed) {
        return Ok(());
    }

    let mut ch = session.channel.lock().map_err(|e| e.to_string())?;
    ch.request_pty_size(cols, rows, None, None)
        .map_err(|e| format!("Lỗi resize PTY: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn ssh_pty_close(
    registry: State<'_, SshPtyRegistry>,
    session_id: String,
) -> Result<(), String> {
    let mut sessions = registry.sessions.lock().map_err(|e| e.to_string())?;
    if let Some(session) = sessions.remove(&session_id) {
        session.is_closed.store(true, Ordering::Relaxed);
        if let Ok(mut ch) = session.channel.lock() {
            let _ = ch.close();
            let _ = ch.wait_close();
        }
    }
    Ok(())
}
