---
quick_id: 261127-td8
slug: chuyen-sqlcl-pty-dump-thanh-tinh-nang-de
status: complete
date: 2026-11-27
commit: 1496b153
---

# Quick Task 261127-td8 Summary

## What changed

- `src-tauri/src/sqlcl_pty_debug.rs`: chuyển từ file/env dump sang in-memory bounded trace (64 KiB, drop-oldest). Export qua Tauri command `sqlcl_pty_dump_export(clear: bool)`, redact tại thời điểm export. Không ghi file tự động.
- `src-tauri/src/lib.rs`: register command.
- `src/components/settings/SqlclPtyDebugCard.tsx` (new): UI trong Settings → Remote SSH, nút "Xuất nhật ký PTY SQLcl" dùng `saveFileWithPicker` → native Save As dialog trên Windows.
- `src/views/SettingsView.tsx`: mount card trong tab SSH.
- `WINDOWS-GUIDE.md`: hướng dẫn build installer qua GitHub Actions, cài trên Windows, repro, export log. Không cần `tauri dev`, env var, spawn process hay đọc filesystem từ script.

## Verification

- `cargo check` pass.
- 4 scoped Rust tests pass (`escaped_*`, `redact_*`, `trace_is_bounded_and_clearable`).
- `npx tsc --noEmit` pass.

## Constraints

- Không đổi protocol SQLcl/PGID/marker/session reuse.
- Không commit secret; trace in-memory, export redact + rà tay.
- Không chạy full vitest suite.
