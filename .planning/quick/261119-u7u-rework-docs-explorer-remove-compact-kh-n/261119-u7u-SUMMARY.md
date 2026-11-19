---
phase: quick-261119-u7u
plan: 01
subsystem: docs
tags: [workbench, docs, document-sets, tabs]
status: complete
requires: []
provides:
  - dedicated doc_set_library tab with left set list + right DocumentSetDetail
  - compact Docs Explorer toolbar with Bộ tài liệu browse trigger
affects:
  - src/workbench/toolwindows/DocsExplorer.tsx
  - src/workbench/DocSetLibrary.tsx
  - src/components/notes/DocsLibraryActions.tsx
tech-stack:
  added: []
  patterns:
    - "One reusable library tab; set selection is a tab param, no per-set tab explosion"
    - "Reuse existing DocumentSetDetail for full per-set feature parity"
key-files:
  created:
    - src/workbench/DocSetLibrary.tsx
  modified:
    - src/workbench/store/layoutStore.ts
    - src/workbench/EditorArea.tsx
    - src/workbench/toolwindows/DocsExplorer.tsx
    - src/components/notes/DocsLibraryActions.tsx
    - src/workbench/__tests__/DocsWorkspace.test.tsx
    - src/workbench/__tests__/DocsExplorerZip.test.tsx
decisions:
  - "Removed Không gian Docs Card/Table entirely; Bộ tài liệu is now a compact toolbar button"
  - "Create-set modal remains only for creation; browsing has no modal"
  - "Existing doc_set tab path kept for persisted/direct links; new UI uses doc_set_library"
metrics:
  duration: ~25 min
  completed: 2026-11-19
  tasks: 1
  files: 7
---

# Quick 261119-u7u: Docs Explorer → dedicated document-set library tab

## What Changed

- `src/workbench/store/layoutStore.ts`: added persisted-safe `doc_set_library` view type.
- `src/workbench/EditorArea.tsx`: mounts `DocSetLibrary` for the new view; reuses Docs icon.
- `src/workbench/DocSetLibrary.tsx`: new full-height two-column view. Left: searchable live list of document sets with count/date and selection; compact inline create form. Right: existing `DocumentSetDetail` for the selected set, or empty prompt.
- `src/workbench/toolwindows/DocsExplorer.tsx`: removed the bulky `Không gian Docs` Card/Table and its page-size constant; toolbar now opens one reusable `doc_set_library` tab.
- `src/components/notes/DocsLibraryActions.tsx`: added compact `Bộ tài liệu` button; create-set success routes into the library tab with the new set selected. ZIP import and AI prompt unchanged.
- Tests updated to assert one library tab, left/right panes, set selection, no bulky block, and unchanged per-set features.

## Verification

- `npx tsc --noEmit` — clean.
- `npx vitest run src/workbench/__tests__/DocsWorkspace.test.tsx src/workbench/__tests__/DocsExplorerZip.test.tsx src/views/__tests__/NotesViewWorkbench.test.tsx --reporter=dot` — 3 files passed, 15 tests passed.
- Full vitest suite intentionally not run (project rule: over an hour).

## UAT ngắn cho sếp

1. Mở Docs Explorer: thanh công cụ gọn, không còn khối “Không gian Docs”.
2. Bấm “Bộ tài liệu”: mở đúng 1 tab; bấm lại nhiều lần vẫn 1 tab.
3. Cột trái hiện danh sách bộ tài liệu; bấm một bộ → chi tiết hiện cột phải.
4. Tạo bộ tài liệu mới → bộ mới được chọn trong tab; đóng/mở lại tab vẫn giữ lựa chọn.

## Self-Check: PASSED

- Commit `77eb077c` present on `worktree-docs-space-tab-ui`.
- No modal for browsing; only existing create/delete/publish/graph modals remain.
