# Debug Session: Header Widget Displays Worktype / Generic Fallback Instead of Task Name

**Gap:** G-12.1-3
**Status:** Resolved

## Symptoms
In `ActiveTimerWidget` in `AppShell`, the single active timer capsule and multi-timer dropdown items display "Tác vụ" instead of the actual task name.

## Root Cause
In `src/components/timer/ActiveTimerWidget.tsx`:
1. `AppShell` mounts `<ActiveTimerWidget />` without `tasksMap`.
2. The internal `useLiveQuery` uses `db.tasks.where('id').anyOf(ids).toArray()`. In Dexie, `id` is primary key, not a secondary indexed property, which can fail or return empty.
3. When `dbTasks` is undefined or empty, `getTaskTitle` falls back to `return found?.name || 'Tác vụ'`.
4. "Tác vụ" (Vietnamese for "Task") appears in the header pill, which the user perceived as a generic workType rather than the actual task name.

## Fix
Replace `db.tasks.where('id').anyOf(ids).toArray()` with `db.tasks.bulkGet(ids)` or a direct query, filtering out undefined values, so task records are properly fetched by primary key `id`.
