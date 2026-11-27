//! Bounded in-memory PTY trace for persistent SQLcl sessions.
//!
//! Always on. Settings → Remote SSH exports the trace to a file the user chooses. Nothing is
//! written to disk automatically. All lines are escaped, session-tagged, and redacted at export.

use std::cell::Cell;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

const MAX_TRACE_BYTES: usize = 256 * 1024;

static TRACE: Mutex<Vec<u8>> = Mutex::new(Vec::new());
static SESSION_SEQ: AtomicU64 = AtomicU64::new(0);

thread_local! {
    static TRACE_SESSION: Cell<u64> = const { Cell::new(0) };
}

/// Start a new correlation id for one `SqlclSession::start` and everything it does afterwards.
pub(crate) fn session_start() -> u64 {
    let id = SESSION_SEQ.fetch_add(1, Ordering::Relaxed) + 1;
    TRACE_SESSION.with(|slot| slot.set(id));
    event("SESSION_BEGIN");
    id
}

pub(crate) fn dump(label: &str, bytes: &[u8]) {
    push(label, bytes);
}

pub(crate) fn event(label: &str) {
    push(label, b"");
}

fn push(label: &str, bytes: &[u8]) {
    let Ok(mut trace) = TRACE.lock() else { return };
    let id = TRACE_SESSION.with(|slot| slot.get());
    let line = format!("s{:04} {} {}\n", id, label, escaped(bytes));
    trace.extend_from_slice(line.as_bytes());
    if trace.len() > MAX_TRACE_BYTES {
        let excess = trace.len() - MAX_TRACE_BYTES;
        trace.drain(0..excess);
    }
}

#[tauri::command]
pub fn sqlcl_pty_dump_export(clear: bool) -> Result<String, String> {
    let mut trace = TRACE.lock().map_err(|e| e.to_string())?;
    let bytes = if clear { std::mem::take(&mut *trace) } else { trace.clone() };
    Ok(redact(&String::from_utf8_lossy(&bytes)))
}

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
    let markers = [
        "password", "passwd", "pwd", "token", "secret", "keyring", "authorization",
        "bearer", "api_key", "apikey", "connection", "conn",
    ];
    for _ in 0..8 {
        let lower = out.to_lowercase();
        let mut changed = false;
        for marker in markers {
            let mut from = 0usize;
            while from < lower.len() {
                let Some(rel) = lower[from..].find(marker) else { break };
                let key_end = from + rel + marker.len();
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
                        break;
                    }
                }
                from = key_end;
            }
        }
        if !changed {
            break;
        }
    }
    out
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
        assert!(escaped(&[b'x'; 4096]).len() <= 2048);
    }

    #[test]
    fn redact_masks_key_value_pairs() {
        let out = redact("password=hunter2 token: abc123 SELECT 1");
        assert!(!out.contains("hunter2"));
        assert!(!out.contains("abc123"));
        assert!(out.contains("[REDACTED]"));
    }

    #[test]
    fn trace_is_bounded_session_tagged_and_clearable() {
        if let Ok(mut trace) = TRACE.lock() {
            trace.clear();
        }
        session_start(); // creates SESSION_BEGIN
        for _ in 0..400 {
            dump("BOUNDARY_FILLER", &[b'x'; 1024]);
        }
        session_start(); // must survive at the tail after ring-buffer trimming
        let exported = sqlcl_pty_dump_export(false).expect("export");
        assert!(exported.len() <= MAX_TRACE_BYTES);
        assert!(exported.contains("SESSION_BEGIN"));
        assert!(exported.lines().any(|line| line.starts_with("s")));
        let cleared = sqlcl_pty_dump_export(true).expect("clear");
        assert_eq!(cleared, exported);
        assert!(sqlcl_pty_dump_export(false).expect("empty").is_empty());
    }
}
