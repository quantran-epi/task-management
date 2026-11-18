# Phase 35: Shared-primitive extraction + SDLC behavior removal - Pattern Map

**Mapped:** 2026-11-09
**Files analyzed:** 7 primary (4 extractions, 2 persisted-surface edits, 1 tool rescope) + deletion surface
**Analogs found:** 7 / 7

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/services/ai/patchProposal.ts` (NEW) | service | transform (pure text → diff) | `src/services/ai/sdlcArtifactTools.ts:368-546` (self, surviving core) | exact (move) |
| `src/services/ai/conventionsSegment.ts` (NEW) | service | transform (string concat) | `src/services/ai/sdlcPromptComposer.ts:323-374` (self, surviving block) | exact (move) |
| `src/components/common/DiffSyntaxHighlighter.tsx` (MOVED) | component | render | `src/components/common/GlobalDiagramViewer.tsx` (sibling, React.memo FC) | exact (move) |
| `src/components/ai/widget/PatchDiffApprovalCard.tsx` (MOVED+RENAMED) | component | request-response (approve/reject) | `src/components/ai/widget/MutationApprovalCard.tsx` (sibling) | exact (move + rename) |
| `src/services/ai/aiTools.ts` (MODIFIED — tool defs + dispatch) | service / registry | request-response | existing non-SDLC tool def + `case` in same file | exact |
| `src/db/index.ts` (MODIFIED — `version(18)`) | migration | batch purge | `version(16)` upgrade hook (`:331-488`) | exact |
| `src/db/schema.ts` (MODIFIED — `SCHEMA_V18`) | config | — | `SCHEMA_V17` (`:121-129`) | exact |
| `src/workbench/store/layoutStore.ts` (MODIFIED — key/partialize) | store | hydration filter | existing `partialize` (`:347-368`) + `LAYOUT_STORAGE_KEY` (`:106`) | exact |

---

## Pattern Assignments

### 1. `src/services/ai/patchProposal.ts` (NEW, service, transform)

**Analog:** `src/services/ai/sdlcArtifactTools.ts` — the surviving core is lines 25-26, 28-61, 73-88, 163-169, 368-546. Everything else in that file is SDLC-only and dies.

**Imports pattern** (current `sdlcArtifactTools.ts:1-18`, reduced to what survives):
```typescript
import type { TaskPlannerDatabase } from '../../db';
import { z } from 'zod';
import { buildSectionIndex, splitLines, type ArtifactSection } from '../../utils/markdownSections';
import {
  createUnifiedLineDiff,
  MAX_DIFF_CELLS,
  type DiffBudgetRefusal,
  type UnifiedLineDiff,
} from '../../utils/lineDiff';
```
Drop: `workflowSchemas` (line 3-8), `workflowCoordinator` (line 9), `systemRepo` (10), `workflowGuards` (11). `defaultSha256` is **moved in**, not imported (see §6.4 of RESEARCH).

**Constants + refusal shape** (`sdlcArtifactTools.ts:24-61`) — keep, minus SDLC fields:
```typescript
/** D-09 cap on both the supplied text and the resulting changed lines. */
export const PATCH_LINE_CAP = 120;
export { MAX_DIFF_CELLS };

export type ArtifactToolRefusalCode =
  | 'ARTIFACT_SCOPE_REQUIRED' | 'ARTIFACT_SCOPE_INVALID' | 'ARTIFACT_STEP_UNSUPPORTED'
  | 'CR_NOT_ACTIVE' | 'ARTIFACT_READ_ONLY' | 'ARTIFACT_REQUIRED' | 'UNSUPPORTED_KIND'
  | 'WORKFLOW_UNAVAILABLE' | 'ARTIFACT_NOT_FOUND' | 'INVALID_ARGUMENTS'
  | 'SECTION_NOT_FOUND' | 'SECTION_DRIFT' | 'SECTION_EMPTY'
  | 'PATCH_TOO_LARGE' | 'NO_CHANGES' | 'DIFF_BUDGET_EXCEEDED';
