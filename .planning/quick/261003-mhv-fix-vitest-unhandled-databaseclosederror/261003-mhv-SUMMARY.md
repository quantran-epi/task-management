---
status: complete
date: 2026-10-03
slug: fix-vitest-unhandled-databaseclosederror
---

# Quick Task Summary: 261003-mhv

**Title:** Fix Vitest unhandled DatabaseClosedError in shell.test.tsx
**Completed:** 2026-10-03
**Status:** Complete

## Objectives Achieved
1. **Prevent Database Connection Teardown Collision:** Replaced destructive `db.delete()` and `db.open()` inside `tests/shell.test.tsx` integration test `beforeEach` with atomic transaction table clearing and seeding via `resetDatabaseToDefaults(db)`.
2. **Explicit Component Lifecycle Unmount:** Added `afterEach(async () => { cleanup(); })` to cleanly unmount rendered `<App />` and unsubscribe active `useLiveQuery` observables (`db.tasks`, `getAllProjects`, `getAllMilestones`) before subsequent tests run.
3. **Zero Unhandled Rejections:** Eliminated all 3 unhandled `DatabaseClosedError: Database has been closed` errors reported by Vitest.

## Key Files Modified
- `tests/shell.test.tsx`

## Verification
- `npm test -- tests/shell.test.tsx` (6 passed, 0 unhandled errors, exit code 0)
- `npm test -- tests/views/Integration.test.tsx tests/shell.test.tsx` (8 passed, 0 unhandled errors)
