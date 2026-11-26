---
phase: quick
plan: 261126-vra
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/src/ssh_session_pool.rs
  - src-tauri/src/ssh_service.rs
  - src-tauri/src/lib.rs
  - src-tauri/src/tool_cancel.rs
  - src-tauri/src/ssh_pty_service.rs
  - src-tauri/src/agent_manager.rs
  - src/services/sshService.ts
  - src/services/ai/oracleSqlclService.ts
  - src/services/ai/__tests__/oracleSqlclService.test.ts
autonomous: true
requirements:
  - SSH-POOL-SQLCL-PERSIST
user_setup: []
must_haves:
  truths:
    - "Một Tauri command SSH bình thường (list/read/write/exec) tái dùng ssh2::Session theo (host, port, user, auth fingerprint); channel mới mỗi lần gọi, không TCP/handshake lại"
    - "SQLcl chạy thường trú trên remote qua SSH, mỗi query gửi preamble đầy đủ + PROMPT sentinel riêng, đọc đến sentinel rồi trả kết quả; không EXIT giữa chừng"
    - "Hủy theo callId vẫn trả finishReason='cancelled' qua cancel_tool_call; broken pipe tự tạo lại session một lần; mỗi session SQLcl serialize bằng lock"
    - "Đổi cấu hình/keyring hoặc thoát app thì invalidate/đóng mọi session; TTL nhàn rỗi dọn session cũ; health check trên acquire"
    - "Guardrail SQL reads-only, single-statement, directive-block và redact không đổi; harness/test scoped xanh, không chạy full vitest"
  artifacts:
    - path: src-tauri/src/ssh_session_pool.rs
      provides: "Registry duy nhất chứa SSH session pool + SQLcl persistent sessions + cancel map + janitor"
      exports: ["SshSessionRegistry", "sqlcl_execute", "sqlcl_cancel", "ssh_invalidate_pool", "cleanup_on_exit"]
    - path: src-tauri/src/ssh_service.rs
      provides: "connect_fresh thô và 3 wrapper acquire từ pool; vẫn giữ nguyên tool contract"
      contains: "connect_fresh"
    - path: src-tauri/src/lib.rs
      provides: "Đăng ký module, manage Arc registry, register command, teardown trên ExitRequested"
      contains: "ssh_session_pool"
    - path: src/services/sshService.ts
      provides: "Gọi ssh_invalidate_pool sau saveSshConfig/deleteSshConfig"
      contains: "ssh_invalidate_pool"
    - path: src/services/ai/oracleSqlclService.ts
      provides: "runSqlclScriptOverSsh gọi sqlcl_execute, bỏ EXIT; giữ nguyên guardrail"
      contains: "sqlcl_execute"
  key_links:
    - from: src-tauri/src/ssh_service.rs
      to: src-tauri/src/ssh_session_pool.rs
      via: "connect_and_auth* -> SshSessionRegistry::global().acquire_shared(...)"
      pattern: "SshSessionRegistry::global\\(\\)"
    - from: src-tauri/src/tool_cancel.rs
      to: src-tauri/src/ssh_session_pool.rs
      via: "cancel_tool_call fallback sang cancel_sqlcl_call khi callId không thuộc ToolTaskRegistry"
      pattern: "cancel_sqlcl_call"
    - from: src/services/sshService.ts
      to: Tauri command ssh_invalidate_pool
      via: "invoke('ssh_invalidate_pool') sau khi lưu/xóa config hoặc secret"
      pattern: "ssh_invalidate_pool"
    - from: src/services/ai/oracleSqlclService.ts
      to: Tauri command sqlcl_execute
      via: "invoke('sqlcl_execute', { config, secret, profileId, connectionString, script, callId })"
      pattern: "sqlcl_execute"
---

<objective>
Đưa SSH session pool và SQLcl persistent session vào chung một registry trong Tauri AppState, giảm handshake lặp lại và giữ kết nối Oracle sống giữa các query.