// DROP: `| WorkflowGuardCode` (line 45) — SDLC guard union.

export interface ArtifactToolRefusal {
  refused: true;
  code: ArtifactToolRefusalCode;
  message: string;
  sectionIndex?: ArtifactSection[];
  addedLines?: number;
  removedLines?: number;
  cap?: number;
  sectionId?: string;
  // DROP: supplyingStep / stepNumber / missingArtifact (lines 57-60) — SdlcStepId-typed.
}
```

**Proposal shape** (`sdlcArtifactTools.ts:73-88`) — rescope per RESEARCH §2 Asset 3 hazard 1:
```typescript
export interface ArtifactPatchProposal {
  proposalId: string;
  target: 'note' | 'skill';   // replaces scopeKey/changeRequestId/crId/kind
  id: string;                 // noteId or skillId
  version: number;            // 0 for notes; skill version in Phase 39
  sectionId: string;
  sectionTitle: string;
  baseHash: string;
  baseMarkdown: string;
  diffText: string;
  addedLines: number;
  removedLines: number;
  patchedMarkdown: string;
}
```

**Private helpers to EXPORT** (currently `function`, not `export function` — RESEARCH C8):
```typescript
// sdlcArtifactTools.ts:368-374
interface SectionSlice {
  section: ArtifactSection;
  bodyLines: string[];
  /** Line indices (inclusive) of the non-blank body core, in whole-document space. */
  coreStart: number;
  coreEnd: number;
}
// :376-396  → export function locateSection(markdown, sectionId): SectionSlice | ArtifactToolRefusal
// :402-406  → export function detectEol(markdown): '\r\n' | '\n'
// :408-431  → export function applyOperation(markdown, slice, operation, newContent): string
// :433-437  → export function countLogicalLines(text): number
// :163-165  → export function refuse(code, message, extra?): ArtifactToolRefusal
// :167-169  → export function isRefusal(result): result is ArtifactToolRefusal
// :44-48 (workflowCoordinator.ts) → export async function defaultSha256(text): Promise<string>
```

**Core patch flow** (`sdlcArtifactTools.ts:439-546`) — the shape to copy, with the read step swapped:
```typescript
export async function preparePatch(
  db: TaskPlannerDatabase,
  args: Record<string, unknown>,
): Promise<ArtifactToolResult> {
  const parsed = patchArgsSchema.safeParse(args);
  if (!parsed.success) return refuse('INVALID_ARGUMENTS', `Đối số không hợp lệ: ${...}.`);
  const args = parsed.data;

  const snapshot = await readPatchTarget(db, args);        // was readArtifactSnapshot(db, context, kind)
  if (isRefusal(snapshot)) return snapshot;
  const current = snapshot as ArtifactToolSnapshot;

  if (current.baseHash !== args.baseHash) return refuse('SECTION_DRIFT', ..., { sectionIndex: current.sectionIndex });
  const slice = locateSection(current.markdown, args.sectionId);
  if (isRefusal(slice as ArtifactToolResult)) return slice as ArtifactToolRefusal;
  const located = slice as SectionSlice;
  if (located.section.title !== args.expectedHeading) return refuse('SECTION_DRIFT', ...);
  if (located.coreStart === -1) return refuse('SECTION_EMPTY', ...);
  const suppliedLines = countLogicalLines(args.newContent);
  if (suppliedLines > PATCH_LINE_CAP) return refuse('PATCH_TOO_LARGE', ..., { cap: PATCH_LINE_CAP, ... });
  const patchedMarkdown = applyOperation(current.markdown, located, args.operation, args.newContent);
  if (patchedMarkdown === current.markdown) return refuse('NO_CHANGES', ...);
  const diff = createUnifiedLineDiff(current.markdown, patchedMarkdown, { fromLabel: `a/${label}`, toLabel: `b/${label}` });
  if ((diff as DiffBudgetRefusal).refused) { ... return refuse('DIFF_BUDGET_EXCEEDED', budget.message, { cap: budget.cap, sectionId: args.sectionId }); }
  const unified = diff as UnifiedLineDiff;
  if (unified.addedLines + unified.removedLines > PATCH_LINE_CAP) return refuse('PATCH_TOO_LARGE', ...);
  return { proposalId: crypto.randomUUID(), target: args.target, id: args.id, version: current.version,
    sectionId: located.section.id, sectionTitle: located.section.title, baseHash: current.baseHash,
    baseMarkdown: current.markdown, diffText: unified.diffText, addedLines: unified.addedLines,
    removedLines: unified.removedLines, patchedMarkdown };
}
```

**Target read** — replaces `readArtifactSnapshot` (`:312-366`) + `loadWorkflowState` (`:259-293`). The whole `db.settings`/`chatTabs` lookup disappears (RESEARCH hazard 2):
```typescript
// notes: Note.body is Markdown; skills: AiSkill.body (src/types/aiOffice.ts:58-65)
export async function readPatchTarget(db, args): Promise<ArtifactToolResult> {
  const parsed = targetArgsSchema.safeParse(args);
  if (!parsed.success) return refuse('INVALID_ARGUMENTS', ...);
  const { target, id } = parsed.data;
  const row = target === 'note' ? await db.notes.get(id) : await db.aiSkills.get(id);
  const markdown = target === 'note' ? readNoteMarkdown((row as Note | undefined)?.body) : (row as AiSkill | undefined)?.body;
  if (markdown === undefined) return refuse('ARTIFACT_NOT_FOUND', ...);
  const baseHash = await defaultSha256(markdown.trim());
  return { target, id, version: 0, approvalState: 'unapproved', markdown, baseHash, sectionIndex: buildSectionIndex(markdown) };
}
```
Note: `readNoteMarkdown` is `src/utils/noteBody.ts:10` — survives (RESEARCH §7.2), but its header comment references `services/wizard/artifactRepo.ts` and must be reworded.

**Args schema** (`:175-182`) — replace `kind` with the target pair:
```typescript
const patchArgsSchema = z.object({
  target: z.enum(['note', 'skill']),
  id: z.string().min(1),
  sectionId: z.string().min(1, 'sectionId không được để trống'),
  expectedHeading: z.string().min(1, 'expectedHeading không được để trống'),
  baseHash: z.string().regex(/^[a-f0-9]{64}$/, 'baseHash không hợp lệ'),
  operation: z.enum(['append', 'replace']),
  newContent: z.string({ message: 'newContent phải là chuỗi' }),
});
```

**Error-handling convention in this module:** never throw — every failure returns a typed `ArtifactToolRefusal` with a Vietnamese user-facing `message`. Preserve verbatim; the card and the chat both render `message` directly.

**Test analog:** `tests/services/ai/sdlcArtifactTools.test.ts:1-60` — rewrite as `tests/services/ai/patchProposal.test.ts`; drop `seedWorkflow` (`:33-60`) and the `workflowStorageKey`/`SdlcWorkflowState` imports (`:4-6`); keep the diff/section/EOL/cap assertions.

---

### 2. `src/services/ai/conventionsSegment.ts` (NEW, service, transform)

**Analog:** `src/services/ai/sdlcPromptComposer.ts:323-374` — dependency-free block, verified by RESEARCH §2 Asset 1.

**Full block to move, verbatim** (no imports needed at all):
```typescript
export const CONVENTIONS_CONFLICT_POLICY = [
  'NGUYÊN TẮC XỬ LÝ XUNG ĐỘT QUY ƯỚC BẮT BUỘC:',
  'Khi phát hiện có mâu thuẫn giữa Quy ước chung của tổ chức (Global) và Quy ước của kho lưu trữ (Repository), ' +
  'AI BẮT BUỘC phải nêu rõ mâu thuẫn cụ thể, trích dẫn rõ nguồn từ từng bên và KHÔNG ĐƯỢC tự ý chọn một bên; ' +
  'phải dừng lại và yêu cầu người dùng xác nhận hoặc phân giải quyết định.',
].join('\n');

