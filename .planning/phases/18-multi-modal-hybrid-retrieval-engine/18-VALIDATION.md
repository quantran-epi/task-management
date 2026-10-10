---
phase: 18
slug: multi-modal-hybrid-retrieval-engine
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-10-10
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2, Node environment |
| **Config file** | `knowledge-server/vitest.config.ts` |
| **Quick run command** | `cd knowledge-server && npx vitest run tests/retrievalProtocol.test.ts tests/retrievalFusion.test.ts tests/retrievalPlanning.test.ts` |
| **Full suite command** | `cd knowledge-server && npm test` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run smallest relevant retrieval test file named by task.
- **After every plan wave:** Run `cd knowledge-server && npm test`.
- **Before `/gsd-verify-work`:** Full suite and `tests/retrievalAcceptance.test.ts` must be green.
- **Max feedback latency:** 45 seconds for targeted unit tests; 120 seconds for full suite.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 18-W0-01 | TBD | 0 | RETR-01, RETR-02 | T-18-01 | Remote embedding remains opt-in; secrets never enter DTOs or logs | protocol/unit | `cd knowledge-server && npx vitest run tests/retrievalProtocol.test.ts tests/embeddingProvider.test.ts` | ❌ W0 | ⬜ pending |
| 18-W0-02 | TBD | 0 | RETR-03, RETR-04 | T-18-02 | Planner output cannot inject Cypher, unknown relations, or unbounded depth | unit | `cd knowledge-server && npx vitest run tests/retrievalPlanning.test.ts tests/graphTraversal.test.ts` | ❌ W0 | ⬜ pending |
| 18-W0-03 | TBD | 0 | RETR-05 | T-18-03 | Slow or unavailable modality returns bounded degraded output without blocking others | unit | `cd knowledge-server && npx vitest run tests/retrievalFusion.test.ts tests/retrievalService.test.ts` | ❌ W0 | ⬜ pending |
| 18-ACC-01 | TBD | final | RETR-01 | — | Pure identifiers resolve without planner invocation | acceptance | `cd knowledge-server && npx vitest run tests/retrievalAcceptance.test.ts -t "identifier"` | ❌ W0 | ⬜ pending |
| 18-ACC-02 | TBD | final | RETR-02 | T-18-01 | Vietnamese query retrieves English `AML_RISK` evidence while provider metadata remains content-free | acceptance | `cd knowledge-server && npx vitest run tests/retrievalAcceptance.test.ts -t "Vietnamese"` | ❌ W0 | ⬜ pending |
| 18-ACC-03 | TBD | final | RETR-03 | T-18-02 | Traversal uses ontology-approved relation types only | acceptance | `cd knowledge-server && npx vitest run tests/retrievalAcceptance.test.ts -t "call chain"` | ❌ W0 | ⬜ pending |
| 18-ACC-04 | TBD | final | RETR-04 | T-18-02 | Impact traversal clamps depth to 1–3 and caps nodes/edges | acceptance | `cd knowledge-server && npx vitest run tests/retrievalAcceptance.test.ts -t "three hop"` | ❌ W0 | ⬜ pending |
| 18-ACC-05 | TBD | final | RETR-05 | T-18-03 | RRF output is sorted, deduplicated, citation-bearing, conflict-preserving, and snapshot-pinned | acceptance | `cd knowledge-server && npx vitest run tests/retrievalAcceptance.test.ts -t "hybrid"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `knowledge-server/tests/retrievalProtocol.test.ts` — strict request/response, outcome, citation, provider-metadata, and secret-exclusion assertions.
- [ ] `knowledge-server/tests/embeddingProvider.test.ts` — local/remote adapter metadata, dimension mismatch, timeout, and opt-in behavior.
- [ ] `knowledge-server/tests/retrievalPlanning.test.ts` — identifier fast path, ambiguity, unknown URN/relation rejection, one repair, fallback.
- [ ] `knowledge-server/tests/graphTraversal.test.ts` — direction/depth/evidence-class validation, parameter binding, hard caps, truncation.
- [ ] `knowledge-server/tests/retrievalFusion.test.ts` — RRF k=60, stable tie order, `(type,id)` dedup, modality provenance, conflict groups.
- [ ] `knowledge-server/tests/retrievalService.test.ts` — snapshot pin, parallel timeout/degraded orchestration, stale modality status.
- [ ] `knowledge-server/tests/retrievalAcceptance.test.ts` — pilot `60000006` acceptance cases for RETR-01 through RETR-05.
- [ ] Deterministic embedding and query-planner stubs — no network/model download required for normal automated tests.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Local `@xenova/transformers@2.17.2` model loads under Node 24 on target Windows host | RETR-02 | Native/transitive binary and corporate TLS behavior depends on target machine | Install service dependencies, start local provider, record cold start, warm query latency, peak RSS, model revision, and 384-dimensional output. Automated suite must still pass without model download. |
| Neo4j 5.26.x `standard-folding` handles accented/unaccented Vietnamese and Oracle identifiers as expected | RETR-01 | Analyzer behavior requires live Neo4j/Lucene index | Build pilot snapshot; query accented/unaccented terms plus `MAIN1.FCL_CYCLE_COUNTER`; compare returned IDs and rankings. Promote normalized shadow property only if acceptance fails. |

---

## Validation Sign-Off

- [x] All planned behaviors have an automated test target or explicit Wave 0 dependency.
- [x] Sampling continuity requires one targeted command after every task.
- [x] Wave 0 lists every currently missing retrieval test fixture.
- [x] No watch-mode flags.
- [x] Targeted feedback latency budget is under 45 seconds.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** pending
