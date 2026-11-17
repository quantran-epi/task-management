---
phase: "28"
slug: "query-only-knowledge-retrieval"
status: completed
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-05"
updated: "2026-11-17"
replanned: "2026-11-17"
---

# Phase 28 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Re-scoped 2026-11-17 to 5 plans over the live surfaces only. This document describes the planned verification contract and its sign-off; the checks themselves run at execution time per plan `<verify>` blocks.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 (root, jsdom) and Vitest 5.0.2 (`knowledge-server`, node) |
| **Config file** | `vite.config.ts` (root), `knowledge-server/vitest.config.ts` (server) |
| **Quick run command (root)** | `npx vitest run tests/knowledge/retrievalProtocolParity.test.ts tests/ai/knowledgeRetrievalTool.test.ts tests/ai/groundedTurn.test.ts tests/ai/evidencePack.test.ts` |
| **Server quick command** | `npm --prefix knowledge-server test -- tests/retrievalProtocol.test.ts tests/federatedRetrieval.test.ts tests/retrievalRoutes.test.ts` |
| **Full suite command** | **Deliberately not run** — the project's full Vitest suite takes about an hour. Per-wave verification is the union of focused commands for the files that wave touched. |
| **Estimated runtime** | Root focused set ~30 s; server focused set ~20 s |

---

## Sampling Rate

- **After every task commit:** Run the single narrowest focused test file for the seam touched.
- **After every plan wave:** Run the union of focused commands for files touched in that wave (never the full suite).
- **Before `/gsd-verify-work`:** All focused commands listed in the Per-Task Verification Map must be green.
- **Max feedback latency:** 60 seconds per task.

---

## Replan Change Log (2026-11-17)

- Re-scoped from 4 to 5 plans: 28-01 server foundation, 28-02 client wire + catalog removal, 28-03 trust guarantees + source inspection, 28-04 canonical notice on live surfaces, 28-05 end-to-end contract + observed walkthrough.
- Removed every deleted Phase 35-06 SDLC/wizard file from plan file sets, `<read_first>` blocks and verify commands. No SDLC code is resurrected.
- Fixed checker C2: the all-unknown explicit `setIds` case is explicitly wired in 28-01 (resolver DEGRADED + UNAVAILABLE ledger → route DEGRADED response) and re-proven at the HTTP boundary in 28-05.
- Fixed checker W1: 28-04 now declares real dependencies on 28-02 and 28-03, shares their files, and runs in wave 4.
- Fixed checker W2: the former 18-file 28-02 is now 10 files after removing deleted SDLC/wizard work; every plan is at or below 15 files.
- Fixed checker INFO: 28-01 `estimate.tasks` is 3; ROADMAP plan list matches the 5-plan, 5-wave structure.
- Added absolute non-regression clauses and focused regression tests for existing `groundedTurn` / `knowledgeRetrievalTool` / `aiOrchestratorLoop` / Telegram flows in every affected plan.

---

## Per-Task Verification Map

Every `<automated>` command in the plans is paired with an observable `<fails_when>` failure signal. This table records the union per task.