Purpose: Mọi SSH tool đang mở TCP + handshake + auth cho từng lần gọi; riêng Oracle SQLcl còn spawn lại `sql -s -L` mỗi query. Registry dùng chung giúp tái dùng session, giữ SQLcl stdin/stdout, vẫn hủy được theo callId và đóng sạch khi đổi config/thoát app.

Output: Rust module `ssh_session_pool.rs`, wiring trong `lib.rs`/`ssh_service.rs`, bridge cancel, invalidate từ TS, TS gọi lệnh mới, test scoped.

Ranh giới cứng (KHÔNG vượt):
- Không spawn process host mới: cấm `std::process::Command`, `tokio::process::Command`, hay bất kỳ local process API mới. SQLcl là remote process qua SSH (cơ chế hiện có), chỉ giữ channel sống.
- Không thêm local FS API, không thêm dependency Cargo/npm, không daemon/MCP server.
- Files bị session khác đang merge: tuyệt đối không đụng `e2e/aiChatSettings.spec.ts`, `src/services/ai/aiTools.ts`, `src/services/ai/aiOrchestratorLoop.ts`, `src/services/ai/types.ts`, `src/services/ai/imageGenerationClient.ts`, `src/utils/documentImageResolver.ts`, `src/utils/dynamicFileSandbox.ts`, `src/utils/fileExport.ts`, `src/utils/pptxExport.ts`, `src/components/ai/AIChatDrawer.tsx`.
- Trước khi sửa, nếu `git status --short` hiện file nào trong `files_modified` đang bị tiến trình khác ghi, DỪNG và báo orchestrator thay vì đè lên.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

