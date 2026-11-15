---
phase: 41-ai-office-team-docs-zones-per-team-docs-folder-tree-and-agen
verified: 2026-11-15T10:17:06Z
status: human_needed
score: 20/20 must-haves verified
overrides_applied: 0
---

# Phase 41: AI Office team docs zones Verification Report

**Phase Goal:** Creating a team creates its docs folder tree in TaskMate Docs; every member writes documents only inside its own subfolder; the leader reads everything and writes the approved final document at the team root.
**Verified:** 2026-11-15T10:17:06Z
**Status:** human_needed
**Re-verification:** No — initial verification (no prior 41-VERIFICATION.md existed)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Creating a team writes exactly one team folder plus one subfolder per member (leader included) in `db.notes`, in the same transaction as the team row; a throw leaves neither | ✓ VERIFIED | `aiTeamRepo.ts:134-141` (store list incl. `db.notes`/`db.settings`), `:192-206` (tree built before rows, ids written inline); `teamDocsRepo.ts:223-253`. Tests: `aiTeamRepo.test.ts:1127` (1+1+N, parents), `:1168` (forced throw → teams/members/notes 0, no root setting) |
| 2 | Every member can call `write_doc` (list/create/update) and the write lands immediately as a visible document in its own folder — no approval card, no hidden draft table | ✓ VERIFIED | `teamTools.ts:272-289` (definition), `:970-971` (dispatch), `:848-882` writes `createNote` directly into `db.notes`; `MUTATION_TOOLS` (`aiTools.ts:4732-4772`) does not contain `write_doc`, so `onMutationCheck` is never reached (`aiOrchestratorLoop.ts:415`). Tests: `teamTools.test.ts:1375`; `teamRunCoordinator.test.ts:6594`, `:6601` |
| 3 | A member write outside its own subfolder is refused by code, not prompt | ✓ VERIFIED | `teamTools.ts:874` (`parentId: folderId` from ctx only), `:895-904` (stored `parentId !== folderId` → `DOC_NOT_IN_YOUR_FOLDER`), `:819-824` (zone re-resolved from slug+parent). Tests: `teamTools.test.ts:1375` (client `parentId` ignored), `:1428` (cross-folder update, row unchanged) |
| 4 | A member cannot create a folder, delete a note, or call any other mutation; DB mutations stay outside the allowlist; `write_doc` is the only write path and always writes `type: 'document'` | ✓ VERIFIED | `teamTools.ts:873` literal `type: 'document'`; `chatTurnTools.ts:21-40` allowlist has no note mutation; `chatTurnRuntime.ts:397-399` read-only refusal. Tests: `teamTools.test.ts:1556` (allowlist), `teamRunCoordinator.test.ts:6601` (`create_note` → `READ_ONLY_REFUSAL`) |
| 5 | The leader keeps full mutation tools, its writes park on the approval card, and the accept places the final document at the team root | ✓ VERIFIED | `teamRunCoordinator.ts:1118-1139` (lead payload = allowlist + every mutation + team tools minus `EMPLOYEE_ONLY_TEAM_TOOLS`), `:2102` `mutationPolicy: 'approve'`; `teamPrompts.ts:232` (create_note into team folder, approval card is the gate). Tests: `teamRunCoordinator.test.ts:6564` |
| 6 | Deleting a team removes its folder tree; pre-41 teams get the tree lazily on first run without duplication | ✓ VERIFIED | `aiTeamRepo.ts:539` (`deleteTeamDocsTree` before member rows), `teamDocsRepo.ts:304-332` (subtree walk + `bulkDelete`), `:376-466` (idempotent backfill inside `rw`). Tests: `aiTeamRepo.test.ts:1194`, `teamDocsRepo.test.ts:203`, `teamRunCoordinator.test.ts:6472` |
| 7 | `AiTeam` and `AiTeamMember` carry `docsFolderId`; a V26 database opens at V27 with no data migration or index rebuild | ✓ VERIFIED | `types/aiOffice.ts:95,115`; `schema.ts:192-198` (`SCHEMA_V27 = {...SCHEMA_V26}`, `LATEST_SCHEMA_VERSION = 27`); `db/index.ts:671` (`this.version(27).stores(SCHEMA_V27)`, no `.upgrade()`). Test: `schemaV27Migration.test.ts:75` |
| 8 | A pre-41 export restores, and a post-41 export round-trips both `docsFolderId` fields | ✓ VERIFIED | `backupSchemas.ts:670,688` (`uuidSchema.optional()`). Tests: `officeBackup.test.ts:374` (present ids survive), `:412` (pre-41 rows with neither field restore) |
| 9 | ROADMAP criteria 2/4 and AIO-DOCS-02/04 name `write_doc` as the member write path | ✓ VERIFIED | `.planning/ROADMAP.md:942,944`; `.planning/REQUIREMENTS.md:101,103` |
| 10 | The `AI Teams` root is created once and found by setting key, never by title | ✓ VERIFIED (caveat W1) | `teamDocsRepo.ts:19,22` (setting key + title constants), `:118-140` (setting read, slug-checked, lazy create). Test: `teamDocsRepo.test.ts:103` (one root, reused), `aiTeamRepo.test.ts:1182` (shared across two teams) |
| 11 | A `docsFolderId` naming a deleted or non-folder note is treated as absent and the next backfill recreates the tree | ✓ VERIFIED | `teamDocsRepo.ts:59-70` (`resolveTeamFolder` requires live folder + slug), `:397-443` (rebuild path). Tests: `teamDocsRepo.test.ts:221`, `:237`; `teamRunCoordinator.test.ts:6499` |
| 12 | `create` ignores a client `parentId` and always writes `type: 'document'` into the caller's folder; `create` prefixes the agent name, `update` does not | ✓ VERIFIED | `teamTools.ts:857` (prefix), `:871-881` (createNote with ctx folder + literal type), `:924-929` (no re-prefix). Tests: `teamTools.test.ts:1375`, `:1392`, `:1407`, `:1613` |
| 13 | A lead-role `write_doc` call is refused with `LEAD_USES_DB_TOOLS` and writes nothing | ✓ VERIFIED | `teamTools.ts:789-796` (guard before `action` is read), `:73-75` (codes). Tests: `teamTools.test.ts:1565`, `:1598`; payload half `teamRunCoordinator.ts:1134-1136`, test `:6564` |
| 14 | `update` outside the caller's folder refuses `DOC_NOT_IN_YOUR_FOLDER` and writes nothing; `list` returns only the caller's folder | ✓ VERIFIED | `teamTools.ts:895-904`, `:832-846`. Tests: `teamTools.test.ts:1428`, `:1446`, `:1469`, `:1485` |
| 15 | A member with no folder gets `TEAM_DOCS_NOT_READY` and the handler creates no folder | ✓ VERIFIED | `teamTools.ts:797-803` (refuse, no create call anywhere in the handler). Test: `teamTools.test.ts:1512` |
| 16 | An agent calling the DB tool `create_note` still receives `READ_ONLY_REFUSAL` | ✓ VERIFIED | `chatTurnRuntime.ts:397-399`; `chatTurnTools.ts:21-40` unchanged. Test: `teamRunCoordinator.test.ts:6601` (direct `onMutationCheck('create_note')` under the employee turn) |
| 17 | `addTeamMember` creates the member's folder in the same transaction and never a second; `assignLeader` and `updateTeam`'s `leadId` patch both give the new lead a live folder; `removeTeamMember` keeps the folder and documents | ✓ VERIFIED | `aiTeamRepo.ts:572-647` (reuse-then-mint, dead-tree path takes the backfill map), `:333-404` (`writeLeadRow`), `:414-441` (`assignLeader`), `:296-311` (updateTeam leadId + rename), `:650-674` (D-11 retention). Tests: `aiTeamRepo.test.ts:1279`, `:1297`, `:1324`, `:1436`, `:1468`, `:1484` |
| 18 | Every table `ensureTeamDocsReady` reads appears in the ambient transaction list of every caller that can reach it | ✓ VERIFIED | `teamDocsRepo.ts:384` (aiTeams, aiTeamMembers, aiEmployees, aiLeads, notes, settings); callers: `aiTeamRepo.ts:134-141`, `:237`, `:417`, `:574`, `:348` |
| 19 | Both prompts carry the folder facts: employee gets its own id + `write_doc` as the second exception; lead gets the team folder, every member folder, the final-write instruction, and the exact negation literal | ✓ VERIFIED | `teamPrompts.ts:54,75-77` (two exceptions), `:85-89` (folder line), `:165-167` (inputs), `:174-175` (exported negation), `:220-237` (team-folder block). Tests: `teamPrompts.test.ts:563`, `:573`, `:600`, `:630`, `:641`, `:649`, `:664` |
| 20 | Turn start ensures the tree and persists `docsFolderId` on the team and every member row; the employee context carries its own folder id, the leader's carries role and no folder id; the lead payload omits `write_doc`; a docs failure degrades to an absent folder id and never blocks the turn | ✓ VERIFIED | `teamRunCoordinator.ts:1454-1467` (`ensureDocsReady`, bare catch), `:2519` (send), `:3371` (retry), `:1083-1110` (`toolContext`; `isLead ? undefined : memberFolderIds.get`), `:1134-1136` (payload filter), `:1870-1881` / `:2076-2089` (prompt wiring). Tests: `teamRunCoordinator.test.ts:6455`, `:6472`, `:6499`, `:6524`, `:6544`, `:6564`, `:6629`, `:6650`, `:6675` |

