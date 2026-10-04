# Quick Task 261004-gn9: Comprehensive AI Tools Full Field Support and Filtering

## Goal
Eliminate tool capability gaps in PlannerMate's AI harness by adding full field filtering, robust sorting, and complete payload serialization for `query_tasks`, `query_projects`, `query_milestones`, `query_notes`, `query_worklogs`, and `query_recurring_tasks`, as well as missing parameters in mutation tools.

## Requirements
1. **Query Filtering & Sorting (`src/services/ai/aiTools.ts`)**:
   - `query_tasks`:
     - Parameters: `createdAfter`, `createdBefore`, `updatedAfter`, `updatedBefore`, `deadlineBefore`, `deadlineAfter`, `workType`, `isRecurring`, `hasDeadline`, `sortBy` ('createdAt' | 'updatedAt' | 'deadline' | 'priority' | 'estimateMinutes' | 'name'), `sortOrder` ('asc' | 'desc').
     - Result payload: Include `createdAt`, `updatedAt`, `notes`, `description`, `reminderDate`, `reminderNote`.
     - Default sorting: default `createdAt desc` so recent tasks are always returned first within limit.
   - `query_projects`:
     - Parameters: `createdAfter`, `createdBefore`, `deadlineBefore`, `deadlineAfter`, `jiraEpicKey`, `sortBy`, `sortOrder`.
     - Result payload: Include `createdAt`, `updatedAt`, `notes`, `opsOwners`, `businessAnalysts`.
   - `query_milestones`:
     - Parameters: `createdAfter`, `createdBefore`, `deadlineBefore`, `deadlineAfter`, `sortBy`, `sortOrder`.
     - Result payload: Include `createdAt`, `updatedAt`, `notes`, `opsOwners`, `businessAnalysts`.
   - `query_notes`:
     - Parameters: `createdAfter`, `createdBefore`, `updatedAfter`, `updatedBefore`, `sortBy`, `sortOrder`.
   - `query_worklogs`:
     - Parameters: `search` (filter notes or task name), `minDuration`, `maxDuration`.
     - Result payload: Include `createdAt`.
   - `query_recurring_tasks`:
     - Parameters: `status`, `projectId`, `recurrenceFrequency`, `search`, `limit`.
     - Result payload: Include `createdAt`, `deadline`, `estimateMinutes`, `workType`.
2. **Mutation Tool Parameter Parity (`src/services/ai/aiTools.ts`)**:
   - `create_task` / `update_task`: add `notes`, `actualStartDate`, `actualEndDate`, `opsOwners`, `businessAnalysts`.
   - `create_project` / `update_project`: add `jiraEpicKey`, `opsOwners`, `businessAnalysts`.
   - `create_milestone` / `update_milestone`: add `notes`, `opsOwners`, `businessAnalysts`.
3. **Verification**:
   - Comprehensive unit tests in `tests/ai/aiTools.test.ts`.
   - Run tests targeting `tests/ai/aiTools.test.ts` (strictly avoiding unrelated tests).

## Tasks
- [ ] Task 1: Update tool definitions and implementations in `src/services/ai/aiTools.ts`.
- [ ] Task 2: Add comprehensive unit tests in `tests/ai/aiTools.test.ts` and verify.
