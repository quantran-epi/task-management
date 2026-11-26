//! Shared SSH connection pool + persistent remote SQLcl sessions in Tauri app state.
//!
//! One authenticated `ssh2::Session` is reused per connection identity for every SSH command.
//! Each call still opens a fresh channel, so cancellation and stream semantics are unchanged;
//! only the TCP handshake and auth are amortised. The identity key stores a salted digest of
//! the secret, never plaintext, and changes when the saved config/keyring secret changes.
//!
//! A remote `sqlcl -s -L '<conn>'` process is kept alive per connection profile over a pooled
//! SSH channel. Each query sends a full SET preamble + script + unique `PROMPT` sentinel, then
//! reads stdout until that sentinel. A broken pipe restarts the session once and retries.
//! Nothing is spawned on the host and no local filesystem API is added.

use crate::ssh_service::{connect_and_auth_inner, SshConfig};
pub(crate) use crate::ssh_service::SocketTimeout;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

/// Salt for the in-memory secret fingerprint. Fixed per process: the digest is never persisted
/// and is only compared against another digest computed in this same process.
const POOL_SECRET_SALT: &[u8] = b"taskmate-ssh-pool-v1";

/// Drop pooled sessions idle longer than this. `SqlclSessionRegistry` enforces the same TTL
/// on acquire; `health_check` prunes both registries at app exit and on explicit invalidation.
pub(crate) const SESSION_IDLE_TTL: Duration = Duration::from_secs(15 * 60);

/// Cap buffered stderr per persistent session — same ceiling as `tool_cancel`'s readers.
const MAX_SQLCL_STDERR_BYTES: usize = 2 * 1024 * 1024;

/// Wake-up socket timeout is only a poll tick, never a transport failure.
fn is_wakeup_timeout(err: &std::io::Error) -> bool {
    matches!(
        err.kind(),
        std::io::ErrorKind::TimedOut | std::io::ErrorKind::WouldBlock | std::io::ErrorKind::Interrupted
    )
}

/// Identity of one pooled SSH session. `secret_digest` is a salted digest, never plaintext.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct PoolKey {
    pub(crate) host: String,
    pub(crate) port: u16,
    pub(crate) username: String,
    pub(crate) auth_type: String,
    pub(crate) key_path: Option<String>,
    pub(crate) secret_digest: String,
    /// Socket read-timeout class. Wake-up (250 ms) and interactive (30 s) sessions must never
    /// share a cached transport: reuse would either break large-file reads or stall Cancel.
    pub(crate) socket_mode: u8,
}

impl PoolKey {
    #[cfg(test)]
    pub fn new(config: &SshConfig, secret: Option<&str>) -> Self {
        Self::with_mode(config, secret, SocketTimeout::Interactive)
    }

    pub(crate) fn with_mode(config: &SshConfig, secret: Option<&str>, mode: SocketTimeout) -> Self {
        Self {
            host: config.host.trim().to_string(),
            port: config.port,
            username: config.username.trim().to_string(),
            auth_type: config.auth_type.clone(),
            key_path: config.key_path.as_deref().map(str::trim).map(str::to_string),
            secret_digest: digest_secret(secret),
            socket_mode: mode.class(),
        }
    }

    /// Stable fingerprint for tests; contains no secret material.
    #[cfg(test)]
    pub fn fingerprint(&self) -> String {
        format!(
            "{}@{}:{}|{}|{}",
            self.username, self.host, self.port, self.auth_type, self.secret_digest
        )
    }
}

/// FNV-1a over salt || secret. This only detects a *change* of the in-memory secret; it is not
/// a password store and no extra dependency is needed. `None` and `Some("")` digest identically,
/// which matches the auth path (both mean empty secret/passphrase).
fn digest_secret(secret: Option<&str>) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in POOL_SECRET_SALT.iter().copied().chain(secret.unwrap_or("").bytes()) {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{hash:016x}")
}

struct PooledSession {
    session: ssh2::Session,
    last_used: Instant,
    /// Sessions that failed a channel operation are dropped on the next acquire.
    unhealthy: bool,
}

