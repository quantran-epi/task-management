---
phase: 41-ai-office-team-docs-zones-per-team-docs-folder-tree-and-agen
reviewed: 2026-11-15T00:00:00Z
depth: standard
files_reviewed: 16
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
  - tests/db/schemaV26Migration.test.ts
  - tests/db/teamDocsRepo.test.ts
  - tests/services/ai/office/aiTeamRepo.test.ts
  - tests/services/ai/office/teamTools.test.ts
  - tests/services/ai/office/teamPrompts.test.ts
  - tests/services/ai/office/teamRunCoordinator.test.ts
  - tests/services/backup/officeBackup.test.ts
findings:
  critical: 3
  warning: 9
  info: 6
  total: 18
status: issues_found
---

# Phase 41: Code Review Report

**Reviewed:** 2026-11-15
**Depth:** standard
**Files Reviewed:** 16
**Status:** issues_found

## Summary

The folder-scoping design is sound: `parentId` comes only from `ctx.folderId`, `type` is a literal, the role guard runs before any branch, `write_doc` is deliberately absent from `MUTATION_TOOLS`, and the payload asymmetry is pinned by tests on both sides. The transaction boundaries are correct — every store the nested backfill touches is named by each caller, so rollback really does cover the folders.

Three defects break stated success criteria. `write_doc` `update` erases the document body whenever the model omits `body` (criterion 2 is a write path that must not lose data). `deleteTeamDocsTree` hard-deletes note rows directly instead of going through `deleteNote`, leaving orphan `noteAttachments` rows that make the app's own next export fail `validateBackup` (criterion 6). And the delete is hard-coded to two levels below the team folder while the Docs UI lets the owner create subfolders inside a member folder, so deeper descendants survive as orphans with a dangling `parentId` (criterion 6 again).

Beyond those, the per-member liveness check the backfill claims to perform does not exist — only the team folder is checked — so a hand-deleted member folder silently produces documents under a dead parent.

## Critical Issues

### CR-01: `write_doc` update wipes the document body when `body` is omitted

**File:** `src/services/ai/office/teamTools.ts:833-837`
**Issue:** `update` defaults a missing `body` to the empty string and always passes it to `updateNote`:

```ts
const body = typeof args.body === 'string' ? args.body : '';
const updated = await updateNote(noteId, { ...(title ? { title } : {}), body }, ctx.db);
```

The tool schema declares only `action` as required, and the description never says `body` is mandatory for `update`. `NoteUpdateSchema.body` is optional, so `updateNote` takes the `validated.body !== undefined` branch and writes `body: ''` over the stored content. A model that renames a document (`{action:'update', noteId, title:'Bản sửa'}`) destroys everything the member wrote in a previous turn. This is unrecoverable data loss in the one write path the phase exists to add, and no test covers `update` without `body` (the update test at `teamTools.test.ts:1375` always sends both).

**Fix:**
```ts
if (action === 'update') {
  const noteId = typeof args.noteId === 'string' ? args.noteId : '';
  if (!noteId) return JSON.stringify(refuse('INVALID_ARGUMENT', 'Thiếu id tài liệu cần sửa.'));
  const existing = await ctx.db.notes.get(noteId);
  if (!existing || existing.deletedAt || existing.parentId !== folderId) {
    return JSON.stringify(refuse('DOC_NOT_IN_YOUR_FOLDER', '...'));
  }
  const title = typeof args.title === 'string' ? args.title.trim() : '';
  // Never default to '': an omitted body means "leave the content alone", not "erase it".
  const body = typeof args.body === 'string' ? args.body : undefined;
  if (title === '' && body === undefined) {
    return JSON.stringify(refuse('INVALID_ARGUMENT', 'Cần tiêu đề hoặc nội dung mới.'));
  }
  const updated = await updateNote(
    noteId,
    { ...(title ? { title } : {}), ...(body !== undefined ? { body } : {}) },
    ctx.db
  );
  return JSON.stringify({ noteId, title: updated?.title ?? '' });
}
```

### CR-02: `deleteTeamDocsTree` orphans `noteAttachments`, so the app's own export becomes unrestorable

**File:** `src/db/repositories/teamDocsRepo.ts:120-133`
**Issue:** The tree is deleted with raw table calls:

```ts
await db.notes.where('parentId').anyOf([teamFolderId, ...childIds]).delete();
if (childIds.length > 0) await db.notes.bulkDelete(childIds);
await db.notes.delete(teamFolderId);
```

`deleteNote` / `bulkPermanentDeleteNotes` (`noteRepo.ts:132-143`, `309-321`) both delete the notes' `noteAttachments` rows first, and both are wrapped in a transaction naming `db.noteAttachments`. This path bypasses them, so any image the owner attached to a document inside a team folder survives as an attachment whose `noteId` no longer resolves. `validateBackup.ts:368-379` rejects exactly that:

```
NoteAttachment references noteId "<id>" not found in notes
```

The export path (`exportBackup.ts:266`) sends every attachment, so the app's own next export fails its own validator and the user cannot restore their own backup — the same failure class the codebase already fixed twice (CR-03 team thread, WR-07 team log). `deleteTeam`'s transaction (`aiTeamRepo.ts:453-468`) does not name `db.noteAttachments`, so the fix needs both files.

**Fix:**
```ts
export async function deleteTeamDocsTree(
  teamFolderId: string | undefined,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  if (teamFolderId === undefined) return;

  const children = await db.notes.where('parentId').equals(teamFolderId).toArray();
  const childIds = children.map((child) => child.id);
  const doomed = await db.notes.where('parentId').anyOf([teamFolderId, ...childIds]).toArray();
  const ids = [...new Set([...doomed.map((n) => n.id), ...childIds, teamFolderId])];

  // Same convention as deleteNote: attachments die with their note, or the next export
  // fails `NoteAttachment references noteId ... not found in notes`.
  const attachments = await db.noteAttachments.where('noteId').anyOf(ids).toArray();
  if (attachments.length > 0) {
    await db.noteAttachments.bulkDelete(attachments.map((a) => a.id));
  }
  await db.notes.bulkDelete(ids);
}
```
and add `db.noteAttachments` to the store list in `deleteTeam` (`aiTeamRepo.ts:453-468`).

### CR-03: `deleteTeamDocsTree` stops two levels down; deeper descendants survive as orphans

**File:** `src/db/repositories/teamDocsRepo.ts:126-132`
**Issue:** The comment justifies the two-level assumption with "an agent cannot create a folder (D-04), so the tree is never deeper than three levels". That is false: the *owner* can create subfolders inside a member folder from the Docs UI — `DocFolderTree.tsx:332-345` (`handleOpenCreateSubfolder` → `onCreateFolder(name, parentFolder.id)`) wired to `DocsExplorer.tsx:140-159`. That makes the tree four or more levels deep (`AI Teams / <team> / <member> / <sub> / <doc>`).

The delete removes notes whose parent is the team folder or a member folder. A `<sub>` folder is removed (its parent is a member folder), but everything under `<sub>` is not, so those notes keep a `parentId` pointing at a deleted row. `DocFolderTree` treats a folder whose parent is missing as a root (`DocFolderTree.tsx:258-264`), so the documents reappear at the top level, detached from any team. Success criterion 6 ("Deleting a team removes its folder tree") is not met, and the rows are unreachable through the team surface.

**Fix:** walk the subtree instead of assuming a depth:
```ts
async function collectSubtree(rootId: string, db: TaskPlannerDatabase): Promise<string[]> {
  const seen = new Set<string>([rootId]);
  let frontier = [rootId];
  while (frontier.length > 0) {
    const children = await db.notes.where('parentId').anyOf(frontier).toArray();
    frontier = [];
    for (const child of children) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      frontier.push(child.id);
    }
  }
  return [...seen];
}
```
Then delete `collectSubtree(teamFolderId, db)` (with the CR-02 attachment cleanup). The `seen` set also makes the walk cycle-safe.

## Warnings

### WR-01: The backfill's liveness check covers the team folder only, never a member folder

**File:** `src/db/repositories/teamDocsRepo.ts:160-166`
**Issue:** `ensureTeamDocsReady` returns early as soon as `team.docsFolderId` is live, and copies each member's stored `docsFolderId` into the map without checking it:

