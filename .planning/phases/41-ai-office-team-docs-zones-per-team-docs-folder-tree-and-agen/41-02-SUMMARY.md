---
phase: 41-ai-office-team-docs-zones
plan: 02
subsystem: ai-office/docs
tags: [dexie, notes, folder-tree, backfill, transactions]
requires:
  - "Dexie V27 + docsFolderId fields (plan 41-01)"
  - "noteRepo.createNote / NoteInputSchema"
provides:
  - "src/db/repositories/teamDocsRepo.ts — root, team tree, member folders, delete, liveness, backfill"
  - "AI_TEAMS_DOCS_ROOT_SETTING_KEY, AI_TEAMS_DOCS_ROOT_TITLE"
  - "isLiveFolder, ensureDocsRoot, createMemberFolder"
  - "createTeamDocsTree, deleteTeamDocsTree, ensureTeamDocsReady"
affects:
  - "src/db/repositories/aiTeamRepo.ts (plans 41-03/41-04 wire createTeam/addTeamMember/deleteTeam)"
  - "src/services/ai/office/teamRunCoordinator.ts (plan 41-06 calls ensureTeamDocsReady)"
tech-stack:
  added: []
  patterns:
    - "ambient transaction: helpers open none, Dexie joins the caller's rw transaction"
    - "setting-key identity, never title matching"
    - "hard delete for the team tree; shared root and setting survive"
key-files:
  created:
    - src/db/repositories/teamDocsRepo.ts
    - tests/db/teamDocsRepo.test.ts
  modified: []
decisions:
  - "D-08/D-08b: root identity is the ai_teams_docs_root setting; created lazily, recreated when the stored id is dead"
  - "D-09: createTeamDocsTree opens no transaction so createTeam's rollback covers folders; it never writes docsFolderId itself"
  - "D-10: tree delete is hard delete, one level deep, and never touches the AI Teams root or its setting"
  - "D-12/D-12b: the liveness guard runs INSIDE the rw transaction; a dead or non-folder docsFolderId is recreated, the old tree is not repaired"
metrics:
  duration: "~20 min"
  completed: "2026-11-15T04:47:00Z"
  tasks: 3
  files_changed: 2
---

# Phase 41 Plan 02: Team docs folder tree repo Summary

One repo module owns the `AI Teams` root, per-team trees, member folders with `(2)`/`(3)` collision suffixes, whole-tree hard delete, and the idempotent turn-start backfill guarded inside its own `rw` transaction.

## What Was Built

**Task 1 — root, liveness, member folder (`b1c05ea9`)**
- `AI_TEAMS_DOCS_ROOT_SETTING_KEY = 'ai_teams_docs_root'` and `AI_TEAMS_DOCS_ROOT_TITLE = 'AI Teams'` (D-08).
- `isLiveFolder(noteId, db)` — false for a missing id without a read; otherwise true only when the row exists, `deletedAt` is falsy and `type === 'folder'` (D-12b).
- `ensureDocsRoot(db)` — reads the setting, reuses it when live, otherwise `createNote({ title: 'AI Teams', body: '', type: 'folder' })` plus `db.settings.put`. No transaction of its own (D-08b).
- `createMemberFolder(teamFolderId, agentName, db)` — reads direct children via `where('parentId')`, picks the first free title from `agentName`, ` (2)`, ` (3)` …, capped at 99 attempts with a `Date.now()` fallthrough so a hostile roster cannot spin (D-11, T-41-05).

**Task 2 — tree create, tree delete, backfill (`e961e496`)**
- `createTeamDocsTree(teamName, members, db)` — root → team folder → one member folder per member in order, returning `{ folderId, memberFolderIds: Map<agentId, folderId> }`. Writes no `docsFolderId` (D-09).
- `deleteTeamDocsTree(teamFolderId, db)` — no-op on `undefined`; `where('parentId').anyOf([teamFolderId, ...childIds]).delete()`, then `bulkDelete(childIds)`, then `delete(teamFolderId)`. Hard delete, no recursion, root and setting untouched (D-10).
- `ensureTeamDocsReady(teamId, db)` — `db.transaction('rw', [db.aiTeams, db.aiTeamMembers, db.aiEmployees, db.notes, db.settings])`; re-reads the team, returns early when `docsFolderId` is live, otherwise resolves member names via `bulkGet` (agentId fallback), builds the tree, then persists `docsFolderId` on the team row and every member row (D-12, D-12b, T-41-06).

**Task 3 — repo tests (`970fe1e1`)**
- 11 tests in `tests/db/teamDocsRepo.test.ts`, `// @vitest-environment node`, per-test `TaskPlannerDatabase`, `afterEach` `db.delete()`.
- Covers: single root + reuse; root recreation after setting points at a deleted folder; `isLiveFolder` on missing/deleted/non-folder; 5-row tree with correct parents; `(2)`/`(3)` suffixes; delete scope with a seeded document in a member folder and one in the team folder while root + setting survive; `undefined` no-op; backfill twice with identical ids and 5 rows; recreation on a dead folder; recreation on a live `type: 'document'` id; member-row writes plus a dangling agentId that falls back to its id.

## Verification

- `npx vitest run tests/db/teamDocsRepo.test.ts` — 1 file, 11 tests passed.
- `npx vitest run tests/db/tableListParity.test.ts` — 1 file, 7 tests passed (no table added).
- `npx tsc --noEmit` — clean.
- Acceptance greps: all seven exports present at `teamDocsRepo.ts:18,24,40,58,88,120,147`; exactly one `db.transaction` in the file (`:151`); `anyOf` at `:130` and `bulkDelete` at `:131`.

## Deviations from Plan

**1. [Rule 1 - Bug] Test 8 seeds the dead folder via `deleteTeamDocsTree`, not a raw `db.notes.delete`**
- **Found during:** Task 3
- **Issue:** The plan's test 8 said "hard-delete that folder row, run the backfill, assert … a fresh 5-folder tree exists". A raw `db.notes.delete(teamFolderId)` leaves the old member folders orphaned, so the count is 4, not 5 — the plan's own expected number contradicts its own seed step.
- **Fix:** The test deletes the whole tree with `deleteTeamDocsTree` (the realistic D-12b path: the owner deleted the tree in DocsExplorer), which yields the stated 5-folder tree. Same for the wrong-type test, which now seeds three members so the fresh tree is 5 rows.
- **Files modified:** `tests/db/teamDocsRepo.test.ts`
- **Commit:** `970fe1e1`

## Known Stubs

None.

## Threat Flags

None — T-41-05 (title through `NoteInputSchema`), T-41-06 (guard inside the `rw` transaction over all five stores), T-41-07 (accepted: a foreign live folder id is treated as the team folder), T-41-08 (accepted: bounded one-level delete) and T-41-09 (literal `type: 'folder'` only) are all as planned.

## Self-Check: PASSED

- `src/db/repositories/teamDocsRepo.ts` — FOUND (7 exports, 1 transaction)
- `tests/db/teamDocsRepo.test.ts` — FOUND (11 `it(` blocks)
- commits `b1c05ea9`, `e961e496`, `970fe1e1` — FOUND in `git log`
