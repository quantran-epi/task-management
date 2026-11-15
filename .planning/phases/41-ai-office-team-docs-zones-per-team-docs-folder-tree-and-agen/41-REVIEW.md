---
phase: 41-ai-office-team-docs-zones-per-team-docs-folder-tree-and-agen
reviewed: 2026-11-15T06:55:00Z
depth: standard
files_reviewed: 18
files_reviewed_list:
  - src/db/schema.ts
  - src/db/index.ts
  - src/types/aiOffice.ts
  - src/validation/backupSchemas.ts
  - src/db/repositories/teamDocsRepo.ts
  - src/db/repositories/aiTeamRepo.ts
  - src/db/repositories/noteRepo.ts
  - src/services/ai/office/teamTools.ts
  - src/services/ai/office/teamPrompts.ts
  - src/services/ai/office/teamRunCoordinator.ts
  - src/services/ai/aiTools.ts
  - src/services/backup/validateBackup.ts
  - tests/db/teamDocsRepo.test.ts
  - tests/services/ai/office/aiTeamRepo.test.ts
  - tests/services/ai/office/teamTools.test.ts
  - tests/services/ai/office/teamPrompts.test.ts
  - tests/services/ai/office/teamRunCoordinator.test.ts
  - tests/services/backup/officeBackup.test.ts
findings:
  critical: 4
  warning: 4
  info: 4
  total: 12
status: issues_found
---

# Phase 41: Code Review Report (Round 3)

**Reviewed:** 2026-11-15T06:55:00Z
**Depth:** standard
**Files Reviewed:** 18
**Status:** issues_found

## Summary

Round-2's four critical fixes all hold mechanically, and the phase's core invariants are
provable: the tree is created in the team's transaction, `write_doc` is employee-only and
absent from `MUTATION_TOOLS`, `parentId` comes from `ctx.folderId` and never from args,
`create_note`/`update_note`/`delete_note` stay outside `EMPLOYEE_READ_ONLY_ALLOWLIST`, and
`detachNoteReferences`' store lists are complete for every caller (no `SubTransactionError`
path exists — `deleteTeam`, `deleteNote` and `bulkPermanentDeleteNotes` each name all six
tables the helper touches, and no existing `bulkPermanentDeleteNotes` caller wraps it in a
transaction).

What the fixes did **not** close is the same trust boundary they were written for. CR-01 and
CR-02 hardened the two *destructive* consumers of `docsFolderId` (delete, rename) but the
*read/write* consumer — `ensureTeamDocsReady` — still trusts the handle, so a restored or
crafted handle pointing at the shared root or at another team's folder becomes a live member
zone. In the other direction, CR-01's parent-shape proof is now too strict: any legitimate
team folder that is not a direct child of the *current* root silently escapes deletion, which
breaks success criterion 6 and leaves personal documents on disk after "delete team".

Separately, WR-06's new referential check plus the lazy repair creates a new data-safety
regression: a normal Docs-UI folder delete makes the app's own export fail its own validator,
and push does not validate, so the only remote backup can become unimportable.

Every finding below was reproduced against a real `TaskPlannerDatabase` (fake-indexeddb)
before being written down; the reproduction is quoted in the finding.

Round-2 fix verification:

| Fix | Holds? | Note |
|---|---|---|
| CR-01 delete ownership + root-shape guard | Partly | Correctly refuses user docs / other teams' folders / the root, but over-refuses legitimate deletes (CR-06, WR-03) |
| CR-02 rename guard | Partly | Root and non-folder cases covered; the cross-team claim is not (WR-01) |
| CR-03 `isChildFolderOf` member zones | Yes | Mis-parented member rows are re-minted; verified |
| CR-04 `detachNoteReferences` single helper | Yes | Store lists complete for all three callers; no caller breaks |
| WR-01 lead name from `aiLeads` | Yes | `aiLeads` named in both store lists |
| WR-02 folder adoption | No | Adopts the wrong folder for duplicate display names (CR-07) |
| WR-03 writable-doc whitelist | Yes | `document`/`quick_note` only, in both `list` and `update` |
| WR-04 `entityName` wrapped | Yes | `wrapField` applied; test asserts containment |
| WR-05 new tests | Yes | Live-document target and shared-root cases present |
| WR-06 `docsFolderId` referential check | No | Correct check, but nothing repairs the dangling handle (CR-08) |
| IN-01 vanished note refusal | Yes | `updateNote` null → refusal |

## Critical Issues

### CR-05: `ensureTeamDocsReady` trusts `docsFolderId` — a team can be handed the shared root or another team's folder

