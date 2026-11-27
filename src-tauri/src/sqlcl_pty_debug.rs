//! Bounded in-memory PTY trace for persistent SQLcl sessions.
//!
//! Enabled in every build so a live debug session can be exported from Settings → Remote SSH.
//! The buffer is capped at 64 KiB, stores escaped bytes only, and applies a conservative redaction
//! pass at export time. Nothing is written to disk automatically.

use std::sync::Mutex;

const MAX_TRACE_BYTES: usize = 64 * 1024;

static TRACE: Mutex<Vec<u8>> = Mutex::new(Vec::new());

/// Append one labelled fragment. Excess bytes are dropped from the front so the newest evidence
/// survives; this is diagnostic-only state, never domain data.
pub(crate) fn dump(label: &str, bytes: &[u8]) {
    let Ok(mut trace) = TRACE.lock() else { return };
    let line = format!("{} {}\n", label, escaped(bytes));
    trace.extend_from_slice(line.as_bytes());
    if trace.len() > MAX_TRACE_BYTES {
        let excess = trace.len() - MAX_TRACE_BYTES;
        trace.drain(0..excess);
    }
}

/// Export the current trace as one printable string. Redaction is applied here, once, on output.
#[tauri::command]
pub fn sqlcl_pty_dump_export(clear: bool) -> Result<String, String> {
    let mut trace = TRACE.lock().map_err(|e| e.to_string())?;
    let bytes = if clear { std::mem::take(&mut *trace) } else { trace.clone() };
    Ok(redact(&String::from_utf8_lossy(&bytes)))
}

/// Escape bytes into a single printable line fragment. Keeps ASCII; renders CR/LF/TAB and other
/// control bytes as `\xNN`. Truncates a single fragment at 2048 bytes so one noisy line cannot
/// crowd out the rest of the trace.
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

    #[test]
    fn trace_is_bounded_and_clearable() {
        if let Ok(mut trace) = TRACE.lock() {
            trace.clear();
        }
        for _ in 0..100 {
            dump("TEST", &[b'x'; 1024]);
        }
        let exported = sqlcl_pty_dump_export(false).expect("export");
        assert!(exported.len() <= MAX_TRACE_BYTES);
        let cleared = sqlcl_pty_dump_export(true).expect("clear");
        assert_eq!(cleared, exported);
        assert!(sqlcl_pty_dump_export(false).expect("empty").is_empty());
    }
}