Hiện trạng đã xác nhận:
- `ssh_service.rs`: `connect_and_auth*` (dòng ~94-223) tạo `TcpStream`, handshake, auth rồi trả `ssh2::Session`; ~13 call site trong `ssh_service.rs`, `tool_cancel.rs`, `agent_diff_ops.rs`, `agent_manager.rs`, `ssh_pty_service.rs`.
- `ssh2::Session` là `Clone` dùng chung `Arc<Mutex<SessionInner>>`; mọi I/O trên các channel cùng Session bị khóa chung. Nên: channel ngắn hạn mượn session chung (clone); PTY, ghost-dev và SQLcl (reader chạy dài, PTY đổi `set_blocking(false)`) phải mượn **exclusive** session (bị remove khỏi pool, không trả lại). Đây là hệ quả của libssh2, không phải thu hẹp D-01.
- `tool_cancel.rs`: `ToolTaskRegistry` giữ token `Arc<AtomicBool>` theo callId, `cancel_tool_call` trả `bool`, reader trả `finish_reason='cancelled'` và `exit_status=-1`; `build_remote_command` base64 payload → không interpolation shell.
- `oracleSqlclService.ts`: `runSqlclScriptOverSsh` (dòng ~621-665) dựng `${sqlclBin} -s -L '<cs>' << '<random delim>'\n${script}\nEXIT;\n<delim>` rồi gọi `execRemoteCommand`; mọi script đều đã có preamble `SET ...`; guardrail `assertSqlclSingleStatement`, `assertReadOnlyQuery`, `applyQueryLimit`, `redactOracleText`, `detectRemoteFailure` nằm ở các call site, không đổi.
- `sshService.ts`: `saveSshConfig` (dòng ~39-72) ghi config + keyring; `deleteSshConfig` (dòng ~75-88) xóa config + keyring. Đây là hai điểm duy nhất đổi SSH config/secret → nơi gọi invalidate.
- Test hiện tại `src/services/ai/__tests__/oracleSqlclService.test.ts:315-333` khẳng định heredoc delimiter; phải cập nhật sang payload lệnh mới.
- `security_enforcement: true` → mọi task giữ threat model dưới đây.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Registry SSH/SQLcl + lệnh Tauri mới (D-01, D-02, D-03)</name>
  <files>src-tauri/src/ssh_session_pool.rs, src-tauri/src/lib.rs, src-tauri/src/ssh_service.rs</files>
  <behavior>
    - PoolKey bằng (host, port, username, fingerprint, mode); fingerprint băm host/port/user/authType/keyPath/secret bằng DefaultHasher, secret không bao giờ lưu plaintext hay đưa vào error/log.
    - acquire_shared clone session đã auth; nếu quá TTL hoặc keepalive_send() lỗi thì drop rồi connect_fresh lại; mỗi lần mượn cập nhật last_used.
    - acquire_exclusive remove entry khỏi pool trả session riêng cho PTY/ghost-dev/SQLcl.
    - invalidate_all xóa pool + SQLcl + cancel map; janitor chạy định kỳ TTL/2 dọn entry nhàn rỗi và đóng channel.
    - sqlcl_execute tạo/lấy session theo profile key, ghi script + newline + `PROMPT TASKMATE_SQLCL_DONE_<uuid hex>` unique, đọc stdout đến dòng sentinel chính xác, bỏ dòng sentinel, trả CommandOutput với exitStatus 0; stderr đọc luồng riêng có cap 2MB.
    - sqlcl_cancel(callId) flip token + `channel.eof()` qua clone; trả false nếu callId không live (idempotent); transaction read-only nên retry 1 lần khi broken pipe là an toàn.
    - Unit test thuần Rust (không SSH thật): key đổi khi host/user/secret đổi; TTL đánh dấu stale; cancel map flip token theo callId và là no-op với id lạ; sinh sentinel không trùng script.
  </behavior>
  <action>
    Tạo module mới `src-tauri/src/ssh_session_pool.rs`. Định nghĩa `pub(crate) enum SocketMode { Interactive, Wakeup, None }`, `PoolKey { host, port, username, fingerprint: u64, mode: SocketMode }`, `SshSessionRegistry` với mutex: `pool: HashMap<PoolKey, PooledSession { session: ssh2::Session, last_used: Instant }>`, `sqlcl: HashMap<ProfileKey, Arc<std::sync::Mutex<SqlclSession>>>`, `calls: HashMap<String, CallHandle>`, và cờ generation cho invalidate. `SshSessionRegistry::global()` dùng `std::sync::OnceLock<Arc<Self>>` khởi tạo lazily và spawn 1 janitor thread; `run()` trong `lib.rs` gọi `global()` rồi `.manage(Arc::clone(...))` để AppState và free function cùng một instance (D-03: một registry, không static riêng thứ hai).

    Trong `ssh_service.rs` đổi `SocketTimeout` thành `pub(crate) SocketMode` (hoặc re-export) và tách phần TCP/handshake/auth hiện tại thành `pub(crate) fn connect_fresh(config: &SshConfig, secret: Option<&str>, mode: SocketMode) -> Result<ssh2::Session, String>` — giữ nguyên 10s TCP timeout, 30s interactive, 250ms wakeup, ba nhánh password/key_file/agent và mọi message tiếng Việt. Ba wrapper `connect_and_auth*` giữ signature cũ, chỉ delegate sang `SshSessionRegistry::global().acquire_shared(config, secret, mode)` (D-01). Thêm `connect_and_auth_dedicated(config, secret)` gọi `acquire_exclusive` cho consumer dài hạn. Registry gọi lại `crate::ssh_service::connect_fresh` — tránh đệ quy.

    `ProfileKey` = hash của profileId + connectionString + sqlclPath + envVars để đổi kết nối tự invalidates session cũ. `sqlcl_execute` là `#[tauri::command] async` → `spawn_blocking`, lấy `Arc<Mutex<SqlclSession>>` theo ProfileKey rồi giữ lock suốt một query (serialize per session theo D-02). Session chuyên biệt mở bằng `connect_fresh(..., SocketMode::Wakeup)` rồi `channel_session()`, `channel.exec(&build_remote_command(&format!("{} -s -L '{}'", sqlclBin, connectionString)))`. `build_remote_command` base64 nên connectionString không bao giờ thành shell fragment mới; vẫn reject `\r\n` và `'` như TS hiện tại. Ghi script đã strip `EXIT;` + `\nPROMPT <sentinel>\n` qua `channel.write_all`; reader vòng lặp đọc chunk, check token mỗi 250ms, tích lũy stdout, so sánh từng dòng trim với sentinel, dừng đúng dòng đó. stdout cap 2MB, stderr thread riêng cap 2MB. Broken pipe/EOF trước sentinel: remove session, tạo lại một lần, gửi lại script; lỗi lần 2 trả `CommandOutput { finish_reason: "error", exit_status: -1 }`. Khi cancel: trả `finish_reason: "cancelled"`, `exit_status: -1` giống tool_cancel; luôn remove CallHandle và cập nhật last_used.

    Trong `lib.rs`: thêm `mod ssh_session_pool;`, `.manage(...)`, register `ssh_session_pool::sqlcl_execute`, `ssh_session_pool::sqlcl_cancel`, `ssh_session_pool::ssh_invalidate_pool`, và trong nhánh `RunEvent::ExitRequested` gọi `ssh_session_pool::cleanup_on_exit(&registry)` ngay sau `tool_cancel::cleanup_on_exit` để đóng channel + clear map (D-03 explicit teardown). Không thêm `std::process::Command` nào.

    Unit test đặt ngay `#[cfg(test)] mod tests` trong module mới; không nối mạng, không cần live SSH.
  </action>
  <verify>
    <automated>cd /Users/tranducquan/Working/Personal/task-management/src-tauri && cargo test --lib ssh_session_pool -- --nocapture && cargo check</automated>
  </verify>
  <done>cargo test --lib ssh_session_pool xanh; cargo check sạch; ba wrapper SSH vẫn trả cùng kiểu `ssh2::Session` nên mọi tool contract cũ biên dịch không đổi; không có process spawn/local FS API mới.</done>
