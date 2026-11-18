---
phase: 38-hard-token-budget-accurate-measurement
plan: 04
subsystem: database
tags: [dexie, transactions, token-budget, ai-office, wr-13, double-increment]

# Dependency graph
requires:
  - phase: 38-hard-token-budget-accurate-measurement
    plan: 01
    provides: AiTeam.budgetWarnThresholdPct, clampBudgetWarnThresholdPct
  - phase: 38-hard-token-budget-accurate-measurement
    plan: 03
    provides: splitEvenly (the single home of the even-split rule)
  - phase: 38-hard-token-budget-accurate-measurement
    plan: 05
    provides: setTeamThresholdPct(pct | undefined)
provides:
  - applyTopUp (additive, two-table transaction; agent and team scopes)
  - applyTeamBudgetSettings (absolute, two-table transaction; three-state threshold)
  - topUpMemberBudget kept as a @deprecated forwarding shim
  - coordinator topUp with a fresh roster read (WR-13 closed)
  - coordinator applyBudgetSettings (mirror a persisted save, no Dexie write)
  - clearBudgetWarnings no-op stub for plan 08
affects: [38-08, 38-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two verbs, two repo functions: additive top-up vs absolute settings save; mixing them is the double-increment bug"
    - "Roster read inside the rw transaction, never from a coordinator cache — a mid-turn member is addressable"
    - "Coordinator mirrors a persisted result; it never re-derives a delta"
    - "Three-state optional: `=== null` (delete) tested before `!== undefined` (store), so `??` never collapses them"

key-files:
  created:
    - tests/components/ai/office/SettingsSaveBudget.test.tsx
  modified:
    - src/db/repositories/aiTeamRepo.ts
    - src/services/ai/office/teamRunCoordinator.ts
    - src/components/ai/office/TeamWorkspace.tsx
    - tests/services/ai/office/aiTeamRepo.test.ts
    - tests/services/ai/office/teamRunCoordinator.test.ts
    - tests/views/TeamsView.test.tsx

key-decisions:
  - "applyTopUp returns { team, members } so the coordinator adopts the full post-write roster instead of re-reading it"
  - "topUpMemberBudget resolves its row to teamId/agentId and forwards to applyTopUp — no member-only increment survives"
  - "applyTeamBudgetSettings validates with Math.max(0, Math.round(...)) and deliberately does NOT use zod on the threshold: the zod path refuses 0, the settings path clamps 0 to 1"
  - "handleSaveSettings passes `input.budgetWarnThresholdPct ?? undefined` to setTeamThresholdPct because null and undefined both mean inherit at the coordinator boundary"
  - "TeamsView's WR-12 rejection test now rejects applyTeamBudgetSettings — the call the save actually makes"

requirements-completed: [AIO-BUDGET-05, AIO-BUDGET-07]

# Metrics
duration: 7min
completed: 2026-11-13
---

# Phase 38 Plan 04: Additive Top-Up and Absolute Settings Save Summary

**Budget writes now have exactly two verbs in one place each — `applyTopUp` adds and `applyTeamBudgetSettings` sets, both across `[aiTeams, aiTeamMembers]` in a single `rw` transaction, so an agent top-up raises the group total with it, a team top-up reaches a member added mid-turn, and a 3000 → 4000 Settings save stays 4000**

## Performance

- **Duration:** 7 min
- **Started:** 2026-11-13T21:32:00Z
- **Completed:** 2026-11-13T21:39:00Z
- **Tasks:** 3
- **Files modified:** 6 (1 created)

## Accomplishments

- `applyTopUp(teamId, scope, amount, db)` is the one additive writer. It reads the team row and the roster with `where('teamId')` INSIDE `db.transaction('rw', [db.aiTeams, db.aiTeamMembers])`, clamps the amount with `Math.max(0, Math.round(amount))`, and moves both rows or neither. Agent scope assigns the whole amount to that member; team scope splits it with `splitEvenly` and ADDS each share to the existing budget (never writes the share alone).
- `topUpMemberBudget` is now a `@deprecated` forwarding shim: it resolves its row's `teamId`/`agentId` and delegates. The member-only increment is gone, so the member share and the group total can no longer drift.
- `applyTeamBudgetSettings(teamId, { budgetTokens, budgets, budgetWarnThresholdPct }, db)` is the one absolute writer. The team total is `input.budgetTokens` verbatim — no `+` against the stored total — and each listed member row is spread so `usedTokens`, `inputTokens`, `outputTokens` and `usageEstimated` survive untouched. An unknown key in `budgets` is ignored, never materialized as a row.
- The threshold override is three-state at this boundary: absent/`undefined` leaves the stored value alone, `null` deletes the key (inherit), a number clamps into 1..100. The branch tests `=== null` before `!== undefined`, so `??` cannot collapse the clear into a no-op.
- Coordinator `topUp` no longer calls `ensureMembers()`. It delegates to `applyTopUp`, then `mirrorBudgetResult` adopts every returned row — including members the coordinator had never seen — so a member added mid-turn is top-up-addressable (WR-13 / D-18). `applyBudgetSettings(result)` exposes the same mirror for the Settings path and writes nothing to Dexie.
- `TeamWorkspace.handleSaveSettings` makes exactly one repo budget call. The `updateTeam(total)` + per-member `topUp`/`topUpMemberBudget`/`setMemberBudget` loop is gone; the coordinator only mirrors the persisted result and receives the threshold as `input.budgetWarnThresholdPct ?? undefined`.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end "top up one agent raises the member share and the group total together"** - `6f5aa59e` (feat)
2. **Task 2: Team-scope top-up distributes across the roster; absolute settings save in one transaction** - `48548278` (feat)
3. **Task 3: Coordinator `topUp` with a fresh roster (WR-13) and `handleSaveSettings` reduced to one call** - `c87e2954` (feat)

**Plan metadata:** committed with this SUMMARY (docs)

## Files Created/Modified

- `src/db/repositories/aiTeamRepo.ts` — `TopUpScopeInput`, `BudgetWriteResult`, `applyTopUp`, `applyTeamBudgetSettings`, `TeamBudgetSettingsInput`; `topUpMemberBudget` reduced to a deprecated shim
- `src/services/ai/office/teamRunCoordinator.ts` — `applyBudgetSettings` on the interface and the returned object; `topUp` rewritten; `mirrorBudgetResult` + `clearBudgetWarnings` stub; imports narrowed to `applyTopUp`
- `src/components/ai/office/TeamWorkspace.tsx` — `handleSaveSettings` one call; `budgetWarnThresholdPct?: number | null | undefined` in its input type; `setMemberBudget`/`topUpMemberBudget` imports dropped
- `tests/services/ai/office/aiTeamRepo.test.ts` — 13 new tests: agent top-up, rollback, team distribution, late roster member, zero/negative no-ops, leader-alone, and the settings-save block (absolute, usage preservation, absent team, under-allocation, unknown key, override keep/clear/undefined/clamp)
- `tests/services/ai/office/teamRunCoordinator.test.ts` — 3 new tests: agent top-up moves both rows without a spurious park, WR-13 mid-turn member, refused top-up surfaces and writes nothing
- `tests/components/ai/office/SettingsSaveBudget.test.tsx` — new: 3000 → 4000 with a coordinator, the same without one, one repo call per save, absent override stays absent
- `tests/views/TeamsView.test.tsx` — the WR-12 failure test now rejects `applyTeamBudgetSettings`, the call the save actually makes

## Decisions Made

- `applyTopUp` returns `{ team, members }` rather than a bare member row. The coordinator needs the full post-write roster to adopt a mid-turn member, and re-reading it outside the transaction would reintroduce the stale-cache class the plan exists to remove.
- `applyTeamBudgetSettings` clamps with `Math.max(0, Math.round(...))` and deliberately does not run zod over the threshold. Per R3-I4 the two writers react differently to the same out-of-band input on purpose: zod refuses `0` at the trust boundary, the settings path treats the clamp as a runtime belt for a value already bounded by `InputNumber min={1}`. The plan's own schema test pins the zod half.
- The coordinator keeps `setTeamBudget` for programmatic edits; the Settings save no longer calls it. `applyBudgetSettings` supersedes it on that path because it also carries the member rows.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `TeamsView` WR-12 test rejected a call the save no longer makes**
- **Found during:** Task 3 verification
- **Issue:** `tests/views/TeamsView.test.tsx` stubbed `updateTeam` to reject and asserted the action-error alert. After the rewrite the save path calls `applyTeamBudgetSettings`, so the stub was never hit and the alert never appeared — the test failed.
- **Fix:** Added `applyTeamBudgetSettings: vi.fn(actual.applyTeamBudgetSettings)` to the module mock and pointed the rejection at it. The assertion (one alert, no raw repo message in the UI) is unchanged.
- **Files modified:** `tests/views/TeamsView.test.tsx`
- **Commit:** `c87e2954`

**2. [Rule 3 - Blocking] `exactOptionalPropertyTypes` rejected the error-narrowing cast**
- **Found during:** Task 2 typecheck
- **Issue:** `applyTopUp(...).catch((err) => err as Error)` typed the result as `BudgetWriteResult | Error`, so `.message` did not exist.
- **Fix:** Cast the awaited result instead of the callback's return.
- **Files modified:** `tests/services/ai/office/aiTeamRepo.test.ts`
- **Commit:** `c87e2954`

## Issues Encountered

The Settings drawer seeds its member rows once per open (`seededFor` ref). Opening it before the `useLiveQuery` roster resolves saves an empty `budgets` map, which made the first draft of `SettingsSaveBudget.test.tsx` assert `memberSum === 3000`. The test now opens the drawer from the sidebar button and waits for a member row before saving — production opens the drawer the same way, so the test exercises the real sequence.

Scoped runs: `tests/services/ai/office/aiTeamRepo.test.ts` 60/60, `tests/services/ai/office/teamRunCoordinator.test.ts` 127/127, `tests/components/ai/office/SettingsSaveBudget.test.tsx` 4/4, `tests/views/TeamsView.test.tsx` 36/36, four `TeamWorkspace*` files 36/36. `npx tsc --noEmit -p tsconfig.json` reports no `error TS` line. `bash .planning/scripts/verify-team-chat-architecture.sh` exits 0.

## User Setup Required

None - no external service configuration required.

## Threat Surface Notes

- T-38-08 (tampering, `applyTopUp`): mitigated — one `rw` over `[aiTeams, aiTeamMembers]`; a missing member row throws before any write, and the rollback test asserts both tables equal their pre-call values.
- T-38-09 (tampering, stale roster): mitigated — the roster is read with `where('teamId')` inside the transaction, `ensureMembers()` is off the path, and the WR-13 test adds a member mid-turn and proves the top-up reaches it.
- T-38-10 (elevation of privilege, ambiguous budget write): mitigated — `Math.max(0, Math.round(amount))` on the additive path; the absolute path sets values only, and the 3000 → 4000 test pins the total.
- T-38-29 (repudiation, double-incremented budget): mitigated — additive and absolute are separate repo functions; the component test asserts one repo call per save, no `topUpMemberBudget`/`setMemberBudget`/`updateTeam` alongside it, and the 4000 total.
- T-38-SC: no package installed in this plan.

## Known Stubs

- `clearBudgetWarnings()` in `teamRunCoordinator.ts` is a deliberate no-op with a comment naming plan 08. It is the seam the D-06 per-(team, level) notification markers fill; the plan's task 3 action explicitly defers the implementation.
- The Settings drawer does not yet send `budgetWarnThresholdPct` (plan 09 owns the override control). Because the key is absent, every save takes the "leave the stored value untouched" branch — correct today, and the component test pins that an absent override stays absent.

## Next Phase Readiness

- Plan 08 can fill `clearBudgetWarnings` and drop the `gateFor(...).open()` / `teamGate.open()` calls from `topUp`; the gates are still present and still unparks the turn, as this plan required.
- Plan 09 can add the drawer's override control and pass `number | null | undefined` straight into `handleSaveSettings`, which already forwards it unchanged into `applyTeamBudgetSettings` and coalesces only at `setTeamThresholdPct`.
- Plan 09 can switch the UI readers to the split columns; `applyTeamBudgetSettings` already preserves them across a settings save.

## Self-Check: PASSED

- `src/db/repositories/aiTeamRepo.ts` exports `applyTopUp` and `applyTeamBudgetSettings`, both containing `db.transaction('rw', [db.aiTeams, db.aiTeamMembers]`.
- `tests/components/ai/office/SettingsSaveBudget.test.tsx` exists.
- Commits `6f5aa59e`, `48548278`, `c87e2954` all exist in `git log`.

---
*Phase: 38-hard-token-budget-accurate-measurement*
*Completed: 2026-11-13*