```ts
if (team.docsFolderId !== undefined && (await isLiveFolder(team.docsFolderId, db))) {
  const memberFolderIds = new Map<string, string>();
  for (const row of rows) {
    if (row.docsFolderId !== undefined) memberFolderIds.set(row.agentId, row.docsFolderId);
  }
  return { team, memberFolderIds };
}
```

Two consequences, both reachable by the owner using the Docs UI:
1. The owner deletes one member folder by hand (the team folder survives). That member's `docsFolderId` is dead but is handed to `toolContext`, so `write_doc` `create` calls `createNote({parentId: <dead id>})`. The document is written with a dangling `parentId` and never appears anywhere in the tree — the member is told the write succeeded.
2. A member row with no `docsFolderId` (restored from a backup taken between the two writes, or a row whose folder was never minted) is absent from the map forever. `write_doc` refuses `TEAM_DOCS_NOT_READY` on every turn and nothing ever repairs it.

The doc comment above the function claims "A `docsFolderId` naming a dead folder or a non-folder note is treated as absent" — true for the team row, not for member rows.

**Fix:** in the early-return branch, verify each member folder and mint only the missing/dead ones:
```ts
const memberFolderIds = new Map<string, string>();
let repaired = false;
for (const row of rows) {
  if (row.docsFolderId !== undefined && (await isLiveFolder(row.docsFolderId, db))) {
    memberFolderIds.set(row.agentId, row.docsFolderId);
    continue;
  }
  const name = (await db.aiEmployees.get(row.agentId))?.name ?? row.agentId;
  const folderId = await createMemberFolder(team.docsFolderId, name, db);
  await db.aiTeamMembers.update(row.id, { docsFolderId: folderId });
  memberFolderIds.set(row.agentId, folderId);
  repaired = true;
}
if (!repaired) return { team, memberFolderIds };
return { team, memberFolderIds };
```

### WR-02: `write_doc` throws a ZodError on over-long input instead of returning a refusal code

**File:** `src/services/ai/office/teamTools.ts:806-816`
**Issue:** `create` builds `title: ${ctx.agentName} — ${title}` (agent name up to 60 chars) and passes the model's body straight through. `NoteInputSchema` caps `title` at 120 and `body` at 50000 (`schemas.ts:439-440`). A model writing a 60-character title produces ~123 characters and `createNote` throws. The runtime catches it (`aiOrchestratorLoop.ts:469-478`) and returns `{error: "Lỗi thực thi công cụ 'write_doc': ..."}` — the model gets an opaque Zod message and no code to self-correct on. `proposeSkillVersion` in this same file explicitly documents the opposite convention: "The repo schema would throw on an over-long field, and a throw is not the team-tool convention — validate here so the model gets a code it can self-correct on" (`teamTools.ts:697-704`). No test covers an over-long title.

**Fix:**
```ts
const MAX_DOC_TITLE = 120;
const prefix = ctx.agentName ? `${ctx.agentName} — ` : '';
if (!title) return JSON.stringify(refuse('INVALID_ARGUMENT', 'Thiếu tiêu đề tài liệu.'));
if (prefix.length + title.length > MAX_DOC_TITLE) {
  return JSON.stringify(
    refuse('INVALID_ARGUMENT', `Tiêu đề quá dài (tối đa ${MAX_DOC_TITLE - prefix.length} ký tự).`)
  );
}
if (body.length > 50000) {
  return JSON.stringify(refuse('INVALID_ARGUMENT', 'Nội dung quá dài (tối đa 50000 ký tự).'));
}
```

### WR-03: `write_doc` update accepts a folder as its target

**File:** `src/services/ai/office/teamTools.ts:828`
**Issue:** The ownership guard only compares `parentId`:
```ts
if (!existing || existing.deletedAt || existing.parentId !== folderId) {
```
A folder the owner created inside the member's folder has `parentId === folderId`, so an agent can rename it and overwrite its body. `list` deliberately filters folders out (`note.type !== 'folder'`, line 790) — the intent is documents only — but `update` does not enforce it. The description promises "sửa tài liệu đã có trong thư mục của bạn".

**Fix:**
```ts
if (
  !existing ||
  existing.deletedAt ||
  existing.parentId !== folderId ||
  existing.type === 'folder'
) {
  return JSON.stringify(refuse('DOC_NOT_IN_YOUR_FOLDER', '...'));
}
```