</task>

<task type="auto">
  <name>Task 2: Chuyển consumer dài hạn sang exclusive session + bridge cancel (D-01, D-03)</name>
  <files>src-tauri/src/ssh_pty_service.rs, src-tauri/src/agent_manager.rs, src-tauri/src/tool_cancel.rs</files>
  <action>
    Trong `ssh_pty_service.rs` (dòng ~60) và `agent_manager.rs` (dòng ~374), thay `connect_and_auth` bằng `connect_and_auth_dedicated`: PTY gọi `session.set_blocking(false)` nên không được chia session chung; ghost-dev giữ channel reader chạy dài nên blocking read của nó không được khóa các tool khác. Không đổi logic hay event nào khác.

    Trong `tool_cancel.rs`, tại `pub fn cancel_tool_call` (dòng ~653-660): giữ nguyên `registry.cancel(&call_id)?` trước; nếu kết quả `false`, fallback `crate::ssh_session_pool::cancel_sqlcl_call(&call_id)` rồi trả kết quả đó. Test `cancelling_unknown_call_is_a_noop` vẫn phải trả false cho id lạ. Không sửa `run_cancellable_remote_command`, `ToolTaskRegistry`, `build_remote_command`, hay logic PGID.

    D-01: mọi SSH tool giờ đi qua registry (shared cho one-shot, exclusive cho dài hạn). D-03: cancel có một cổng `cancel_tool_call` cho frontend, không thêm command công khai mới cho cancel.
  </action>
  <verify>
    <automated>cd /Users/tranducquan/Working/Personal/task-management/src-tauri && cargo test --lib tool_cancel -- --nocapture && cargo check</automated>
  </verify>
  <done>Test tool_cancel cũ xanh nguyên vẹn (id lạ → false); PTY/ghost-dev dùng session riêng, không còn chia mutex I/O với tool ngắn hạn; cancel SQLcl đi cùng cổng cancel_tool_call.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Invalidate trên đổi config + TS gọi sqlcl_execute (D-01, D-02)</name>
  <files>src/services/sshService.ts, src/services/ai/oracleSqlclService.ts, src/services/ai/__tests__/oracleSqlclService.test.ts</files>
  <behavior>
    - saveSshConfig/deleteSshConfig vẫn lưu/xóa config + keyring như cũ, rồi gọi `ssh_invalidate_pool` (best-effort; lỗi invalidate không làm hỏng việc lưu config).
    - runSqlclScriptOverSsh vẫn resolve profile SSH/secret, vẫn reject newline trong connectionString/sqlclPath/envVars và dấu `'` trong connectionString.
    - Gọi invoke('sqlcl_execute') với payload gồm config, secret, profileId (config.sshConfigId + hash connectionString), connectionString, sqlclPath, envVars, script đã strip `EXIT;` ở cuối, callId.
    - Không còn heredoc delimiter, không còn `EXIT;` do TS phát ra; PROMPT sentinel do Rust phát ra với random riêng mỗi call.
    - Mọi guardrail hiện hữu (single-statement, read-only, limit, object type, redact, detectRemoteFailure) và envelope `{success,data,columns,rows,...}` giữ nguyên.
  </behavior>
  <action>
    Trong `src/services/sshService.ts`, thêm helper nhỏ `invalidateSshPool()` dùng `import('@tauri-apps/api/core')` + `invoke('ssh_invalidate_pool')`, bọc try/catch để lỗi IPC không làm save/delete thất bại. Gọi helper ở cuối `saveSshConfig` (sau cả nhánh store/delete keyring) và `deleteSshConfig` (sau deleteKeyringCredential). Đây là hiện thực D-01 "invalidate when config/keyring changes" — secret SSH chỉ đổi qua hai hàm này. Không đổi chữ ký, kiểu trả, hay thứ tự ghi Dexie/keyring.

    Trong `src/services/ai/oracleSqlclService.ts`, chỉ sửa `runSqlclScriptOverSsh` (dòng ~621-665): giữ nguyên phần validate sshConfigId/connectionString/newline/quote; thay việc dựng heredoc bằng một hàm nhỏ `stripTrailingSqlclExit(script)` (xóa dòng `EXIT;` cuối cùng kể cả khoảng trắng/semicolon) rồi `invoke('sqlcl_execute', { config: targetSsh, secret: secret ?? null, profileId: ..., connectionString: config.connectionString, sqlclPath: sqlclBin, envVars: config.envVars ?? '', script: stripped, callId: taskId })`. `taskId` giữ nguyên quy tắc `callId ?? oracle-test-...`. Import `invoke` theo kiểu lazy giống file này đã dùng cho `sshService` (`await import('@tauri-apps/api/core')`), không thêm dependency. Không đụng các script builder/preamble, `assertSqlclSingleStatement`, `assertReadOnlyQuery`, `applyQueryLimit`, `extractOracleError`, `redactOracleText`, `detectRemoteFailure`.

    Trong `src/services/ai/__tests__/oracleSqlclService.test.ts` (test dòng ~315-333), thay khẳng định heredoc bằng: spy `invoke` (hoặc spy module core) nhận lệnh `sqlcl_execute`; kiểm tra payload.script giữ literal `'Alice'`/`'SALES'`, không chứa `EXIT;`, có `SET SQLFORMAT JSON`, và callId được forward. Cập nhật mock của `execRemoteCommand` trong file này nếu cần để phản ánh đường đi mới; giữ các test guardrail/redact/parse cũ xanh. Không chạm `e2e/aiChatSettings.spec.ts`.
  </action>
  <verify>
    <automated>cd /Users/tranducquan/Working/Personal/task-management && npx vitest run src/services/ai/__tests__/oracleSqlclService.test.ts --bail=1 && npx tsc --noEmit --pretty false</automated>
  </verify>
  <done>Test oracleSqlclService scoped xanh, tsc sạch; script gửi sang Rust có preamble đầy đủ nhưng không có `EXIT;`; config/keyring đổi là invalidate pool; không chạy full vitest suite.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| frontend TS → Tauri `sqlcl_execute` | connectionString/sqlclPath/envVars/script/callId do người dùng hoặc model cung cấp, không tin cậy |
