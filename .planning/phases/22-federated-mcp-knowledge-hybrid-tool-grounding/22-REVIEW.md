# Phase 22: Code Review Report

**Reviewed:** 2026-10-20
**Depth:** deep
**Files Reviewed:** 10
**Status:** issues_found

## Summary

Adversarial review for Phase 22 (Federated MCP Knowledge & Hybrid Tool Grounding).
Changes examined across `src/services/ai/intentRouter.ts`, `src/services/ai/mcpClient.ts`, `src/services/ai/mcpRetrievalRunner.ts`, `src/services/ai/groundedTurn.ts`, `src/services/ai/evidencePack.ts`, `src/services/ai/groundedSynthesis.ts`, `src/components/ai/grounded/*`, `src/services/telegram/telegramHeadlessWorker.ts`, and `src/services/telegram/telegramMutationSession.ts`.

4 findings identified: 1 Critical regression causing test suite failure, 1 High resource/routing edge case, 1 Medium UX mismatch, and 1 Low test gap.

---

## Critical Issues

### CR-01: Regression in SourcesPanel deduplication key breaks range deduplication (Failing Test)

**File:** `D:\personal\task-management\src\components\ai\grounded\SourcesPanel.tsx:27`
**Issue:**
In commit `4cccdf1`, deduplication logic in `SourcesPanel` was modified from:
```ts
const key = `${c.documentId}:${c.lineStart}:${c.lineEnd}:${c.publishedContentHash ?? 'local'}`;
```
to:
```ts
const key = `${c.citationId}:${c.documentId}:${c.lineStart}:${c.lineEnd}:${c.publishedContentHash ?? 'local'}`;
```
Prepending `${c.citationId}` makes every citation with a distinct citation ID (e.g. `S1` and `S2`) produce a unique key, completely disabling deduplication across multiple chunks citing the same document line range. This caused `tests/ai/SourcesPanel.test.tsx` (`(a) dedup collapses identical ranges`) to fail in test runs.

**Fix:**
Deduplicate document citations using the document range key while allowing MCP citations (which have dummy line 1..1) to key on `citationId` or `(serverId, toolName, sectionAnchor)`:

```ts
const dedupedMap = new Map<string, PersistedCitation>();
for (const c of citations) {
  const isMcp = c.citationId.startsWith('M') || c.evidenceKind === 'mcp_tool';
  const key = isMcp
    ? `mcp:${c.citationId}`
    : `${c.documentId}:${c.lineStart}:${c.lineEnd}:${c.publishedContentHash ?? 'local'}`;
  if (!dedupedMap.has(key)) {
    dedupedMap.set(key, c);
  }
}
```

---

## High Issues

### CR-02: Missing MCP capabilities injection in AIChatDrawer grounded turn intent routing

**File:** `D:\personal\task-management\src\components\ai\AIChatDrawer.tsx:641-645` and `D:\personal\task-management\src\services\ai\groundedTurn.ts:247-255`
**Issue:**
In `AIChatDrawer.tsx`, `runGroundedTurn` is called via `createDefaultGroundedTurnDeps(...)`. In `telegramHeadlessWorker.ts:788`, `getEnabledMcpCapabilitySummaries(db)` is explicitly awaited and passed to `routeIntent` so the LLM knows about enabled MCP servers (`<enabled_mcp_servers>`).
However, inside `AIChatDrawer.tsx` -> `deps.routeIntent`, `mcpCapabilities` is NEVER passed into `routeIntent`. As a result, when users ask questions in the TaskMate UI drawer (AIChatDrawer), `routeIntent` runs with the default system prompt lacking the `<enabled_mcp_servers>` block. The LLM cannot know which MCP servers exist, leading to `require_mcp: false` and never triggering live MCP retrieval during interactive browser chat.

**Fix:**
Pass `mcpCapabilities` in `createDefaultGroundedTurnDeps` or resolve it dynamically inside `routeIntent`:

In `src/services/ai/groundedTurnDeps.ts`:
```ts
export function createDefaultGroundedTurnDeps(options: { ... }): GroundedTurnDeps {
  ...
  return {
    routeIntent: async (q, d) => {
      const mcpCapabilities = d.mcpCapabilities ?? await getEnabledMcpCapabilitySummaries(database);
      return routeIntent(q, { ...d, mcpCapabilities });
    },
    ...
  };
}
```

---

## Medium Issues

### WR-01: QuickPreviewDrawer displays broken document view when clicking MCP citations

**File:** `D:\personal\task-management\src\components\ai\AIChatDrawer.tsx:1940-1957`
**Issue:**
When a user clicks on an `[M1]` CitationChip inside `GroundedAnswerCard` or activates it in `CitationGroup`, `onCitationActivate(c)` triggers `setActivePreviewCitation(c)`. This opens `QuickPreviewDrawer` with `docId="mcp:server:tool"`.
`QuickPreviewDrawer` queries `db.notes.get("mcp:server:tool")`, which returns `null`. It then shows a blank modal "Xem nhanh tài liệu" with a disabled "Mở trong Docs" button.
`SourcesPanel` already handles this correctly with its own dedicated detail modal (`selectedMcp`), but clicking the chip directly in the prose/claims opens `QuickPreviewDrawer`.

**Fix:**
In `AIChatDrawer.tsx`, intercept MCP citations in `handleCitationActivate`:
```ts
const handleCitationActivate = (citation: PersistedCitation) => {
  const isMcp = citation.citationId.startsWith('M') || citation.evidenceKind === 'mcp_tool';
  if (isMcp) {
    // Open dedicated MCP modal or view instead of document note preview
    setSelectedMcpCitation(citation);
    return;
  }
  setActivePreviewCitation(citation);
};
```

---

## Low Issues

### IN-01: Missing test assertion for `mcpCapabilities` in AIChatDrawer

**File:** `tests/ai/groundedTurn.test.ts`
**Issue:**
Unit tests verify `require_mcp: true` dispatch in `groundedTurn` when mock `routeIntent` manually returns `require_mcp: true`, but no end-to-end component test verifies that `AIChatDrawer` actually passes MCP capabilities to the router.

**Fix:**
Add integration test checking `createDefaultGroundedTurnDeps` forwards `getEnabledMcpCapabilitySummaries` to `routeIntent`.

---

_Reviewed: 2026-10-20_
_Reviewer: Adversarial Code Reviewer_
_Depth: deep_
