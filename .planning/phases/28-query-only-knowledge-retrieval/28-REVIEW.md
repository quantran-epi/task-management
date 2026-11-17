---
phase: 28-query-only-knowledge-retrieval
reviewed: 2026-11-17T08:49:08Z
depth: standard
files_reviewed: 37
files_reviewed_list:
  - knowledge-server/src/indexing/snapshotStore.ts
  - knowledge-server/src/main.ts
  - knowledge-server/src/routes/retrieval.ts
  - knowledge-server/src/server.ts
  - knowledge-server/src/services/federatedRetrievalService.ts
  - knowledge-server/src/services/perSetRetrievalRouter.ts
  - knowledge-server/src/services/publishedSetDiscovery.ts
  - knowledge-server/src/services/snapshotLexicalRetrieval.ts
  - knowledge-server/src/types/retrievalProtocol.ts
  - knowledge-server/tests/federatedRetrieval.test.ts
  - knowledge-server/tests/perSetRetrievalRouter.test.ts
  - knowledge-server/tests/publishedSetDiscovery.test.ts
  - knowledge-server/tests/queryOnlyEndToEnd.test.ts
  - knowledge-server/tests/retrievalProtocol.test.ts
  - knowledge-server/tests/retrievalRoutes.test.ts
  - knowledge-server/tests/snapshotLexicalRetrieval.test.ts
  - src/components/ai/AIChatDrawer.tsx
  - src/components/ai/ChatMessageBubble.tsx
  - src/components/ai/grounded/SourcesPanel.tsx
  - src/components/notes/QuickPreviewDrawer.tsx
  - src/services/ai/evidencePack.ts
  - src/services/ai/groundedAnswerSchemas.ts
  - src/services/ai/groundedTurn.ts
  - src/services/ai/knowledgeOutcome.ts
  - src/services/ai/knowledgeRetrievalTool.ts
  - src/services/knowledge/retrievalProtocol.ts
  - src/services/telegram/telegramHeadlessWorker.ts
  - tests/ai/AIChatDrawerGroundedWiring.test.tsx
  - tests/ai/CitationChipAndQuickPreview.test.tsx
  - tests/ai/SourcesPanel.test.tsx
  - tests/ai/evidencePack.test.ts
  - tests/ai/groundedTurn.test.ts
  - tests/ai/knowledgeOutcome.test.ts
  - tests/ai/knowledgeRetrievalTool.test.ts
  - tests/ai/queryOnlyEndToEnd.test.ts
  - tests/knowledge/retrievalProtocolParity.test.ts
  - tests/telegram/telegramHeadlessWorker.test.ts
findings:
  critical: 0
  warning: 3
  info: 0
  total: 3
  necessity: 1
open_findings: 0
re_reviewed: 2026-11-17T09:17:40Z
re_review_status: pass
status: clean
fix_status: all_fixed
fixed_at: 2026-11-17T16:10:00Z
fix_iteration: 1
fix_commits:
  - 7581f6ea
  - a297ed31
  - c64ecda6
---

# Phase 28: Code Review Report

**Reviewed:** 2026-11-17T08:49:08Z
**Depth:** standard
**Files Reviewed:** 37
**Status:** clean (all 3 warnings fixed and re-verified; 0 open findings)
**Fix Status:** all_fixed (2026-11-17T16:10:00Z, iteration 1)

## Fix Disposition

All three warnings were addressed in the isolated worktree `gsd/phase-28-isolated`.
The original findings below are retained for traceability.

| ID | Disposition | Commit | Evidence |
|----|-------------|--------|----------|
| WR-01 | fixed | `7581f6ea` | Lexical no-match now emits fulltext `ok`/`itemCount: 0`/`NO_MATCHING_CHUNKS` and `degraded: false`; the aggregator no longer treats disclosed structural vector/graph `NO_RETRIEVAL_GENERATION` as a failure. Focused tests `queryOnlyEndToEnd`, `snapshotLexicalRetrieval`, `federatedRetrieval`, `retrievalRoutes`, `publishedSetDiscovery`: 61 passed. New E2E case asserts a real published-only no-match is `NO_EVIDENCE` (not `DEGRADED`) with full `SEARCHED_NO_EVIDENCE` coverage. |
| WR-02 | fixed | `a297ed31` | `formatGroundedNonAnswer` keeps the canonical notice byte-identical and appends `localFallback` under a `*(Chỉ dữ liệu nội bộ)*` label via the existing formatter; step-6 handler sends the combined reply. Focused `telegramHeadlessWorker` tests: 53 passed (formatter + end-to-end both assert notice and labeled local evidence). |
| WR-03 | fixed | `c64ecda6` | `getSetReadiness` removed from `QueryOnlyScopeDeps`, `QueryOnlyRouteDependencies`, both resolver call sites, the route fallback, and the unused `SetReadiness` type; tests/fixtures updated. `main.ts` already supplied only `listPublishedSets` so needed no change. Knowledge-server `tsc --noEmit`: clean; 5 focused test files: 61 passed. |