**File:** `src/db/repositories/teamDocsRepo.ts:251` (and `src/db/repositories/aiTeamRepo.ts:585`)

**Issue:** CR-01 established that `docsFolderId` is an untrusted handle and applied
`isChildFolderOf(id, rootId)` + a claimant scan in `deleteTeamDocsTree`. The backfill that
actually *uses* the handle still only calls `isLiveFolder`:

```ts
if (team.docsFolderId !== undefined && (await isLiveFolder(team.docsFolderId, db))) {
```

`validateBackup` (WR-06) only proves the id names *some* note. So a restored or hand-crafted
payload with `docsFolderId` = the shared `AI Teams` root, or = another team's folder, is
accepted, and the coordinator then mints member zones inside that tree. Reproduced:

- `docsFolderId` = another team's folder → the backfill keeps it and mints `Lead (2)` inside
  team 1's tree: `T1 children now [ 'Lead (2)', 'Lead', 'An' ]`. Two teams now share one zone,
  and `deleteTeamDocsTree`'s claimant scan then refuses *both* deletes (WR-03), so neither tree
  is ever removable.
- `docsFolderId` = the shared root → backfill keeps it and mints member folders directly under
  the root: `T2 docsFolderId === root? true root children: [ 'An', 'Lead', 'T2', 'T1' ]`. The
  leader prompt (`teamPrompts.ts:222`) then prints `Folder nhóm: <root id>`, so the approved
  final document is written into the shared root beside every other team's folder — the exact
  outcome CR-01 was written to prevent.

`addTeamMember`'s `liveTree` check (`aiTeamRepo.ts:585`) has the same gap.

**Fix:** one resolver, used by every consumer:

```ts
/** The only place a team folder is validated. Returns undefined for anything untrusted. */
export async function resolveTeamFolder(
  teamId: string,
  docsFolderId: string | undefined,
  db: TaskPlannerDatabase
): Promise<string | undefined> {
  const rootSetting = await db.settings.get(AI_TEAMS_DOCS_ROOT_SETTING_KEY);
  const rootId = typeof rootSetting?.value === 'string' ? rootSetting.value : undefined;
  if (!(await isChildFolderOf(docsFolderId, rootId, db))) return undefined;
  const claimants = (await db.aiTeams.toArray()).filter((t) => t.docsFolderId === docsFolderId);
  return claimants.some((t) => t.id !== teamId) ? undefined : docsFolderId;
}
```

Call it from `ensureTeamDocsReady` (rebuild when it returns undefined), `addTeamMember`'s
`liveTree`, `deleteTeamDocsTree` and `updateTeam`'s rename.

---

### CR-06: a team folder that is not a direct child of the *current* root is never deleted — the tree leaks

**File:** `src/db/repositories/teamDocsRepo.ts:187-189`

**Issue:** the guard is `if (!(await isChildFolderOf(teamFolderId, rootId, db))) return;`. That
is true for a legitimate tree as soon as the root changes or disappears, and the root *does*
change in normal use: the `AI Teams` folder is an ordinary `type: 'folder'` row with no
`diagram` tag, so `DocFolderTree` lists it and `DocsExplorer` can delete it. `ensureDocsRoot`
then mints a fresh root and rewrites the setting. Every pre-existing team folder is now
parented to the old (deleted) root, so `deleteTeam` silently deletes nothing. Reproduced on a
plain (uncorrupted) database:

```
# owner deleted the AI Teams root in Docs, then created a new team root
root replaced? true
LEAK-ORPHAN before 4 after 4 [ 'AI Teams', 'T1', 'An', 'Lead' ]
```

Same leak when the setting is missing (`LEAK no setting: before 3 after 3`) and when the team
row is already gone (`existing?.docsFolderId` → `undefined`). `deleteTeam` still reports
success, so the user believes the team's documents are gone; they are not, and no app surface
can reach them (the folders are now top-level in Docs). This breaks success criterion 6.

**Fix:** prove ownership by content instead of by parent shape — a folder is this team's iff
it is a live folder that contains at least one member folder claimed by this team's member
rows, or the team row's own handle when no other team claims it:

```ts
async function isOwnTeamFolder(teamId: string, folderId: string, db: TaskPlannerDatabase) {
  const row = await db.notes.get(folderId);
  if (!row || row.deletedAt || row.type !== 'folder') return false;
  const claimants = (await db.aiTeams.toArray()).filter((t) => t.docsFolderId === folderId);
  if (claimants.some((t) => t.id !== teamId)) return false;
  // Ownership proof that survives a root swap: one of this team's member folders is inside it.
  const memberFolderIds = (
    await db.aiTeamMembers.where('teamId').equals(teamId).toArray()
  ).map((m) => m.docsFolderId).filter((id): id is string => id !== undefined);
  if (memberFolderIds.length === 0) return claimants.some((t) => t.id === teamId);
  return (await db.notes.where('parentId').equals(folderId).toArray()).some(
    (child) => child.type === 'folder' && memberFolderIds.includes(child.id)
  );
}
```

