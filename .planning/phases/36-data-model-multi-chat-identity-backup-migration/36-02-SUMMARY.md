---
phase: 36-data-model-multi-chat-identity-backup-migration
plan: 02
subsystem: persistence
tags: [dexie, backup, validation, ai-office, leader-lock, zod]
dependency-graph:
  requires:
    - 36-01 (V19 store list, envelope v12, LATEST_SCHEMA_VERSION)
  provides:
    - "AiTeam.leadId optional + leaderLockedAt (D-05, D-09)"
    - "assignLeader / lockLeader / guarded updateTeam / lead-safe removeTeamMember"
    - "BackupChatMessageRecordSchema.targetAgentId"
    - "Stage-5 live-reference constraints"
  affects:
    - 36-03 (deletion guards rely on the historical-vs-live split proven here)
    - 36-04 (UI consumes leaderLockedAt; deletes ACTIVE_TEAM_CAP_MESSAGE with its importers)
tech-stack:
  added: []
  patterns:
    - "one rw transaction writes both leader sources of truth"
    - "lock guard inside the write transaction, not in the UI"
    - "historical attribution deliberately excluded from live-reference validation"
key-files:
  created: []
  modified:
    - src/types/aiOffice.ts
    - src/validation/aiOfficeSchemas.ts
    - src/validation/backupSchemas.ts
    - src/db/repositories/aiTeamRepo.ts
    - src/services/backup/validateBackup.ts
    - src/workbench/toolwindows/AiOfficeExplorer.tsx
    - src/components/ai/office/TeamWorkspace.tsx
    - tests/services/ai/office/aiTeamRepo.test.ts
    - tests/services/backup/officeBackup.test.ts
    - tests/services/backup/validateBackup.test.ts
decisions:
  - "AiTeamInput type is z.input, so a name-only create is legal while the parsed shape keeps defaults"
  - "updateTeam moves the lead member row with a leadId patch — two sources never disagree"
  - "assertLeaderUnlocked ignores a patch that omits leadId, so renames/budget edits survive the lock"
  - "team thread scopeKey must equal team:<entityId> exactly; a :chat: suffix is rejected"
metrics:
  duration: "~25 min"
  completed: 2026-11-10
  tasks: 3
  files: 10
---

# Phase 36 Plan 02: group identity contract Summary

**One-liner:** Empty groups, unlimited rosters, a durable transactional leader lock, and `targetAgentId`/`leaderLockedAt` surviving export → validate → restore, with live references validated and historical attribution deliberately exempt.

## What Was Built

| Layer | Change |
|---|---|
| Types | `AiTeam.leadId?`, `AiTeam.leaderLockedAt?`; `MAX_ACTIVE_TEAMS`/`MAX_EMPLOYEES_PER_TEAM` deleted |
| Domain Zod | `AiTeamInputSchema.leadId` optional, `budgetTokens` defaults to 0; `AiTeamInput` is `z.input` so name-only creates typecheck |
| Backup Zod | `BackupChatMessageRecordSchema.targetAgentId`; `BackupAiTeamRecordSchema.leadId` optional + `leaderLockedAt` |
| Repo | cap branches removed; `assignLeader`, `lockLeader`, `writeLeadRow`, `assertLeaderUnlocked`; `updateTeam` reads inside its `rw` transaction; `removeTeamMember` refuses the lead row |
| Validator | conditional `leadId`; lead-row ↔ `leadId` invariant both ways; member `agentId ∈ employees ∪ leads`; `aiSkillVersions` refs + `(skillId, version)` uniqueness; team thread scope shape; historical-attribution comment |
| Consumers | `AiOfficeExplorer` narrows both `leadMap.get` reads; `TeamWorkspace` placeholder lead uses `team.leadId ?? ''` |

## Tests

- `tests/services/backup/officeBackup.test.ts` (14 cases): the three new cases were **observed red first** — `targetAgentId` stripped by the plain `z.object`, `leaderLockedAt` rejected as `unrecognized_keys`, and the empty group rejected with `leadId: expected string, received undefined`. All three pass after the schema change. Added a D-20 case proving a rejected payload leaves the target DB byte-identical.
- `tests/services/ai/office/aiTeamRepo.test.ts` (18 cases): cap cases inverted into "5 active groups" and "5 employees in one group"; empty-group create writes zero member rows; `assignLeader` replace keeps exactly one lead row; locked team refuses both `assignLeader` and a `leadId` patch through `updateTeam` with rows re-read to prove nothing changed; `lockLeader` idempotent and refuses a leaderless group; `removeTeamMember` refuses the lead row.
- `tests/services/backup/validateBackup.test.ts` (24 cases): valid empty group, no-`aiSkillVersions` envelope, dangling `leadId`, `leaderLockedAt` without a lead row, locked group with no `leadId`, unknown member agent, unknown version `skillId`, duplicate `(skillId, version)`, nested `:chat:` team scope, and the D-14 acceptance case where `targetAgentId` names a deleted employee.

