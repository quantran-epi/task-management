# Phase 42: Read-only git inspection for the reviewer agent - Pattern Map

**Mapped:** 2026-11-15
**Files analyzed:** 5 (3 source edits, 2 test edits)
**Analogs found:** 5 / 5

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/services/ai/office/teamTools.ts` (modify) | service / tool handler | request-response + file-I/O (SSH) | same file: `getLinkedContext` (:476-557), `writeDoc` (:790-949) | exact (in-file precedent) |
| `src/services/ai/office/teamPrompts.ts` (modify) | prompt builder | transform | same file: `buildEmployeeTurnRequest` folder-id line (:101-105) | exact |
| `src/services/ai/office/teamRunCoordinator.ts` (verify only) | coordinator / payload assembly | request-response | same file: `oracleReadTools` (:1174-1179) | exact — **already implemented** |
| `tests/services/ai/office/teamTools.test.ts` (modify) | test | — | same file existing `executeTeamTool` suites | exact |
| `tests/services/ai/office/teamRunCoordinator.test.ts` (verify only) | test | — | oracle gate test (:1610-1646) | exact — **already exists** |

**No new source files.** D-06/D-09 put `git_read` inside the existing team-tool surface.

## Key finding: D-13 is already done

`src/services/ai/office/teamRunCoordinator.ts:1174-1179` already gates Oracle:

```typescript
async function oracleReadTools(): Promise<AiToolDefinition[]> {
  return (await getOracleToolConfig(db)).enabled === true ? ORACLE_READ_TOOLS : [];
}
```

Both payloads already spread it — `leadTools()` (:1154) and `employeeTools()` (:1165). `ORACLE_READ_TOOLS` is defined at `src/services/ai/aiTools.ts:4782`. The gate test exists at `tests/services/ai/office/teamRunCoordinator.test.ts:1610-1646` ("advertises the Oracle read pair to both agents only when the Oracle tool is enabled").

Landed in commit `26f0eeed feat(quick-261115-u1e): advertise read-only Oracle tools to team agents when enabled`. Planner should scope AIO-READ-06 to a verification step, not an implementation step.

## Pattern Assignments

### `src/services/ai/office/teamTools.ts` (service, request-response + SSH file I/O)

**Analog:** same file — `getLinkedContext` for the wrap boundary, `writeDoc` for the refusal/handler shape.

**Imports pattern** (lines 1-17) — add to this block:

```typescript
import type { TaskPlannerDatabase } from '../../../db';
import { wrapField, wrapUntrusted } from '../untrustedData';
```

New imports needed for `git_read` (mirror `RemoteGitExplorer.tsx:12-14`):

```typescript
import { getSshConfigById, getSshSecret } from '../../../services/sshService';
import {
  checkDirtyStatus, getCommitLog, getDiffSummary, getFileDiff, getRemoteBranches,
} from '../../../services/gitRemoteService';
import { getRemoteTree, getRemoteFileContent } from '../../../services/gitRemoteTreeService';
```

**Refusal pattern** (lines 60-86) — add codes to the union, nothing else:

```typescript
export type TeamToolRefusalCode =
  | 'TURN_NOT_IN_TEAM'
  ...
  | 'LEAD_USES_DB_TOOLS'
  // Phase 42
  | 'SYSTEM_NOT_LINKED'
  | 'NO_LINKED_REPO'
  | 'INVALID_ARGUMENT'; // already present, reuse for bad action/args

