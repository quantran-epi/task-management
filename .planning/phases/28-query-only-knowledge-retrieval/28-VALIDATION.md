---
phase: "28"
slug: "query-only-knowledge-retrieval"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-05"
---

# Phase 28 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 (root, jsdom) and Vitest 5.0.2 (`knowledge-server`, node) |
| **Config file** | `vite.config.ts` (root), `knowledge-server/vitest.config.ts` (server) |
| **Quick run command** | `npx vitest run tests/ai/groundedTurn.test.ts tests/ai/evidencePack.test.ts tests/ai/knowledgeRetrievalTool.test.ts tests/knowledge/retrievalProtocolParity.test.ts` |
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

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 28-01-01 | 01 | 1 | SDLC-RET-02 | T-28-01 / T-28-02 | Set enumeration is server-authoritative; ordered and capped | unit | `npm --prefix knowledge-server test -- tests/publishedSetDiscovery.test.ts` | ❌ W0 | ⬜ pending |
| 28-01-02 | 01 | 1 | SDLC-RET-02, SDLC-RET-03 | T-28-04 | Snapshot-lexical fallback never invents modalities | unit | `npm --prefix knowledge-server test -- tests/snapshotLexicalRetrieval.test.ts tests/federatedRetrieval.test.ts` | ❌ W0 | ⬜ pending |
| 28-01-03 | 01 | 1 | SDLC-RET-02 | T-28-01 | Bounded attribution / coverage ledger | unit | `npm --prefix knowledge-server test -- tests/retrievalProtocol.test.ts tests/federatedRetrieval.test.ts` | ✅ partial | ⬜ pending |
| 28-01-04 | 01 | 1 | SDLC-RET-01, SDLC-RET-05 | T-28-03 | Exact restriction; no broadening | route | `npm --prefix knowledge-server test -- tests/retrievalRoutes.test.ts` | ✅ partial | ⬜ pending |
| 28-02-01 | 02 | 2 | SDLC-RET-01 | — | Client schema parity + query-only dispatch | unit | `npx vitest run tests/knowledge/retrievalProtocolParity.test.ts tests/ai/knowledgeRetrievalTool.test.ts` | ✅ partial | ⬜ pending |
| 28-02-02 | 02 | 2 | SDLC-RET-01 | — | Default path stops calling `fetchSetCatalog` | unit | `npx vitest run tests/ai/groundedTurn.test.ts tests/ai/knowledgeRetrievalTool.test.ts` | ✅ partial | ⬜ pending |
| 28-02-03 | 02 | 2 | SDLC-RET-05 | T-28-03 | Explicit restriction passes exactly | unit | `npx vitest run tests/ai/knowledgeRetrievalTool.test.ts tests/ai/sdlcWizardRuntime.test.ts` | ✅ partial | ⬜ pending |
| 28-03-01 | 03 | 3 | SDLC-RET-03 | T-28-04 / T-28-05 | Deadline and first-item cap are real | unit | `npm --prefix knowledge-server test -- tests/federatedRetrieval.test.ts` | ✅ partial | ⬜ pending |
| 28-03-02 | 03 | 3 | SDLC-RET-03 | T-28-05 | Snapshot-aware citation dedupe; orphan path rejected | unit | `npx vitest run tests/ai/evidencePack.test.ts`; `npm --prefix knowledge-server test -- tests/federatedRetrieval.test.ts` | ✅ partial | ⬜ pending |
| 28-03-03 | 03 | 3 | SDLC-RET-03 | T-28-04 | Degraded/unavailable reported truthfully | unit | `npm --prefix knowledge-server test -- tests/federatedRetrieval.test.ts tests/retrievalProtocol.test.ts` | ✅ partial | ⬜ pending |
| 28-04-01 | 04 | 4 | SDLC-RET-04 | T-28-06 | Canonical notice rendered, not paraphrased | component | `npx vitest run tests/ai/AIChatDrawerGroundedWiring.test.tsx tests/ai/AiChatWidget.test.tsx` | ✅ partial | ⬜ pending |
| 28-04-02 | 04 | 4 | SDLC-RET-04 | T-28-06 | Identical notice in SDLC chat | component | `npx vitest run tests/unit/sdlc/StepChatPanelToolPolicy.test.tsx` | ✅ partial | ⬜ pending |
| 28-04-03 | 04 | 4 | SDLC-RET-04 | T-28-06 | Identical notice in Telegram | unit | `npx vitest run tests/telegram/telegramHeadlessWorker.test.ts` | ✅ partial | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `knowledge-server/tests/publishedSetDiscovery.test.ts` — enumeration order, empty store, explicit unknown/unpublished, readiness states.
- [ ] `knowledge-server/tests/snapshotLexicalRetrieval.test.ts` — Vietnamese normalization, heading/line/offset provenance, empty corpus, deterministic ranking.
- [ ] Extend `knowledge-server/tests/federatedRetrieval.test.ts` — query-only resolution, coverage ledger, deadline with queued work, first-item char cap, all-failed truthfulness, orphan path rejection.
- [ ] Extend `knowledge-server/tests/retrievalRoutes.test.ts` — `{query, limit}` accepted, explicit `setIds` exactness, malformed/unknown sets, no-published outcome, auth/origin preserved.
- [ ] Extend `tests/knowledge/retrievalProtocolParity.test.ts` — new outcome, attribution, request shape.
- [ ] Extend `tests/ai/groundedTurn.test.ts` — empty catalog + server enabled → server request, not clarify; server empty + local docs → notice then labeled fallback; unreachable distinct.
- [ ] Extend `tests/ai/evidencePack.test.ts` — same doc/range across snapshots yields separate citations; conflicts retain set/snapshot; orphan path dropped.
- [ ] Extend `tests/ai/knowledgeRetrievalTool.test.ts` — no catalog call, query-only payload, attribution/outcome in JSON, explicit restriction exact.
- [ ] Extend `tests/ai/SourcesPanel.test.tsx` / `tests/ai/CitationChipAndQuickPreview.test.tsx` — set/snapshot details; local-absent excerpt rendered.
- [ ] Extend `tests/telegram/telegramHeadlessWorker.test.ts` — grounded empty notice and tool-driven notice.
- [ ] Environment: `npm --prefix knowledge-server install` (existing pinned dependencies) before server tests; gate behind `checkpoint:human-verify`.
- [ ] Framework install: none — existing infrastructure covers the phase.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live graph/vector/fulltext readiness reporting against a real Neo4j | SDLC-RET-02, SDLC-RET-03 | No Docker/Neo4j/knowledge-server running in this environment; readiness seams are mocked | With the local stack up (`docker compose up -d`), run the documented `test:knowledge:live` flow, publish one set, then query with graph building, ONLINE and failed states and confirm attribution matches each state. |
| Real fresh-device retrieval over the network | SDLC-RET-01, SDLC-RET-02 | Requires a published set on a second device/profile | Publish a set from a device with documents; from a profile with an empty catalog ask a grounded question and confirm evidence plus set/snapshot attribution appear. |

*If none remain after the stack is available, replace with "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