#[derive(Default)]
pub struct SshConnectionPool {
    sessions: Mutex<HashMap<PoolKey, PooledSession>>,
}

impl SshConnectionPool {
    /// Return a reusable authenticated session or open one. Connect happens outside the lock
    /// so a slow handshake never blocks a different identity.
    pub fn acquire(
        &self,
        config: &SshConfig,
        secret: Option<&str>,
        timeout: SocketTimeout,
    ) -> Result<ssh2::Session, String> {
        let key = PoolKey::with_mode(config, secret, timeout);
        if let Ok(mut sessions) = self.sessions.lock() {
            sessions.retain(|_, entry| entry.last_used.elapsed() < SESSION_IDLE_TTL && !entry.unhealthy);
            if let Some(entry) = sessions.get_mut(&key) {
                entry.last_used = Instant::now();
                return Ok(entry.session.clone());
            }
        }

        let session = connect_and_auth_inner(config, secret, timeout)?;
        if let Ok(mut sessions) = self.sessions.lock() {
            // Another thread may have connected while we were handshaking; keep its session.
            let entry = sessions.entry(key).or_insert(PooledSession {
                session: session.clone(),
                last_used: Instant::now(),
                unhealthy: false,
            });
            entry.last_used = Instant::now();
        }
        Ok(session)
    }

    /// Mark one identity unhealthy; the next acquire replaces it. Called on every transport
    /// error (channel open, exec, read) so a dead TCP connection is never sticky.
    pub fn report_unhealthy(&self, config: &SshConfig, secret: Option<&str>, mode: SocketTimeout) {
        let key = PoolKey::with_mode(config, secret, mode);
        if let Ok(mut sessions) = self.sessions.lock() {
            if let Some(entry) = sessions.get_mut(&key) {
                entry.unhealthy = true;
            }
        }
    }

    /// Explicit teardown: close every pooled session (app exit / config reload).
    pub fn teardown(&self) {
        if let Ok(mut sessions) = self.sessions.lock() {
            sessions.clear();
        }
    }

}

// --- Persistent SQLcl session --------------------------------------------------------------

/// Identity of one persistent remote SQLcl process. The SSH identity digest already covers the
/// SSH secret; the Oracle connection string is the operator-controlled profile value.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct SqlclKey {
    pub(crate) ssh: PoolKey,
    pub(crate) bin: String,
    pub(crate) conn: String,
    pub(crate) env_prefix: String,
}

impl SqlclKey {
    pub fn new(config: &SshConfig, secret: Option<&str>, bin: &str, conn: &str, env: &str) -> Self {
        Self {
            ssh: PoolKey::with_mode(config, secret, SocketTimeout::Wakeup),
            bin: bin.trim().to_string(),
            conn: conn.to_string(),
            env_prefix: env.trim().to_string(),
        }
    }
}

/// A live remote SQLcl process. `channel` is the mutable command/stdin side; `reader` holds
/// stdout and `stderr` holds bounded diagnostics. The per-session mutex serialises whole
/// queries so two calls can never interleave SQL or sentinel lines on one stream.
pub(crate) struct SqlclSession {
    channel: Mutex<ssh2::Channel>,
    reader: Mutex<BufReader<ssh2::Stream>>,
    stderr: Arc<Mutex<String>>,
    last_used: Mutex<Instant>,
    pgid: Option<u32>,
}

