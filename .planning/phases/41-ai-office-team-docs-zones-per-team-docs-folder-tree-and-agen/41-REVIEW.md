---
phase: 41-ai-office-team-docs-zones-per-team-docs-folder-tree-and-agen
reviewed: 2026-11-15T17:10:00Z
depth: standard
files_reviewed: 21
files_reviewed_list:
  - src/db/index.ts
  - src/db/schema.ts
  - src/db/repositories/aiTeamRepo.ts
  - src/db/repositories/noteRepo.ts
  - src/db/repositories/teamDocsRepo.ts
  - src/services/ai/aiTools.ts
  - src/services/ai/office/teamPrompts.ts
  - src/services/ai/office/teamRunCoordinator.ts
  - src/services/ai/office/teamTools.ts
  - src/services/backup/validateBackup.ts
  - src/services/backup/restoreBackup.ts
  - src/types/aiOffice.ts
  - src/validation/backupSchemas.ts
  - src/validation/schemas.ts
  - src/workbench/toolwindows/AiOfficeExplorer.tsx
  - tests/db/teamDocsRepo.test.ts
  - tests/db/schemaV27Migration.test.ts
  - tests/services/ai/office/aiTeamRepo.test.ts
  - tests/services/ai/office/teamTools.test.ts
  - tests/services/ai/office/teamRunCoordinator.test.ts
  - tests/services/backup/officeBackup.test.ts
findings:
  critical: 3
  warning: 4
  info: 5
  total: 12
status: issues_found
---

# Phase 41: Code Review Report (Round 9)

**Reviewed:** 2026-11-15T17:10:00Z
**Depth:** standard
**Files Reviewed:** 21
**Status:** issues_found

## Summary

Round 8's fixes (commit `ad3b54a5`) are real. Verified fixed, and **not re-reported** below:

- **CR-01 (orphan reserved slug breaks the app's own export)** — `stripOrphanReservedSlugs`
  (`validateBackup.ts:85-95`) repairs instead of rejecting, matching the
  `stripNonApprovedVersionNumbers` precedent. Confirmed.
- **CR-02 (trashed tree silently leaked)** — `resolveTeamFolderIncludingDeleted`
  (`teamDocsRepo.ts:77-86`) is used on the delete path only, and a trashed tree is now deleted
  (soft). Confirmed by `teamDocsRepo.test.ts:884`.
- **CR-03 (`ownHandle` handed out a folder `write_doc` refuses)** — the fallback is gone; the
  backfill and `writeDoc` now share `resolveMemberFolder` (`teamDocsRepo.ts:406-415`). Confirmed.
- **CR-04 / CR-05 (a mis-resolved or user-owned folder destroyed by `deleteTeam`)** — the tree
  delete is a soft delete (`teamDocsRepo.ts:330-333`), so a wrong guess costs a Trash restore.
  Confirmed *at the data layer* — see CR-01/CR-02 below for why the recovery is not actually
  reachable.
- **WR-01 (`ai-root` exempt + setting unvalidated)** — uniqueness rule and setting check both
  present (`validateBackup.ts:590-601`, `:628-643`). Confirmed.
- **WR-02 (member folder parent not validated)** — parent half added (`validateBackup.ts:669-672`).
  Confirmed.
- **WR-03 (`team-deleted` stamped before a delete that can refuse)** — the explorer now disposes with
  `app-exit` (`AiOfficeExplorer.tsx:115`). Confirmed; the remaining ledger/UI consequence is WR-01
  below, which is a different defect.

What does not hold is the *claim* that the soft delete makes the operation recoverable. The data
layer is recoverable; the product is not. The Trash pane does not list folders, so the tree's
folders can never be restored, and restoring a document out of the tree makes it invisible. On top
of that, `detachNoteReferences` still **hard-deletes** every attachment, document-set entry,
publish row, knowledge link and document-scoped thread inside the tree — so the "recoverable"
operation permanently destroys user data before the user is ever offered a restore.

On the seven questions asked:

- **(a) Inconsistent state after the soft delete?** Yes, three ways: restored documents with a
  dangling `parentId` are invisible (CR-01); attachments and every other reference are gone
  forever (CR-02); and a restored tree keeps its reserved slugs while the team handle is cleared,
  so the next turn mints a second tree beside it and the restored one is silently demoted to an
  ordinary user folder on the next import (WR-02).
- **(b) Is the orphan-slug repair sound?** It cannot strip a slug a *handle* needs — a folder named
  by a handle is by construction not an orphan (`validateBackup.ts:612-626` vs `:650-673`). It does
  strip a slug that a *future* row needs: the documented "re-adding a removed member reuses its
  folder" behaviour does not survive a backup round-trip (WR-02). And the `ai-root` exemption
  leaves a folder the next turn treats wrongly (CR-03).
- **(c) Any remaining hard delete of user data?** Yes — `detachNoteReferences` inside the soft
  delete (CR-02). The team's own rows (transcript, ledger, links, members) are still hard-deleted,
  which is intended.
- **(d) Is `deleteTeam` correct end-to-end?** The transaction is: correct ordering (tree before
  member rows), complete store list, and a refusal rolls everything back. The UI is not: a refused
  delete leaves the team alive with its coordinator gone and no way to restart it from the open tab
  (WR-01).
- **(e) Does `app-exit` leave the ledger coherent if the delete succeeds?** Yes — the batch and
  assignment rows are deleted with the team, so the stamped reason never survives. On refusal the
  batch row reads `abortedBy: 'app-exit'` while the app is still running; that value has no reader
  in `src`, so the cost is documentation, not behaviour.
- **(f) Missing transaction stores?** None. `deleteTeam` names all seventeen stores
  `deleteTeamDocsTree` → `detachNoteReferences` touches; `createTeam`, `updateTeam`,
  `assignLeader`, `addTeamMember` and `ensureTeamDocsReady` all name `aiEmployees`, `aiLeads`,
  `notes` and `settings`; every nested `ensureTeamDocsReady` scope is a subset of its parent's.
  This question is clean.
- **(g) Tests asserting the old contract?** Yes — `teamDocsRepo.test.ts:274-299` asserts the
  attachments are gone *while* the notes are recoverable, i.e. it encodes CR-02 as intended
  behaviour. No test covers restore-from-Trash at all (WR-04).

## Critical Issues

### CR-01: The soft-deleted tree cannot be restored — Trash hides folders, and a restored document is invisible

**File:** `src/components/notes/DocFolderTree.tsx:148`, `:1139`, `src/db/repositories/noteRepo.ts:311-321`, `src/db/repositories/teamDocsRepo.ts:330-333`

**Issue:** The entire safety argument for the round-8 change is "a wrong guess costs the owner a
Trash restore, never the documents" (`teamDocsRepo.ts:288-294`). That restore does not exist.

1. The Trash pane lists only non-folder notes:
   ```ts
   // DocFolderTree.tsx:148
   const deletedDocs = useMemo(
     () => trashNotes.filter((n) => n.type !== 'folder' && n.type !== 'diagram'),
     [trashNotes]
   );
   ```
   and that is the only Trash list in the app (`:1139` is the only `renderSpecialFolder('trash', …)`
   call). `deleteTeamDocsTree` soft-deletes the team folder and every member folder, so those rows
   are in Trash and **unreachable from every UI**. The only action that touches them is
   "Dọn sạch thùng rác", which permanently deletes them (`NotesView.tsx:741-753`,
   `DocsExplorer.tsx:254-267` both filter on `deletedAt` alone, folders included).

2. Restoring a *document* out of the tree is worse than not restoring it. `restoreNote` clears
   `deletedAt` and nothing else:
   ```ts
   // noteRepo.ts:311-321
   delete existing.deletedAt;
   existing.updatedAt = now;
   await db.notes.put(existing);
   ```
   The document keeps `parentId` pointing at a member folder that is still trashed. It is then in
   no view: `rootDirectDocs` requires `!n.parentId` (`DocFolderTree.tsx:147`), `getFolderDocs`
   requires a live parent (`:367`), and the Trash list requires `deletedAt` (`:148`). Only
   full-text search with scope `all` (`:197-199`) can still find it. If the owner then empties
   Trash — the natural next click — the folders are permanently deleted and the document keeps a
   dangling `parentId` forever.

Reproduced path (no corruption, no backup payload): delete team → open Docs → Trash shows the
documents but not the folders → restore one document → it disappears from the tree.

**Fix:** Two changes, both small.

```ts
// 1. DocFolderTree: show trashed folders in the Trash list, or give the tree a
//    "restore this folder and everything under it" action.
const deletedDocs = trashNotes.filter((n) => n.type !== 'diagram');
```

```ts
// 2. noteRepo.restoreNote: a restore must not leave a dangling parentId. Either refuse
//    (the parent is still trashed) or re-parent to the root — never both silent.
export async function restoreNote(id: string, db = defaultDb): Promise<void> {
  const existing = await db.notes.get(id);
  if (!existing) return;
  if (existing.parentId !== undefined) {
    const parent = await db.notes.get(existing.parentId);
    if (!parent || parent.deletedAt) delete existing.parentId;   // surface it as a root
  }
  delete existing.deletedAt;
  existing.updatedAt = new Date().toISOString();
  await db.notes.put(existing);
}
```

and add a `restoreTeamDocsTree(teamId)` helper that clears `deletedAt` on the whole subtree and
re-stamps the team/member handles, so restoring the tree actually restores the team's docs.

---

### CR-02: The "recoverable" team delete still hard-deletes every attachment, document-set entry, publish row, knowledge link and document thread in the tree

**File:** `src/db/repositories/teamDocsRepo.ts:326-333`, `src/db/repositories/noteRepo.ts:194-256`

**Issue:** `deleteTeamDocsTree` soft-deletes the notes but calls `detachNoteReferences` first, and
that helper is a *permanent* delete for every row that references a note:

```ts
// noteRepo.ts:201-204
const attachments = await db.noteAttachments.where('noteId').anyOf(ids).toArray();
if (attachments.length > 0) {
  await db.noteAttachments.bulkDelete(attachments.map((attachment) => attachment.id));
}
```
plus `documentSets.documentIds` filtered (`:207-214`), `publishedDocuments` rows deleted (`:218-222`),
`knowledgeLinks` bulk-deleted (`:225-229`), and document-scoped `chatThreads` + their
`chatMessages` + `chatTabs` deleted (`:232-241`).

So the operation the owner is told is recoverable destroys, irreversibly:

- every image the member attached to a document in the tree (there is no Trash for attachments and
  `restoreNote` never re-creates them);
- the owner's document-set curation (which documents belong to which set);
- the publish ledger for those documents;
- every knowledge link pointing at them;
- every per-document chat thread and its messages.

Note the asymmetry that makes this a defect rather than a trade: `detachNoteReferences` exists so
the app's own export stays valid after a *permanent* delete (`noteRepo.ts:181-192`). A soft delete
does not need it — `validateBackup` already accepts a note with `deletedAt` and its attachments
(`BackupNoteAttachmentRecordSchema` only requires `noteId ∈ notes`, and the note is still there).
Running it on the soft path buys nothing and costs the user's data.

The confirmation copy has also not been updated: it still reads

> Xóa nhóm «…»? Toàn bộ transcript, phân công và tab chat của nhóm sẽ bị xóa.

(`AiOfficeExplorer.tsx:299`) — it never mentions the docs tree, which round 8's CR-05 asked for.

**Fix:** Keep the references on the soft path, and detach only when the notes are actually being
removed.

```ts
// teamDocsRepo.deleteTeamDocsTree — soft path: the notes survive, so their references must too.
// `detachNoteReferences` is for a permanent delete; running it here deletes the owner's
// attachments and set membership with no Trash to recover them from.
const now = new Date().toISOString();
for (const id of ids) await db.notes.update(id, { deletedAt: now, updatedAt: now });
// Only the team handles need clearing, and only because the team row is about to go.
for (const id of ids) {
  await db.aiTeams.where('docsFolderId').equals(id).modify({ docsFolderId: undefined });
  await db.aiTeamMembers.where('docsFolderId').equals(id).modify({ docsFolderId: undefined });
}
```

(If `docsFolderId` is not indexed, keep the existing `toArray()` scan from
`detachNoteReferences`.) Then `bulkPermanentDeleteNotes` on the emptied Trash still detaches
everything, which is where that helper belongs.

Also update the popconfirm copy to name the tree.

---

### CR-03: Soft-deleting the `ai-root` folder makes the next turn mint a second one, and the app's own export is then rejected

**File:** `src/db/repositories/teamDocsRepo.ts:118-140`, `src/services/backup/validateBackup.ts:590-601`

**Issue:** `ensureDocsRoot` treats a soft-deleted root as absent and creates a new one:

```ts
// teamDocsRepo.ts:121-126
if (stored !== undefined) {
  const row = await db.notes.get(stored);
  if (row && !row.deletedAt && row.type === 'folder' && row.slug === AI_TEAMS_DOCS_ROOT_SLUG) {
    return stored;
  }
}
// falls through to createNote({ slug: 'ai-root' }) + settings.put
```

The old root keeps `slug: 'ai-root'` in Trash. `validateBackup` then rejects the app's own export:

```ts
// validateBackup.ts:590-601
const rootSlugNotes = (notes ?? []).filter((n) => n.slug?.trim() === AI_TEAMS_DOCS_ROOT_SLUG);
if (rootSlugNotes.length > 1) {
  errors.push({ …, message: 'Only one folder may carry the "ai-root" slug' });
}
```

Reachable path: the lead's `delete_note` tool defaults to a soft delete (`aiTools.ts:3918-3932`) and
is advertised to the lead (`leadTools()` adds every mutation tool not in `LEAD_TOOL_ALLOWLIST`), so
one approved call on the `AI Teams` folder produces the state. The next turn (or the next
`createTeam`) mints a second root. `githubSyncService` pushes without validating
(`githubSyncService.ts:101`), so the only remote backup becomes silently unrestorable — and there is
no repair path either, because CR-01 means the old root is not listed in Trash.

**Fix:** Make `ensureDocsRoot` adopt a live-or-trashed folder carrying the root slug before minting,
and make the validator repair rather than reject the duplicate — the same precedent as the orphan
slug:

```ts
// teamDocsRepo.ensureDocsRoot — a trashed root is still the root; restore it instead of
// minting a second one that the validator will then refuse.
if (stored !== undefined) {
  const row = await db.notes.get(stored);
  if (row && row.type === 'folder' && row.slug === AI_TEAMS_DOCS_ROOT_SLUG) {
    if (row.deletedAt) await db.notes.update(stored, { deletedAt: undefined });
    return stored;
  }
}
```
and in `validateBackup`, drop `slug` from all but the first `ai-root` note (repair) instead of
pushing an error.

## Warnings

### WR-01: A refused `deleteTeam` leaves the team alive with no coordinator and no way to restart it from the open tab

**File:** `src/workbench/toolwindows/AiOfficeExplorer.tsx:113-128`, `src/services/ai/office/teamRunManager.ts:57-71`, `src/components/ai/office/TeamWorkspace.tsx:604-624`

**Issue:** Round 8 fixed the *vocabulary* of the pre-delete teardown but not its side effect.
`disposeRun` drops the run entry in its `finally` (`teamRunManager.ts:68-70`) before `deleteTeam`
runs. When `deleteTeam` refuses (an unprovable tree — a state the tests deliberately produce,
`teamDocsRepo.test.ts:377-423`), the transaction rolls back and the team survives, but:

- the coordinator is gone and the manager no longer has an entry;
- the workspace tab is still open (`handleDeleteTeam` returns before `closeTab`), so
  `TeamWorkspace` keeps the disposed instance in state;
- every submit then returns `'blocked'` and shows "Nhóm này đã bị xoá hoặc dừng. Mở lại nhóm để
  tiếp tục." (`TeamWorkspace.tsx:619-624`) — for a team that was *not* deleted;
- the only recovery is closing and reopening the tab, which nothing tells the user.

**Fix:** Re-create the run after a refusal, or dispose only once the delete has committed:

```ts
try {
  await deleteTeam(team.id, db);
} catch {
  setActionError(ACTION_ERROR_COPY);
  return;
}
// The delete committed; the team row is gone, so tearing the run down now cannot be wrong.
await disposeRun(db, team.id, 'team-deleted').catch(() => {});
```
(Deleting first is safe: `deleteTeam` is one transaction, and the coordinator's writes after it are
either no-ops or land on deleted parents. If the current order must stay, re-run `getOrCreateRun`
in the catch.)

### WR-02: The orphan-slug repair breaks the documented "re-adding a member reuses its folder" behaviour across a backup round-trip

**File:** `src/services/backup/validateBackup.ts:85-95`, `:602-627`, `src/db/repositories/aiTeamRepo.ts:598-604`

**Issue:** `removeTeamMember` deliberately keeps the member's folder *and its slug*
(`aiTeamRepo.ts:660-663`), and `addTeamMember` re-adopts it through `resolveMemberFolder`
(`:602-604`), proven by `aiTeamRepo.test.ts:1578-1604`. After the row is gone the folder is an
orphan reserved slug, so `stripOrphanReservedSlugs` drops the slug on the next import. The restored
database therefore behaves differently from the one that was exported: re-adding the same agent
mints a fresh `(2)` zone and the earlier documents are stranded. The same applies to the outgoing
lead's folder when `writeLeadRow` deletes the usage-free row (`aiTeamRepo.ts:367-368`).

This is not a rejection (the repair works), but it is a silent behaviour change between local and
restored state, and it is exactly the case the repair's own comment calls "derivable".

**Fix:** Prefer the other half of the round-8 option: clear the slug when the naming row goes, so
the local state and the exported state agree.

```ts
// removeTeamMember / writeLeadRow's delete branch: the folder stays (D-11), the ownership claim
// does not. Clearing it here means an export never carries an orphan and a restore behaves
// exactly like the machine that produced it.
if (row.docsFolderId !== undefined) {
  await db.notes.update(row.docsFolderId, { slug: undefined });
}
```
Keep `stripOrphanReservedSlugs` as the repair for payloads produced by older builds.

### WR-03: Two comments on the delete path state the opposite of what the code does

**File:** `src/db/repositories/teamDocsRepo.ts:298-299`, `src/db/repositories/aiTeamRepo.ts:531-532`

**Issue:**

- `teamDocsRepo.ts:298-299` reads "CR-05: only app-minted folders are touched (see
  `collectOwnedSubtreeIds`), so a folder the owner filed under a team folder is left alone." The
  function `collectOwnedSubtreeIds` does not exist (it is `collectSubtreeIds`), and the behaviour
  described is the one round 8 deliberately removed — `collectSubtreeIds` walks every descendant and
  `teamDocsRepo.test.ts:910-931` asserts the owner's folder *is* trashed.
