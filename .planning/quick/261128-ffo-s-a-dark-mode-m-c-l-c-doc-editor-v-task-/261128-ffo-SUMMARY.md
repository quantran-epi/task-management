---
phase: quick
plan: 261128-ffo
subsystem: ui-dark-mode-status
tags: [dark-mode, doc-outline, doc-set-form, status-bar, knowledge]
dependency_graph:
  requires: []
  provides: [tokenized-doc-outline, compact-doc-set-form, truthful-status-indicators]
  affects: [src/components/notes/DocOutlineToC.tsx, src/styles/workbench-tokens.css, src/components/knowledge/DocumentSetForm.tsx, src/components/shell/GitHubSyncStatusDot.tsx, src/workbench/StatusBar.tsx]
tech_stack:
  added: []
  patterns: [CSS custom properties, liveness probe with AbortController, deriveSyncStatus shared pure function]
key_files:
  created:
    - src/workbench/__tests__/StatusBarIndicators.test.tsx
  modified:
    - src/components/notes/DocOutlineToC.tsx
    - src/styles/workbench-tokens.css
    - src/components/knowledge/DocumentSetForm.tsx
    - src/components/shell/GitHubSyncStatusDot.tsx
    - src/workbench/StatusBar.tsx
decisions:
  - "DocOutlineToC bỏ hẳn 3 màu cứng, dùng class CSS token-driven; giữ keyboard/indent/ellipsis/scroll nguyên vẹn"
  - "DocumentSetForm chỉ đổi layout/CSS cho inspector 260px: preset 2 cột, 4 nhóm divider, control 28px; logic/aria/testid/payload giữ nguyên"
  - "StatusBar Knowledge probe GET /api/v1/health/liveness (không auth/token), 4 trạng thái, timeout 3s, retry 15s/60s, cleanup AbortController"
  - "Sync indicator dùng lại deriveSyncStatus từ GitHubSyncStatusDot thay vì hardcode 'synced'; không thêm indicator giả cho Telegram/AI"
metrics:
  duration: ~11min
  completed_date: 2026-11-28
---

# Quick 261128-ffo: Dark mode TOC, form bộ tài liệu, status indicator thật

Mục lục doc editor đọc được ở dark mode; form cấu hình trong inspector bộ tài liệu gọn, có nhóm rõ; status bar không còn báo "Knowledge"/"Synced" xanh giả.

## Thay đổi

- `src/components/notes/DocOutlineToC.tsx`, `src/styles/workbench-tokens.css`: thay `#595959`/`#262626`/`#f5f5f5` bằng class `.doc-outline-toc__title`, `.doc-outline-toc__item`, modifier `--sub`, `:hover` dùng `--bg-hover` + `--accent`, `:focus-visible` outline 2px.
- `src/components/knowledge/DocumentSetForm.tsx`: thêm class `doc-set-form-compact` trên Form, `doc-set-preset-grid` trên preset radio, 4 tiêu đề nhóm `.doc-set-form-group-title`; Collapse margin 12px.
- `src/components/shell/GitHubSyncStatusDot.tsx`: export pure `deriveSyncStatus` dùng chung, component render/testid giữ nguyên.
- `src/workbench/StatusBar.tsx`: add `useKnowledgeProbe` (disabled/checking/connected/disconnected, liveness probe, timeout/retry/cleanup); sync derive từ settings GitHub auto-sync + `hasToken`; giữ IndexedDB indicator cũ.
- `src/workbench/__tests__/StatusBarIndicators.test.tsx`: 7 test cho derive statuses + probe disconnected/cleanup.

## Verification

- `npx tsc --noEmit` — sạch (exit 0).
- `npx vitest run src/workbench/__tests__/StatusBarIndicators.test.tsx --bail=1` — 1 file / 7 tests đậu.
- `npx vitest run src/workbench/__tests__/DocumentSetDetailPublished.test.tsx src/workbench/__tests__/DocumentSetDetailDefaultDb.test.tsx --bail=1` — 2 files / 6 tests đậu.
- Chrome tab riêng (`ffo-uat`) `http://localhost:5173/#/tasks`: light/dark status bar hiển thị "Knowledge: chưa bật" (xám) + "Tắt" thay vì xanh giả; form Bộ tài liệu preset 2 cột, 4 divider nhóm, control gọn, không tràn ngang.
- Daemon knowledge đang tắt (`curl :3001` → 000) nên chưa UAT nhánh connected trực tiếp; nhánh này có unit test.
- Không chạy full vitest suite (quy tắc dự án).

## Commits

- `47867416` feat(261128-ffo): tokenize doc outline and compact doc-set form
- `b547dc5d` feat(261128-ffo): status bar indicators use real signals

## Deviations from Plan

None. Không đụng `TaskDrawer.tsx`, `TaskTable.tsx`, test của phase 52, `.planning/STATE.md` hay `.planning/phases/52-*`.

## Known Stubs

None.
