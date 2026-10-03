---
phase: quick
plan: 261003-mhv
type: execute
wave: 1
depends_on: []
files_modified:
  - tests/shell.test.tsx
autonomous: true
requirements: [FIX-SHELL-TEST]

must_haves:
  truths:
    - "Vitest runs tests/shell.test.tsx cleanly with 0 unhandled errors and 0 unhandled rejections"
    - "All 6 integration and unit tests in tests/shell.test.tsx pass"
  artifacts:
    - path: "tests/shell.test.tsx"
      provides: "Integration test lifecycle with atomic table reset and unmount cleanup"
  key_links:
    - from: "tests/shell.test.tsx"
      to: "src/db/seeds.ts"
      via: "resetDatabaseToDefaults(db)"
      pattern: "resetDatabaseToDefaults"
---

<objective>
Fix Vitest unhandled `DatabaseClosedError: Database has been closed` rejections in `tests/shell.test.tsx`.

Purpose: Prevent test pollution and unhandled promise rejections caused by closing Dexie database connections while `useLiveQuery` component subscriptions remain active.
Output: Updated `tests/shell.test.tsx` utilizing `resetDatabaseToDefaults(db)` and proper test lifecycle unmount cleanup.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@tests/shell.test.tsx
@src/db/seeds.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace db.delete() with resetDatabaseToDefaults and add afterEach cleanup in shell.test.tsx</name>
  <files>tests/shell.test.tsx</files>
  <action>
    In `tests/shell.test.tsx`:
    1. Import `afterEach` from `vitest` alongside `describe`, `it`, `expect`, `vi`, `beforeEach`.
    2. Import `resetDatabaseToDefaults` from `../src/db/seeds` instead of `initializeDatabaseDefaults`.
    3. In the `App Integration & Hash Route & Live Query` describe block, add an `afterEach(async () => { cleanup(); });` hook to guarantee mounted React trees with `useLiveQuery` subscriptions unmount before the next test runs.
    4. In `beforeEach(async () => { ... })` of the integration suite:
       - Replace `await db.delete(); await db.open(); await initializeDatabaseDefaults();` with `await resetDatabaseToDefaults(db);`.
       - Keep `cleanup();` and `window.location.hash = '#/tasks';`.
    Do not alter test assertions or navigation expectations.
  </action>
  <verify>
    <automated>npm test -- tests/shell.test.tsx</automated>
  </verify>
  <done>
    `tests/shell.test.tsx` completes with 6 passing tests, 0 unhandled errors, and exit code 0.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Test Runner to In-Memory DB | Test harnesses mutating fake-indexeddb state across test cases |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-QUICK-01 | Denial of Service | tests/shell.test.tsx | mitigate | Use atomic transaction table clearing (`resetDatabaseToDefaults`) without closing Dexie database instance to avoid unhandled rejections during test teardown |
</threat_model>

<verification>
Run `npm test -- tests/shell.test.tsx` and confirm no "Unhandled Rejection" or "DatabaseClosedError" occurs and all test suites pass.
</verification>

<success_criteria>
`tests/shell.test.tsx` runs without unhandled errors, all tests pass, and code changes are isolated to test lifecycle setup and teardown.
</success_criteria>

<output>
Create `.planning/quick/261003-mhv-fix-vitest-unhandled-databaseclosederror/261003-mhv-SUMMARY.md` when execution completes.
</output>
