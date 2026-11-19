# Phase 47: SSH Remote Explorer Search & AI Code Understanding - Pattern Map

**Mapped:** 2026-11-19
**Files analyzed:** 32 (new + modified, from CONTEXT canonical_refs and RESEARCH Validation Architecture)
**Analogs found:** 32 / 32 (this is a feature-composition phase — for every MODIFIED file the closest analog is the file itself, i.e. the existing seam being extended; for the 2 NEW files the nearest real analog is named)

> **How to read this map.** Phase 47 adds no new feature tree and no new packages. Almost every file already exists and is git-TRACKED; the planner's job is to *extend seams*, not scaffold. For those files, "Analog" = the file's current implementation (the lines cited are the exact insertion/extension points). All analog paths below were verified with `git ls-files --error-unmatch` and are tracked source. The two genuinely new files (`RemoteSelectionAnchor.ts`, `remoteScope.test.ts`) get a nearest-analog substitution. Every code excerpt below was read from the tracked file this session with verbatim line numbers.

## File Classification

### Wave 1 — Foundation: scope-type widening + structured anchor (do first)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/types/models.ts` | model (type config) | CRUD/persistence contract | itself, `src/types/models.ts:223` (`ChatScopeType`) | exact (self) |
| `src/db/repositories/chatTabRepo.ts` | repository / whitelist | CRUD | itself, `threadScopeParts` at `:29-37` | exact (self) |
| `src/db/repositories/chatRepo.ts` | repository / key builder | CRUD | itself, `buildScopeKey` at `:41-46` | exact (self) |
| `src/db/index.ts` | config / migration | batch (schema upgrade) | itself, V20 repair set at `:579-595` | exact (self) |
| `src/validation/backupSchemas.ts` | validation (Zod) | transform / file-I/O boundary | itself, `uuidSchema` `:34-38` + enum `:175` | exact (self) |
| `src/services/backup/restoreBackup.ts` | service (restore) | file-I/O | itself, scope reconstruction `:131-132` | exact (self) |
| `src/services/backup/validateBackup.ts` | service (validation) | file-I/O | itself, document referential check `:438-450` | exact (self) |
| `src/components/ai/ScopePickerModal.tsx` | component (modal) | request-response (UI) | itself, local `ScopeTab`/`ScopeListItem` `:26-36` | exact (self) |
| `src/context/AIChatContext.tsx` | provider / context | event-driven (scope activation) | itself, `ActiveScope` `:4-8` + activation `:139-144` | exact (self) |
| `src/services/ai/contextGrounding.ts` | service (transform) | transform (prompt assembly) | itself, `BuildItemContextPromptOptions` `:154-159` | exact (self) |
| `src/utils/selectionContext.ts` | utility (transform) | transform (DOM→context) | itself, `AIContextEntityType` `:8` + `getDomContextFromNode` `:59-92` | exact (self) |
| `src/utils/uuid.ts` | utility | transform (ID) | itself, `generateId`/`isValidUuid` `:5-19` | exact (self, reference only — no edit expected) |
| `src/components/ai/RemoteSelectionAnchor.ts` **(NEW)** | model + utility (anchor) | transform (DOM→structured) | `src/utils/selectionContext.ts` (`:8-23`, `:59-92`) + `src/workbench/editor/RemoteFileViewer.tsx` (`:344-381`) | role-match (partial — new shape) |
| `tests/ai/remoteScope.test.ts` **(NEW)** | test (unit) | batch | `tests/ai/chatRepo.test.ts` (`:1-72`) + `tests/validation/backupSchemas.test.ts` | role-match (test harness) |

### Wave 2 — Explorer search + open-at-line

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/workbench/toolwindows/RemoteGitExplorer.tsx` | component (tool window) | request-response → remote tree/grep | itself, target state `:121-138` + tab open `:388-407` | exact (self) |
| `src/workbench/editor/RemoteFileViewer.tsx` | component (editor/viewer) | request-response + DOM selection | itself, code DOM `:333-382`, props `:19-26` | exact (self) |
| `src/workbench/store/layoutStore.ts` | store (Zustand) | event-driven (tab state) | itself, `openTab` one-shot pattern `:169-204` | exact (self) |
| `src/workbench/EditorArea.tsx` | component (router/registry) | request-response | itself, `remote_file` case `:601-602` | exact (self, likely no edit) |
| `src/services/gitRemoteTreeService.ts` | service (git/integration) | CRUD (read) / file-I/O | itself, `getRemoteTree` + `confineRepoPath` `:137-153` | exact (self, reference — reuse as-is) |
| `src/services/gitRemoteService.ts` | service (integration) | CRUD (read) / streaming | itself, `grepRemoteRef` `:390-420` | exact (self, reference — reuse as-is) |
| `src/workbench/__tests__/RemoteGitExplorer.test.tsx` | test (component) | batch | itself, mock setup `:1-59` | exact (self, extend) |
| `src/workbench/__tests__/RemoteFileViewer.test.tsx` | test (component) | batch | itself, render harness `:1-60` | exact (self, extend) |

> **Correction to RESEARCH Wave 0 gap:** `src/workbench/__tests__/RemoteFileViewer.test.tsx` **already exists and is git-tracked** (60+ lines, full render harness with `mockConfig`/`sampleCode`, `getRemoteFileContent` spy). RESEARCH marked it "❌ Wave 0 new" — the planner should **extend** it, not create it. Only `tests/ai/remoteScope.test.ts` is genuinely new.

### Wave 3 — Explicit remote target for read tools + remote-scope grounding

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/services/ai/aiTools.ts` | service (tool dispatch) | request-response / event-driven | itself, `ExecuteAiToolOptions` `:2267-2278` + dispatch `:2313-2340` | exact (self) |
| `src/services/ai/sshFsToolService.ts` | service (integration) | CRUD (read) / file-I/O | itself, `resolveSshConfig` `:62-86`, `shellQuote` `:36-38`, grep `:241-324` | exact (self) |
| `src/types/sshFsTool.ts` | model (config type) | config contract | itself, `SshFsToolConfig` `:1-18` | exact (self) |
| `src/services/ai/office/teamTools.ts` | service (git_read) | CRUD (read) / file-I/O | itself, action enum `:357-369`, `resolveGitRepo` `:1185-1214`, dispatch `:1825-1826` | exact (self) |
| `src/services/ai/chatTurnTools.ts` | service (allowlist/gate) | request-response | itself, `getToolsForTurn` `:104-113`, SSH enablement `:70-91` | exact (self) |
| `src/components/ai/AIChatDrawer.tsx` | component (drawer/orchestrator) | request-response + streaming + event-driven | itself, `scopeKey` `:436-444`, tool gate `:1863-1880`, citation `:2113-2127` | exact (self) |
| `tests/ai/chatTurnTools.test.ts` | test (unit) | batch | itself (extend) | exact (self, extend) |
| `tests/services/__tests__/gitRemoteReadPipeline.test.ts` | test (unit/integration) | batch | itself, real-git harness `:1-53` | exact (self, extend) |

