---
phase: 41-ai-office-team-docs-zones-per-team-docs-folder-tree-and-agen
reviewed: 2026-11-15T13:00:00Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - src/db/schema.ts
  - src/db/index.ts
  - src/types/aiOffice.ts
  - src/validation/backupSchemas.ts
  - src/db/repositories/teamDocsRepo.ts
  - src/db/repositories/aiTeamRepo.ts
  - src/services/ai/office/teamTools.ts
  - src/services/ai/office/teamPrompts.ts
  - src/services/ai/office/teamRunCoordinator.ts
  - src/services/ai/aiTools.ts
  - tests/db/schemaV26Migration.test.ts
  - tests/db/teamDocsRepo.test.ts
  - tests/services/ai/office/aiTeamRepo.test.ts
  - tests/services/ai/office/teamTools.test.ts
  - tests/services/ai/office/teamPrompts.test.ts
  - tests/services/ai/office/teamRunCoordinator.test.ts
  - tests/services/backup/officeBackup.test.ts
findings:
  critical: 4
  warning: 6
  info: 4
  total: 14
status: issues_found
---

# Phase 41: Code Review Report

**Reviewed:** 2026-11-15
**Depth:** standard
**Files Reviewed:** 17
**Status:** issues_found

## Summary

The core design still holds: `parentId` comes only from `ctx.folderId`, `type` is a literal `'document'`, the role guard runs before `action` is read, `write_doc` is absent from `MUTATION_TOOLS`, and the payload asymmetry is pinned on both sides. I re-checked every transaction store list by hand — `createTeam`, `updateTeam`, `assignLeader`, `addTeamMember`, `deleteTeam` and `ensureTeamDocsReady` each name every table their bodies read, so the `SubTransactionError`/`NotFoundError` class the previous review worried about is genuinely absent. `collectSubtreeIds` is correct (indexed `parentId`, `anyOf` guarded against an empty frontier, `seen` makes it cycle-safe), and the reordered `createTeam` (tree before row) is sound because the folder writes and the row write share one `rw` scope.

What did not hold is the *trust boundary around `docsFolderId`*. The previous round hardened `deleteTeamDocsTree` against the shared root (WR-09) but left the same class of hole in three neighbouring places, and each one is a data-loss path I reproduced against a real `fake-indexeddb` database:

- `deleteTeam` deletes whatever `docsFolderId` names — a user document, or another team's folder.
- `updateTeam`'s new rename writes `title` onto whatever `docsFolderId` names.
- `ensureTeamDocsReady` accepts any live folder as a member's zone, including the team root.

The tree delete also still produces a backup the app's own validator rejects, because `documentSets.documentIds` and document-scoped `chatThreads` are not cleaned up — the exact CR-02 criterion the previous round used for attachments.

### Prior findings — verification

All 12 fixes from `e6b660d6` are present and behave as claimed: CR-01 (body stays `undefined`, both-absent refuses `INVALID_ARGUMENT`), CR-02 (attachments bulk-deleted; `noteAttachments`/`settings` named in `deleteTeam`), CR-03 (`collectSubtreeIds` walks every depth, cycle-safe), WR-01 (per-member liveness + re-mint), WR-02 (both caps refuse rather than throw), WR-03 (`type === 'folder'` refused — but see WR-03 below for the blacklist gap), WR-04 (dedupe + lead dropped), WR-05 (title wrapped — but see WR-04 below for the leftover field), WR-06 (`parentId` named), WR-07 (rename in-transaction — but see CR-02 below for the missing target check), WR-08 (present + absent `docsFolderId` fixtures), WR-09 (shared-root guard). Scoped suites pass: `teamDocsRepo`, `teamTools`, `teamPrompts`, `aiTeamRepo`, `teamRunCoordinator` (120 + 78 + 170 tests), and `tsc --noEmit` is clean.

## Critical Issues

### CR-01: `deleteTeam` hard-deletes whatever `docsFolderId` names, including a user document or another team's tree

**File:** `src/db/repositories/teamDocsRepo.ts:143-165` (guard at `:152-153`), called from `src/db/repositories/aiTeamRepo.ts:516`

