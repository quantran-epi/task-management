---
quick_id: 261127-t6n
slug: instrument-raw-pty-dump-cho-debug-oracle
status: complete
date: 2026-11-27
commit: 038ad7eb
---

# Quick Task 261127-t6n Summary

## What changed

- New `src-tauri/src/sqlcl_pty_debug.rs`: opt-in raw PTY dump, bounded 64 KiB, escaped control bytes, conservative redaction, path from `TASKMATE_SQLCL_DUMP_PATH` or default app support dir. Enabled only by `TASKMATE_SQLCL_DUMP=1`.
- `src-tauri/src/lib.rs`: register module.
- `src-tauri/src/ssh_pool.rs`: dump hooks at `START_AFTER_EXEC`, `PGID_READ`, `SCRIPT_EOF`, `SCRIPT_LINE`, `SCRIPT_PARTIAL`. Không đổi protocol.
- Guide: `LIVE-DUMP-GUIDE.md` với 6 bước build/launch/capture/gửi dump.

## Verification

- `cargo check --manifest-path src-tauri/Cargo.toml --lib` → pass.
- 3 new unit tests (`escaped_*`, `redact_*`) pass individually.
- 3 existing `ssh_pool` tests pass individually.
- Full `cargo test --lib` có 2 pre-existing failures trong `ai_proxy` (network-dependent) — không liên quan; scoped tests pass.

## Constraints honored

- Không đổi logic PGID scan / marker / session reuse.
- Không commit secrets; dump opt-in + redact.
- Không chạy full vitest suite.

## Next

Chạy guide trên máy có Oracle thật, gửi dump về. Sau đó fix triệt để một lần dựa trên raw bytes.