export interface RepoConventionItem {
  systemCode: string;
  systemName?: string;
  repoPath?: string;
  content: string;
}

export function buildConventionsSegment(conventions?: {
  global?: string | undefined;
  repo?: string | undefined;
  repoPath?: string | undefined;
  repos?: RepoConventionItem[] | undefined;
} | undefined): string { /* :343-373 unchanged */ }
```

**Consumer re-point** (`AIChatDrawer.tsx:51`):
```typescript
// before
import { buildConventionsSegment } from '../../services/ai/sdlcPromptComposer';
// after
import { buildConventionsSegment } from '../../services/ai/conventionsSegment';
```
Call site `AIChatDrawer.tsx:1889` unchanged.

**Test analog:** `tests/ai/sdlcConventionsExemplar.test.ts:4-6` (import swap + rename to `conventionsSegment.test.ts`); `tests/services/multiSystemConventionService.test.ts:8-10` (import swap only).

---

### 3. `src/components/common/DiffSyntaxHighlighter.tsx` (MOVED, component, render)

**Analog:** its own current content (`src/components/sdlc/diff/DiffSyntaxHighlighter.tsx`, 130 lines) — zero SDLC coupling, `react` only. Sibling style reference: `src/components/common/GlobalDiagramViewer.tsx`, `src/components/common/EmptyState.tsx` (named `export const X: React.FC<Props>`, exported `Props` interface, no default export).

**Exports to preserve exactly** (file name changes, export names do not — RESEARCH C7):
```typescript
export interface TokenSpan { text: string; type: 'keyword' | 'string' | 'comment' | 'number' | 'function' | 'type' | 'plain'; }
export function tokenizeCodeLine(line: string): TokenSpan[]           // :26
export function getGithubThemeColors(isDark: boolean)                 // :84
export const DiffLineCodeRenderer: React.FC<{ content: string; isDark: boolean }>  // :106
```
The component is `React.memo`-wrapped (`:109`) with `React.useMemo` for spans and colors (`:110-111`) — keep as-is.

**Consumer re-point** (`RemoteFileViewer.tsx:17`):
```typescript
// before
import { DiffLineCodeRenderer } from '../../components/sdlc/diff/DiffSyntaxHighlighter';
// after
import { DiffLineCodeRenderer } from '../../components/common/DiffSyntaxHighlighter';
```

---

### 4. `src/components/ai/widget/PatchDiffApprovalCard.tsx` (MOVED+RENAMED, component, request-response)

**Analog:** `src/components/ai/widget/MutationApprovalCard.tsx` — same directory, same `theme.useToken()` + inline-style + `data-testid` convention. Current file `ArtifactDiffApprovalCard.tsx` is 85 lines and has exactly one SDLC line (`:4`).

**Imports pattern** — only line 4 changes:
```typescript
import React from 'react';
import { Alert, Button, Tooltip, theme } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, DiffOutlined } from '@ant-design/icons';
import type { ArtifactPatchProposal } from '../../../services/ai/patchProposal';  // was sdlcArtifactTools
```

**Props + helper** (`:6-24`) — rename interface, keep `isDarkBase` exported (test imports it):
```typescript
export interface PatchDiffApprovalCardProps {
  patch: ArtifactPatchProposal;
  stale?: boolean | undefined;
  applying?: boolean | undefined;
  error?: string | undefined;
  decision?: 'approved' | 'rejected' | undefined;
  onApprove: () => void;
  onReject: () => void;
}
export function isDarkBase(colorBgBase?: string | undefined): boolean { /* :17-24 unchanged */ }
export const PatchDiffApprovalCard: React.FC<PatchDiffApprovalCardProps> = ({ ... }) => { /* :26-85 unchanged */ }
```

**Sibling convention to match** (`MutationApprovalCard.tsx:22-37`): `const { token } = theme.useToken();` then inline `style={{}}` objects using `token.colorWarningBg` / `token.colorWarningBorder` / `token.colorBgContainer`; no CSS modules, no styled-components; `data-testid` on the root element.

**Known cosmetic residue (acceptable, RESEARCH §2 Asset 4):** the card body still reads `patch.kind` / `patch.version` at `:46-48`. After the rescope `kind` is gone — replace that line with `patch.target` + `patch.id` (or drop the metadata row). Do not leave a dangling `patch.kind`.

**Consumers:**
```typescript
// AiChatWidget.tsx:15
import { PatchDiffApprovalCard } from './widget/PatchDiffApprovalCard';
// AiChatWidget.tsx:491
<PatchDiffApprovalCard patch={turn.pendingApproval.patch} {...artifactApprovalState} ... />
```

**Test analog:** `tests/ai/ArtifactDiffApprovalCard.test.tsx:1-70` — rewrite as `PatchDiffApprovalCard.test.tsx`; drop the `createSdlcWorkflowCoordinator` + `prepareArtifactPatch` setup (`:5,7,37-49`) and build the `proposal` fixture (`:9-15`) directly against the new shape.

---

### 5. `src/services/ai/aiTools.ts` (MODIFIED — tool definitions + dispatch)

**Analog:** a surviving non-SDLC tool definition in the same array (`ssh_list_dir` / `query_tasks` block, `:1840-1863` region) and its `case` in `executeAiTool` (`:2183-2213`).

**Tool definition pattern to copy** (`:1864-1882` region, rewritten):
```typescript
{
  type: 'function',
  function: {
    name: 'get_artifact',
    description:
      'Read the current Markdown of a note or skill: target, id, full current draft, base hash, and the stable section index. Read-only; call it before proposing any edit.',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', enum: ['note', 'skill'], description: 'Document kind to read.' },
        id: { type: 'string', description: 'noteId or skillId of the document.' },
      },
      required: ['target', 'id'],
    },
  },
},
```
`patch_artifact_section` (`:1883-1922`) gets the same `target`/`id` pair prepended; the other six properties and `required` stay identical, with `required: ['target', 'id', 'sectionId', 'expectedHeading', 'baseHash', 'operation', 'newContent']`.

**Delete:** `propose_subsystems` definition (`:1923-1953`) and `propose_research` definition (`:1954-1983`) as whole objects.

**Dispatch pattern** — replace the shared 4-case block (`:2203-2209`):
```typescript
      case 'get_artifact': {
        return JSON.stringify(await readPatchTarget(db, args));
      }

      case 'patch_artifact_section': {
        return JSON.stringify(await preparePatch(db, args));
      }
