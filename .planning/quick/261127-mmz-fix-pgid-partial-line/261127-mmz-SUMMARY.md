---
phase: 261127-mmz
plan: 01
subsystem: ssh
tags: [rust, ssh2, pty, sqlcl, pgid, indexeddb-independent]
requires:
  - phase: 261127-hup
    provides: "PTY-backed persistent SQLcl with PGID marker, ANSI/prompt normalization"
  - phase: 261127-j35
    provides: "bounded sqlcl_error_diagnostics helper and idle/drain policy reused here"
provides:
  - "Pure read_sqlcl_pgid helper over scripted read outcomes; partial bytes survive wakeups; PGID granted only on complete line or EOF"
  - "Bounded UTF-8-safe pending diagnostic on every PGID scan Err"
affects: [ssh-pool, persistent-sqlcl, tool-cancel]
actuals:
  tokens: 1832
  tasks: 1
  commits: 7
  plan_head_before: a64d8b02d1503b9a19f978402b67afccec5efa6a
  plan_head_after: 236e732d
tech-stack:
  added: []
  patterns:
    - "Scripted-read pure helper for PTY line scans, tested without SSH"
    - "Poll-tick wakeup keeps partial bytes; grant authority only on completed line/EOF"
key-files:
  created:
    - .planning/quick/261127-mmz-fix-pgid-partial-line/261127-mmz-SUMMARY.md
  modified:
    - src-tauri/src/ssh_pool.rs
    - .planning/STATE.md
key-decisions:
  - "Wakeup 250ms là poll tick: byte đã đọc từ BufReader phải giữ lại, chỉ clear sau dòng hoàn chỉnh không khớp"
  - "Chỉ grant PGID khi buffer kết thúc bằng \\n/\\r hoặc gặp EOF — parse chunk partial có thể cấp nhầm 42 thay vì 4242"
  - "Diagnostic pending đi qua sqlcl_error_diagnostics(\"\", pending), tail 8 KiB cắt char boundary, rồi tới Err/TS redactOracleText"
patterns-established:
  - "Capture scripted read outcomes as (String, Status) then assert pure helper result"
requirements-completed: []
coverage:
  - id: D1
    description: "PGID scan qua helper thuần túy, giữ byte partial qua wakeup, nhận PGID ở dòng hoàn chỉnh hoặc EOF"
    verification:
      - kind: unit
        ref: "src-tauri/src/ssh_pool.rs#read_sqlcl_pgid_keeps_partial_across_wakeups"
        status: pass
      - kind: unit
        ref: "src-tauri/src/ssh_pool.rs#read_sqlcl_pgid_parses_pending_line_at_eof"
        status: pass
      - kind: unit
        ref: "src-tauri/src/ssh_pool.rs#read_sqlcl_pgid_discards_non_matching_line"
        status: pass
    human_judgment: false
  - id: D2
    description: "Err string chứa pending diagnostic bounded, cắt char boundary; Failed(boom) giữ cả lỗi lẫn pending"
    verification:
      - kind: unit
        ref: "src-tauri/src/ssh_pool.rs#read_sqlcl_pgid_error_is_bounded_and_char_safe"
        status: pass
    human_judgment: false
  - id: D3
    description: "Contract marker/ANSI/prompt, 10 attempt, cancel/TTL/drain, TS, dependency không đổi"
    verification:
      - kind: unit
        ref: "src-tauri/src/ssh_pool.rs#marker_and_pgid_detection_still_strip_prompt_and_ansi"
        status: pass
      - kind: unit
        ref: "cargo check --lib"
        status: pass
    human_judgment: false
duration: 21min
completed: 2026-11-27
status: complete
---

# Phase 261127-mmz Plan 01: Fix PGID Partial Line Summary

**Scripted-read PGID scanner giữ byte qua wakeup 250ms, chỉ grant PGID trên dòng hoàn chỉnh/EOF, kèm diagnostic pending bounded 8 KiB**

## Performance

- **Duration:** 21 min
- **Started:** 2026-11-27T09:24:18Z
- **Completed:** 2026-11-27T09:33:02Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 3 (src-tauri/src/ssh_pool.rs, .planning/STATE.md, SUMMARY này)

## Accomplishments

