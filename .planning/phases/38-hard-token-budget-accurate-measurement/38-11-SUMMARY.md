---
phase: 38-hard-token-budget-accurate-measurement
plan: 11
subsystem: ai
tags: [token-budget, settings, antd, dexie, ai-office]

# Dependency graph
requires:
  - phase: 38-hard-token-budget-accurate-measurement
    plan: 01
    provides: DEFAULT_BUDGET_WARN_THRESHOLD_PCT and clampBudgetWarnThresholdPct in src/types/aiOffice.ts
provides:
  - BUDGET_WARN_THRESHOLD_SETTING_KEY = 'ai_budget_warn_threshold_pct'
  - getGlobalBudgetWarnThresholdPct(db)
  - setGlobalBudgetWarnThresholdPct(value, db)
  - BudgetWarnThresholdCard (Settings AI tab)
affects: [38-05, 38-12]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Settings reader clones the nineRouterTokenService guard: typeof === 'number' plus default fallback, no new validation library"
    - "Writer clamps before put and the reader re-validates on the way out — two independent guards on one row"
    - "The card loads through the same service function the coordinator will call, so UI and runtime read one code path"

key-files:
  created:
    - src/services/ai/budgetWarnSettings.ts
    - src/components/settings/BudgetWarnThresholdCard.tsx
    - tests/services/ai/budgetWarnSettings.test.ts
  modified:
    - src/views/SettingsView.tsx

key-decisions:
  - "Non-numeric or out-of-band stored value falls back to 80 rather than clamping on read: a corrupt row is treated as unset, not silently rewritten to a boundary the user never chose"
  - "No denylist edit and no whitelist widening; a test pins that ai_budget_warn_threshold_pct passes isSafeBackupSetting by construction"
  - "No component test for the card — the plan's own reasoning holds: a numeric input with no behaviour beyond a setter would be a vacuous assertion"

requirements-completed: [AIO-BUDGET-06]

# Metrics
duration: 2min
completed: 2026-11-13
---

# Phase 38 Plan 11: Global Budget-Warn Threshold Summary

**Global budget-warning threshold persisted in the `settings` table under `ai_budget_warn_threshold_pct`, with a clamp-on-write/validate-on-read service pair and a 1..100 InputNumber card mounted in the Settings AI tab**

## Performance

- **Duration:** 2 min
- **Started:** 2026-11-13T14:21:20Z
- **Completed:** 2026-11-13T14:21:53Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- `budgetWarnSettings.ts` exports the setting key plus a reader/writer pair, both defaulting `db` to `defaultDb` so the coordinator (plan 05) and the Settings card share one row and one guard.
- Reader: absent, non-numeric (`'65'`), or out-of-band (`0`, `1000`) all fall back to `DEFAULT_BUDGET_WARN_THRESHOLD_PCT` (80); a stored `65` reads 65 and a stored `100` reads 100.
- Writer clamps through `clampBudgetWarnThresholdPct` before `put`, so `0` stores 1 and `1000` stores 100.
- `BudgetWarnThresholdCard` renders the effective value as `${value}%`, states the 1..100 limit, and explains that crossing the threshold raises an in-app badge plus one OS notification per level and never stops the run (D-01/D-02).
- Mounted immediately after `<NineRouterConfigCard db={db} />` in the AI tab.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end "a saved global percentage reads back the same number"** — `2c0b19fc` (feat)
2. **Task 2: Global threshold Settings card, mounted in SettingsView** — `2ba27594` (feat)

**Plan metadata:** committed with this SUMMARY (docs)

## Files Created/Modified

- `src/services/ai/budgetWarnSettings.ts` — the key constant, `getGlobalBudgetWarnThresholdPct`, `setGlobalBudgetWarnThresholdPct`
- `tests/services/ai/budgetWarnSettings.test.ts` — 8 tests against a real `TaskPlannerDatabase`: absent→80, 65→65, 0/1000→80, `'65'`→80, 100→100, clamp-on-write, round-trip, whitelist pass
- `src/components/settings/BudgetWarnThresholdCard.tsx` — Card + `InputNumber` (`min=1`, `max=100`, `step=1`, `precision=0`) + save button, both carrying `data-testid="budget-warn-threshold-*"`
- `src/views/SettingsView.tsx` — import plus mount in the AI tab

## Decisions Made

- Out-of-band reads fall back to the default instead of clamping. A clamped read would silently rewrite a corrupt row into a boundary the user never picked; treating it as unset is the honest reading and matches the `nineRouterTokenService` guard style.
- No whitelist edit. `ai_budget_warn_threshold_pct` carries no `_token`/`_key`/`_passphrase`/`_secret`/`_pat` suffix, so it passes `isSafeBackupSetting` by construction — and a test now pins that so a future suffix rule cannot silently drop it.
- No card test file, per the plan: the behaviour worth testing lives in the service, and a numeric input asserting its own setter would be vacuous.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Scoped runs: `tests/services/ai/budgetWarnSettings.test.ts` 8/8 and `tests/validation/backupSchemas.test.ts` 20/20 green. `npx tsc --noEmit -p tsconfig.json` reports no `error TS` line.

## User Setup Required

None - no external service configuration required.

## Threat Surface Notes

- T-38-12 (tampering, `setGlobalBudgetWarnThresholdPct`): mitigated — the writer clamps before `put` and the reader re-validates on the way out; tests cover both directions (`0`→1 stored, `1000`→80 on read).
- T-38-31 (information disclosure, settings key): mitigated — the key holds a percentage, matches no denylist entry and no secret suffix; `isSafeBackupSetting` is asserted rather than widened.
- T-38-SC: no package installed in this plan.

## Known Stubs

None.

## Next Phase Readiness

- Plan 05 (coordinator) can call `getGlobalBudgetWarnThresholdPct(db)` for the global default and layer the per-team `budgetWarnThresholdPct` override on top; both paths now exist.
- Plan 12 still owes the SQLite/parity confirmation; this plan adds no schema and no new table, so nothing there changes.

## Self-Check: PASSED

- `src/services/ai/budgetWarnSettings.ts`, `src/components/settings/BudgetWarnThresholdCard.tsx`, `tests/services/ai/budgetWarnSettings.test.ts` all present.
- Commits `2c0b19fc` and `2ba27594` exist in `git log`.