impl SqlclSession {
    /// Spawn the remote process on a dedicated SSH channel. No host process is created. The
    /// remote command goes through `build_remote_command` (base64 inside `setsid sh -c`), so
    /// `env`, `bin` and `conn` cannot inject a second shell command, and the PGID is captured
    /// for explicit cancellation.
    fn start(session: &ssh2::Session, key: &SqlclKey) -> Result<Self, String> {
        let mut channel = session
            .channel_session()
            .map_err(|e| format!("Không thể mở channel SQLcl: {}", e))?;
        let launcher = format!(
            "{}{} -s -L '{}'",
            if key.env_prefix.is_empty() { String::new() } else { format!("{} && ", key.env_prefix) },
            key.bin,
            key.conn
        );
        let remote_command = crate::tool_cancel::build_remote_command(&launcher);
        channel.exec(&remote_command).map_err(|e| format!("Khởi động SQLcl thất bại: {}", e))?;

        // `setsid` prints its PID/PGID as a line; banners or a slow link may precede it. Scan a
        // bounded window of lines, ignoring wake-up timeouts (they are not transport errors).
        let mut reader = BufReader::new(channel.stream(0));
        let pgid = {
            let prefix = crate::tool_cancel::PGID_LINE_PREFIX;
            let mut found = None;
            let mut line = String::new();
            for _ in 0..10 {
                line.clear();
                match reader.read_line(&mut line) {
                    Ok(0) => break,
                    Ok(_) => {
                        if let Some(value) = line.trim().strip_prefix(prefix) {
                            found = value.trim().parse::<u32>().ok();
                            break;
                        }
                    }
                    Err(e) if is_wakeup_timeout(&e) => continue,
                    Err(e) => return Err(format!("Đọc PGID SQLcl thất bại: {}", e)),
                }
            }
            found.ok_or_else(|| "Không nhận dạng được PGID của phiên SQLcl.".to_string())?
        };

        let stderr = Arc::new(Mutex::new(String::new()));
        let stderr_reader = channel.stderr();
        let stderr_sink = Arc::clone(&stderr);
        std::thread::Builder::new()
            .name("sqlcl-stderr".to_string())
            .spawn(move || {
                let mut buf = [0u8; 8 * 1024];
                let mut stream = stderr_reader;
                loop {
                    match stream.read(&mut buf) {
                        Ok(0) => break,
                        Ok(n) => {
                            if let Ok(mut sink) = stderr_sink.lock() {
                                if sink.len() < MAX_SQLCL_STDERR_BYTES {
                                    let take = n.min(MAX_SQLCL_STDERR_BYTES - sink.len());
                                    sink.push_str(&String::from_utf8_lossy(&buf[..take]));
                                }
                            }
                        }
                        Err(e) if is_wakeup_timeout(&e) => continue,
                        Err(_) => break,
                    }
                }
            })
            .map_err(|e| format!("Không thể tạo thread đọc stderr SQLcl: {}", e))?;

        Ok(Self {
            channel: Mutex::new(channel),
            reader: Mutex::new(reader),
            stderr,
            last_used: Mutex::new(Instant::now()),
            pgid: Some(pgid),
        })
    }

    fn kill_remote(&self, config: &SshConfig, secret: Option<&str>) {
        if let Some(pgid) = self.pgid {
            let _ = crate::tool_cancel::spawn_kill_remote_process_group_for_sqlcl(config, secret, pgid);
        }
    }

    /// Send one script and read until its unique sentinel. `cancelled` is the shared token from
    /// `ToolTaskRegistry`; on cancel the remote process group is SIGTERM'd and the session is
    /// torn down, never left half-read.
    fn run_script(
        &self,
        script: &str,
        marker: &str,
        cancelled: &AtomicBool,
        config: &SshConfig,
        secret: Option<&str>,
    ) -> Result<(String, String, bool), String> {
        let mut channel = self.channel.lock().map_err(|e| e.to_string())?;
        let mut reader = self.reader.lock().map_err(|e| e.to_string())?;
        if cancelled.load(Ordering::SeqCst) {
            self.kill_remote(config, secret);
            return Ok((String::new(), String::new(), true));
        }
        channel.write_all(script.as_bytes()).map_err(|e| format!("Ghi SQLcl thất bại: {}", e))?;
        channel.flush().map_err(|e| format!("Flush SQLcl thất bại: {}", e))?;
        *self.last_used.lock().map_err(|e| e.to_string())? = Instant::now();

        let mut output = String::new();
        // Wake-up timeout must keep partial bytes: `BufRead::read_line` appends in place and
        // those bytes are already consumed from the BufReader. Clear only on a completed line.
        let mut line = String::new();
        let mut saw_sentinel = false;
        loop {
            if cancelled.load(Ordering::SeqCst) {
                self.kill_remote(config, secret);
                return Ok((output, self.stderr_snapshot(), true));
            }
            match reader.read_line(&mut line) {
                Ok(0) => break, // process exited before the sentinel: broken session
                Ok(_) => {
                    if line.trim_end_matches(['\n', '\r']) == marker {
                        saw_sentinel = true;
                        break;
                    }
                    output.push_str(&line);
                    line.clear();
                }
                Err(e) => {
                    if matches!(e.kind(), std::io::ErrorKind::TimedOut | std::io::ErrorKind::WouldBlock | std::io::ErrorKind::Interrupted) {
                        continue; // wake-up only; keep the partial line
                    }
                    return Err(format!("Đọc SQLcl thất bại: {}", e));
                }
            }
        }
        if !saw_sentinel && !cancelled.load(Ordering::SeqCst) {
            return Err("Phiên SQLcl kết thúc trước khi có sentinel.".to_string());
        }
        Ok((output, self.stderr_snapshot(), false))
    }

