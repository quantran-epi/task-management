# Quick Task 261003-set: Fix SettingsView test timeout in CI

## Problem
In CI (GitHub Actions), test suite failed with:
```
FAIL tests/views/SettingsView.test.tsx > SettingsView Integration & Offline Independence (SYNC-07, SYNC-05) > renders Jira tab and mounts JiraConfigCard when selected (D-02)
Error: Test timed out in 5000ms.
```
1. `SettingsView.test.tsx` mounts full integration views with complex Ant Design tab panels and Dexie `useLiveQuery` subscriptions.
2. In `tests/views/SettingsView.test.tsx`, `afterEach` called `await db.delete()` without calling `@testing-library/react` `cleanup()` and `await db.close()`. This left active Dexie queries running in unmounted or un-cleaned DOM, causing database deletion to hang or stall next tests.
3. Vitest has no `testTimeout` set in `vite.config.ts`, defaulting to 5000ms. On 2-core GitHub Actions runners running 147 test files with CPU contention, rendering full Ant Design tabs can take slightly over 5 seconds. Test 4 in `SettingsView.test.tsx` already had an explicit 30000ms timeout, but Test 2 did not.

## Solution
1. In `tests/views/SettingsView.test.tsx`:
   - Import `cleanup` from `@testing-library/react`.
   - In `afterEach`: call `cleanup()`, `await db.close()`, then `await db.delete()`.
   - Add explicit timeout (15000ms or 30000ms) to the integration tests in `SettingsView.test.tsx`.
2. In `vite.config.ts`:
   - Set `testTimeout: 15000` in the `test` configuration block so CI runners with high CPU load do not fail on heavy component mounts.
3. Verify all tests in `tests/views/SettingsView.test.tsx` pass cleanly and quickly.

## Tasks
- [ ] Task 1: Update `tests/views/SettingsView.test.tsx` with proper cleanup, db closing, and test timeouts.
- [ ] Task 2: Configure `testTimeout: 15000` in `vite.config.ts`.
- [ ] Task 3: Run Vitest test suites and verify all pass.
