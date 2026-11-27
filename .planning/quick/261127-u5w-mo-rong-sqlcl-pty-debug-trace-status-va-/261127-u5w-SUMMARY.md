---
quick_id: 261127-u5w
slug: mo-rong-sqlcl-pty-debug-trace-status-va-
status: complete
date: 2026-11-27
---

# Quick Task 261127-u5w Summary

Gộp instrumentation SQLcl PTY đầy đủ vào một build: session-tagged trace, read status, retry/create/reuse, drain, marker và error events. Không đổi giao thức SQLcl. UI export trong Settings → Remote SSH giữ nguyên.

Verify: cargo check pass; 4 scoped Rust tests pass; npx tsc --noEmit pass.
