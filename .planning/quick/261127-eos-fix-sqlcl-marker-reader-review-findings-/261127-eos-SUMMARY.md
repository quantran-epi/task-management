---
phase: quick
plan: 261127-eos
subsystem: backend
tags: [sqlcl, ssh, marker, reader, rust, vitest]
requires:
  - phase: quick/261127-dsx
    provides: "Persistent SSH SQLcl session with sentinel-based completion"
provides:
  - "Plain-text single-line SQLcl completion marker with exact-line reader"
  - "Byte-identical stdout payload without JSON strip or marker row"
  - "TS heredoc test pinning absence of TASKMATE_DONE column alias"
affects: [261127-dsx, persistent SQLcl session, Oracle describe tooling]
tech-stack:
  added: []
  patterns: ["Exact trimmed-line equality for stream markers", "No reserialize of remote stdout"]
key-files:
  created: []
  modified:
    - src-tauri/src/ssh_pool.rs
    - src/services/ai/__tests__/oracleSqlclService.test.ts
key-decisions:
  - "Completion marker is one plain-text line selected with SET SQLFORMAT DEFAULT; no TASKMATE_DONE alias and no Rust-injected SET SQLFORMAT JSON"
  - "Reader compares line.trim() == marker by equality; substring in banners or JSON never stops the read; the marker line never enters stdout"
  - "Remove serde_json parse/reserialize and fallback slicing from ssh_pool.rs; stdout stays byte-identical, including get_ddl"
patterns-established:
  - "Stream markers: equality on trimmed line, drop marker line, preserve every other line verbatim"
requirements-completed: [SQLCL-PLAIN-LINE-MARKER]
coverage:
  - id: D1
    description: "Plain-line marker SQL and script shape without alias or JSON directive"
    requirement: SQLCL-PLAIN-LINE-MARKER
    verification:
      - kind: unit
        ref: "src-tauri/src/ssh_pool.rs#sentinel_is_unique_per_call, script_contains_preamble_sql_and_sentinel"
        status: pass
    human_judgment: false
  - id: D2
    description: "Exact-line reader drops marker but keeps payload and banner substring intact"
    requirement: SQLCL-PLAIN-LINE-MARKER
    verification:
      - kind: unit
        ref: "src-tauri/src/ssh_pool.rs#append_sqlcl_line_* (5 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "TS describe_table heredoc never emits TASKMATE_DONE alias"
    requirement: SQLCL-PLAIN-LINE-MARKER
    verification:
      - kind: unit
        ref: "src/services/ai/__tests__/oracleSqlclService.test.ts#keeps describe_table heredoc command shape for persistent SQLcl routing"
        status: pass
    human_judgment: false
actuals:
  tokens: 3645
  tasks: 2
  commits: 2
duration: 2min
completed: 2026-11-27
status: complete
plan_head_before: 30ac1a00f051c2f713067d100ce98bac0a1098eb
plan_head_after: 873570c47652ae02c50b097272021e5f8b93aa94
---

# Phase Quick Plan 261127-eos: SQLcl plain-line marker reader Summary

**Persistent SQLcl completion switched from JSON marker row stripping to one plain-text marker line dropped by exact-line reader**

## Performance

- **Duration:** 2 min
- **Started:** 2026-11-27T03:38:16Z
- **Completed:** 2026-11-27T03:40:13Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- `make_sqlcl_sentinel()` emits `SET SQLFORMAT DEFAULT/HEADING OFF/FEEDBACK OFF/PAGESIZE 0` + `SELECT '<marker>' FROM DUAL;`; no `TASKMATE_DONE` alias, no Rust-injected `SET SQLFORMAT JSON`.
- `build_sqlcl_script()` appends the marker SQL after the caller script inside the same reset preamble; caller TS still owns its JSON payload format.
- `append_sqlcl_line()` pure helper compares `line.trim() == marker`, drops the marker line, pushes all other lines verbatim; `run_script()` stops on complete or EOF-partial marker and returns stdout untouched.
- Removed `strip_sqlcl_marker_row`, `is_marker_row`, their four tests, and all `serde_json` use from `ssh_pool.rs`.
- Added five pure reader tests (complete line, EOF partial, banner substring, non-marker partial, wake-up prefix) and updated the two marker/script tests.
- TS heredoc test now also asserts `not.toContain('TASKMATE_DONE')`.
- SSH pool, persistent session, cancel/PGID kill, bounded stderr, restart-once, TTL, serialization, profile validation, `parse_sqlcl_command` and production TS all unchanged; no dependency added.

## Task Commits

Each task was committed atomically:

1. **Task 1: Plain-line marker + pure reader helper trong ssh_pool.rs** - `bbe75d3c` (fix)
2. **Task 2: Pin TS heredoc command không chứa column alias marker** - `873570c4` (test)

**Plan metadata:** pending final docs commit

## Files Created/Modified

- `src-tauri/src/ssh_pool.rs` - plain-line marker SQL, exact-line reader helper, updated/added unit tests; JSON strip removed.
- `src/services/ai/__tests__/oracleSqlclService.test.ts` - one added assertion pinning heredoc command shape.

## Decisions Made

- Plain-line marker selected with `SET SQLFORMAT DEFAULT` only for the marker SELECT; caller JSON payload untouched.
- Reader stops on equality after `trim`, never `contains`, so banners and JSON text containing the marker cannot spoof completion.
- No JSON strip in Rust: stdout byte-identical with pre-marker SQLcl output, including `get_ddl`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Initial wake-up-prefix test expected empty output after pushing a partial marker prefix; corrected to assert the helper's documented behavior (prefix preserved, following marker line dropped). Fix applied before commit; no deviation from the plan's contract.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Scoped verification green: `cargo test --lib ssh_pool::tests` (17 passed), `npx vitest run src/services/ai/__tests__/oracleSqlclService.test.ts --bail=1` (44 passed), `git diff --check` (clean).
- Full suite not run per project rule (over an hour). Pre-existing unrelated changes untouched.

## Self-Check: PASSED

- Files exist: `src-tauri/src/ssh_pool.rs`, `src/services/ai/__tests__/oracleSqlclService.test.ts`, `.planning/STATE.md`, SUMMARY.md.
- Commits found: `bbe75d3c`, `873570c4`.

---
*Phase: quick/261127-eos*
*Completed: 2026-11-27*