| remote SQLcl stdout/stderr → frontend | output thiết bị ngoài, không tin cậy; đi qua parser và redact cũ |
| keyring → pool registry | secret chỉ tồn trong bộ nhớ, fingerprint băm, không log |
| `cancel_tool_call(callId)` | id từ UI/model, có thể trùng/lạ; phải idempotent và không hủy nhầm call khác |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-VRA-01 | Injection | `sqlcl_execute` shell bootstrap | mitigate | Dùng `build_remote_command` base64 cho lệnh `sql -s -L 'cs'`; TS và Rust cùng reject `\r\n`, dấu `'` trong connectionString; không nối chuỗi shell mới |
| T-VRA-02 | Tampering | PROMPT sentinel | mitigate | Sentinel `TASKMATE_SQLCL_DONE_<uuid hex>` sinh riêng mỗi call, kiểm tra script không chứa sentinel, so khớp cả dòng đã trim; user SQL vẫn bị `assertSqlclSingleStatement` chặn `PROMPT` trước khi tới Rust |
| T-VRA-03 | Information disclosure | secret keyring / connectionString | mitigate | Chỉ băm vào fingerprint, không lưu plaintext trong pool key, không đưa vào error/event/log; giữ nguyên `redactOracleText` |
| T-VRA-04 | Spoofing / DoS | cancel theo callId | mitigate | CallHandle map theo callId, flip `Arc<AtomicBool>` + `eof()`, id lạ là no-op, remove handle trên mọi path; session SQLcl serialize bằng mutex riêng |
| T-VRA-05 | Tampering | stale session sau đổi config/keyring | mitigate | ProfileKey gồm hash connectionString/sqlclPath/envVars; `ssh_invalidate_pool` được gọi từ `saveSshConfig`/`deleteSshConfig` (mọi đổi SSH config/secret đi qua đây), xóa pool + SQLcl + cancel map (D-01) |
| T-VRA-06 | Repudiation | untrusted SQLcl output | accept | Output vẫn đi qua `extractOracleError`, `detectRemoteFailure`, `redactOracleText` và guardrail cũ; quick task không mở rộng niềm tin mới |
| T-VRA-SC | Tampering | package installs | accept | Không có npm/Cargo install nào trong plan này; chỉ dùng dependency có sẵn (`ssh2`, `tokio`, `serde`, `@tauri-apps/api`) |
</threat_model>

