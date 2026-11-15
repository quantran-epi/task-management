---
phase: 41-ai-office-team-docs-zones-per-team-docs-folder-tree-and-agen
reviewed: 2026-11-15T07:10:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - src/db/repositories/teamDocsRepo.ts
  - src/db/repositories/aiTeamRepo.ts
  - src/db/repositories/noteRepo.ts
  - src/services/ai/office/teamTools.ts
  - src/services/ai/aiTools.ts
  - src/services/backup/validateBackup.ts
  - tests/db/teamDocsRepo.test.ts
  - tests/services/ai/office/aiTeamRepo.test.ts
  - tests/services/ai/office/teamTools.test.ts
  - tests/services/backup/officeBackup.test.ts
findings:
  critical: 3
  warning: 7
  info: 3
  total: 13
status: issues_found
---

# Phase 41: Code Review Report (Round 4)

**Reviewed:** 2026-11-15T07:10:00Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

Round-3 fixes verified: CR-05 (`resolveTeamFolder` as the single validator) is wired into
`ensureTeamDocsReady`, `deleteTeamDocsTree`, `updateTeam`'s rename, `addTeamMember` and
`writeLeadRow`; CR-06 (parent-shape rule removed from the delete path) holds and its test passes;
CR-07's slug identity is stamped by `createMemberFolder` and matched by
`findMemberFolderForAgent`; CR-08's `detachNoteReferences` clears both team handles and every
caller names the new stores; WR-02's `write_doc` liveness check refuses a dead folder and does not
break the rename case (identity is the id, not the title); IN-02/IN-03 hold.

The four targeted tests pass (200/200) and `tsc --noEmit` is clean. Two probe tests written for
this review confirmed three NEW defects, all reachable from a backup that `validateBackup`
accepts:

1. `resolveTeamFolder`'s "ownership proof" is only *live folder + not the root + not claimed by
   another team*. It never proves the folder is a **team** folder, so `deleteTeam` hard-deletes an
   arbitrary user folder and every document inside it.
2. `ensureTeamDocsReady`'s direct-valid branch ignores the `claimed` set, so two member rows that
   share one folder id both keep it and two agents write into one zone.
3. `writeLeadRow`'s new-row path mints the lead folder without the slug, so the CR-07 invariant is
   not universal.

## Critical Issues

### CR-01: `resolveTeamFolder` accepts any live folder — `deleteTeam` destroys arbitrary user data

**File:** `src/db/repositories/teamDocsRepo.ts:62-80` (and its consumers at
`src/db/repositories/aiTeamRepo.ts:312`, `:346`, `:529`, `:584`)

**Issue:** The resolver's whole proof is:

```ts
if (!(await isLiveFolder(docsFolderId, db))) return undefined;
// not the shared root ...
const claimants = (await db.aiTeams.toArray()).filter((t) => t.docsFolderId === docsFolderId);
return claimants.some((team) => team.id !== teamId) ? undefined : docsFolderId;
```

A folder the owner created in Docs — `type: 'folder'`, live, not the root, claimed by no other
team — passes. Every consumer then treats it as this team's zone:

- `deleteTeam` → `deleteTeamDocsTree` → `collectSubtreeIds` + `detachNoteReferences` +
  `db.notes.bulkDelete(ids)` — the user's folder **and every document under it are hard-deleted**.
- `updateTeam`'s rename writes the team name onto it (`aiTeamRepo.ts:314`).
- `ensureTeamDocsReady` mints the team's member folders *inside* it, so members then write into a
  user folder.

Reachable: `validateBackup` (Stage 5, `validateBackup.ts:563`) only checks
`noteIds.has(team.docsFolderId)` — existence, not kind, not ownership. A hand-edited or corrupted
backup therefore imports cleanly and the next `deleteTeam` wipes unrelated user data. The existing
CR-01 test (`tests/db/teamDocsRepo.test.ts:386`) covers a user **document**, not a user **folder**,
which is exactly the gap.

Verified by probe: a folder `My private folder` holding `secret doc`, with a team row whose
`docsFolderId` names it, is fully deleted by `deleteTeam`.

**Fix:** Give the team folder its own identity marker and require it — the same rule CR-07 applied
to member folders. Parent shape cannot be the proof (CR-06), and absence of a rival claim cannot
be either.

```ts
// teamDocsRepo.ts
export function teamFolderSlug(teamId: string): string {
  return `ai-team:${teamId}`;
}

// createTeamDocsTree
const teamFolder = await createNote(
  { title: teamName, body: '', type: 'folder', parentId: rootId, slug: teamFolderSlug(teamId) },
  db
);

// resolveTeamFolder — replace the claim scan
const row = await db.notes.get(docsFolderId);
if (!row || row.deletedAt || row.type !== 'folder') return undefined;
if (row.slug === teamFolderSlug(teamId)) return docsFolderId;
// Pre-41 trees have no slug: fall back to the parent-shape rule, which a user folder
// cannot satisfy unless the owner deliberately parented it under the AI Teams root.
const rootSetting = await db.settings.get(AI_TEAMS_DOCS_ROOT_SETTING_KEY);
const rootId = typeof rootSetting?.value === 'string' ? rootSetting.value : undefined;
return rootId !== undefined && row.parentId === rootId ? docsFolderId : undefined;
```