| Task ID | Plan / Wave | Requirement (historical ID) | Secure Behavior | Automated Command | File Exists | Status |
|---------|-------------|------------------------------|-----------------|-------------------|-------------|--------|
| 28-01-01 | 01 / 1 | SDLC-RET-01 (setup) | Existing pinned deps installed; manifests unchanged | `test -d knowledge-server/node_modules/vitest && test -d knowledge-server/node_modules/@fastify/cors && echo INSTALLED` | ✅ manifests tracked | ⬜ gated (blocking human) |
| 28-01-02 | 01 / 1 | SDLC-RET-02 | Thin wire → one published set → attributed snapshot-lexical evidence | `npm --prefix knowledge-server test -- tests/snapshotLexicalRetrieval.test.ts tests/perSetRetrievalRouter.test.ts tests/retrievalRoutes.test.ts` | ❌ W0 new tests | ⬜ pending |
| 28-01-03 | 01 / 1 | SDLC-RET-01/05 | Authoritative discovery; all-unknown `setIds` → DEGRADED + full UNAVAILABLE ledger | `npm --prefix knowledge-server test -- tests/publishedSetDiscovery.test.ts tests/retrievalProtocol.test.ts tests/retrievalRoutes.test.ts` | ❌ W0 new tests | ⬜ pending |
| 28-02-01 | 02 / 2 | SDLC-RET-01/05 | Client wire parity mirrors server; existing schemas still pass | `npx vitest run tests/knowledge/retrievalProtocolParity.test.ts` | ✅ partial | ⬜ pending |
| 28-02-02 | 02 / 2 | SDLC-RET-01 | No catalog gate; local/MCP/clarify flows proven unchanged | `npx vitest run tests/ai/groundedTurn.test.ts tests/ai/AIChatDrawerGroundedWiring.test.tsx tests/telegram/telegramHeadlessWorker.test.ts` | ✅ partial | ⬜ pending |
| 28-02-03 | 02 / 2 | SDLC-RET-01/05 | Tool sends thin wire body + attribution; abort/error/clamp unchanged | `npx vitest run tests/ai/knowledgeRetrievalTool.test.ts` | ✅ partial | ⬜ pending |
| 28-03-01 | 03 / 3 | SDLC-RET-02/03 | Real deadline/cap, coverage ledger, truthful no-success, hop closure, all-unknown stays green | `npm --prefix knowledge-server test -- tests/federatedRetrieval.test.ts tests/publishedSetDiscovery.test.ts tests/retrievalProtocol.test.ts tests/retrievalRoutes.test.ts` | ✅ partial | ⬜ pending |
| 28-03-02 | 03 / 3 | SDLC-RET-03 | Snapshot-aware packing; local/MCP packs unchanged | `npx vitest run tests/ai/evidencePack.test.ts` | ✅ partial | ⬜ pending |
| 28-03-03 | 03 / 3 | SDLC-RET-03 | Attribution persists; local-absent inspection; local-note rendering unchanged | `npx vitest run tests/ai/SourcesPanel.test.tsx tests/ai/CitationChipAndQuickPreview.test.tsx` | ✅ partial | ⬜ pending |
| 28-04-01 | 04 / 4 | SDLC-RET-04 | One pure canonical-outcome module | `npx vitest run tests/ai/knowledgeOutcome.test.ts` | ❌ W0 new test | ⬜ pending |
| 28-04-02 | 04 / 4 | SDLC-RET-04/03 | `server_empty` with ordered local fallback; other outcomes unchanged | `npx vitest run tests/ai/groundedTurn.test.ts` | ✅ partial | ⬜ pending |
| 28-04-03 | 04 / 4 | SDLC-RET-04 | Identical notice on AI Chat + Telegram, grounded + tool-driven; orchestrator untouched | `npx vitest run tests/ai/AIChatDrawerGroundedWiring.test.tsx tests/telegram/telegramHeadlessWorker.test.ts` | ✅ partial | ⬜ pending |
| 28-05-01 | 05 / 5 | SDLC-RET-01..05 | Server HTTP-boundary end-to-end contract incl. all-unknown and empty set | `npm --prefix knowledge-server test -- tests/queryOnlyEndToEnd.test.ts` | ❌ W0 new test | ⬜ pending |
| 28-05-02 | 05 / 5 | SDLC-RET-01..05 | Client surface end-to-end contract incl. cross-surface notice and deleted-path guard | `npx vitest run tests/ai/queryOnlyEndToEnd.test.ts` | ❌ W0 new test | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky. Status is execution-time state; the planning sign-off below certifies the contract, not that the tests have already run.*

---

## Wave 0 Requirements

- [x] `knowledge-server/tests/snapshotLexicalRetrieval.test.ts` — Vietnamese normalization, heading/line/offset provenance, empty corpus, deterministic ranking (28-01 Task 2).
- [x] `knowledge-server/tests/perSetRetrievalRouter.test.ts` — readiness split, lexical fallback, no fabricated snapshot (28-01 Task 2).
- [x] `knowledge-server/tests/publishedSetDiscovery.test.ts` — enumeration order, empty store, explicit unknown/unpublished, `publishedSnapshotIdBySet` producer, all-unknown DEGRADED (28-01 Task 3, 28-03 Task 1).
- [x] Extend `knowledge-server/tests/federatedRetrieval.test.ts` — coverage ledger, deadline with queued work, first-item char cap, all-failed truthfulness, orphan path rejection (28-03 Task 1).
- [x] Extend `knowledge-server/tests/retrievalRoutes.test.ts` — `{query, limit}` accepted, all-unknown `setIds` → DEGRADED + full UNAVAILABLE ledger, mixed known/unknown, auth/origin preserved (28-01 Tasks 2/3, 28-03 Task 1).
- [x] Extend `knowledge-server/tests/retrievalProtocol.test.ts` — thin wire request, new outcome, coverage schema, hop closure, internal snapshot map (28-01, 28-03).
- [x] Extend `tests/knowledge/retrievalProtocolParity.test.ts` — new outcome, attribution, request shape (28-02 Task 1).
- [x] Extend `tests/ai/groundedTurn.test.ts` — empty catalog → server, local/MCP/clarify regression, `server_empty` with ordered fallback (28-02 Task 2, 28-04 Task 2).
- [x] Extend `tests/ai/evidencePack.test.ts` — cross-snapshot citations, conflict attribution, coverage, local/MCP regression (28-03 Task 2).
- [x] Extend `tests/ai/knowledgeRetrievalTool.test.ts` — no catalog call, query-only payload, attribution, abort/error/clamp regression (28-02 Task 3).
- [x] Extend `tests/ai/SourcesPanel.test.tsx` / `tests/ai/CitationChipAndQuickPreview.test.tsx` — set/snapshot details, local-absent excerpt, local-note regression (28-03 Task 3).
- [x] `tests/ai/knowledgeOutcome.test.ts` — exact canonical notice and tool-result detector (28-04 Task 1).
- [x] Extend `tests/telegram/telegramHeadlessWorker.test.ts` — grounded empty notice, tool-driven notice, existing copy regression (28-04 Task 3).
- [x] `knowledge-server/tests/queryOnlyEndToEnd.test.ts` and `tests/ai/queryOnlyEndToEnd.test.ts` — boundary-level zero-local-docs contract (28-05).
- [x] Environment: `npm --prefix knowledge-server install` (existing pinned deps) is declared as a blocking human checkpoint in 28-01 Task 1; it is not a Wave-0 code dependency for planning.
- [x] Framework install: none — existing infrastructure covers the phase; no new package.