```
This matches the surrounding style: each `case` returns `JSON.stringify(...)` of a service call (`:2183-2201`).

**Import re-point** (`:74`):
```typescript
// before
import { executeSdlcArtifactTool, type ArtifactToolContext } from './sdlcArtifactTools';
// after
import { preparePatch, readPatchTarget } from './patchProposal';
```

**Options plumbing** (`:2129-2137`) — `artifactContext` disappears entirely under the rescope (RESEARCH §6.3: no context, a missing target is a structured `INVALID_ARGUMENTS` refusal):
```typescript
export interface ExecuteAiToolOptions {
  /** WR-19: the CR a CR-scoped turn is bound to. */
  crScopeId?: string;
}
```
Same removal in `aiOrchestratorLoop.ts:14-18,415` and `chatTurnRuntime.ts:74-75,104-105,141,311,320,384-387`.

**Mutation registration** (`:4802`) — `'patch_artifact_section'` stays in `MUTATION_TOOLS`; the approval gate must keep firing.

**Payload gating** (`chatTurnTools.ts:66`) — remove only `propose_subsystems`/`propose_research`:
```typescript
(allowed !== undefined || !['get_artifact', 'patch_artifact_section'].includes(normalizeToolName(tool.function.name))) &&
```

**Runtime approval branch** (`chatTurnRuntime.ts:382-418`) — collapse the ternary:
```typescript
const prepared: ArtifactToolResult = await preparePatch(deps.db, args);
```
and re-point the imports at `:12-19` to `patchProposal`. `PATCH_TOOL_NAME` (`:158`) stays `'patch_artifact_section'`.

**Test analog:** `tests/ai/aiTools.test.ts:352-353` asserts both names exist — still passes; add absence assertions for the two deleted tools.

---

### 6. `src/db/index.ts` + `src/db/schema.ts` (MODIFIED — Dexie `version(18)` purge)

**Analog:** the `version(16)` `.upgrade()` hook (`src/db/index.ts:331-488`). Copy its three conventions exactly:

1. **Bulk-collect then delete** — never `filter().delete()` on a table directly; read ids, then delete by id inside the same transaction:
```typescript
// index.ts:458-475
const threadRows = (await tx.table('chatThreads').toCollection().toArray()) as Array<Record<string, unknown>>;
const legacyThreadIds = threadRows
  .filter((thread) => typeof thread.scopeKey === 'string' && (thread.scopeKey.startsWith('project:') || thread.scopeKey.startsWith('milestone:')))
  .map((thread) => (typeof thread.id === 'string' ? thread.id : ''))
  .filter((threadId) => threadId !== '');
