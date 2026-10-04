---
id: 261004-nls
title: Fix Note Detail Modal Layout Shift and Display Entity Name
status: complete
date: 2026-10-04
---

# Fix Note Detail Modal Layout Shift and Display Entity Name

## Problem
1. On Notes page, opening `NoteDetailModal` locks body scrolling (`overflow: hidden; width: calc(100% - 15px)` via Ant Design's `ScrollLocker`), which causes the page width to expand by the scrollbar width and forces the CSS grid (`repeat(auto-fill, minmax(320px, 1fr))`) to recalculate/shift column layout. Closing the modal restores body scroll and the layout snaps back.
2. Inside `NoteDetailModal`, the item that the note belongs to only showed the raw entity type tag (`note.entityType`) without the actual entity name (e.g. task name, project name, or milestone name).

## Solution
1. Add `scrollLock={false}` to `NoteDetailModal` and `NoteEditor` so Ant Design does not lock body scrolling or shift body width.
2. Add `scrollbar-gutter: stable` to `index.html` to keep the layout gutter stable across modal states.
3. In `NoteDetailModal`, look up the entity's name from `db.tasks`, `db.projects`, or `db.milestones` based on `note.entityType` and `note.entityId`. Display the formatted type label and item name (e.g., `Tác vụ: [Tên tác vụ]`).
4. Add unit test coverage in `tests/components/notes/NoteDetailModal.test.tsx`.
