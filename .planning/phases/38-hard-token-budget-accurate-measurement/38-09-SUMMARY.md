---
phase: 38-hard-token-budget-accurate-measurement
plan: 09
subsystem: ui
tags: [token-budget, ai-office, sidebar, threshold, badge, drawer, convergence]

# Dependency graph
requires:
  - phase: 38-hard-token-budget-accurate-measurement
    plan: 04
    provides: applyTeamBudgetSettings (three-state budgetWarnThresholdPct), handleSaveSettings one call
  - phase: 38-hard-token-budget-accurate-measurement
    plan: 05
    provides: resolveThresholdPct, isAtThreshold, TeamRunSnapshot.budgetWarnThresholdPct
  - phase: 38-hard-token-budget-accurate-measurement
    plan: 07
    provides: memberUsage (inputTokens/outputTokens/estimated/provisionalInputTokens), reconcileUsage
  - phase: 38-hard-token-budget-accurate-measurement
    plan: 08
    provides: warning-only budget, budgetWarnings snapshot, gate-free coordinator
  - phase: 38-hard-token-budget-accurate-measurement
    plan: 11
    provides: getGlobalBudgetWarnThresholdPct(db)
provides:
  - split granted/used/remaining rendering per member and per group in TeamSidebar
  - budget-badge-member / budget-badge-team (independent levels)
  - TeamSidebar.budgetWarnThresholdPct + liveUsage props
  - BudgetTopUpModal.thresholdPct (BUDGET_PAUSE_THRESHOLD deleted)
  - TeamSettingsDrawer per-team override with a one-call clear
  - applyLiveUsage notifies subscribers (the live half of D-22)
  - AgentPausedBanner deleted
affects: [38-12]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reported usage supersedes the pre-call guess at render time: reportedIn > 0 ? reportedIn : max(row, provisional)"
    - "Every ratio guards granted > 0 and every number passes through a finite-check before toLocaleString"
    - "Threshold resolved once per surface from (team override -> live global -> 80); no literal survives"
    - "Drawer three-state threshold: untouched (undefined) / cleared (null) / override (number), with a touched flag so an unrelated save never materializes the stored value"

key-files:
  created: []
  modified:
    - src/components/ai/office/TeamSidebar.tsx
    - src/components/ai/office/TeamCard.tsx
    - src/components/ai/office/BudgetTopUpModal.tsx
    - src/components/ai/office/TeamSettingsDrawer.tsx
    - src/components/ai/office/TeamWorkspace.tsx
    - src/views/TeamsView.tsx
    - src/types/aiOffice.ts
    - src/services/ai/office/teamRunCoordinator.ts
    - tests/views/TeamsView.test.tsx
    - tests/ai/office/AgentOfficeComponents.test.tsx
    - tests/ai/ActiveAiTurnIndicator.test.tsx
    - tests/components/ai/office/SettingsSaveBudget.test.tsx

key-decisions:
  - "The group total sums every member row, not only the renderable ones, so the header agrees with the ledger the coordinator reconciles against"
  - "A provisional pre-call measurement renders as an estimate too — it is not a provider number, so it carries the ~ marker"
  - "The drawer keeps a `thresholdTouched` flag: seeding the state from the stored override is fine for display, but an untouched save must send `undefined` or an unrelated save would rewrite the override"
  - "AgentPausedBanner is deleted rather than repurposed: `awaiting-budget` is never produced, and its copy claimed a parked turn the warning-only model forbids"
  - "Top-up is team-scoped only; the banner was the sole producer of an agent scope"

requirements-completed: [AIO-BUDGET-08]

# Metrics
duration: 26min
completed: 2026-11-13
---

# Phase 38 Plan 09: Split Budget Rendering and Threshold-Driven Surfaces Summary

**The sidebar now shows granted, used and remaining per member and per group with input and output separate, estimates carry a `~` and an accessible `ước lượng` name, and every colour, badge and top-up preview reads the resolved threshold — with a live global source for both the card list and the workspace, and a drawer clear that reaches Dexie in one call**