for (const threadId of legacyThreadIds) {
  await tx.table('chatMessages').where('threadId').equals(threadId).delete();
  await tx.table('chatTabs').where('threadId').equals(threadId).delete();
  await tx.table('chatThreads').delete(threadId);
}
```
2. **Settings purge by key prefix** — same shape as `:479-487`:
```typescript
const settingRows = (await tx.table('settings').toCollection().toArray()) as Array<Record<string, unknown>>;
for (const setting of settingRows) {
  const key = typeof setting.key === 'string' ? setting.key : '';
  if (key.startsWith('sdlc_workflow:')) await tx.table('settings').delete(key);
}
```
3. **`Record<string, unknown>` casts + `typeof` guards** — every row field is narrowed before use, because the upgrade runs against an untyped old schema.

**New version block** — appended after `this.version(17).stores(SCHEMA_V17);` (`:492`), before the `this.on('blocked', ...)` handlers (`:495`):
```typescript
    // Phase 35 (C-16, D-05): SDLC is deleted. Purge its rows — tab, thread, message, and
    // workflow-state settings — so no removed surface can be re-read after the upgrade.
    this.version(18)
      .stores(SCHEMA_V18)
      .upgrade(async (tx) => {
        await tx.table('chatTabs').filter((tab: Record<string, unknown>) => tab.type === 'sdlc').delete();
        const threadRows = (await tx.table('chatThreads').toCollection().toArray()) as Array<Record<string, unknown>>;
        const sdlcThreadIds = threadRows
          .filter((thread) => typeof thread.scopeKey === 'string' && thread.scopeKey.endsWith(':sdlc'))
          .map((thread) => (typeof thread.id === 'string' ? thread.id : ''))
          .filter((threadId) => threadId !== '');
        for (const threadId of sdlcThreadIds) {
          await tx.table('chatMessages').where('threadId').equals(threadId).delete();
          await tx.table('chatTabs').where('threadId').equals(threadId).delete();
          await tx.table('chatThreads').delete(threadId);
        }
        const settingRows = (await tx.table('settings').toCollection().toArray()) as Array<Record<string, unknown>>;
        for (const setting of settingRows) {
          const key = typeof setting.key === 'string' ? setting.key : '';
          if (key.startsWith('sdlc_workflow:')) await tx.table('settings').delete(key);
        }
      });
