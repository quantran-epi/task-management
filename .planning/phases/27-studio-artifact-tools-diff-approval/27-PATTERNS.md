# Phase 27: Studio Artifact Tools & Diff Approval - Pattern Map

**Mapped:** 2026-11-04
**Files analyzed:** 10 (new + modified)
**Analogs found:** 10 / 10

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/services/ai/sdlcArtifactTools.ts` (new) | service | request-response + transform | `src/services/ai/aiTools.ts` (executeAiTool cases + describeToolMutationWithContext) | exact |
| `src/utils/markdownSections.ts` (new) | utility | transform | `src/utils/sdlcSolutionParser.ts` (fence-aware line scan) | role-match |
| `src/utils/lineDiff.ts` (new) | utility | transform | `src/utils/gitDiffParser.ts` (unified-diff text shape; inverse direction) | role-match |
| `src/components/ai/widget/ArtifactDiffApprovalCard.tsx` (new) | component | request-response (approve/reject) | `src/components/ai/widget/MutationApprovalCard.tsx` + `src/components/agents/DiffHunkView.tsx` (palette) | exact |
| `src/services/ai/aiTools.ts` (modify) | service (registry) | event-driven dispatch | itself — `MUTATION_TOOLS` (4749), `executeAiTool` switch (2001+), `describeToolMutationWithContext` (5031+), `AiToolDefinition` (79-90) | exact |
| `src/components/ai/runtime/chatTurnRuntime.ts` (modify) | runtime state machine | event-driven | itself — approval parking `onMutationCheck` (315-335), `ANALYSIS_MODE_CANCELLATION` (123-131) | exact |
| `src/components/ai/AiChatWidget.tsx` (modify) | component (presentational) | request-response | itself — card mount point (446-455) | exact |
| `src/components/sdlc/chat/StepChatPanel.tsx` (modify) | controller (host) | request-response | itself — `sendMessage` intent routing (338-347), `statusExtensions` Alert pattern (434-467), `onResolveApproval` (430) | exact |
| `src/views/ProjectSdlcView.tsx` (modify) | controller (host state) | CRUD (db.settings) | itself — `saveDraft` (439-446), `handleChatArtifactDraft` (471-479), `handleSolutionExtracted` (449-465) | exact |
| `src/services/wizard/` staleness marker (modify, Q1) | service | transform (hash compare) | `src/services/wizard/stalenessDetector.ts` (report shape) + `workflowCoordinator.ts` `hashText` (39-45) | role-match |

All analogs verified git-tracked (`git ls-files`) — no mirror paths.

## Pattern Assignments

### `src/services/ai/sdlcArtifactTools.ts` (service, new)

**Analog:** `src/services/ai/aiTools.ts`

**Registry/dispatch pattern** — new tool logic lives in a sibling module and is invoked from the two dispatch seams in `aiTools.ts`:

- `executeAiTool` switch (line 2001+): add `case 'get_artifact'` / `case 'patch_artifact_section'` delegating to `sdlcArtifactTools.ts`. Existing error envelope to reuse (lines 4738-4746):
```typescript
return JSON.stringify({ error: `Tool execution failed: ${msg}` });
```
- `describeToolMutationWithContext` (lines 5031-5055): async, receives `db`, returns a human string per tool; switch keyed on `normalizeToolName(toolName)`. The patch describe case extends this to also return the cached payload — extend the return type or resolve payload via a parallel async function; keep the describe string the card header copy.
- Tool definition shape (lines 79-90):
```typescript
export interface AiToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: { type: 'object'; properties: Record<string, any>; required?: string[] };
  };
}
```
- Mutation registration (lines 4749-4792): add `'patch_artifact_section'` to `MUTATION_TOOLS`; leave `get_artifact` out (read-only). `isMutationTool` (4806-4814) then routes it through `onMutationCheck` automatically.
- Tool-name rules: never use `_ide`/`_cc`/`_tool` suffixes or `proxy_`/`tool_` prefixes — `normalizeToolName` (4798-4804) strips them.

**Per-scope context bridge** (Pitfall 2 fix — `executeToolFn` is hardwired in `chatTurnRuntime.ts:265-270` with only `(name, args, db, signal)`): module-level `setArtifactToolContext(scopeKey, ctx)` / `clearArtifactToolContext(scopeKey)` populated by `StepChatPanel` at send time with `{ projectId, crId, stepId, readOnly, getDraft(kind) }`. Safe because one-turn-per-scope is enforced at `StepChatPanel.tsx:214,300`. Clear on turn completion/abort and scope change (mirror `StepChatPanel.tsx:161-168` reset pattern).

### `src/utils/markdownSections.ts` (utility, new — D-05)

**Analog:** `src/utils/sdlcSolutionParser.ts` lines 4-31

Fence-aware line-walk pattern to copy (toggle fence state before matching headings):
```typescript
const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
if (marker) {
  const run = marker[1]!;
  if (!fence) {
    fence = { character: run[0]!, length: run.length };
  } else if (run[0] === fence.character && run.length >= fence.length && !marker[2]!.trim()) {
    fence = undefined;
  }
}
```
Add heading match `/^#{1,6}\s+(.*)$/` outside fences; number hierarchically (h2 → `1`, h3 under it → `1.1`). Export `buildSectionIndex(markdown): ArtifactSection[]` with `{ id, level, title, start, end }`. Unit-test fenced `#` lines (Pitfall 5) and ID stability across unrelated edits (D-05).