### Wave 4 — Inline popover + citation navigation

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/components/ai/InlineAISelectionBar.tsx` | component (popover) | event-driven + streaming | itself, activation `:143-246`, `handleMentionToDrawer` `:248-294`, inline loop `:297-421` | exact (self) |
| `src/services/ai/groundedAnswerSchemas.ts` | validation (Zod) | transform / persistence | itself, `PersistedCitationSchema` `:140-177` | exact (self, reference — prefer render-only, likely no edit) |
| `tests/ai/AIChatDrawerIsolation.test.tsx` | test (component) | batch | itself (extend, scope auto-activation) | exact (self, extend) |
| `tests/ai/AIChatDrawerTabs.test.tsx` | test (component/unit) | batch | itself (verify reuse of one-tab-per-scope) | exact (self, verify) |
| `tests/ai/ScopePickerModal.test.tsx` | test (component) | batch | itself (extend, remote entry) | exact (self, extend) |
| `tests/ai/chatRepo.test.ts` | test (unit) | batch | itself, scope-key tests `:13-58` | exact (self, extend) |
| `tests/validation/backupSchemas.test.ts` | test (unit) | batch | itself (extend, `remote` enum round-trip) | exact (self, extend) |
| `tests/services/backup/validateBackup.test.ts` | test (unit) | batch | itself (verify no new referential check) | exact (self, verify) |

**Coverage:** 2 new files, 30 modified/verified files, 0 with no analog at all (the 2 new files have strong nearest analogs).

---

## Pattern Assignments

### Wave 1 foundation — the scope-type union and its whitelists

### `src/types/models.ts` (model, persistence contract)

**Analog:** itself — this IS the source of truth to widen.

**Current union** (line 223):
```typescript
export type ChatScopeType = 'global' | 'task' | 'cr' | 'system' | 'document' | 'team';
```
**Action:** add `'remote'`. `ChatThread.scopeKey` comment (line 227) lists the encodings — update to include `remote:<uuid>`. `entityId` stays the UUID target id.

---

### `src/db/repositories/chatRepo.ts` (repository, CRUD)

**Analog:** itself — `buildScopeKey` (lines 41-46). **No logic change expected** — it already produces `${scopeType}:${entityId}` generically, so `buildScopeKey('remote', <uuid>)` yields `remote:<uuid>` for free.

```typescript
export function buildScopeKey(scopeType: ChatScopeType, entityId?: string): string {
  if (scopeType === 'global' || !entityId) {
    return 'global';
  }
  return `${scopeType}:${entityId}`;
}
```
**Action:** verify with a focused test; only add `remote` typing implications via `models.ts`. The UUID constraint on `entityId` is the reason remote keys use a target-UUID, not a raw path (see Shared Patterns → Scope key encoding).

---

### `src/db/repositories/chatTabRepo.ts` (repository/whitelist, CRUD)

**Analog:** itself — `threadScopeParts` (lines 29-37). This is the most dangerous missed-whitelist site (string compare, not type-checked).

```typescript
export function threadScopeParts(scopeKey: string, fallback?: ChatScopeInput): Pick<ChatThread, 'scopeType' | 'entityId'> {
  const [scopeType, entityId] = scopeKey.split(':', 2);
  if (scopeKey === 'global') return { scopeType: 'global' };
  if (fallback) return { scopeType: fallback.scopeType, ...(fallback.entityId ? { entityId: fallback.entityId } : {}) };
  if (scopeType === 'task' || scopeType === 'cr' || scopeType === 'system' || scopeType === 'document' || scopeType === 'team') {
    return { scopeType, ...(entityId ? { entityId } : {}) };
  }
  return { scopeType: 'global' };
}
```
**Action:** add `|| scopeType === 'remote'` to the explicit whitelist on line 33. Without this, a remote thread silently falls back to `global` history.

---

### `src/db/index.ts` (config/migration, batch)

**Analog:** itself — V20 repair set (lines 579-595).

```typescript
const valid = new Set(['global', 'task', 'cr', 'system', 'document', 'team']);
```
**Action:** decide whether to add `'remote'` to this repair `Set`. This is a historical repair migration that runs once; adding `remote` is forward-safe and prevents a restored row from being rewritten to `global`. Follow the V20 comment's own guidance (lines 574-578): the whole class of bug is "app's own export unrestorable." Prefer adding a NEW version migration rather than editing an applied one if the repair semantics must stay frozen — planner discretion; at minimum test the round-trip.

---

### `src/validation/backupSchemas.ts` (validation/Zod, file-I/O boundary)

**Analog:** itself — two spots.

UUID constraint (lines 34-38):
```typescript
const uuidSchema = z
  .string()
  .refine(isValidUuid, {
    message: 'Must be a valid RFC 4122 v4 UUID',
  });