```
`chatMessages` cleanup is mandatory (RESEARCH L5): `validateBackup` rejects a message whose `threadId` is absent, so a purge without it makes the app's own next export fail.

**Schema constant** — `src/db/schema.ts:121-129` convention (`...SCHEMA_Vn` spread + trailing comment), appended after `SCHEMA_V17`:
```typescript
// Phase 35 (C-16): SDLC rows are purged in the V18 upgrade hook. No index changes —
// the purge is a row delete, not a schema reshape.
export const SCHEMA_V18 = {
  ...SCHEMA_V17,
} as const;
```
Also add `SCHEMA_V18` to the import list at `index.ts:2-20`.

**Version collision:** Phase 36's `aiSkillVersions` becomes **V19** (RESEARCH L4). Report the stale ROADMAP criterion.

**Test analog:** new `tests/db/sdlcPurgeMigration.test.ts`. Follow the existing Dexie test convention (`tests/setup.ts` provides `fake-indexeddb/auto`; construct `new TaskPlannerDatabase(name)` and `await db.delete()` in `finally` — see `tests/ai/ArtifactDiffApprovalCard.test.tsx:35-36,68`).

---

### 7. `src/workbench/store/layoutStore.ts` (MODIFIED — persisted view-type filter)

**Analog:** the existing `partialize` (`:347-368`) and the key-bump precedent documented at `:344-346`.

**Key + comment pattern** (`:106`, `:344-346`):
```typescript
export const LAYOUT_STORAGE_KEY = 'taskmate_workbench_layout_v3';
```
```typescript
      // T-25.4-01: Validate stored state against schema/shape with fallback to defaults on corrupt data
      // T-31.2-16: the persist key moved to `_v2`, so a pre-normalization blob is never read and
      // no retired tool-window or editor-tab id can resolve.
      // Phase 35 (AIO-REMOVE-04): `_v3` retires the `sdlc` editor view type; the filter below
      // also guards any future unknown view type at write time.