- Tách vòng scan trong `SqlclSession::start` thành `read_sqlcl_pgid<I>(outcomes)` thuần túy với `SqlclPgidReadStatus { Line, Eof, Wakeup, Failed }`, test được bằng Vec scripted không cần SSH.
- Giữ buffer tích lũy qua wakeup, parse ở mọi attempt và trước EOF; chỉ clear sau dòng hoàn chỉnh không khớp.
- Bảo vệ kill authority: match chỉ được chấp nhận khi dòng kết thúc bằng `\n`/`\r` hoặc EOF — nếu không, chunk `TASKMATE_PGID:42` có thể cấp nhầm PGID 42 thay vì 4242.
- Mọi Err đi qua `sqlcl_pgid_error`: `sqlcl_error_diagnostics("", pending)` cho tail 8 KiB cắt trên char boundary; không có pending thìErr giữ nguyên.
- 10 attempt, `drain_sqlcl_prefix`, marker/cancel/TTL, `scan_sqlcl_pgid_line`, `sqlcl_error_diagnostics`, TS, dependency: không đổi.

## TDD Gate Compliance

- `tdd_mode` trong `.planning/config.json` là `false` nên gate `check tdd-red-evidence` không bắt buộc; vẫn đã chạy và ghi kết quả thật ở dưới.
- RED commit: `533c14d3` (`test(261127-mmz): ...`).
- GREEN commit: `5d43d2e4` (`feat(261127-mmz): ...`).
- REFACTOR: không cần (GREEN gộp luôn cleanup discipline).

### RED evidence

- Lệnh: `cd src-tauri && cargo test --lib ssh_pool::tests`
- Kết quả: exit 101, **28 passed / 4 failed**, 47 filtered. Cả 4 test mới fail bằng assertion thật (không phải compile error / zero-test):
  - `read_sqlcl_pgid_keeps_partial_across_wakeups`: expected `Ok(4242)`, actual `Err("Không nhận dạng được PGID của phiên SQLcl.")`.
  - `read_sqlcl_pgid_parses_pending_line_at_eof`: expected `Ok(9)` cho cả 2 case, actual Err như trên.
  - `read_sqlcl_pgid_discards_non_matching_line`: expected `Ok(8)`, actual Err như trên.
  - `read_sqlcl_pgid_error_is_bounded_and_char_safe`: assertion `err.contains("ORA-00942")` failed.
- `gsd_run check tdd-red-evidence` trả `INVALID_RED / zero_tests_discovered` vì parser của gate chỉ hiểu TAP `# tests`/`not ok N -`, trong khi `cargo test` in `test ... FAILED`. Đây là limitation của gate với Rust (xem `tdd.md` "Known gap — Rust"), không phải RED giả: output test thật có 4 tên test fail với assertion cụ thể.

### GREEN evidence

- Lần đầu chạy GREEN: 31 passed / 1 failed — `read_sqlcl_pgid_keeps_partial_across_wakeups` trả `Ok(42)` thay vì `Ok(4242)`: parse chunk partial `TASKMATE_PGID:42` cấp nhầm PGID. Đây là lỗi thật tự phát hiện, đã sửa bằng gate `line_complete` (kết thúc `\n`/`\r` hoặc EOF) trước khi gọi `scan_sqlcl_pgid_line`.
- Lần cuối: `cargo test --lib ssh_pool::tests` exit 0, **32 passed / 0 failed**, 47 filtered; `cargo check --lib` exit 0, sạch. `git diff --check` sạch.

## Task Commits

1. **Task 1 (RED): thêm 4 test scripted cho partial PGID** - `533c14d3` (test)
2. **Task 1 (GREEN): implement helper + complete-line gate + bounded diagnostic** - `5d43d2e4` (feat)

**Plan metadata ledger:** base `a64d8b02d1503b9a19f978402b67afccec5efa6a`, `git rev-list --count base..HEAD` = 7, head `236e732d`. Bao gồm 2 commit code (RED/GREEN) + 5 commit docs (STATE/SUMMARY, PLAN.md vốn để lại untracked từ lúc tạo quick task, và 3 lần cập nhật ledger). Frontmatter ghi số đo ngay trước commit cuối; commit cuối chỉ đổi đúng số đó và head của nó là `236e732d`.

## Verification Commands

| Lệnh | Kết quả |
|------|---------|
| `cd src-tauri && cargo test --lib ssh_pool::tests` | exit 0 — 32 passed, 0 failed, 47 filtered |
| `cd src-tauri && cargo check --lib` | exit 0 — Finished dev profile, không warning/error |
| `git diff --check` | sạch |
| `npx vitest run src/services/ai/__tests__/oracleSqlclService.test.ts --bail=1` | không chạy (tùy chọn; không đổi TS) |
| `npm test` | không chạy (quy ước dự án >1 giờ) |
| live SSH/SQLcl | không chạy (không có credential; test dùng scripted outcomes) |