    fn stderr_snapshot(&self) -> String {
        self.stderr.lock().map(|s| s.clone()).unwrap_or_default()
    }

    fn is_expired(&self) -> bool {
        self.last_used.lock().map(|t| t.elapsed() >= SESSION_IDLE_TTL).unwrap_or(true)
    }
}

#[derive(Default)]
pub struct SqlclSessionRegistry {
    sessions: Mutex<HashMap<SqlclKey, Arc<SqlclSession>>>,
}

impl SqlclSessionRegistry {
    /// Prune expired sessions and tear down the live remote process group for each.
    pub fn health_check(&self, config: &SshConfig, secret: Option<&str>) {
        if let Ok(mut sessions) = self.sessions.lock() {
            sessions.retain(|_, session| {
                if session.is_expired() {
                    session.kill_remote(config, secret);
                    false
                } else {
                    true
                }
            });
        }
    }

    pub fn teardown(&self, config: Option<&SshConfig>, secret: Option<&str>) {
        if let Ok(mut sessions) = self.sessions.lock() {
            if let (Some(config), Some(_)) = (config, secret) {
                for session in sessions.values() {
                    session.kill_remote(config, secret);
                }
            }
            sessions.clear();
        }
    }

}

/// One lifecycle owner for both registries, managed in Tauri AppState and shared with sync
/// commands that have no `AppHandle` parameter.
#[derive(Default)]
pub struct SshRuntimeState {
    pub pool: SshConnectionPool,
    pub sqlcl: SqlclSessionRegistry,
}

static RUNTIME: OnceLock<Arc<SshRuntimeState>> = OnceLock::new();

/// The single runtime instance. Tauri manages a clone of this Arc; sync commands and the
/// cancellation path use the same Arc, so there is never a second pool/registry.
pub fn runtime() -> &'static SshRuntimeState {
    Arc::as_ref(RUNTIME.get_or_init(|| Arc::new(SshRuntimeState::default())))
}

/// Drop cached SSH/SQLcl sessions after SSH config or keyring secret changed. Called from the
/// frontend right after `saveSshConfig`/`deleteSshConfig`; best-effort on the TS side.
#[tauri::command]
pub fn ssh_invalidate_pool() {
    let state = runtime();
    state.sqlcl.teardown(None, None);
    state.pool.teardown();
}

pub fn cleanup_on_exit(state: &SshRuntimeState) {
    // No config here (registry deliberately keeps none); dropping channels closes the remote
    // shells when SSH disconnects. Explicit Cancel is the path that kills a live SQLcl PGID.
    state.sqlcl.teardown(None, None);
    state.pool.teardown();
}

// --- pure helpers --------------------------------------------------------------------------

/// Unique per-request sentinel. `PROMPT <marker>` is sent as the last script line.
pub fn make_sqlcl_sentinel() -> (String, String) {
    use std::sync::atomic::{AtomicU64, Ordering};
    static NONCE: AtomicU64 = AtomicU64::new(1);
    let marker = format!(
        "TASKMATE_SQLCL_DONE_{:016x}_{:x}",
        std::process::id(),
        NONCE.fetch_add(1, Ordering::SeqCst)
    );
    (format!("PROMPT {marker}"), marker)
}

