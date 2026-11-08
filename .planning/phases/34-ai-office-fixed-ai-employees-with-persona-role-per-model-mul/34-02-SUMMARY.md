---
phase: 34-ai-office-fixed-ai-employees-with-persona-role-per-model-mul
plan: 02
subsystem: ai-office, data-layer
tags: [dexie, repository, zod, transactions, budget, transcript, bm25]
requires:
  - src/types/aiOffice.ts
  - src/validation/aiOfficeSchemas.ts
  - Dexie version 17
provides:
  - src/db/repositories/aiOfficeRepo.ts
  - src/db/repositories/aiTeamRepo.ts
  - src/db/repositories/teamTranscriptRepo.ts
  - team:<teamId> chat scope key
affects:
  - src/db/repositories/aiOfficeRepo.ts
  - src/db/repositories/aiTeamRepo.ts
  - src/db/repositories/teamTranscriptRepo.ts
tech-stack:
  added: []
  patterns:
    - repository with default-db parameter and Zod parse at every entry
    - caps enforced inside db.transaction('rw', ...) so racing callers cannot exceed them
    - per-row budget writes, never read-modify-write of a shared array
    - thin transcript layer over the existing chatMessages table
key-files:
  created:
    - src/db/repositories/aiOfficeRepo.ts
    - src/db/repositories/aiTeamRepo.ts
    - src/db/repositories/teamTranscriptRepo.ts
    - tests/services/ai/office/aiOfficeRepo.test.ts
    - tests/services/ai/office/aiTeamRepo.test.ts
    - tests/services/ai/office/teamTranscriptRepo.test.ts
  modified: []
decisions:
  - Deletes never cascade; teams and employees keep dangling ids and resolve them at read time
  - Caps are counted inside db.transaction('rw', ...) rather than before it
  - Budget writes are single-row updates; no budget array is ever serialized
  - The team transcript reuses chatMessages instead of a new aiTeamMessages table
metrics:
  duration: ~18m
  completed: 2026-11-08
---

# Phase 34 Plan 02: AI Office Persistence Layer Summary

Three Dexie repositories: global employee/lead/skill CRUD with no cascade deletes, team persistence with both caps inside transactions and an exact even-split budget, and a team transcript layer over the existing `chatMessages` table with attribution and a cross-team read guard.

## What Was Built

**`src/db/repositories/aiOfficeRepo.ts`** — 14 exports. Twelve CRUD functions (`listEmployees`, `createEmployee`, `updateEmployee`, `deleteEmployee`, `listLeads`, `createLead`, `updateLead`, `deleteLead`, `listSkills`, `createSkill`, `updateSkill`, `deleteSkill`) plus `countTeamsUsingEmployee` (reads `aiTeamMembers` by `agentId`) and `countAgentsUsingSkill` (reads `aiEmployees` by `skillId`). Every function ends with `db: TaskPlannerDatabase = defaultDb`; every create/update runs `Schema.parse` first; ids from `generateId()`, timestamps from `new Date().toISOString()`. Updates follow the `updateSystem` shape: read row, Vietnamese not-found error, explicit field-by-field build, `'skillId' in patch` for the nullable clear. Deletes touch only their own table — D-18/D-25 non-cascade is asserted by tests that keep the dangling `agentId`/`skillId` visible.

**`src/db/repositories/aiTeamRepo.ts`** — 16 exports plus `ACTIVE_TEAM_CAP_MESSAGE`. `activateTeam` and `updateTeam`'s activation path count active rows inside `db.transaction('rw', [db.aiTeams], ...)` and throw the exact UI-SPEC string at `MAX_ACTIVE_TEAMS`. `createTeam` seeds one member row per selected employee plus the lead, then applies the even split, all inside one transaction that also checks the cap when the team is created active. `addTeamMember` rejects a second lead and a fourth employee inside its own transaction. `applyEvenSplit` floors per row and puts the remainder on the lead row, so the sum is exact. `topUpMemberBudget` and `addUsedTokens` are single-row `update` calls — no JSON column anywhere (`grep -c 'JSON.parse\|JSON.stringify'` returns 0). `deleteTeam` removes members and links in the same transaction.