Also add the missing test: `deleteTeamDocsTree` refuses a live **folder** the owner created.

---

### CR-02: `ensureTeamDocsReady` ignores `claimed` on the direct-valid path — two members share one write zone

**File:** `src/db/repositories/teamDocsRepo.ts:318-344`

**Issue:** `claimed` is built from every member row's `docsFolderId`, but the branch that accepts a
row's folder outright never consults it:

```ts
if (await isChildFolderOf(row.docsFolderId, teamFolderId, db)) {
  memberFolderIds.set(row.agentId, row.docsFolderId as string);
  continue;                       // <-- `claimed` not checked
}
...
const folderId = adopted !== undefined && !claimed.has(adopted) ? adopted : await createMemberFolder(...);
```

With two member rows naming the same child folder (a restored backup where both rows carry one id —
`validateBackup` does not reject duplicate `docsFolderId` values), both members keep that folder.
`toolContext` then hands the same `folderId` to both agents, and `write_doc`'s guard
`existing.parentId !== folderId` passes for both — so member B can overwrite member A's document.
This breaks success criterion 3 ("a member's write outside its own subfolder is refused by code").

Verified by probe: after the repair run both agents report the same folder id, and B's `update`
overwrote A's document body.

**Fix:** Apply the claim rule to *every* branch, and prefer the slug identity over the raw handle:

```ts
for (const row of rows) {
  const owned = await findMemberFolderForAgent(teamFolderId, teamId, row.agentId, db);
  const handle =
    (await isChildFolderOf(row.docsFolderId, teamFolderId, db)) ? (row.docsFolderId as string) : undefined;
  const candidate = owned ?? handle;
  const folderId =
    candidate !== undefined && !claimed.has(candidate)
      ? candidate
      : await createMemberFolder(teamFolderId, nameFor(row.agentId, agent?.name), db, {
          teamId,
          agentId: row.agentId,
        });
  claimed.add(folderId);
  ...
}
```

Add a test that two rows sharing one folder id end up with two distinct folders.

---

### CR-03: `writeLeadRow`'s new-row path mints the lead folder without the slug

**File:** `src/db/repositories/aiTeamRepo.ts:386`

**Issue:**

```ts
// The row did not exist when the backfill ran, so `backfillIds` cannot name it.
const folderId = await createMemberFolder(teamFolderId, leadName, db);
```

The `identity` argument is omitted, so this folder carries no `slug`. Every other mint site
(`createTeamDocsTree:198`, `ensureTeamDocsReady:337`, `addTeamMember:615`, and the `incoming`
branch at `aiTeamRepo.ts:380`) passes it. Consequence: `findMemberFolderForAgent` cannot find this
lead's folder, so any later repair (row's `docsFolderId` cleared by CR-08, row re-created after a
demote/delete cycle) mints a `Trưởng (2)` sibling and strands every document the lead wrote
earlier — the exact failure CR-07 was introduced to prevent.

Verified by probe: `createTeam({name})` then `assignLeader(team.id, lead.id)` produces a lead
folder whose `slug` is `undefined` while `memberFolderSlug(teamId, leadId)` is expected.

**Fix:**

```ts
const folderId = await createMemberFolder(teamFolderId, leadName, db, {
  teamId,
  agentId: leadId,
});
```

Add an assertion to the `assignLeader` test: the minted folder's `slug` equals
`memberFolderSlug(teamId, leadId)`.

---

## Warnings

### WR-01: Team folders carry no identity marker at all

**File:** `src/db/repositories/teamDocsRepo.ts:182-205`

**Issue:** `createTeamDocsTree` creates the team folder with title + parent only. There is no
`ai-team:<teamId>` slug, so nothing on the row says which team owns it. This is the root cause of
CR-01: the resolver has to infer ownership from a global scan and from the absence of a rival
claim, both of which are weak.
**Fix:** Stamp `slug: teamFolderSlug(teamId)` (see CR-01) and make the resolver require it with a
parent-shape fallback for pre-41 trees.

### WR-02: `NOTE_REFERENCE_STORES` is exported but never used

**File:** `src/db/repositories/noteRepo.ts:210-221`

**Issue:** The comment claims "every caller must name all of them", but the constant has zero
references in `src/` or `tests/`. `deleteNote`, `bulkPermanentDeleteNotes` and `deleteTeam` each
hand-maintain a literal store list, so the "one list" guarantee is documentation only — the next
store added to `detachNoteReferences` will be forgotten by at least one caller and surface as a
`SubTransactionError` at runtime.
**Fix:** Either derive the transaction lists from the constant, or delete it. A cheap enforcement:

```ts
// noteRepo.ts
export const NOTE_REFERENCE_STORES = [...] as const;
// deleteNote / bulkPermanentDeleteNotes
db.transaction('rw', NOTE_REFERENCE_STORES.map((name) => db.table(name)), ...)
```

### WR-03: No test pins the `slug` backup round-trip

**File:** `tests/services/backup/officeBackup.test.ts`

**Issue:** `BackupNoteRecordSchema` does carry `slug` (`backupSchemas.ts:143`) and both export and
restore copy whole note rows, so the value survives — but nothing asserts it. CR-07's member-folder
identity now depends on a field that no backup test covers; a future note projection (like the one
already applied to `noteAttachments` and `chatTabs`) would silently drop it and every restored team
would re-mint its member folders.
**Fix:** Add a note fixture with `slug: 'ai-member:<teamId>:<agentId>'` to the round-trip test and
assert it survives.

### WR-04: Moving a member folder in Docs strands its documents

**File:** `src/db/repositories/teamDocsRepo.ts:326-343`

**Issue:** The repair path only accepts a member folder that is a *direct child* of the team folder,
and `findMemberFolderForAgent` only scans that same child list. If the owner drags a member folder
to another parent (`NotesView.tsx:846`/`:883` allow arbitrary reparenting), the next backfill mints
a fresh folder and the old one — with every document inside it — is left orphaned outside the team
zone.
**Fix:** Look up the slug across the whole notes table (`db.notes.where('slug').equals(slug)` —
`slug` is not indexed, so a `toArray()` filter is the honest form) and re-parent the found folder
back under the team folder instead of minting a sibling.

### WR-05: The lead's approved `delete_note` can orphan the whole tree

**File:** `src/db/repositories/aiTeamRepo.ts:472-533` (interaction with `noteRepo.deleteNote`)

**Issue:** The lead keeps `delete_note` (mutation, parked on the approval card). Deleting the team
folder that way removes only that one row: the member folders and documents keep a dangling
`parentId`, `DocFolderTree` re-surfaces them as roots, and `detachNoteReferences` clears the team
handle so the next backfill mints a duplicate tree. The owner ends up with two zones and documents
in neither.
**Fix:** Refuse a permanent delete whose id is a team folder or a member folder (the resolver plus
`aiTeamMembers` lookup already answers this), or route the delete through `deleteTeamDocsTree`.

### WR-06: Two teams claiming one handle make both refuse, leaking the real tree

**File:** `src/db/repositories/teamDocsRepo.ts:75-79`

**Issue:** When two `aiTeams` rows name the same folder, `resolveTeamFolder` refuses for *both*
(`claimants.some((team) => team.id !== teamId)`). Both rebuild, and the original tree is never
deleted by either — `deleteTeam` on the legitimate owner refuses too. The claim check converts a
corrupt handle into a permanent leak.
**Fix:** With the slug identity from CR-01 the claim scan becomes unnecessary; a row whose slug
matches owns the folder regardless of what another row claims.

### WR-07: `deleteTeamDocsTree`'s optional owner id invites a silent no-op

**File:** `src/db/repositories/teamDocsRepo.ts:241-259`

**Issue:** `ownerTeamId?: string` plus `else { return; }` means the function's default behaviour is
"delete nothing, report success". All three call sites pass an owner, so the optional form is dead
API surface whose only effect is to make a future caller's mistake invisible.
**Fix:** Make the parameter required: `ownerTeamId: string`.

---

## Info

### IN-01: `isLiveFolder` is exported only for tests

**File:** `src/db/repositories/teamDocsRepo.ts:25-32`
**Issue:** No production caller outside `teamDocsRepo.ts` uses it after CR-05; only
`tests/db/teamDocsRepo.test.ts` imports it.
**Fix:** Keep it internal, or keep the export and note it as test-only.

### IN-02: Duplicated refusal strings in `writeDoc`

**File:** `src/services/ai/office/teamTools.ts:792-808`
**Issue:** The message `'Thư mục tài liệu của bạn chưa sẵn sàng.'` appears twice (absent folder,
dead folder) and `'Tài liệu này không nằm trong thư mục của bạn.'` twice (`update` guard, vanished
row). Two copies drift.
**Fix:** Hoist both to module constants next to `PIN_UNRESOLVED_MESSAGE`.

### IN-03: `deleteTeamDocsTree`'s `else` branch comment repeats the ticket id

**File:** `src/db/repositories/teamDocsRepo.ts:257`
**Issue:** `// IN-02: no owner means no ownership proof` — the id no longer matches a live finding
and the branch disappears under WR-07.
**Fix:** Drop the comment with the branch.

---

_Reviewed: 2026-11-15T07:10:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
