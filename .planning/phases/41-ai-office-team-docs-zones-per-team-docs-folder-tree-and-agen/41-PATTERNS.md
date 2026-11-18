# Phase 41: AI Office team docs zones — Pattern Map

**Mapped:** 2026-11-15
**Files analyzed:** 12 (8 modified, 4 new/extended tests)
**Analogs found:** 12 / 12

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/db/schema.ts` (mod) | config | transform | `SCHEMA_V26` + `LATEST_SCHEMA_VERSION` (:185-191) | exact |
| `src/db/index.ts` (mod) | config | transform | `this.version(25).stores(SCHEMA_V25)` (:648) | exact |
| `src/types/aiOffice.ts` (mod) | model | — | `AiTeam.mcpEnabled` (:88) | exact |
| `src/validation/backupSchemas.ts` (mod) | validation | transform | `BackupAiTeamRecordSchema` (:646) | exact |
| `src/db/repositories/teamDocsRepo.ts` (NEW) | repository | CRUD | `noteRepo.ts` + `aiTeamRepo.ts` | role-match |
| `src/db/repositories/aiTeamRepo.ts` (mod) | repository | CRUD | its own `createTeam`/`deleteTeam`/`addTeamMember` | exact |
| `src/services/ai/office/teamTools.ts` (mod) | service | request-response | `proposeSkillVersion` (:628) | exact |
| `src/services/ai/office/teamRunCoordinator.ts` (mod) | service | event-driven | `toolContext` (:1075) + `send()` roster load (:2438) | exact |
| `src/services/ai/office/teamPrompts.ts` (mod) | utility | transform | `buildEmployeeTurnRequest` (:52) | exact |
| `tests/db/teamDocsRepo.test.ts` (NEW) | test | CRUD | `tests/db/aiTeamRunRepo.test.ts` | exact |
| `tests/services/ai/office/teamTools.test.ts` (extend) | test | request-response | its own `ctx()` factory (:33) | exact |
| `tests/services/ai/office/aiTeamRepo.test.ts` (extend) | test | CRUD | its own fixtures (:33-50) | exact |

**Not modified (deliberate):** `src/components/ai/runtime/chatTurnRuntime.ts` (D-01 reason), `src/services/ai/chatTurnTools.ts` (`EMPLOYEE_READ_ONLY_ALLOWLIST`, D-03), `src/services/localSqlitePersistence.ts`, `src-tauri/src/sqlite_persistence.rs`, `tests/db/tableListParity.test.ts` (D-15 — no new table).

## Pattern Assignments

### `src/db/schema.ts` (config, transform)

**Analog:** `SCHEMA_V26` / `LATEST_SCHEMA_VERSION` (lines 182-191)

```ts
// Phase 39 (D-14): `version` is assigned at approval only. ... no index spec changes, so the
// store shape is identical to V25.
export const SCHEMA_V26 = {
  ...SCHEMA_V25,
} as const;

// Bump with every new `this.version(n)` in db/index.ts. Migration tests assert
// against this instead of a literal, so a schema bump never silently breaks them.
export const LATEST_SCHEMA_VERSION = 26;
```

**Copy:** add `SCHEMA_V27 = { ...SCHEMA_V26 } as const;` with a comment naming Phase 41 D-13, then set `LATEST_SCHEMA_VERSION = 27`. `notes` index (:70) and `aiTeams` index (:126) stay untouched — `docsFolderId` is unindexed row payload.

### `src/db/index.ts` (config, transform)

**Analog:** `this.version(25)` (line 648) — the no-upgrade-hook form

```ts
// Phase 38: split usage columns and the per-team warn threshold. Purely additive,
// nothing to backfill, so no `.upgrade()` hook.
this.version(25).stores(SCHEMA_V25);
```

**Copy:** `this.version(27).stores(SCHEMA_V27);` after the v26 block (ends :672). No `.upgrade()` — D-12 forbids data migration. Import `SCHEMA_V27` from `./schema`.

### `src/types/aiOffice.ts` (model)

**Analog:** `AiTeam.mcpEnabled` (line 88) — optional field with a phase-tagged comment

```ts
  /** Phase 39: advertise read-only MCP tools to this team's agents. Absent means off. */
  mcpEnabled?: boolean | undefined;
