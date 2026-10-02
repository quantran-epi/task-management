---
task_id: 261002-rec
title: Implement recurring tasks and improve GitHub sync branch diagnostics
created: 2026-10-02
status: planned
---

# Quick Task Plan: Recurring Tasks & GitHub Sync Diagnostics

## Objective
1. Implement recurring tasks (daily, weekly, monthly) so that completing or scheduling a recurring task automatically manages or spawns the next occurrence.
2. Add recurrence UI in TaskDrawer and visual indicator in TaskTable.
3. Improve GitHub Sync error messages and branch verification to prevent false "Chưa có bản sao lưu" errors when repo default branch is `master` instead of `main`.

## Proposed Changes
1. **Types (`src/types/models.ts`)**:
   - Add `RecurrenceFrequency = 'daily' | 'weekly' | 'monthly'`
   - Add fields to `Task`:
     - `isRecurring?: boolean`
     - `recurrenceFrequency?: RecurrenceFrequency`
     - `recurrenceInterval?: number` (e.g. 1)
     - `recurrenceDaysOfWeek?: number[]` (e.g. [1, 2, 3, 4, 5] for Mon-Fri)
     - `recurrenceEndDate?: string` (YYYY-MM-DD)
     - `parentRecurringTaskId?: string`

2. **Validation (`src/validation/schemas.ts`, `src/validation/backupSchemas.ts`)**:
   - Add recurrence fields to `TaskInputSchema`, `TaskUpdateSchema`, `BackupTaskRecordSchema`.

3. **Recurrence Utility & Repository (`src/utils/recurrence.ts`, `src/db/repositories/taskRepo.ts`)**:
   - `computeNextOccurrence(currentDeadlineOrDate: string, frequency: RecurrenceFrequency, interval?: number, daysOfWeek?: number[]): string`
   - `spawnNextRecurringTask(task: Task, db: TaskPlannerDatabase): Promise<Task | null>`
   - In `updateTask`: if task is recurring and status changes to `Done`, auto-spawn next occurrence if not already spawned.
   - `ensureRecurringTaskInstances(db: TaskPlannerDatabase): Promise<number>` on app/view load.

4. **Task UI (`src/components/tasks/TaskDrawer.tsx`, `src/components/tasks/TaskTable.tsx`)**:
   - In `TaskDrawer`: Add "Lặp lại định kỳ" section/switch:
     - Switch `isRecurring`
     - Frequency Select: Hàng ngày / Hàng tuần / Hàng tháng
     - Days of week Select (for weekly): Thứ 2 .. Chủ nhật
     - Optional End Date (`recurrenceEndDate`)
   - In `TaskTable`: Show recurrence icon badge (`SyncOutlined`) next to task name.

5. **GitHub Sync Improvements (`src/services/github/githubApi.ts`, `src/components/settings/GitHubSyncCard.tsx`, `src/components/settings/GitHubConfigCard.tsx`)**:
   - In `GitHubSyncCard`: Clarify description on 404 to include branch name and prompt to "Đẩy lên GitHub" if first time.
   - In `GitHubConfigCard`: Check and display branch name clearly.

6. **Targeted Tests**:
   - `tests/utils/recurrence.test.ts`
   - `tests/components/TaskDrawer.test.tsx` or `tests/db/repos.test.ts`
