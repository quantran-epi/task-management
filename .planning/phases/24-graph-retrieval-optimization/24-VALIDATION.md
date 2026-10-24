---
phase: 24
slug: graph-retrieval-optimization
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-10-24
---

# Phase 24 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 (root and `knowledge-server`) |
| **Config file** | `vite.config.ts`; `knowledge-server/vite.config.ts` |
| **Quick run command** | `npm --prefix knowledge-server test -- tests/retrievalPlanning.test.ts tests/graphTraversal.test.ts` |
| **Full suite command** | `npm --prefix knowledge-server test && npm test` |
| **Estimated runtime** | ~30 seconds offline; live suite excluded |

---

## Sampling Rate

- **After every task commit:** Run targeted test file named by task.
- **After every plan wave:** Run `npm --prefix knowledge-server test` plus affected root test files.
- **Before `/gsd-verify-work`:** Run `npm --prefix knowledge-server test && npm test`.
- **Live acceptance gate:** Start Docker stack, then run `npm run test:knowledge:live`; report blocked if Docker/Neo4j/knowledge server remain unavailable.
- **Max feedback latency:** 30 seconds for offline checks.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 24-01-01 | 01 | 1 | D-05–D-15 / SC-3–SC-4 | T-24-01 / Tampering | Planner output stays inside closed ontology; invalid relations, directions, endpoints, and hops never reach Neo4j | unit | `npm --prefix knowledge-server test -- tests/retrievalPlanning.test.ts tests/graphTraversal.test.ts` | ✅ extend | ⬜ pending |
| 24-02-01 | 02 | 2 | D-01–D-04 / SC-1–SC-2 | T-24-02 / Tampering | Snapshot-scoped seed survives zero-edge traversal; no relationship inferred | unit / integration | `npm --prefix knowledge-server test -- tests/graphTraversal.test.ts tests/retrievalService.test.ts` | ✅ extend | ⬜ pending |
| 24-03-01 | 03 | 3 | D-16–D-18 / SC-5 | T-24-03 / Tampering | Only ontology-valid, snapshot-consistent, citation-closed graph packages receive bounded protection | unit | `npm --prefix knowledge-server test -- tests/retrievalFusion.test.ts tests/federatedRetrieval.test.ts` | ✅ extend | ⬜ pending |
| 24-04-01 | 04 | 4 | D-02–D-03, D-19–D-20 / SC-6 | T-24-04 / Information disclosure | Client accepts mirrored protocol; diagnostics omit queries, source content, credentials, URLs, stack traces, and Cypher | unit / component | `npm test -- tests/ai/groundedAnswerSchemas.test.ts src/services/ai/groundedTurn.test.ts` | ✅ extend | ⬜ pending |
| 24-05-01 | 05 | 5 | D-21–D-22 / SC-7 | T-24-05 / Resource exhaustion | Bounded reference set measures correctness before any dev-only query profiling | deterministic benchmark | `npm run benchmark` | ✅ harness, ❌ graph fixture | ⬜ pending |
| 24-06-01 | 06 | 6 | SC-8 | T-24-06 / Information disclosure | Auth and snapshot scoping remain intact; offline BM25 works when daemon is absent | live + unit | `npm run test:knowledge:live && npm test -- src/services/ai/groundedTurn.test.ts` | ✅ (live environment required) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Extend `knowledge-server/tests/retrievalPlanning.test.ts` or add `knowledge-server/tests/ontologyPlanning.test.ts` for per-seed derivation, mixed kinds, and all-relations fallback.
- [ ] Extend `knowledge-server/tests/graphTraversal.test.ts` or add `knowledge-server/tests/graphPlanValidation.test.ts` for stable reject codes, one repair, and one-hop fallback; replace silent-clamping assertion.
- [ ] Add seed-preservation coverage for zero-edge seeds, separate counts, and `SEED_ONLY` mapping.
- [ ] Add synthetic `MAIN1.EVT_EVENT` plus `WRITES_TO` writer and supporting chunk to committed fixtures.
- [ ] Add `tests/fixtures/ai/graph-retrieval-reference.json` covering D-21 query categories.
- [ ] Add server/client protocol parity coverage for outcome and reason-code enums.
- [ ] Extend `src/services/ai/groundedTurn.test.ts` so `SEED_ONLY` never triggers local BM25 fallback.
- [ ] Add UI coverage for limited seed-only answer and entity card without inferred relationships.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live `MAIN1.EVT_EVENT` lookup and write-relation retrieval | SC-1, SC-8 | Depends on local Neo4j corpus and knowledge server | Start Docker stack and knowledge server; preflight exact entity lookup; run `npm run test:knowledge:live`; record graceful `SEED_NOT_FOUND` if corpus lacks entity. |
| AI Chat Drawer seed-only card and explicit “find related” action | D-03, D-04 | Requires browser interaction and rendered UI | Submit seed-only query; verify limited text, separate entity card, no inferred relation, and broader retrieval only after explicit action. |
| Neo4j `EXPLAIN`/`PROFILE` tuning | D-22, SC-7 | Requires live database and plan inspection | First record passing correctness baseline; profile only static parameterized queries; rerun same reference set and reject changes reducing quality. |

---

## Validation Sign-Off

- [x] All planned capabilities have targeted automated checks or explicit live/manual gates.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 names missing fixtures and parity coverage.
- [x] No watch-mode flags.
- [x] Offline feedback target < 30s.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** planning contract approved 2026-10-24; execution evidence pending.
