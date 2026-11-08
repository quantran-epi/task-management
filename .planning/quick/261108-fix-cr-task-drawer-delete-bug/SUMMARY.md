---
status: complete
date: 2026-11-08
description: Fix existing task deleted when closing task drawer in CR detail
---

# Summary: Fix Existing Task Deleted When Closing Task Drawer in CR Detail

## Changes Delivered
1. **CR Detail View (`ChangeRequestDetailView.tsx`)**:
   - Added `placeholderTaskIdRef` to track whether the open `TaskDrawer` corresponds to a newly created placeholder task (`handleCreateTask`) or an existing task selected from the CR table.
   - Guarded `handleCloseTaskDrawer`: `deleteTaskWithAllocations` is only triggered when `isPlaceholder` is true and `!taskSavedRef.current`.
   - Clicking an existing task in the table and closing without saving no longer deletes the task.
   - Creating a new task and closing without saving continues to delete the unsaved placeholder as expected by WR-13.
2. **Tests (`tests/views/ChangeRequestDetailView.test.tsx`)**:
   - Added test ensuring existing tasks remain intact when task drawer is opened and closed without saving.
   - Added test ensuring newly created placeholder tasks are cleaned up when the drawer is cancelled.
   - All 12 tests pass cleanly; TypeScript typecheck passes with 0 errors.
