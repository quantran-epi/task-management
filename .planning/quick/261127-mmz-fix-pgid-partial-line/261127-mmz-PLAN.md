---
phase: 261127-mmz
plan: 01
type: execute
subsystem: ssh
tags: [rust, ssh2, pty, sqlcl, pgid, indexeddb-independent]
wave: 1
depends_on: []
files_modified:
  - src-tauri/src/ssh_pool.rs
  - .planning/STATE.md
  - .planning/quick/261127-mmz-fix-pgid-partial-line/261127-mmz-SUMMARY.md
autonomous: true
requirements: []
user_setup: []
must_haves:
  truths:
    - "Dòng TASKMATE_PGID bị chia nhỏ qua nhiều wakeup timeout 250ms vẫn cho ra đúng PGID"
    - "Byte partial sau wakeup không bị mất; buffer chỉ clear sau một lần parse trên dòng đã hoàn chỉnh"
    - "Buffer pending ở EOF vẫn được parse trước khi thoát vòng lặp"
    - "Khi hết attempt hoặc read lỗi thật, Err string chứa đoạn pending đã cắt 8 KiB trên char boundary"
    - "Contract marker SQLcl, Cancel/TTL kill theo PGID, inactivity drain và TS không đổi; không thêm dependency"
  artifacts:
    - path: src-tauri/src/ssh_pool.rs
      provides: "Helper scan PGID thuần túy nhận scripted read outcomes; vòng scan trong SqlclSession::start dùng helper đó"
      exports: []
    - path: .planning/STATE.md
      provides: "1 row quick task, 1 dòng last activity, 1 decision, 1 performance row, frontmatter timestamp"
    - path: .planning/quick/261127-mmz-fix-pgid-partial-line/261127-mmz-SUMMARY.md
      provides: "Summary quick task theo template, có RED/GREEN evidence và commit ledger"
  key_links:
    - from: "SqlclSession::start (ssh_pool.rs:258-279)"
      to: "read_sqlcl_pgid"
      via: "iterator repeat_with().take(10) gọi reader.read_line, trả (chunk, status)"
      pattern: "read_sqlcl_pgid|SqlclPgidReadStatus"
    - from: "read_sqlcl_pgid"
      to: "scan_sqlcl_pgid_line + sqlcl_error_diagnostics"
      via: "parse buffer mỗi attempt; diagnostic bounded khi trả Err"
      pattern: "scan_sqlcl_pgid_line|sqlcl_error_diagnostics"
---

<objective>
Sửa lỗi mất byte partial khi scan PGID trong `SqlclSession::start`: `line.clear()` ở đầu vòng `for _ in 0..10` (hiện tại `src-tauri/src/ssh_pool.rs:264`) xóa các byte mà `BufRead::read_line` đã ghi vào buffer trước một wakeup timeout 250ms. Dòng `TASKMATE_PGID:<n>` từ `setsid` bị chia qua nhiều lần read nên không bao giờ thành dòng hoàn chỉnh, session báo "Không nhận dạng được PGID..." dù remote process vẫn chạy. Thí nghiệm Rust đã xác nhận byte partial xuất hiện rồi bị mất ở EOF.

Purpose: Lỗi khởi tạo hiếm nhưng làm mọi query sau đó fail. Áp dụng đúng discipline đã có ở `run_script` (comment `ssh_pool.rs:348-349`): wake-up timeout chỉ là poll tick, byte đã đọc phải giữ lại, chỉ clear sau một dòng hoàn chỉnh đã được thử parse.

Output: `src-tauri/src/ssh_pool.rs` với helper scan PGID test được bằng scripted read outcomes + test RED/GREEN; `.planning/STATE.md` + SUMMARY cập nhật. Không đụng TS, không dependency mới, không merge/push.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md

Facts đã xác nhận, KHÔNG research lại:
- `src-tauri/src/ssh_pool.rs:258-279`: vòng scan PGID nằm gọn trong block `let pgid = { ... }?` của `SqlclSession::start`; 10 attempt; `line.clear()` đứng đầu vòng; `Err(e) if is_wakeup_timeout(&e) => continue`; `Ok(0) => break`; không parse buffer ở EOF; lỗi không tìm thấy là `Err("Không nhận dạng được PGID của phiên SQLcl.")`.
- `is_wakeup_timeout` tại `:47-53` gồm `TimedOut | WouldBlock | Interrupted`; socket mode của pool là `SocketTimeout::Wakeup` (250ms) qua `SqlclKey::new` tại `:209-216`.
- `run_script` tại `:347-405` đã làm đúng: giữ `line` qua wakeup, parse ở EOF trước `clear`, đưa `sqlcl_error_diagnostics(&output, &line)` vào mọi Err.
- `scan_sqlcl_pgid_line` tại `:628-638` là pure helper: strip ANSI + prompt, trim, `strip_prefix(crate::tool_cancel::PGID_LINE_PREFIX)`, parse `u32`. Giữ nguyên.
- `sqlcl_error_diagnostics` tại `:500-514`: join output + pending đã strip ANSI/prompt, cắt tail 8 KiB (`MAX_SQLCL_ERROR_DIAGNOSTICS_BYTES`) trên `is_char_boundary`. Dùng lại được với output rỗng.
- `PGID_LINE_PREFIX` và `build_remote_command` nằm ở `src-tauri/src/tool_cancel.rs`; kế thừa, không sửa.
- Test module `#[cfg(test)] mod tests` bắt đầu `:803`; existing `scan_sqlcl_pgid_line_after_prompt_and_ansi` tại `:1010-1016` phải vẫn pass.

