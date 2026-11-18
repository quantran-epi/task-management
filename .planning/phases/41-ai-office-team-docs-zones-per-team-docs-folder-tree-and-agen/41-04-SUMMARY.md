---
phase: 41-ai-office-team-docs-zones
plan: 04
subsystem: ai-office/docs
tags: [dexie, notes, folder-tree, transactions, lifecycle]
requires:
  - "Dexie V27 + docsFolderId fields (plan 41-01)"
  - "teamDocsRepo helpers: createTeamDocsTree, deleteTeamDocsTree, createMemberFolder, ensureTeamDocsReady, isLiveFolder (plan 41-02)"
provides:
  - "createTeam / deleteTeam / addTeamMember / assignLeader / updateTeam wired to the docs tree inside their existing transactions"
  - "writeLeadRow(teamId, leadId, leadName, db) — resolves the team folder itself, writes a live docsFolderId on both exits"
  - "removeTeamMember deliberately untouched (D-11 retention)"
affects:
  - "src/services/ai/office/teamRunCoordinator.ts (plan 41-06 backfill reads the ids these writes persist)"
  - "src/services/ai/office/teamTools.ts (plan 41-03 write_doc reads member.docsFolderId)"
tech-stack:
  added: []
  patterns:
    - "ambient transaction: every table a nested helper touches must be in the parent's store list"
    - "backfill map first, createMemberFolder second — never both, or a ` (2)` duplicate appears"
    - "re-read the row after a nested backfill before put, or the fresh docsFolderId is erased"
key-files:
  created: []
  modified:
    - src/db/repositories/aiTeamRepo.ts
    - tests/services/ai/office/aiTeamRepo.test.ts
decisions:
  - "D-09: createTeam declares db.notes + db.settings so folders and the root setting roll back with the team row"
  - "D-10: deleteTeam reads the team row first and calls deleteTeamDocsTree before the team delete; the shared AI Teams root and its setting are never named"
  - "D-11: addTeamMember mints one folder on a live tree, takes the id from ensureTeamDocsReady's map on a dead one; removeTeamMember keeps the folder and its documents"
  - "D-12b: writeLeadRow resolves the team folder itself so both call sites cannot drift, and throws rather than writing a folderless leader"
  - "T-41-34: addTeamMember, assignLeader and updateTeam all declare aiEmployees/notes/settings because the nested backfill spans all five stores"
metrics:
  duration: "~12 min"
  completed: "2026-11-15T04:54:00Z"
  tasks: 4
  files_changed: 2
---

# Phase 41 Plan 04: Team lifecycle writes own the docs tree Summary

Five team lifecycle writes now create and destroy the docs folder tree inside their existing Dexie transactions, so there is never an orphan team without folders or a folder tree without a team — and a removed member's documents stay readable.

## What Was Built

**Task 1 — `createTeam` and `deleteTeam` (`0dbed3af`)**
- `createTeam` transaction list gains `db.notes` and `db.settings`. After `bulkAdd(rows)` and `writeEvenSplit`, it resolves display names (lead via `db.aiLeads.get`, employees via `db.aiEmployees.bulkGet`, agentId fallback), calls `createTeamDocsTree(team.name, members, db)`, then persists `docsFolderId` on the team row and every member row. The returned object carries `docsFolderId` without a re-read. `assertAgentsExist` still runs first, so a dangling id fails before any folder exists.
- `deleteTeam` transaction list gains `db.notes`. It reads `const existing = await db.aiTeams.get(id)` at the top and calls `deleteTeamDocsTree(existing?.docsFolderId, db)` immediately before `db.aiTeams.delete(id)`. The `AI Teams` root folder and the `ai_teams_docs_root` setting are never referenced in the file.

**Task 2 — `addTeamMember` mints one folder, `removeTeamMember` keeps it (`aae0b1f7`)**
- `addTeamMember` transaction list becomes `[aiTeamMembers, aiEmployees, aiTeams, notes, settings]`. Path A (live tree): `createMemberFolder(teamFolderId, agent.name, db)` then `update(member.id, { docsFolderId })`. Path B (dead or absent tree): `ensureTeamDocsReady` runs AFTER the member row is added and the id is taken from `ready.memberFolderIds`; nothing is minted. A missing map entry throws instead of writing a folderless member.
- `removeTeamMember` is functionally unchanged, with a D-11 comment above the delete recording why the folder and its documents survive.

**Task 3 — `writeLeadRow`, `assignLeader`, `updateTeam` (`1bd86ec1`)**
- `writeLeadRow(teamId, leadId, leadName, db)` resolves the team folder itself: reads the team, runs `ensureTeamDocsReady` when the id is absent or dead, throws when still absent, then reads siblings AFTER the backfill. Promoted-in-place path prefers `backfillIds.get(leadId)`, then the row's own live `docsFolderId`, then `createMemberFolder`. New-row path mints a folder and includes `docsFolderId` in the `add` object. Demoted leads keep their own folder; no folder is created for them.
- `assignLeader` and `updateTeam` transaction lists both become `[aiTeams, aiTeamMembers, aiLeads, aiEmployees, notes, settings]` — the nested backfill's store list must be a subset. `updateTeam` resolves the new lead's name via `db.aiLeads.get` and passes `nextLead?.name ?? validated.leadId`.