Keep the shared-root refusal as a hard early return (`folderId === rootId`), then use this
proof. Also surface the refusal instead of returning silently (see WR-03).

---

### CR-07: WR-02 folder adoption hands one member's zone to another member with the same display name

**File:** `src/db/repositories/aiTeamRepo.ts:590-604`, `src/db/repositories/teamDocsRepo.ts:104-114`

**Issue:** `findMemberFolderByTitle` matches on `title === agentName` only. Display names are
not unique (`AiEmployeeInputSchema` has no uniqueness rule, and employees and leads live in
different tables), so the second agent to join adopts the first agent's folder. Reproduced:

```
A zone 10462575-… B zone 10462575-… shared? true
B lists [{"noteId":"24b9bf4c-…","title":"An — Bao cao A",…}]
B update {"noteId":"24b9bf4c-…"} | A doc body now: B overwrote A
```

Same with an employee named like the lead:

```
lead zone 1e97d821-… emp zone 1e97d821-… shared? true
employee write into lead zone: {"noteId":"02d50c9e-…","title":"An — x"}
```

So `write_doc`'s `parentId === ctx.folderId` guard is satisfied while the caller is writing in
another member's (or the leader's) zone. That defeats success criteria 2 and 3 in substance
even though the code check passes.

**Fix:** adopt only a folder no other row already claims:

```ts
const claimed = new Set(
  (await db.aiTeamMembers.where('teamId').equals(validated.teamId).toArray())
    .map((r) => r.docsFolderId)
    .filter((id): id is string => id !== undefined)
);
const reusableFolderId =
  liveTree && candidate !== undefined && !claimed.has(candidate) ? candidate : undefined;
```

and in `ensureTeamDocsReady`'s repair branch, mint a suffixed sibling when the folder it would
reuse is claimed by another row. A durable fix is a per-member marker on the folder row (e.g. a
`slug`/tag carrying the member row id), since titles are user-editable.

---

### CR-08: a normal Docs-UI folder delete makes the app's own export fail its own validator

**File:** `src/services/backup/validateBackup.ts:563,581` + `src/db/repositories/noteRepo.ts:140-173`

**Issue:** WR-06 added the referential check but nothing repairs the handle. Deleting a member
folder (or the team folder) from Docs leaves `aiTeamMembers.docsFolderId` /
`aiTeams.docsFolderId` dangling, and repair only happens on the team's *next* turn. Reproduced
on an uncorrupted database:

```
VALID false
ERR aiTeamMembers docsFolderId AiTeamMember references docsFolderId "d7b6263e-…" not found in notes
```

`executeGitHubBackupPush` (`githubSyncService.ts:101`) exports and encrypts **without**
validating, so the invalid envelope is uploaded; every later pull
(`githubSyncService.ts:248`) and `restoreBackupPayload` (`restoreBackup.ts:341`) rejects it.
The user's only remote backup becomes unimportable until some team runs a turn — and a team
with no further turns never repairs it. Before WR-06 this round-tripped fine, so this is a
regression introduced by the fix.

**Fix:** clear the handle where the note dies, and name the tables in the transaction:

```ts
// noteRepo.ts — inside detachNoteReferences, after the note ids are known
const doomedTeams = (await db.aiTeams.toArray()).filter(
  (t) => t.docsFolderId !== undefined && doomed.has(t.docsFolderId)
);
for (const t of doomedTeams) await db.aiTeams.update(t.id, { docsFolderId: undefined });
for (const m of await db.aiTeamMembers.toArray()) {
  if (m.docsFolderId !== undefined && doomed.has(m.docsFolderId)) {
    await db.aiTeamMembers.update(m.id, { docsFolderId: undefined });
  }
}
```