**Issue:** `deleteTeamDocsTree` validates exactly one thing: that the id is not the shared `AI Teams` root. It never checks that the target is a *folder*, and never checks that it is a child of the shared root. `docsFolderId` is restored verbatim from a backup and validated only as a UUID (`src/validation/backupSchemas.ts:670`), so a corrupted or hand-edited payload — or a `db.aiTeams.update` from any future code path — makes "delete team" destroy unrelated user content.

Reproduced (real Dexie, `fake-indexeddb`):

```
docsFolderId := a root-level user document ("Tai lieu cua nguoi dung")
deleteTeam(team.id)
→ db.notes.get(userDoc.id) === undefined      // the user's document is gone
```

The same call with `docsFolderId` pointing at another team's folder deletes that team's entire tree, because `collectSubtreeIds` walks from whatever root it is handed.

**Fix:** make the guard a shape check, not a single-id comparison. Reuse the same predicate in `updateTeam` (CR-02) and the backup validator (WR-06):

```ts
// teamDocsRepo.ts — before descending
const rootSetting = await db.settings.get(AI_TEAMS_DOCS_ROOT_SETTING_KEY);
const rootId = typeof rootSetting?.value === 'string' ? rootSetting.value : undefined;
if (rootId === undefined || teamFolderId === rootId) return;
const teamFolder = await db.notes.get(teamFolderId);
// Only a live folder that is a DIRECT child of the shared root is a team folder.
if (!teamFolder || teamFolder.deletedAt || teamFolder.type !== 'folder') return;
if (teamFolder.parentId !== rootId) return;
```

### CR-02: `updateTeam`'s rename overwrites the title of whatever `docsFolderId` names

**File:** `src/db/repositories/aiTeamRepo.ts:307-312`

**Issue:** The WR-07 fix added `db.notes.update(updated.docsFolderId, { title: validated.name })` with no liveness, type, or ownership check. WR-09 taught `deleteTeamDocsTree` that a corrupted `docsFolderId` can point anywhere; the rename path did not learn it.

Reproduced:

```
docsFolderId := the shared "AI Teams" root   → updateTeam(id, {name:'Hijacked'}) → root title === 'Hijacked'
docsFolderId := a root-level user document   → updateTeam(id, {name:'Renamed'}) → document title === 'Renamed'
```

The second case silently destroys a user-authored title. The existing test `tests/services/ai/office/aiTeamRepo.test.ts:1376` ("updateTeam with a rename leaves a dead docsFolderId alone") only asserts the *dead* folder stays dead, so it passes while the live-target corruption is unguarded.

**Fix:** gate the rename on the same shape check as CR-01:

```ts
if (validated.name !== undefined && updated.docsFolderId !== undefined) {
  const folder = await db.notes.get(updated.docsFolderId);
  if (folder && !folder.deletedAt && folder.type === 'folder') {
    await db.notes.update(updated.docsFolderId, {
      title: validated.name,
      updatedAt: new Date().toISOString(),
    });
  }
}
```

### CR-03: a member's zone is any live folder — a member can be pointed at the team root and write there

**File:** `src/db/repositories/teamDocsRepo.ts:24-31` (`isLiveFolder`), used at `:197-215`

**Issue:** Success criterion 2/3 is "every member writes documents only inside its own subfolder". The runtime enforces that `write_doc` targets `ctx.folderId`, but `ctx.folderId` is `memberFolderIds.get(agentId)`, and `ensureTeamDocsReady` accepts any row whose `docsFolderId` names a live folder — it never checks the folder is a *child of the team folder*.

Reproduced:

```
member row docsFolderId := team.docsFolderId   (corrupted backup, or the owner moved the
                                                folder in Docs — NotesView.tsx:883 allows it)
ensureTeamDocsReady(teamId)
→ memberFolderIds.get(agentId) === team.docsFolderId
```

`write_doc` then writes the member's documents at the team root, next to the leader's approved final — the isolation the phase exists to provide is gone, and the leader's "read each member's draft from their folder" prompt block points at the root.

