---
phase: 28-query-only-knowledge-retrieval
plan: 02
subsystem: ai-knowledge-retrieval
tags: [query-only, federated, zod, grounded-turn, telegram, bm25, mcp, attribution, tauri]

requires:
  - phase: 28-query-only-knowledge-retrieval
    provides: "28-01 server thin query-only /api/v1/retrieve with NO_PUBLISHED_SETS, server-authoritative set discovery and coverage ledger"
provides:
  - "Client FederatedRetrievalRequestSchema mirrored to the server thin wire shape ({query, limit?, setIds?}) with FederatedSetCoverageSchema and coverage ledger"
  - "Catalog-free query-only retrieval in groundedTurn, AI Chat drawer, Telegram and the retrieve_knowledge tool"
  - "Per-excerpt setId/snapshotId attribution, coverage sets and machine-readable status in tool JSON"
  - "Focused regression proof for local BM25 fallback, MCP merge, no-source clarification, tool abort/error envelope"
affects: [28-query-only-knowledge-retrieval, 28-03, 28-04, 28-05]

actuals:
  tokens: 10364
  tasks: 3
  commits: 6
  plan_head_before: ee7e60da9f25e5c6ce9dd5da503c7292bde40918
  plan_head_after: ff2bcedf3ce7f360dd47280b4113dadfa4848c02

tech-stack:
  added: []
  patterns:
    - "Thin untrusted request parsed by strict Zod at both ends; servers own discovery and budgets"
    - "Catalog is best-effort scope input only, never a gate for server-backed retrieval"
    - "Exact optional explicit setIds forwarded verbatim; routed scope retained only for persisted attribution"

key-files:
  created: []
  modified:
    - src/services/knowledge/retrievalProtocol.ts
    - src/services/ai/groundedTurn.ts
    - src/components/ai/AIChatDrawer.tsx
    - src/services/telegram/telegramHeadlessWorker.ts
    - src/services/ai/knowledgeRetrievalTool.ts
    - tests/knowledge/retrievalProtocolParity.test.ts
    - tests/ai/groundedTurn.test.ts
    - tests/ai/knowledgeRetrievalTool.test.ts
    - tests/telegram/telegramHeadlessWorker.test.ts
    - tests/ai/evidencePack.test.ts

key-decisions:
  - "Mirrored the server wire schema exactly; kept FederatedSetTierAssignmentSchema and FederatedRetrievalBudgetsSchema as internal exports because an existing client-schema test still exercises the budgets validator."
  - "Grounded-turn empty-scope clarification is now limited to server disabled + no local sets + no MCP; the server-enabled case always queries by {query, limit}."
  - "Explicit setIds come only from GroundedTurnInput.explicitSetIds / tool args, never from resolvedScope or the local catalog."
  - "Local fallback derives set IDs from the catalog when routed scope is empty, preserving labeled local evidence on an empty server."
  - "Tool status/search counts are derived from response coverage plus citation attribution; NO_PUBLISHED_SETS returns a machine code with no canonical prose (28-04 owns the notice)."

patterns-established:
  - "Wire/persisted separation: resolved scope feeds persisted scope chips only; the wire body is built from query + explicit inputs"
  - "Best-effort catalog load: fetchSetCatalog(db).catch(() => []) so a fresh or broken local catalog never blocks grounded retrieval"

requirements-completed: [SDLC-RET-01, SDLC-RET-05]