```

**Copy:** `/** Phase 41 D-13: the team's docs folder in `db.notes`. Absent on pre-41 rows. */ docsFolderId?: string | undefined;`

### `src/validation/backupSchemas.ts` (validation, transform)

**Analog:** `BackupAiTeamRecordSchema` (line 646)

```ts
export const BackupAiTeamRecordSchema = z.strictObject({
  id: uuidSchema,
  name: aiNameSchema,
  ...
  /** Phase 39: read-only MCP tools for this team. Optional so a pre-39 export still restores. */
  mcpEnabled: z.boolean().optional(),
```

**Copy:** `docsFolderId: uuidSchema.optional(),` with the same "optional so a pre-41 export still restores" comment. `strictObject` means omitting it breaks restore of new exports — the field is mandatory to add. Do **not** touch `FORBIDDEN_BACKUP_KEYS` (:194): a UUID is not free text (D-14).

### `src/db/repositories/teamDocsRepo.ts` (NEW — repository, CRUD)

**Analogs:** `noteRepo.ts` (note construction + folder semantics) and `aiTeamRepo.ts` (transaction + ambient-db convention).

**Signature convention** — every repo fn takes `db: TaskPlannerDatabase = defaultDb` (`noteRepo.ts:17-20`):

```ts
export async function createNote(
  input: NoteInput,
  db: TaskPlannerDatabase = defaultDb
): Promise<Note> {
```

**Folder row shape** — exactly what `DocsExplorer.handleCreateFolder` writes (`src/workbench/toolwindows/DocsExplorer.tsx:142-152`):

```ts
const newFolder = await createNote(
  { title: folderName, body: '', type: 'folder', parentId: parentId || undefined },
  db
);
```

**Ambient transaction rule:** `createNote`/`updateNote` take no transaction argument — Dexie joins the caller's `db.transaction('rw', [...])` automatically. So `teamDocsRepo` helpers can call `createNote(..., db)` from inside `createTeam`'s transaction, provided `db.notes` is in that transaction's table list. This is the whole reason D-09 is one transaction.

**Setting-key pattern** — `src/services/conventionService.ts:5` and `:26-47`:

```ts
export const GLOBAL_CONVENTIONS_SETTING_KEY = 'global_conventions';

export async function getGlobalConventions(db: TaskPlannerDatabase = defaultDb): Promise<string> {
  const row = await db.settings.get(GLOBAL_CONVENTIONS_SETTING_KEY);
  return typeof row?.value === 'string' ? row.value : '';
}

export async function saveGlobalConventions(content: string, db = defaultDb): Promise<void> {
  await db.settings.put({ key: GLOBAL_CONVENTIONS_SETTING_KEY, value: content });
}
```

`Setting` is `{ key: string; value: unknown }` (`src/types/models.ts:148-151`), primary key `key` (`SCHEMA_V1`: `settings: 'key'`).

**Recommended surface** (minimum that satisfies D-08/D-08b/D-09/D-10/D-11/D-12/D-12b):

```ts
export const AI_TEAMS_DOCS_ROOT_SETTING_KEY = 'ai_teams_docs_root';

// Signatures below are the ones the plans implement — keep them in sync with 41-02.
/** D-08b: read the setting; create + persist the `AI Teams` root when missing or dead. */
export async function ensureDocsRoot(db): Promise<string>;
/** D-09: create team folder + one member folder each; returns { folderId, memberFolderIds }. */
export async function createTeamDocsTree(
  teamName: string,
  members: readonly { agentId: string; name: string }[],
  db
): Promise<{ folderId: string; memberFolderIds: Map<string, string> }>;
/** D-10: delete team folder + its direct children + their notes. Never the root, never the setting. */
export async function deleteTeamDocsTree(teamFolderId: string | undefined, db): Promise<void>;
/** D-11: `{agent.name}`, suffix ` (2)`, ` (3)` on collision inside the team folder. */
export async function createMemberFolder(teamFolderId: string, agentName: string, db): Promise<string>;
/** D-12b: true when the id still names a live folder row. */
export async function isLiveFolder(noteId: string | undefined, db): Promise<boolean>;
/** D-12/D-12b: idempotent backfill. Store list MUST cover every table the body reads. */
export async function ensureTeamDocsReady(
  teamId: string,
  db
): Promise<{ team: AiTeam; memberFolderIds: Map<string, string> }>;
```

`isLiveFolder` body — the exact check D-12b names:

```ts
const row = await db.notes.get(noteId);
return !!row && !row.deletedAt && row.type === 'folder';
```

**No recursion** (D-10): children are one level. Collect with `db.notes.where('parentId').equals(teamFolderId).toArray()`, then `db.notes.where('parentId').anyOf(childIds).delete()`, then delete child folders, then the team folder.

### `src/db/repositories/aiTeamRepo.ts` (mod — repository, CRUD)

**Analog: `createTeam` transaction** (lines 119-151)

```ts
await db.transaction('rw', [db.aiTeams, db.aiTeamMembers, db.aiLeads, db.aiEmployees], async () => {
  await assertAgentsExist(team.leadId, employeeIds, db);
  await db.aiTeams.add(team);
  ...
  await db.aiTeamMembers.bulkAdd(rows);
  await writeEvenSplit(team.id, team.budgetTokens, db);
});

return team;
```

**Copy:** add `db.notes, db.settings` to the table list, then after `bulkAdd(rows)` call `createTeamDocsTree(...)` and write `team.docsFolderId` via `db.aiTeams.update(team.id, { docsFolderId })` (or set it on the row before `add` — the helper needs the folder id, so update-after is the simpler order). A throw anywhere rolls back team + folders + setting together (D-09).

**Analog: `deleteTeam` transaction** (lines 351-389) — the table-list + dependency-order idiom:

```ts
await db.transaction('rw', [db.aiTeams, db.aiTeamMembers, ...], async () => {
  const threads = await db.chatThreads.where('scopeKey').equals(`team:${id}`).toArray();
  ...
  await db.aiTeamMembers.where('teamId').equals(id).delete();
  await db.aiTeamLinks.where('teamId').equals(id).delete();
  await db.aiTeams.delete(id);
});
```

**Copy:** add `db.notes` to the list; read the team row first to get `docsFolderId`; call `deleteTeamDocsTree(team.docsFolderId, db)` before `db.aiTeams.delete(id)`. Do **not** delete the `AI Teams` root or the setting (D-10).

**Analog: `addTeamMember` transaction** (lines 415-442) — already loads the agent:

```ts
return db.transaction('rw', [db.aiTeamMembers, db.aiEmployees], async () => {
  const agent = await db.aiEmployees.get(validated.agentId);
  if (!agent) throw new Error(`Không tìm thấy nhân viên: ${validated.agentId}`);
  ...
  await db.aiTeamMembers.add(member);
  return member;
});
```

**Copy:** add `db.notes` to the list and call `createMemberFolder(team.docsFolderId, agent.name, db)` after the member row is added (D-11). Team row must be read for `docsFolderId` — add `db.aiTeams` to the transaction tables.

**Analog: `removeTeamMember`** (lines 445-466) — **do not add anything**. D-11: the member folder survives. Put the reason in a comment so nobody "cleans it up" later.

### `src/services/ai/office/teamTools.ts` (mod — service, request-response)

**Analog: `TeamToolContext`** (lines 27-39) — add one field:

```ts
export interface TeamToolContext {
  db: TaskPlannerDatabase;
  teamId: string;
  threadId: string;
  agentId: string;
  skillId?: string | undefined;
  skillVersion?: number | undefined;
}
```

**Copy:** `/** Phase 41 D-05: the caller's own docs folder. Absent means the tree is not ready. */ folderId?: string | undefined;`

**Analog: refusal code union + helper** (lines 41-62):

```ts
export type TeamToolRefusalCode =
  | 'TURN_NOT_IN_TEAM'
  ...
  | 'EMPTY_MESSAGE';

/** Mirrors `ArtifactToolRefusal`: a refusal is a returned value, never a thrown error. */
export interface TeamToolRefusal {
  refused: true;
  code: TeamToolRefusalCode;
  message: string;
}

function refuse(code: TeamToolRefusalCode, message: string): TeamToolRefusal {
  return { refused: true, code, message };
}
```

**Copy:** add `'DOC_NOT_IN_YOUR_FOLDER' | 'TEAM_DOCS_NOT_READY' | 'LEAD_USES_DB_TOOLS'` to the union. Handlers return `JSON.stringify(refuse(...))` — never throw. The third code is the leader's role refusal (D-06) — it says "this write path is not yours", which no existing code says.

**Analog: tool definition shape** (`propose_skill_version`, lines 201-224):

```ts
{
  type: 'function',
  function: {
    name: 'propose_skill_version',
    description: 'Đề xuất một phiên bản mới ... Không thay đổi gì cho tới khi người dùng duyệt. ...',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '...' },
        ...
      },
      required: ['name', 'description', 'body'],
    },
  },
},
```

**Copy:** one `write_doc` entry appended to `TEAM_TOOL_DEFINITIONS` with `action` enum `['list','create','update']`, plus `title`, `body`, `noteId`. Keep it OUT of `LEAD_ONLY_TEAM_TOOLS` (:251) so employees keep it, and declare `EMPLOYEE_ONLY_TEAM_TOOLS = new Set(['write_doc'])` so `leadTools()` can subtract it. D-06 is enforced twice, both in code: the payload filter keeps the tool out of the leader's hands, and the handler refuses `ctx.role === 'lead'` with `LEAD_USES_DB_TOOLS`. The leader gets no `folderId`, so there is no legal `write_doc` target even if a call slipped through. A prompt instruction is not one of the guards.

**Analog: handler shape** (`proposeSkillVersion`, lines 628-706) — the exact precedent for "team tool writes data, no approval card":

```ts
async function proposeSkillVersion(
  args: Record<string, any>,
  ctx: TeamToolContext
): Promise<string> {
  if (!ctx.skillId) {
    return JSON.stringify(refuse('SKILL_NOT_ASSIGNED', 'Nhân viên này chưa được gán kỹ năng nào.'));
  }
  ...
  const name = typeof args.name === 'string' ? args.name.trim() : '';
  if (!name || !description || !body) {
    return JSON.stringify(refuse('INVALID_ARGUMENT', 'Thiếu nội dung đề xuất.'));
  }
  ...
  const row = await createSkillVersion({ ... }, ctx.db, baseVersion);
  return JSON.stringify({ proposalId: ..., versionId: row.id, ... });
}
```

**Copy for `writeDoc(args, ctx)`** — the guard order is load-bearing (D-04):

```ts
async function writeDoc(args: Record<string, any>, ctx: TeamToolContext): Promise<string> {
  // D-06, first: the leader's write path is the DB tool plus the approval card.
  if (ctx.role === 'lead') {
    return JSON.stringify(
      refuse('LEAD_USES_DB_TOOLS', 'Leader ghi bằng công cụ cơ sở dữ liệu, mỗi lần ghi dừng ở thẻ phê duyệt.')
    );
  }
  if (!ctx.folderId) {
    return JSON.stringify(refuse('TEAM_DOCS_NOT_READY', 'Thư mục tài liệu của bạn chưa sẵn sàng.'));
  }
  const action = typeof args.action === 'string' ? args.action : '';
  if (action === 'list') {
    const rows = await getNotesByFolder(ctx.folderId, ctx.db);
    return JSON.stringify(
      rows.map((n) => ({ noteId: n.id, title: n.title ?? '', updatedAt: n.updatedAt }))
    );
  }
  if (action === 'create') {
    // D-04: args.parentId is never read. type is always 'document'.
    const note = await createNote(
      // No dangling `— ` when the caller has no display name.
      { type: 'document', parentId: ctx.folderId, title: ctx.agentName ? `${ctx.agentName} — ${title}` : title, body },
      ctx.db
    );
    return JSON.stringify({ noteId: note.id, title: note.title ?? '' });
  }
  if (action === 'update') {
    const existing = await ctx.db.notes.get(noteId);
    if (!existing || existing.deletedAt || existing.parentId !== ctx.folderId) {
      return JSON.stringify(refuse('DOC_NOT_IN_YOUR_FOLDER', 'Tài liệu này không nằm trong thư mục của bạn.'));
    }
    const updated = await updateNote(noteId, { ...(title ? { title } : {}), body }, ctx.db);
    return JSON.stringify({ noteId, title: updated?.title ?? '' });
  }
  return JSON.stringify(refuse('INVALID_ARGUMENT', 'action phải là list, create hoặc update.'));
}
```

`ctx.agentName` and `ctx.role` are **not** on `TeamToolContext` today — add both alongside `folderId` (D-02b needs the prefix, D-06 needs the role; the coordinator already has the roster row). Alternative: resolve via `db.aiEmployees.get(ctx.agentId)` inside the handler; the context field is cheaper and matches the "ids/facts come from context" rule at the top of the file (:16-25).

**Analog: dispatch switch** (lines 708-735):

```ts
export async function executeTeamTool(
  name: string,
  args: Record<string, any>,
  ctx: TeamToolContext
): Promise<string> {
  const input = args ?? {};
  switch (normalizeToolName(name)) {
    case 'search_team_history': return searchTeamHistory(input, ctx);
    ...
    case 'propose_skill_version': return proposeSkillVersion(input, ctx);
    case 'send_message': return sendMessage(input, ctx);
    default: return JSON.stringify({ error: `Unknown team tool: ${name}` });
  }
}
```

**Copy:** one `case 'write_doc': return writeDoc(input, ctx);`.

**Untrusted-data boundary:** `list` returns `title` values that are model-authored (the agent wrote them). `get_linked_context` (:449) wraps note bodies with `wrapUntrusted('MỤC LIÊN KẾT ...', note.body)`. Apply the same to `title` in `list` output: `wrapField('TIÊU ĐỀ TÀI LIỆU', n.title)`. `create`/`update` return the title the caller just supplied — no wrap needed.

### `src/services/ai/office/teamRunCoordinator.ts` (mod — service, event-driven)

**Analog: `toolContext`** (lines 1075-1089) — the single construction site (D-05):

```ts
function toolContext(agentId: string): TeamToolContext {
  const employee = roster.employees.find((row) => row.id === agentId);
  const skillId = employee?.skillId;
  const pinned = pinnedSkillVersion.get(agentId);
  return {
    db, teamId, threadId: options.threadId, agentId,
    ...(skillId ? { skillId } : {}),
    ...(pinned !== undefined ? { skillVersion: pinned } : {}),
  };
}
```

**Copy:** resolve `folderId` from the member-folder map built at turn start (see backfill below) and add `...(folderId ? { folderId } : {})`, plus `agentName` and `role`. The leader gets `role: 'lead'` and NO `folderId` — its write path is the DB tool plus the approval card, and `write_doc` refuses it (D-06). The team folder reaches the leader as a prompt fact (`docsFolderId`), never as a tool context write target.

**Analog: turn-start hook** — `send()` loads the roster once per turn (lines 2438-2458):

```ts
async function send(text: string): Promise<'started' | 'steered' | 'refused' | 'blocked'> {
  if (disposed) return 'blocked';
  if (options.loadRoster) {
    roster = await options.loadRoster();
    applyRosterMembership(await hydrateBudgets());
  } else {
    await ensureMembers();
  }
  if (disposed) return 'blocked';
  await refreshMcpTools();
  ...
```

**Copy:** the backfill (D-12/D-12b) belongs here — after the roster is loaded (so member names are known), before any turn can read `toolContext`. Shape:

```ts
// D-12/D-12b: the tree is guaranteed BEFORE the turn starts, so `toolContext` can read it.
const docs = await ensureTeamDocsReady(teamId, db);
liveTeam = docs.team;                    // carries the new docsFolderId
memberFolderIds = docs.memberFolderIds;  // Map<agentId, folderId>
```

`ensureTeamDocsReady` lives in `teamDocsRepo` and does the idempotency check **inside** its own transaction (D-12): re-read `db.aiTeams.get(teamId)`, return early when `docsFolderId` is live, otherwise create and persist. Two concurrent turns must not both create a tree.

**Analog: dispatch** (lines 1149-1186) — `write_doc` needs **no** change here:

```ts
if (TEAM_TOOL_NAMES.has(normalized)) {
  return executeTeamTool(name, args, ctx);
}
```

`TEAM_TOOL_NAMES` (:324) is derived from `TEAM_TOOL_DEFINITIONS`, and `EMPLOYEE_TEAM_TOOLS` (:329) filters only `LEAD_ONLY_TEAM_TOOLS` — so appending the definition is enough to advertise it to both roles. This is the D-01 payoff: no runtime change, no new policy.

**Prompt wiring** — `startLeadTurn` (:2015) and `startEmployeeTurn` (:1812) both build prompts; pass the folder facts into `buildLeadTurnRequest` / `buildEmployeeTurnRequest`.

### `src/services/ai/office/teamPrompts.ts` (mod — utility, transform)

**Analog: employee read-only policy block** (lines 56-66) — where the folder line goes (D-16):

```ts
const parts = [
  `Bạn là ${employee.name}, ${employee.role} trong nhóm "${team.name}".`,
  employee.persona,
  [
    '[CHÍNH SÁCH CHỈ ĐỌC]',
    'Bạn chỉ được đọc dữ liệu. Mọi thao tác ghi đều bị từ chối tự động, trừ một ngoại lệ duy nhất bên dưới.',
    'Ngoại lệ: công cụ propose_skill_version được phép tạo một đề xuất kỹ năng ở trạng thái chờ duyệt. ...',
    ...
  ].join('\n'),
];
```

**Copy:** add a second exception line for `write_doc`, plus the folder line: `Folder tài liệu của bạn: ${folderId} — dùng write_doc (list/create/update) để ghi trong đó.` Add `folderId?: string` to `BuildEmployeeTurnRequestInput` (:39-50). The policy text currently says "trừ một ngoại lệ duy nhất" — that sentence must become "trừ hai ngoại lệ" or it contradicts the new tool.

**Analog: lead write-permission block** (lines 214-220):

```ts
parts.push(
  [
    '[QUYỀN GHI]',
    'Chỉ bạn được thay đổi dữ liệu. Mỗi thao tác ghi sẽ dừng ở thẻ phê duyệt để người dùng quyết định.',
    'Luôn trả lời bằng tiếng Việt.',
  ].join('\n')
);
```

**Copy:** add `[THƯ MỤC TÀI LIỆU NHÓM]` with `Folder nhóm: ${docsFolderId}` and `{agentName} → {folderId}` per member. Add `docsFolderId?: string` and `memberFolders?: readonly {agentName, folderId}[]` to `BuildLeadTurnRequestInput` (:129-141). Wording is Claude's Discretion (D-07); the facts are not.

### `tests/db/teamDocsRepo.test.ts` (NEW — test, CRUD)

**Analog:** `tests/db/aiTeamRunRepo.test.ts` (lines 1-27)

```ts
// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db/index';
import { openBatch, ... } from '../../src/db/repositories/aiTeamRunRepo';

describe('aiTeamRunRepo (Phase 37, D-09, D-22, D-23, D-25)', () => {
  let db: TaskPlannerDatabase;
  beforeEach(async () => {
    db = new TaskPlannerDatabase('TestAiTeamRunRepo_' + Math.random().toString(36).slice(2));
    await db.open();
  });
  afterEach(async () => { await db.delete(); });
```

Note: `tests/setup.ts` installs the IndexedDB shim globally, so no `fake-indexeddb/auto` import is needed — `tests/db/aiTeamRunRepo.test.ts` is the in-repo proof of that shape (it imports neither the shim nor a global `db`). Use `// @vitest-environment node` plus a per-test `new TaskPlannerDatabase(name)` and an `afterEach` `db.delete()`.

**Rollback test pattern** (`tests/services/ai/office/aiTeamRepo.test.ts:132`, `:164`): `await expect(fn(...)).rejects.toThrow(/.../i);` then assert the absence of rows.

### `tests/services/ai/office/teamTools.test.ts` (extend — test, request-response)

**Analog:** its own `ctx()` factory (lines 33-39):

```ts
const ctx = (overrides: Partial<TeamToolContext> = {}): TeamToolContext => ({
  db, teamId, threadId, agentId,
  ...overrides,
});
```

**Copy:** extend the factory with `folderId` / `agentName` overrides. The existing suite already seeds `db.aiTeams` and a thread in `beforeEach` (:41-56) — add the folder rows there and reuse.

### `tests/services/ai/office/aiTeamRepo.test.ts` (extend — test, CRUD)

**Analog:** fixtures (lines 33-50) create real lead/employee rows through `aiOfficeRepo` because the repo refuses dangling ids. Reuse that; add assertions that `createTeam` produced `1 + 1 + N` folder rows and that `deleteTeam` removed them while leaving the `AI Teams` root.

## Shared Patterns

### Transaction table lists
**Source:** `src/db/repositories/aiTeamRepo.ts:119`, `:351`, `:415`
**Apply to:** `createTeam`, `deleteTeam`, `addTeamMember`, `assignLeader`, `ensureTeamDocsReady`
Every multi-table write names all touched tables explicitly — including every table the body only READS. Dexie 4 throws `NotFoundError` for a read outside the declared stores, so `ensureTeamDocsReady` must list `db.aiEmployees` (it resolves member names with `bulkGet`). Adding `db.notes`/`db.settings` to the list is the whole change — Dexie joins nested repo calls to the ambient transaction.

### Refusal as a returned value
**Source:** `src/services/ai/office/teamTools.ts:41-62`
**Apply to:** every `write_doc` branch
`JSON.stringify(refuse(code, message))` — never `throw`. A throw is not the team-tool convention (`:654-656`).

### Ids come from context, never args
**Source:** `src/services/ai/office/teamTools.ts:16-25` (file header)
**Apply to:** `write_doc` create (ignore `args.parentId`) and update (compare against `ctx.folderId`)
This is the existing cross-team read guard; D-04 extends the same rule to writes.

### Untrusted-data boundary
**Source:** `src/services/ai/untrustedData.ts` (`wrapUntrusted`, `wrapField`); usage at `teamTools.ts:449`, `teamPrompts.ts:75-76`
**Apply to:** `write_doc` `list` titles, lead prompt member-folder list
Model-authored text is data. A tool result is data by role; wrap only the free-text fields it carries.

### Setting-key lookup
**Source:** `src/services/conventionService.ts:5, 26-47`
**Apply to:** `ai_teams_docs_root`
Constant + `db.settings.get`/`put`; never discover the root folder by title (D-08).

### Schema bump without a data migration
**Source:** `src/db/schema.ts:185-191`, `src/db/index.ts:648`
**Apply to:** V27
Spread the previous schema, bump `LATEST_SCHEMA_VERSION`, add no `.upgrade()`. Backfill is lazy and lives in the coordinator (D-12).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| — | — | — | None. Every file has a direct in-repo precedent. |

## Open Detail — resolved

Superseded by CONTEXT D-13a (owner decision, 2026-11-15): `AiTeamMember` carries its own `docsFolderId?: string`, so a member's folder id is **stored on the row**, never derived. The title-match fallback this section used to recommend is dead — do not implement it, and do not add a `settings` key for the mapping. `toolContext` reads `member.docsFolderId`; absent means `TEAM_DOCS_NOT_READY` (D-05).

## Test Commands (scoped only — never the full suite)

```bash
npx vitest run tests/db/teamDocsRepo.test.ts
npx vitest run tests/services/ai/office/teamTools.test.ts
npx vitest run tests/services/ai/office/aiTeamRepo.test.ts
npx vitest run tests/db/tableListParity.test.ts   # must stay green (D-15)
```

## Metadata

**Analog search scope:** `src/db/repositories`, `src/services/ai/office`, `src/services/backup`, `src/validation`, `src/types`, `src/workbench/toolwindows`, `tests/db`, `tests/services/ai/office`
**Files scanned:** 22
**Pattern extraction date:** 2026-11-15