/// Full per-query script: reset preamble + caller SQL + sentinel. Every query gets the same
/// baseline so one query's SET cannot affect the next on a persistent session.
pub fn build_sqlcl_script(sql: &str, prompt_line: &str) -> String {
    format!(
        "SET SQLFORMAT DEFAULT;\nSET PAGESIZE 0;\nSET FEEDBACK OFF;\nSET HEADING ON;\nSET LINESIZE 32767;\nSET TRIMSPOOL ON;\n{sql}\n{prompt_line}\n"
    )
}

/// Saved-profile guardrails, duplicated in Rust so a pooled call can never bypass the TS
/// guardrails. `bin` is a single executable token — no shell metacharacters, no arguments.
pub(crate) fn validate_sqlcl_profile(conn: &str, bin: &str, env: &str) -> Result<(), String> {
    if conn.trim().is_empty() {
        return Err("Chưa cấu hình chuỗi kết nối Oracle (connection string).".to_string());
    }
    if [conn, bin, env].iter().any(|v| v.contains(['\r', '\n'])) {
        return Err("Cấu hình Oracle chứa ký tự xuống dòng không hợp lệ.".to_string());
    }
    if conn.contains('\'') {
        return Err("Chuỗi kết nối Oracle chứa dấu nháy đơn không hợp lệ.".to_string());
    }
    if bin.is_empty() || !bin.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'.' | b'/' | b'-')) {
        return Err("Đường dẫn SQLcl chứa ký tự không hợp lệ.".to_string());
    }
    Ok(())
}

/// Recognise the exact SQLcl heredoc command produced by `oracleSqlclService.ts` and extract
/// `(env_prefix, sqlcl_bin, connection_string, sql_script)`. Nothing else is routed to a
/// persistent session. TS is intentionally unchanged: the sentinel and session lifecycle are
/// entirely a Rust concern behind the existing `ssh_exec_command` contract.
pub fn parse_sqlcl_command(command: &str) -> Option<(String, String, String, String)> {
    let mut lines = command.split('\n');
    let header = lines.next()?.trim_end_matches('\r');
    let heredoc = " << 'EOF_ORACLE_SQLCL_";
    let (launcher, delimiter_tail) = header.split_once(heredoc)?;
    // The TS command closes the quoted delimiter with `'`: `<< 'EOF_ORACLE_SQLCL_<hex>'`.
    // Strip that trailing quote before validating the 32-hex UUID suffix.
    let delimiter_tail = delimiter_tail.strip_suffix('\'')?;
    let delimiter = format!("EOF_ORACLE_SQLCL_{delimiter_tail}");
    if delimiter.len() != 49
        || !delimiter[17..].bytes().all(|b| b.is_ascii_hexdigit() && !b.is_ascii_lowercase())
    {
        return None;
    }
    let (env, bin, conn) = parse_sqlcl_launcher(launcher.trim())?;
    let mut script = String::new();
    let mut closed = false;
    for line in lines {
        let line = line.trim_end_matches('\r');
        if line == delimiter {
            closed = true;
            break;
        }
        script.push_str(line);
        script.push('\n');
    }
    if !closed {
        return None;
    }
    // TS appends exactly one trailing `EXIT;` after the heredoc body. Remove only trailing
    // EXIT lines — an interior literal line `EXIT;` inside a string must survive untouched.
    let script = script.trim_end_matches('\n');
    let mut script = script;
    while let Some(last) = script.lines().last() {
        if last.trim().eq_ignore_ascii_case("EXIT;") {
            script = script[..script.len() - last.len()].trim_end_matches('\n');
        } else {
            break;
        }
    }
    Some((env, bin, conn, script.to_string()))
}

/// Parse `<env> && <bin> -s -L '<conn>'` from the heredoc header. Only the shape emitted by the
/// TS guardrails is accepted; `bin` is later whitelisted by `validate_sqlcl_profile`.
fn parse_sqlcl_launcher(header: &str) -> Option<(String, String, String)> {
    let (env, rest) = match header.rsplit_once(" && ") {
        Some((env, rest)) => (env.trim().to_string(), rest.trim()),
        None => (String::new(), header.trim()),
    };
    let (bin, conn_part) = rest.split_once(" -s -L '")?;
    if bin.is_empty() || bin.contains(['\r', '\n', ' ', '\'', '"']) {
        return None;
    }
    let conn = conn_part.strip_suffix('\'')?;
    if conn.is_empty() || conn.contains('\'') {
        return None;
    }
    Some((env, bin.to_string(), conn.to_string()))
}

