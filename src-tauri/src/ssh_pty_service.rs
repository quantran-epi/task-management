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
    #[allow(dead_code)]
    pub session_id: String,
    pub stdin_tx: mpsc::Sender<Vec<u8>>,
    pub is_closed: Arc<AtomicBool>,
    pub channel: Arc<Mutex<ssh2::Channel>>,
}

#[derive(Default)]
pub struct SshPtyRegistry {
    pub sessions: Mutex<HashMap<String, SshPtySession>>,
}

fn shell_start_command(working_dir: Option<&str>) -> Result<Option<String>, String> {
    let Some(path) = working_dir.filter(|path| !path.is_empty()) else {
        return Ok(None);
    };
    if !path.starts_with('/') || path.contains('\0') {
        return Err("Đường dẫn terminal phải là đường dẫn tuyệt đối hợp lệ".into());
    }
    let quoted = format!("'{}'", path.replace('\'', "'\\''"));
    // Set cwd before starting the interactive shell; startup scripts can discard early PTY input.
    Ok(Some(format!("cd -- {} && exec \"${{SHELL:-/bin/sh}}\" -l", quoted)))
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
    let start_command = shell_start_command(working_dir.as_deref())?;
    // If a session with this session_id already exists, cleanly close it before replacing
    {
        let mut sessions = registry.sessions.lock().map_err(|e| e.to_string())?;
        if let Some(old_sess) = sessions.remove(&session_id) {
            old_sess.is_closed.store(true, Ordering::Relaxed);
            if let Ok(mut ch) = old_sess.channel.lock() {
                let _ = ch.close();
            }
        }
    }

    // Authenticate SSH session
    let session = ssh_service::connect_and_auth_dedicated(&config, secret.as_deref())?;

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
    let _ = channel.handle_extended_data(ssh2::ExtendedData::Merge);

    // SSH exec establishes cwd without racing shell startup or injecting terminal keystrokes.
    if let Some(command) = start_command {
        channel.exec(&command)
    } else {
        channel.shell()
    }
    .map_err(|e| format!("Lỗi khởi động remote shell: {}", e))?;

    // Set session to non-blocking mode after shell is established for zero-latency interactive I/O
    session.set_blocking(false);

    let channel_arc = Arc::new(Mutex::new(channel));
    let is_closed = Arc::new(AtomicBool::new(false));

    // Stdin channel: frontend writes bytes to mpsc::Sender, dedicated background OS thread writes to channel
    let (stdin_tx, mut stdin_rx) = mpsc::channel::<Vec<u8>>(256);

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
                        let mut offset = 0;
                        while offset < bytes.len() {
                            if is_closed_clone.load(Ordering::Relaxed) {
                                break;
                            }
                            match ch.write(&bytes[offset..]) {
                                Ok(0) => break,
                                Ok(n) => offset += n,
                                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                                    thread::sleep(Duration::from_millis(2));
                                }
                                Err(_) => break,
                            }
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
                let mut buf = [0u8; 8192];

                loop {
                    if is_closed_clone.load(Ordering::Relaxed) {
                        break;
                    }

                    let (accumulated, is_eof) = {
                        if let Ok(mut ch) = channel_clone.lock() {
                            let mut data = Vec::new();
                            let mut eof = false;

                            // Read available bytes; non-blocking loop drains burst data instantly
                            while let Ok(n) = ch.read(&mut buf) {
                                if n == 0 {
                                    if ch.eof() {
                                        eof = true;
                                    }
                                    break;
                                }
                                data.extend_from_slice(&buf[..n]);
                                if data.len() >= 32768 {
                                    break;
                                }
                            }
                            (data, eof)
                        } else {
                            break;
                        }
                    };

                    if !accumulated.is_empty() {
                        let text = String::from_utf8_lossy(&accumulated).to_string();
                        let _ = app_handle.emit(&data_event_name, text);
                    } else if is_eof {
                        // Remote shell has genuinely closed
                        break;
                    } else {
                        // Channel idle / WouldBlock: yield CPU and release lock for writer thread
                        thread::sleep(Duration::from_millis(15));
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
    let (stdin_tx, is_closed) = {
        let sessions = registry.sessions.lock().map_err(|e| e.to_string())?;
        let session = sessions
            .get(&session_id)
            .ok_or_else(|| format!("Session PTY '{}' không tồn tại", session_id))?;
        (session.stdin_tx.clone(), Arc::clone(&session.is_closed))
    };

    if is_closed.load(Ordering::Relaxed) {
        return Err(format!("Session PTY '{}' đã kết thúc", session_id));
    }

    stdin_tx
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
    let (channel, is_closed) = {
        let sessions = registry.sessions.lock().map_err(|e| e.to_string())?;
        let session = sessions
            .get(&session_id)
            .ok_or_else(|| format!("Session PTY '{}' không tồn tại", session_id))?;
        (Arc::clone(&session.channel), Arc::clone(&session.is_closed))
    };

    if is_closed.load(Ordering::Relaxed) {
        return Ok(());
    }

    if let Ok(mut ch) = channel.lock() {
        let _ = ch.request_pty_size(cols, rows, None, None);
    }

    Ok(())
}

#[tauri::command]
pub fn ssh_pty_close(
    registry: State<'_, SshPtyRegistry>,
    session_id: String,
) -> Result<(), String> {
    let session_opt = {
        let mut sessions = registry.sessions.lock().map_err(|e| e.to_string())?;
        sessions.remove(&session_id)
    };

    if let Some(session) = session_opt {
        session.is_closed.store(true, Ordering::Relaxed);
        if let Ok(mut ch) = session.channel.lock() {
            let _ = ch.close();
            let _ = ch.wait_close();
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::shell_start_command;

    #[cfg(unix)]
    #[test]
    fn started_shell_uses_literal_working_directory() {
        use std::io::Write;
        use std::process::{Command, Stdio};
        let path = std::env::temp_dir().join(format!("taskmate-pty-{}-it's $(false)", std::process::id()));
        std::fs::create_dir_all(&path).unwrap();
        let command = shell_start_command(path.to_str()).unwrap().unwrap();
        let mut child = Command::new("/bin/sh")
            .args(["-c", &command])
            .env("SHELL", "/bin/sh")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn().unwrap();
        child.stdin.take().unwrap().write_all(b"pwd\n").unwrap();
        let output = child.wait_with_output().unwrap();
        std::fs::remove_dir(&path).unwrap();
        assert!(output.status.success());
        assert_eq!(String::from_utf8(output.stdout).unwrap().trim(), path.to_str().unwrap());
    }

    #[test]
    fn working_directory_is_quoted_before_shell_starts() {
        assert_eq!(shell_start_command(None).unwrap(), None);
        assert_eq!(shell_start_command(Some("")).unwrap(), None);
        assert!(shell_start_command(Some("relative/path")).is_err());
        assert!(shell_start_command(Some("/bad\0path")).is_err());
        assert_eq!(
            shell_start_command(Some("/repo/it's $(touch nope)")).unwrap(),
            Some("cd -- '/repo/it'\\''s $(touch nope)' && exec \"${SHELL:-/bin/sh}\" -l".into())
        );
    }
}

pub fn cleanup_on_exit(registry: &SshPtyRegistry) {
    if let Ok(mut sessions) = registry.sessions.lock() {
        for (_, session) in sessions.drain() {
            session.is_closed.store(true, Ordering::Relaxed);
            if let Ok(mut ch) = session.channel.lock() {
                let _ = ch.close();
            }
        }
    }
}