### `src/utils/lineDiff.ts` (utility, new — SDLC-ART-02, D-09)

**Analog:** `src/utils/gitDiffParser.ts`

Emit unified-diff-shaped text the existing parser already consumes (`diff --git`/`---`/`+++`/`@@` headers at lines 19-108, `+`/`-`/context lines at 118+). `parseGitDiff(rawDiff)` can then render structured hunks if the card wants them. Zero new deps — hand-rolled LCS over section-scoped lines. Diff stat + cap per research:
```typescript
const added = diffLines.filter((l) => l.startsWith('+')).length;
const removed = diffLines.filter((l) => l.startsWith('-')).length;
if (added + removed > PATCH_LINE_CAP) {
  return { refused: true, code: 'PATCH_TOO_LARGE', added, removed, cap: PATCH_LINE_CAP, message: '...' };
}
```
Propose `PATCH_LINE_CAP = 120` (discretion).

### `src/components/ai/widget/ArtifactDiffApprovalCard.tsx` (component, new)

**Analog 1 (container DNA):** `src/components/ai/widget/MutationApprovalCard.tsx` (full file, 71 lines) — copy structure verbatim, change body:
- `theme.useToken()` token styling, `data-testid`, flex-column gap-8 container.
- Footer buttons: `<Button danger>Từ chối</Button>` / `<Button type="primary">Chấp thuận</Button>` (lines 59-66) — keep copy, add `disabled` for stale state (D-03).
- Do NOT use `renderSafeMarkdown`/`dangerouslySetInnerHTML` for diff lines — render diff lines as React text nodes only (XSS/prompt-injection boundary; research anti-pattern). MutationApprovalCard's markdown body is for the header summary only.

**Analog 2 (diff palette, mandated by 27-UI-SPEC):** `src/components/agents/DiffHunkView.tsx` lines 25-32:
```typescript
const isDark = token.colorBgBase === '#141414' || token.colorTextBase?.includes('255');
const addBg = isDark ? '#23452b' : '#e6ffed';
const delBg = isDark ? '#4d1f24' : '#ffeef0';
const gutterBg = isDark ? '#1f1f1f' : '#f6f8fa';
```
Monospace, `+N/−N` counts, section title + kind/version header, max-height (240px per UI-SPEC) scroll area with own scrollbar.

### `src/services/ai/aiTools.ts` (modify)

Covered above under sdlcArtifactTools. Modification points: `AI_DATABASE_TOOLS`/registry (line 92+), `executeAiTool` switch (2001+), `MUTATION_TOOLS` (4749), `describeToolMutationWithContext` (5031).

