# Debug Session: Timer Allocation Alert Missing During Active Run & Inverted Table Header

**Gap:** G-12.1-6
**Status:** Resolved

## Symptoms
1. When a task has an allocation/estimate of 1 minute and a timer runs past 1 minute, no warning alert triggers.
2. In `TaskTable`, the column header says `Ước tính / Đã dùng` (Estimate / Spent), but the cell renders `spent / estimate` (e.g. `0m / 1m`).

## Root Cause
1. `evaluateTaskSpentAlert` was only wired inside `handleFinish` in `TaskTable.tsx` after the user manually clicks "Finish". There is no live threshold monitoring while a timer is actively running, nor does `useNotifications` generate alerts for task spent time exceeding estimate/allocation.
2. In `src/components/tasks/TaskTable.tsx` line 367, the column definition header is `title: 'Ước tính / Đã dùng'`, but line 386 renders `<strong>{formatMinutes(spentMinutes)}</strong> / {formatMinutes(estimate)}`.

## Fix
1. Change column title in `TaskTable.tsx` to `'Đã dùng / Ước tính'`.
2. Add live allocation/estimate threshold check (or notification item in `useNotifications.ts` or toast when active timer duration + spent exceeds estimate/allocation).