## Files Created/Modified

- `src-tauri/src/ssh_pool.rs` - thêm `SqlclPgidReadStatus`, `read_sqlcl_pgid`, `sqlcl_pgid_error`; thay block scan trong `start` bằng iterator 10 outcome; 4 test mới.
- `.planning/STATE.md` - 1 row quick task, last activity/desc, 1 decision, 1 performance row, timestamp.
- `.planning/quick/261127-mmz-fix-pgid-partial-line/261127-mmz-SUMMARY.md` - summary này.

## Files Intentionally Unchanged

- `src-tauri/src/tool_cancel.rs`, `src-tauri/src/ssh_service.rs`, `src-tauri/Cargo.toml`, `package.json`.
- `src/services/ai/oracleSqlclService.ts` và mọi file TS — contract marker/redact giữ nguyên.
- `.gsd/dispatch-isolation-sentinel.json` — modified sẵn, không stage/commit.

## Threat Surface

Không có surface mới ngoài threat model: helper thuần túy không mở endpoint, không đọc file, không thêm dependency. Err string vẫn đi qua `sqlcl_error_diagnostics` (tail 8 KiB, char boundary) và TS `redactOracleText` như cũ.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Ngăn grant PGID từ chunk partial**
- **Found during:** GREEN verification (lần chạy đầu sau implement).
- **Issue:** Plan Step 3 nói "parse buffer TÍCH LŨY ngay trên MỌI attempt", nhưng làm vậy thì `TASKMATE_PGID:42` ở một wakeup được parse thành PGID 42 trước khi chunk `42\n` tới, cấp sai quyền kill PGID (`Ok(42)` thay vì `Ok(4242)`).
- **Fix:** Thêm gate `line_complete` = EOF hoặc buffer kết thúc `\n`/`\r`; chỉ gọi `scan_sqlcl_pgid_line` khi gate đúng. Wakeup vẫn giữ buffer, vẫn parse ở EOF.
- **Files modified:** `src-tauri/src/ssh_pool.rs`.
- **Verification:** `read_sqlcl_pgid_keeps_partial_across_wakeups` chuyển từ `Ok(42)` sang `Ok(4242)`; full targeted suite 32/32 xanh; `cargo check --lib` sạch.
- **Committed in:** `5d43d2e4`.

**2. [Rule 1 - Bug] Test diagnostic bound đo sai đơn vị**
- **Found during:** Soạn test RED.
- **Issue:** Assertion ban đầu so `err.len() <= MAX + 128`, trong khi message prefix không nằm trong tail bounded; có thể che lỗi cắt vượt 8 KiB.
- **Fix:** Tách `err` tại newline đầu, assert riêng phần `diag` ≤ `MAX_SQLCL_ERROR_DIAGNOSTICS_BYTES` và `is_char_boundary(diag.len())`.
- **Files modified:** `src-tauri/src/ssh_pool.rs` (trước RED commit).
- **Verification:** test `read_sqlcl_pgid_error_is_bounded_and_char_safe` xanh ở GREEN.
- **Committed in:** `533c14d3` (nằm trong RED commit).

**Tổng deviations:** 2 auto-fix (Rule 1 bug). Không có thay đổi TS, dependency hay contract.

## Issues Encountered

- `gsd_run check tdd-red-evidence` không đọc được định dạng `cargo test` (parser TAP); đã ghi rõ ở TDD Gate Compliance. `tdd_mode: false` nên không block.
- Compile ban đầu mất ~4 phút do dependency Rust chưa build; không có lỗi compile.

## User Setup Required

None.

## Self-Check: PASSED

- File tồn tại: `src-tauri/src/ssh_pool.rs`, `.planning/STATE.md`, SUMMARY này.
- Commit tồn tại: `533c14d3`, `5d43d2e4` (xác nhận trong git log).
- Không merge/push; branch `fix/oracle-pty-pgid`; `.gsd/dispatch-isolation-sentinel.json` không bị stage.

## Next Phase Readiness

Sẵn sàng review/merge trên branch `fix/oracle-pty-pgid`. Không UAT live SSH trong quick task này; nếu muốn non-regression TS, chạy lệnh Vitest tùy chọn ở bảng Verification.

---
*Phase: 261127-mmz*
*Completed: 2026-11-27*