### WR-04: `createTeam` accepts duplicate `employeeIds`, producing duplicate member rows and an orphan folder

**File:** `src/db/repositories/aiTeamRepo.ts:160-171`
**Issue:** `addTeamMember` guards against a duplicate agent (`aiTeamRepo.ts:540-542`), but `createTeam` does not. `createTeam({employeeIds: [x, x]})` writes two member rows for `x`. `createTeamDocsTree` keys `memberFolderIds` by `agentId`, so the second `createMemberFolder` call mints `X (2)` and overwrites the map entry — the first folder (`X`) is left in the team folder with no row pointing at it, and both member rows are written the `X (2)` id. Passing the `leadId` inside `employeeIds` produces a lead row plus an employee row for the same agent, which no other path allows.

**Fix:** dedupe before building the rows, and drop the lead id from the employee list:
```ts
const employeeIds = [...new Set(input.employeeIds ?? [])].filter((id) => id !== team.leadId);
```

### WR-05: `query_notes` returns model-authored titles raw to the lead

**File:** `src/services/ai/aiTools.ts:3054` (reachable from `src/services/ai/office/teamPrompts.ts:231`)
**Issue:** The lead prompt instructs the leader to read member drafts with `query_notes`, and the handler returns `title: n.title ?? 'Untitled Note'` unwrapped while wrapping `bodySnippet` (line 3059-3062). Before this phase every note title was user-authored; `write_doc` now makes titles model-authored (and the model that wrote one may be a different agent than the one reading it). The lead is the single agent holding mutation tools, so an unwrapped title is the highest-value injection target in the system, and the codebase's own rule (`untrustedData.ts` header) is that every retrieved free-text field is wrapped.

**Fix:**
```ts
title: wrapField(`TIÊU ĐỀ GHI CHÚ ${n.id}`, n.title ?? 'Untitled Note'),
entityName: wrapField(`TÊN MỤC ${n.id}`, entityName),
```

### WR-06: The lead prompt names a `folder id` filter that `query_notes` does not have

**File:** `src/services/ai/office/teamPrompts.ts:231`
**Issue:** The line reads "Đọc bản nháp của một nhân viên bằng query_notes lọc theo folder id của nhân viên đó". `query_notes` has no `folderId` parameter — the filter is `parentId` (`aiTools.ts:478-481`). A model following the instruction literally has to guess the parameter name, and a wrong guess returns the unfiltered note list, which the lead may then read as the member's draft.

**Fix:** name the parameter: `'Đọc bản nháp của một nhân viên bằng query_notes với parentId = folder id của nhân viên đó, rồi tổng hợp.'`

### WR-07: Renaming a team leaves the team folder with the old name

**File:** `src/db/repositories/aiTeamRepo.ts:240`
**Issue:** `updateTeam` applies `validated.name` to the `aiTeams` row only. The docs tree is keyed by `docsFolderId`, so nothing breaks functionally, but the owner sees a folder named after the team's previous name in Docs, and there is no surface that will ever reconcile it. Every other team-facing rename path (the drawer) goes through this function.

**Fix:** after `updated.name` is set and `existing.docsFolderId` is live, rename the folder in the same transaction:
```ts
if (validated.name !== undefined && updated.docsFolderId !== undefined) {
  await db.notes.update(updated.docsFolderId, {
    title: validated.name,
    updatedAt: new Date().toISOString(),
  });
}
```

### WR-08: No backup test proves a present `docsFolderId` survives the strict schemas

**File:** `tests/services/backup/officeBackup.test.ts:274`
**Issue:** The only change to this file is `LATEST_SCHEMA_VERSION` 26 → 27. The `team`, `leadMember` and `employeeMember` fixtures carry no `docsFolderId`, so the round-trip only exercises the *absent* case. Both record schemas are `strictObject`, so a field that is written by the app but missing from the schema makes the app's own export unrestorable — the exact failure mode this file exists to catch (see the `WR-10` cache-token test at line 557). Nothing here would fail if `docsFolderId` were dropped from either schema.