## Verification

- `npx tsc --noEmit` — clean (exit 0) after every task.
- `npx vitest run tests/services/ai/office` — 8 files, **116 passed**.
- `npx vitest run tests/services/backup/validateBackup.test.ts tests/services/backup/officeBackup.test.ts` — **36 passed**.
- `npx vitest run tests/services/ai/office/aiTeamRepo.test.ts` — **18 passed**.
- `npx vitest run tests/db/schemaV19Migration.test.ts tests/db/tableListParity.test.ts` — **10 passed** (36-01 not regressed).
- No npm dependency added.
- Wave-boundary proof: every file needed to keep `tsc` at 0 after `leadId` became optional is in this plan's `files_modified`; no 36-04 file was touched.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `createTeam({ name })` did not typecheck**

- **Found during:** Task 2
- **Issue:** `AiTeamInput` was `z.infer`, so `status`/`budgetTokens` were required at the type level even though both carry Zod defaults. The empty-group case could not compile.
- **Fix:** `budgetTokens` gained a `.default(0)` and `AiTeamInput` became `z.input<typeof AiTeamInputSchema>`. Only consumer is `CreateTeamInput`.
- **Files modified:** `src/validation/aiOfficeSchemas.ts`
- **Commit:** `97a1b70d`

**2. [Rule 3 - Blocking] `assignLeader` read `aiLeads` outside its declared transaction tables**

- **Found during:** Task 2
- **Issue:** `NotFoundError: an object store did not exist but was being opened` — Dexie rejects a table read not listed in the transaction scope.
- **Fix:** added `db.aiLeads` to the `rw` transaction table list.
- **Files modified:** `src/db/repositories/aiTeamRepo.ts`
- **Commit:** `97a1b70d`

**3. [Rule 2 - Missing critical functionality] `updateTeam` left the lead member row stale**

- **Found during:** Task 2
- **Issue:** a `leadId` patch through `updateTeam` changed `aiTeams.leadId` but left the old `role='lead'` member row, violating the Pitfall-5 two-source invariant the plan requires on every write path.
- **Fix:** extracted `writeLeadRow` and called it from both `updateTeam` and `assignLeader`; `updateTeam` now transacts over `[db.aiTeams, db.aiTeamMembers]`.
- **Files modified:** `src/db/repositories/aiTeamRepo.ts`, `tests/services/ai/office/aiTeamRepo.test.ts`
- **Commit:** `97a1b70d`

## Deferred Issues

Pre-existing at HEAD, outside this plan's scope:

| File | Failure | Cause |
|---|---|---|
| `tests/views/TeamsView.test.tsx:449` | `[data-testid="titlebar-ai-office"]` not found | the testid does not exist anywhere in `src/` at HEAD (`git grep` over HEAD confirms); the TitleBar entry was reworked in the workbench migration |

`ACTIVE_TEAM_CAP_MESSAGE` remains exported from `aiTeamRepo.ts` with two UI importers (`TeamCard.tsx`, `TeamEditorDrawer.tsx`). The plan assigns its removal to 36-04 T1, which owns those files.

## Known Stubs

None. An empty group is a complete stored state, not a placeholder: `leadId` absent is the D-05 contract, and every read path narrows for it.

## Threat Flags

None beyond the plan's register. No new endpoint, auth path, file-access pattern or schema-at-a-trust-boundary change beyond the declared `leaderLockedAt`/`targetAgentId` fields.

## Self-Check: PASSED

- `src/db/repositories/aiTeamRepo.ts` — FOUND (`assignLeader`, `lockLeader`)
- `src/validation/backupSchemas.ts` — FOUND (`targetAgentId`, `leaderLockedAt`)
- `src/services/backup/validateBackup.ts` — FOUND (historical-attribution comment)
- commit `a75d7066` — FOUND
- commit `97a1b70d` — FOUND
- commit `b5d52a51` — FOUND