coverage:
  - id: D1
    description: "Client wire schema mirrors 28-01 server shape including NO_PUBLISHED_SETS, thin request keys and coverage ledger"
    requirement: SDLC-RET-01
    verification:
      - kind: unit
        ref: "tests/knowledge/retrievalProtocolParity.test.ts#retrieval protocol server/client parity"
        status: pass
    human_judgment: false
  - id: D2
    description: "Server-enabled empty-catalog grounded turn queries by query/limit and does not clarify"
    requirement: SDLC-RET-01
    verification:
      - kind: unit
        ref: "tests/ai/groundedTurn.test.ts#groundedTurn state machine > 16. Server enabled + empty scope -> query-only retrieveFederated without clarify_intent"
        status: pass
    human_judgment: false
  - id: D3
    description: "Explicit setIds are forwarded exactly and the thin wire body omits budgets/comparisonMode/setTierAssignments"
    requirement: SDLC-RET-05
    verification:
      - kind: unit
        ref: "tests/ai/groundedTurn.test.ts#groundedTurn state machine > 16d. Explicit setIds forwarded verbatim in supplied order"
        status: pass
      - kind: unit
        ref: "tests/ai/knowledgeRetrievalTool.test.ts#executeKnowledgeRetrievalTool > forwards explicit setIds exactly, with no catalog lookup"
        status: pass
    human_judgment: false
  - id: D4
    description: "AI tool speaks query-only wire, returns attribution plus machine-readable status, and preserves abort/error/limit contract"
    requirement: SDLC-RET-01
    verification:
      - kind: unit
        ref: "tests/ai/knowledgeRetrievalTool.test.ts#executeKnowledgeRetrievalTool"
        status: pass
    human_judgment: false
  - id: D5
    description: "Offline local BM25 fallback, MCP merge and genuine no-source clarify_intent remain unchanged"
    requirement: SDLC-RET-01
    verification:
      - kind: unit
        ref: "tests/ai/groundedTurn.test.ts#groundedTurn state machine > 16e. Server disabled + no local sets + no MCP still clarifies with unchanged question text"
        status: pass
      - kind: unit
        ref: "tests/ai/groundedTurn.test.ts#retrieval source routing matrix"
        status: pass
    human_judgment: false
  - id: D6
    description: "Fresh-device Tauri walkthrough on AI Chat, Analysis Mode tool path and Telegram end to end"
    requirement: SDLC-RET-01
    verification: []
    human_judgment: true
    rationale: "Requires a running knowledge daemon with published sets and real desktop surfaces; unit tests cover the wire seams but not the observed cross-surface answer."

duration: 24min
completed: 2026-11-17
status: complete
---

# Phase 28 Plan 02: Query-Only Knowledge Retrieval Client Surfaces Summary

**Thin query-only wire contract mirrored on the client and wired through groundedTurn, AI Chat, Telegram and the retrieve_knowledge tool, with attribution and regression-proof offline/MCP/clarify behavior**

## Performance

- **Duration:** 24 min (active execution)
- **Started:** 2026-11-17T06:38:34Z
- **Completed:** 2026-11-17T07:02:32Z
- **Tasks:** 3 of 3
- **Files modified:** 10

## Accomplishments

- Client `FederatedRetrievalRequestSchema` mirrors the server thin shape; `NO_PUBLISHED_SETS`, `FederatedSetCoverageSchema` and the diagnostics coverage ledger are in lockstep with a drift-failing parity test.
- `groundedTurn` no longer requires a local document scope when the server is enabled, and builds `{query, limit, includeInferred, recentTurns, setIds?}` without budgets/comparisonMode/setTierAssignments.
- AI Chat drawer and Telegram load the local catalog best-effort and never gate or precede grounded retrieval.
- `retrieve_knowledge` drops `fetchSetCatalog` and the retired empty-catalog error; each excerpt carries set/snapshot attribution and the JSON adds `coverage`, `sets` and machine-readable `status`.
- Dedicated regression cases prove local BM25 fallback, MCP evidence merge, genuine no-source `clarify_intent`, abort rethrow and the existing tool error envelope remain intact.

## Task Commits

Each task followed RED → GREEN:

1. **Task 1: Mirror the thin wire contract** - `853d04ba` (test), `78f2846f` (feat)
2. **Task 2: Catalog-free default retrieval + regressions** - `25248f78` (feat), `64477dec` (test)
3. **Task 3: Query-only tool with attribution** - `27578f6c` (test), `ff2bcedf` (feat)

RED evidence for all three tasks was machine-validated with `gsd_run check tdd-red-evidence` → `RED_EVIDENCE_OK`.

**Plan metadata:** this SUMMARY commit (docs)

## Files Created/Modified

