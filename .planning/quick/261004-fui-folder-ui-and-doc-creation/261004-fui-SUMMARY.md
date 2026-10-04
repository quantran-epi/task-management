# Quick Task 261004-fui: Redesign Folder UI and Enable Document Creation Inside Folders Summary

Redesigned folder list UI with sleek modern styling matching the quick filter layout, added 1-click document creation in folders, and enabled folder renaming, safe deletion, and moving docs between folders.

## Key Changes

1. **Folder UI Redesign (`DocFolderTree.tsx`)**:
   - Replaced default Ant Design `<Tree>` with sleek custom folder rows with warm amber folder icons (`FolderFilled` / `FolderOpenFilled`).
   - Clean folder title with ellipsis truncation and count badge.
   - Hover action buttons on each folder row:
     - `FileAddOutlined` (`+` button) to create a new document directly in that folder.
     - `MoreOutlined` (`...` button) dropdown menu with "Đổi tên thư mục" and "Xóa thư mục".
   - Section header with quick `+` button to create new folders.
   - Friendly empty state with "+ Tạo thư mục" when no folders exist.

2. **Direct Document Creation Inside Folders (`DocFolderTree.tsx`, `DocListPane.tsx`, `NotesView.tsx`)**:
   - `onCreateDoc` accepts optional `targetFolderId?: string`.
   - Clicking `+` on any folder row in `DocFolderTree` creates document with `parentId: folder.id`, automatically activates that folder view, and selects the new document for immediate editing.
   - In `DocListPane`:
     - Shows current folder scope banner in header with folder icon, title, and "+ Tạo tài liệu" button.
     - In empty folder state, displays primary button `+ Tạo tài liệu trong "{Tên thư mục}"`.

3. **Folder Management & Moving Documents (`NotesView.tsx`)**:
   - Added `handleRenameFolder` to update folder title with feedback.
   - Added `handleDeleteFolder` with confirmation modal that safely unparents child documents to Inbox (`parentId: null`) before deletion so no user work is ever lost.
   - Added `handleMoveDocToFolder` modal selector to move documents between folders or back to Inbox.

4. **Unit Tests**:
   - Added `tests/components/notes/DocFolderTree.test.tsx` verifying folder list rendering, selection, direct document creation in folders, and folder creation modal.

## Verification

- `npx tsc --noEmit`: 0 errors.
- `npx vitest run tests/components/notes/DocFolderTree.test.tsx tests/components/notes/DocEditorPane.test.tsx tests/utils/smartIngestion.test.ts tests/ai/markdown.test.ts tests/db/schemaV9.test.ts`: 44/44 passed.
