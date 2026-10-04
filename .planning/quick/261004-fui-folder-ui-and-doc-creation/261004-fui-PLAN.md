---
id: 261004-fui
slug: folder-ui-and-doc-creation
title: Redesign Folder UI and Enable Seamless Document Creation Inside Folders
date: 2026-10-04
status: in-progress
---

# Redesign Folder UI and Enable Document Creation Inside Folders

## Objectives
1. **Redesign Folder UI (`DocFolderTree.tsx`)**:
   - Replace Ant Design `<Tree>` with modern, sleek folder rows matching the quick filter visual style.
   - Distinct amber folder icons (`FolderFilled` / `FolderOpenFilled`), title with truncation, count badge.
   - Hover actions on folder row:
     - `+` (Add document directly to this folder)
     - `...` (More menu: Rename folder, Delete folder with safe unlinking)
   - Header with `+ Thư mục` button for fast folder creation.
2. **Enable Direct Document Creation in Folders (`DocFolderTree.tsx`, `DocListPane.tsx`, `NotesView.tsx`)**:
   - Update `onCreateDoc` to accept `(targetFolderId?: string)`.
   - Add `+` action on each folder row in `DocFolderTree` to create a doc in that specific folder and auto-focus it.
   - In `DocListPane`:
     - Show active folder title and "+ Tạo tài liệu" CTA in header when viewing a folder.
     - Add primary "+ Tạo tài liệu trong thư mục" button in the empty state.
   - In `NotesView`:
     - Wire `onCreateDoc(targetFolderId)` so the newly created doc switches active filter to that folder if needed and selects it.
     - Add `handleRenameFolder` and `handleDeleteFolder` (with safe unparenting of docs so data is never lost).
     - Add Move-to-Folder modal so documents can be moved between folders or back to Inbox.

## Tasks
- [x] Task 1: Redesign `DocFolderTree.tsx` with modern folder item rows, hover actions (`+` create doc, `...` rename/delete), and sleek styling.
- [x] Task 2: Enhance `DocListPane.tsx` with active folder header scope, "+ Tạo tài liệu" button, and actionable empty state.
- [x] Task 3: Update `NotesView.tsx` with folder document creation, rename folder, safe delete folder, and move-to-folder actions.
- [x] Task 4: Create unit tests in `tests/components/notes/DocFolderTree.test.tsx` verifying folder rendering, direct doc creation, rename, and delete triggers.
- [x] Task 5: Run only related tests, verify TypeScript compilation, update STATE.md, and commit.