**Fix:** add a parent check to the per-member branch (and to the rebuild path's returned map):

```ts
async function isMemberFolder(noteId: string | undefined, teamFolderId: string, db) {
  if (noteId === undefined) return false;
  const row = await db.notes.get(noteId);
  return !!row && !row.deletedAt && row.type === 'folder' && row.parentId === teamFolderId;
}
```

Use it at `teamDocsRepo.ts:200` in place of `isLiveFolder`, so a mis-parented folder is re-minted rather than trusted.

### CR-04: the tree hard-delete leaves `documentSets` and document-scoped `chatThreads` dangling — the app's own next export fails validation

**File:** `src/db/repositories/teamDocsRepo.ts:155-164`

**Issue:** CR-02 last round established the rule: anything that deletes notes must delete or detach every row that references them, or `validateBackup` rejects the app's own export. The fix covered `noteAttachments` only. Two more reference classes exist and both are reachable from a team tree:

- `documentSets.documentIds` — validated at `src/services/backup/validateBackup.ts:383-393`
- `chatThreads` with `scopeType: 'document'` — validated at `src/services/backup/validateBackup.ts:435-442`

Reproduced (delete the team, then export):

```
documentSets:  "DocumentSet references documentId \"…\" not found in notes"
chatThreads:   "ChatThread references documentId \"…\" not found in notes"
```

Both are reachable without contrivance: a member's `write_doc` document can be added to a document set from the Docs UI (`DocumentSetForm` folder mode snapshots every document under a folder), and "Ask AI about this document" (`src/components/notes/DocEditorPane.tsx:493`) creates a `scopeType: 'document'` thread for it. `githubSyncService.ts:248` validates before accepting a pull, so a pushed backup becomes unrestorable.

Note: `deleteNote` (`src/db/repositories/noteRepo.ts:132-143`) shares this gap, so the correct fix is a shared helper rather than a fourth copy of the same list.

**Fix:** extend the cleanup in `deleteTeamDocsTree` (and `deleteNote`/`bulkPermanentDeleteNotes`) to detach the two reference classes, in the same transaction:

```ts
// document sets: drop the ids rather than the whole set
const sets = await db.documentSets.toArray();
for (const set of sets) {
  if (!set.documentIds.some((id) => ids.includes(id))) continue;
  await db.documentSets.update(set.id, {
    documentIds: set.documentIds.filter((id) => !ids.includes(id)),
    updatedAt: new Date().toISOString(),
  });
}
// document-scoped chat threads die with their document, like team threads do
const threads = await db.chatThreads.where('scopeType').equals('document').toArray();
const doomed = threads.filter((t) => t.entityId !== undefined && ids.includes(t.entityId));
if (doomed.length > 0) {
  const threadIds = doomed.map((t) => t.id);
  await db.chatMessages.where('threadId').anyOf(threadIds).delete();
  await db.chatTabs.where('threadId').anyOf(threadIds).delete();
  await db.chatThreads.bulkDelete(threadIds);
}
```

`db.documentSets` must then be added to `deleteTeam`'s store list (`aiTeamRepo.ts:469-489`).

## Warnings

### WR-01: the lead's folder is named after its UUID whenever the tree is rebuilt or repaired

**File:** `src/db/repositories/teamDocsRepo.ts:206` and `:218-223`

**Issue:** Both backfill paths resolve names from `db.aiEmployees`, but the lead lives in `db.aiLeads`. `createTeam` gets this right (`aiTeamRepo.ts:180-189` reads `aiLeads` for the lead), so the two code paths disagree.

Reproduced:

```
createTeam(...)                        → lead folder title === 'Truong Nhom'
delete team folder, ensureTeamDocsReady → lead folder title === '8e2b0489-14dc-…'
delete only the lead folder, repair    → lead folder title === 'd63dd5e6-ea93-…'
```

The owner then sees a UUID in the Docs tree, and the leader's prompt block (`teamPrompts.ts:220-236`) lists a member folder it cannot identify.

**Fix:** resolve the lead separately in both paths:

```ts
const lead = team.leadId === undefined ? undefined : await db.aiLeads.get(team.leadId);
const nameFor = (agentId: string, employeeName: string | undefined) =>
  agentId === team.leadId ? (lead?.name ?? agentId) : (employeeName ?? agentId);
```

`db.aiLeads` is already in `ensureTeamDocsReady`'s caller store lists (`createTeam`, `updateTeam`, `assignLeader`) — but **not** in `addTeamMember`'s (`aiTeamRepo.ts:547-549`) nor in `ensureTeamDocsReady`'s own list (`teamDocsRepo.ts:190`). Both must name `db.aiLeads` or the repair throws `SubTransactionError`/`NotFoundError`.

### WR-02: re-adding a removed member mints a second folder and strands their earlier documents

**File:** `src/db/repositories/aiTeamRepo.ts:583-587`, `src/db/repositories/teamDocsRepo.ts:58-80`

**Issue:** `removeTeamMember` deliberately keeps the member's folder (`aiTeamRepo.ts:614-617`), but `addTeamMember`'s live-tree path always calls `createMemberFolder`, which dedupes by *title* only. Re-adding the same agent therefore produces `Nhan Vien` + `Nhan Vien (2)`, and the member row points at the new one.

Reproduced:

```
createTeam(employeeIds:[emp]) → folder 'Nhan Vien'
removeTeamMember(row)         → folder stays
addTeamMember({agentId: emp}) → folders: ['L', 'Nhan Vien', 'Nhan Vien (2)']
```

The old folder still holds everything the member wrote in earlier runs, and the leader's prompt now names only the new folder — those documents become invisible to the synthesis path.

**Fix:** before minting, look for an existing live folder under the team folder whose title matches the agent's name (or, better, record the folder id on the removed row instead of deleting it and reuse it):

```ts
const existing = (await db.notes.where('parentId').equals(teamFolderId).toArray())
  .find((n) => n.type === 'folder' && !n.deletedAt && n.title === agent.name);
const folderId = existing?.id ?? (await createMemberFolder(teamFolderId, agent.name, db));
```

### WR-03: `write_doc` update refuses only `type === 'folder'`, so it overwrites a `diagram` note

**File:** `src/services/ai/office/teamTools.ts:851-860`

**Issue:** The type check is a blacklist. `NOTE_TYPES` is `['quick_note', 'document', 'folder', 'diagram']` (`src/validation/schemas.ts:414`), and `list` (`teamTools.ts:793-794`) filters only folders too, so a diagram inside the member's folder is both listed as a document and writable.

Reproduced:

```
diagram note in the member's own folder, write_doc {action:'update', body:'bi sua'}
→ { noteId: '…', title: 'So do' }        // not refused
→ note.body === 'bi sua'                 // the diagram source is destroyed
```

**Fix:** whitelist instead of blacklist, in both `list` and `update`:

```ts
const WRITABLE_DOC_TYPES = new Set(['document', 'quick_note']);
// update guard
if (!existing || existing.deletedAt || existing.parentId !== folderId ||
    !WRITABLE_DOC_TYPES.has(existing.type)) { … }
// list filter
.filter((note) => WRITABLE_DOC_TYPES.has(note.type))
```

### WR-04: `query_notes` still returns `entityName` raw — the WR-05 fix covered `title` but not its neighbour

**File:** `src/services/ai/aiTools.ts:3069` (value built at `:3048-3050`)

**Issue:** WR-05 wrapped `title` and `bodySnippet` because `write_doc` makes note titles model-authored and the lead is the one agent holding mutation tools. `entityName` is derived from `task.name` / `cr.name` / `system.name` — user-authored free text, exactly the same class as the body that sits next to it and *is* wrapped. The asymmetry is inside one object literal, so the next reader cannot tell which fields are trusted.

**Fix:**

```ts
entityName: wrapField(`TÊN MỤC LIÊN KẾT ${n.id}`, entityName),
```

### WR-05: the rename test asserts the wrong thing and cannot catch CR-02

**File:** `tests/services/ai/office/aiTeamRepo.test.ts:1376-1384`

**Issue:** `'updateTeam with a rename leaves a dead docsFolderId alone (WR-07)'` deletes the folder first, then asserts it is still absent. That passes whether or not the rename is guarded, so it does not test the guard it names. There is no test for a *live non-folder* target, which is how CR-02 survived.

**Fix:** add the two cases the guard must reject:

```ts
it('updateTeam rename does not touch a docsFolderId that names a document', async () => {
  const team = await makeTeam('Stale');
  const doc = await createNote({ title: 'User doc', body: 'x', type: 'document' }, db);
  await db.aiTeams.update(team.id, { docsFolderId: doc.id });
  await updateTeam(team.id, { name: 'Renamed' }, db);
  expect((await db.notes.get(doc.id))?.title).toBe('User doc');
});
it('updateTeam rename does not touch the shared root', async () => {
  const team = await makeTeam('Stale');
  const rootId = (await db.settings.get(AI_TEAMS_DOCS_ROOT_SETTING_KEY))!.value as string;
  await db.aiTeams.update(team.id, { docsFolderId: rootId });
  await updateTeam(team.id, { name: 'Hijacked' }, db);
  expect((await db.notes.get(rootId))?.title).toBe(AI_TEAMS_DOCS_ROOT_TITLE);
});
```

### WR-06: `docsFolderId` has no referential validation, which is what lets CR-01/CR-02/CR-03 happen

**File:** `src/validation/backupSchemas.ts:670` and `:688`; missing check in `src/services/backup/validateBackup.ts`

**Issue:** Both fields are validated as `uuidSchema.optional()` and nothing else. Every other live reference in the payload is checked (`aiTeamLinks.teamId`, `noteAttachments.noteId`, `documentSets.documentIds`, `chatThreads.entityId`), so this pair is the only unvalidated handle — and it is the handle that drives a hard delete and a title write. The comment on `teamDocsRepo.ts:149-151` acknowledges the risk and then defends one case instead of validating the field.

**Fix:** add the referential check next to the other note references in `validateBackup.ts`:

```ts
for (const team of aiTeams ?? []) {
  if (team.docsFolderId !== undefined && !noteIds.has(team.docsFolderId)) {
    errors.push({ table: 'aiTeams', recordId: team.id, field: 'docsFolderId',
      message: `AiTeam references docsFolderId "${team.docsFolderId}" not found in notes` });
  }
}
for (const member of aiTeamMembers ?? []) {
  if (member.docsFolderId !== undefined && !noteIds.has(member.docsFolderId)) {
    errors.push({ table: 'aiTeamMembers', recordId: member.id, field: 'docsFolderId',
      message: `AiTeamMember references docsFolderId "${member.docsFolderId}" not found in notes` });
  }
}
```

This is defence in depth, not a substitute for CR-01/CR-02/CR-03 — the runtime guards are what protect a live database.

## Info

### IN-01: `write_doc` update reports success with an empty title if the note vanished mid-call

**File:** `src/services/ai/office/teamTools.ts:881-886`

`updateNote` returns `null` when the row disappeared between the `get` and the `put`; the handler then returns `{ noteId, title: '' }`, which reads as success. A narrow race, but the model has no way to tell it wrote nothing.

**Fix:** `if (!updated) return JSON.stringify(refuse('DOC_NOT_IN_YOUR_FOLDER', '…'));`

### IN-02: `createMemberFolder`'s collision fallback can still collide

**File:** `src/db/repositories/teamDocsRepo.ts:70-73`

Past 99 suffixed siblings the fallback is `${agentName} (${Date.now()})`. Titles are not unique in `db.notes`, so two calls in the same millisecond produce two identically named folders. Cosmetic only (ids are the identity), but the comment claims the timestamp "keeps a hostile roster from spinning" — it does not, it just renames the collision.

### IN-03: `deleteTeamDocsTree` hard-deletes soft-deleted descendants with no Trash step

**File:** `src/db/repositories/teamDocsRepo.ts:117-133`, `:164`

`collectSubtreeIds` does not filter `deletedAt`, so notes the owner had already moved to Trash are permanently destroyed by a team delete, with no recovery path. This matches D-10 ("deleting a team deletes the whole tree"), so it is a documented decision — worth one line in the function comment so the next reader does not "fix" it into a soft delete.

### IN-04: `write_doc` list includes diagrams, so the model sees types it must not write

**File:** `src/services/ai/office/teamTools.ts:793-799`

The list projection drops `type` entirely, so the model cannot distinguish a document from a diagram it is about to overwrite (see WR-03). Including `type` in the projection would let the model self-correct even before the whitelist lands.

---

_Reviewed: 2026-11-15_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