- `src/services/knowledge/retrievalProtocol.ts` - thin wire schema mirror, coverage states/ledger, NO_PUBLISHED_SETS
- `src/services/ai/groundedTurn.ts` - no server-enabled scope gate, query-only wire body, explicit setIds, local fallback set derivation
- `src/components/ai/AIChatDrawer.tsx` - best-effort catalog load
- `src/services/telegram/telegramHeadlessWorker.ts` - best-effort catalog load
- `src/services/ai/knowledgeRetrievalTool.ts` - catalog-free dispatch, excerpt attribution, status/coverage
- Five focused test files plus `tests/ai/evidencePack.test.ts` typed fixture updates for the new coverage field

## Decisions Made

- Retained the old internal budgets/tier-assignment schema exports because `tests/knowledge/retrievalProtocol.test.ts` still validates the budgets schema; they no longer appear on the wire request.
- Kept `resolvedScope` data solely for persisted scope attribution and empty-scope local fallback; it never populates the server request.
- `status.searchedSetCount` is derived from attributed excerpts, `publishedSetCount` from coverage rows, and `contributedSetCount` from `CONTRIBUTED` coverage rows.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] New required coverage field broke downstream typed fixtures**
- **Found during:** Task 1 verification (`tsc --noEmit`)
- **Issue:** Zod `.default([])` makes `coverage` required in the inferred `FederatedRetrievalResponse` output type; existing `evidencePack.test.ts` and `groundedTurn.test.ts` fixtures omitted it.
- **Fix:** Added `coverage: []` to all typed response fixtures.
- **Files modified:** `tests/ai/evidencePack.test.ts`, `tests/ai/groundedTurn.test.ts`
- **Verification:** `npx tsc --noEmit` exited 0.
- **Committed in:** `78f2846f`, `25248f78`

**2. [Rule 3 - Blocking] No local node_modules in the isolated worktree**
- **Found during:** Test setup before Task 1
- **Issue:** Root `node_modules` was absent; installing packages would have hit the Rule 3 package-install gate.
- **Fix:** Symlinked the main checkout's existing gitignored `node_modules` into the worktree; no manifest or lockfile changed.
- **Verification:** All focused Vitest commands ran successfully with the symlinked deps.
- **Committed in:** N/A (untracked gitignored symlink, removed before handoff)

### Acceptance-criteria notes

- Task 2 AC `grep -v '^\s*//' groundedTurn.ts | grep -c setTierAssignments == 0` is not literally met: one occurrence remains in `(resolvedScope as ...).setTierAssignments.map(...)` used only to build persisted scope attribution (scope chips/error rows), never the wire request. The plan's `<action>` explicitly says to keep `resolvedScope` for persisted scope payload; the literal grep contradicts that instruction. The wire body itself was verified to exclude all retired fields by test.
- `tests/ai/AIChatDrawerGroundedWiring.test.tsx` fails 21/24 at stock HEAD in this isolated worktree (React/dnd-kit `useMemo` on null) before any 28-02 edits; it is a pre-existing environmental failure, documented in `.planning/phases/28-query-only-knowledge-retrieval/deferred-items.md`. The drawer's query-only contract is covered by the grounded-turn tests plus static inspection of the best-effort catalog change.

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking) + 2 documented acceptance/scope notes.
**Impact:** All fixes were necessary for correctness or to run tests; no new dependency, no deleted file, no change to `aiOrchestratorLoop.ts`, `groundedTurnDeps.ts`, `aiTools.ts`, or `knowledgeClient.ts`.

## Issues Encountered

- Vitest's verbose and TAP reporters were rejected by the RED-evidence classifier; the JUnit reporter with a qualified test name satisfied `RED_EVIDENCE_OK` for all three tasks.
- An initial `vi.spyOn(documentSetRepo, 'fetchSetCatalog')` in the drawer/Telegram tests broke ESM module loading; it was removed and replaced with assertions on the catalog passed into the mocked `runGroundedTurn`.

## User Setup Required

None - no external service configuration added. The manual Tauri walkthrough remains a phase-level UAT item.

## Next Phase Readiness

Ready for Phase 28 plan 03. Server and client now agree on the query-only wire; 28-03 can migrate any remaining resolved-request fixtures and continue with coverage/budget verification. Live end-to-end verification on AI Chat, Analysis Mode and Telegram with published server sets remains a phase-level UAT item (D6).

---
*Phase: 28-query-only-knowledge-retrieval*
*Completed: 2026-11-17*

## Self-Check: PASSED