function refuse(code: TeamToolRefusalCode, message: string): TeamToolRefusal {
  return { refused: true, code, message };
}
```

**Tool definition pattern** (lines 88-286, `TEAM_TOOL_DEFINITIONS`) — fixed enum, no free-form command string (D-06):

```typescript
{
  type: 'function',
  function: {
    name: 'git_read',
    description:
      'Đọc trạng thái git của repo remote qua SSH (chỉ đọc). action: branches | status | log | diff_summary | diff_file | read_file | tree.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['branches', 'status', 'log', 'diff_summary', 'diff_file', 'read_file', 'tree'],
          description: '...',
        },
        systemId: { type: 'string', description: 'Chỉ cần khi nhóm liên kết nhiều hơn một hệ thống có repo.' },
        limit: { type: 'number', description: 'log: 1..50, mặc định 20.' },
        branch: { type: 'string' },
        base: { type: 'string' },
        target: { type: 'string' },
        filePath: { type: 'string' },
        dirPath: { type: 'string' },
      },
      required: ['action'],
    },
  },
},
```

**Repo-from-context resolution pattern** (D-07) — modeled on `getLinkedContext` (:476-490) which resolves the item against `listTeamLinks` and refuses when absent:

```typescript
const links = await listTeamLinks(ctx.teamId, ctx.db);
const link = links.find((row) => row.itemId === itemId);
if (!link) {
  return JSON.stringify(refuse('ITEM_NOT_LINKED', 'Mục này không được liên kết với nhóm.'));
}
```

`git_read` does the same, but filters `itemType === 'system'`, loads `ctx.db.systems.get(itemId)` (same call shape as `resolveLinkedItemLabel` at :433-436), and keeps only rows with both `sshConfigId` and `remoteRepoPath` (`System` fields at `src/types/models.ts:46-58`). Order: explicit `systemId` must be in that filtered set, else `SYSTEM_NOT_LINKED`; empty set → `NO_LINKED_REPO`; one entry → use it.

**Handler pattern** — `writeDoc` (:790-949) is the template: read `args` into locals, validate, `return JSON.stringify(refuse(...))` on every failure path, never throw.

**Wrap pattern** (D-11) — `getLinkedContext` (:532-553) is the exact precedent for wrapping a tool-result body:

```typescript
body: wrapUntrusted(`MỤC LIÊN KẾT ${note.title ?? itemId}`, note.body),
```

For `git_read`: label includes repo path + action, e.g. `wrapUntrusted(\`GIT ${action} ${repoPath}\`, text)`. Diff output, log messages, and file contents are all third-party text. Sticky-note/array fields use `wrapField` (:47-49) when the value may be non-string.

**Switch pattern** (lines 950-978) — one case, no default change:

```typescript
case 'git_read':
  return gitRead(input, ctx);
```

**Payload membership** — `EMPLOYEE_TEAM_TOOLS` (`teamRunCoordinator.ts:343`) derives `TEAM_TOOL_DEFINITIONS` minus `LEAD_ONLY_TEAM_TOOLS`; `leadTools()` (:1154) derives minus `EMPLOYEE_ONLY_TEAM_TOOLS`. Adding `git_read` to the array advertises it to both agents with no coordinator edit (D-09).

**Do NOT add to `MUTATION_TOOLS`** (`src/services/ai/aiTools.ts:4732-4772`). `isMutationTool` (:4800-4806) only checks that set, so `git_read` never reaches `onMutationCheck` and never parks an approval card — same rationale documented at `teamTools.ts:761-764` for `write_doc`.

**Invariant to update:** the module header comment at `teamTools.ts:27` says "Every handler is fully offline: it reads IndexedDB and `src/utils/bm25.ts` only." `git_read` breaks that. Edit the comment rather than leave it false.

**Secret pattern** — `getSshSecret(configId)` (`src/services/sshService.ts:91-93`) returns `string | null`; every git function takes `secret?: string`. Call shape from `RemoteGitExplorer.tsx:242-245`:

```typescript
const secret = await getSshSecret(selectedConfig.id);
const dirtyStatus = await checkDirtyStatus(selectedConfig, targetPath, secret ?? undefined);
```

`getSshConfigById(id, ctx.db)` (`sshService.ts:30-36`) resolves the `SshConfig`; null → refusal.

**Function signatures to call** (all take `secret?` last):

| Action | Call | Source |
|---|---|---|
| `branches` | `getRemoteBranches(config, repoPath, secret)` | `gitRemoteService.ts:34` |
| `status` | `checkDirtyStatus(config, repoPath, secret)` | `:68` |
| `log` | `getCommitLog(config, repoPath, base, target, secret)` | `:100` — **note: takes a range, not a limit.** D-06 wants `limit` + optional `branch`; slice the returned array in the handler, or pass `branch` as both base and target is wrong — prefer slicing after the call. |
| `diff_summary` | `getDiffSummary(config, repoPath, base, target, secret)` | `:145` |
| `diff_file` | `getFileDiff(config, repoPath, base, target, filePath, secret)` | `:240` |
| `read_file` | `getRemoteFileContent(config, repoPath, branch, filePath, secret)` | `gitRemoteTreeService.ts:156` |
| `tree` | `getRemoteTree(config, repoPath, branch, dirPath?, secret)` | `gitRemoteTreeService.ts:124` |

**Escape rule (D-08):** never build a command string in the handler. `runGitCommand` (`gitRemoteService.ts:20-32`) joins `gitArgs` and every caller passes `escapeShellArg(...)` per argument — see `getFileDiff` (:240-256) and `getRemoteFileContent` (:156-177). The handler passes raw values into those functions and nothing else.

**Error handling:** the git functions **throw** (`runGitCommand:28-30`). Team-tool convention is refusal-as-value, so wrap the call in `try/catch` and return `JSON.stringify(refuse('INVALID_ARGUMENT', err.message))` — do not let the throw escape. `executeSshReadFile` (`sshFsToolService.ts:165-173`) shows the alternative shape (catch → structured `{success:false, error}`), but team tools use `refuse`.

**Note on `resolveSshConfig`:** `sshFsToolService.ts:63` is **not exported** and reads the SSH-FS tool config, not the System row. Do not import it. `git_read` resolves its own `SshConfig` from the linked `System.sshConfigId` via `getSshConfigById`.

### `src/services/ai/office/teamPrompts.ts` (prompt builder, transform)

**Analog:** same file — the folder-id conditional block.

**Conditional-line pattern** (lines 99-105):

```typescript
// D-16: the folder id is a fixed fact for the turn. A UUID from the context, not model- or
// user-authored text, so it is not wrapped. No folder id means no claim (T-41-24).
if (folderId) {
  parts.push(
    `Folder tài liệu của bạn: ${folderId} — dùng write_doc (list/create/update) để ghi trong đó.`
  );
}
```

Add the reviewer line right after, same shape (D-12):

```typescript
const isReviewer =
  employee.role.toLowerCase().includes('review') ||
  (skill?.description ?? '').toLowerCase().includes('review');
if (isReviewer) {
  parts.push([...'[ĐỌC GIT]', '... branches → log → diff_summary → diff_file → read_file'].join('\n'));
}
```

`skill` is already destructured (:74-83); `employee.role` is a plain string. No new field on `AiEmployee` (D-12). Wording is Claude's Discretion.

**Test convention for this file:** `tests/services/ai/office/teamPrompts.test.ts` asserts exact prompt strings (see `ANTI_FABRICATION_BLOCK` exported at :63-70 purely so the test can assert it). If the reviewer line needs a stable assertion, export the constant the same way.

### `src/services/ai/office/teamRunCoordinator.ts` — verification only

**Analog:** `oracleReadTools` (:1174-1179), already wired into both payloads (:1154, :1165).

Nothing to change for D-13. If the planner wants a fresh assertion, extend `tests/services/ai/office/teamRunCoordinator.test.ts:1610-1646` — it already drives both agents through the harness and toggles `saveOracleToolConfig`.

`git_read` needs **no** coordinator edit: `TEAM_TOOL_NAMES` (:341-343) is derived from `TEAM_TOOL_DEFINITIONS`, and the dispatch branch at :1254-1256 routes it to `executeTeamTool`. `resolveTeamToolName` (:493-503) also derives from the same set.

## Shared Patterns

### Refusal-as-value
**Source:** `src/services/ai/office/teamTools.ts:60-86`
**Apply to:** every `git_read` failure path
```typescript
return JSON.stringify(refuse('INVALID_ARGUMENT', 'Thiếu tham số ...'));
```
Never throw from a team-tool handler. Documented at :77 ("a refusal is a returned value, never a thrown error").

### Untrusted wrap at the tool-result boundary
**Source:** `src/services/ai/untrustedData.ts:47-72` (`wrapField`, `wrapUntrusted`)
**Apply to:** every `git_read` result body
```typescript
export function wrapUntrusted(label: string, body: string): string
```
Zero-import module by design (:37) — safe to import from `teamTools`. Nonce-tagged delimiters; label is sanitized, body is not.

### Context-sourced identity
**Source:** `teamTools.ts:19-28` module header + `getLinkedContext` (:476-490)
**Apply to:** repo resolution
```typescript
const links = await listTeamLinks(ctx.teamId, ctx.db);
```
`teamId` / `threadId` / `agentId` / `systemId` are verified against the context, never trusted from args. `systemId` from args is only an *index* into the linked set.

### Shell escaping
**Source:** `src/services/gitRemoteService.ts:16-18`
**Apply to:** nothing directly — the handler never builds shell strings; `runGitCommand` callers escape per argument.

### Oracle payload gate
**Source:** `src/services/ai/office/teamRunCoordinator.ts:1174-1179`
**Apply to:** already applied to both payloads.

## Test Conventions

**Location:** `tests/services/ai/office/` (not co-located `__tests__` for the AI Office area; `src/services/ai/__tests__/` holds only `oracleSqlclService.test.ts` and `sshFsToolService.test.ts`).

**Nearest existing tests:**
- `tests/services/ai/office/teamTools.test.ts` — real Dexie via `new TaskPlannerDatabase('TestTeamTools_' + random)`, `ctx()` helper building `TeamToolContext`, `afterEach` closes+deletes the DB. Header `// @vitest-environment node`.
- `tests/services/ai/office/teamRunCoordinator.test.ts` — `createHarness({ scripts: { [LEAD_MODEL]: ... } })`, captures `options.tools` per turn. Oracle gate test at :1610-1646.
- `tests/services/ai/office/teamPrompts.test.ts` — exact-string assertions on prompt parts.
- `src/services/__tests__/gitRemoteService.test.ts` — `vi.mock('../sshService')` with `execRemoteCommand`/`getSshConfigById`/`getSshSecret` mocked; asserts `escapeShellArg("'; rm -rf /; echo '")`. This is the file to copy for the injection test.

**Required tests (CONTEXT §Specific Ideas):**
1. `filePath` containing `; rm -rf /` → escaped, command not executed. Mock `execRemoteCommand`, assert the command string contains the escaped form and no bare `;`.
2. Unlinked `systemId` → `SYSTEM_NOT_LINKED`.
3. No linked system with `remoteRepoPath` → `NO_LINKED_REPO`.
4. Every result carries the untrusted label (assert `DỮ LIỆU KHÔNG ĐÁNG TIN` present).
5. `isMutationTool('git_read') === false` and `MUTATION_TOOLS` does not contain it.

**Test run convention (project forbids full suite — takes >1h):**
```
npx vitest run tests/services/ai/office/teamTools.test.ts tests/services/ai/office/teamPrompts.test.ts tests/services/ai/office/teamRunCoordinator.test.ts
```
Scoped paths only, as in `41-04-SUMMARY.md:64-67`.

## No Analog Found

None. Every file has an in-repo precedent.

## Metadata

**Analog search scope:** `src/services/ai/office/`, `src/services/ai/`, `src/services/`, `src/types/`, `src/workbench/toolwindows/`, `tests/services/ai/office/`, `src/services/__tests__/`
**Files scanned:** 14 read in full or in targeted ranges
**Pattern extraction date:** 2026-11-15