Verification: focused tests only (no full suite). Both `knowledge-server` and root
`tsc --noEmit` pass. Residual risk: WR-01 changes federated outcome calculation for
the disclosed-absence shape; the `hasNonOkModality` exemption is limited to secondary
modalities with reason `NO_RETRIEVAL_GENERATION`, and all existing DEGRADED paths
(failed/timed-out sets, coverage warnings, fulltext failures) remain covered by the
federated regression tests. A live end-to-end walkthrough (per 28-VALIDATION.md) was
not re-run in this fix pass.

## Re-Review Verification (post-fix)

Re-reviewed at `standard` depth in the isolated worktree against commits
`7581f6ea` (WR-01), `a297ed31` (WR-02), `c64ecda6` (WR-03). Result: **PASS — all
three fixes verified, no new critical or warning introduced.**

- **WR-01 — PASS.** `snapshotLexicalRetrieval.ts:122-157` splits the empty envelope:
  the genuine no-match path (`items.length === 0` at `:190-192`) emits `fulltext`
  `status: 'ok'`, `itemCount: 0`, `reason: 'NO_MATCHING_CHUNKS'`, and
  `diagnostics.degraded: false`; the ABORTED path stays fully unavailable/degraded.
  `federatedRetrievalService.ts:623-634` exempts only secondary modalities that are
  `unavailable` with reason `NO_RETRIEVAL_GENERATION`; `fulltext` is never excused,
  and error/timeout/stale/truncated still degrade. Genuine failures remain DEGRADED:
  partial set rejection (`federatedRetrieval.test.ts:194-221`), all-failed
  (`:791-805`), coverage-warning and budget-stop paths (`:301, :346, :541, :832`)
  all still assert DEGRADED, and `noSuccessfulSet`/`hasSetRejection` still force
  DEGRADED at `federatedRetrievalService.ts:649-651`. Refine routing is preserved:
  `groundedTurn.ts:973-993` routes `NO_EVIDENCE`/`UNSUPPORTED` to `refine`, and the
  real published-only no-match E2E case (`queryOnlyEndToEnd.test.ts:256-283`)
  asserts `NO_EVIDENCE`, `degraded: false`, and a full `SEARCHED_NO_EVIDENCE`
  coverage row. The fixture (`buildE2EApp`, `:88-109`) uses the real route +
  resolver + `createPerSetRetriever` with no graph retrieval service, so it is the
  true published-only/lexical path.
- **WR-02 — PASS.** `telegramHeadlessWorker.ts:560-574` keeps
  `KNOWLEDGE_SERVER_EMPTY_NOTICE` byte-identical (single canonical constant at
  `knowledgeOutcome.ts:13-14`) and appends the local fallback under the
  `*(Chỉ dữ liệu nội bộ)*` label via the existing `formatGroundedAnswerForTelegram`.
  Both call sites (mixed path `:1265-1296`, step-6 path `:1350-1379`) send the
  combined `terminalReply` through `markdownToTelegramHtml` before any early return.
  Tests assert the notice appears exactly once and first, the local-only label and
  evidence are present, and the sent HTML contains `<i>(Chỉ dữ liệu nội bộ)</i>`.
- **WR-03 — PASS.** Repo-wide grep finds zero occurrences of `getSetReadiness` or
  `SetReadiness` in any `.ts`/`.tsx` source or test. Removed from the deps
  interface, resolver call sites, route type and fallback wiring
  (`retrieval.ts:69-73, :199-200`), and fixtures; no phantom dependency remains.
