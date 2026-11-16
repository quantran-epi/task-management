---
phase: quick-261116-fyi
plan: 01
subsystem: docs
tags: [workbench, docs, zip-import, zip-export, document-sets]
status: complete
requires:
  - src/views/NotesView.tsx
  - src/components/notes/DocFolderTree.tsx
  - src/components/notes/ZipImportPreviewModal.tsx
  - src/components/knowledge/DocumentSetDrawer.tsx
provides:
  - downloadFolderAsZip (shared folder-zip + feedback helper)
  - workbench compact Docs toolbar (Bộ tài liệu / Nhập Zip / Prompt AI)
  - DocsExplorer folder ZIP download menu item
affects:
  - src/utils/exportFolderZip.ts
  - src/views/NotesView.tsx
  - src/workbench/toolwindows/DocsExplorer.tsx
tech-stack:
  added: []
  patterns:
    - "Single dialog owner: NotesView keeps documentSet/zip/AI-prompt state; the compact toolbar only triggers the same setters"
key-files:
  created:
    - src/views/__tests__/NotesViewWorkbench.test.tsx
    - src/workbench/__tests__/DocsExplorerZip.test.tsx
  modified:
    - src/utils/exportFolderZip.ts
    - src/views/NotesView.tsx
    - src/workbench/toolwindows/DocsExplorer.tsx
decisions:
  - "Compact toolbar is a trigger surface only — no dialog is re-rendered or duplicated in DocsExplorer"
  - "downloadFolderAsZip owns the only antd message feedback for folder export; NotesView and DocsExplorer both route through it"
metrics:
  duration: ~12 min
  completed: 2026-11-16
  tasks: 1
  files: 5
---

# Quick 261116-fyi: Workbench Docs parity — Summary

Compact Docs toolbar in the workbench editor tab restores Bộ tài liệu (Document Sets drawer with Knowledge Server publish + graph build), Nhập Zip (existing ZipImportPreviewModal), and Prompt AI; Docs Explorer folder menus regain Tải thư mục (ZIP) through one shared download helper.

## What Changed

**`src/utils/exportFolderZip.ts`** — new exported `downloadFolderAsZip(folder, allNotes)` that wraps `exportFolderAsZip` with the loading/success/error `message` feedback previously inlined in NotesView's `handleDownloadFolder`. `exportFolderAsZip` stays pure (no antd).

**`src/views/NotesView.tsx`**
- `handleDownloadFolder` now delegates to `downloadFolderAsZip(folder, allNotes || (await db.notes.toArray()))`.
- New `data-testid="docs-compact-toolbar"` block rendered only when `hideFolderTree` is true: 36px strip, `Space` with `DatabaseOutlined` "Bộ tài liệu" → `setDocumentSetDrawerOpen(true)`, `UploadOutlined` "Nhập Zip" → `handleOpenZipImport`, `RobotOutlined` "Prompt AI" → `setAiPromptModalOpen(true)`.
- Non-workbench branch untouched; `DocumentSetDrawer`, `PublishPreviewModal`, `ZipImportPreviewModal`, hidden file input and AI prompt Modal remain mounted unconditionally at the bottom.

**`src/workbench/toolwindows/DocsExplorer.tsx`** — imports `downloadFolderAsZip`, adds `handleDownloadFolder = useCallback((folder) => downloadFolderAsZip(folder, allNotes ?? []), [allNotes])`, passes `onDownloadFolder` to `DocFolderTree`. No zip-import stack added here (NotesView owns it).

## Tests

| File | Cases | Result |
|---|---|---|
| `src/views/__tests__/NotesViewWorkbench.test.tsx` | 4 — toolbar renders + header hidden; drawer opens; Nhập Zip clicks the hidden `.zip` input; non-workbench keeps PageHeader and no toolbar | pass |
| `src/workbench/__tests__/DocsExplorerZip.test.tsx` | 1 — folder row menu offers Tải thư mục (ZIP) and calls `downloadFolderAsZip` with the folder + seeded child doc | pass |
| `src/workbench/__tests__/Explorers.test.tsx` (regression) | 3 | pass |

`npx tsc --noEmit` clean. Full vitest suite intentionally not run (project rule: over an hour).

## Deviations from Plan

None. Plan executed as written; no new dependency, no Dexie schema change, no PWA/GitHub Pages impact.

## Verification Evidence

- `grep -c exportFolderAsZip src/views/NotesView.tsx src/workbench/toolwindows/DocsExplorer.tsx` → 0 / 0 (both callers go through `downloadFolderAsZip`); only `src/utils/exportFolderZip.ts` calls it (2 hits).
- Diff footprint limited to the five planned paths.

## Self-Check: PASSED

- `src/utils/exportFolderZip.ts`, `src/views/NotesView.tsx`, `src/workbench/toolwindows/DocsExplorer.tsx`, `src/views/__tests__/NotesViewWorkbench.test.tsx`, `src/workbench/__tests__/DocsExplorerZip.test.tsx` — all present.
- Commit `c0858407` present on `feature/intellij-workbench`.
