---
status: complete
date: 2026-11-05
---

# Summary: Diagram Notes, Folder Hierarchy & Diagram Explorer

## What Was Done
1. **Schema & Model**:
   - Added `'diagram'` to `NoteType` in `src/types/models.ts` and `NOTE_TYPES` in `src/validation/schemas.ts`.
   - Filtered out `type === 'diagram'` and diagram-tagged folders in `DocsExplorer.tsx`, `NotesView.tsx`, and `DocFolderTree.tsx`.

2. **Diagram Explorer in Left Stripe (Synchronized 1:1 with Docs Explorer UI/UX)**:
   - Added `JetBrainsDiagramIcon` in `src/components/icons/JetBrainsIcons.tsx`.
   - Added `{ id: 'diagrams', name: 'Diagram Explorer', icon: <JetBrainsDiagramIcon size={16} />, shortcut: 'Alt+5' }` in `WorkbenchLayout.tsx` below Docs icon.
   - Removed the redundant Diagrams trigger button from `TitleBar.tsx` header bar.
   - Built full-featured `DiagramExplorer.tsx` in `src/workbench/toolwindows/` mirroring `DocFolderTree` 100%:
     - Identical Search input, font size, padding, spacing, and caret toggle (`CaretRightOutlined` / `CaretDownOutlined`).
     - Special System Folders on top: "Đã ghim", "Biểu đồ chung (Chưa phân loại)" with quick `+` button, "Thùng rác" with `...` action.
     - Section `THƯ MỤC` header with `+` create root folder button and amber folder icons (`FolderOutlined` / `FolderFilled`).
     - Item row design matching DocFolderTree: icon + title with ellipsis + pin badge + entity link badges + `...` MoreOutlined button + count badges.
     - 100% consistent POPUP MODAL UX (no inline input divergence):
       - Popup Modal Tạo thư mục mới (với phím Enter / autoFocus).
       - Popup Modal Đổi tên biểu đồ / thư mục (với phím Enter / autoFocus).
       - Popup Modal Chuyển thư mục.
       - Popup Modal Gắn liên kết Task / Project / Milestone.
       - Popup Confirm Modal Xoá và Dọn thùng rác.
     - Chuột phải (context menu) và click nút `...` đều mở menu đồng bộ.
     - Dedicated Diagram Trash Can tách biệt hoàn toàn với Docs Trash.

3. **Mermaid Studio Integration & Auto-Save**:
   - Updated `MermaidAssistantView.tsx` with `noteId` support and debounced auto-save (400ms) to IndexedDB (`noteRepo.updateNote`).
   - Integrated editable title bar input with dynamic active editor tab title sync.
   - Integrated Entity Linker dropdown (link with Task, Project, or Milestone).
   - Instant "Lưu vào Diagram Explorer" button when starting from scratchpad.
   - Connected `EditorArea.tsx` to pass `noteId` and `db` to `MermaidAssistantView`.

4. **Linked Diagrams Section across Entities**:
   - Created `EntityDiagramsSection.tsx` in `src/components/diagrams/`:
     - Displays linked diagrams list with thumbnail / metadata.
     - Actions: Xem nhanh (preview modal with MermaidViewer), Mở trong Studio, Huỷ liên kết, Xoá.
     - "+ Tạo biểu đồ" button creates a diagram linked directly to the entity and opens in Mermaid Studio.
   - Connected tab "Biểu đồ" with live badge count in `TaskDrawer.tsx`.
   - Connected Card "Biểu đồ liên quan" in `ItemInsightView.tsx` (Task / Project / Milestone insights).

5. **Testing**:
   - Added `tests/db/diagramNotes.test.ts` covering diagram persistence, subfolder hierarchy, entity linking, and soft delete.
   - Ran full test suite (all tests passed across database, markdown, and views).
   - Validated clean TypeScript compilation (`npx tsc --noEmit`).
