---
phase: 24
slug: graph-retrieval-optimization
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-10-24
---

# Phase 24 — Validation Strategy

> Targeted validation contract for execution feedback.

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 plus native Node self-check |
| Config | `vite.config.ts`; `knowledge-server/vite.config.ts` |
| Server quick check | `npm --prefix knowledge-server test -- tests/retrievalPlanning.test.ts tests/graphPlanValidation.test.ts` |
| Offline live check | `node scripts/test-knowledge-live.mjs --self-check` |
| Graph benchmark | `npm run graph:benchmark -- --json .planning/phases/24-graph-retrieval-optimization/24-GRAPH-BASELINE.json` |
| Feedback target | < 60 seconds per targeted check; live excluded |

## Sampling Rate

- After each task: exact targeted command from task.
- After each plan: plan `<verification>` targeted files only.
- After Wave 4: run graph benchmark once.
- Before live checkpoint: run self-check plus targeted groundedTurn test. Self-check is preflight only; it cannot replace live proof.
- Live gate: run `npm run test:knowledge:live`; unavailable infrastructure is BLOCKED. BLOCKED preserves blocker details and evidence so far but leaves task, plan, SC-8, and phase incomplete; resume live validation after infrastructure is available. Only explicit live PASS/approved satisfies SC-8.
- No full-suite commands in Phase 24 task verification.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Automated Command | Status |
|---------|------|------|-------------|------------|-----------------|-------------------|--------|
| 24-01-01 | 01 | 1 | D-05–D-10 / SC-3 | T-24-01 | Registry-derived per-seed steps stay closed/bounded | `npm --prefix knowledge-server test -- tests/ontologyPlanning.test.ts` | ⬜ pending |
| 24-01-02 | 01 | 1 | D-11–D-15 / SC-4 | T-24-02 | Unknown relation/depth reach stable codes; one repair; valid seeds survive | `npm --prefix knowledge-server test -- tests/retrievalPlanning.test.ts tests/nineRouterPlanner.test.ts` | ⬜ pending |
| 24-01-03 | 01 | 1 | D-12, D-15 / SC-4 | T-24-03 | Reject-not-clamp; invalid plan never reaches Neo4j | `npm --prefix knowledge-server test -- tests/graphPlanValidation.test.ts tests/graphTraversal.test.ts` | ⬜ pending |
| 24-02-01 | 02 | 2 | D-01 / SC-2 | T-24-05 | Zero-edge snapshot seed survives; ad-hoc expansion removed | `npm --prefix knowledge-server test -- tests/graphSeedPreservation.test.ts tests/graphTraversal.test.ts tests/neo4jRetrievalIntegrity.test.ts` | ⬜ pending |
| 24-02-02 | 02 | 2 | D-02, D-03, D-13, D-19 / SC-2 | T-24-06–08 | SEED_ONLY, failedSeeds, counts, bounded stage flags validate | `npm --prefix knowledge-server test -- tests/retrievalService.test.ts tests/retrievalProtocol.test.ts` | ⬜ pending |
| 24-02-03 | 02 | 2 | SC-1 | T-24-05 | MAIN1.EVT_EVENT fixture proves writer path and graceful degradation | `npm --prefix knowledge-server test -- tests/graphSeedPreservation.test.ts tests/retrievalService.test.ts` | ⬜ pending |
| 24-03-01 | 03 | 3 | D-16, D-17 / SC-5 | T-24-07,09 | Citation-closed package admitted atomically under 0.6 quota | `npm --prefix knowledge-server test -- tests/retrievalFusion.test.ts tests/retrievalService.test.ts` | ⬜ pending |
| 24-03-02 | 03 | 3 | D-18 / SC-5 | T-24-07 | Path/package order independent of Neo4j order | `npm --prefix knowledge-server test -- tests/retrievalFusion.test.ts` | ⬜ pending |
| 24-03-03 | 03 | 3 | D-13, D-19 / SC-5 | T-24-08,10 | Federation preserves severe status/counts/flags/codes/failed seeds | `npm --prefix knowledge-server test -- tests/federatedRetrieval.test.ts tests/retrievalFusion.test.ts` | ⬜ pending |
| 24-04-01 | 04 | 4 | D-02, D-14, D-15, D-19 / SC-6 | T-24-11 | Client/server enums, caps, federated diagnostics match | `npm test -- tests/knowledge/retrievalProtocolParity.test.ts tests/knowledge/retrievalProtocol.test.ts` | ⬜ pending |
| 24-04-02 | 04 | 4 | D-13, D-19, D-20 / SC-6 | T-24-14,25 | Historical grounding parses; new optional metadata remains content-free | `npm test -- tests/ai/groundedAnswerSchemas.test.ts` | ⬜ pending |
| 24-05-01 | 05 | 5 | D-01–D-03 / SC-6 | T-24-27 | Evidence pack preserves identity/counts, not fabricated citations | `npm test -- tests/ai/evidencePack.test.ts` | ⬜ pending |
| 24-05-02 | 05 | 5 | D-02, D-13, D-19 / SC-6 | T-24-15,26 | SEED_ONLY precedes fallback and cannot infer relation | `npm test -- tests/ai/groundedTurn.test.ts` | ⬜ pending |
| 24-05-03 | 05 | 5 | D-02, D-20 / SC-6 | T-24-12 | Telegram handles found entity; MCP is outcome-independent | `npm test -- tests/telegram/telegramHeadlessWorker.test.ts` | ⬜ pending |
| 24-06-01 | 06 | 6 | D-03, D-13 / SC-6 | T-24-13 | Escaped entity cards, CTA, stable chips, partial notice | `npm test -- tests/ai/SeedEntityCard.test.tsx` | ⬜ pending |
| 24-06-02 | 06 | 6 | D-02, D-19, D-20 / SC-6 | T-24-12 | Found-entity card and metadata-only stage diagnostics | `npm test -- tests/ai/GroundedAnswerCard.test.tsx tests/ai/SeedEntityCard.test.tsx` | ⬜ pending |
| 24-06-03 | 06 | 6 | D-03, D-04, D-13, D-19 / SC-6 | T-24-13,15,28,29 | Persisted UI plus one explicit immutable new turn | `npm test -- tests/ai/ChatMessageBubble.test.tsx tests/ai/AIChatDrawerGroundedWiring.test.tsx` | ⬜ pending |
| 24-07-01 | 07 | 4 | D-21 / SC-7 | T-24-16 | Reference fixture covers seven legal categories | `npm test -- tests/ai/graphRetrievalEvaluator.test.ts` | ⬜ pending |
| 24-07-02 | 07 | 4 | D-22 / SC-7 | T-24-16–19 | Evaluator hard-gates correctness and determinism | `npm test -- tests/ai/graphRetrievalEvaluator.test.ts` | ⬜ pending |
| 24-07-03 | 07 | 4 | D-22 / SC-7 | T-24-17,18 | Offline baseline is content-free and fixture-hashed | `npm test -- tests/ai/graphRetrievalEvaluator.test.ts && npm run graph:benchmark -- --json .planning/phases/24-graph-retrieval-optimization/24-GRAPH-BASELINE.json` | ⬜ pending |
| 24-08-01 | 08 | 7 | SC-8 | T-24-20–22 | Native live assertions have injected offline self-check and env-only token | `node scripts/test-knowledge-live.mjs --self-check && npm --prefix knowledge-server test -- tests/liveGraphRetrieval.test.ts` | ⬜ pending |
| 24-08-02 | 08 | 7 | SC-8 | T-24-23 | Disabled/unreachable daemon preserves local BM25/data | `npm test -- tests/ai/groundedTurn.test.ts && node scripts/test-knowledge-live.mjs --self-check` | ⬜ pending |
| 24-08-03 | 08 | 7 | D-03, D-04, D-20 / SC-8 | T-24-20,21,24 | Human records explicit live PASS/approved; BLOCKED is resumable incomplete, never completion | `node scripts/test-knowledge-live.mjs --self-check && npm test -- tests/ai/groundedTurn.test.ts` | ⬜ pending |