**Score:** 20/20 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/db/repositories/teamDocsRepo.ts` | Root, team tree, member folders, delete, liveness, backfill, confirmation summary | ✓ VERIFIED | 466 lines; exports `AI_TEAMS_DOCS_ROOT_SETTING_KEY`, `AI_TEAMS_DOCS_ROOT_TITLE`, `AI_TEAMS_DOCS_ROOT_SLUG`, `isLiveFolder`, `teamFolderSlug`, `memberFolderSlug`, `ensureDocsRoot`, `createMemberFolder`, `resolveTeamFolder`, `resolveMemberFolder`, `createTeamDocsTree`, `deleteTeamDocsTree`, `describeTeamDocsTree`, `ensureTeamDocsReady`. One `db.transaction` (`:380`), all other helpers join the caller's |
| `src/db/repositories/aiTeamRepo.ts` | Five lifecycle writes wired; `removeTeamMember` untouched | ✓ VERIFIED | `createTeam:192`, `updateTeam:296-311`, `deleteTeam:539`, `addTeamMember:625-645`, `writeLeadRow:333-404`, `assignLeader:414-441`; `removeTeamMember:650-674` keeps the folder |
| `src/db/repositories/noteRepo.ts` | Slug rules + reference detach | ✓ VERIFIED | `:18-44` (`RESERVED_SLUG_PREFIX`, `isReservedSlug`, `assertSlugNamespaceFree`), `:114-127` (reserved slug cannot change slug/type via `updateNote`), `:194-256` (`detachNoteReferences` incl. team-handle clearing), `:259-276` (`NOTE_REFERENCE_STORE_NAMES`) |
| `src/services/ai/office/teamTools.ts` | `write_doc` + 3 refusal codes + context fields + `EMPLOYEE_ONLY_TEAM_TOOLS` | ✓ VERIFIED | 975 lines; `:46-57` context, `:73-75` codes, `:272-289` definition, `:304` employee-only set, `:784-943` handler, `:970` dispatch |
| `src/services/ai/office/teamRunCoordinator.ts` | Turn-start hook, folder state, tool context, payload filter, prompt wiring | ✓ VERIFIED | `:511` state, `:1083-1110` context, `:1118-1139` lead payload, `:1454-1467` hook, `:1870-1881`/`:2076-2089` prompts, `:2519`/`:3371` call sites |
| `src/services/ai/office/teamPrompts.ts` | Folder facts on both builders | ✓ VERIFIED | `:54,85-89` employee; `:165-167,174-175,220-237` lead |
| `src/services/backup/validateBackup.ts` | Shape + referential integrity for `docsFolderId` and the root setting | ✓ VERIFIED | `:558-568` (ai-root singleton), `:570-584` (setting must name the ai-root folder), `:586-603` (handle must name a folder), `:604-613` (duplicate agentId rejected), `:633-637`/`:652-655` (handle must resolve) |
| `src/workbench/toolwindows/AiOfficeExplorer.tsx` | Delete confirmation names the tree | ✓ VERIFIED | `:84-91` live `describeTeamDocsTree` map, `:149-158` confirmation text with folder/document counts, `:329` popconfirm title |
| `src/db/schema.ts`, `src/db/index.ts` | V27 | ✓ VERIFIED | `schema.ts:192-198`; `index.ts:671` |
| `src/types/aiOffice.ts`, `src/validation/backupSchemas.ts` | Two row fields, two backup fields | ✓ VERIFIED | `aiOffice.ts:95,115`; `backupSchemas.ts:670,688` |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `teamRunCoordinator.ts` | `teamDocsRepo.ts` | `ensureTeamDocsReady` at turn start | ✓ WIRED | `:66` import, `:1457` call, `:2519`/`:3371` sites |
| `teamRunCoordinator.ts` | `teamTools.ts` | `toolContext` supplies `role`/`folderId`/`teamFolderId`/`agentName` | ✓ WIRED | `:1097-1108`; consumed `teamTools.ts:789,799,814,819,857` |
| `teamRunCoordinator.ts` | `teamPrompts.ts` | `folderId` / `docsFolderId` / `memberFolders` | ✓ WIRED | `:1880`, `:2088-2089` |
| `teamTools.ts` | `noteRepo.ts` | `createNote` / `updateNote` / `getNotesByFolder` | ✓ WIRED | `:15` import, `:833`, `:871`, `:925` |
| `teamTools.ts` | `teamDocsRepo.ts` | `resolveMemberFolder` re-resolution | ✓ WIRED | `:17` import, `:819` |
| `aiTeamRepo.ts` | `teamDocsRepo.ts` | create/delete/backfill/member-folder/resolvers | ✓ WIRED | `:7-12` imports, `:192`, `:348`, `:376`, `:539`, `:595`, `:603`, `:627` |
| `aiTeamRepo.ts` | `db.notes` | transaction store lists | ✓ WIRED | `:139`, `:237`, `:417`, `:498`, `:574` |
| `AiOfficeExplorer.tsx` | `teamDocsRepo.ts` | `describeTeamDocsTree` | ✓ WIRED | `:13` import, `:88` call, `:329` render |
| `noteRepo.ts` | `aiTeams`/`aiTeamMembers` | handle clearing on note delete | ✓ WIRED | `:243-255`, store list `:259-270` |
| `validateBackup.ts` | `teamDocsRepo.ts` | root setting key + root slug | ✓ WIRED | `:9-10` imports, `:559`, `:571`, `:577` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `AiOfficeExplorer.tsx` delete confirmation | `treeSummary` | `describeTeamDocsTree` → `collectSubtreeIds` → `db.notes` | Yes — real `notes` rows, counted live | ✓ FLOWING |
| `teamPrompts.ts` employee folder line | `folderId` | `memberFolderIds` ← `ensureTeamDocsReady` ← `createMemberFolder` → `db.notes` | Yes | ✓ FLOWING |
| `teamPrompts.ts` lead folder block | `docsFolderId`, `memberFolders` | `liveTeam.docsFolderId` + `memberFolderIds` | Yes | ✓ FLOWING |
| `teamTools.ts` `write_doc` create | `folderId` | `ctx.folderId` ← coordinator map, re-proved by `resolveMemberFolder` | Yes | ✓ FLOWING |
| `teamTools.ts` `write_doc` list | rows | `getNotesByFolder(folderId)` → `db.notes` | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Phase 41 scoped suite | `npx vitest run tests/db/teamDocsRepo.test.ts tests/services/ai/office/aiTeamRepo.test.ts tests/services/ai/office/teamTools.test.ts tests/services/ai/office/teamPrompts.test.ts tests/services/ai/office/teamRunCoordinator.test.ts tests/services/backup/officeBackup.test.ts tests/db/schemaV27Migration.test.ts` | 7 files, 436 tests passed | ✓ PASS |
| Table-list parity (no new table) | `npx vitest run tests/db/tableListParity.test.ts tests/ai/chatTurnRuntime.test.ts` | 2 files, 55 tests passed | ✓ PASS |
| Explorer delete/teardown | `npx vitest run tests/components/ai/office/AiOfficeExplorerTeardown.test.tsx tests/workbench/AiExplorers.test.tsx` | 2 files, 16 tests passed | ✓ PASS |
| Typecheck | `npx tsc --noEmit` | clean | ✓ PASS |
| Probe: soft-deleted `ai-root` then export | ad-hoc node-environment test (created, run, deleted): `ensureDocsRoot` → `notes.update(root, {deletedAt})` → `ensureDocsRoot` → `exportBackupPayload` → `validateBackupPayload` | 2 notes carry `ai-root`; `valid: false` with `Only one folder may carry the "ai-root" slug` | ✗ FAIL — see W1 |

### Probe Execution

No phase-declared probes (`scripts/*/tests/probe-*.sh` absent; no probe mentioned in any 41-0N-PLAN/SUMMARY). Step 7c: SKIPPED (no probes declared or conventional for this phase).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| AIO-DOCS-01 | 41-01, 41-02, 41-04 | Team creation creates the folder tree in the same transaction | ✓ SATISFIED | `aiTeamRepo.ts:147-208`; tests `aiTeamRepo.test.ts:1127`, `:1168` |
| AIO-DOCS-02 | 41-01, 41-03, 41-05, 41-06 | Member calls `write_doc`; write visible immediately in its own folder | ✓ SATISFIED | `teamTools.ts:784-943`; `teamRunCoordinator.ts:1141-1147`; tests `teamTools.test.ts:1375`, `teamRunCoordinator.test.ts:6544` |
| AIO-DOCS-03 | 41-03, 41-05, 41-06 | Outside-folder write refused by code | ✓ SATISFIED | `teamTools.ts:874`, `:895-904`, `:819-824`; tests `teamTools.test.ts:1428` |
| AIO-DOCS-04 | 41-01, 41-03 | No folder creation, no other mutation; allowlist untouched | ✓ SATISFIED | `teamTools.ts:873`; `chatTurnTools.ts:21-40`; tests `teamTools.test.ts:1556`, `teamRunCoordinator.test.ts:6601` |
| AIO-DOCS-05 | 41-05, 41-06 | Leader keeps mutation tools + approval card; accept places the final | ✓ SATISFIED | `teamRunCoordinator.ts:1118-1139`, `:2102`; `teamPrompts.ts:232`; tests `teamRunCoordinator.test.ts:6564` |
| AIO-DOCS-06 | 41-01, 41-02, 41-04, 41-06 | Delete removes the tree; pre-41 teams backfill once | ✓ SATISFIED | `aiTeamRepo.ts:539`; `teamDocsRepo.ts:304-332`, `:376-466`; tests `aiTeamRepo.test.ts:1194`, `teamDocsRepo.test.ts:203`, `teamRunCoordinator.test.ts:6472` |

No orphaned requirements: all six AIO-DOCS ids appear in at least one plan's `requirements` field.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `src/db/repositories/teamDocsRepo.ts` | 123 | `ensureDocsRoot` treats a soft-deleted root as absent and mints a second `ai-root`; `validateBackup.ts:562-568` then rejects the app's own export (probe-proven) | ⚠️ WARNING (W1) | A lead-approved `delete_note` (soft) on the `AI Teams` folder leaves a trashed `ai-root`; the next turn mints a second, and `githubSyncService.push` does not validate (`:112`), so the only remote backup becomes unrestorable. D-08b mandates recreate-on-deleted; the validator mandates a singleton. The two rules disagree |
| `src/workbench/toolwindows/AiOfficeExplorer.tsx` | 127-142 | `disposeRun` before `deleteTeam`; a refused delete leaves the team alive with no run entry and no in-tab recovery (submits return `blocked`) | ⚠️ WARNING (W2) | Round-9 WR-01, still open. Data-safe (the transaction rolls back), but the user must close and reopen the tab with nothing telling them |
| `src/workbench/toolwindows/AiOfficeExplorer.tsx` | 151 | Confirmation counts come from the raw `docsFolderId`, not the slug-resolved folder | ℹ️ INFO (W3) | A corrupted handle can make the dialog name a user folder while `deleteTeamDocsTree` then refuses — misleading, but conservative (shows more than it deletes) |
| `src/db/repositories/teamDocsRepo.ts` | 25-32 | `isLiveFolder` has no production caller (only tests and a comment) | ℹ️ INFO | Dead export; `ensureDocsRoot:123` inlines the same check |
| `src/db/repositories/teamDocsRepo.ts` | 214 | `matches.sort((a, b) => (a.id < b.id ? -1 : 1))` is not a total order | ℹ️ INFO | Unreachable (primary keys); `localeCompare` is the same length |
| `src/db/repositories/teamDocsRepo.ts` | 325 | `collectSubtreeIds(teamFolderId, …)` uses the handle, not `resolved` | ℹ️ INFO | Equal today; using `resolved` would make the dependency explicit |
| `src/workbench/toolwindows/AiOfficeExplorer.tsx` | 30, 127-142 | `actionError` is never cleared on a successful delete | ℹ️ INFO | Stale red alert until dismissed |

No `TBD`/`FIXME`/`XXX` markers in any phase-modified file (grep across all 12 key files returned nothing) — debt-marker gate clean.

Review findings deliberately settled in round 9 and **not** reported as defects: the team delete being a hard delete (D-10) with the confirmation as the safety mechanism (`teamDocsRepo.ts:286-302`), and `validateBackup` checking shape/referential integrity rather than ownership (`validateBackup.ts:548-556`). Both match the code. Round-9 CR-01/CR-02/CR-03/WR-02/WR-03/IN-05 are resolved in the current code (`stripOrphanReservedSlugs` gone, comments now describe the hard delete, orphan slugs accepted, prefix check no longer duplicated).

### Human Verification Required

#### 1. The team tree is visible in Docs and an agent's write appears immediately

**Test:** Open a team whose tree exists, run a turn that makes an employee call `write_doc` `create`, then open Docs without reloading.
**Expected:** An `AI Teams` folder at the Docs root, containing the team folder, containing one folder per member; the new document appears inside that member's folder with the `{agentName} — ` title prefix, with no approval card shown.
**Why human:** Real-time `useLiveQuery` refresh and the rendered tree are visual behaviours; tests assert rows, not what the user sees.

#### 2. The delete confirmation names the tree before the click

**Test:** Click the delete icon on a team that has documents in its tree.
**Expected:** The popconfirm reads `Xóa nhóm «…»? … Thư mục tài liệu của nhóm (N thư mục, M tài liệu) cũng sẽ bị xóa vĩnh viễn.` with counts matching what Docs shows.
**Why human:** The dialog text and the live counts are only observable in the running app; the repo-level `describeTeamDocsTree` is covered (`teamDocsRepo.test.ts:907`), the rendered copy is not.

#### 3. The leader's final document lands at the team root after approval

**Test:** Ask the team for a deliverable; approve the leader's `create_note` card.
**Expected:** The final document appears directly inside the team folder (not a member folder); the member drafts remain untouched in their own folders.
**Why human:** Requires a live model turn plus the approval-card interaction (D-06/D-07/D-07b).

#### 4. A pre-41 team gets its tree on the first turn, once

**Test:** Use a team created before this phase (no `docsFolderId`), send one message, then a second.
**Expected:** After the first turn the tree exists; after the second there is still exactly one tree and no ` (2)` folder.
**Why human:** The lazy backfill is proven at repo and coordinator level, but the end-to-end first-turn observation is the C-15 quality gate.

### Gaps Summary

No must-have failed. All six ROADMAP success criteria and all six plans' truths are implemented and covered by passing scoped tests (507 tests across 11 files, `tsc` clean).

The one substantive warning is W1: `ensureDocsRoot` (recreate-on-deleted, per D-08b) and `validateBackup` (single `ai-root`, per round-7 WR-01) disagree, so a soft-deleted root makes the app produce an export its own validator rejects. Reproduced with a throwaway probe: two `ai-root` notes, `valid: false`. This is a data-safety gap in the backup path, not a failure of the phase's docs-tree goal, and it needs an owner decision (restore the trashed root instead of minting, or relax the singleton rule to a repair).

W2 is the round-9 warning that a refused `deleteTeam` leaves the team alive with a disposed coordinator and no in-tab recovery.

---

_Verified: 2026-11-15T10:17:06Z_
_Verifier: Claude (gsd-verifier)_
