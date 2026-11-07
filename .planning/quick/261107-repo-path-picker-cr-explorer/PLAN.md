---
id: 261107-repo-path-picker-cr-explorer
type: quick
created: 2026-11-07
description: Add repo path folder picker in SystemModal and rename Project Explorer to CR Explorer
files_modified:
  - src/components/systems/SystemModal.tsx
  - src/workbench/WorkbenchLayout.tsx
  - src/workbench/toolwindows/LeftToolWindow.tsx
  - src/workbench/actions/actionRegistry.ts
  - src/views/ProjectSdlcView.tsx
  - src/workbench/toolwindows/ProjectExplorer.tsx
  - src/workbench/toolwindows/CRExplorer.tsx
  - tests/components/systems/SystemCatalogView.test.tsx
---

# Quick Plan: Repo Path Picker in SystemModal & Rename to CR Explorer

## Objective
1. Provide a folder browse/picker button for `remoteRepoPath` in `SystemModal` using `browseLocalFolder()` from `src/utils/documentLinks`.
2. Update path validation to support standard absolute paths (Unix `/`, Windows `C:\`, UNC `\\`).
3. Rename all user-visible instances of `Project Explorer` in Left Tool Window stripe, header, actions, and SDLC view to `CR Explorer`.
4. Add `src/workbench/toolwindows/CRExplorer.tsx` re-export.

## Tasks
1. Update `SystemModal.tsx` with directory picker button and robust absolute path validation.
2. Update `WorkbenchLayout.tsx`, `LeftToolWindow.tsx`, `actionRegistry.ts`, `ProjectSdlcView.tsx`, and `ProjectExplorer.tsx` to rebrand `Project Explorer` as `CR Explorer`.
3. Verify with unit tests.