**Fix:** add `docsFolderId` to the `team` and `leadMember` fixtures (a fixed v4 UUID) and assert it on the restored rows, plus one case asserting a pre-41 row without the key still validates.

### WR-09: `deleteTeamDocsTree` trusts the stored id without checking it is a team folder

**File:** `src/db/repositories/teamDocsRepo.ts:124`
**Issue:** The function deletes whatever `teamFolderId` names plus its subtree. `docsFolderId` is restored verbatim from a backup (`restoreBackup.ts:316-321`) and only validated as a UUID (`backupSchemas.ts:670`), so a hand-edited or corrupted payload can point a team at the shared `AI Teams` root. Deleting that team would then delete the root and every other team's tree. The shared root and its setting are otherwise carefully preserved (`teamDocsRepo.ts:118`), so this is the one path that can destroy them.

**Fix:** refuse to descend into the root:
```ts
const rootSetting = await db.settings.get(AI_TEAMS_DOCS_ROOT_SETTING_KEY);
if (rootSetting?.value === teamFolderId) return;
```

## Info

### IN-01: `...(role ? { role } : {})` is dead code

**File:** `src/services/ai/office/teamRunCoordinator.ts:1095-1105`
**Issue:** `role` is typed `'lead' | 'employee'` and assigned from a ternary, so it is never falsy — the conditional spread always fires. The comment above it (D-06) makes the intent clear; the guard just does not do anything.
**Fix:** `role,` in the object literal.

### IN-02: Nothing enforces that `LEAD_ONLY_TEAM_TOOLS` and `EMPLOYEE_ONLY_TEAM_TOOLS` are disjoint

**File:** `src/services/ai/office/teamTools.ts:286-297`
**Issue:** The comment states "A tool in both sets would be offered to nobody", but no assertion or test enforces it. A future edit adding a name to both sets silently removes the tool from both payloads.
**Fix:** add a module-level assertion or a test: `expect([...LEAD_ONLY_TEAM_TOOLS].filter((n) => EMPLOYEE_ONLY_TEAM_TOOLS.has(n))).toEqual([])`.

### IN-03: The schema comment cites a decision id that is not in the phase's locked list

**File:** `src/db/schema.ts:189`
**Issue:** The V27 comment cites "D-13, D-15"; the phase context lists only D-13 for the unindexed payload decision. A reader chasing D-15 finds nothing.
**Fix:** cite D-13 only, or add D-15 to the context.

### IN-04: A failed second `ensureDocsReady` leaves a stale `liveTeam.docsFolderId`

**File:** `src/services/ai/office/teamRunCoordinator.ts:1453-1462`
**Issue:** The catch resets `memberFolderIds` but not `liveTeam`. If the first turn succeeded and a later turn's backfill throws, `liveTeam` still carries the previous `docsFolderId`, which the lead prompt then presents as the place to write the final document — even when that folder has since been deleted.
**Fix:** in the catch, also drop the stale handle: `liveTeam = { ...liveTeam, docsFolderId: undefined };` (or leave it and document why the stale id is acceptable).

### IN-05: `createTeam` writes the team row twice

**File:** `src/db/repositories/aiTeamRepo.ts:143` and `:193`
**Issue:** `db.aiTeams.add(team)` then `db.aiTeams.update(team.id, { docsFolderId })`. The id is known before the add only after the tree is built, but the tree needs the team name — so the row could be added once with `docsFolderId` included by building the tree first, or the double write could be left with a one-line comment. Cosmetic; the transaction makes it safe.
**Fix:** `await db.aiTeams.add({ ...team, docsFolderId: tree.folderId })` after the tree is built, or note that the second write is intentional.

### IN-06: The migration test is named for V26 but asserts V27

**File:** `tests/db/schemaV26Migration.test.ts:73-77`
**Issue:** The file and describe block are "V26 migration", but the first test asserts `LATEST_SCHEMA_VERSION === 27` and `db.verno === 27`. The V27 step has no upgrade hook, so there is nothing to test beyond the version number — but the name now hides which phase owns the assertion.
**Fix:** rename the test to "opens at the latest version" and note that V27 is a payload-only bump, or add a case proving a V26 database with existing `aiTeams`/`aiTeamMembers` rows opens at V27 with every row intact.

---

_Reviewed: 2026-11-15_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