### `src/components/ai/runtime/chatTurnRuntime.ts` (modify)

**Analog:** itself, approval flow (lines 315-335 per research; resolver machinery at 149-191):
```typescript
const resolveApproval = (approved: boolean) => {
  const resolver = approvalResolver;
  approvalResolver = null;
  if (!approved) declined = true;
  resolver?.(approved);
};
```
- `abort()` already resolves parked approvals as `false` (line 175) — D-07/abort semantics free.
- Structured cancellation JSON pattern to mirror for refusals (lines 123-131):
```typescript
const DECLINED_CANCELLATION = JSON.stringify({
  cancelled: true,
  message: 'Người dùng đã từ chối thao tác này. Không có dữ liệu nào bị thay đổi.',
});
```
- Extension: `ChatTurnApprovalInfo` gains optional patch payload `{ kind, sectionId, sectionTitle, version, diffText, addedLines, removedLines, baseHash, patchedMarkdown, refusal? }` — additive optional field (research A5: safe for both hosts; verify with `tests/ai/AIChatDrawer.test.tsx`).
- Analysis-mode refusal already exists (`ANALYSIS_MODE_CANCELLATION`, lines 123-126) — recommended to keep mutation classification so patch tool refuses there via D-10 (Pitfall 3, Q2).

### `src/components/ai/AiChatWidget.tsx` (modify)

**Analog:** itself, card mount (lines 446-455):
```typescript
{turn.pendingApproval && (
  <div style={{ padding: '0 16px' }}>
    <MutationApprovalCard
      toolName={turn.pendingApproval.toolName}
      summary={turn.pendingApproval.summary}
      onApprove={() => onResolveApproval(true)}
      onReject={() => onResolveApproval(false)}
    />
  </div>
)}
```
Branch on payload type: patch payload → `ArtifactDiffApprovalCard`; else existing `MutationApprovalCard` untouched.

### `src/components/sdlc/chat/StepChatPanel.tsx` (modify — host wiring)

**Analog:** itself. Three seams:

1. **Intent routing** (`sendMessage`, lines 338-347) — SDLC-ART-05. Existing block diverts artifact requests to a notice; patch-style "thêm X vào solution" requests must proceed as qa turns with artifact tools advertised instead. Distinguish add/patch intent from full-generation intent before `submit(text)`.
2. **Approve interception** — replace direct `onResolveApproval={turn.resolveApproval}` (line 430) with wrapper (research example):
```typescript
const handleResolveApproval = (approved: boolean) => {
  const pending = pendingPatchRef.current;          // set from onAwaitingApproval payload
  if (approved && pending && !isStale(pending)) {
    applyDraft(pending.kind, pending.patchedMarkdown);
    recordDecision(pending, 'approved');
  } else if (!approved) {
    recordDecision(pending, 'rejected');               // D-04: decision only
  }
  turn.resolveApproval(approved);
};
```
Stale check: current draft hash ≠ card `baseHash` (D-03/D-08). Normalize both sides with the same `.trim()` as `hashText` (Pitfall 6).
3. **Refusal surfacing** — `statusExtensions` Alert pattern (lines 434-467):
```typescript
<Alert type={artifactNotice.type} showIcon closable title={...} action={...} />
```
with `Chuyển đến Bước {N}` navigation button (443-448) and `formatGuardMessage(code)` from `src/services/wizard/workflowGuards.ts:44-48` for prerequisite copy. Parse `code` from structured tool result, render at tool transcript position (UI-SPEC §3).
4. **Scope bridge set/clear**: populate `setArtifactToolContext` at send (after the one-turn guard at line 214/300), clear on unmount like existing per-scope refs (lines 161-168) and in `handleClearThread` (349-375).

### `src/views/ProjectSdlcView.tsx` (modify — draft write path)

**Analog:** itself.