- `aiTeamRepo.ts:531-532` reads "D-10: deleting a team deletes its whole docs tree … Hard delete, in
  this same transaction." It is a soft delete.

These are the two most safety-critical comments in the phase, and both misdescribe the code a future
author would rely on.

**Fix:** Replace both with the actual rule: the whole subtree is soft-deleted, including folders the
owner filed there, because the two are indistinguishable and the delete is recoverable.

### WR-04: `teamDocsRepo.test.ts` encodes the attachment loss as intended behaviour, and no test covers the restore path

**File:** `tests/db/teamDocsRepo.test.ts:274-299`

**Issue:** The test is titled "deletes the tree attachments along with the notes (CR-02)" and
asserts:

```ts
expect(await db.noteAttachments.count()).toBe(0);
expect(await db.notes.count()).toBe(5); // root + the trashed tree, recoverable
```

Two contradictory claims in one test: the notes are recoverable, the attachments are not. Because
it passes, the suite stays green while CR-02 makes the "recoverable" contract false. There is also
no test for the state the fix is supposed to deliver — soft-delete → restore → the document is
visible and the team's tree is usable again — so CR-01 is invisible to CI.

**Fix:** Split the assertion: on the soft path the attachments must survive
(`expect(await db.noteAttachments.count()).toBe(1)`), and add one restore test:

```ts
await deleteTeamDocsTree(tree.folderId, team.id, db);
const trashed = (await db.notes.toArray()).filter((n) => n.deletedAt);
for (const row of trashed) await restoreNote(row.id, db);
expect((await db.notes.get(doc.id))?.deletedAt).toBeUndefined();
expect((await db.notes.get(memberFolderId))?.deletedAt).toBeUndefined();
// and the document is reachable from its folder again
expect((await getNotesByFolder(memberFolderId, db)).map((n) => n.id)).toContain(doc.id);
```

## Info

### IN-01: `actionError` is never cleared on a successful delete

**File:** `src/workbench/toolwindows/AiOfficeExplorer.tsx:113-128`

A refusal sets `actionError`; a later successful delete leaves the red alert on screen until the
user dismisses it. Add `setActionError(null)` at the top of `handleDeleteTeam`.

### IN-02: `resolveMemberFolder`'s comparator is still not a total order (round-8 IN-02, unresolved)

**File:** `src/db/repositories/teamDocsRepo.ts:214`

`matches.sort((a, b) => (a.id < b.id ? -1 : 1))` returns `1` for equal ids. Unreachable today
(primary keys), but `a.id.localeCompare(b.id)` is the same length and correct.

### IN-03: `deleteTeamDocsTree` still walks the subtree from `teamFolderId`, not `resolved` (round-8 IN-03, unresolved)

**File:** `src/db/repositories/teamDocsRepo.ts:324`

`resolveTeamFolderIncludingDeleted` returns the handle only when it matches, so the two are equal
today; using `resolved` would make the dependency explicit and survive a resolver that normalises.

### IN-04: `isLiveFolder` still has no production caller (round-8 WR-06, unresolved)

**File:** `src/db/repositories/teamDocsRepo.ts:25-32`

Reached only from `tests/db/teamDocsRepo.test.ts`. `ensureDocsRoot` inlines the same check
(`:123`). Make it module-private and use it there, or delete it.

### IN-05: The reserved-namespace predicate exists twice

**File:** `src/services/backup/validateBackup.ts:604`, `src/db/repositories/noteRepo.ts:18-23`

`validateBackup` inlines `note.slug.trim().startsWith('ai-')` while `noteRepo` exports
`RESERVED_SLUG_PREFIX` / `isReservedSlug`. A change to the prefix would silently leave the import
boundary behind. Import `isReservedSlug` (the module has no Dexie-side effects at import time).

---

_Reviewed: 2026-11-15T17:10:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
