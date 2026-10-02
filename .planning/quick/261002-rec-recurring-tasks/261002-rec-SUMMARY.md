---
task_id: 261002-rec
title: Implement recurring tasks and improve GitHub sync branch diagnostics
created: 2026-10-02
status: complete
---

# Quick Task Summary: Recurring Tasks & GitHub Sync Diagnostics

## Overview
1. Implemented recurring tasks (`daily`, `weekly`, `monthly`) with recurrence interval, custom days of week, and optional end date. When a recurring task is completed (`Done`), the system automatically spawns the next occurrence in IndexedDB.
2. Added visual recurrence badge indicator (`SyncOutlined`) in `TaskTable` and recurrence configuration block in `TaskDrawer`.
3. Improved GitHub Sync error messaging and diagnostics to clearly explain branch existence and prompt the user to push if the backup file does not exist yet.

## Deliverables
- **Models (`src/types/models.ts`)**: `RecurrenceFrequency`, recurrence fields on `Task`.
- **Validation (`src/validation/schemas.ts`, `src/validation/backupSchemas.ts`)**: schemas updated for task creation, update, and backup export/import.
- **Recurrence Logic (`src/utils/recurrence.ts`)**: `computeNextOccurrence`, `spawnNextRecurringTask`.
- **Repository (`src/db/repositories/taskRepo.ts`)**: auto-spawns next recurring task on status `Done`.
- **UI (`TaskDrawer.tsx`, `TaskTable.tsx`)**: recurrence switch, configuration controls, and recurring icon badge.
- **GitHub Sync (`GitHubSyncCard.tsx`)**: clarified 404 message to show the exact branch being queried and guide first-time push.
- **Tests (`tests/utils/recurrence.test.ts`)**: 7 targeted tests covering daily, weekly, monthly calculations and auto-spawning.