## Wave 0 Requirements

- [ ] Add `knowledge-server/tests/ontologyPlanning.test.ts`.
- [ ] Add `knowledge-server/tests/graphPlanValidation.test.ts`.
- [ ] Add `knowledge-server/tests/graphSeedPreservation.test.ts` and MAIN1.EVT_EVENT fixture data.
- [ ] Add `tests/knowledge/retrievalProtocolParity.test.ts`, including federated diagnostic shape parity.
- [ ] Add `tests/ai/SeedEntityCard.test.tsx`.
- [ ] Add graph reference fixture/schema/evaluator and hashed baseline.
- [ ] Add `knowledge-server/tests/liveGraphRetrieval.test.ts`; offline self-check remains runnable.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live graph query families | SC-1, SC-8 | Requires local stack/corpus | Run self-check (preflight only), start stack, set shell token, run live command; record metadata only. Exit 0 = PASS; exit 2 BLOCKED preserves evidence, leaves task/plan incomplete, and resumes later. |
| Seed-only card/find-related | D-03, D-04, SC-8 | Browser interaction | Verify card/counts/no inference, one new broader turn, unchanged original. |
| Diagnostics disclosure | D-19, D-20 | Visual inspection | Expand rows; verify fixed metadata/flags/codes only. |
| Daemon-disabled behavior | SC-8 | Final browser/local persistence | Disable daemon; confirm local BM25 and no data loss. |
| Neo4j tuning | D-22 | Deliberately gated | Require passing hashed baseline before later EXPLAIN/PROFILE. |

## Validation Sign-Off

- [x] Every task has targeted automated verification.
- [x] Live task has offline injected-response self-check.
- [x] Human checkpoint follows automation and supports BLOCKED.
- [x] BLOCKED is resumable incomplete and cannot satisfy task done, SC-8, or phase completion.
- [x] Only explicit live PASS/approved satisfies SC-8; self-check is preflight only.
- [x] No watch-mode or full-suite task commands.
- [x] Federated parity, ChatMessageBubble ownership, and stage flags covered.
- [x] `nyquist_compliant: true`.

**Approval:** revised 2026-10-24 (BLOCKED semantics); execution evidence pending.