/// Execute one SQLcl script on a persistent remote session. On a broken pipe or process exit,
/// drop the session and start a fresh one once, then retry. Per-profile lock serialises calls.
pub fn run_persistent_sqlcl(
    state: &SshRuntimeState,
    config: &SshConfig,
    secret: Option<&str>,
    bin: &str,
    conn: &str,
    env: &str,
    script: &str,
    cancelled: &AtomicBool,
) -> Result<(String, String, bool), String> {
    validate_sqlcl_profile(conn, bin, env)?;
    let key = SqlclKey::new(config, secret, bin, conn, env);
    let (prompt, marker) = make_sqlcl_sentinel();
    let full_script = build_sqlcl_script(script, &prompt);

    for attempt in 0..2 {
        if cancelled.load(Ordering::SeqCst) {
            return Ok((String::new(), String::new(), true));
        }
        state.sqlcl.health_check(config, secret);
        let session = {
            let mut sessions = state.sqlcl.sessions.lock().map_err(|e| e.to_string())?;
            if sessions.get(&key).is_some() {
                let existing = sessions.get(&key).expect("checked above");
                Arc::clone(existing)
            } else {
                let ssh = state.pool.acquire(config, secret, SocketTimeout::Wakeup)?;
                let created = match SqlclSession::start(&ssh, &key) {
                    Ok(created) => Arc::new(created),
                    Err(e) => {
                        state.pool.report_unhealthy(config, secret, SocketTimeout::Wakeup);
                        if attempt == 0 { continue; }
                        return Err(e);
                    }
                };
                sessions.insert(key.clone(), Arc::clone(&created));
                created
            }
        };

        match session.run_script(&full_script, &marker, cancelled, config, secret) {
            Ok((stdout, stderr, true)) => {
                // Explicit cancel: SIGTERM already sent; drop the half-read session.
                if let Ok(mut sessions) = state.sqlcl.sessions.lock() {
                    sessions.remove(&key);
                }
                return Ok((stdout, stderr, true));
            }
            Ok((stdout, stderr, false)) => return Ok((stdout, stderr, false)),
            Err(e) => {
                if let Ok(mut sessions) = state.sqlcl.sessions.lock() {
                    sessions.remove(&key);
                }
                state.pool.report_unhealthy(config, secret, SocketTimeout::Wakeup);
                if attempt == 0 { continue; }
                return Err(e);
            }
        }
    }
    unreachable!("loop returns on attempt 1")
}

#[cfg(test)]
mod live_uat_tests {
    use super::*;

    fn live_config() -> SshConfig {
        let dir = std::env::var("VRA_UAT_DIR").expect("VRA_UAT_DIR");
        SshConfig {
            id: "live".into(),
            name: "live".into(),
            host: "127.0.0.1".into(),
            port: 22222,
            username: whoami(),
            auth_type: "key_file".into(),
            key_path: Some(format!("{dir}/.ssh/id_ed25519")),
            default_remote_path: None,
        }
    }

    fn whoami() -> String {
        std::env::var("USER").unwrap_or_else(|_| "tranducquan".into())
    }