- **No AI-engine regression.** The fix range touches no AI-engine service
  (`groundedTurn`, `evidencePack`, `knowledgeRetrievalTool`, `knowledgeOutcome`,
  `groundedAnswerSchemas`) — only the Telegram formatter, knowledge-server
  services/routes, and their tests.
- **No new dependency.** No `package*.json` or lock file changed in the fix range.
- **No phase 44 contact.** No file or diff content in the fix range references
  phase 44 or later-phase planning artifacts.
- **Verification run:** knowledge-server focused tests — 5 files / 61 passed;
  Telegram focused tests — 1 file / 53 passed; knowledge-server and root
  `tsc --noEmit` — both clean. Full suite not run (per project convention).

## Summary

Reviewed the full Phase 28 query-only knowledge retrieval surface (server discovery/lexical fallback/federation/protocol, client tool/grounded-turn/outcome/evidence pack, React surfaces, Telegram worker, and all phase tests) at standard depth on `gsd/phase-28-isolated`. The security-sensitive shape of the change is sound: strict wire schemas, exact-match explicit `setIds`, bounded fan-out/deadline, snapshot-pinned citation closure, and a single canonical empty-server constant are all present and parity-tested. The pre-existing `AIChatDrawerGroundedWiring.test.tsx` failure is treated as documented deferred context, not a phase-28 regression.

Three actionable findings surfaced, all in behavior that is fully reachable in the primary production scenario (query-only against published-only sets with no Neo4j). Two are correctness defects where the implemented outcome/message handling diverges from the user-locked D-14/D-15 decisions; one is a necessity defect (a dependency that is never wired in production and whose result is always discarded). No security vulnerabilities or data-loss risks were found. No critical issues. All three fixes have since been verified in the post-fix re-review above; zero open findings remain.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: Lexical no-match is mislabeled `DEGRADED`, bypassing D-15 refinement guidance

**File:** `knowledge-server/src/services/federatedRetrievalService.ts:561-579` (with `knowledge-server/src/services/snapshotLexicalRetrieval.ts:129-133,191-194` and `src/services/ai/groundedTurn.ts:973-993`)

**Issue:** On a fresh device the knowledge server runs without Neo4j, so every published set is served by `retrieveFromPublishedSnapshot`. When a query matches nothing, that function returns `outcome: 'NO_EVIDENCE'` but with **all three modality statuses set to `unavailable`** (`NO_RETRIEVAL_GENERATION`) and `diagnostics.degraded: true` (`snapshotLexicalRetrieval.ts:129-133`). The federated aggregator merges `unavailable` (severity 2) over its default `ok` (severity 1), so `hasNonOkModality` becomes true and the outcome is forced to `DEGRADED` (`federatedRetrievalService.ts:563-578,614-634`) — even though no set failed or timed out.

Downstream, `runGroundedTurn` routes to the `refine` result (the "published sets searched but no evidence → guide query refinement" case of D-15) **only** when `outcome === 'NO_EVIDENCE' || 'UNSUPPORTED'` (`groundedTurn.ts:973-978`). A `DEGRADED` outcome with zero items instead falls through to synthesis, which hits the zero-evidence abstention guard and returns a `grounded_answer` with `confidence: 'unknown'` and no refinement chips. The user gets an "Không tìm thấy thông tin..." answer with no next-step guidance, contradicting D-15.

This is provably inconsistent with the phase's own test suite: `federatedRetrieval.test.ts:577-581` (`yields NO_EVIDENCE when all sets are empty`) passes only because its mocked empty response uses `ok` modality statuses (`federatedRetrieval.test.ts:415-419`); the real lexical no-match path uses `unavailable` statuses and is never exercised end-to-end through federation.

**Fix:** A lexical "no matching chunks" result is a *successful empty search*, not an unavailable modality — fulltext was queried and found zero rows. Model it like the tested empty response. In `snapshotLexicalRetrieval.ts`, both `unavailableEnvelope` and the READY branch's modality map should report `fulltext: { status: 'ok', itemCount: 0, reason: 'NO_MATCHING_CHUNKS' }` (keeping vector/graph `unavailable` is fine as long as the aggregator does not treat a structural lexical-only shape as a failure), and set `diagnostics.degraded: false` for the no-match case. Concretely, split the current `unavailableEnvelope` into a no-match envelope with an `ok`-empty fulltext status so the federated outcome stays `NO_EVIDENCE` and `groundedTurn` routes to `refine`. Add an end-to-end test in `knowledge-server/tests/queryOnlyEndToEnd.test.ts` that posts a query matching no lexical chunk against a published-only set and asserts `outcome === 'NO_EVIDENCE'` (not `DEGRADED`) with a full `SEARCHED_NO_EVIDENCE` coverage row.

