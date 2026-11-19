# Phase 47: SSH Remote Explorer Search & AI Code Understanding - Research

**Researched:** 2026-11-19
**Domain:** Internal feature work — SSH Remote Explorer UI + existing AI chat/tool plumbing (Tauri renderer, React 19, Dexie, read-only SSH/git service layer)
**Confidence:** HIGH (all discrete values read from source-of-truth files this session; no external packages or docs required)

> **Research method note.** This phase adds no external dependency and asks no question that an outside library could answer — every decision D-01..D-15 concerns existing in-repo seams. Per the research-plan seam I called `classify-confidence --provider grep` (returns `LOW` for the generic external grep provider); that tier governs *web* research and does not apply here. All findings below are grounded in source files opened directly this session and carry `[VERIFIED: path:lines]` with verbatim quotes, per the in-repo value provenance rule. `[ASSUMED]` marks the few forward-looking UX/discretion items the planner must confirm.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Đánh số work này là Phase 47 và tạo artifact riêng trong worktree này. Không sửa `ROADMAP.md` hoặc `STATE.md` chung trong lượt này vì hai session khác đang chạy phase 45 và 46. — **Reversibility:** reversible — chỉ là tách artifact planning, không có migration hay contract nào phụ thuộc.
- **D-02:** Search mặc định chạy trong target đang mở: SSH config + `repoPath` + branch đang chọn. — **Reversibility:** reversible — scope selector có thể thêm sau.
- **D-03:** Search gồm hai chế độ: tên file/folder và nội dung kiểu ripgrep. Cả hai phải trả kết quả có đường dẫn tương đối và click để mở đúng remote file tab hiện tại. — **Reversibility:** costly — thêm chế độ thứ ba hoặc đổi contract kết quả sẽ chạm UI và service.
- **D-04:** Kết quả search content phải hiển thị `path:line:text`, có bound về số hit và hỗ trợ mở file tại dòng đó. — **Reversibility:** costly — viewer cần nhận initial line/highlight contract.
- **D-05:** Không tạo remote AI side panel mới. Dùng lại `AIChatDrawer`, hệ thống context switch, chat tabs/threads và composer hiện có. — **Reversibility:** costly — thay thế bằng panel mới sẽ nhân bản tab/thread/tool-event plumbing.
- **D-06:** Thêm một `ChatScopeType` mới cho remote target. Scope key là target-based, không phải file-based: một entry đại diện cho SSH config/repo/branch/folder hiện tại. — **Reversibility:** costly — chạm type unions, Dexie/BDexie schema/backup validation và mọi nơi whitelist scope.
- **D-07:** Remote context là folder/repo-scoped và có thể chứa nhiều file mention/selection. Câu hỏi không bị giới hạn vào file đang mở; AI có thể trace luồng code qua nhiều file trong target. — **Reversibility:** costly — nếu thu hẹp về per-file sau này sẽ mất khả năng hỏi liên file.
- **D-08:** Khi mở file remote hoặc bôi text trong file, remote context của target đó tự động trở thành active scope trong AI ChatDrawer. User vẫn có thể switch sang context khác bằng scope picker. — **Reversibility:** reversible — policy tự động chọn scope có thể đổi mà không đổi schema.
- **D-09:** File remote vẫn readonly. Selection trong code viewer bật toolbar tại chỗ với ít nhất `Explain`, `Ask`, `Open in Chat`. — **Reversibility:** reversible — label/button set có thể chỉnh mà không đổi mô hình dữ liệu.
- **D-10:** `Explain`/`Ask` trả lời ngắn trong popover cạnh đoạn chọn. `Open in Chat` đưa selection mention vào composer của remote context. — **Reversibility:** reversible — thay đổi hiển thị answer không ảnh hưởng lưu trữ.
- **D-11:** Selection mention là context anchor có cấu trúc: target identity, relative file path, start/end line, selected text. Không gửi đoạn text rời không có path/line. — **Reversibility:** costly — nhiều prompt/tool/citation path sẽ phụ thuộc shape này.
- **D-12:** Câu trả lời có thể trích dẫn `path:line`; click citation mở file remote và highlight/scroll tới dòng tương ứng. — **Reversibility:** costly — cần contract giữa chat render và remote file tab.
- **D-13:** AI dùng lại `git_read` và SSH FS tools hiện có, mở rộng để nhận explicit remote target từ chat context thay vì chỉ dùng config toàn cục. — **Reversibility:** costly — đổi tool schema là đổi contract với model.
- **D-14:** Mọi tool call vẫn read-only, có path confinement trong target/repo, escape argument đúng chuẩn hiện có, và trả kết quả bounded. Không thêm shell write, redirect, patch hoặc arbitrary command. — **Reversibility:** one-way — nếu nới tool thành write sẽ thay đổi mô hình an toàn và không thể thu hồi trust boundary dễ dàng.
- **D-15:** `headless explore_repo` không nằm trong phase này. Ghi nhận là deferred idea. — **Reversibility:** reversible — thêm tool mới sau này không phá contract hiện tại.

### Claude's Discretion
- Implementation details for exact scope type string, scope key encoding, tool argument names, search debounce/regex semantics, result caps, popover sizing, prompt wording, and whether the inline popover itself performs a single read-only tool call are planner/researcher discretion, provided the locked decisions above are preserved.
- Exact Ant Design layout, keyboard shortcuts, and whether search has one input with modes or two tabs are discretionary.

### Deferred Ideas (OUT OF SCOPE)
- Headless `explore_repo` as an optional remote AI tool for broad architecture questions — future phase.
- Persistent remote AI workspace context that survives switching away from the active explorer target — future phase.
- Full remote-path search outside current repo/branch as explicit scope option — future phase.

**Additional binding constraints from the task brief and CLAUDE.md:** Tauri is the only supported runtime for current work; do not add, debug, or validate PWA/GitHub Pages behavior. No full Vitest suite (over an hour) — focused tests only. Do NOT edit `ROADMAP.md` or `STATE.md` (other sessions are running phases 45 and 46). Do not create a new chat panel, do not make remote writes, do not use headless `explore_repo`.

</user_constraints>

<phase_requirements>
## Phase Requirements (decision-to-research map)

No formal requirement IDs were assigned to this phase; CONTEXT.md decisions D-01..D-15 are the source of truth. This table maps each decision to the research finding that enables implementation.

