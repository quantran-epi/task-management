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

| Task ID | Producer Plan / Task | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|----------------------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 18-W0-01 | `18-01` / `18-W0-01` | 1 | RETR-01..RETR-05 | T-18-01 | Strict request/response, provider metadata, citations, outcomes, and secret exclusion | protocol/unit | `npm --prefix knowledge-server test -- tests/retrievalProtocol.test.ts` | ❌ W0 — producer `18-01` | ⬜ pending |
| 18-W0-EMBED | `18-02` / `18-W0-EMBED` | 2 | RETR-02, RETR-05 | T-18-01, T-18-05 | Local/remote adapter metadata, dimensions, timeout, opt-in, host allowlist, and zero-secret behavior | unit/spike | `npm --prefix knowledge-server test -- tests/embeddingProvider.test.ts tests/main.test.ts` | ❌ W0 — producer `18-02` | ⬜ pending |
| 18-W0-02A | `18-04` / `18-W0-02A` | 2 | RETR-01, RETR-03, RETR-04 | T-18-02, T-18-04 | Pure identifier classifier and pinned collision-safe entity resolution | unit | `npm --prefix knowledge-server test -- tests/retrievalPlanning.test.ts -t "classifier|resolution|ambiguity|registry"` | ❌ W0 — producer `18-04` | ⬜ pending |
| 18-W0-02B | `18-04` / `18-W0-02B` | 2 | RETR-03, RETR-04, RETR-05 | T-18-01, T-18-02 | Strict planner, one repair, no raw Cypher, executable clarification with no guessed seed | unit | `npm --prefix knowledge-server test -- tests/retrievalPlanning.test.ts` | ❌ W0 — producer `18-04` | ⬜ pending |
| 18-W0-02C | `18-05` / `18-W0-02C` | 3 | RETR-03, RETR-04 | T-18-02, T-18-03 | Static parameterized templates, closed relations, evidence gates, depth/candidate/node/edge caps | unit | `npm --prefix knowledge-server test -- tests/graphTraversal.test.ts -t "validation|static|evidence|seed"` | ❌ W0 — producer `18-05` | ⬜ pending |
| 18-W0-03A | `18-06` / `18-W0-03A` | 2 | RETR-05 | T-18-03, T-18-04 | RRF k=60, deterministic typed dedup, cutoff, integrity, and stable order | unit | `npm --prefix knowledge-server test -- tests/retrievalFusion.test.ts -t "RRF|dedup|tie|cutoff|integrity"` | ❌ W0 — producer `18-06` | ⬜ pending |
| 18-W0-03B | `18-07` / `18-W0-03B` | 4 | RETR-01..RETR-05 | T-18-01, T-18-03, T-18-04 | Pinned parallel fan-out, independent deadlines, explicit NO_GRAPH_SEED, clarification still starts all modalities | unit | `npm --prefix knowledge-server test -- tests/retrievalService.test.ts -t "parallel|clarification|timeout|lease|mismatch|NO_GRAPH_SEED"` | ❌ W0 — producer `18-07` | ⬜ pending |
| 18-ACC-01 | `18-09` / `18-ACC-01..04` | 6 | RETR-01 | T-18-02 | Pure identifiers resolve without planner invocation | acceptance | `npm --prefix knowledge-server test -- tests/retrievalAcceptance.test.ts -t "identifier"` | ❌ W0 — producer `18-09` | ⬜ pending |
| 18-ACC-02 | `18-09` / `18-ACC-01..04` | 6 | RETR-02 | T-18-01, T-18-05 | Vietnamese query retrieves English evidence with content-free provider metadata | acceptance | `npm --prefix knowledge-server test -- tests/retrievalAcceptance.test.ts -t "Vietnamese"` | ❌ W0 — producer `18-09` | ⬜ pending |
| 18-ACC-03 | `18-09` / `18-ACC-01..04` | 6 | RETR-03 | T-18-02 | Traversal uses ontology-approved relation types and expected call-chain sequence | acceptance | `npm --prefix knowledge-server test -- tests/retrievalAcceptance.test.ts -t "call chain"` | ❌ W0 — producer `18-09` | ⬜ pending |
| 18-ACC-04 | `18-09` / `18-ACC-01..04` | 6 | RETR-04 | T-18-02, T-18-03 | Impact traversal stays within 1–3 hops and hard result caps | acceptance | `npm --prefix knowledge-server test -- tests/retrievalAcceptance.test.ts -t "three hop"` | ❌ W0 — producer `18-09` | ⬜ pending |
| 18-ACC-05 | `18-09` / `18-ACC-05` | 6 | RETR-05 | T-18-01, T-18-03, T-18-04 | Hybrid result is sorted, deduplicated, citation-bearing, conflict-preserving, snapshot-pinned, and truthfully degraded | acceptance | `npm --prefix knowledge-server test -- tests/retrievalAcceptance.test.ts -t "hybrid|degraded|snapshot|injection"` | ❌ W0 — producer `18-09` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ W0 means test file does not exist yet and named producer task creates it · ⚠ flaky*

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