### WR-02: Telegram drops the `localFallback` evidence on a `server_empty` turn

**File:** `src/services/telegram/telegramHeadlessWorker.ts:560-564` (and its caller at `src/services/telegram/telegramHeadlessWorker.ts:1353-1369`)

**Issue:** `runGroundedTurn` intentionally returns `{ kind: 'server_empty', notice, localFallback }` when the server has no published sets but the local catalog has documents (`groundedTurn.ts:729-746`). D-14 requires that the canonical notice be kept **and** the local evidence attach as a separately labeled `authority: 'local'` fallback. The AI Chat surface implements this correctly (`AIChatDrawer.tsx:1518-1540`: system notice row, then a second assistant row with `grounding: localFallback`).

Telegram does not. `formatGroundedNonAnswer` returns only `result.notice || KNOWLEDGE_SERVER_EMPTY_NOTICE` and ignores `result.localFallback` entirely (`telegramHeadlessWorker.ts:561-564`). The step-6 knowledge handler (`telegramHeadlessWorker.ts:1353-1369`) treats that as a terminal reply, sends only the notice, and returns. A Telegram user on a device that *does* have local documents, querying an empty server, therefore loses the labeled local answer that D-14 mandates and that the AI Chat surface preserves — a cross-surface parity gap in the exact scenario this phase targets. The mixed-request path (`telegramHeadlessWorker.ts:1269-1286`) calls the same formatter and drops it too.

**Fix:** Render the local fallback alongside the notice. For example:

```ts
if (result.kind === 'server_empty') {
  const notice = result.notice || KNOWLEDGE_SERVER_EMPTY_NOTICE;
  if (result.localFallback) {
    const localText = formatGroundedAnswerForTelegram(result.localFallback);
    return localText.trim()
      ? `${notice}\n\n*(Chỉ dữ liệu nội bộ)*\n\n${localText}`
      : notice;
  }
  return notice;
}
```

Also verify the step-6 handler does not return before this combined reply is sent. Add a focused test in `tests/telegram/telegramHeadlessWorker.test.ts` asserting that a `server_empty` result carrying `localFallback` produces a reply containing both the canonical notice and the local-only-labeled evidence.

### WR-03: Necessity — `getSetReadiness` is unwired in production and its result is always discarded

**File:** `knowledge-server/src/services/publishedSetDiscovery.ts:22-25,108,138` (with `knowledge-server/src/main.ts:509-511` and `knowledge-server/src/routes/retrieval.ts:70-73,205-207`)

**Category:** necessity

**Issue:** `QueryOnlyScopeDeps.getSetReadiness` is a required dependency of the scope resolver, and the route declares an optional `QueryOnlyRouteDependencies.getSetReadiness`. But: (1) production never supplies it — `main.ts:509-511` builds `queryOnlyDeps` with only `listPublishedSets`, so the route falls back to the constant `async () => 'PUBLISHED_ONLY'` (`retrieval.ts:205-206`); and (2) at both call sites the returned `SetReadiness` value is discarded (`await deps.getSetReadiness(setId);` with no assignment, lines 108 and 138). Comments claim it "seeds truthful attribution", but the value never reaches a decision — readiness neither adds nor removes a set nor changes coverage, and the tests that pass differing values (e.g. `publishedSetDiscovery.test.ts:84-90`) get identical behavior. Truthful graph-capability disclosure is actually driven by modality status in the retrieval response (see `snapshotLexicalRetrieval.ts:191-195` and WR-01), which fully owns the D-02 concern. This is a phantom requirement / generality without instantiation: code that runs but defends against nothing.

**Fix:** Remove `getSetReadiness` from `QueryOnlyScopeDeps`, `QueryOnlyRouteDependencies`, both resolver call sites, and the route's fallback wiring. Rely on the per-set modality status already returned in the retrieval response for D-02 disclosure. If a real readiness signal is later needed, define it with a concrete consumer that changes a decision, not a discarded `await`.

---

_Reviewed: 2026-11-17T08:49:08Z_
_Re-reviewed: 2026-11-17T09:17:40Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
