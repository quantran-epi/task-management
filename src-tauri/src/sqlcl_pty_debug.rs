//! Bounded, opt-in raw PTY dump for persistent SQLcl sessions.
//!
//! Enabled only when `TASKMATE_SQLCL_DUMP=1`. Default path:
//! `$HOME/Library/Application Support/com.personal.taskplanner/sqlcl-pty-debug.log`
//! on macOS, or `$TASKMATE_SQLCL_DUMP_PATH` when set. The dump escapes control bytes and applies
//! a conservative redaction pass; it is a diagnostic aid, not proof that no secret can appear.

use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

const MAX_DUMP_BYTES: usize = 64 * 1024;

static DUMP: Mutex<Option<DumpState>> = Mutex::new(None);

struct DumpState {
    file: File,
    bytes: usize,
}

fn dump_path() -> PathBuf {
    if let Ok(path) = std::env::var("TASKMATE_SQLCL_DUMP_PATH") {
        return PathBuf::from(path);
    }
    let base = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".to_string());
    PathBuf::from(base)
        .join("Library")
        .join("Application Support")
        .join("com.personal.taskplanner")
        .join("sqlcl-pty-debug.log")
}

fn enabled() -> bool {
    matches!(std::env::var("TASKMATE_SQLCL_DUMP").as_deref(), Ok("1") | Ok("true"))
}

/// Escape bytes into a single printable line fragment. Keeps ASCII and common Unicode; renders
/// CR/LF/TAB and other control bytes as `\xNN`. Truncates at a UTF-8 boundary.
fn escaped(input: &[u8]) -> String {
    let mut out = String::with_capacity(input.len().min(2048));
    for &b in input.iter().take(2048) {
        match b {
            b'\n' => out.push_str("\\n"),
            b'\r' => out.push_str("\\r"),
            b'\t' => out.push_str("\\t"),
            0x20..=0x7e => out.push(b as char),
            _ => out.push_str(&format!("\\x{:02x}", b)),
        }
    }
    out
}

fn redact(fragment: &str) -> String {
    let mut out = fragment.to_string();
    // Conservative, case-insensitive token-like values. Deliberately broad for a local dump:
    // better to lose a diagnostic than to write a credential to disk.
    let markers = [
        "password", "passwd", "pwd", "token", "secret", "keyring", "authorization",
        "bearer", "api_key", "apikey", "connection", "conn",
    ];
    for pass in 0..8 {
        let lower = out.to_lowercase();
        let mut changed = false;
        for marker in markers {
            let mut from = 0usize;
            while from < lower.len() {
                let Some(rel) = lower[from..].find(marker) else { break };
                let key_start = from + rel;
                let key_end = key_start + marker.len();
                let mut value_start = key_end;
                while out.as_bytes().get(value_start) == Some(&b' ') {
                    value_start += 1;
                }
                if matches!(out.as_bytes().get(value_start), Some(b'=') | Some(b':')) {
                    value_start += 1;
                    while out.as_bytes().get(value_start) == Some(&b' ') {
                        value_start += 1;
                    }
                    let mut value_end = value_start;
                    while let Some(&b) = out.as_bytes().get(value_end) {
                        if b.is_ascii_alphanumeric()
                            || matches!(b, b'_' | b'-' | b'.' | b'/' | b'+' | b'=')
                        {
                            value_end += 1;
                        } else {
                            break;
                        }
                    }
                    if value_end > value_start && !out[value_start..value_end].starts_with("[REDACTED]") {
                        out.replace_range(value_start..value_end, "[REDACTED]");
                        changed = true;
                        break; // lowercase index is stale; restart the pass
                    }
                }
                from = key_end;
            }
        }
        if !changed || pass == 7 {
            break;
        }
    }
    out
}

/// Public entry point. Never panics and never blocks on user input.
pub(crate) fn dump(label: &str, bytes: &[u8]) {
    if !enabled() {
        return;
    }
    let Ok(mut guard) = DUMP.lock() else { return };
    if guard.is_none() {
        let path = dump_path();
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let file = OpenOptions::new().create(true).append(true).open(path);
        let Ok(file) = file else { return };
        *guard = Some(DumpState { file, bytes: 0 });
    }
    let state = guard.as_mut().expect("initialized above");
    if state.bytes >= MAX_DUMP_BYTES {
        return;
    }
    let fragment = redact(&escaped(bytes));
    let line = format!("{} {}\n", label, fragment);
    let take = line.len().min(MAX_DUMP_BYTES - state.bytes);
    if state.file.write_all(&line.as_bytes()[..take]).is_ok() {
        state.bytes += take;
        let _ = state.file.flush();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escaped_renders_control_bytes() {
        assert_eq!(escaped(b"a\r\nb\x1b[31m"), "a\\r\\nb\\x1b[31m");
    }

    #[test]
    fn escaped_bounds_fragment() {
        let out = escaped(&[b'x'; 4096]);
        assert!(out.len() <= 2048);
    }

    #[test]
    fn redact_masks_key_value_pairs() {
        let out = redact("password=hunter2 token: abc123 SELECT 1");
        assert!(!out.contains("hunter2"));
        assert!(!out.contains("abc123"));
        assert!(out.contains("[REDACTED]"));
    }
}