Quy ước: broad-read `ssh_pool.rs` một lần rồi Edit ngay, KHÔNG re-read đoạn vừa đọc; identifier/đường dẫn/lệnh giữ nguyên; tiếng Việt, xưng sếp khi trao đổi; chạy scoped `cargo test`, KHÔNG chạy `npm test` (>1 giờ); không live SSH; `.gsd/dispatch-isolation-sentinel.json` đang modified sẵn, không stage/commit.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Tách vòng scan PGID thành helper test được, giữ partial qua wakeup, đưa diagnostic vào Err</name>
  <files>src-tauri/src/ssh_pool.rs, .planning/STATE.md, .planning/quick/261127-mmz-fix-pgid-partial-line/261127-mmz-SUMMARY.md</files>
  <behavior>
    - Test 1 (REGRESSION): script `[("TASKMATE_PGID:", Wakeup), ("42", Wakeup), ("42\n", Line)]`, limit 3 → `Ok(4242)`. Implementation cũ clear giữa hai wakeup → thất bại.
    - Test 2: `[("TASKMATE_PGID:", Wakeup), ("9", Eof)]` → `Ok(9)`; và `[("TASKMATE_PGID:9", Wakeup), ("", Eof)]` → `Ok(9)`. Buffer pending được parse trước khi break ở EOF.
    - Test 3: `[("banner TASKMATE_PGID:77\n", Line), ("TASKMATE_PGID:", Wakeup), ("8\n", Line)]` → `Ok(8)`; dòng banner không khớp bị clear, không để lại byte cũ.
    - Test 4: 12 bước Wakeup mang chunk unicode + `ORA-00942`, limit 10 → Err chứa "Không nhận dạng được PGID" và "ORA-00942", tail ≤ `MAX_SQLCL_ERROR_DIAGNOSTICS_BYTES`, cắt trên char boundary. Trường hợp `Failed("boom")` kèm pending → Err chứa cả "boom" lẫn pending.
    - Test 5: `scan_sqlcl_pgid_line` giữ nguyên; test ANSI/prompt cũ tại `:1010-1016` vẫn pass.
  </behavior>
  <action>
    Bước 1 — extract, CHƯA đổi hành vi (để có RED bằng assertion failure thay vì compile error). Trong `src-tauri/src/ssh_pool.rs`, định nghĩa enum `SqlclPgidReadStatus` với 4 variant: `Line` (`read_line` trả `Ok(n>0)`), `Eof` (`Ok(0)`), `Wakeup` (wakeup timeout), `Failed(String)` (lỗi read thật, đã `to_string`). Thêm helper thuần túy `read_sqlcl_pgid<I>(outcomes: I) -> Result<u32, String> where I: IntoIterator<Item = (String, SqlclPgidReadStatus)>`: với mỗi `(chunk, status)` thì clear buffer ở đầu vòng, push chunk vào buffer, parse bằng `scan_sqlcl_pgid_line`, `Line` → tiếp tục, `Eof` → break, `Wakeup` → continue, `Failed(e)` → `Err("Đọc PGID SQLcl thất bại: {e}")`; hết iterator → `Err("Không nhận dạng được PGID của phiên SQLcl.")`. Thay block PGID trong `SqlclSession::start` bằng `read_sqlcl_pgid(std::iter::repeat_with(|| { let mut chunk = String::new(); map kết quả reader.read_line(&mut chunk) thành (chunk, status) }).take(10))?`; giữ đúng 10 attempt và `drain_sqlcl_prefix(&mut reader)` ngay sau đó. Chưa sửa gì khác.

    Bước 2 — RED: thêm 4 test mới trong `mod tests` gần test PGID hiện có, dùng Vec scripted `(String, SqlclPgidReadStatus)` theo đúng 4 case test mới ở khối behavior phía trên (case 5 là regression của test ANSI/prompt cũ, không tạo test mới). Không dùng iterator thật, không cần SSH. Chạy lệnh verify; kỳ vọng 4 test mới fail bằng assertion, các test cũ vẫn pass. Ghi lại output failure thật vào SUMMARY sau này.

    Bước 3 — GREEN: sửa `read_sqlcl_pgid` theo discipline của `run_script`: bỏ `line.clear()` ở đầu vòng; `line.push_str(&chunk)` rồi parse buffer TÍCH LŨY ngay trên MỌI attempt, kể cả `Wakeup` và trước khi `Eof` break; chỉ `line.clear()` trong nhánh `Line` SAU khi parse thất bại; `Wakeup` giữ nguyên buffer. Thêm helper thuần túy `sqlcl_pgid_error(message: &str, pending: &str) -> String`: gọi `sqlcl_error_diagnostics("", pending)`, nếu kết quả trim rỗng thì trả nguyên `message`, ngược lại trả `format!("{}\n{}", message, diag)`. Dùng helper này cho cả nhánh `Failed` và lỗi hết attempt. Không đổi `scan_sqlcl_pgid_line`, `is_wakeup_timeout`, `sqlcl_error_diagnostics`, marker/cancel/TTL/drain, không thêm hằng số hay dependency.

    Bước 4 — chạy lại lệnh verify cho đến khi xanh (`cargo test --lib ssh_pool::tests` rồi `cargo check --lib`). Sau đó cập nhật `.planning/STATE.md`: 1 row `261127-mmz` trong Quick Tasks Completed, 1 dòng last activity, 1 decision (giải thích clear-chỉ-sau-dòng-hoàn-chỉnh + diagnostic đi qua `redactOracleText`), 1 performance row, frontmatter timestamp. Tạo SUMMARY theo template j35: file changed, commit ledger, lệnh verify + kết quả, RED/GREEN evidence, files intentionally unchanged, threat surface, self-check.

    Không đụng `src/services/ai/oracleSqlclService.ts`, `tool_cancel.rs`, `ssh_service.rs`, `Cargo.toml`, `package.json`. Không stage `.gsd/dispatch-isolation-sentinel.json`.
  </action>
  <verify>
    <automated>cd /Users/admin/working/personal/task-management/.claude/worktrees/oracle-pty-pgid/src-tauri && cargo test --lib ssh_pool::tests && cargo check --lib</automated>
  </verify>
  <done>Targeted `ssh_pool::tests` xanh với test partial-across-wakeup, EOF-pending và diagnostic bound; `cargo check --lib` sạch; PGID vẫn parse đúng sau ANSI/prompt; Err có pending bounded; STATE + SUMMARY có đủ ledger; không merge/push.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| remote PTY stdout → PGID scan | Dòng `setsid` đi từ process remote qua SSH/PTY, chịu chia gói và timeout 250ms; không được tự ý tin là PGID |
