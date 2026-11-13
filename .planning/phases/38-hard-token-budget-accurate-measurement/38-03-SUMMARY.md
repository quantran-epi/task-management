---
phase: 38-hard-token-budget-accurate-measurement
plan: 03
subsystem: database
tags: [dexie, indexeddb, transactions, token-budget, ai-office, concurrency]

# Dependency graph
requires:
  - phase: 38-hard-token-budget-accurate-measurement
    plan: 01
    provides: V25 split usage columns (inputTokens/outputTokens/usageEstimated) on member rows
provides:
  - incrementMemberUsage (atomic read-modify-write inside one rw transaction)
  - addUsedTokens kept as a @deprecated forwarding shim
  - splitEvenly in src/services/ai/office/budgetSplit.ts (single home of the even-split rule)
  - evenSplitRows as a thin adapter over splitEvenly
affects: [38-07, 38-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Ledger increment: read → coalesce → put inside db.transaction('rw', db.aiTeamMembers, …); the delta sink is atomic per call, dedup is the caller's accounting key"
    - "Legacy column kept in sync: usedTokens stays the scalar readers sum while the split columns carry the detail"
    - "One shared pure module below both callers (repo → shared ← component) so the arithmetic cannot drift"

key-files:
  created:
    - src/services/ai/office/budgetSplit.ts
  modified:
    - src/db/repositories/aiTeamRepo.ts
    - src/components/ai/office/TeamSettingsDrawer.tsx
    - tests/services/ai/office/aiTeamRepo.test.ts

key-decisions:
  - "incrementMemberUsage coalesces old rows with ?? 0 and only writes usageEstimated when it becomes true, so an untouched pre-V25 row keeps the key absent"
  - "addUsedTokens forwards { inputTokens: delta, outputTokens: 0, estimated: false } so teamRunCoordinator keeps compiling until plan 07 rewires it"
  - "splitEvenly normalizes the total once (Math.round(Math.max(0, finite-or-0))) so every budgetTokens is an integer and the sum is exact"
  - "The drawer keeps exporting evenSplitRows (tests/views/TeamsView.test.tsx imports it) but holds no arithmetic"

requirements-completed: [AIO-BUDGET-04, AIO-BUDGET-05]

# Metrics
duration: 3min
completed: 2026-11-13
---

# Phase 38 Plan 03: Atomic usage increment + one shared even-split Summary

**`incrementMemberUsage` now does its read-modify-write inside one Dexie `rw` transaction (20 concurrent calls land as exactly `start + 200` against real Dexie), and the even-split rule lives once in `budgetSplit.ts` with the repo and the drawer both importing it**

## Performance

- **Duration:** 3 min
- **Tasks:** 3
- **Files created:** 1
- **Files modified:** 3

## Accomplishments

- Replaced the non-atomic `addUsedTokens` body with `incrementMemberUsage(memberId, { inputTokens, outputTokens, estimated }, db)`, whose get → coalesce → `put` runs inside `db.transaction('rw', db.aiTeamMembers, …)`. The tracer asserts `usedTokens === start + 200`, `inputTokens === 140`, `outputTokens === 60` after 20 concurrent calls — a total the old get-then-update body could not produce.
- Kept `usedTokens` in sync as the legacy scalar, so every existing reader keeps working until plan 09 switches the UI to the split columns; old rows coalesce with `?? 0` and never string-concatenate or produce `NaN`.
- Created `src/services/ai/office/budgetSplit.ts` with `splitEvenly`, normalizing the total to a non-negative integer once before dividing, flooring per row, and putting the remainder on the `role === 'lead'` row. Deleted the private `splitBudget` from the repo and the local arithmetic from the drawer.
- `evenSplitRows` survives as an exported thin adapter, so `tests/views/TeamsView.test.tsx:362` still imports it and the 1668-of-5000 lead assertion still holds.
- Added 7 split edge tests plus 2 increment edge tests (deleted row rejects with `Không tìm thấy thành viên` and the sibling is unmoved; a pre-V25 row increments to `5`, not `NaN`).

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end "20 concurrent usage increments sum correctly"** - `a35bbbba` (feat)
2. **Task 2: One shared `splitEvenly` module, imported by the repo and the drawer** - `38b4def9` (feat)
3. **Task 3: Edge coverage for the split and the increment** - `4a805dc3` (test)

**Plan metadata:** committed with this SUMMARY (docs)

## Files Created/Modified

- `src/services/ai/office/budgetSplit.ts` — new, dependency-free `splitEvenly` + module docstring stating the rounding/clamping/remainder contract
- `src/db/repositories/aiTeamRepo.ts` — `MemberUsageDelta` type, `incrementMemberUsage`, `@deprecated addUsedTokens` shim, `writeEvenSplit` delegating to `splitEvenly`, `splitBudget` deleted
- `src/components/ai/office/TeamSettingsDrawer.tsx` — `evenSplitRows` now returns `splitEvenly(total, rows)`
- `tests/services/ai/office/aiTeamRepo.test.ts` — 3 concurrency tests, a `budgetSplit edge cases` describe with 7 tests, 2 increment edge tests

## Decisions Made

- The deprecated shim charges the whole scalar as input tokens with `estimated: false`, which is exactly what the current coordinator semantics imply — no behavior change until plan 07.
- `usageEstimated` is deleted from the written row when neither the stored row nor the delta says estimated, so an untouched old row keeps the key absent rather than acquiring an explicit `false`.
- `splitEvenly(1.5, two rows)` yields `[1, 1]` (sum 2, both integers) rather than `[2, 0]` — the plan's illustrative `[2, 0]`-style wording described only the integer-sum property, and the implementation's floor-then-remainder rule is the one the repo already had.

## Deviations from Plan

None - plan executed exactly as written. The one adjustment was inside the plan's own wording: the fractional-total assertion was written as `[2, 0]`-style per the action text, but the prescribed algorithm (round once, then floor per row) produces `[1, 1]`; the test asserts the algorithm's actual output and the exact integer sum of 2, which is the contract the plan states.

## Issues Encountered

None. Scoped runs: `tests/services/ai/office/aiTeamRepo.test.ts` 45/45 green, `tests/views/TeamsView.test.tsx` 36/36 green. `npx tsc --noEmit -p tsconfig.json` clean. `bash .planning/scripts/verify-team-chat-architecture.sh` exits 0 (dead-module gate satisfied by both importers). `grep -n "Math.floor(total /"` returns nothing from either file.

## User Setup Required

None - no external service configuration required.

## Threat Surface Notes

- T-38-05 (tampering, `incrementMemberUsage`): mitigated — read-modify-write inside one `rw` transaction; the 20-way test runs against real Dexie with no mock.
- T-38-06 (tampering, `splitEvenly`): mitigated — total behaviour at `count === 0`, negative/NaN totals clamped to 0, and one implementation imported by both callers removes the drift class.
- T-38-07 (DoS, budget write path): accepted as planned — a missing row throws to the caller.
- T-38-SC: no package installed in this plan.

## Next Phase Readiness

- Plan 07 can call `incrementMemberUsage` from `handleUsage` with the real input/output split and drop the `addUsedTokens` shim.
- Plan 09 can switch the UI readers from `usedTokens` to `inputTokens`/`outputTokens`; the legacy scalar stays correct until then.
- Top-up plans (D-16/D-17) can reuse `splitEvenly` directly instead of re-deriving the rule.

## Self-Check: PASSED

- `src/services/ai/office/budgetSplit.ts` exists; `incrementMemberUsage` and `splitEvenly` are imported by `aiTeamRepo.ts` and `TeamSettingsDrawer.tsx`.
- Commits `a35bbbba`, `38b4def9`, `4a805dc3` all exist in `git log`.

---
*Phase: 38-hard-token-budget-accurate-measurement*
*Completed: 2026-11-13*
