---
id: 261108-fix-cr-task-drawer-delete-bug
title: Fix existing task deleted when closing task drawer in CR detail
status: in-progress
created: 2026-11-08
---

# Quick Task: Fix Existing Task Deleted When Closing Task Drawer in CR Detail

## Problem Statement
In `ChangeRequestDetailView.tsx`, when a user clicks on an existing task in the CR's task list to open the `TaskDrawer`, closing the drawer causes the task to be deleted from the CR and database.

### Root Cause
In commit `11656f5292a3824e3622c1a9f081e99f7e3d090c` (WR-13 fix), logic was added to prevent orphaned placeholder tasks created by `handleCreateTask`:
```tsx
const handleCloseTaskDrawer = async () => {
  const id = drawerTaskId;
  setDrawerOpen(false);
  if (!id || taskSavedRef.current) {
    taskSavedRef.current = false;
    return;
  }
  try {
    await deleteTaskWithAllocations(id, db);
  } catch {
    // ...
  }
};
```
However, `openTaskDrawer` was also called when clicking an existing task (`record.id`). If the user merely views or closes the drawer without pressing "Save", `taskSavedRef.current` remains `false`. `handleCloseTaskDrawer` mistakenly treats the existing task as an unsaved placeholder and calls `deleteTaskWithAllocations(id, db)`, deleting the user's real task!

## Solution
1. In `ChangeRequestDetailView.tsx`:
   - Add `placeholderTaskIdRef = useRef<string | null>(null)` to distinguish between placeholder tasks created by `handleCreateTask` and existing tasks opened from the list.
   - In `handleCreateTask`: set `placeholderTaskIdRef.current = created.id` and pass `isPlaceholder: true` to `openTaskDrawer(created.id, true)`.
   - In table row click: call `openTaskDrawer(record.id, false)` which sets `placeholderTaskIdRef.current = null`.
   - In `onSave`: reset `placeholderTaskIdRef.current = null` and `taskSavedRef.current = true`.
   - In `handleCloseTaskDrawer`: only call `deleteTaskWithAllocations(id, db)` if `id === placeholderTaskIdRef.current` and `!taskSavedRef.current`.
2. Add a unit/integration test in `tests/views/ChangeRequestDetailView.test.tsx` verifying:
   - Clicking an existing task, opening the drawer, and closing it WITHOUT saving does NOT delete the task.
   - Creating a new task via `handleCreateTask` and closing without saving still deletes the unsaved placeholder (WR-13 regression test).
