---
phase: quick
plan: 261005-fxw
subsystem: desktop-persistence
tags: [tauri, window-lifecycle, sqlite, capabilities]
status: complete
requires: []
provides:
  - core:window:allow-destroy capability in default Tauri config
  - resilient close-request handler in useLocalSqlitePersistence
affects:
  - Tauri window closing and destruction
  - SQLite persistence flush on app exit
tech-stack:
  added: []
  patterns:
    - defensive try/catch error boundary on window close hooks
key-files:
  created: []
  modified:
    - src-tauri/capabilities/default.json
    - src/hooks/useLocalSqlitePersistence.ts
    - tests/tauriConfig.test.ts
decisions:
  - Add core:window:allow-destroy permission to default capability configuration so desktop windows can be safely destroyed without permission errors.
  - Wrap flushLocalSqliteNow in try/catch inside onCloseRequested callback to prevent flush errors from crashing or blocking window closure.
metrics:
  duration: 5m
  completed_date: "2026-10-05"
actuals:
  tasks: 2
  commits: 2
---

# Quick Plan 261005-fxw: Fix Desktop Window Close Failure Summary

Add `core:window:allow-destroy` permission to Tauri capabilities and catch SQLite flush errors defensively during desktop window close.

## What Was Done

1. **Tauri default capabilities**: Added `"core:window:allow-destroy"` to `src-tauri/capabilities/default.json` alongside `"core:window:allow-close"`.
2. **Configuration test**: Updated `tests/tauriConfig.test.ts` to assert that both close and destroy capabilities exist in `default.json`.
3. **Safe persistence flush**: Wrapped `await flushLocalSqliteNow(db)` in `try/catch` inside `useLocalSqlitePersistence.ts` within the `onCloseRequested` callback to handle errors gracefully without unhandled promise rejections.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking Issue] Ran `npm ci` to restore missing project dependencies**
- **Found during:** Task 2 verification (`npm run build`)
- **Issue:** Several pre-declared npm dependencies (including `@tauri-apps/api`) were not present in `node_modules`.
- **Fix:** Ran `npm ci` to align `node_modules` with `package-lock.json`.
- **Files modified:** `node_modules`

## Verification

- `npm test -- tests/tauriConfig.test.ts`: PASSED (2 tests passed)
- `npm run build`: PASSED (TypeScript compilation and Vite client build succeeded)

## Self-Check: PASSED

- `src-tauri/capabilities/default.json`: FOUND
- `src/hooks/useLocalSqlitePersistence.ts`: FOUND
- `tests/tauriConfig.test.ts`: FOUND
- Commit `5fe0e7f`: FOUND
- Commit `a35d174`: FOUND
