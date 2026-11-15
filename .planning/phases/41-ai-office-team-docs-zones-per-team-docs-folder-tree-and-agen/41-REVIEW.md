---
phase: 41-ai-office-team-docs-zones-per-team-docs-folder-tree-and-agen
reviewed: 2026-11-15T14:45:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - src/db/repositories/teamDocsRepo.ts
  - src/db/repositories/aiTeamRepo.ts
  - src/db/repositories/noteRepo.ts
  - src/services/ai/office/teamTools.ts
  - src/services/backup/validateBackup.ts
  - tests/db/teamDocsRepo.test.ts
  - tests/services/ai/office/aiTeamRepo.test.ts
  - tests/services/backup/officeBackup.test.ts
findings:
  critical: 4
  warning: 5
  info: 2
  total: 11
status: issues_found
---

# Phase 41: Code Review Report (Round 5)

**Reviewed:** 2026-11-15T14:45:00Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Round-4 fixes that hold: CR-03 (`writeLeadRow` passes the identity arg to `createMemberFolder`),
WR-01 (team folder stamped with `ai-team:<teamId>`), WR-02 (`NOTE_REFERENCE_STORE_NAMES` +
`noteReferenceStores` derive every caller's transaction scope from one list), WR-03 (member slug
round-trips through backup), WR-07 (`deleteTeamDocsTree` requires the owner id).

Round-4 fixes that do **not** hold, plus defects the fix introduced:

- CR-01's slug proof is bypassed by the pre-41 fallback for any folder parented to the `AI Teams`
  root — including another team's member folder (its slug is `ai-member:`, which the guard does
  not refuse) and a user folder the owner filed under the root. `deleteTeamDocsTree` hard-deletes
  both, with every document inside. Reproduced.
- CR-02's `claimed` set starts empty, so on a slugless (pre-41) tree the first row still wins a
  folder a sibling row also names — the exact "one member overwrites another's documents" harm
  the fix claims to close. Reproduced.
- WR-04's `owned ?? handle` ordering plus a non-unique slug lets a member's zone resolve to a
  folder **outside** the team tree, with no re-parent (the re-parent is skipped whenever the row
  handle is valid). `write_doc` then writes there and `deleteTeam` leaks it. Reproduced.
- The new re-parent write can create a parent cycle (team folder moved inside a member folder via
  two ordinary Docs moves), which makes `DocFolderTree` recurse until `RangeError`. Reproduced.