| Decision | Behavior | Research Support |
|----------|----------|------------------|
| D-01 | Isolated Phase 47 artifacts | Research written only to `47-RESEARCH.md`; no shared file edits |
| D-02 | Search scoped to active SSH config + repoPath + branch | State already lives in `RemoteGitExplorer` + `layoutStore` (Architecture Pattern 1) |
| D-03 | Name + ripgrep content search, relative paths, click-to-open | `getRemoteTree` + `grepRemoteRef` reuse (Architecture Pattern 1) |
| D-04 | `path:line:text` results, bounded, open at line | `RemoteGrepHit` shape + tab-param extension (Pattern 1, Pitfall 3) |
| D-05 | Reuse `AIChatDrawer`, no new panel | Drawer scope/tab/runtime seams (Architecture Pattern 2) |
| D-06 | New target-based `ChatScopeType` | Full whitelist map + UUID entityId constraint (Pattern 2, Pitfall 1) |
| D-07 | Folder/repo-scoped, cross-file | Scope prompt segment + explicit-target tools (Pattern 2, Pattern 3) |
| D-08 | Auto-activate remote scope on open/selection | `AIChatContext.registerActiveItem` stack (Pattern 2, Pitfall 5) |
| D-09 | Readonly viewer + inline toolbar | `RemoteFileViewer` DOM + global `InlineAISelectionBar` (Pattern 4) |
| D-10 | Popover answer + Open in Chat to composer | `handleRunInlinePrompt` / `openChatWithDraft` (Pattern 4) |
| D-11 | Structured selection anchor | New anchor shape; `selectionContext` is entity-only (Pattern 4, Pitfall 4) |
| D-12 | `path:line` citations open + highlight file | Existing `PersistedCitation` is document-only (Pattern 5, Open Question 2) |
| D-13 | Explicit remote target for git_read + SSH FS tools | Current tools use global config / team links (Pattern 3, Open Question 1) |
| D-14 | Read-only, confined, escaped, bounded | Established helpers (Security Domain, Don't Hand-Roll) |
| D-15 | No headless explore_repo | Deferred — no work item |

</phase_requirements>

## Summary

Phase 47 is an **internal feature-composition phase**, not a new-technology phase. Everything the user asked for can be built by extending seams that already exist: `RemoteGitExplorer` already owns the active `{sshConfig, repoPath, branch}` target and a lazy git tree; `RemoteFileViewer` already renders numbered readonly code lines; `AIChatDrawer` already has durable per-scope tabs, a context switcher, tool events, and an inline-ask composer; and `git_read` + the three SSH FS tools already implement confined, bounded, read-only remote reads. No npm dependency needs to be added, so the Package Legitimacy Gate is not applicable.

The two genuinely costly, contract-level changes are: **(1)** adding a new `ChatScopeType` value, which must be widened in eight discrete whitelists spanning TypeScript unions, Dexie migration logic, and Zod backup validation, with a subtle `entityId`-must-be-UUID constraint that dictates scope-key encoding; and **(2)** teaching the shared read tools to take an **explicit remote target from chat context** — today the SSH FS tools resolve a single global `SshFsToolConfig` and `git_read` resolves a repo through team links/repo hints, neither of which is driven by the ordinary chat drawer's scope. A third contract-level seam is the `path:line` citation: the persisted citation schema is purpose-built for document grounding, so D-12 needs a new remote-citation contract rather than a reuse of that type.

The single most important planning consequence: **treat scope-type widening and tool-target injection as the foundation wave**, because explorer search, inline selection, scope auto-activation, and citation navigation all depend on the target identity type and the structured anchor being finalized first.

**Primary recommendation:** Build in four waves — (W1) widen `ChatScopeType` across all eight whitelists with a UUID-encoded target key and add the structured remote selection anchor type; (W2) extend explorer search UI + viewer `path:line` open params; (W3) thread explicit remote target into the read tools and wire remote-scope prompt grounding in `AIChatDrawer`; (W4) inline popover + citation navigation. Keep every read path on the existing `escapeShellArg`/`confineRepoPath`/bounded-result helpers.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Explorer search UI + result list | Browser / Client (React renderer) | — | Pure presentation over the already-loaded target; belongs in `RemoteGitExplorer`, no new state owner |
| Name/content search execution | Service/Integration (TS services → Tauri IPC → remote git) | Browser / Client (debounce, result cap) | `getRemoteTree` and `grepRemoteRef` already perform confined remote reads; reuse, do not re-implement in the renderer |
| Remote file tab open-at-line | Browser / Client (`layoutStore` + `RemoteFileViewer`) | — | Tab registry already carries `params`; viewer already renders numbered lines |
| Remote AI scope identity + persistence | Service/Integration (types, Dexie, backup validation) | Browser / Client (`AIChatContext`, `ScopePickerModal`) | Scope is a persisted cross-cutting contract; must be widened at the data tier before UI can select it |
| Scope-grounded prompt assembly | Service/Integration (`contextGrounding` + `AIChatDrawer` send path) | Browser / Client | Target metadata is serialized into the prompt host-side, then tools read it; keep logic with existing grounding code |
| Read-only remote tool execution | Service/Integration (`git_read` + SSH FS tools → Tauri IPC) | Remote host (SSH git/grep) | Trust boundary lives here: explicit target, confinement, escaping, bounded output |
| Inline selection anchor + popover | Browser / Client (`RemoteFileViewer`, `InlineAISelectionBar`) | Service/Integration (one bounded read call, if enabled) | DOM selection → structured anchor is renderer work; any model call reuses the shared AI client |
| Citation → file navigation | Browser / Client (`AIChatDrawer` → `layoutStore` → `RemoteFileViewer`) | — | Click handling and tab activation are renderer concerns; no new service needed |

## Standard Stack

This phase adds **no new packages**. The stack below is the project's locked stack (from `./CLAUDE.md`), listed so the planner does not introduce alternatives.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.3.0 | UI framework | Locked project decision; all seams are React components |
| TypeScript | 7.0.2 (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) | Type safety | Widening a type union across eight sites needs the compiler as the completeness check |
| Ant Design | 6.6.5 | Component system | Locked UI decision; search controls, `Segmented`, `Modal`, `Popover` come from here |
| Dexie + dexie-react-hooks | 4.4.6 / 4.4.0 | IndexedDB + `useLiveQuery` | Chat tabs/threads scopes are persisted here; scope widening touches its migration |
| Zustand | 5.0.15 | Ephemeral UI state | `layoutStore` already owns active remote target and tab params |
| Vitest | 5.0.2 (+ jsdom / @testing-library/react) | Focused unit + component tests | Project test runner; focused files only per user rule |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Zod | 4.6.5 | Backup schema validation | Backup `scopeType` enum + `entityId` UUID check are Zod refinements |
| dayjs | 1.11.23 | Date math | Not needed for this phase unless search result timestamps are formatted |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Widening existing `ChatScopeType` | New parallel remote-chat state outside the scope system | Rejected by D-05/D-06 — would duplicate tab/thread/tool-event plumbing and break backup round-trip |
| `git_read` / SSH FS tools with explicit target | New `remote_read` tool family | Rejected by D-13 — duplicate filesystem layer, new model contract, new trust boundary |
| Reuse `grepRemoteRef` for content search | New client-side search over fetched whole files | Rejected — would pull whole files into renderer, unbounded, defeats paged-read design |

**Installation:** none — no packages added.

**Version verification:** not applicable (no new packages). Node v26.13.0 / npm 11.20.0 were observed in this environment; `CLAUDE.md` targets Node 24 LTS for tooling. This does not block any code change in this phase.

## Package Legitimacy Audit

> Not applicable — this phase installs zero external packages. All functionality reuses the existing locked stack. No Package Legitimacy Gate run was required.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```text
                        ┌─────────────────────────────────────────┐
                        │  SSH Remote Explorer (tool window)       │
                        │  owns {sshConfigId, repoPath, branch}    │
                        └──────┬──────────────────┬────────────────┘
              name search ─────┘                  └──── content search
                    │                                        │
          getRemoteTree(config, repoPath, branch, dir)   grepRemoteRef(config, repoPath, ref, {pattern,limit})
                    │                                        │
                    └───────────────┬────────────────────────┘
                                    ▼
              ┌─────────────────────────────────────────┐
              │ remote tree / path:line:text results     │
              │ (relative paths, bounded hit count)      │
              └──────┬──────────────────────────┬───────┘
         click result│                          │click citation in chat
                     ▼                          ▼
       ┌──────────────────────────┐   ┌──────────────────────────────┐
       │ layoutStore.openTab       │◄──│ Chat renderer citation click │
       │ remote:<path> + line param│   └───────────┬──────────────────┘
       └──────┬───────────────────┘               │
              ▼                                   │
       ┌──────────────────────────┐               │
       │ RemoteFileViewer (RO)     │               │
       │ numbered lines + selection│               │
       └──────┬────────────────────┘               │
              │ structured anchor                  │
              ▼                                    │
       ┌──────────────────────────────────────────────────────────┐
       │ InlineAISelectionBar (Explain / Ask / Open in Chat)      │
       │  └─ auto-activate remote scope via AIChatContext         │
       └──────┬───────────────────────────────┬───────────────────┘
              │ popover answer                │ openChatWithDraft(remoteScope, mention)
              ▼                               ▼
       ┌──────────────────────────────────────────────────────────┐
       │ AIChatDrawer — remote ChatScopeType                       │
       │  scopeKey = remote:<uuid>  → tabs/threads (Dexie + backup)│
       │  prompt segment = target identity + selection anchors     │
       └──────┬───────────────────────────────────────────────────┘
              │ tools advertised per scope (read-only gated)
              ▼
       ┌──────────────────────────────────────────────────────────┐
       │ git_read + ssh_list_dir / ssh_read_file_page / ssh_grep   │
       │  explicit remote target (config + repoPath + branch)      │
       │  escapeShellArg · confineRepoPath · bounded results       │
       └──────┬───────────────────────────────────────────────────┘
              ▼  (Tauri IPC / SSH)
       ┌──────────────────────────┐
       │ Remote host: git/grep RO  │  ← no writes, no shell, no headless explore_repo
       └──────────────────────────┘
```

### Recommended Project Structure

This phase modifies existing files rather than adding a new feature tree. New files should be small, focused modules beside their consumers:

```text
src/
├── workbench/
│   ├── toolwindows/RemoteGitExplorer.tsx      # + search input/mode, result list overlay
│   ├── editor/RemoteFileViewer.tsx             # + selection anchor, initial-line highlight
│   └── store/layoutStore.ts                    # no change expected; params carry line
├── components/ai/
│   ├── AIChatDrawer.tsx                        # + remote scope grounding, citation nav
│   ├── ScopePickerModal.tsx                    # + remote target entry
│   ├── InlineAISelectionBar.tsx                # adapt to accept remote anchors
│   └── RemoteSelectionAnchor.ts (new)          # structured anchor type + DOM→line mapper
├── context/AIChatContext.tsx                   # likely no change (ActiveScope.type widens)
├── types/models.ts                             # ChatScopeType += remote
├── db/
│   ├── repositories/chatTabRepo.ts             # whitelist += remote
│   ├── repositories/chatRepo.ts                # buildScopeKey behavior (verify)
│   └── index.ts                                # V20 repair-set consideration (see Pitfall 1)
├── validation/backupSchemas.ts                 # z.enum += remote (UUID entityId)
├── services/backup/validateBackup.ts           # referential check (verify remote needs none)
├── services/backup/restoreBackup.ts            # scope reconstruction cast (verify)
├── services/ai/
│   ├── aiTools.ts                              # SSH FS dispatch target injection
│   ├── sshFsToolService.ts                     # explicit-target resolution path
│   ├── office/teamTools.ts                     # git_read explicit-target path
│   └── contextGrounding.ts                     # remote target serialization
└── tests/ (focused test files listed in Validation Architecture)
```

### Pattern 1: Explorer search reuses the active target and existing read services

**What:** `RemoteGitExplorer` already holds the exact target D-02 requires, synced from `layoutStore`. Verbatim state declarations:

```tsx
// [VERIFIED: src/workbench/toolwindows/RemoteGitExplorer.tsx:122-127]
const openTab = useLayoutStore((s) => s.openTab);
const activeRemoteConfigId = useLayoutStore((s) => s.activeRemoteConfigId);
const activeRemoteRepoPath = useLayoutStore((s) => s.activeRemoteRepoPath);
const activeRemoteBranch = useLayoutStore((s) => s.activeRemoteBranch);
const setActiveRemoteTarget = useLayoutStore((s) => s.setActiveRemoteTarget);
const setActiveRemoteBranch = useLayoutStore((s) => s.setActiveRemoteBranch);
```

Name search reads the already-built tree (`getRemoteTree(config, repoPath, branch, dirPath, secret)`), or filters the in-memory `treeData`. Content search maps directly onto the existing bounded git grep. Verbatim result shape:

```ts
// [VERIFIED: src/types/gitRemote.ts:60-64]
export interface RemoteGrepHit {
  path: string;
  line: number;
  text: string;
}
```
```ts
// [VERIFIED: src/services/gitRemoteService.ts:390-399]
export async function grepRemoteRef(
  config: SshConfig,
  repoPath: string,
  ref: string,
  options: GrepRemoteRefOptions,
  secret?: string,
  callId?: string
): Promise<{ hits: RemoteGrepHit[]; truncated: boolean }> {
```
The `path:line:text` contract (D-04) already exists as `RemoteGrepHit`; render each hit as `${path}:${line}:${text}` and pass the `path` + `line` into the tab-open params. The command is already read-only, escaped, and bounded:

```ts
// [VERIFIED: src/services/gitRemoteService.ts:399-409] (abridged to the escaping-critical lines)
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
**When to use:** both search modes. **Do not** re-fetch whole files into the renderer.

### Pattern 2: Scope is a persisted cross-cutting contract — widen every whitelist together

**What:** A `ChatScopeType` value is checked in multiple independent places. The current union is:

```ts
// [VERIFIED: src/types/models.ts:223]
export type ChatScopeType = 'global' | 'task' | 'cr' | 'system' | 'document' | 'team';
```
The scope key is built from type + entity id:

```ts
// [VERIFIED: src/db/repositories/chatRepo.ts:41-46]
export function buildScopeKey(scopeType: ChatScopeType, entityId?: string): string {
  if (scopeType === 'global' || !entityId) {
    return 'global';
  }
  return `${scopeType}:${entityId}`;
}
```
Thread scope parsing whitelists the non-global types explicitly:

```ts
// [VERIFIED: src/db/repositories/chatTabRepo.ts:29-37]
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
Backup validation uses a Zod enum (the same six values):

```ts
// [VERIFIED: src/validation/backupSchemas.ts:171-192] (abridged to the enum + entityId)
export const BackupChatThreadRecordSchema = z
  .object({
    id: uuidSchema,
    scopeKey: z.string().min(1),
    scopeType: z.enum(['global', 'task', 'cr', 'system', 'document', 'team']),
    entityId: uuidSchema.optional(),
    ...
  })
  .refine(
    (data) => {
      if (data.scopeType === 'document') {
        return Boolean(data.entityId);
      }
      return true;
    },
    ...
  );
```
A prior migration hard-codes the same set for repair:

```ts
// [VERIFIED: src/db/index.ts:582]
const valid = new Set(['global', 'task', 'cr', 'system', 'document', 'team']);
```
Restore reconstructs `scopeType` by splitting the key:

```ts
// [VERIFIED: src/services/backup/restoreBackup.ts:131-132]
scopeType: scopeKey === 'global' ? 'global' : (scopeKey.split(':')[0] as ChatThread['scopeType']),
...(scopeKey.split(':')[1] ? { entityId: scopeKey.split(':')[1] } : {}),
```
The scope picker's own local types are narrower still:

```ts
// [VERIFIED: src/components/ai/ScopePickerModal.tsx:26-36]
type ScopeTab = 'all' | 'task' | 'cr' | 'system';
interface ScopeListItem {
  id: string;
  type: 'global' | 'task' | 'cr' | 'system';
  ...
}
```
**The complete whitelist set the planner must update (8 sites):** `types/models.ts:223`, `db/repositories/chatTabRepo.ts:33`, `db/index.ts:582`, `validation/backupSchemas.ts:175`, `services/backup/restoreBackup.ts:131` (cast — verify, may need no edit), `components/ai/ScopePickerModal.tsx:26/30`, `services/ai/contextGrounding.ts:154-159` (`BuildItemContextPromptOptions.entityType`), `utils/selectionContext.ts:8` (`AIContextEntityType`). Verify `services/backup/validateBackup.ts:438-449` needs no new referential check (only `document` scope is checked today). **When to use:** this is the foundation wave — do it before any UI that emits a remote scope.

### Pattern 3: Explicit remote target for read tools — inject from chat context, not global config

**What:** Today the SSH FS tools resolve a **single global** config; there is no per-call target:

```ts
// [VERIFIED: src/types/sshFsTool.ts:1-18] (abridged)
export interface SshFsToolConfig {
  sshConfigId: string;
  defaultBasePath?: string;
  maxLinesPerRead?: number;
  maxListEntries?: number;
  maxGrepMatches?: number;
  ...
}
export const SSH_FS_TOOL_CONFIG_KEY = 'ssh_fs_ai_tool_config';
```
```ts
// [VERIFIED: src/services/ai/sshFsToolService.ts:62-86] (abridged to the resolution core)
async function resolveSshConfig(
  db: TaskPlannerDatabase,
): Promise<{ fsConfig: SshFsToolConfig; sshConfig: SshConfig }> {
  const fsConfig = await getSshFsToolConfig(db);
  ...
  const sshConfig = await getSshConfigById(fsConfig.sshConfigId, db);
  ...
}
```
The dispatch entry point already has an options bag that is the natural injection seam:

```ts
// [VERIFIED: src/services/ai/aiTools.ts:2267-2278]
export interface ExecuteAiToolOptions {
  crScopeId?: string;
  callId?: string;
}
```
```ts
// [VERIFIED: src/services/ai/aiTools.ts:2313-2320] (signature)
export async function executeAiTool(
  toolName: string,
  args: Record<string, any>,
  db: TaskPlannerDatabase,
  signal?: AbortSignal,
  options?: ExecuteAiToolOptions
): Promise<string> {
```
`git_read` is a **team tool** (not in `AI_DATABASE_TOOLS`), dispatched through `executeTeamTool`:

```ts
// [VERIFIED: src/services/ai/office/teamTools.ts:1825-1826]
    case 'git_read':
      return gitRead(input, ctx);
```
Its action enum is fixed (note: source has **eight** values — `grep` was added in Phase 43; CONTEXT/canonical docs that say seven are stale):

```ts
// [VERIFIED: src/services/ai/office/teamTools.ts:357-369]
enum: [
  'branches',
  'status',
  'log',
  'diff_summary',
  'diff_file',
  'read_file',
  'tree',
  'grep',
],
```
D-13's explicit target therefore needs **two coordinated paths**: (a) thread a `remoteTarget` (sshConfigId + repoPath + branch) from the remote chat scope into `ExecuteAiToolOptions` and have `resolveSshConfig` prefer it over the global config; (b) feed the same target into `git_read` resolution. `resolveGitRepo` (`teamTools.ts:1185-1189`) currently resolves via explicit selectors → turn hints → linked systems; add the chat-context target as a first-class source. **When to use:** any tool call made from a remote scope. Preserve all existing callers (global chat, team agents, Telegram) unchanged.

Tool availability in the ordinary chat drawer is gated by global config existence:

```ts
// [VERIFIED: src/components/ai/AIChatDrawer.tsx:1863-1874] (abridged)
const sshReady = Boolean(sshFsCfg?.sshConfigId);
const oracleReady = Boolean(oracleCfg?.sshConfigId && oracleCfg?.connectionString);
const disabledToolNames = new Set<string>([
  ...(sshReady ? [] : SSH_READ_TOOLS.map((t) => normalizeToolName(t.function.name))),
  ...(oracleReady ? [] : ORACLE_READ_TOOLS.map((t) => normalizeToolName(t.function.name))),
]);
```
A remote scope must be considered "SSH ready" from its own target even when the global SSH FS config is absent — otherwise D-13 tools vanish from the remote turn.

### Pattern 4: Selection anchor + inline popover

**What:** `RemoteFileViewer` renders numbered, readonly lines but exposes no AI context attributes today:

```tsx
// [VERIFIED: src/workbench/editor/RemoteFileViewer.tsx:28]
const TWO_MB = 2 * 1024 * 1024;
```
```tsx
// [VERIFIED: src/workbench/editor/RemoteFileViewer.tsx:333-334] (abridged)
<div
  data-testid="code-container"
  ...
>
```
```tsx
// [VERIFIED: src/workbench/editor/RemoteFileViewer.tsx:376-380]
{lines.map((line, idx) => (
  <div key={idx} style={{ height: 20 }}>
    <DiffLineCodeRenderer content={line} isDark={isDark} />
  </div>
))}
```
The global `InlineAISelectionBar` currently activates **only** for documents/notes:

```ts
// [VERIFIED: src/utils/selectionContext.ts:8]
export type AIContextEntityType = 'doc' | 'note' | 'task' | 'cr' | 'system' | 'unknown';
```
```tsx
// [VERIFIED: src/components/ai/InlineAISelectionBar.tsx:195-203]
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
D-11 requires a structured anchor `{targetIdentity, relativeFilePath, startLine, endLine, selectedText}`. Since line height is a fixed `20` and each line is its own `<div>`, the renderer can map `selection.anchorNode`/`focusNode` to line indices via the gutter (`data-testid="line-numbers-gutter"`). Recommended: add a small `RemoteSelectionAnchor.ts` module and teach `getDomContextFromNode` / `InlineAISelectionBar` to recognize a remote anchor (or add a parallel handler), rather than fabricating a fake `doc` entity. D-09's `Explain`/`Ask` reuse `handleRunInlinePrompt` (`InlineAISelectionBar.tsx:297-421`), which already runs a bounded read-only tool loop (`READ_ONLY_AI_TOOLS`, `MAX_LOOPS = 3`). D-10's `Open in Chat` reuses `openChatWithDraft` (`InlineAISelectionBar.tsx:248-294`).

### Pattern 5: Citation navigation is a new contract, not a reuse of PersistedCitation

**What:** The persisted citation type is document-grounding specific:

```ts
// [VERIFIED: src/services/ai/groundedAnswerSchemas.ts:140-155] (abridged)
export const PersistedCitationSchema = z
  .strictObject({
    citationId: CitationIdSchema,
    documentId: z.string(),
    documentTitle: z.string().min(1).max(400),
    sectionAnchor: z.string().min(1).max(256).nullable(),
    lineStart: z.number().int().positive(),
    lineEnd: z.number().int().positive(),
    authority: z.enum(['server', 'local']),
    evidenceClass: EvidenceClassificationSchema.or(z.literal('LOCAL')),
    ...
    citedExcerpt: z.string().min(1).max(16000),
```
The chat wire-up currently opens a preview, not a file tab:

```ts
// [VERIFIED: src/components/ai/AIChatDrawer.tsx:2118]
    onCitationActivate: (c) => setActivePreviewCitation(c),
```
D-12 needs a remote citation (path + line) that routes through `layoutStore.openTab` with a line param. Reuse the tab-open path from the explorer:

```tsx
// [VERIFIED: src/workbench/toolwindows/RemoteGitExplorer.tsx:392-406] (abridged)
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
`EditorArea` already spreads params into the viewer:

```tsx
// [VERIFIED: src/workbench/EditorArea.tsx:601-602]
      case 'remote_file':
        return <RemoteFileViewer {...tab.params} />;
```
`layoutStore.openTab` merges params on reopen and has a one-shot-clear precedent (`targetMessageId`) worth copying for an initial-line param:

```ts
// [VERIFIED: src/workbench/store/layoutStore.ts:176-185]
              activeTabId: tab.id,
              openTabs: state.openTabs.map((t) => {
                if (t.id !== tab.id) return t;
                // targetMessageId is a one-shot notification deeplink. A plain reopen of the
                // team tab (explorer, active-turn indicator) omits it and MUST clear the
                // previous highlight; only a new deeplink may set it again.
                const mergedParams = { ...t.params, ...tab.params };
                if ('targetMessageId' in mergedParams && !('targetMessageId' in (tab.params ?? {}))) {
                  delete mergedParams.targetMessageId;
                }
                return { ...t, title: tab.title || t.title, params: mergedParams };
              }),
```

### Anti-Patterns to Avoid
- **New AI chat panel per remote file (violates D-05):** duplicates tab/thread/runtime/tool-event plumbing already in `AIChatDrawer`.
- **Global-only tool config (the current SSH FS behavior):** a remote turn must not read from a different host/repo than its active scope; always inject the explicit target.
- **Partial whitelist widening:** adding `remote` to `types/models.ts` but not to `backupSchemas.ts` makes the app's own export unrestorable — a failure mode explicitly documented in the V20 migration comment (`db/index.ts:574-578`).
- **Fabricating a `doc` entity for remote selections:** corrupts `selectionContext` resolution (it would try `db.notes.get()` on a non-note id) and mislabels the prompt.
- **Whole-file reads for content search:** defeats the paged-read/grep design and can blow the context window; use `grepRemoteRef`/`ssh_grep_files`.
- **Reusing `PersistedCitation` verbatim for `path:line`:** it is a strict object tied to document grounding (`authority`, `evidenceClass`, `snapshotId`); a remote citation needs its own shape or careful optional extension.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Remote name search | New filesystem walker in the renderer | `getRemoteTree` (`gitRemoteTreeService.ts:176`) | Already confined, ref-based, lazy-load compatible |
| Remote content search (ripgrep) | Client-side regex over fetched files | `grepRemoteRef` (`gitRemoteService.ts:390`) / `ssh_grep_files` | Returns `path:line:text`, bounded, `-e`/`--end-of-options` escape |
| Shell escaping | Custom quote function | `escapeShellArg` (`gitRemoteService.ts:22`), `shellQuote` (`sshFsToolService.ts:36-38`) | Proven against injection tests incl. leading `-` and `; rm -rf /` |
| Path confinement | String prefix checks | `confineRepoPath` (`gitRemoteTreeService.ts:137-153`) | Normalizes `..` before the escape check; blocks traversal |
| Scope key construction | Ad-hoc string concat | `buildScopeKey` (`chatRepo.ts:41-46`) | Keeps global/entity rules identical everywhere |
| Chat tabs/threads per scope | New store | `chatTabRepo` / `AIChatDrawer` | Durable per-scope tabs, single-active-tab invariant, backup-valid |
| Inline model call | New AI client | `streamChatEvents` + `stripThinkingBlocks` in `InlineAISelectionBar` | Already streams, aborts, loops read-only tools |
| Selection popup positioning | New math | `calculatePopupPosition` (`InlineAISelectionBar.tsx:44-69`) | Handles viewport clamping and above/below flip |
| Tab open + params | New tab mechanism | `layoutStore.openTab` + `EditorArea` `remote_file` case | Already renders `RemoteFileViewer` from params |
| Scope auto-activation | New global variable | `AIChatContext.registerActiveItem` / `setCustomScope` | Already models manual-override precedence |

**Key insight:** the codebase has already solved every hard sub-problem (confinement, escaping, bounded reads, scope persistence, tool events, popup positioning). This phase is glue work; the risk is contract drift across whitelists and tool-target plumbing, not algorithmic novelty.

## Runtime State Inventory

Not applicable — this is a feature-addition phase, not a rename, rebrand, refactor, or string-replacement migration. No persisted string is being renamed. The one schema-adjacent change (widening a backup enum) is forward-compatible widening, handled in Pattern 2 and Pitfall 1.

## Common Pitfalls

### Pitfall 1: The backup `entityId` must be an RFC 4122 v4 UUID
**What goes wrong:** A remote scope key like `remote:sshConfigId/repoPath/branch` (or anything whose `entityId` segment is not a UUID) passes Dexie but fails the app's own backup validation, because `entityId` is `uuidSchema.optional()` and `uuidSchema` requires v4 UUID (`src/validation/backupSchemas.ts:34-38`, `src/utils/uuid.ts:9-19`). This is exactly the class of bug the V20 repair migration was written for (`db/index.ts:574-578`).
**Why it happens:** `buildScopeKey` splits on `:` and treats everything after the first colon as `entityId`; `restoreBackup.ts:131-132` reconstructs it the same way. Multi-segment or non-UUID identities cannot round-trip.
**How to avoid:** Use a **target-based UUID** as the scope `entityId` (e.g. a `crypto.randomUUID()` that identifies the `{sshConfigId, repoPath, branch/folder}` target, with the target details resolved from the active layout/explorer state at use time). Do not encode raw paths into the scope key. Keep the key to `remote:<uuid>`.
**Warning signs:** Export → validate fails with "Must be a valid RFC 4122 v4 UUID"; a remote chat tab disappears after backup restore.

### Pitfall 2: Partial scope-type widening
**What goes wrong:** `ChatScopeType` gains `remote` but one whitelist is missed. The app compiles (if the missed site uses a string comparison rather than the union), then silently falls back to `global` in `threadScopeParts` (`chatTabRepo.ts:33-37`) or rejects its own backup at `backupSchemas.ts:175`.
**Why it happens:** eight independent sites encode the same value set; several are string comparisons/sets, not type-checked against the union.
**How to avoid:** update all eight sites in one wave and add a focused test that a `remote:<uuid>` scope key survives `threadScopeParts` → `buildScopeKey` → `BackupChatThreadRecordSchema` → restore.
**Warning signs:** Remote chat opens but shows global history; backup export/validate round-trip fails for a remote-scoped thread.

### Pitfall 3: One-shot line/highlight params leak across tab reopens
**What goes wrong:** A search-result or citation click adds `initialLine` to a `remote:<path>` tab; every later reopen re-highlights the stale line because `openTab` merges params.
**Why it happens:** `layoutStore.openTab` merges `params` for an existing tab (`layoutStore.ts:180-185`); only `targetMessageId` has a one-shot clear rule.
**How to avoid:** mirror the `targetMessageId` one-shot pattern for `initialLine`/highlight params, or use a monotonic nonce keyed to the click.
**Warning signs:** Opening a file from the tree lands on the last-searched line.

### Pitfall 4: Treating a remote selection as a `doc` entity
**What goes wrong:** The inline bar activates with `entityType: 'doc'` and `resolveEntityHierarchy` calls `db.notes.get(uuid)` on a non-existent note, producing an empty breadcrumb and no file/path/line in the prompt — directly violating D-11.
**Why it happens:** `getDomContextFromNode` only knows the six values in `AIContextEntityType` (`selectionContext.ts:8`) and `InlineAISelectionBar` gates on doc/note (`:195-203`).
**How to avoid:** introduce a distinct remote anchor shape and branch in the selection handler; map DOM selection to line numbers using the fixed 20px line divs and the gutter.
**Warning signs:** Popover breadcrumb says "Tài liệu không tên"; prompt has selected text but no `path:line`.

### Pitfall 5: Auto scope activation fights the user's manual scope choice
**What goes wrong:** Opening a remote file auto-selects the remote scope even when the user deliberately pinned a different scope; or switching targets never activates the remote scope.
**Why it happens:** `AIChatContext` computes `activeScope = customScope ?? registeredTop ?? global` (`AIChatContext.tsx:139-144`). A manual `customScope` overrides registered items, and `localStorage` persistence of `customScope` means a stale manual choice can win.
**How to avoid:** use `registerActiveItem` for automatic remote-scope activation (so a manual choice still wins, per D-08), and rely on the scope picker's `setCustomScope` for explicit switching. Decide and test the precedence explicitly.
**Warning signs:** Remote scope never becomes active, or remains active after the user switches to a CR scope.

### Pitfall 6: Remote turn has no SSH tools because global SSH FS config is empty
**What goes wrong:** A remote scope is active, but `AIChatDrawer` builds `disabledToolNames` from `getSshFsToolConfig(db)?.sshConfigId` (`AIChatDrawer.tsx:1863-1874`); with no global config the tools are removed, so D-13 cannot happen.
**Why it happens:** tool availability is gated on global config, not on the active scope's target.
**How to avoid:** treat an active remote target as SSH-ready for that turn; keep the existing gate for global/other scopes.
**Warning signs:** The remote chat model never calls `ssh_*` tools even for cross-file questions.

### Pitfall 7: Citation click opens the wrong thing
**What goes wrong:** Clicking a `path:line` citation opens a document preview (`setActivePreviewCitation`, the current behavior at `AIChatDrawer.tsx:2118`) rather than a remote file tab at that line.
**Why it happens:** the only wired citation handler is the document-grounding preview.
**How to avoid:** add a remote-citation activation path that calls `layoutStore.openTab` with the remote target + line params; keep the document path unchanged.
**Warning signs:** Citation click highlights a knowledge-document chip, no remote tab appears.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Seven `git_read` actions | Eight actions (`grep` added) | Phase 43 | CONTEXT doc "seven-value enum" text is stale; code is authoritative |
| Repo resolution only from team links | Explicit path selectors + turn hints + linked systems | Phase 42/43 | Precedent for adding chat-context target as another resolution source |
| Local filesystem reads in AI flow | Removed; SSH-only reads | Quick 261118-cz2 | Remote scope must not reintroduce local-path reads |
| Per-file AI surfaces | Folder/repo-scoped chat with cross-file tools | This phase (D-07) | Keep context target-based, not file-based |

**Deprecated/outdated:** none in the stack. Note the CLAUDE.md PWA/GitHub-Pages stack sections are explicitly out of scope for current work (Tauri only).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A UUID-valued `entityId` is the right encoding for a target-based remote scope key, with target details resolved from live layout state | Pitfall 1, Pattern 2 | If target details must be self-contained in the backup, a bare UUID loses them on restore; planner must confirm where target metadata lives |
| A2 | `git_read` can be reached from the ordinary `AIChatDrawer` remote turn (today it is team-tool-only) | Pattern 3, Open Question 1 | If not wired, D-13 would rely on SSH FS tools alone; cross-file git actions (log/diff) unavailable in remote chat |
| A3 | The inline popover for remote selections will reuse `handleRunInlinePrompt` with the read-only tool subset | Pattern 4 | If the planner disables the auto tool call (a D-14 discretion), Explain/Ask answers lose cross-file grounding |
| A4 | Search name-mode can filter the already-loaded tree; content-mode maps to `grepRemoteRef` | Pattern 1 | If name search must cover the whole repo without lazy expansion, need a recursive tree service path |
| A5 | Tauri-only runtime means no PWA/service-worker validation work | Project constraints | If a future request re-enables PWA, none of this research covers that surface |

## Open Questions

1. **How does `git_read` become available to a remote scope in `AIChatDrawer`?**
   - What we know: `git_read` is a team tool (`TEAM_TOOL_DEFINITIONS` / `executeTeamTool`), not in `AI_DATABASE_TOOLS`; the ordinary drawer dispatches via `executeAiTool`. SSH FS tools are in `AI_DATABASE_TOOLS` and gated in the drawer.
   - What's unclear: D-13 says "dùng lại git_read và SSH FS tools" — whether the planner should expose `git_read` to ordinary chat (new wiring) or restrict remote chat to the SSH FS trio (which lacks git log/diff).
   - Recommendation: add a remote-scope dispatch path that can call both, feeding one explicit target object; keep team callers unchanged. Confirm with the owner before locking the tool contract.

2. **What is the remote citation shape and where is it persisted?**
   - What we know: `PersistedCitation` is document-grounding-specific and the only wired activation opens a preview.
   - What's unclear: whether remote `path:line` citations are persisted in `ChatMessage.grounding` (requiring a schema-safe extension) or are render-only chips.
   - Recommendation: start render-only for D-12 (chip carries target + relative path + line, click opens tab); avoid touching the strict persisted citation schema unless the owner requires durable citations.

3. **Where does the remote target identity live for a backup-restored scope (A1)?**
   - What we know: backup `entityId` must be a UUID; layout state holds `activeRemoteConfigId/RepoPath/Branch` but is localStorage, not part of the encrypted backup.
   - What's unclear: after restore, how a `remote:<uuid>` scope recovers its host/repo/branch.
   - Recommendation: either resolve from current layout state on use (deferred-persistence semantics, matching D-15's deferred "persistent remote workspace context") or store target metadata in a backup-safe settings row — decide in planning.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Tooling/test runner | ✓ | v26.13.0 observed (CLAUDE.md targets 24 LTS) | — |
| npm | Test scripts | ✓ | 11.20.0 | — |
| Vitest | Focused tests | ✓ (via `node_modules`) | 5.0.2 | — |
| Tauri CLI / SSH backend | Remote reads at runtime | Assumed present (Tauri is the supported runtime) | — | Feature is UI/tool code; no new native capability needed |
| SSH remote test host | Live `git_read`/SSH tool verification | Not verified | — | Use mocked service tests; live walkthrough is a UAT/human step |

**Missing dependencies with no fallback:** none for code/test work.
**Missing dependencies with fallback:** live SSH host — use focused mocked tests; flag any true integration verification as human/UAT.

## Validation Architecture

> Nyquist validation is enabled (`workflow.nyquist_validation: true` in `.planning/config.json`). Focused tests only — the full Vitest suite is over an hour and is forbidden by project rule.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 [VERIFIED: package.json `"test": "vitest run"`] |
| Config file | `vite.config.ts` |
| Quick run command | `npx vitest run <single-focused-file>` |
| Full suite command | Not used — focused files only (project rule / user memory) |

### Phase Requirements → Test Map
| Decision | Behavior | Test Type | Automated Command | File Exists? |
|----------|----------|-----------|-------------------|-------------|
| D-06 | `remote:<uuid>` scope survives `threadScopeParts`, `buildScopeKey`, backup schema, restore | unit | `npx vitest run tests/ai/chatRepo.test.ts tests/validation/backupSchemas.test.ts` | ✅ |
| D-06 | Scope picker lists/selects a remote target | component | `npx vitest run tests/ai/ScopePickerModal.test.tsx` | ✅ |
| D-02/D-03/D-04 | Explorer search name + content modes, `path:line:text`, bounded, click opens `remote:` tab at line | component | `npx vitest run src/workbench/__tests__/RemoteGitExplorer.test.tsx` | ✅ |
| D-04/D-12 | Remote file viewer accepts initial line param and highlights/scrolls | component | `npx vitest run src/workbench/__tests__/RemoteFileViewer.test.tsx` (Wave 0 new) | ❌ Wave 0 |
| D-09/D-11 | Selection → structured anchor (target/path/startLine/endLine/text); inline toolbar actions | unit + component | `npx vitest run src/utils/selectionContext.test.ts` + `tests/ai/AIChatDrawerToolbox.test.tsx` | ✅ (extend) |
| D-13/D-14 | Read tools accept explicit target; confinement/escaping/bounds unchanged; no write tools | unit | `npx vitest run tests/ai/chatTurnTools.test.ts tests/services/__tests__/gitRemoteReadPipeline.test.ts` | ✅ |
| D-08 | Remote file/selection auto-activates remote scope, manual override wins | unit/component | `npx vitest run tests/ai/AIChatDrawerIsolation.test.tsx` (or new focused file) | ✅ (extend) |
| D-05 | Remote scope reuses drawer tabs/threads (one active tab per scope) | unit | `npx vitest run tests/ai/chatRepo.test.ts tests/ai/AIChatDrawerTabs.test.tsx` | ✅ |
| D-14 | Backup round-trip still validates with a `remote` scope present | unit | `npx vitest run tests/validation/backupSchemas.test.ts tests/services/backup/validateBackup.test.ts` | ✅ |
| D-01 | No shared planning files modified | shell check | `git diff --name-only -- .planning/ROADMAP.md .planning/STATE.md` (expect empty) | n/a |

### Sampling Rate
- **Per task commit:** run the single focused file(s) mapped to that task, e.g. `npx vitest run tests/ai/chatRepo.test.ts`.
- **Per wave merge:** run all focused files touched in that wave (at most 3–4 files, still seconds).
- **Phase gate:** all focused files green plus `npx tsc --noEmit`; then UAT/human verification of the remote walkthrough (C-15: no requirement is satisfied by reading code).

### Observable Failure Signals
- Scope widening incomplete → `tsc --noEmit` error on the union, OR backup test fails with `Must be a valid RFC 4122 v4 UUID` / `scopeType` enum rejection.
- Explicit target not injected → SSH service mock is called with the global `sshConfigId` instead of the scope's target; assertion on the mock call fails.
- Confinement regression → a `../` or leading-`-` payload test in `gitRemoteReadPipeline`/`gitRemoteService` fails.
- Line-param leak → reopening a `remote:` tab still carries the previous `initialLine` (one-shot clear missing).
- Inline anchor wrong type → popover breadcrumb resolves as "Tài liệu không tên" and prompt lacks `path:line`.

### Wave 0 Gaps
- [ ] `src/workbench/__tests__/RemoteFileViewer.test.tsx` — new: initial-line highlight + structured selection anchor extraction.
- [ ] A focused `remoteScope` test file (e.g. `tests/ai/remoteScope.test.ts`) — covers UUID scope key, whitelist widening, backup round-trip, and auto-activation precedence.
- [ ] Extend `src/workbench/__tests__/RemoteGitExplorer.test.tsx` — search modes and result-click tab params.
- [ ] Extend `tests/ai/chatTurnTools.test.ts` / `tests/services/__tests__/gitRemoteReadPipeline.test.ts` — explicit-target dispatch.

*(No framework install needed; existing infrastructure covers most requirements.)*

## Security Domain

> Required: `security_enforcement: true` and `security_asvs_level: 1` in `.planning/config.json`. `security_enforcement: false` was not confirmed.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | No | One-person app; SSH auth is preconfigured profile, no app login added |
| V3 Session Management | No | No new session model |
| V4 Access Control | Yes (scope confinement) | Remote scope may only target its own SSH config/repo/branch; explicit target must not be overridable by model args to a different host |
| V5 Input Validation | Yes | `escapeShellArg` per argument, `confineRepoPath` for file paths, bounded limits; search regex/pattern goes through `-e` + `--end-of-options` |
| V6 Cryptography | Yes | SSH secrets stay in native keyring via `getSshSecret`; no new storage of credentials |

### Known Threat Patterns for SSH + remote AI tools
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Command injection via path/pattern/branch | Tampering / EoP | `escapeShellArg` (`gitRemoteService.ts:22`), `shellQuote` (`sshFsToolService.ts:36-38`), `-e`/`--end-of-options` for leading `-`; D-14 forbids new shell surface |
| Path traversal out of repo | Tampering / Info disclosure | `confineRepoPath` (`gitRemoteTreeService.ts:137-153`) normalizes `..` before refusing |
| Cross-target read via model args | Info disclosure | Explicit target from scope must win over model-supplied selectors; a remote turn must not fall back to a different host (CLAUDE.md: "do not fall back to a different host or local filesystem") |
| Untrusted remote content as instruction | Tampering | Wrap remote file/grep results as untrusted data at the tool boundary (Phase 42 D-11 precedent); never treat as prompt instructions |
| Unbounded output / DoS | Denial of Service | Existing caps: grep 200 / read 2000 / list 200; inline loop `MAX_LOOPS = 3`; search hit bound required by D-04 |
| Accidental remote write | Tampering | Keep every path on read-only helpers; no shell write/redirect/patch; `isMutationTool` (`aiTools.ts:5135`) stays the gate |

## Sources

### Primary (HIGH confidence — source files read this session)
- `.planning/phases/47-ssh-remote-explorer-ai-code-understanding/47-CONTEXT.md` — locked decisions D-01..D-15.
- `src/types/models.ts:223` — `ChatScopeType` union.
- `src/db/repositories/chatRepo.ts:41-46` — `buildScopeKey`.
- `src/db/repositories/chatTabRepo.ts:29-37` — scope whitelist.
- `src/validation/backupSchemas.ts:34-38,171-192` — UUID schema + backup scope enum.
- `src/db/index.ts:579-595` — V20 repair set.
- `src/services/backup/restoreBackup.ts:125-136` — scope reconstruction.
- `src/services/backup/validateBackup.ts:438-474` — referential + tab/scope invariants.
- `src/components/ai/ScopePickerModal.tsx:26-36` — picker local scope types.
- `src/utils/uuid.ts:9-19` — v4 UUID regex.
- `src/workbench/toolwindows/RemoteGitExplorer.tsx:121-127,388-407` — target state + tab open.
- `src/workbench/editor/RemoteFileViewer.tsx:28,333-382` — readonly code DOM.
- `src/workbench/store/layoutStore.ts:169-204` — tab param merge + one-shot precedent.
- `src/workbench/EditorArea.tsx:601-602` — `remote_file` params spread.
- `src/utils/selectionContext.ts:8,59-92` — entity types + DOM context extraction.
- `src/components/ai/InlineAISelectionBar.tsx:44-69,195-294,297-421` — positioning, activation, composer + inline loop.
- `src/services/ai/aiTools.ts:2267-2340,5119-5135` — options bag, dispatch, read-only subsets.
- `src/services/ai/sshFsToolService.ts:62-86,239-324` — global config resolution + grep command.
- `src/types/sshFsTool.ts:1-18` — SSH FS config shape.
- `src/services/ai/office/teamTools.ts:348-419,1185-1289,1825-1826` — `git_read` definition, repo resolution, dispatch.
- `src/services/ai/contextGrounding.ts:154-342` — context serialization + clamp.
- `src/components/ai/AIChatDrawer.tsx:436-444,1735-1781,1863-1880,2118` — scope, grounding, tool gating, citation wiring.
- `src/services/ai/groundedAnswerSchemas.ts:140-177` — persisted citation shape.
- `src/services/gitRemoteService.ts:22,390-409` — escaping + grep command.
- `src/services/gitRemoteTreeService.ts:137-153,390-413` — confinement + paged read.
- `src/types/gitRemote.ts:60-64` — `RemoteGrepHit`.
- `src/context/AIChatContext.tsx:125-144` — scope activation precedence.

### Secondary (MEDIUM confidence — prior phase artifacts)
- `.planning/phases/42-read-only-git-inspection-for-the-reviewer-agent/42-CONTEXT.md` — read-only git invariants, escape/wrap/refusal patterns.
- `.planning/phases/43-repo-reading-that-scales-grep-paged-read-and-remote-headless/43-CONTEXT.md` — grep/paged-read scale decisions.
- `.planning/phases/29.1-remote-ssh-git-explorer/29.1-RESEARCH.md` — original remote explorer architecture and ASVS threat framing.

### Tertiary (LOW confidence — noted, not authoritative)
- Stale "seven-value `git_read` enum" wording in CONTEXT canonical-refs; code (eight values) wins.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — locked in CLAUDE.md; no new packages.
- Architecture: HIGH — every seam read from source this session with verbatim values.
- Pitfalls: HIGH — derived from explicit code comments and prior-phase failure history (V20 migration, Phase 42 review findings).
- Open questions: MEDIUM — depend on owner intent for tool exposure and citation persistence.

**Research date:** 2026-11-19
**Valid until:** ~30 days (stable internal architecture; recheck if parallel phases 45/46 alter the AI tool plumbing or backup schema).
