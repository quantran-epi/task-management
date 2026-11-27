---
phase: quick
plan: 261127-dsx
subsystem: infra
tags: [tauri, rust, ssh, sqlcl, oracle, marker, json, vitest]

requires:
  - phase: quick-261126-vra
    provides: SSH connection pool and persistent remote SQLcl session used by this fix
provides:
  - SQL SELECT completion marker emitted as SQLFORMAT JSON row instead of PROMPT line
  - JSON-aware marker stripping before stdout reaches TypeScript parsers
  - Pure Rust regression tests for marker generation, script shape, and strip shapes
  - TypeScript regression test pinning heredoc + EXIT; + delimiter command shape
affects: [oracle-sqlcl-tool, ssh-pool, standalone-ai-chat]

actuals:
  tokens: 3598
  tasks: 2
  commits: 1
  plan_head_before: 7d2f15aabd2a8989d1741923b93db53cd1dcb048
  plan_head_after: dbf6beba903af011ec27ae3c2067095ac5b5cb85

tech-stack:
  added: []
  patterns:
    - Persistent SQLcl completion via SQL SELECT marker in SQLFORMAT JSON
    - Recursive serde_json marker-row removal with textual fallback

key-files:
  created: []
  modified:
    - src-tauri/src/ssh_pool.rs
    - src/services/ai/__tests__/oracleSqlclService.test.ts

key-decisions:
  - Keep SSH pool and persistent SQLcl session; change only the completion protocol
  - Re-assert SET SQLFORMAT JSON immediately before the marker so it always emits as a JSON row
  - Rust owns marker generation and stripping; TypeScript heredoc production code stays unchanged

patterns-established:
  - Completion marker is generated per call and stays internal to Rust; stdout returned to TS is marker-free

requirements-completed:
  - SQLCL-SELECT-SENTINEL

coverage:
  - id: D1
    description: Persistent SQLcl completion uses a SQL SELECT JSON marker instead of PROMPT and returns marker-free stdout
    requirement: SQLCL-SELECT-SENTINEL
    verification:
      - kind: unit
        ref: "src-tauri/src/ssh_pool.rs#ssh_pool::tests (16 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: describe_table keeps heredoc + EXIT; + delimiter command shape and carries no TS-generated sentinel
    requirement: SQLCL-SELECT-SENTINEL
    verification:
      - kind: unit
        ref: "src/services/ai/__tests__/oracleSqlclService.test.ts#keeps describe_table heredoc command shape for persistent SQLcl routing"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-11-27
status: complete
---

# Quick 261127-dsx: SQLcl sentinel bằng SQL SELECT marker Summary

**Persistent SQLcl giữ SSH pool, dùng SQL SELECT marker trong SQLFORMAT JSON để báo completion và strip marker trước khi trả stdout cho TS**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-11-27T03:08:29Z
- **Completed:** 2026-11-27T03:14:02Z
- **Tasks:** 2/2
- **Files modified:** 2

## Accomplishments

- `make_sqlcl_sentinel()` trả `SELECT '<marker>' AS TASKMATE_DONE FROM DUAL;` thay `PROMPT <marker>`; marker vẫn là `TASKMATE_SQLCL_DONE_<pid_hex>_<nonce_hex>`.
- `build_sqlcl_script()` thêm `SET SQLFORMAT JSON;` ngay trước marker, giữ preamble cũ.
- `run_script()` dừng khi output chứa marker (kể cả partial line cuối trước EOF), flush partial line, và trả stdout đã strip marker.
- `strip_sqlcl_marker_row()` xử lý cả `[{...}]` lẫn `{results:[{items:[...]}]}`, giữ group/row thật; fallback chuỗi khi JSON parse thất bại.
- Test TS mới khẳng định lệnh `describe_table` vẫn là heredoc + `EXIT;` + delimiter, không có `PROMPT` hay sentinel do TS phát ra.

## Task Commits

Each task was committed atomically:

1. **Task 1: SQL SELECT marker + strip JSON-aware trong ssh_pool.rs** - `dbf6beba` (fix)
2. **Task 2: Regression test TS command shape cho describe_table** - `dbf6beba` (fix)

**Plan metadata:** `dbf6beba` (docs: complete plan)

_Note: các task được gom trong một commit atomic theo yêu cầu orchestrator cho quick task._

## Verification

- `cd src-tauri && cargo test --lib ssh_pool::tests` → 16 passed / 0 failed.
- `npx vitest run src/services/ai/__tests__/oracleSqlclService.test.ts --bail=1` → 1 file passed, 44 tests passed.
- `grep -n 'PROMPT TASKMATE_SQLCL_DONE' src-tauri/src/ssh_pool.rs` → không có output.
- `grep -n 'TASKMATE_DONE FROM DUAL' src-tauri/src/ssh_pool.rs` → có output (dòng 423).
- `git diff --check` → clean.

## Files Created/Modified

- `src-tauri/src/ssh_pool.rs` - SQL marker generation, JSON-aware strip helper, reader detection, unit tests.
- `src/services/ai/__tests__/oracleSqlclService.test.ts` - Regression test cho command shape.

## Decisions Made

- Giữ nguyên persistent session và SSH pool; chỉ đổi cơ chế completion.
- Không sửa production TS; Rust tự chèn marker.
- Không thêm dependency: dùng `serde_json` có sẵn trong `src-tauri/Cargo.toml`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 4 - Process] Gom RED/GREEN vào một commit atomic**
- **Found during:** Task 1 và Task 2
- **Issue:** Plan gắn `tdd="true"` cho Task 1, nhưng orchestrator yêu cầu commit atomic cho quick task và `workflow.tdd_mode` đang `false`.
- **Fix:** Chạy RED (5 test Rust fail đúng assertion), rồi GREEN trong cùng working tree, commit một lần với message `fix(261127-dsx)`.
- **Files modified:** `src-tauri/src/ssh_pool.rs`, `src/services/ai/__tests__/oracleSqlclService.test.ts`
- **Verification:** RED 5 fail / 11 pass; GREEN 16 pass; Vitest 44 pass.
- **Committed in:** `dbf6beba`

---

**Total deviations:** 1 process deviation
**Impact on plan:** Không đổi behavior hay scope; chỉ khác số commit so với TDD 2-3 commit thông thường.

## Issues Encountered

- Không có. Task 2 là regression guard, test mới xanh ngay vì production TS không đổi (đúng thiết kế).

## Known Stubs

None - không có placeholder hoặc data giả trong source thay đổi.

## Threat Flags

None - không thêm endpoint, auth path, file access hay schema boundary mới. Marker nội bộ nằm trong SQL literal charset an toàn và bị strip trước khi trả stdout.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Sẵn sàng UAT với SQLcl thật để xác nhận marker JSON emit đúng trên môi trường thật. Không chạy full Vitest suite theo quy tắc dự án.

## Self-Check: PASSED

- SUMMARY.md, `src-tauri/src/ssh_pool.rs`, `src/services/ai/__tests__/oracleSqlclService.test.ts` hiện diện.
- Commit `dbf6beba` tồn tại trong git history.

---
*Phase: quick-261127-dsx*
*Completed: 2026-11-27*
