---
phase: 38-hard-token-budget-accurate-measurement
plan: 05
subsystem: ai
tags: [token-budget, ai-office, threshold, usage-split, test-helper]

# Dependency graph
requires:
  - phase: 38-hard-token-budget-accurate-measurement
    plan: 01
    provides: DEFAULT_BUDGET_WARN_THRESHOLD_PCT, clampBudgetWarnThresholdPct, AiTeam.budgetWarnThresholdPct
  - phase: 38-hard-token-budget-accurate-measurement
    plan: 11
    provides: getGlobalBudgetWarnThresholdPct(db)
provides:
  - UsageSplit + splitUsage (input/output retained, cache charged as input, total-only flagged)
  - resolveThresholdPct (override -> global -> 80, always an integer in 1..100)
  - isAtThreshold (inclusive raw comparison, zero budget never reached)
  - nextThresholdOverride (undefined = inherit, the only clear mechanism)
  - TeamRunSnapshot.budgetWarnThresholdPct + budgetWarnThresholdPctOverride
  - TeamRunCoordinator.setTeamThresholdPct(pct | undefined)
  - tests/helpers/teamRunSnapshot.ts (makeTeamRunSnapshot)
affects: [38-08, 38-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Override vs effective kept as two state slots; the snapshot omits the override key when inheriting (exactOptionalPropertyTypes)"
    - "Global default read once at construction and on every setter call, never per report"
    - "One shared test helper owns the snapshot stub; four drifted copies collapsed into it"

key-files:
  created:
    - tests/helpers/teamRunSnapshot.ts
  modified:
    - src/services/ai/office/budgetGate.ts
    - src/services/ai/office/teamRunCoordinator.ts
    - src/components/ai/office/TeamWorkspace.tsx
    - tests/services/ai/office/budgetGate.test.ts
    - tests/services/ai/office/teamRunCoordinator.test.ts
    - tests/components/ai/office/TeamWorkspaceSteer.test.tsx
    - tests/components/ai/office/TeamWorkspaceWhitespaceSubmit.test.tsx
    - tests/components/ai/office/TeamWorkspaceReceipts.test.tsx
    - tests/components/ai/office/TeamWorkspaceTypingCost.test.tsx

key-decisions:
  - "Legacy BudgetGate kept byte-identical; docstring states plainly that this tree is NOT gate-free and plan 08 owns the deletion"
  - "nextThresholdOverride takes `current` for a transition-shaped signature but the rule is stateless: undefined in, undefined out"
  - "Coordinator test's snapshot assertion now compares against makeTeamRunSnapshot instead of a hand-written literal — same dedup reason as the four component stubs"
  - "Global threshold read failure swallows to the default 80 rather than throwing from construction"

requirements-completed: [AIO-BUDGET-06]

# Metrics
duration: 12min
completed: 2026-11-13
---

# Phase 38 Plan 05: Threshold Math and Split Usage Summary

**Budget surface became warning-only math — `splitUsage` retains the input/output split with cache charged as input, `resolveThresholdPct` resolves per-team override over global default over 80, and the coordinator exposes the override and the effective percentage as two distinct snapshot fields**

## Performance

- **Duration:** 12 min
- **Started:** 2026-11-13T21:16:00Z
- **Completed:** 2026-11-13T21:28:00Z
- **Tasks:** 3
- **Files modified:** 10 (1 created)

## Accomplishments

- `budgetGate.ts` gained the four documented exports: `UsageSplit`, `splitUsage`, `resolveThresholdPct`, `isAtThreshold`, plus `nextThresholdOverride`. Its docstring now carries the eight-point usage policy from RESEARCH and says explicitly that the legacy gate is still present and plan 08 deletes it.
- `splitUsage` keeps the split: `{promptTokens:10, completionTokens:5}` → 10/5; cache read 40 + cache creation 5 on top of prompt 10 → input 55 (D-09); `{totalTokens:42}` → 42/0 with `splitInferred: true`; `{}` → all zeros with `estimated: false`.
- `resolveThresholdPct` is total: NaN, 0.5, 0, -3, 1000 and an absent global all land in 1..100 (T-38-11). An absent override inherits the global value, never materializes 80.
- `isAtThreshold` is inclusive on the raw comparison — 799/800/801 at 80 of 1000 → false/true/true — and a zero budget is never "reached".
- Coordinator keeps `teamThresholdOverride` and `budgetWarnThresholdPct` as separate state, reads the global default once at construction (non-blocking, failure falls back to 80) and on every setter call, and returns both from `getState()` — the override key is omitted when inheriting.
- `setTeamThresholdPct(pct | undefined)` is the only setter; `undefined` is the documented inherit-global reset, so no separate clear method exists to leave unreachable.
- `tests/helpers/teamRunSnapshot.ts` is now the single home of the snapshot stub: the four `TeamWorkspace*.test.tsx` files and `teamRunCoordinator.test.ts` all build from it. `grep -rn "getState: () => ({" tests/components/ai/office/` returns 0.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end "a configured percentage reaches the coordinator and decides the warning boundary"** — `1a97c888` (feat)
2. **Task 2: Rewrite the gate tests around percentages; keep the gate implementation for now** — `d8361c38` (test)
3. **Task 3: Coordinator threshold setter coverage — inherit, override, clear, unrelated-save** — `1bfcf5a3` (test)

**Plan metadata:** committed with this SUMMARY (docs)

## Files Created/Modified

- `src/services/ai/office/budgetGate.ts` — eight-point usage policy docstring; `UsageSplit`, `splitUsage`, `resolveThresholdPct`, `isAtThreshold`, `nextThresholdOverride`; legacy gate untouched
- `src/services/ai/office/teamRunCoordinator.ts` — `TeamRunSnapshot` gains both threshold fields; `teamThresholdOverride`/`globalThresholdPct`/`budgetWarnThresholdPct` state; `recomputeThresholdPct`; `setTeamThresholdPct`; non-blocking global read
- `src/components/ai/office/TeamWorkspace.tsx` — `EMPTY_SNAPSHOT` carries `budgetWarnThresholdPct`
- `tests/helpers/teamRunSnapshot.ts` — `makeTeamRunSnapshot(overrides)`
- `tests/services/ai/office/budgetGate.test.ts` — 24 tests: ten retained gate tests, normalizeUsageTotal, four splitUsage shapes, resolution table, boundary table, override transitions
- `tests/services/ai/office/teamRunCoordinator.test.ts` — snapshot-shape assertion uses the helper
- `tests/components/ai/office/TeamWorkspace{Steer,WhitespaceSubmit,Receipts,TypingCost}.test.tsx` — stubs use the helper

## Decisions Made

- The legacy gate stays byte-identical and its ten tests stay. The docstring says so in plain words rather than implying the tree is already gate-free — plan 08 removes implementation, call sites and tests together.
- `nextThresholdOverride(current, input)` keeps `current` in the signature so the rule reads as a transition, but the rule itself is stateless. No duplication of the clamp: it delegates to `clampBudgetWarnThresholdPct`.
- The coordinator test's snapshot literal was also converted to the helper. It was a fifth drifted copy with a stray indentation, and plan 08 widens the shape again.
- The global-threshold read swallows failures to the default 80. Throwing from construction would make a corrupt settings row fatal to opening a team.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

One flaky test: `TeamWorkspaceReceipts.test.tsx` "marks only as far as the visible message without requiring bottom" failed once when six files ran in parallel (expected "1 tin mới", got "2 tin mới"), then passed alone and on an immediate re-run of the same six-file set (184/184). The assertion is about read-cursor timing, untouched by this plan — pre-existing flake, not fixed here (scope boundary).

Scoped runs: `tests/services/ai/office/budgetGate.test.ts` 24/24, `tests/services/ai/office/teamRunCoordinator.test.ts` 124/124, four `TeamWorkspace*` files 36/36, combined 184/184. `npx tsc --noEmit -p tsconfig.json` reports no `error TS` line. `bash .planning/scripts/verify-team-chat-architecture.sh` exits 0 (dead-module check passes — `budgetGate` still has a production importer).

## User Setup Required

None - no external service configuration required.

## Threat Surface Notes

- T-38-11 (tampering, `resolveThresholdPct`): mitigated — every branch rounds and clamps into 1..100; tests cover NaN, 0.5, 0, -3, 1000 and an absent global.
- T-38-13 (information disclosure, future notification body): no notification shipped in this plan. The prohibition is carried in `must_haves.prohibitions` for plan 08.
- T-38-30 (override vs effective conflation): mitigated — two distinct snapshot fields, `undefined` is the inherit sentinel, and tests pin that an absent override is never materialized as 80.
- T-38-SC: no package installed in this plan.

## Known Stubs

None.

## Next Phase Readiness

- Plan 08 can delete the legacy gate and replace `beforeToolRoundFor`'s `gate.wait(...)` with `isAtThreshold` + a notification built from counts, percentages and the agent name only.
- Plan 09 can colour badges on `isAtThreshold` and read `budgetWarnThresholdPct` from the snapshot; the drawer's reset control calls `setTeamThresholdPct(undefined)`.
- Plan 09 still owns the drawer→Dexie traversal test: this plan's override tests are pure/state-level and never cross a repo boundary.

## Self-Check: PASSED

- `tests/helpers/teamRunSnapshot.ts`, `src/services/ai/office/budgetGate.ts`, `src/services/ai/office/teamRunCoordinator.ts`, `tests/services/ai/office/budgetGate.test.ts` all present and modified.
- Commits `1a97c888`, `d8361c38`, `1bfcf5a3` all exist in `git log`.
