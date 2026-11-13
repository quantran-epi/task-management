---
phase: 38-hard-token-budget-accurate-measurement
plan: 08
subsystem: ai
tags: [token-budget, ai-office, warning-only, notification-dedupe, gate-removal]

# Dependency graph
requires:
  - phase: 38-hard-token-budget-accurate-measurement
    plan: 05
    provides: splitUsage, resolveThresholdPct, isAtThreshold, TeamRunSnapshot.budgetWarnThresholdPct, tests/helpers/teamRunSnapshot.ts
  - phase: 38-hard-token-budget-accurate-measurement
    plan: 07
    provides: usageAccounting, provisionalInputTokens, TeamRunSnapshot.memberUsage, terminal flush
provides:
  - src/services/ai/office/budgetWarning.ts (dispatchBudgetWarning, resetBudgetWarnings, resetAllBudgetWarnings)
  - gate-free beforeToolRoundFor (drain + abort only)
  - TeamRunSnapshot.budgetWarnings { member, team }
  - team+level notification markers with team-scoped reset
  - removal of BudgetGate, createBudgetGate, bucketOf, shouldNotifyPause, normalizeUsageTotal
affects: [38-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One marker per (teamId, level), added BEFORE the await so a same-tick race cannot double-send"
    - "Warning evaluation is a pure read over live maps: it dispatches, it never writes a counter or the ledger"
    - "Two independent levels evaluated in a fixed order (member, then team) for a deterministic snapshot"
    - "A failed send clears its own marker, so the next crossing retries (same shape as useTeamChatNotifications)"

key-files:
  created:
    - src/services/ai/office/budgetWarning.ts
    - tests/services/ai/office/budgetWarning.test.ts
  modified:
    - src/services/ai/office/budgetGate.ts
    - src/services/ai/office/teamRunCoordinator.ts
    - src/components/ai/office/TeamWorkspace.tsx
    - tests/helpers/teamRunSnapshot.ts
    - tests/services/ai/office/budgetGate.test.ts
    - tests/services/ai/office/teamRunCoordinator.test.ts

key-decisions:
  - "The member level is evaluated across every known member and dispatches at most one notification per team — the marker key is (teamId, level), never the agent id"
  - "budgetWarnings.member is the aggregate flag (ANY member at or past its share); the per-member badge stays plan 09's surface"
  - "pausedAgentId/pausedAgentName stay on the snapshot as always-null legacy fields because the parked phase value is still legal in old backups"
  - "The estimated terminal charge now evaluates warnings too — with the gate gone there is no decision left for an estimate to influence"
  - "TeamWorkspace's awaiting-budget banner is left in place but unreachable; plan 09 replaces the warning surface"

requirements-completed: [AIO-BUDGET-01, AIO-BUDGET-06, AIO-BUDGET-09]

# Metrics
duration: 14min
completed: 2026-11-13
---

# Phase 38 Plan 08: Warning-Only Budget, One Notification per Team per Level Summary

**The budget gate is gone: a turn far past 100% of both the member share and the group total runs to completion, raises a mild member warning and a strong team warning, and sends exactly one OS notification per level per team however many rounds or teammates cross**

## Performance

- **Duration:** 14 min
- **Started:** 2026-11-13T22:07:00Z
- **Completed:** 2026-11-13T22:21:00Z
- **Tasks:** 3
- **Files modified:** 8 (2 created)

## Accomplishments

- `beforeToolRoundFor` is a drain and an abort check. No gate, no `wait`, no `paused` status write — `grep -c "awaiting-budget" src/services/ai/office/teamRunCoordinator.ts` returns 0 and `derivePhase` has no budget branch.
- `budgetWarning.ts` keys markers as `${teamId}:${level}` and adds the marker BEFORE awaiting the send, so two reports settling in the same tick cannot double-send. A failed or throwing send deletes its marker so the next crossing retries.
- Both levels are evaluated independently on every observation and again at dispatch from plan 07's `provisionalInputTokens` — so a prompt that already blows the share warns before the model is called, and the persisted row is still `0/0` at that moment (asserted).
- The member warning fires at most once per team regardless of how many teammates cross: two members crossing in one run produce one member-level notification, and five successive rounds past both thresholds produce one per level.
- Resets are team-scoped: `topUp` and `applyBudgetSettings` go through `mirrorBudgetResult` → `resetBudgetWarnings(teamId)`, `send()` resets at turn start, and `dispose()` uses the same team-scoped call. `resetAllBudgetWarnings` has exactly one occurrence in `src/` — its own definition.
- `budgetGate.ts` keeps `UsageSplit`, `splitUsage`, `resolveThresholdPct`, `isAtThreshold`, `nextThresholdOverride` and the eight-point policy docstring; the gate, `bucketOf`, `shouldNotifyPause` and `normalizeUsageTotal` are deleted with their ten tests. The module still has a production importer (`teamRunCoordinator.ts`), so the dead-module gate passes.
- Snapshot widened once: `budgetWarnings` added to `TeamRunSnapshot`, `EMPTY_SNAPSHOT` and `makeTeamRunSnapshot`; the four `TeamWorkspace*` stubs and `SettingsSaveBudget` build from the helper and needed no edits.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end "a turn over 100% keeps running and raises one warning per level"** — `c2a2643b` (feat)
2. **Task 2: Delete the gate implementation and its tests; keep the threshold math** — `783b9a8c` (refactor)
3. **Task 3: Invariant sweep — no latent blocking behaviour or agent-keyed dedupe** — `3395a0f4` (test)

**Plan metadata:** committed with this SUMMARY (docs)

## Files Created/Modified

- `src/services/ai/office/budgetWarning.ts` — new; `BudgetWarningLevel`, `BudgetWarning`, `dispatchBudgetWarning`, `resetBudgetWarnings`, `resetAllBudgetWarnings`; body templated from percent + name only
- `src/services/ai/office/teamRunCoordinator.ts` — gate state, `gateFor`, `lastBuckets`, `lastTeamBucket` and every gate call removed; `evaluateBudgetWarnings`, `memberWarningTotal`, `percentOf`, `agentNameFor`, `anyMemberAtThreshold` added; `budgetWarnings` on the snapshot; team-scoped resets on `send`/`topUp`/`dispose`
- `src/services/ai/office/budgetGate.ts` — gate implementation deleted; math and policy docstring retained
- `src/components/ai/office/TeamWorkspace.tsx` — `EMPTY_SNAPSHOT.budgetWarnings`
- `tests/helpers/teamRunSnapshot.ts` — `budgetWarnings` default
- `tests/services/ai/office/budgetGate.test.ts` — ten gate tests and the `normalizeUsageTotal` test removed; 13 math tests remain
- `tests/services/ai/office/budgetWarning.test.ts` — new; 9 tests over the dispatcher's identity, scoped reset, failure retry and payload shape
- `tests/services/ai/office/teamRunCoordinator.test.ts` — every parked assertion rewritten; desktop-notification mock added; 9 new warning tests including the no-gate invariant

## Decisions Made

- **The member level dispatches once per team, not once per member.** The loop breaks at the first member at or past its share, and the marker key ignores the agent entirely. A per-member marker would re-notify for every teammate, which is the spam T-38-21 exists to prevent; plan 09's badge is the per-member surface.
- **`budgetWarnings.member` is an aggregate.** It answers "is anyone over their share" for the header; the drawer and sidebar colour per member from `memberUsage` with the same `isAtThreshold` comparison.
- **`pausedAgentId`/`pausedAgentName` stay, always null.** The plan forbids deleting the parked phase value (old backups), and the banner that reads these fields is still rendered on that phase. Removing the fields would have been a wider change than the plan asked for.
- **The estimated terminal charge now evaluates warnings.** Plan 07 skipped gate evaluation for estimates because closing the gate was a decision an estimate must not make. With no gate, the only remaining effect is a warning, and D-07 explicitly wants the estimate to feed warnings.
- **`setTeamBudget` lost its gate reopen.** It now only mirrors the total; the warning flags are derived from live numbers on every `getState()`, so no stored bucket can go stale.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan 07's `evaluateGates` flag became dead and misnamed**
- **Found during:** Task 1 (rewriting `applyLiveUsage`)
- **Issue:** `applyLiveUsage(agentId, input, output, evaluateGates = true)` existed only to skip gate evaluation for an estimate. With the gate deleted the parameter had no meaning, and the terminal estimate's `false` argument would have silently suppressed the D-07 warning the plan asks for.
- **Fix:** dropped the parameter; every charge path now calls `evaluateBudgetWarnings()`, including the terminal estimate.
- **Files modified:** `src/services/ai/office/teamRunCoordinator.ts`
- **Commit:** `c2a2643b`

**2. [Rule 1 - Bug] Two stale `paused` branches became unreachable**
- **Found during:** Task 1 (employee and lead turn tails)
- **Issue:** both turns awaited `agentDeferreds.get(id)?.promise` when the agent was `paused`. Nothing sets `paused` any more, so the branch was dead code that would have hung forever if it ever ran.
- **Fix:** both branches deleted; the turns settle directly.
- **Files modified:** `src/services/ai/office/teamRunCoordinator.ts`
- **Commit:** `c2a2643b`

## Issues Encountered

- A combined six-file Vitest invocation printed only a one-line "1 matches in 1F" fragment instead of a summary. Re-running the two groups separately gave clean results (23/23 and 36/36); the coordinator file alone is 149/149. No test failure was observed in any run.
- `pausedAgentName`'s IN-08d fallback label disappeared with the field's producer; the banner still guards on a non-null name, so no raw UUID can reach UI copy.

Scoped runs: `tests/services/ai/office/teamRunCoordinator.test.ts` 149/149, `tests/services/ai/office/budgetGate.test.ts` + `budgetWarning.test.ts` 23/23, four `TeamWorkspace*` files 36/36, `SettingsSaveBudget.test.tsx` included in an earlier 40/40 five-file run. `npx tsc --noEmit -p tsconfig.json` prints no `error TS` line. `bash .planning/scripts/verify-team-chat-architecture.sh` exits 0 (dead-module check finds importers for both `budgetGate` and `budgetWarning`).

## User Setup Required

None - no external service configuration required. No package installed.

## Threat Surface Notes

- T-38-20 (information disclosure, notification body): mitigated — the body is `"<name> đã dùng <pct>% …"` or `"Nhóm đã dùng <pct>% …"`, and a coordinator test sends a secret-bearing prompt and model output and asserts neither appears in any captured title or body.
- T-38-21 (attention DoS, notification spam): mitigated — one marker per `(teamId, level)`; tests assert two members crossing send one member notification and five successive rounds send one per level.
- T-38-22 (tampering, gate removal): mitigated — the gate is deleted, not dormant; `grep -rn "createBudgetGate\|shouldNotifyPause\|bucketOf\|normalizeUsageTotal" src/` returns nothing, and the no-gate test walks three over-budget rounds asserting no `paused` status and no parked phase.
- T-38-33 (cross-team reset): mitigated — resets filter on the `${teamId}:` prefix; tests assert a top-up on team A leaves team B's marker intact and a dispose on team A does the same, and `resetAllBudgetWarnings` has no production caller.
- T-38-SC: no package installed in this plan.

## Known Stubs

None. `TeamWorkspace`'s `awaiting-budget` banner is unreachable but not a stub — it renders only on a phase nothing produces, and plan 09 replaces the warning surface with the two badges.

## Next Phase Readiness

- Plan 09 can render the two badges from `getState().budgetWarnings` and colour each member from `memberUsage` with `isAtThreshold`, all against `budgetWarnThresholdPct`.
- The drawer's reset control still lands on `setTeamThresholdPct(undefined)`; plan 09 owns the drawer→Dexie traversal test.
- `AgentPausedBanner` is now dead UI. Plan 09 should decide whether to delete it or repurpose it for the strong team warning.

## Self-Check: PASSED

- `src/services/ai/office/budgetWarning.ts`, `tests/services/ai/office/budgetWarning.test.ts`, `src/services/ai/office/budgetGate.ts`, `src/services/ai/office/teamRunCoordinator.ts` all present.
- Commits `c2a2643b`, `783b9a8c`, `3395a0f4` all exist in `git log`.