**Task 4 — lifecycle tests (`41458cc5`)**
- New `describe('aiTeamRepo — team docs folder tree (AIO-DOCS-01, AIO-DOCS-06, D-09..D-11)')` block, 11 tests, reusing the file's real lead/employee fixtures.
- Covers: `1 + 1 + N` count with correct parents; `docsFolderId` on team and every member row; forced-throw rollback (teams, members, notes all 0, no root setting); shared root reuse across two teams; `deleteTeam` scope (tree and both documents gone, root note and setting survive); `addTeamMember` folder; pre-41 backfill add with exactly one folder for the new member and no ` (2)`; `removeTeamMember` folder and document retention; `assignLeader` folder on the new lead plus no extra folder on re-assignment; pre-41 `assignLeader` backfill; `updateTeam` `leadId` patch.

## Verification

- `npx vitest run tests/services/ai/office/aiTeamRepo.test.ts` — 75 tests passed (64 pre-existing + 11 new).
- `npx vitest run tests/db/teamDocsRepo.test.ts` — 11 tests passed.
- `npx vitest run tests/services/ai/office/teamTranscriptRepo.test.ts tests/services/ai/office/aiOfficeRepo.test.ts tests/services/ai/office/teamRunCoordinator.test.ts tests/services/ai/office/disposeMidRunDelete.test.ts` — 212 tests passed.
- `npx vitest run tests/views/AiOfficeView.test.tsx tests/components/ai/office/SettingsSaveBudget.test.tsx` — 31 tests passed.
- `npx tsc --noEmit` — clean.
- Acceptance greps: `createTeamDocsTree` at `aiTeamRepo.ts:181`, `deleteTeamDocsTree` at `:436` before `db.aiTeams.delete`, `db.notes` in both store lists (`:127`, `:408`), `writeLeadRow` exactly two call sites both passing a name (`:289`, `:397`), no `ai_teams_docs_root` reference in the file.

## Deviations from Plan

**1. [Rule 1 - Bug] `updateTeam` and `assignLeader` erased the backfilled `docsFolderId`**
- **Found during:** Task 4 (tests 10 and 11 failed)
- **Issue:** Both functions read the team row BEFORE calling `writeLeadRow`. When the tree was dead, the nested `ensureTeamDocsReady` wrote a fresh `docsFolderId` onto the team row, and the subsequent `db.aiTeams.put({ ...existing, ... })` wrote the stale copy back — erasing the new tree's only handle. `updateTeam`'s `leadId` patch also produced 6 notes instead of 5 because the recreated tree was orphaned and the next backfill built a second one.
- **Fix:** After `writeLeadRow`, both functions re-read the team row and carry `docsFolderId` forward into the object they `put`. Fixed at the state owner (the write that clobbers), not at the test.
- **Files modified:** `src/db/repositories/aiTeamRepo.ts`
- **Commit:** `43ce6698`

**2. [Rule 1 - Bug] `updateTeam` leadId test expected the wrong folder count**
- **Found during:** Task 4
- **Issue:** The plan's `1 + 1 + N` expectation for the `updateTeam` leadId test assumed the outgoing lead's row disappears. `writeLeadRow` deletes a usage-free outgoing row but D-11 keeps its folder, so the count is `1 + 1 + 4`, not `1 + 1 + 3`.
- **Fix:** The test asserts `1 + 1 + 4` with a comment naming the retained folder, and still asserts no ` (2)` duplicate.
- **Files modified:** `tests/services/ai/office/aiTeamRepo.test.ts`
- **Commit:** `41458cc5`

**3. [Rule 3 - Blocking] Optional `Note.title` under `noUncheckedIndexedAccess`**
- **Found during:** Task 4
- **Issue:** `note.title.includes('(2)')` fails typecheck because `Note.title` is `string | undefined`.
- **Fix:** Used `note.title?.includes('(2)')`.
- **Files modified:** `tests/services/ai/office/aiTeamRepo.test.ts`
- **Commit:** `41458cc5`

## Known Stubs

None.

## Threat Flags

None — T-41-16 (rollback proven by forced throw), T-41-17 (delete scope asserted), T-41-19/T-41-31 (dead-tree add pins the count and forbids ` (2)`), T-41-32 (every `writeLeadRow` exit writes a live folder on both callers) and T-41-34 (all three backfill callers declare all five stores) are implemented as planned.

## Self-Check: PASSED

- `src/db/repositories/aiTeamRepo.ts` — FOUND (5 lifecycle writes wired, `removeTeamMember` untouched)
- `tests/services/ai/office/aiTeamRepo.test.ts` — FOUND (76 `it(` blocks, +11)
- commits `0dbed3af`, `aae0b1f7`, `1bd86ec1`, `43ce6698`, `41458cc5` — FOUND in `git log`
