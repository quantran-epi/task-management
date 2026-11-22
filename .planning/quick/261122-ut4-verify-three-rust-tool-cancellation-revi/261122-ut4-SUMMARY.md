---
quick_id: 261122-ut4
status: complete
date: 2026-11-22
---

# Quick Task 261122-ut4: Verify three Rust tool-cancellation review findings

## Findings

1. PGID spoof via numeric banner — CONFIRMED. `build_remote_command` emitted bare `echo $$`; `read_pgid_line` accepted first numeric line. Fixed with `TASKMATE_PGID:` sentinel in wrapper + strict parser; reader scans across banner lines. Commit b8def166.
2. Shutdown orphaned remote jobs — CONFIRMED. `cleanup_on_exit` called `cancel_all`, which spawned detached kill threads and returned. Fixed with kill completion receivers and bounded 3s drain in `cleanup_on_exit`. Commit ab0f0882.
3. stdout/stderr deadlock — CONFIRMED. stdout drained to EOF on one reader thread before `channel.stderr()`. Fixed with dedicated stderr thread on cloned channel handle; invoke resolves only after both readers exit. Commit 79fe6f95.

## Verification

- `cd src-tauri && cargo test --lib tool_cancel::tests -- --test-threads=1` — 13 passed, 0 failed
- `cd src-tauri && cargo check --lib` — clean