## Performance

- **Duration:** 26 min
- **Started:** 2026-11-13T22:33:00Z
- **Completed:** 2026-11-13T22:59:00Z
- **Tasks:** 3 (+1 deviation commit)
- **Files modified:** 12 (1 deleted)

## Accomplishments

- `TeamSidebar` renders `đã dùng {used} ({in} vào / {out} ra) · còn {remaining}/{granted}` per member and `{used} / {granted} token · {pct}%` plus the split line for the group, every number through `toLocaleString()`. A reported number supersedes the pre-call guess (`reportedIn > 0 ? reportedIn : Math.max(row, provisional)`), which is the same rule the planner's warning math uses.
- Estimated rows carry a `~` prefix plus `title="ước lượng"` and `aria-label="ước lượng"`, so the marker is not colour-only. A provisional pre-call measurement counts as estimated — it is not a provider number.
- `budget-badge-member` and `budget-badge-team` are computed from their own numbers and are independent: a member at 900/1000 with the group at 900/4000 renders the member badge and no group badge (asserted).
- Every threshold-sensitive surface reads the resolved percentage. `grep -rn "0\.8\|BUDGET_PAUSE_THRESHOLD" src/components/ai/office/ src/types/aiOffice.ts` returns no match; `BUDGET_PAUSE_THRESHOLD` is deleted.
- `TeamsView` reads `getGlobalBudgetWarnThresholdPct` through `useLiveQuery` once for the whole card list and passes `resolveThresholdPct(team, global)` per card, so a Settings change recolours every card without a reload. `TeamWorkspace` reads the same global for the drawer and passes `snapshot.budgetWarnThresholdPct` to the sidebar and the top-up modal.
- `BudgetTopUpModal` takes `thresholdPct` and renders `Ngưỡng cảnh báo ({pct}%)` with the token value that percentage represents. The test proves the label is prop-driven: 80 renders `8,000 token`, a rerender at 65 renders `(65%)` and `6,500 token` with `(80%)` absent.
- The drawer's override is three-state: untouched sends `undefined` (stored value untouched), the clear control sends `null` (delete the key, inherit), a typed number sends the number. Both paths are proven across the layer boundary in `SettingsSaveBudget.test.tsx` against the payload that reaches `applyTeamBudgetSettings`, and the clear also asserts `coordinator.setTeamThresholdPct(undefined)`.
- The convergence test drives one real usage report through the workspace, captures the sidebar while the turn is held open, releases it, and asserts the settled text equals the `listTeamMembers` rows — with no `NaN`, `undefined` or `Infinity` in either capture.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end "the sidebar shows one real turn's split numbers, live and after settle"** — `7f8c8b7a` (feat)
2. **Task 2: Threshold-driven card colour, top-up preview, and the per-team override field** — `1c2bd422` (feat)
3. **Task 3: Convergence test — live numbers match the ledger after a turn ends** — `8b7a38b5` (test)
4. **Deviation: delete the unreachable paused banner** — `a3a22c2c` (refactor)

**Plan metadata:** committed with this SUMMARY (docs)

## Files Created/Modified

