---
phase: quick
plan: 261004-fhz
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/tasks/LinkedKnowledgeSection.tsx
  - src/db/repositories/noteRepo.ts
  - src/db/repositories/__tests__/noteRepo.test.ts
  - src/components/notes/DocListPane.tsx
  - src/components/notes/DocEditorPane.tsx
  - src/components/notes/DocFolderTree.tsx
  - src/components/notes/ZipImportPreviewModal.tsx
  - src/views/NotesView.tsx
  - package.json
autonomous: true
requirements:
  - DOCS-FOLDER-HIERARCHY
  - DOCS-ZIP-IMPORT
  - BUG-LINKED-DOCS-HANG
  - BUG-DOCS-TRASH-RESTORE
must_haves:
  truths:
    - "LinkedKnowledgeSection does not show 'Tài liệu (0)' or get stuck on 'Đang tải tài liệu...' when linked documents have been deleted"
    - "Trashed documents in Docs view can be restored via DocListPane item menu and DocEditorPane warning banner"
    - "DocFolderTree displays hierarchical folders with recursive tree nesting, expand/collapse toggles, direct and recursive doc counts, and 'Tạo thư mục con' action"
    - "Users can upload a zip file of markdown files, preview and edit detected titles/files in a preview modal, and batch persist them under a selected or newly created folder"
    - "Only related tests are run and final commits are pushed to master"
  artifacts:
    - path: "src/components/tasks/LinkedKnowledgeSection.tsx"
      provides: "Clean empty state when linked docs are deleted"
    - path: "src/components/notes/ZipImportPreviewModal.tsx"
      provides: "Preview modal for extracted markdown docs from zip file before saving"
    - path: "src/components/notes/DocFolderTree.tsx"
      provides: "Hierarchical recursive folder tree with subfolder creation and collapse/expand"
    - path: "src/components/notes/DocListPane.tsx"
      provides: "Restore action in item menu for deleted docs"
    - path: "src/components/notes/DocEditorPane.tsx"
      provides: "Trash warning banner with Restore and Permanent Delete buttons"
---

# 261004-fhz: Folder Hierarchy, Zip Markdown Upload, and Doc Bug Fixes

## Problem Description
1. In `LinkedKnowledgeSection.tsx`, when a task references deleted documents, `linkedDocs` resolves to `[]` while `docIds.length > 0`, causing the UI to render `(0)` and hang permanently on "Đang tải tài liệu...".
2. In Docs view, trashed notes cannot be restored from the UI even though `restoreNote` exists in `noteRepo.ts`.
3. In `DocFolderTree.tsx`, folders are rendered in a flat list; subfolders cannot be created or viewed hierarchically.
4. Users cannot upload a zip file containing multiple markdown files with a preview modal before persisting into a chosen folder.

## Tasks
1. **Fix Bug 1 (LinkedKnowledgeSection) & Bug 2 (Trash Restore)**
   - Update `LinkedKnowledgeSection.tsx` to return `null` if all linked docs are deleted (`linkedDocs !== undefined && linkedDocs.length === 0`).
   - Wire `restoreNote` in `NotesView.tsx`, `DocListPane.tsx`, and `DocEditorPane.tsx`.
2. **Implement Folder Hierarchy**
   - In `DocFolderTree.tsx`, build recursive tree structure supporting arbitrary subfolder depth with expand/collapse, active styling, and "Tạo thư mục con" action.
   - In `NotesView.tsx`, update `handleCreateFolder(name, parentId?)` and support moving folders/docs with cycle detection.
3. **Implement Zip Markdown Upload with Preview Modal**
   - Add `jszip` to `package.json`.
   - Implement `batchCreateNotes` in `noteRepo.ts`.
   - Implement `ZipImportPreviewModal.tsx` allowing users to inspect files, edit titles, choose target folder, and batch save.
   - Add "Nhập Zip" action button to `DocFolderTree.tsx` / `NotesView.tsx`.
4. **Verification & Push to Master**
   - Run only related tests (`noteRepo.test.ts`, etc.).
   - Type-check via `npx tsc --noEmit`.
   - Push to master.
