---
id: 261004-nls
title: Fix Note Detail Modal Layout Shift and Display Entity Name
status: complete
date: 2026-10-04
---

# Summary: Fix Note Detail Modal Layout Shift and Display Entity Name

## Key Changes
- **Prevent Layout Shift on Modal Open/Close**:
  - Configured `scrollLock={false}` on `NoteDetailModal` and `NoteEditor` to prevent Ant Design's `ScrollLocker` from altering body width and removing the scrollbar.
  - Added `scrollbar-gutter: stable` to `index.html` to guarantee stable viewport dimensions.
- **Show Entity Name in Note Detail Modal**:
  - Updated `NoteDetailModal` to asynchronously resolve the linked entity's name from `db.tasks`, `db.projects`, or `db.milestones`.
  - Formatted entity tag with localized labels: `Tác vụ: <Tên>`, `Dự án: <Tên>`, `Cột mốc: <Tên>` (or `Độc lập` for standalone notes).
- **Testing**:
  - Added unit tests in `tests/components/notes/NoteDetailModal.test.tsx` verifying entity name lookup and display as well as standalone tag rendering.
  - Targeted test suite passed: `npx vitest run tests/components/notes/NoteDetailModal.test.tsx tests/views/NotesView.test.tsx`.
  - Type-check and build succeeded: `npx tsc --noEmit && npm run build`.