- `src/components/ai/office/TeamSidebar.tsx` — split figures per member and group, `~` marker, two independent badges, threshold-driven stroke and percentage, `budgetWarnThresholdPct` + `liveUsage` props
- `src/components/ai/office/TeamCard.tsx` — `budgetWarnThresholdPct` prop (default for a caller that omits it), `isAtThreshold` colour, `toLocaleString()` on the caption
- `src/components/ai/office/BudgetTopUpModal.tsx` — `thresholdPct` prop replaces the `BUDGET_PAUSE_THRESHOLD` import
- `src/components/ai/office/TeamSettingsDrawer.tsx` — `team-threshold-input` + `team-threshold-clear`, `number | null | undefined` state with a touched flag, `budgetWarnThresholdPct` in the save payload
- `src/components/ai/office/TeamWorkspace.tsx` — passes `budgetWarnThresholdPct`/`liveUsage`/`thresholdPct`/`globalThresholdPct`; banner import, render and the agent top-up scope removed
- `src/views/TeamsView.tsx` — live global threshold read, resolved per card
- `src/types/aiOffice.ts` — `BUDGET_PAUSE_THRESHOLD` deleted
- `src/services/ai/office/teamRunCoordinator.ts` — `applyLiveUsage` notifies subscribers
- `src/components/ai/office/AgentPausedBanner.tsx` — deleted
- `tests/views/TeamsView.test.tsx` — split rendering, estimate marker, independent badges, inherited-global drawer test, D-22 convergence
- `tests/ai/office/AgentOfficeComponents.test.tsx` — banner tests removed
- `tests/ai/ActiveAiTurnIndicator.test.tsx` — `thresholdPct` in `baseProps`; label proven prop-driven at 80 and 65
- `tests/components/ai/office/SettingsSaveBudget.test.tsx` — drawer clear and drawer untouched traversal tests

## Decisions Made

