---
phase: 01-foundation-deployment-shell
plan: 04
subsystem: ui-database-core
tags: [gap-closure, theme, dexie, concurrency, schema]
dependency_graph:
  requires: [01-01, 01-02, 01-03]
  provides: [accessible-dark-mode-shell, atomic-seed-transaction, unique-dayofweek-index]
  affects: [AppShell, schema, seeds, ResetDbModal, App]
tech_stack:
  added: []
  patterns: [token.colorBgContainer styling, Dexie readwrite transaction for idempotent seeding, &dayOfWeek unique index]
key_files:
  created: []
  modified:
    - src/components/shell/AppShell.tsx
    - src/db/schema.ts
    - src/db/seeds.ts
    - src/App.tsx
    - src/components/common/ResetDbModal.tsx
    - tests/shell.test.tsx
    - tests/db.test.ts
decisions:
  - Header background dynamically references `token.colorBgContainer` with `token.colorBorderSecondary` border instead of static `#fff`, preventing dark mode contrast failure (CR-01).
  - AppShell receives explicit `isDark` boolean from `App` to synchronize Sider theme (`dark` in dark mode, `light` in light mode).
  - Enforced unique index `&dayOfWeek` on `capacityRules` table to prevent duplicate weekday rows (CR-02).
  - `initializeDatabaseDefaults` runs `count()` and `bulkAdd()` within an atomic `targetDb.transaction('rw', targetDb.capacityRules, ...)` catching `ConstraintError` on race condition (CR-02).
  - `App.tsx` queries capacity rules ordered by `dayOfWeek` (WR-01).
  - `ResetDbModal.tsx` catches reset promise errors with logging (WR-02).
metrics:
  duration: 6m
  completed_date: "2026-09-26"
---

# Phase 01 Plan 04: Gap Closure Summary

Resolved code review and verification report findings: Header dark mode contrast (CR-01), capacity rule concurrency race (CR-02), dayOfWeek sorting (WR-01), and reset error handling (WR-02).

## What Was Done

1. **Dark Mode Header & Sider Contrast (CR-01)**:
   - Updated `AppShell.tsx` to read `token.colorBgContainer` and `token.colorBorderSecondary` via `theme.useToken()`.
   - Dynamic Sider theme switching (`theme={isDark ? 'dark' : 'light'}`) passed via `isDark` prop from `App.tsx`.
   - Updated `tests/shell.test.tsx` to test dark mode rendering and verify elimination of hardcoded `#fff` / `rgb(255, 255, 255)`.

2. **Database Concurrency & Schema Uniqueness (CR-02, WR-01, WR-02)**:
   - Updated `SCHEMA_V1` in `src/db/schema.ts` to add unique index: `capacityRules: 'id, &dayOfWeek'`.
   - Wrapped `initializeDatabaseDefaults` in `src/db/seeds.ts` in an atomic readwrite transaction on `targetDb.capacityRules`.
   - Handled Dexie `ConstraintError` gracefully during multi-tab or concurrent component initialization.
   - Updated `src/App.tsx` live query to sort rules by `dayOfWeek`: `db.capacityRules.orderBy('dayOfWeek').toArray()`.
   - Added `catch (err)` error boundary logging to `ResetDbModal.tsx`.
   - Added concurrency test in `tests/db.test.ts` running 3 concurrent initializations with `Promise.all` asserting exactly 7 rules.

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- `npm test`: 5 test files, 30 tests passed.
- `npx tsc --noEmit`: 0 TypeScript errors.
- `npm run build`: Production bundle compiled cleanly.

## Self-Check: PASSED

- FOUND: src/components/shell/AppShell.tsx
- FOUND: src/db/schema.ts
- FOUND: src/db/seeds.ts
- FOUND: src/App.tsx
- FOUND: src/components/common/ResetDbModal.tsx
- FOUND: tests/shell.test.tsx
- FOUND: tests/db.test.ts
- FOUND: commit 06e04a9
- FOUND: commit c2cec60