```

**Filter inside `partialize`** — replace the `openTabs` expression (`:355-363`) and the `activeTabId` line (`:364`):
```typescript
        openTabs: Array.isArray(state.openTabs) && state.openTabs.length > 0
          ? state.openTabs
              .filter((tab) => tab.viewType !== 'sdlc')
              .slice(0, MAX_OPEN_TABS)
              .map((tab) => ({ ...tab, closable: true, pinned: Boolean(tab.pinned) }))
          : DEFAULT_LAYOUT_STATE.openTabs,
        activeTabId: (() => {
          const tabs = Array.isArray(state.openTabs) ? state.openTabs.filter((tab) => tab.viewType !== 'sdlc') : [];
          return tabs.some((tab) => tab.id === state.activeTabId) ? state.activeTabId : (tabs[0]?.id ?? DEFAULT_LAYOUT_STATE.activeTabId);
        })(),
```
Note: `partialize` runs on **write**, not hydration (RESEARCH L3) — the `_v3` key bump is what makes the first launch drop the stale `_v2` blob. Do both; the key bump alone satisfies the "no `sdlc` tab survives" clause, the filter satisfies the "any future unknown view type" clause.

Also remove `| 'sdlc'` from `EditorViewType` (`:18`).

**Test analog:** `src/workbench/__tests__/layoutStore.test.ts:21` asserts the literal `_v2` string — update to `_v3` and add the hydrate-with-`sdlc`-tab case (RESEARCH §10).

---

## Shared Patterns

### Error handling — structured refusal, never throw
**Source:** `src/services/ai/sdlcArtifactTools.ts:163-169`
**Apply to:** every function in `patchProposal.ts`
```typescript
function refuse(code: ArtifactToolRefusalCode, message: string, extra: Partial<ArtifactToolRefusal> = {}): ArtifactToolRefusal {
  return { refused: true, code, message, ...extra };
}
function isRefusal(result: ArtifactToolResult): result is ArtifactToolRefusal {
  return (result as ArtifactToolRefusal).refused === true;
}
```
Callers test with `if (isRefusal(x)) return x;` and cast the survivor. Messages are Vietnamese, user-facing, actionable ("Hãy đọc lại danh sách mục rồi đề xuất lại.").

### Validation at trust boundaries
**Source:** `src/services/ai/sdlcArtifactTools.ts:175-182` (zod `safeParse` on model-supplied args)
**Apply to:** `patchProposal.ts` arg parsing, `aiTools.ts` tool schemas
```typescript
const parsed = patchArgsSchema.safeParse(rawArgs);
if (!parsed.success) {
  return refuse('INVALID_ARGUMENTS', `Đối số không hợp lệ: ${parsed.error.issues.map((issue) => issue.message).join('; ')}.`);
}
```
Never `parse()` (throws), never trust `args` shape. Model output is untrusted by convention throughout this module (see `:586-589` comment).

### React component shape (project-wide)
**Source:** `src/components/common/EmptyState.tsx:4-9`, `src/components/ai/widget/MutationApprovalCard.tsx:6-22`
**Apply to:** `DiffSyntaxHighlighter.tsx`, `PatchDiffApprovalCard.tsx`
- Named `export const X: React.FC<Props>` — no default exports.
- `export interface XProps` above the component.
- `const { token } = theme.useToken();` for colors; inline `style={{}}`; no CSS files.
- `data-testid` on the root element for test targeting.

### Dexie migration hook shape
**Source:** `src/db/index.ts:331-488` (`version(16)`)
**Apply to:** the new `version(18)`
- `this.version(n).stores(SCHEMA_Vn).upgrade(async (tx) => { ... })`
- `tx.table('name')` with `Record<string, unknown>` casts and `typeof` guards.
- Collect ids → delete dependents first (`chatMessages` → `chatTabs` → `chatThreads`).
- Numbered step comments (`// 1.`, `// 2.`) naming the phase decision id.