- **The group total sums every member row, not only the renderable ones.** A member whose agent row is missing still has a ledger row; excluding it would make the header disagree with the coordinator's own `teamUsed`, which is the repudiation risk T-38-23 names.
- **A provisional measurement renders as an estimate.** D-24 says an estimated value must be distinguishable from a provider number, and a pre-call guess is exactly that. The reported number always wins once it arrives.
- **The drawer needs a `thresholdTouched` flag, not just three-state state.** Seeding the state from the stored override is what makes the field show 65 on open; without the flag, saving an unrelated total would send 65 as an explicit write. The flag is what keeps "untouched" distinguishable from "set to the same value".
- **`AgentPausedBanner` is deleted.** Plan 08 left the decision open. `awaiting-budget` has no producer, so the component could not render, and its copy ("tượng dừng — cần cấp thêm token", "Đã dùng 80%") asserts a parked turn and a literal 80 — both forbidden by the warning-only model. Deleting it also removed the only producer of an agent-scoped top-up, so that state and its branches are gone too.
- **The card's own default stays.** `TeamCard` keeps `DEFAULT_BUDGET_WARN_THRESHOLD_PCT` as a fallback for a caller that omits the prop; after this plan no production caller does.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Live usage never reached the UI**
- **Found during:** Task 3 (the convergence test's live capture sat at 0)
- **Issue:** `applyLiveUsage` updated the live maps and evaluated warnings but never called `notify()`. Subscribers only saw a number at the terminal flush, so D-22's live half was silent — the header would read 0 for the whole turn and jump at the end.
- **Fix:** `applyLiveUsage` calls `notify()` after `evaluateBudgetWarnings()`.
- **Files modified:** `src/services/ai/office/teamRunCoordinator.ts`
- **Commit:** `8b7a38b5`

**2. [Rule 1 - Bug] `TeamCard`'s caption assertion broke on the thousands separator**
- **Found during:** Task 2 verification
- **Issue:** `tests/views/TeamsView.test.tsx` asserted `0/4000 token`; the plan requires `toLocaleString()`, which renders `0/4,000`.
- **Fix:** assertion updated to `0/4,000 token`.
- **Files modified:** `tests/views/TeamsView.test.tsx`
- **Commit:** `1c2bd422`

**3. [Rule 1 - Bug] An unrelated settings save rewrote the stored override**
- **Found during:** Task 2 (the drawer-untouched test failed with `65` instead of `undefined`)
- **Issue:** seeding the threshold state from `team.budgetWarnThresholdPct` made an untouched save send 65 as an explicit write. It happened to be harmless for 65, but a stored override that later fell out of band would have been silently re-clamped, and the plan's "untouched" contract was not actually held.
- **Fix:** added a `thresholdTouched` flag; the payload sends `thresholdPct` only when the user typed or cleared, `undefined` otherwise.
- **Files modified:** `src/components/ai/office/TeamSettingsDrawer.tsx`
- **Commit:** `1c2bd422`

**4. [Rule 2 - Missing critical functionality] `AgentPausedBanner` was dead UI with forbidden copy**
- **Found during:** Task 2 (plan 08's handoff note)
- **Issue:** the banner rendered only on `awaiting-budget`, a phase nothing produces after plan 08, and its copy asserted a parked turn plus a literal 80%.
- **Fix:** component, tests, import and render site deleted; the agent-scoped top-up state that only the banner set was removed with it.
- **Files modified:** `src/components/ai/office/AgentPausedBanner.tsx` (deleted), `src/components/ai/office/TeamWorkspace.tsx`, `tests/ai/office/AgentOfficeComponents.test.tsx`
- **Commit:** `a3a22c2c`

## Issues Encountered

- The drawer's `seededFor` ref seeds once per open, so a test that swapped the team row after mount hit a stale seed. Both traversal tests now update the existing team row before render instead of creating a second team.
- `setTeamThresholdPct` is called after the awaited repo write, so the clear test needed `waitFor` on the coordinator spy rather than a synchronous assertion.
- A first attempt at a global-threshold badge test wrote to the settings key with the wrong spelling (`budgetWarnThresholdPct` instead of `ai_budget_warn_threshold_pct`) and asserted a badge the sidebar cannot see without a coordinator. Replaced with a drawer test that proves the inherited value is displayed and never materialized on the team row.

Scoped runs: `tests/views/TeamsView.test.tsx` 41/41, `tests/ai/office/AgentOfficeComponents.test.tsx` 5/5, `tests/ai/ActiveAiTurnIndicator.test.tsx` 8/8, `tests/components/ai/office/SettingsSaveBudget.test.tsx` 6/6, `tests/services/ai/office/teamRunCoordinator.test.ts` 149/149. `npx tsc --noEmit -p tsconfig.json` prints no `error TS` line. `bash .planning/scripts/verify-team-chat-architecture.sh` exits 0.

## User Setup Required

None - no external service configuration required. No package installed.

## Threat Surface Notes

- T-38-23 (repudiation, displayed numbers): mitigated — every figure comes from a stored row or the coordinator snapshot reconciled to it; the D-22 test asserts the settled sidebar text equals the `listTeamMembers` rows, and the group total sums every member row.
- T-38-24 (tampering, override form): mitigated — `InputNumber` is bounded 1..100 for the user, and `applyTeamBudgetSettings` clamps through `clampBudgetWarnThresholdPct` (landed in plan 01) for anything that bypasses the form.
- T-38-25 (DoS, division by zero): mitigated — every ratio guards `granted > 0`, `fmt()` finite-checks before formatting, and three tests assert no `NaN`/`Infinity`/`undefined` reaches the DOM.
- T-38-SC: no package installed in this plan.

## Known Stubs

None.

## Next Phase Readiness

- Plan 12 owns the backup/export/restore/SQLite parity for the split columns; nothing here wrote a schema field.
- `pausedAgentId`/`pausedAgentName` remain on the snapshot as always-null legacy fields because the parked phase value is still legal in old backups — no UI reads them now.
- The card's `budgetWarnThresholdPct` default remains as a fallback only; every production caller supplies the resolved value.

## Self-Check: PASSED

- `src/components/ai/office/TeamSidebar.tsx`, `TeamCard.tsx`, `BudgetTopUpModal.tsx`, `TeamSettingsDrawer.tsx`, `src/views/TeamsView.tsx` all present and modified.
- `src/components/ai/office/AgentPausedBanner.tsx` absent as intended.
- Commits `7f8c8b7a`, `1c2bd422`, `8b7a38b5`, `a3a22c2c` all exist in `git log`.
