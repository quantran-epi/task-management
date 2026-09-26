---
phase: 02-work-hierarchy-fast-task-management
plan: 01
subsystem: data-layer
tags: [dexie, indexeddb, zod, repositories, transactions, cascade-delete, time-parsing]
requires:
  - phase: 01-foundation-deployment-shell
    plan: 02
    provides: Dexie database schema, types, and seeds
provides:
  - Zod validation schemas for project, milestone, and task entities
  - Typed Dexie repositories (projectRepo, milestoneRepo, taskRepo, cascadeRepo)
  - Quick-add time syntax parser (~Xh Ym) and human-friendly minute formatter
  - Reparenting with stable UUID preservation and milestone resets
  - Multi-table atomic cascade and orphan deletion transactions
affects:
  - 02-02 (hierarchy view components and task list)
  - 02-03 (quick-add and editing flows)
  - 03 (capacity model and allocation engine)
tech-stack:
  added: []
  patterns:
    - Explicit property assignment for exactOptionalPropertyTypes compliance
    - Atomic Dexie readwrite transactions across projects, milestones, tasks, plannedAllocations
    - LastIndexOf delimiter parsing for trailing ~Xh Ym estimate tokens
key-files:
  created:
    - src/validation/schemas.ts
    - src/utils/time.ts
    - src/db/repositories/projectRepo.ts
    - src/db/repositories/milestoneRepo.ts
    - src/db/repositories/taskRepo.ts
    - src/db/repositories/cascadeRepo.ts
    - tests/db/repos.test.ts
    - tests/utils/time.test.ts
    - tests/db/reparent.test.ts
    - tests/db/cascadeRepo.test.ts
  modified: []
decisions:
  - "Preserved exactOptionalPropertyTypes strict typing in repositories by using conditional assignment rather than spreading undefined values into models."
  - "Quick-add parser uses lastIndexOf('~') and regex matching on the trailing token to handle unspaced and multi-token task names robustly."
  - "Atomic transactions wrap all multi-table deletion routines in cascadeRepo, cleaning up plannedAllocations to eliminate orphaned allocations."
metrics:
  duration: 10m
  completed_date: "2026-09-26"
  tasks_completed: 3
  files_created: 10
---

# Phase 2 Plan 1: Domain Repositories, Schemas & Cascade Deletion Summary

Typed Dexie repositories, Zod validation schemas, time estimate parsing/formatting, safe reparenting logic, and atomic cascade/orphan deletions implemented with full test coverage.

## What Was Built

1. **Zod Validation Schemas (`src/validation/schemas.ts`)**
   - Validates project, milestone, and task create/update payloads at the trust boundary (T-02-01).
   - Validates RFC 4122 v4 UUIDs, strict YYYY-MM-DD calendar dates, valid http/https URLs, and bounded ranges (progress 0-100%, estimate 0-6000 minutes).
   - Separates input schemas from update schemas and exposes typed input definitions.

2. **Domain Repositories (`src/db/repositories/`)**
   - `projectRepo.ts`: Project CRUD, UUID generation via `crypto.randomUUID()`, ISO timestamp tracking, and retrieval methods.
   - `milestoneRepo.ts`: Milestone CRUD linked to project ID, retrieval by project, and updates.
   - `taskRepo.ts`: Standalone, project-level, and milestone-level task creation (WORK-03), status transitions across 6 statuses (TASK-03), soft cancellation persistence (D-15), progress updates, and safe reparenting (WORK-04).
   - `cascadeRepo.ts`: Multi-table atomic Dexie transactions (`db.transaction('rw', ...)`) supporting both cascade delete and orphan re-assignment modes for projects and milestones, as well as task deletion with planned allocation cleanup (D-13, D-14, D-16, WORK-05).

3. **Time Utilities (`src/utils/time.ts`)**
   - `parseQuickAddInput`: Extracts trailing `~Xh Ym`, `~Xh`, `~Ym` estimates from user inputs, returning sanitized names and minute counts clamped to 0-6000 (D-23, D-24).
   - `formatMinutes`: Formats integer minutes into human-readable strings (`"2h 30m"`, `"1h"`, `"45m"`, `"0m"`) per D-22.
   - `validateMinutes`: Validates non-negative integer values within 0-6000 bounds.

## Test Coverage

- `tests/db/repos.test.ts`: 18 tests verifying project, milestone, and task CRUD, input validations, and soft-cancellation persistence.
- `tests/utils/time.test.ts`: 14 tests verifying time syntax parsing, edge cases, formatting, and bounds validation.
- `tests/db/reparent.test.ts`: 5 tests verifying hierarchy transitions across standalone, project-level, and milestone-level while asserting stable UUIDs and automatic milestone resets.
- `tests/db/cascadeRepo.test.ts`: 6 tests verifying cascade mode, orphan mode, allocation cleanup, and Dexie transaction rollback integrity.
- Full suite: 9 test files, 73 tests passing; `tsc --noEmit` clean.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] exactOptionalPropertyTypes compatibility with models**
- **Found during:** Task 1 implementation
- **Issue:** Spreading undefined properties onto model objects violated TypeScript `exactOptionalPropertyTypes: true` compiler setting.
- **Fix:** Switched repository object creation and updates to explicit conditional property assignments.
- **Files modified:** `src/db/repositories/projectRepo.ts`, `src/db/repositories/milestoneRepo.ts`, `src/db/repositories/taskRepo.ts`
- **Commit:** bb56df7

## TDD Gate Compliance

- RED Gate 1: Commit `4decad3` (failing repository tests) -> GREEN Gate 1: Commit `bb56df7`
- RED Gate 2: Commit `c2e1490` (failing time & reparent tests) -> GREEN Gate 2: Commit `84db761`
- RED Gate 3: Commit `ab2cd77` (failing cascade deletion tests) -> GREEN Gate 3: Commit `83b8fd6`

## Self-Check: PASSED