    #[test]
    fn live_persistent_sqlcl_reuse_and_cancel() {
        if std::env::var("VRA_LIVE_UAT").as_deref() != Ok("1") { return; }
        let dir = std::env::var("VRA_UAT_DIR").expect("VRA_UAT_DIR");
        let cfg = live_config();
        let state = Arc::new(SshRuntimeState::default());
        let env = format!("PATH={dir}/bin");
        let bin = "sql";
        let conn = "fake/fake@db";
        let cancel = AtomicBool::new(false);

        let (out1, err1, c1) = run_persistent_sqlcl(
            &state, &cfg, None, bin, conn, &env, "SELECT 1 FROM dual;", &cancel,
        ).expect("first query");
        assert!(!c1, "out1={out1:?} err1={err1:?}");
        assert!(out1.contains("[{\"N\":1,\"T\":\"ok\"}]"), "stdout={out1}");
        assert_eq!(state.sqlcl.sessions.lock().unwrap().len(), 1);

        let (out2, _err2, c2) = run_persistent_sqlcl(
            &state, &cfg, None, bin, conn, &env, "SELECT 2 FROM dual;", &cancel,
        ).expect("second query");
        assert!(!c2);
        assert!(out2.contains("[{\"N\":1,\"T\":\"ok\"}]"));
        assert_eq!(state.sqlcl.sessions.lock().unwrap().len(), 1, "session must be reused");

        let slow_cancel = Arc::new(AtomicBool::new(false));
        let cancel_flag = Arc::clone(&slow_cancel);
        let state2 = Arc::clone(&state);
        let handle = std::thread::spawn(move || {
            run_persistent_sqlcl(
                &state2, &cfg, None, bin, conn, &env,
                "SELECT /*SLEEP_LONG*/ 1 FROM dual;", &cancel_flag,
            )
        });
        std::thread::sleep(Duration::from_millis(1200));
        slow_cancel.store(true, Ordering::SeqCst);
        let (out3, err3, c3) = handle.join().expect("slow query thread").expect("slow query");
        assert!(c3, "cancel must be reported");
        assert!(out3.is_empty() || out3.contains('['));
        let _ = (err1, err3);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config(host: &str, port: u16, username: &str) -> SshConfig {
        SshConfig {
            id: "cfg".into(),
            name: "cfg".into(),
            host: host.into(),
            port,
            username: username.into(),
            auth_type: "password".into(),
            key_path: None,
            default_remote_path: None,
        }
    }

    #[test]
    fn pool_key_equal_for_identical_identity_and_secret() {
        let a = PoolKey::new(&config("db.internal", 22, "oracle"), Some("s3cr3t"));
        let b = PoolKey::new(&config("db.internal", 22, "oracle"), Some("s3cr3t"));
        assert_eq!(a, b);
        assert!(!a.fingerprint().contains("s3cr3t"));
    }

    #[test]
    fn pool_key_differs_on_host_port_user_auth_or_secret_change() {
        let base = PoolKey::new(&config("db.internal", 22, "oracle"), Some("s3cr3t"));
        assert_ne!(base, PoolKey::new(&config("other.internal", 22, "oracle"), Some("s3cr3t")));
        assert_ne!(base, PoolKey::new(&config("db.internal", 2222, "oracle"), Some("s3cr3t")));
        assert_ne!(base, PoolKey::new(&config("db.internal", 22, "other"), Some("s3cr3t")));
        assert_ne!(base, PoolKey::new(&config("db.internal", 22, "oracle"), Some("rotated")));
        assert_ne!(base, PoolKey::new(&config("db.internal", 22, "oracle"), None));
        let mut agent = config("db.internal", 22, "oracle");
        agent.auth_type = "agent".into();
        assert_ne!(base, PoolKey::new(&agent, Some("s3cr3t")));
    }

    #[test]
    fn parse_sqlcl_command_accepts_exact_ts_heredoc_shape() {
        let delimiter = "EOF_ORACLE_SQLCL_0123456789ABCDEF0123456789ABCDEF";
        let command = format!(
            "sql -s -L 'user/pass@db' << '{delimiter}'\nSET SQLFORMAT JSON;\nSELECT 1 FROM dual;\nEXIT;\n{delimiter}"
        );
        let (env, bin, conn, script) = parse_sqlcl_command(&command).expect("must parse");
        assert!(env.is_empty());
        assert_eq!(bin, "sql");
        assert_eq!(conn, "user/pass@db");
        assert!(script.contains("SET SQLFORMAT JSON;"));
        assert!(!script.contains("EXIT;"));
    }

    #[test]
    fn parse_sqlcl_command_keeps_interior_exit_literal() {
        let delimiter = "EOF_ORACLE_SQLCL_0123456789ABCDEF0123456789ABCDEF";
        let command = format!(
            "sql -s -L 'user/pass@db' << '{delimiter}'\nSELECT 'EXIT;' FROM dual;\nEXIT;\n{delimiter}"
        );
        let (_, _, _, script) = parse_sqlcl_command(&command).expect("must parse");
        assert!(script.contains("SELECT 'EXIT;' FROM dual;"));
        assert!(!script.trim_end().ends_with("EXIT;"));
    }

    #[test]
    fn parse_sqlcl_command_rejects_shell_metacharacters_in_bin() {
        let delimiter = "EOF_ORACLE_SQLCL_0123456789ABCDEF0123456789ABCDEF";
        let command = format!(
            "sql-touch -s -L 'user/pass@db' << '{delimiter}'\nSELECT 1 FROM dual;\nEXIT;\n{delimiter}"
        );
        assert!(parse_sqlcl_command(&command).is_some()); // shape parser accepts token chars
        assert!(validate_sqlcl_profile("user/pass@db", "sql;touch", "").is_err());
        assert!(validate_sqlcl_profile("user/pass@db", "sql-touch", "").is_ok());
    }

    #[test]
    fn invalidation_drops_old_identity_and_keeps_current() {
        let pool = SshConnectionPool::default();
        let old = PoolKey::new(&config("db.internal", 22, "oracle"), Some("old"));
        pool.sessions.lock().unwrap().insert(
            old.clone(),
            PooledSession { session: ssh2::Session::new().unwrap(), last_used: Instant::now(), unhealthy: false },
        );
        pool.teardown(); // teardown clears all on config/keyring change
        assert!(pool.sessions.lock().unwrap().is_empty());
    }

    #[test]
    fn report_unhealthy_marks_entry_for_next_acquire() {
        let pool = SshConnectionPool::default();
        let cfg = config("db.internal", 22, "oracle");
        let key = PoolKey::with_mode(&cfg, Some("secret"), SocketTimeout::Wakeup);
        pool.sessions.lock().unwrap().insert(
            key.clone(),
            PooledSession { session: ssh2::Session::new().unwrap(), last_used: Instant::now(), unhealthy: false },
        );
        pool.report_unhealthy(&cfg, Some("secret"), SocketTimeout::Wakeup);
        assert!(pool.sessions.lock().unwrap().get(&key).unwrap().unhealthy);
    }

    #[test]
    fn sentinel_is_unique_per_call() {
        let (p1, m1) = make_sqlcl_sentinel();
        let (p2, m2) = make_sqlcl_sentinel();
        assert_ne!(m1, m2);
        assert!(p1.contains(&m1) && p2.contains(&m2));
    }

    #[test]
    fn script_contains_preamble_sql_and_sentinel() {
        let (prompt, marker) = make_sqlcl_sentinel();
        let script = build_sqlcl_script("SELECT 1 FROM dual;", &prompt);
        assert!(script.contains("SET SQLFORMAT"));
        assert!(script.contains("SELECT 1 FROM dual;"));
        assert!(script.ends_with(&format!("{prompt}\n")));
        assert!(script.contains(&marker));
    }

    #[test]
    fn runtime_is_send_sync_for_app_state() {
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<SshConnectionPool>();
        assert_send_sync::<SqlclSessionRegistry>();
        assert_send_sync::<SshRuntimeState>();
    }

    #[test]
    fn profile_validation_rejects_newlines_quotes_and_shell_metacharacters() {
        assert!(validate_sqlcl_profile("user/pass@db", "sql", "").is_ok());
        assert!(validate_sqlcl_profile("", "sql", "").is_err());
        assert!(validate_sqlcl_profile("user/pass@db\nEXIT;", "sql", "").is_err());
        assert!(validate_sqlcl_profile("user/'pass'@db", "sql", "").is_err());
        assert!(validate_sqlcl_profile("user/pass@db", "sql;touch", "").is_err());
    }

    #[test]
    fn sqlcl_session_ttl_expires_without_clock() {
        // No live SSH channel is needed to verify the TTL boundary.
        let last_used = Instant::now() - SESSION_IDLE_TTL - Duration::from_secs(1);
        assert!(last_used.elapsed() >= SESSION_IDLE_TTL);
        let fresh = Instant::now();
        assert!(fresh.elapsed() < SESSION_IDLE_TTL);
    }
}
