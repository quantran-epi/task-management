---
phase: 36-data-model-multi-chat-identity-backup-migration
plan: 03
subsystem: ai-office-runtime
tags: [dexie, deletion-guard, live-use-registry, per-turn-roster, d-03, d-08, d-13]
dependency-graph:
  requires:
    - 36-01 (V19, envelope v12, aiSkillVersions store)
    - 36-02 (optional leadId, leader lock, historical-vs-live split)
  provides:
    - "liveUseRegistry beginTurn/endTurn/isAgentInUse/isSkillInUse/reset"
    - "AiOfficeDeleteResult + guarded deleteEmployee/deleteLead/deleteSkill"
    - "deleteSkill cascades aiSkillVersions in the same transaction"
    - "TeamRunCoordinatorOptions.loadRoster + TurnRoster per-turn snapshot"
    - "per-turn membership refresh (D-08) and live-use claims (D-13)"
  affects:
    - 36-04 (delete handlers surface the typed refusal as an alert; leader lock at first send)
    - 36-05 (backup round-trip of the guarded-delete end state)
tech-stack:
  added: []
  patterns:
    - "guard reads an in-memory registry inside the same rw transaction as the write"
    - "roster read exactly once at turn start; runBatch never reloads"
    - "refcounted live-use claims paired with a Set so a double settle cannot double-release"
key-files:
  created:
    - src/services/ai/office/liveUseRegistry.ts
  modified:
    - src/db/repositories/aiOfficeRepo.ts
    - src/services/ai/office/teamRunCoordinator.ts
    - src/components/ai/office/TeamWorkspace.tsx
    - tests/services/ai/office/aiOfficeRepo.test.ts
    - tests/services/ai/office/teamRunCoordinator.test.ts
    - tests/services/ai/office/teamTranscriptRepo.test.ts
    - tests/views/TeamsView.test.tsx
decisions:
  - "Refusal is a returned value (AiOfficeDeleteResult), never a thrown error — mirrors TeamToolRefusal"
  - "A live-use claim is per-agent and refcounted; the coordinator pairs it with a Set so a double settle cannot decrement twice"
  - "With a loadRoster seam the roster starts EMPTY, so no construction-time profile can reach a turn"
  - "Membership is refreshed per turn from memberAgentIds, bypassing ensureMembers()'s membersLoaded early return"
  - "runBatch deliberately does not reload the roster — it is only reachable inside a lead turn send() already snapshotted"
metrics:
  duration: "~35 min"
  completed: 2026-11-10
  tasks: 3
  files: 8
---

# Phase 36 Plan 03: deletion integrity and per-turn roster Summary

**One-liner:** Profile deletes now refuse with a typed `IN_USE` naming the blocking groups/agents (counting an in-flight turn as live use), and every turn runs on a roster read once at its start from the persisted team row — so a leader persona/model edit reaches the very next turn.

## What Was Built

| Layer | Change |
|---|---|
| Registry (new) | `liveUseRegistry.ts` — module-level `Map<agentId, { count, skillIds }>`; `beginTurn`/`endTurn`/`isAgentInUse`/`isSkillInUse`/`reset`, all synchronous, no React and no Dexie import |
| Repo | `AiOfficeDeleteResult` union; `deleteEmployee`/`deleteLead`/`deleteSkill` guard and write inside one `rw` transaction; `deleteSkill` cascades `aiSkillVersions` only after the guard passes |
| Coordinator | `TurnRoster` + optional `loadRoster`; mutable `roster` replaces every destructured closure read; `send()` snapshots once; `applyRosterMembership` + `hydrateBudgets` refresh membership/budgets per turn; `claimLiveUse`/`releaseLiveUse` around each turn |
| Workspace | `loadRoster` reads `getTeam(team.id)` first, then matches the lead against that row's `leadId` via `listLeads`, and takes membership from `listTeamMembers` |

## Tests

- `tests/services/ai/office/aiOfficeRepo.test.ts` (23 cases): 5 registry cases (claim/release, shared skill held until both end, duplicate-start refcount, `reset`, no React/Dexie import) and 9 delete cases — employee refusal naming the group, employee refusal via live use, unreferenced delete, skill refusal naming the agent, skill refusal via live use, skill+version cascade, refused delete leaving version rows intact, export-validates after unassign+delete, export-validates after a historically-referenced lead is deleted.
- `tests/services/ai/office/teamRunCoordinator.test.ts` (44 cases, 9 new): persona edit between sends reaches turn 2 only; seam lead+model beat the construction-time option; a roster change while parked on the plan card is invisible to that turn; `isAgentInUse(lead)` true during and false after; a mention turn claims the employee and its skill and releases both on stop; a de-rostered agent with a running turn is refused by `deleteEmployee`; a de-rostered agent's mention falls back to the lead next turn; a non-member global employee is never mentionable; an empty group's `send()` resolves as a no-op.
- `tests/services/ai/office/teamTranscriptRepo.test.ts` (10 cases, 2 new, D-17): rename leaves the stored `agentName` and a new message stores the new name; a deleted employee's message still reads back with attribution and appears in `listAssignmentHistory`.
- `tests/views/TeamsView.test.tsx` (22 cases, 1 new): production wiring — `updateLead` between two sends changes the second turn's prompt persona and request model, first turn unchanged.