| Err string → stderr → TS `redactOracleText` | Diagnostic từ buffer pending đi vào Err rồi tới bubble/AI; phải bounded và an toàn UTF-8 |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-261127-mmz-01 | Tampering | `read_sqlcl_pgid` / `scan_sqlcl_pgid_line` | high | mitigate | Chỉ grant kill authority khi buffer tích lũy khớp trọn vẹn prefix `TASKMATE_PGID:` sau strip ANSI/prompt và parse `u32`; banner, bare number và payload chứa marker substring bị loại; test 1-3 pin. |
| T-261127-mmz-02 | Information disclosure | Err string → stderr → `redactOracleText` | medium | mitigate | Diagnostic pending đi qua `sqlcl_error_diagnostics("", pending)`, tail 8 KiB cắt trên char boundary; không log raw PTY vô hạn; TS vẫn redact connection string như thiết kế cũ. |
| T-261127-mmz-03 | DoS | Buffer tích lũy qua wakeup liên tiếp | low | mitigate | Giữ nguyên cap 10 attempt từ `start` (mỗi attempt tối đa một wakeup tick); buffer chỉ clear trên dòng hoàn chỉnh; không thêm vòng lặp hay thread mới. |
| T-261127-mmz-SC | Tampering | package installs | low | accept | Không có lệnh cài npm/cargo/package trong quick task này. |
</threat_model>

<verification>
1. Từ worktree root: `cd src-tauri && cargo test --lib ssh_pool::tests` — exit 0, mọi test cũ + 4 test mới pass; RED trước đó phải là assertion failure thật, không phải compile error hay zero-test discovery.
2. `cd src-tauri && cargo check --lib` — exit 0, không warning/error mới.
3. `git diff --check` trên diff của task — sạch; `git status --short` không cho thấy file ngoài 3 files_modified (riêng `.gsd/dispatch-isolation-sentinel.json` đã modified từ trước, không stage).
4. Không chạy `npm test` (quy ước dự án >1 giờ), không live SSH/SQLcl, không merge/push. Nếu muốn non-regression TS: `npx vitest run src/services/ai/__tests__/oracleSqlclService.test.ts --bail=1` — tùy chọn, không bắt buộc vì không đổi TS.
</verification>

<success_criteria>
- PGID được nhận dạng dù dòng bị chia qua nhiều wakeup timeout hoặc không có newline ở EOF.
- Byte partial chỉ bị clear sau một lần parse trên dòng hoàn chỉnh; banner/stale line không contaminate lần scan sau.
- Mọi Err của PGID scan kèm diagnostic pending bounded 8 KiB, cắt đúng char boundary; TS redact vẫn áp dụng.
- `cargo test --lib ssh_pool::tests` + `cargo check --lib` xanh; STATE/SUMMARY ghi đủ; không dependency, không merge/push.
</success_criteria>

<output>
Tạo `.planning/quick/261127-mmz-fix-pgid-partial-line/261127-mmz-SUMMARY.md` khi hoàn tất.
</output>
