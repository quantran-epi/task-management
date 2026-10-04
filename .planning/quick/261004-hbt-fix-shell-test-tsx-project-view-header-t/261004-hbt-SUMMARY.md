# Quick Task 261004-hbt: Fix ProjectsView Header Title Assertion in shell.test.tsx Summary

- **Plan:** `261004-hbt`
- **Subsystem:** `tests`
- **Completed:** 2026-10-04

## One-liner

Updated ProjectsView header assertion in `tests/shell.test.tsx` to match `Dự án & Cột mốc` PageHeader title.

## Key Changes

- `tests/shell.test.tsx`: Replaced obsolete expectation `'Phân cấp công việc'` with `'Dự án & Cột mốc'` on hash change navigation to `#/projects`.

## Commits

- `06306bc`: `fix(test): update ProjectsView header title assertion in shell.test.tsx`

## Verification

- Automated test run: `npx vitest run tests/shell.test.tsx` passed with 6/6 tests passing.

## Self-Check: PASSED