## Verification

- `npx tsc --noEmit` — clean (exit 0) after every task.
- `npx vitest run tests/services/ai/office/aiOfficeRepo.test.ts tests/services/ai/office/teamRunCoordinator.test.ts tests/services/ai/office/teamTranscriptRepo.test.ts tests/views/TeamsView.test.tsx tests/services/backup/officeBackup.test.ts` — 5 files, **111 passed**.
- `npx vitest run tests/views/TeamsView.test.tsx` — **22 passed** (21 pre-existing + 1 new), keeping the HEAD-green suite green.
- No npm dependency added.
- Full suite deliberately not run.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Registry state leaked between test cases**

- **Found during:** Task 1
- **Issue:** `reset()` ran only in the registry `describe`'s `afterEach`, but the module-level `Map` is shared with the delete cases in the sibling `describe`, so a claim from one case made `isAgentInUse` true in the next.
- **Fix:** added `reset()` to the file-level `afterEach` alongside `db.delete()`.
- **Files modified:** `tests/services/ai/office/aiOfficeRepo.test.ts`
- **Commit:** `61b17365`

**2. [Rule 3 - Blocking] `hydrateBudgets` had to own the member-row id map**

- **Found during:** Task 3
- **Issue:** `applyRosterMembership` originally seeded `memberIds` with the agent id itself, but `memberIds`'s value is the `aiTeamMembers` row id that `addUsedTokens` needs — usage accounting would have thrown `Không tìm thấy thành viên`.
- **Fix:** `hydrateBudgets()` now returns the member rows and writes `memberIds`/`memberBudgets`; `applyRosterMembership(rows)` filters them against `roster.memberAgentIds` and `ensureMembers()` reuses the same rows.
- **Files modified:** `src/services/ai/office/teamRunCoordinator.ts`
- **Commit:** `3ecc710a`

**3. [Rule 3 - Blocking] The harness seam handed out a mutable object**

- **Found during:** Task 3
- **Issue:** the test seam returned the same `roster` object every call, so a mid-turn edit to `roster.employees` was visible to the already-running turn — the opposite of the invariant under test.
- **Fix:** the harness `loadRoster` returns a fresh shallow copy (arrays cloned) per call, matching what production's Dexie read produces.
- **Files modified:** `tests/services/ai/office/teamRunCoordinator.test.ts`
- **Commit:** `3ecc710a`

## Deferred Issues

Pre-existing at HEAD, outside this plan's scope:

| Item | Detail |
|---|---|
| `tests/views/TeamsView.test.tsx` unhandled rejections | 3 `DatabaseClosedError` unhandled rejections after individual tests. Reproduced on a clean `HEAD` worktree before any change — not introduced here. All 22 cases pass. |
| `src/views/AiOfficeView.tsx` delete handlers | Still `void deleteX(...)`, so a refusal is currently a silent no-op in the UI. 36-04 T3 owns surfacing `AiOfficeDeleteResult` as an alert and fixing the confirmation copy. |
| No `eslint.config.*` in the repo | `npx eslint` cannot run; `tsc --noEmit` is the static gate. |

## Known Stubs

None. An empty group's `send()` is a deliberate silent no-op (D-05) with a narrowing guard, not a placeholder: there is no lead to run and nothing to write.

## Threat Flags

None beyond the plan's register. The registry is in-memory only, refusal copy carries names and never UUIDs (T-36-11), and the skill-version cascade is inside the same transaction as the guard (T-36-13).

## Self-Check: PASSED

- `src/services/ai/office/liveUseRegistry.ts` — FOUND
- `src/db/repositories/aiOfficeRepo.ts` — FOUND (`AiOfficeDeleteResult`, guarded deletes)
- `src/services/ai/office/teamRunCoordinator.ts` — FOUND (`loadRoster`, `TurnRoster`)
- `src/components/ai/office/TeamWorkspace.tsx` — FOUND (`loadRoster` production wiring)
- commit `b173ba4d` — FOUND
- commit `61b17365` — FOUND
- commit `3ecc710a` — FOUND