### Zustand persist allowlist
**Source:** `src/workbench/store/layoutStore.ts:341-369`
**Apply to:** the layout store only
- `partialize` is an explicit allowlist; anything not listed vanishes on reload.
- Every field is shape-validated with a `typeof`/`Array.isArray` guard and falls back to `DEFAULT_LAYOUT_STATE`.
- Key bumps (`_v2` → `_v3`) are the sanctioned way to retire persisted shapes.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `tests/db/sdlcPurgeMigration.test.ts` | test | batch | No `tests/db/` directory exists yet (`tests/db.test.ts` is a file). Use the `tests/ai/ArtifactDiffApprovalCard.test.tsx:35-36,68` DB-lifecycle pattern (`new TaskPlannerDatabase(name)` / `await db.delete()` in `finally`). |
| `readPatchTarget` (`{noteId}`/`{skillId}` branch) | service | request-response | No existing note/skill read-by-id service. Use `db.notes.get(id)` + `readNoteMarkdown` (`src/utils/noteBody.ts:10`) and `db.aiSkills.get(id)` + `AiSkill.body` (`src/types/aiOffice.ts:58-65`). Field names are Claude's discretion (RESEARCH A1). |

---

## Metadata

**Analog search scope:** `src/services/ai/`, `src/services/wizard/`, `src/components/ai/widget/`, `src/components/common/`, `src/components/sdlc/diff/`, `src/workbench/store/`, `src/db/`, `src/utils/`, `tests/ai/`, `tests/services/ai/`
**Files scanned:** 18 read directly; RESEARCH.md §1-§11 supplied the line-level map for the remainder
**Pattern extraction date:** 2026-11-09

**Extraction hazards carried into planning (from RESEARCH, not re-derived):**
- C8 — `locateSection`/`detectEol`/`applyOperation`/`countLogicalLines` are module-private today; export them.
- C9 — `ArtifactPatchProposal` must move to `patchProposal.ts` **before** the card is renamed, or the renamed card imports a deleted module.
- Hazard 3 — drop `supplyingStep`/`stepNumber`/`missingArtifact` from `ArtifactToolRefusal`.
- Hazard 4 — drop `WorkflowGuardCode` from `ArtifactToolRefusalCode`.
- L3 — `partialize` does not run on hydration; bump the key.
- L5 — the V18 purge must delete orphaned `chatMessages`.
- L6 — `BackupChatTabRecordSchema` is `z.strictObject`; `exportBackup.ts:158` and `backupSchemas.ts:253` change in the same commit.