Verified clean: `slug` is optional in `BackupNoteRecordSchema`, so a pre-41 backup restores without
one; `restoreBackupPayload` bulk-adds the validated rows verbatim, so a present slug survives.
All 10 names in `NOTE_REFERENCE_STORE_NAMES` exist in the current Dexie schema, so `db.table(name)`
resolves for real Dexie and for the one mock that reaches `deleteNote`. The re-parent write adds no
transaction nesting (`notes` is already in `ensureTeamDocsReady`'s store list). Scoped tests pass
(137 tests across the three phase-41 files; `tsc --noEmit` clean).

## Critical Issues

### CR-01: Pre-41 fallback accepts another team's member folder and any user folder under the AI Teams root

**File:** `src/db/repositories/teamDocsRepo.ts:82-89`

**Issue:** The slug guard refuses only slugs that start with `ai-team:`:

```ts
if (row.slug === teamFolderSlug(teamId)) return docsFolderId;
if (row.slug !== undefined && row.slug.startsWith('ai-team:')) return undefined;
return rootId !== undefined && row.parentId === rootId ? docsFolderId : undefined;
```

A member folder carries `ai-member:<teamId>:<agentId>` (`memberFolderSlug`, line 103), so it falls
through to the root-parent rule. The owner can move a member folder to the `AI Teams` root in Docs
(an ordinary move — the root is a normal folder). After that, `resolveTeamFolder(otherTeamId, thatFolder)`
returns the folder, and `deleteTeamDocsTree` hard-deletes it and every document inside.

Reproduced against the real Dexie schema (`fake-indexeddb`):

```
resolveTeamFolder(B, A-member-folder) = d9007804-…        (expected undefined)
A member folder survived = false
A document survived      = false

resolveTeamFolder(C, user-folder-under-root) = 43217a84-… (expected undefined)
user folder survived = false
user doc survived    = false
```

The second case is the residual risk the function's own comment admits ("unless the owner
deliberately parented it under the AI Teams root"), but it is still a hard delete of user data
driven by an untrusted `docsFolderId` restored from a backup. The first case is not admitted at all
and is a cross-team delete.

**Fix:** Refuse the whole `ai-` slug namespace in the fallback, and require positive proof that a
slugless folder is a *team* folder rather than a member folder or a user folder:

```ts
if (row.slug === teamFolderSlug(teamId)) return docsFolderId;
// Any AI-owned marker that is not THIS team's is a rival claim: ai-team:<other> or ai-member:*.
if (row.slug !== undefined && row.slug.startsWith('ai-')) return undefined;

// Pre-41 fallback: root parent AND no member folder of any team underneath AND no other team
// naming it. Stamp the slug on success so this branch runs at most once per team.
if (rootId === undefined || row.parentId !== rootId) return undefined;
const children = await db.notes.where('parentId').equals(docsFolderId).toArray();
if (children.some((c) => c.slug?.startsWith('ai-member:'))) return undefined;
const claimants = (await db.aiTeams.toArray()).filter(
  (t) => t.docsFolderId === docsFolderId && t.id !== teamId
);
if (claimants.length > 0) return undefined;
await db.notes.update(docsFolderId, { slug: teamFolderSlug(teamId) }); // one-time upgrade
return docsFolderId;
```

Note the last line also fixes WR-05 below.

### CR-02: `claimed` starts empty, so CR-02's guarantee does not hold on a slugless tree

**File:** `src/db/repositories/teamDocsRepo.ts:338-367`

**Issue:** The round-4 change replaced a pre-populated `claimed` set (every row's `docsFolderId`)
with an empty one filled as the loop runs. On a pre-41 tree member folders carry no slug, so
`owned` is `undefined` and `candidate` is the row handle. If two rows name one folder (a restored
backup can carry this — `validateBackup` only checks that each id resolves to a note, never that
they are distinct), the **first** row claims it and the second mints a new folder. The second
member's existing documents stay in the first member's zone.

Reproduced (rows ordered so the victim is processed second):

```
order: [ 'A', 'B' ]
A folder = 0879e274-… (B original = 0879e274-…)
B folder = d08532bc-…
A TOOK B folder = true
B doc parent = 0879e274-… -> now in A zone = true
```

The comment at line 335-337 states the opposite ("accepting both would let one member overwrite the
other's documents"), and the new test at `tests/db/teamDocsRepo.test.ts:609` only asserts the two
folders differ — it never asserts that B keeps its own documents, which is why this passes.

**Fix:** Two passes: assign slug-owned folders first (unique by construction), then handles that no
earlier row claimed.

```ts
const claimed = new Set<string>();
const pending: typeof rows = [];
for (const row of rows) {
  const owned = await findMemberFolderForAgent(teamId, row.agentId, db);
  if (owned !== undefined && !claimed.has(owned)) {
    claimed.add(owned);
    /* assign owned … */
  } else {
    pending.push(row);
  }
}
for (const row of pending) { /* handle-or-mint, consulting `claimed` */ }
```

### CR-03: `owned` outranks a valid row handle without a re-parent, so a member's zone can sit outside the team tree

**File:** `src/db/repositories/teamDocsRepo.ts:343-358`

**Issue:**

```ts
const owned = await findMemberFolderForAgent(teamId, row.agentId, db);
const handle = (await isChildFolderOf(row.docsFolderId, teamFolderId, db))
  ? (row.docsFolderId as string)
  : undefined;
const candidate = owned ?? handle;
…
if (candidate !== undefined && !claimed.has(candidate)) {
  folderId = candidate;
  if (handle === undefined) {           // ← re-parent only when the handle is dead
    await db.notes.update(candidate, { parentId: teamFolderId, … });
  }
}
```

When the agent has **two** folders carrying the same slug — which the rebuild branch creates,
because `createTeamDocsTree` mints a fresh tree without checking for existing slug folders — the
scan returns an arbitrary one (`db.notes.toArray()` order, i.e. random UUID order). If it returns
the stale folder, `handle` is still valid, so the re-parent is skipped and the member is mapped to a
folder outside the current team tree.

Reproduced:

```
run2: old = deefd7ea-…  new = e92cc469-…          (rebuild mints a duplicate member slug)
run3 chosen = deefd7ea-… (the OLD folder)
run3 chosen parent = 169ea852-…  teamFolder = 927b6bf1-…   ← outside the tree
folders with member slug = 2
```

and, for the leak:

```
chosen folder parent = undefined (teamFolder = 9a62ee48-…)
after deleteTeamDocsTree: slugFolder exists = true, doc exists = true
```

So success criterion 6 ("deleting a team removes its folder tree") is violated: the member's
documents survive the team delete as an orphan folder. Reachable when the team folder row alone is
removed (the lead's approved `delete_note`, or a restored payload whose team row lost its handle
while the folders survived) — the member folders are then left behind with their slugs and the next
backfill mints a second tree.

**Fix:** Prefer a valid handle, use `owned` only when the handle is absent or dead, and always
re-parent `owned` when it is the one chosen. Also make the rebuild path adopt existing slug folders
instead of minting duplicates:

```ts
const candidate = handle ?? owned;
if (candidate !== undefined && !claimed.has(candidate)) {
  folderId = candidate;
  if (candidate !== handle) {
    await db.notes.update(candidate, { parentId: teamFolderId, updatedAt: … });
  }
}
```

and in the rebuild branch, call `findMemberFolderForAgent` per row before `createTeamDocsTree` mints
a member folder (or have `createMemberFolder` adopt an existing slug match).

### CR-04: The re-parent branch can create a parent cycle, which makes the Docs tree recurse until `RangeError`

**File:** `src/db/repositories/teamDocsRepo.ts:353-358`

**Issue:** The re-parent writes `parentId: teamFolderId` with no check that `teamFolderId` is not a
descendant of `candidate`. Two ordinary Docs moves produce that state: move the member folder to the
top level, then move the team folder into the member folder (the move modal only excludes the moving
folder and its *current* descendants, so the second move is allowed). The next backfill then closes
the loop.

Reproduced:

```
before backfill: team.parent==member? true  member.parent==team? false
after backfill:  team.parent = 6bac… (member)   member.parent = e2c3… (team)
CYCLE CREATED BY BACKFILL = true
```

`DocFolderTree`'s `addDescendants` (`src/components/notes/DocFolderTree.tsx:171-177`) and
`NotesView`/`DocsExplorer`'s `getAllDescendantFolderIds` recurse without a visited set, so selecting
the folder throws `RangeError: Maximum call stack size exceeded` (verified with the same algorithm).
`collectSubtreeIds` is cycle-safe, so the delete path is unaffected.

**Fix:** Refuse the re-parent when the team folder is inside the candidate's subtree:

```ts
async function isDescendantOf(id: string, ancestorId: string, db: TaskPlannerDatabase) {
  let cursor: string | undefined = id;
  const seen = new Set<string>();
  while (cursor !== undefined && !seen.has(cursor)) {
    if (cursor === ancestorId) return true;
    seen.add(cursor);
    cursor = (await db.notes.get(cursor))?.parentId;
  }
  return false;
}
// before re-parenting:
if (await isDescendantOf(teamFolderId, candidate, db)) { /* mint a fresh folder instead */ }
```

## Warnings

### WR-05: Pre-41 trees are never upgraded to slug identity, so the weak fallback is permanent

**File:** `src/db/repositories/teamDocsRepo.ts:330-374`

**Issue:** The `teamFolderId !== undefined` branch never stamps `teamFolderSlug(teamId)` on the
folder it accepted. A pre-41 tree therefore stays slugless for its whole life — round 4 added the
marker but only at creation (`createTeamDocsTree`, line 213). Every later `resolveTeamFolder` call
falls back to the root-parent rule, so CR-01's hole stays open for exactly the trees the fallback
was written for.

**Fix:** Stamp the slug on the first successful fallback (see the CR-01 snippet). Inside
`ensureTeamDocsReady`'s transaction this is a one-line `db.notes.update`.

### WR-06: `slug` is user-writable, so the AI-owned namespace is not actually reserved

**File:** `src/services/ai/aiTools.ts:3906` (passes `args.slug` to `updateNote`), `src/validation/schemas.ts:436,448`

**Issue:** `NoteInputSchema.slug` / `NoteUpdateSchema.slug` accept any string up to 120 chars, and
the `update_note` DB tool forwards `args.slug` verbatim. A lead turn can therefore propose setting
`slug = 'ai-team:<teamId>'` on a user folder; once the owner approves the card, that folder is
"this team's folder" for `resolveTeamFolder`, `updateTeam`'s rename and `deleteTeamDocsTree`. The
slug namespace is the whole ownership proof, and nothing enforces it.

**Fix:** Reject the reserved prefix at the schema boundary:
`slug: z.string().trim().max(120).refine((s) => !s.startsWith('ai-'), 'Slug không hợp lệ')` in both
`NoteInputSchema` and `NoteUpdateSchema`, plus a strip in `updateNote` for callers that bypass the
schema.

### WR-07: `noteReferenceStores` casts away the type contract it exists to protect

**File:** `src/db/repositories/noteRepo.ts:228-230, 236, 411`

**Issue:** `noteReferenceStores` returns `unknown[]` and both callers write
`db.transaction('rw', noteReferenceStores(db) as never, …)`. `as never` is assignable to every
parameter, so a typo in `NOTE_REFERENCE_STORE_NAMES` compiles and only fails at runtime with
`NotFoundError` (real Dexie) — the exact failure mode WR-02 set out to prevent. The mock in
`tests/ai/aiTools.test.ts:1381` papers over it with `?? { name }`, which would hide the same typo.

**Fix:** Type the helper against Dexie and drop the casts:

```ts
export function noteReferenceStores(db: TaskPlannerDatabase): Table[] {
  return NOTE_REFERENCE_STORE_NAMES.map((name) => db.table(name));
}
```

and add one assertion test that every name resolves on a real `TaskPlannerDatabase`.

### WR-08: Round-4 tests do not cover the cases the fixes claim

**File:** `tests/db/teamDocsRepo.test.ts:591-612`, `tests/services/backup/officeBackup.test.ts:231-249`

**Issue:**
- The CR-01 test creates the user folder at the top level (`createNote({ title: 'Thư mục riêng', … })`,
  no `parentId`), so it never exercises the root-parent fallback the resolver's own comment names
  as the residual risk. It passes while CR-01 above is live.
- The CR-02 test asserts only `a !== b`; it never asserts that each member keeps the folder holding
  its earlier documents, which is the property CR-02 exists to protect (and which fails, see CR-02).
- The backup fixture stamps a member-folder slug but not the team folder's `ai-team:` slug, so the
  team-folder identity marker has no round-trip test.

**Fix:** Add a user folder parented to the `AI Teams` root to the CR-01 test; assert document
ownership in the CR-02 test; add `slug: 'ai-team:<TEAM_ID>'` to the `TEAM_DOCS_FOLDER_ID` fixture
and assert it after restore.

### WR-09: Duplicate slugs make `findMemberFolderForAgent` nondeterministic

**File:** `src/db/repositories/teamDocsRepo.ts:181-192`

**Issue:** The scan returns the first table-order match, and `slug` is neither indexed nor unique.
Once a rebuild has minted a second folder for the same agent (CR-03), which folder a member writes
into is decided by UUID ordering — the same data can resolve differently between runs.

**Fix:** Make the slug unique by construction: on mint, adopt an existing slug match instead of
creating a second one (see CR-03's fix), and prefer a match that is a direct child of the live team
folder when several exist.

## Info

### IN-01: `collectSubtreeIds` is cycle-safe but its UI counterparts are not

**File:** `src/db/repositories/teamDocsRepo.ts:239-255`

The `seen` set makes the delete walk safe. The same walk in `DocFolderTree.tsx:171` and
`NotesView.tsx:646`/`DocsExplorer.tsx:175` has no guard, which is what turns CR-04's cycle into a
crash. Adding a visited set there is cheap defence in depth.

### IN-02: `createMemberFolder`'s collision loop is correct but subtle

**File:** `src/db/repositories/teamDocsRepo.ts:150-153`

The loop re-tests `taken.has(title)` against the previous iteration's title, so it walks
`(2) … (99)` correctly and falls back to a random suffix. Worth one comment line stating the
invariant, since the off-by-one shape invites a "fix" that breaks it.

---

_Reviewed: 2026-11-15T14:45:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