**`src/db/repositories/teamTranscriptRepo.ts`** — 6 exports. `ensureTeamThread` reads the team row for its title and calls `createOrGetThread({ scopeType: 'team', entityId })`, which produces `team:<teamId>`; reactivation therefore resolves the same thread and the transcript accumulates (D-17). `saveTeamMessage` mirrors `chatRepo.saveMessage`'s explicit-field construction, conditional-spread attribution, the two-table transaction and `notifyAIChatSync`. `listRecentTurns` slices the last N of the chronologically sorted thread rows; `listAssignmentHistory` filters by agent and `instruction`/`report`, reverses, caps at the imported `ASSIGNMENT_HISTORY_CAP`; `getTeamTurn` returns `undefined` unless `row.threadId === threadId`; `buildTeamBm25Docs` maps to `BM25Document` with the agent name as title and `messageKind ?? role` as the tag. No `aiTeamMessages` table exists.

## Verification

```
npx vitest run tests/services/ai/office/aiOfficeRepo.test.ts \
  tests/services/ai/office/aiTeamRepo.test.ts \
  tests/services/ai/office/teamTranscriptRepo.test.ts
→ 3 files passed, 29 tests passed
npx tsc --noEmit → no error in any of the three files
git diff --stat package.json package-lock.json → empty
```

Acceptance greps: `Schema.parse` ×6, `generateId()` ×3, three delete functions in `aiOfficeRepo`; `transaction('rw'` ×8 and zero JSON serialization in `aiTeamRepo`; cross-team guard ×1, `aiTeams.get` ×1, `aiTeamMessages` ×0 in `teamTranscriptRepo`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `CreateTeamInput` needed `employeeIds`**
- **Found during:** Task 2
- **Issue:** The plan requires `createTeam` to seed one member row per selected employee, but `AiTeamInputSchema` (plan 34-01) carries only `leadId`. Without an employee list the seeding behavior is unreachable.
- **Fix:** Added `CreateTeamInput extends AiTeamInput { employeeIds?: string[] }` and seed member rows from it. The team row itself is still validated by `AiTeamInputSchema`.
- **Files modified:** `src/db/repositories/aiTeamRepo.ts`
- **Commit:** 2f7bb0db

**2. [Rule 3 - Blocking] `addTeamMember` rejected an omitted `usedTokens`**
- **Found during:** Task 2
- **Issue:** `AiTeamMemberInput` (inferred from the Zod schema) types `usedTokens` as required even though the schema defaults it to 0, so callers had to pass it.
- **Fix:** Added `AddTeamMemberInput = Omit<AiTeamMemberInput, 'usedTokens'> & { usedTokens?: number }` as the parameter type; the schema still fills the default.
- **Files modified:** `src/db/repositories/aiTeamRepo.ts`
- **Commit:** 2f7bb0db

**3. [Rule 1 - Bug] Same-millisecond rows broke chronological assertions**
- **Found during:** Task 3
- **Issue:** `saveTeamMessage` stamps `createdAt` from `new Date().toISOString()`; rows written in the same millisecond tie-break on `id`, so a 12-row loop did not read back in insertion order and the recent-window test failed.
- **Fix:** The tests now space writes by 2 ms. The repository ordering itself is correct and unchanged — the id tiebreak is what makes it deterministic.
- **Files modified:** `tests/services/ai/office/teamTranscriptRepo.test.ts`
- **Commit:** 6f709d78

## TDD Gate Compliance

Plan frontmatter is `type: execute`, not `type: tdd`, so the plan-level gate does not apply. Each task carried `tdd="true"` and followed RED → GREEN: `420818fb` (failing test) → `a4584165`; `dc43f83e` → `2f7bb0db`; `7f095419` → `6f709d78`. Every RED commit was verified failing before its implementation commit.

## Known Stubs

None. The repositories are complete against the plan's contract; no UI consumes them yet in this wave, and no function returns placeholder data.

## Threat Flags

None. The three mitigations the plan's threat model assigns to this plan are implemented: caps inside transactions (T-34-06), the `row.threadId === threadId` guard (T-34-07), single-row budget writes (T-34-08), attribution on every saved row (T-34-09) and the imported `ASSIGNMENT_HISTORY_CAP` (T-34-10). No new network endpoint, auth path or schema change was introduced.

## Commits

- `420818fb` test(34-02): add failing tests for AI Office employee/lead/skill CRUD
- `a4584165` feat(34-02): implement AI Office employee/lead/skill repository
- `dc43f83e` test(34-02): add failing tests for team/member/link/budget repository
- `2f7bb0db` feat(34-02): implement team/member/link/budget repository with caps
- `7f095419` test(34-02): add failing tests for team transcript repository
- `6f709d78` feat(34-02): implement team transcript repository over chatMessages

## Self-Check: PASSED

All six artifacts exist on disk and all six commits are reachable from the worktree branch.