---

## Non-Regression Contract (absolute)

Preserve current AI-engine flows. The only permitted behavior changes are the no-local-docs query-only path and truthful empty/unavailable outcomes.

| Preserved flow | Guard | Plan |
|----------------|-------|------|
| `groundedTurn` routing flags, MCP merge, genuine `clarify_intent`, local BM25 fallback + local-only label | Dedicated regression cases assert unchanged kind/label/copy; routing flags untouched | 28-02 Task 2, 28-04 Task 2 |
| `knowledgeRetrievalTool` abort rethrow, error envelope, 10..50 limit clamp, existing output keys | Pre-existing cases kept passing; new fields are additive | 28-02 Task 3 |
| `aiOrchestratorLoop` | Byte-identical (`git diff` empty); existing `onToolResult` seam reused, not changed | 28-04 Task 3 |
| Telegram non-answer copy for all kinds except the new `server_empty` | Existing cases kept passing; only new branch adds copy | 28-04 Task 3 |
| Local/MCP evidence packs and local-note source rendering | Pre-existing cases kept passing; new schema fields default to empty | 28-03 Tasks 2/3 |
| Additional AI tool files (`aiTools.ts`, `groundedTurnDeps.ts`, `semanticScopeRouter.ts`) | Byte-identical (`git diff` empty); read-only verification | 28-02 |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live graph/vector/lexical readiness reporting against a real Neo4j | SDLC-RET-02, SDLC-RET-03 | No Docker/Neo4j/knowledge-server running in this environment; readiness seams are mocked | With the local stack up (`docker compose up -d`), publish one set and query with graph building, ONLINE and failed states; confirm attribution matches each state. |
| Real fresh-device retrieval over the network | SDLC-RET-01, SDLC-RET-02 | Requires a published set on a second device/profile | Publish a set from a device with documents; from a profile with an empty catalog ask a grounded question in AI Chat and via Telegram; confirm evidence plus set/snapshot attribution. |
| Canonical empty notice observed on live surfaces | SDLC-RET-04 | Observed walkthrough, never an autonomous verify | With no published sets, ask a grounded question in AI Chat and via Telegram; confirm the identical notice, then publish a set and confirm it disappears. |

These are the only remaining gates when the live stack is unavailable; mock-based end-to-end tests cover the same contracts at the boundary.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies — every `<automated>` is paired with an observable `<fails_when>`.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers all MISSING references; every new test file is assigned to a task.
- [x] No watch-mode flags.
- [x] Feedback latency < 60s (focused commands only; full suite deliberately excluded).
- [x] `nyquist_compliant: true` set in frontmatter.
- [x] Every plan is at or below 15 files; every plan passes `frontmatter.validate` and `verify.plan-structure` with zero errors and zero warnings.
- [x] Checker C1/C2/W1/W2/W3 and the INFO item are addressed in the replan change log above.
- [x] Absolute non-regression contract is present with focused regression tests per affected flow.
- [x] No deleted SDLC/wizard path is referenced by any phase-28 artifact; SDLC-RET IDs are documented as historical tooling IDs mapped to live user outcomes.
- [x] Supreme goal is preserved end to end: zero-local-docs query-only retrieve works via published sets on live AI surfaces (28-05).

**Approval:** planning sign-off complete 2026-11-17. Live-stack walkthrough remains a human gate at execution time (see Manual-Only Verifications); this is recorded, not waived.
