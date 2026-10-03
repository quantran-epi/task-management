---
status: complete
date: 2026-10-03
slug: 261003-set-fix-settingsview-test-timeout-in-ci
---

# Quick Task Summary: Fix SettingsView test timeout in CI

## Problem
In GitHub Actions CI, `tests/views/SettingsView.test.tsx` timed out at 5000ms on `renders Jira tab and mounts JiraConfigCard when selected (D-02)`.
Cause:
1. `SettingsView` mounts full tab views with complex Ant Design components and Dexie `useLiveQuery` subscriptions.
2. In `afterEach`, `await db.delete()` was called without `@testing-library/react` `cleanup()` and `db.close()`, causing lingering active queries on the open IndexedDB instance.
3. Vitest default `testTimeout` was 5000ms. On CI runners with 147 test files running sequentially under CPU load, component rendering took slightly over 5 seconds.

## Changes Made
1. **`vite.config.ts`**:
   - Added `testTimeout: 15000` to the Vitest config block to protect against CI runner CPU throttling.
2. **`tests/views/SettingsView.test.tsx`**:
   - Added `cleanup()` and `await db.close()` before `await db.delete()` in `afterEach`.
   - Used unique database name per test with random suffix.
   - Added explicit `15000` ms timeout to `SettingsView` integration tests.

## Verification
- `npx vitest run tests/views/SettingsView.test.tsx`: 5/5 passed.
- `npm run build`: successful production build.