- SOLUTION draft persistence (lines 439-446):
```typescript
const saveDraft = useCallback(async (markdown: string) => {
  const crKey = activeCrId || 'default-cr';
  if (activeCrRef.current === activeCrId) setIncomingSolutionDraft(markdown);
  await db.settings.put({ key: draftSettingKey(projectId, crKey), value: markdown });
}, [projectId, db, activeCrId]);
```
- PL03B/PL07/CAB draft handlers (lines 471-479) — these are the ephemeral-state getters the per-scope tool context must carry (`getDraft(kind)`), plus `setDraftPl03b` etc. as the approve-write targets.
- Copy rule: never claim "đã lưu/đã duyệt" — existing success copy `Đã chuyển bản nháp {kind} vào trình soạn thảo` is the model.

### Staleness marker (Q1 — modify `src/services/wizard/`)

**Analog:** `src/services/wizard/stalenessDetector.ts` (full file) — reuse `WorkflowStalenessReport` shape `{ staleSteps, reasons }`; the banner consumes it at `src/components/sdlc/common/SdlcStaleBanner.tsx:30-41`. Recommended mechanism (Q1 option a): read-only draft-divergence check (draft hash ≠ committed `artifacts[kind].hash`) computed beside `detectWorkflowStaleness` — no workflow-state mutation, no `commitRevision`/`commitSolution` on the approve path (SDLC-ART-04 forbids). Hash source: `hashText`/`defaultSha256` in `src/services/wizard/workflowCoordinator.ts:39-45`; committed state lives in `db.settings[workflowStorageKey(projectId, crId)]` (coordinator line 34).

## Shared Patterns

### Structured tool results (D-10)
**Source:** `src/components/ai/runtime/chatTurnRuntime.ts:123-131`, `src/services/ai/aiTools.ts:4738-4746`
**Apply to:** all refusal paths (preview/historical, missing prerequisite, oversized patch, section drift, analysis mode)
```typescript
JSON.stringify({ refused: true, code: 'PATCH_TOO_LARGE', message: '<Vietnamese actionable copy>' });
```
Host parses `code`, renders `Alert type="warning" showIcon` (StepChatPanel 434-467 pattern). Never throw / raw JSON / silent downgrade.

### Pre-execution mutation approval (D-07)
**Source:** `src/services/ai/aiOrchestratorLoop.ts:343-376` (dispatch order), `src/components/ai/runtime/chatTurnRuntime.ts:315-335` (parking)
**Apply to:** `patch_artifact_section` only. Compute diff inside the describe step (runs before tool dispatch); cache full payload on pending-approval info; post-approve execution returns the cached/verified structured result. `get_artifact` bypasses this entirely (read-only).

### Text-node rendering of model-produced diff (security)
**Source:** `src/components/agents/DiffHunkView.tsx` (line rendering)
**Apply to:** ArtifactDiffApprovalCard. No `dangerouslySetInnerHTML`, no markdown/HTML rendering of diff lines.

### Normalized hashing (Pitfall 6)
**Source:** `src/services/wizard/workflowCoordinator.ts:39-45`
**Apply to:** diff base capture, `baseHash`, and stale checks — identical `.trim()` normalization everywhere.

### Vietnamese guard copy
**Source:** `src/services/wizard/workflowGuards.ts:30-48` (`WORKFLOW_GUARD_MESSAGES`, `formatGuardMessage`)
**Apply to:** all refusal messages; reuse existing codes where a guard already exists.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/utils/lineDiff.ts` (generation side) | utility | transform | Codebase only *parses* diffs (`gitDiffParser.ts`); no generator exists. Model on parser's unified-diff text shape + hand-rolled LCS. |
| Per-scope tool context bridge | service plumbing | event-driven | No existing mechanism passes host context into `executeAiTool`; nearest pattern is the module-level singleton style used in runtime closures. |

## Metadata

**Analog search scope:** `src/services/ai/`, `src/components/ai/`, `src/components/sdlc/chat/`, `src/services/wizard/`, `src/utils/`, `src/views/`, `src/components/agents/`, `tests/`
**Files scanned:** ~16 read directly, all verified tracked
**Pattern extraction date:** 2026-11-04
