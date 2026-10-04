# Quick Task 261004-fhz: Folder Hierarchy, Zip Markdown Upload, and Doc Bug Fixes Summary

## Overview
Added hierarchical subfolder management to Docs, client-side ZIP markdown archive extraction with interactive preview modal before batch persistence, and fixed two user-reported document linking and trash issues.

## Key Changes

1. **Bug 1 Fix: Linked Docs in Task Drawer (`src/components/tasks/LinkedKnowledgeSection.tsx`)**:
   - Fixed hide condition so the section returns `null` when all linked documents are soft-deleted or missing (`linkedDocs !== undefined && linkedDocs.length === 0`).
   - Prevents rendering misleading "Tài liệu & Tri thức liên kết (0)" and permanently stuck "Đang tải tài liệu..." spinner.
   - Added unit test in `src/components/tasks/__tests__/LinkedKnowledgeSection.test.ts`.

2. **Bug 2 Fix: Document Trash Restore (`src/components/notes/DocListPane.tsx`, `DocEditorPane.tsx`, `NotesView.tsx`, `noteRepo.ts`)**:
   - Updated `restoreNote` in `src/db/repositories/noteRepo.ts` to properly remove `deletedAt` and persist via Dexie.
   - Added `handleRestoreDocument` action in `NotesView.tsx`.
   - Added "Khôi phục tài liệu" action to `DocListPane.tsx` item dropdown and inline 1-click restore button for trashed documents.
   - Added warning banner in `DocEditorPane.tsx` with "Khôi phục tài liệu" and "Xóa vĩnh viễn" buttons when viewing a deleted document, with read-only view protection.

3. **Feature 1: Folder Hierarchy (`src/components/notes/DocFolderTree.tsx`, `DocListPane.tsx`, `NotesView.tsx`)**:
   - Built recursive tree structure (`FolderTreeNode`) supporting arbitrary subfolder nesting, depth indentation, expand/collapse state, and direct vs recursive document counts.
   - Added "Tạo thư mục con" (Create subfolder) action in folder item dropdown.
   - Added cycle-safe folder relocation modal (prevents moving a folder into itself or its descendants).
   - Added clickable breadcrumb navigation in `DocListPane.tsx` header when viewing nested subfolders (`📁 Parent / 📁 Child`).
   - Cascade delete for folders: recursively reassigns all child documents in subfolders to Inbox (null parentId) so user work is never lost.

4. **Feature 2: Zip Markdown Upload with Preview Modal (`src/components/notes/ZipImportPreviewModal.tsx`, `src/db/repositories/noteRepo.ts`)**:
   - Installed `jszip` for client-side offline archive unpacking.
   - Implemented `batchCreateNotes` repository function in `src/db/repositories/noteRepo.ts` with `db.notes.bulkAdd`.
   - Created `ZipImportPreviewModal.tsx` allowing users to:
     - Automatically extract all `.md` and `.markdown` files (filtering macOS hidden files and non-markdown assets).
     - Auto-detect document title from first `# H1` heading or filename.
     - Interactively select/deselect files and edit titles inline.
     - Preview markdown formatting in a slide-out drawer before saving.
     - Choose destination: create a new folder (prefilled with zip name) or select existing folder in the hierarchy.
     - Option to automatically recreate subfolder structure based on relative paths inside the zip archive.
   - Added "Nhập từ Zip" upload button to `DocFolderTree.tsx` toolbar.

## Verification
- TypeScript type-checking: `npx tsc --noEmit` passed with 0 errors.
- Vitest unit tests:
  - `src/db/repositories/__tests__/noteRepo.test.ts` (3 tests passed)
  - `src/components/tasks/__tests__/LinkedKnowledgeSection.test.ts` (1 test passed)
  - `src/components/notes/__tests__/zipImport.test.ts` (1 test passed)
  - All 5 related tests passed in 1.45s.
- Production build: `npm run build` succeeded without errors.