then add `db.aiTeams`, `db.aiTeamMembers` to the store lists of `deleteNote` and
`bulkPermanentDeleteNotes` (and to `deleteTeam`'s, which already names them). Alternatively,
project a dead handle away in `exportBackupPayload` — but clearing at the write is the state
owner and matches the project's "fix at the state owner" rule.

## Warnings

### WR-01: `updateTeam`'s rename guard is missing the claimant scan that `deleteTeamDocsTree` has

**File:** `src/db/repositories/aiTeamRepo.ts:311-325`

**Issue:** CR-02 gates the rename on "not the root" + live + folder, but not on "no other team
claims it". A corrupted `docsFolderId` naming another team's folder renames that folder.
Reproduced: `T1 folder title now: HIJACKED`. Same trust boundary as CR-01, half-fixed.

**Fix:** route the rename through the `resolveTeamFolder` helper from CR-05.

### WR-02: `write_doc` create does not check that `ctx.folderId` still exists

**File:** `src/services/ai/office/teamTools.ts:816-851`

**Issue:** `create` writes with `parentId: folderId` unconditionally. If the owner deletes the
member folder after the turn started, the note is created with a dangling `parentId` and the
tool reports success. Reproduced:

```
ORPHAN write: {"noteId":"4c95130a-…","title":"An — Bao cao"} | stored parentId 0faca0d9-… folder exists? false
```

`DocFolderTree` only surfaces documents whose `parentId` resolves to a known folder, so the
document is invisible in Docs (search only). Success criterion 2 promises a *visible* document.

**Fix:** before the write, `if (!(await isLiveFolder(folderId, ctx.db))) return
JSON.stringify(refuse('TEAM_DOCS_NOT_READY', …))`. Same check at the top of the `list` and
`update` branches (a `folderId` that is a document id would otherwise pass the
`parentId === folderId` test).

### WR-03: the CR-01 claimant scan refuses a legitimate delete and leaks the tree

**File:** `src/db/repositories/teamDocsRepo.ts:195-200`

**Issue:** when two team rows carry the same `docsFolderId` (a stale copy from a restore, or the
CR-05 path above), *neither* team's delete removes anything, and both return silently.
Reproduced:

```
SHARED folder: notes before 6 after T1 delete 6 after T2 delete 3
```

The second delete only works because the first team row is gone. The refusal itself is the
right call (deleting another team's content is worse), but the silent no-op is not: `deleteTeam`
reports success while the documents survive.

**Fix:** keep the refusal, but make it observable — return a result from
`deleteTeamDocsTree` and have `deleteTeam` log/report `DOCS_TREE_NOT_OWNED`, or delete the
claimant-less tree after re-verifying ownership via the CR-06 content proof.

### WR-04: `detachNoteReferences` leaves `publishedDocuments` and `knowledgeLinks.docId` dangling

**File:** `src/db/repositories/noteRepo.ts:140-173`

**Issue:** the helper detaches attachments, document-set entries and document-scoped threads,
but not the two remaining note references. `publishedDocuments` rows keyed by
`[setId, documentId]` survive, and `NotesView`'s status computation
(`NotesView.tsx:420-431`) requires `metadata.length === set.documentIds.length`, so after the
set entry is dropped the set permanently reads `Local changes` with no way back.
`knowledgeLinks.docId` likewise names a gone note.

**Fix:** in the same helper, `await db.publishedDocuments.where('documentId').anyOf(ids).delete()`
(and the matching `knowledgeLinks` cleanup), adding both tables to the three callers' store
lists.

## Info

### IN-01: `ensureDocsRoot` mints a second `AI Teams` root when the setting is lost but the old root row survives

**File:** `src/db/repositories/teamDocsRepo.ts:56-67`

Identity is the setting only, so a payload that loses `settings` but keeps `notes` produces two
`AI Teams` folders and permanently orphans every existing tree (CR-06). Consider adopting an
existing top-level folder titled `AI_TEAMS_DOCS_ROOT_TITLE` when the setting is absent.

### IN-02: `deleteTeamDocsTree`'s `ownerTeamId` is optional, so the claim check is skippable

**File:** `src/db/repositories/teamDocsRepo.ts:180`

The only production caller passes it, but an optional security parameter is a footgun. Make it
required (tests can pass the team id).

### IN-03: `createMemberFolder`'s timestamp fallback can still collide

**File:** `src/db/repositories/teamDocsRepo.ts:89`

`${agentName} (${Date.now()})` collides when two calls land in the same millisecond with 99+
siblings. `generateId().slice(0, 8)` is collision-free enough and no longer than the timestamp.

### IN-04: `write_doc`'s title-cap message can print a misleading maximum

**File:** `src/services/ai/office/teamTools.ts:830`

`MAX_DOC_TITLE_LENGTH - prefix.length` is correct today (names are capped at 60 by
`aiNameSchema`), but the message is computed from a value the caller does not control. Compute
the cap once and assert it is positive.

---

_Reviewed: 2026-11-15T06:55:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