<verification>
- Rust: `cd /Users/tranducquan/Working/Personal/task-management/src-tauri && cargo test --lib ssh_session_pool -- --nocapture && cargo test --lib tool_cancel -- --nocapture && cargo check`
- TS: `cd /Users/tranducquan/Working/Personal/task-management && npx vitest run src/services/ai/__tests__/oracleSqlclService.test.ts --bail=1 && npx tsc --noEmit --pretty false`
- Kiểm tra tay nhanh bằng grep (không đọc lại file dài): `grep -R 'std::process::Command\|tokio::process::Command' src-tauri/src/ssh_session_pool.rs src-tauri/src/sqlcl* 2>/dev/null` phải rỗng; `git status --short` không hiện file ngoài `files_modified` bị ghi.
- Không chạy `npm test` toàn bộ (quy tắc dự án: >1 giờ).
</verification>

<success_criteria>
- Pool tái dùng `ssh2::Session` theo khóa đã chốt, mỗi lần gọi mở channel mới; nhàn rỗi quá TTL hoặc keepalive lỗi thì tự kết nối lại.
- SQLcl persistent: một session/process remote cho mỗi profile, mỗi query gửi preamble đầy đủ, đọc tới sentinel, không EXIT; cancel theo callId trả `finishReason='cancelled'`; broken pipe restart 1 lần; serialize bằng lock.
- Một registry trong AppState, invalidate khi config/keyring đổi (từ saveSshConfig/deleteSshConfig), dọn theo TTL và đóng sạch lúc ExitRequested.
- Không process spawn host, không local FS API, không dependency mới, không daemon/MCP, không đụng files của session đang merge.
- Scoped Rust tests + Vitest + tsc xanh; tool contract cũ (`CommandOutput`, `cancel_tool_call`, guardrail SQL) không đổi.
</success_criteria>

<output>
Khi xong, ghi `.planning/quick/261126-vra-implement-ssh-connection-pool-persistent/261126-vra-SUMMARY.md` theo template GSD.
</output>
