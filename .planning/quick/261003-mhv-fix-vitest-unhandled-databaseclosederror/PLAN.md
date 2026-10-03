# Quick Task 261003-mhv: Fix Vitest unhandled DatabaseClosedError in shell.test.tsx

## Problem
In `tests/shell.test.tsx`, `App Integration & Hash Route & Live Query` describe block uses:
```tsx
beforeEach(async () => {
  cleanup();
  window.location.hash = '#/tasks';
  await db.delete();
  await db.open();
  await initializeDatabaseDefaults();
});
```
When `renders TasksView with search and quick add on tasks route` runs, `<TasksView />` mounts and establishes 3 active `useLiveQuery` subscriptions (`db.tasks`, `getAllProjects`, `getAllMilestones`).
At the start of the next test's `beforeEach`, `await db.delete()` closes the database connection before Dexie's live queries are torn down. This causes 3 unhandled rejections: `DatabaseClosedError: Database has been closed`.

## Solution
1. In `tests/shell.test.tsx`:
   - Import `resetDatabaseToDefaults` from `../src/db/seeds` instead of `initializeDatabaseDefaults`.
   - In `beforeEach`:
     - Clear and reseed tables using `await resetDatabaseToDefaults(db)` instead of deleting/closing the database via `db.delete()`.
     - Ensure `await db.open()` is called if closed.
   - Add `afterEach(async () => { cleanup(); })` to cleanly unmount the rendered React components after each test so all Dexie subscriptions are unsubscribed before any subsequent test runs.
   - In `afterAll`: cleanly delete/close the database `await db.delete()`.
2. Verify all tests pass without unhandled rejections using `npm test -- tests/shell.test.tsx`.

## Tasks
- [ ] Task 1: Update `tests/shell.test.tsx` DB lifecycle and cleanup hooks
- [ ] Task 2: Run Vitest and verify 0 unhandled errors