```
Scope enum (line 175):
```typescript
    scopeType: z.enum(['global', 'task', 'cr', 'system', 'document', 'team']),
    entityId: uuidSchema.optional(),
```
**Action:** add `'remote'` to the enum. Because `entityId` is `uuidSchema.optional()`, a remote scope's `entityId` MUST be a v4 UUID (target-UUID encoding — see Pitfall 1). The existing `.refine()` on lines 181-192 only requires `entityId` for `document`; remote needs no new refine (a remote scope with no entityId is harmless — confirm in planner).

---

### `src/services/backup/restoreBackup.ts` (service, file-I/O)

**Analog:** itself — scope reconstruction (lines 131-132).

```typescript
        scopeType: scopeKey === 'global' ? 'global' : (scopeKey.split(':')[0] as ChatThread['scopeType']),
        ...(scopeKey.split(':')[1] ? { entityId: scopeKey.split(':')[1] } : {}),
```
**Action:** likely **no edit** — the cast already parses `remote:<uuid>` correctly once the union includes `remote`. Verify via round-trip test. Watch A1/Open Question 3: after restore, the bare target-UUID must resolve back to `{sshConfigId, repoPath, branch}` from live layout state (deferred-persistence semantics), not from the backup.

---

### `src/services/backup/validateBackup.ts` (service, file-I/O)

**Analog:** itself — document referential check (lines 438-450).

```typescript
  // Check document-scoped chatThreads refer to existing note
  if (chatThreads) {
    chatThreads.forEach((ct) => {
      if (ct.scopeType === 'document' && ct.entityId && !noteIds.has(ct.entityId)) {
```
**Action:** verify **no new referential check needed** for `remote` (its UUID entity is not a DB row — it maps to live SSH layout state). Do not add a `notes.get()`-style check for remote entities.

---

### `src/components/ai/ScopePickerModal.tsx` (component/modal, request-response)

**Analog:** itself — local scope types (lines 26-36), list construction (`:74-149`), select handler (`:151-169`), icon switch (`:171-182`).

```typescript
type ScopeTab = 'all' | 'task' | 'cr' | 'system';

interface ScopeListItem {
  id: string;
  type: 'global' | 'task' | 'cr' | 'system';
  ...
}
```
**Action:** widen local `ScopeListItem.type` to include `'remote'`, add a `remote` `ScopeTab` option, build a remote entry from the active target (SSH config/repo/branch/folder), and add a `getIcon` case. Follow the existing `useLiveQuery` + `useMemo<ScopeListItem[]>` filteredItems pattern (lines 61-149) and `handleSelect` → `onSelectScope({type, id, title})` (lines 151-162). Note `id` must be the target-UUID (not a raw path) to satisfy backup validation.

---

### `src/context/AIChatContext.tsx` (provider/context, event-driven)

**Analog:** itself — `ActiveScope` (lines 4-8) and activation precedence (lines 139-144).

```typescript
export interface ActiveScope {
  type: ChatScopeType;
  id?: string | undefined;
  title?: string | undefined;
}
```
```typescript
  const registeredTop = registeredItemsRef.current[registeredItemsRef.current.length - 1];
  const activeScope: ActiveScope = customScope ?? (registeredTop ? { ...registeredTop } : { type: 'global' });
```
**Action:** `ActiveScope.type` widens automatically via the union. For D-08 auto-activation, use `registerActiveItem({type:'remote', id:targetUuid, title})` from the viewer/explorer (pushes onto the stack, so a manual `customScope` still wins per D-08), NOT `setCustomScope`. This is the exact precedence rule in the comment on lines 139-144 and the Pitfall 5 mitigation.

---

### `src/services/ai/contextGrounding.ts` (service, transform)

**Analog:** itself — `BuildItemContextPromptOptions` (lines 154-159).

```typescript
export interface BuildItemContextPromptOptions {
  entityType: 'task' | 'cr' | 'system';
  item: Task | ChangeRequest | System;
  db?: TaskPlannerDatabase | undefined;
  charLimit?: number | undefined;
}
```
**Action:** add a remote-target serialization path for D-07 (target identity + selection anchors serialized into the prompt host-side). Follow the `<item_context type="..." id="...">` XML serialization and `MAX_CONTEXT_CHAR_LIMIT` clamp pattern used by `buildItemContextPrompt` (lines 165-188). Do NOT fabricate a `Task`/`System` cast — add a distinct remote block. Prefer a new serializer function beside `serializeSystemContext` (`:109`) over widening this union if the remote shape differs substantially.

---

### `src/utils/selectionContext.ts` (utility, transform)

**Analog:** itself — entity type (line 8), DOM extraction (`:59-92`), hierarchy resolution (`:99-277`), mention formatting (`:282-296`).

```typescript
export type AIContextEntityType = 'doc' | 'note' | 'task' | 'cr' | 'system' | 'unknown';
```
**Action:** introduce a distinct remote-anchor branch (Pitfall 4 — never fabricate `doc`). Either extend `AIContextEntityType` with `'remote'` and teach `getDomContextFromNode` (lines 64-86) to read remote `data-ai-context-*` attributes off the viewer, or add a parallel handler. `formatSelectionMentionPrompt` (`:282-296`) is the reusable mention-format pattern; extend it to include `path:line` in the header for remote anchors.

---

### `src/components/ai/RemoteSelectionAnchor.ts` **(NEW)** (model + utility, transform)

**Nearest analog:** `src/utils/selectionContext.ts:8-23` (anchor shape) + `src/workbench/editor/RemoteFileViewer.tsx:344-381` (fixed 20px line divs + gutter).

**Shape to define** (D-11): `{ targetIdentity (targetUuid + sshConfigId/repoPath/branch), relativeFilePath, startLine, endLine, selectedText }`.

**DOM→line mapping pattern to copy** — the viewer's own structure makes this deterministic:
```tsx
// RemoteFileViewer.tsx:344-363 — gutter
<div data-testid="line-numbers-gutter" ...>
  {lines.map((_, idx) => (
    <div key={idx} style={{ height: 20 }}>{idx + 1}</div>
  ))}
</div>
// RemoteFileViewer.tsx:376-380 — code lines, same index, height 20
{lines.map((line, idx) => (
  <div key={idx} style={{ height: 20 }}>
    <DiffLineCodeRenderer content={line} isDark={isDark} />
  </div>
))}
```
**Extraction pattern to copy** — `selection.anchorNode`/`focusNode` → line index: `getDomContextFromNode` (selectionContext.ts:59-92) shows the upward-DOM-traversal idiom via `element.getAttribute('data-ai-context-type'/'data-ai-context-id')`. Read those attributes off a per-line wrapper the viewer adds; map `anchorNode.parentElement` to its line `<div>` and read its line-number attribute. Use the fixed `lineHeight: '20px'` (viewer line 340) as a fallback for `focusNode` in a different line.

---

### `tests/ai/remoteScope.test.ts` **(NEW)** (test, unit)

**Nearest analog:** `tests/ai/chatRepo.test.ts:1-72` (fake-indexeddb harness + scope-key assertions).

**Harness to copy:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../src/db';
...
  beforeEach(async () => {
    db = new TaskPlannerDatabase(`test-chat-db-${Date.now()}-${Math.random()}`);
  });
```
**Tests to include:** `remote:<uuid>` survives `threadScopeParts` → `buildScopeKey` → `BackupChatThreadRecordSchema` → `restoreBackup` (Pitfall 2); a non-UUID path-segment `entityId` is rejected by `uuidSchema`; auto-activation precedence (manual `customScope` wins over `registerActiveItem`). Cross-ref the Zod enum test style in `tests/validation/backupSchemas.test.ts`.

---

### Wave 2 — Explorer search + open-at-line

### `src/workbench/toolwindows/RemoteGitExplorer.tsx` (component, request-response → remote)

**Analog:** itself — target state (lines 121-138), `loadRootTree` (`:233-271`), tab open (`:388-407`), controls JSX (`:421-500`).

**Target source of truth (D-02)** — reuse these exact store selectors; do not invent a new target picker:
```typescript
  const openTab = useLayoutStore((s) => s.openTab);
  const activeRemoteConfigId = useLayoutStore((s) => s.activeRemoteConfigId);
  const activeRemoteRepoPath = useLayoutStore((s) => s.activeRemoteRepoPath);
  const activeRemoteBranch = useLayoutStore((s) => s.activeRemoteBranch);
```

**Name search:** filter the already-built `treeData` (set at line 262) or call `getRemoteTree(...)` (lines 252-258) — do NOT fetch whole files into the renderer.

**Content search:** reuse `grepRemoteRef` (see `src/services/gitRemoteService.ts` pattern below) and render `RemoteGrepHit` (`{path, line, text}`) as `path:line:text` with a bounded hit count (D-04).

**Tab-open + initial line** — extend the existing `handleSelectNode` param bag (lines 392-406):
```typescript
    const rawTitle = node.rawNode?.title || (node.title as string) || node.key.toString();
    openTab({
      id: `remote:${node.key}`,
      title: rawTitle,
      viewType: 'remote_file',
      closable: true,
      params: {
        config: selectedConfig,
        repoPath: repoPath.trim(),
        branch: selectedBranch,
        filePath: node.key as string,
        size: node.size,
        gitStatus: node.gitStatus,
      },
    });
```
Add `initialLine`/highlight params here for both result-click and citation-click paths. Keep `id: remote:<path>` stable.

---

### `src/workbench/editor/RemoteFileViewer.tsx` (component, request-response + DOM selection)

**Analog:** itself — props (`:19-26`), 2MB guard (`:28`, `:58`), code DOM (`:333-382`).

**Props extension (D-04):** add optional `initialLine?: number` (and/or highlight token) to `RemoteFileViewerProps` (lines 19-26). `EditorArea` already spreads `tab.params` into the viewer, so no router change is needed.

**Initial-line highlight pattern:** the numbered-line render at lines 358-362 (gutter) and 376-380 (code) is the hook — give the target line a highlight style and scroll it into view in a `useEffect` keyed on `initialLine`.

**Selection anchor exposure (D-09/D-11):** wrap each line `<div>` (line 377) with `data-ai-context-type="remote"` and per-line identity attributes (`data-remote-path`, `data-remote-line`, plus target identity on the `code-container` at line 334) so `InlineAISelectionBar`/`RemoteSelectionAnchor` can extract a structured anchor. Keep `data-testid="code-container"` and `data-testid="line-numbers-gutter"` stable — tests rely on them.

**Read-only invariant:** preserve the `readonly-badge` (`:198-211`) and 2MB guard (`:58`) unchanged; D-09 forbids remote writes.

---

### `src/workbench/store/layoutStore.ts` (store, event-driven)

**Analog:** itself — `openTab` one-shot param clear (lines 169-204).

```typescript
                const mergedParams = { ...t.params, ...tab.params };
                if ('targetMessageId' in mergedParams && !('targetMessageId' in (tab.params ?? {}))) {
                  delete mergedParams.targetMessageId;
                }
                return { ...t, title: tab.title || t.title, params: mergedParams };
```
**Action:** mirror this exact one-shot-clear pattern for `initialLine`/highlight (Pitfall 3) — otherwise reopening `remote:<path>` from the tree lands on a stale searched line. Prefer a generic one-shot list over copying the branch verbatim. `openTab` already caps tabs at 20 (`:188-198`) and merges params on reopen.

---

### `src/workbench/EditorArea.tsx` (component/registry, request-response)

**Analog:** itself — `remote_file` case (lines 601-602).

```tsx
      case 'remote_file':
        return <RemoteFileViewer {...tab.params} />;
```
**Action:** likely **no edit** — params already flow through. Verify that the new `initialLine`/highlight param reaches `RemoteFileViewerProps` without a type error (params is loosely typed).

---

### Reference services (reuse as-is, no new implementation)

**`src/services/gitRemoteService.ts` — `grepRemoteRef` (lines 390-420):**
```typescript
  const limit = Math.min(Math.max(1, Math.floor(Number(options.limit)) || 50), 200);
  const flags = ['-z', '-n', '-I', '--no-color'];
  if (options.literal) flags.push('-F');
  flags.push(options.caseSensitive === false ? '-i' : '--no-ignore-case');
  const parts = [
    `git -C ${escapeShellArg(repoPath)} -c core.fsmonitor=false --no-pager grep ${flags.join(' ')}`,
    `-e ${escapeShellArg(options.pattern)}`,
    '--end-of-options',
    escapeShellArg(ref),
  ];
```
Bounded (cap 200), escaped (`escapeShellArg`, `-e`, `--end-of-options`), byte-capped (`GREP_BYTE_CAP`, line 382). Return shape is `RemoteGrepHit` (`src/types/gitRemote.ts:60-64`) — exactly D-04's `path:line:text`.

**`src/services/gitRemoteTreeService.ts` — `confineRepoPath` (lines 137-153):** normalizes `..` before the escape check; reuse for any search path sub-scope. `getRemoteTree` (used in the explorer) is the name-search source.

---

### Test analogs (Wave 2)

**`src/workbench/__tests__/RemoteGitExplorer.test.tsx` (extend)** — copy the spy harness at lines 1-59: `vi.spyOn(sshService,'getSshConfigs'/'getSshSecret')`, `vi.spyOn(gitRemoteService,'getRemoteBranches')`, `vi.spyOn(gitRemoteTreeService,'getRemoteTree')`, `useLayoutStore.getState().resetLayout()`. Add `grepRemoteRef` spy for content-mode and assert `openTab` called with `remote:<path>` + line params.

**`src/workbench/__tests__/RemoteFileViewer.test.tsx` (extend — EXISTS)** — copy render harness at lines 1-60 (`mockConfig`, `sampleCode`, `AntdThemeAdapter`, `getRemoteFileContent` spy). Add: initial-line highlight/scroll and structured selection anchor extraction.

---

### Wave 3 — Explicit remote target for read tools + grounding

### `src/services/ai/aiTools.ts` (service, dispatch/request-response)

**Analog:** itself — options bag (lines 2267-2278) and dispatch switch (`:2313-2340`).

```typescript
export interface ExecuteAiToolOptions {
  crScopeId?: string;
  callId?: string;
}
```
```typescript
      case 'ssh_list_dir': {
        return await executeSshListDir(args as any, db);
      }
      case 'ssh_read_file_page': {
        return await executeSshReadFile(args as any, db);
      }
      case 'ssh_grep_files': {
        return await executeSshGrepFiles(args as any, db, options?.callId);
      }
```
**Action:** add `remoteTarget?: { sshConfigId; repoPath; branch }` to `ExecuteAiToolOptions` and pass it into the three SSH exec functions (D-13 injection seam). Preserve the existing `crScopeId`/`callId` callers (global chat, team agents, Telegram) unchanged. Keep the read-only gating at `isMutationTool` (`:5135-5144`) and `SSH_READ_TOOLS` (`:5119-5121`) intact.

---

### `src/services/ai/sshFsToolService.ts` (service, integration/file-I/O)

**Analog:** itself — `resolveSshConfig` (lines 62-86), `shellQuote` (`:36-38`), grep exec (`:241-324`).

```typescript
async function resolveSshConfig(
  db: TaskPlannerDatabase,
): Promise<{ fsConfig: SshFsToolConfig; sshConfig: SshConfig }> {
  const fsConfig = await getSshFsToolConfig(db);
  ...
  const sshConfig = await getSshConfigById(fsConfig.sshConfigId, db);
  ...
  return { fsConfig, sshConfig };
}
```
**Action:** let `resolveSshConfig` accept an optional explicit target and **prefer it** over the global config (D-13). The model must not override it with a different host (Security Domain V4). Keep all three exec functions' escaping and caps:
```typescript
export function shellQuote(str: string): string {
  return `'${str.replace(/'/g, `'\\''`)}'`;
}
```
Grep cap (lines 258-261): `Math.min(Math.max(1, Number(args.limit) || fsConfig.maxGrepMatches || 50), 100)`. `path` confinement via `resolveRemotePath` (`:89-99`) + `confineRepoPath`.

---

### `src/types/sshFsTool.ts` (model/config type)

**Analog:** itself — `SshFsToolConfig` (lines 1-18): `sshConfigId`, `defaultBasePath?`, `maxLinesPerRead?`, `maxListEntries?`, `maxGrepMatches?`, `SSH_FS_TOOL_CONFIG_KEY`.

**Action:** define the explicit remote-target type here (or in `aiTools.ts`) shared by the dispatch injection. Do not add a new config storage key — the target comes from chat scope, not persisted settings.

---

### `src/services/ai/office/teamTools.ts` (service/git_read, file-I/O)

**Analog:** itself — action enum (lines 357-369), `resolveGitRepo` (`:1185-1214`), dispatch (`:1825-1826`).

```typescript
    case 'git_read':
      return gitRead(input, ctx);
```
```typescript
          enum: [
            'branches', 'status', 'log', 'diff_summary',
            'diff_file', 'read_file', 'tree', 'grep',
          ],
```
**Action:** feed the chat-context remote target as a first-class resolution source in `resolveGitRepo` (currently: explicit selectors → turn hints → linked systems; lines 1191-1214), with explicit target **winning** over model-supplied selectors. `gitRead` handler at line 1454; it already imports `confineRepoPath` (line 29). Note: `git_read` is a **team tool**, not in `AI_DATABASE_TOOLS` — Open Question 1/A2: planner must decide whether to expose it to the ordinary `AIChatDrawer` remote turn (new remote-scope dispatch path) or rely on the SSH FS trio alone. Keep team callers unchanged.

---

### `src/services/ai/chatTurnTools.ts` (service, allowlist/gate)

**Analog:** itself — `getToolsForTurn` (lines 104-113), SSH enablement (`:70-91`).

```typescript
export function getToolsForTurn(
  ...
  disabledToolNames: ReadonlySet<string> = new Set()
```
```typescript
    ...(sshEnabled ? SSH_READ_TOOLS : []),
```
**Action:** ensure an active remote scope keeps SSH read tools enabled even when global SSH FS config is absent (Pitfall 6). The actual gate is built in `AIChatDrawer` (below); this is the allowlist layer. Preserve `disabledToolNames` filtering semantics.

---

### `src/components/ai/AIChatDrawer.tsx` (component, orchestrator)

**Analog:** itself — scope key (`:436-444`), tool gating (`:1863-1880`), citation wiring (`:2113-2127`).

```typescript
  const currentScope: ActiveScope = isDetached || !internalScope
    ? { type: 'global' }
    : internalScope;
  const scopeKey = buildScopeKey(currentScope.type, currentScope.id);
```
```typescript
      const sshReady = Boolean(sshFsCfg?.sshConfigId);
      const oracleReady = Boolean(oracleCfg?.sshConfigId && oracleCfg?.connectionString);
      const disabledToolNames = new Set<string>([
        ...(sshReady ? [] : SSH_READ_TOOLS.map((t) => normalizeToolName(t.function.name))),
        ...(oracleReady ? [] : ORACLE_READ_TOOLS.map((t) => normalizeToolName(t.function.name))),
      ]);
```
```typescript
    onCitationActivate: (c) => setActivePreviewCitation(c),
```
**Actions:**
1. **Remote scope grounding (D-07):** when `currentScope.type === 'remote'`, serialize target identity + selection anchors from remote layout state into the prompt (reuse `contextGrounding` pattern) and pass `remoteTarget` into `executeAiTool` options.
2. **Tool gating (Pitfall 6):** treat an active remote target as SSH-ready for that turn; keep `disabledToolNames` empty for SSH tools in remote scope even if `sshFsCfg` is null. Add remote-target resolution alongside `getSshFsToolConfig`.
3. **Citation navigation (D-12, Pitfall 7):** add a remote-citation `onCitationActivate` path that calls `layoutStore.openTab` with `{config, repoPath, branch, filePath, initialLine}` — keep the existing `setActivePreviewCitation` document path unchanged. Recommend render-only chips (Open Question 2).

---

### Test analogs (Wave 3)

**`tests/ai/chatTurnTools.test.ts` (extend):** assert explicit-target dispatch and that remote scope keeps SSH tools enabled.

**`tests/services/__tests__/gitRemoteReadPipeline.test.ts` (extend):** real-git harness at lines 1-53 (`spawnSync`, temp sandbox, `git -C`). Add confinement regression (`../` and leading-`-` payloads) and an explicit-target assertion; do not run the full suite.

---

### Wave 4 — Inline popover + citation

### `src/components/ai/InlineAISelectionBar.tsx` (component, event-driven + streaming)

**Analog:** itself — activation (`:143-246`), doc/note gate (`:195-203`), `handleMentionToDrawer` (`:248-294`), inline loop (`:297-421`), toolbar JSX (`:480-572`).

**Doc/note-only gate to adapt (Pitfall 4):**
```typescript
        const domContext = getDomContextFromNode(anchorNode);
        // Only activate inline AI toolbar for documents and notes
        if (domContext.entityType !== 'doc' && domContext.entityType !== 'note') {
          if (!isAskingInline) {
            setVisible(false);
            setSelectionRect(null);
          }
          return;
        }
```
**Action:** branch to accept a remote anchor (from `RemoteSelectionAnchor.ts`) alongside doc/note, building a remote `SelectionContextPayload` that carries `path:line` instead of calling `resolveEntityHierarchy` with a fake doc id (lines 205-210).

**`Open in Chat` (D-10)** — reuse `handleMentionToDrawer` (`:248-294`), which calls `openChatWithDraft({type, id, title}, prompt)`. Extend the scope-selection ladder (lines 254-282) with a remote scope branch (`type:'remote'`, `id: targetUuid`).

**`Explain`/`Ask` (D-09/D-10)** — reuse `handleRunInlinePrompt` (`:297-421`), already a bounded read-only tool loop:
```typescript
const READ_ONLY_AI_TOOLS = AI_DATABASE_TOOLS.filter((t) => !isMutationTool(t.function.name));
...
      let loopCount = 0;
      const MAX_LOOPS = 3;
```
Feed the remote anchor's target into the tool calls (Wave 3 injection); keep `MAX_LOOPS = 3` and `streamChatEvents`/`stripThinkingBlocks` (`:21`). Popover positioning math `calculatePopupPosition` (`:44-69`) already handles viewport clamping — reuse as-is.

---

### `src/services/ai/groundedAnswerSchemas.ts` (validation/Zod, persistence)

**Analog:** itself — `PersistedCitationSchema` (lines 140-177).

```typescript
export const PersistedCitationSchema = z
  .strictObject({
    citationId: CitationIdSchema,
    documentId: z.string(),
    documentTitle: z.string().min(1).max(400),
    sectionAnchor: ...
    authority: z.enum(['server', 'local']),
    evidenceClass: ...
```
**Action:** **prefer no edit** — this is a `strictObject` tied to document grounding. Per Open Question 2, make D-12 remote `path:line` citations **render-only** chips carrying `{targetUuid, relativePath, line}`, with click → `layoutStore.openTab`. Only extend this schema if the owner requires durable remote citations.

---

### Test analogs (Wave 4)

**`tests/ai/AIChatDrawerIsolation.test.tsx` (extend):** scope auto-activation precedence (D-08) — remote scope activates on open/selection, manual `customScope` still wins.

**`tests/ai/AIChatDrawerTabs.test.tsx` (verify):** remote scope reuses one-active-tab-per-scope invariant (D-05).

**`tests/ai/ScopePickerModal.test.tsx` (extend):** remote target entry lists/selects.

**`tests/ai/chatRepo.test.ts` (extend):** add `buildScopeKey('remote', uuid)` assertion to the scope-key test block (lines 20-25).

**`tests/validation/backupSchemas.test.ts` (extend):** `remote` enum + UUID `entityId` round-trip.

**`tests/services/backup/validateBackup.test.ts` (verify):** backup still validates with a remote-scoped thread present.

---

## Shared Patterns

### Scope key encoding (D-06 / Pitfall 1) — apply to every scope-touching file

**Source:** `src/utils/uuid.ts:5-19` + `src/db/repositories/chatRepo.ts:41-46` + `src/validation/backupSchemas.ts:34-38,175`.
**Apply to:** `models.ts`, `chatRepo.ts`, `chatTabRepo.ts`, `backupSchemas.ts`, `restoreBackup.ts`, `ScopePickerModal.tsx`, `AIChatContext.tsx`, all scope tests.
```typescript
export function generateId(): string {
  return crypto.randomUUID();
}
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
```
**Rule:** a remote scope key MUST be `remote:<v4-uuid>` where the UUID identifies the `{sshConfigId, repoPath, branch/folder}` target. NEVER encode raw paths/branch into the key (`remote:config/path/branch` fails `uuidSchema` on export). Resolve target details from live layout state at use time. Keep the key to a single colon-segment after `remote`.

### The eight-site scope whitelist (D-06 / Pitfall 2) — widen atomically in Wave 1

**Source:** research Pattern 2, all verified this session.
**Apply to:** all of these in ONE wave, then test the full round-trip:
1. `src/types/models.ts:223` (union)
2. `src/db/repositories/chatTabRepo.ts:33` (string whitelist — silent-fallback risk)
3. `src/db/index.ts:582` (V20 repair `Set`)
4. `src/validation/backupSchemas.ts:175` (Zod enum)
5. `src/services/backup/restoreBackup.ts:131` (cast — verify, likely no edit)
6. `src/components/ai/ScopePickerModal.tsx:26,30` (local types)
7. `src/services/ai/contextGrounding.ts:155` (`BuildItemContextPromptOptions.entityType`)
8. `src/utils/selectionContext.ts:8` (`AIContextEntityType`)
Plus verify `src/services/backup/validateBackup.ts:438-450` needs no referential check. Failure mode: app compiles but its own export is unrestorable (V20 migration comment, `db/index.ts:574-578`).

### Read-only + confinement + escaping (D-14) — every remote tool path

**Sources:** `src/services/gitRemoteService.ts:22` (`escapeShellArg`), `:399-411` (`-e`/`--end-of-options`); `src/services/gitRemoteTreeService.ts:137-153` (`confineRepoPath`); `src/services/ai/sshFsToolService.ts:36-38` (`shellQuote`); `src/services/ai/aiTools.ts:5135-5144` (`isMutationTool` gate).
**Apply to:** explorer content search, git_read explicit-target path, all SSH FS tools, inline popover tool loop.
**Rule:** every call stays read-only; confine paths with `confineRepoPath` (normalizes `..`); escape each argument; bound results (grep 200 / read 2000 / list 200; inline `MAX_LOOPS = 3`); explicit target from scope wins over any model-supplied host/path. No shell write/redirect/patch; no headless `explore_repo` (D-15).

### Scope activation precedence (D-08 / Pitfall 5)

**Source:** `src/context/AIChatContext.tsx:125-144`.
**Apply to:** `RemoteFileViewer` / `InlineAISelectionBar` (auto-activate), `ScopePickerModal` (manual).
```typescript
  const activeScope: ActiveScope = customScope ?? (registeredTop ? { ...registeredTop } : { type: 'global' });
```
**Rule:** automatic remote-scope activation uses `registerActiveItem`; explicit user switching uses `setCustomScope`. A persisted manual `customScope` (localStorage) outranks registered items — test both directions.

### One-shot tab params (D-04/D-12 / Pitfall 3)

**Source:** `src/workbench/store/layoutStore.ts:177-184`.
**Apply to:** explorer result-click, chat citation-click, `RemoteFileViewer` initialLine prop.
**Rule:** any `initialLine`/highlight param added on click must be cleared on a plain reopen, mirroring `targetMessageId`. Use `id: remote:<path>` consistently.

### Focused-test discipline (project rule / user memory)

**Sources:** `tests/ai/chatRepo.test.ts:1-18`, `src/workbench/__tests__/RemoteGitExplorer.test.tsx:1-59`, `tests/services/__tests__/gitRemoteReadPipeline.test.ts:1-53`.
**Apply to:** all new/extended test files.
**Rule:** `npx vitest run <single-focused-file>` only — never the full suite (over an hour). Use `fake-indexeddb/auto` for repo tests, `vi.spyOn` for service mocks, `AntdThemeAdapter` wrapper for component tests, `resetLayout()` in `beforeEach` for store isolation. Phase gate adds `npx tsc --noEmit`.

---

## No Analog Found

No file lacks an analog entirely. The two genuinely new files have these partial matches (planner should treat the named analog as the template):

| File | Role | Data Flow | Reason / Nearest Analog |
|------|------|-----------|--------|
| `src/components/ai/RemoteSelectionAnchor.ts` | model + utility | DOM→structured transform | No existing remote-anchor shape; nearest = `src/utils/selectionContext.ts:8-23,59-92` (shape + DOM traversal) combined with `src/workbench/editor/RemoteFileViewer.tsx:344-381` (line divs + gutter). |
| `tests/ai/remoteScope.test.ts` | test | batch | No existing remote-scope test; nearest harness = `tests/ai/chatRepo.test.ts:1-72` + `tests/validation/backupSchemas.test.ts`. |

**Note:** `src/workbench/__tests__/RemoteFileViewer.test.tsx` is NOT a Wave-0 new file despite RESEARCH's "❌" marker — it exists and is git-tracked; extend it.

---

## Metadata

**Analog search scope:** `src/types/`, `src/db/{repositories,index}`, `src/validation/`, `src/services/{ai,ai/office,backup}/`, `src/components/ai/`, `src/context/`, `src/utils/`, `src/workbench/{toolwindows,editor,store,__tests__}/`, `tests/{ai,validation,services}/`.
**Files scanned:** ~40 (all tracked analog candidates from CONTEXT canonical_refs + RESEARCH recommended structure + Validation Architecture).
**Tracked-source gate:** every analog path above verified non-empty via `git ls-files --error-unmatch`; no gitignored mirror paths emitted. No project skills directories present (`.claude/skills`, `.agents/skills`, etc. absent).
**Pattern extraction date:** 2026-11-19.
**Key correction applied:** `src/workbench/__tests__/RemoteFileViewer.test.tsx` exists/tracked (RESEARCH marked it new).
