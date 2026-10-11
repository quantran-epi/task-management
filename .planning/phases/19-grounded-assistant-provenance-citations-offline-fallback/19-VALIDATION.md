---
phase: 19
slug: grounded-assistant-provenance-citations-offline-fallback
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-11
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Sourced from `19-RESEARCH.md` §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 + Testing Library + fake-indexeddb (root) · Vitest in `knowledge-server` for daemon unit tests |
| **Config file** | `vite.config.ts` (`jsdom`, `tests/setup.ts`, file parallelism off); `knowledge-server/vitest.config.ts` for daemon |
| **Quick run command** | `npm test -- tests/ai/groundedAssistantEval.test.ts` |
| **Full suite command** | `npm test -- tests/ai/groundedAssistantEval.test.ts tests/ai/groundedTurn.test.ts tests/ai/GroundedAnswerCard.test.tsx tests/ai/CitationChipAndQuickPreview.test.tsx tests/knowledge/knowledgeClient.test.ts tests/knowledge/offlineIsolation.test.ts tests/backup/backupChatGrounding.test.ts` plus `npm --prefix knowledge-server test -- tests/retrievalProtocol.test.ts tests/graphTraversal.test.ts tests/retrievalService.test.ts tests/retrievalRoutes.test.ts` |
| **Estimated runtime** | ~45 seconds root targeted + ~20 seconds daemon targeted |

---

## Sampling Rate

- **After every task commit:** Run the smallest named test file or `-t` case for the changed module (project memory: `targeted-tests-only`).
- **After every plan wave:** Run all Phase 19 root tests or the daemon retrieval tests touched by that wave — never the full repository suite.
- **Before `/gsd-verify-work`:** Both the Phase 19 root suite and the daemon retrieval suite must be green; root + daemon TypeScript build must pass on Node 24; manual 320 px / 650 px chat drawer interaction check.
- **Max feedback latency:** 60 seconds per task commit.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 19-01-01 | 01 | 1 | ANSWER-01 / ANSWER-02 | T-19-citation-spoof / T-19-cross-snapshot | Ordered 1–3 hop path adjacency + source title + content SHA-256 enforced in daemon Zod boundary; cross-snapshot concatenation rejected | daemon unit | `npm --prefix knowledge-server test -- tests/retrievalProtocol.test.ts` | ❌ W0 | ⬜ pending |
| 19-01-02 | 01 | 1 | ANSWER-04 | T-19-conflict-suppress | `ConflictGroup.scopeProof` requires structured scope evidence; SUPERSEDES/EXTENDS/SUPPLEMENTS overrideRelation enum validated | daemon unit | `npm --prefix knowledge-server test -- tests/retrievalProtocol.test.ts -t "scopeProof"` | ❌ W0 | ⬜ pending |
| 19-02-01 | 02 | 1 | ANSWER-01 / ANSWER-02 / ANSWER-03 / ANSWER-05 | T-19-citation-spoof | Browser `retrievalProtocol` schema mirrors daemon; `knowledgeClient.retrieve` strict `safeParse` + token redaction | unit | `npm test -- tests/knowledge/knowledgeClient.test.ts` | ❌ W0 extend | ⬜ pending |
| 19-02-02 | 02 | 1 | ANSWER-01 / ANSWER-05 | T-19-prompt-injection | `groundedAnswerSchemas.ts` Zod strict output; INFERRED derivation requires path | unit | `npm test -- tests/ai/groundedAssistantEval.test.ts -t "schema"` | ❌ W0 | ⬜ pending |
| 19-03-01 | 03 | 2 | ANSWER-02 / ANSWER-03 / ANSWER-04 | T-19-cross-snapshot | `graphTraversal` returns ordered-pair paths pinned to one snapshot; endpoint adjacency enforced | daemon unit | `npm --prefix knowledge-server test -- tests/graphTraversal.test.ts` | partial / extend | ⬜ pending |
| 19-03-02 | 03 | 2 | ANSWER-02 / ANSWER-04 | T-19-cross-snapshot | `retrievalService` enrichment emits sourceTitle + contentSha256 + scopeProof; snapshot ID identical on every element | daemon unit | `npm --prefix knowledge-server test -- tests/retrievalService.test.ts` | partial / extend | ⬜ pending |
| 19-04-01 | 04 | 2 | ANSWER-01 / ANSWER-02 / ANSWER-04 / ANSWER-05 | T-19-cross-snapshot / T-19-stale-turn | Federated fan-out `Promise.allSettled` + per-set `runWithTimeout`; progressive REQUIRED/LIKELY/OPTIONAL tiers under budgets | daemon unit | `npm --prefix knowledge-server test -- tests/retrievalRoutes.test.ts -t "federated"` | ❌ W0 | ⬜ pending |
| 19-04-02 | 04 | 2 | ANSWER-04 / ANSWER-05 | T-19-conflict-suppress | Partial federated failure returns supported scopes + coverage warning; failed scopes abstained | daemon unit | `npm --prefix knowledge-server test -- tests/retrievalRoutes.test.ts -t "partial"` | ❌ W0 | ⬜ pending |
| 19-05-01 | 05 | 2 | ANSWER-01 | T-19-prompt-injection | `completeJson` + `intentRouter` reject tool loop for knowledge intent; language lock preserved | unit | `npm test -- tests/ai/intentRouter.test.ts` | ❌ W0 | ⬜ pending |
| 19-05-02 | 05 | 2 | ANSWER-05 | T-19-local-published-confusion | `semanticScopeRouter` returns canonical values only; never invents setId; deterministic alias fallback when model offline | unit | `npm test -- tests/ai/semanticScopeRouter.test.ts` | ❌ W0 | ⬜ pending |
| 19-06-01 | 06 | 2 | ANSWER-06 / ANSWER-07 | T-19-local-published-confusion | Local BM25 restricted to resolved set members; one record per UUID+range with all memberships; L# citation identity | unit | `npm test -- tests/knowledge/offlineIsolation.test.ts -t "scoped"` | partial / extend | ⬜ pending |
| 19-06-02 | 06 | 2 | ANSWER-06 / ANSWER-07 | T-19-prompt-injection | Range-bearing snippets with 1,200-char cap; weak-evidence threshold returns ranked results only | unit | `npm test -- tests/knowledge/offlineIsolation.test.ts -t "snippet"` | partial / extend | ⬜ pending |
| 19-07-01 | 07 | 2 | ANSWER-01 / ANSWER-02 / ANSWER-03 / ANSWER-04 | T-19-citation-spoof / T-19-conflict-suppress | `evidencePack` dedupe + budget cap; `validateGroundedAnswerClosure` rejects any unknown citation ID | unit | `npm test -- tests/ai/evidencePack.test.ts` | ❌ W0 | ⬜ pending |
| 19-07-02 | 07 | 2 | ANSWER-02 / ANSWER-04 | T-19-conflict-suppress | Closure validator rejects supersede/override language unless `scopeProof.overrideRelation === 'SUPERSEDES'` or cited evidence (D-26) | unit | `npm test -- tests/ai/evidencePack.test.ts -t "D-26"` | ❌ W0 | ⬜ pending |
| 19-08-01 | 08 | 3 | ANSWER-01 / ANSWER-02 / ANSWER-03 / ANSWER-05 | T-19-prompt-injection | `groundedSynthesis` non-streaming structured completion; zero tools; bounded repair (max two) | unit | `npm test -- tests/ai/groundedSynthesis.test.ts` | ❌ W0 | ⬜ pending |
| 19-08-02 | 08 | 3 | ANSWER-01 / ANSWER-03 | T-19-prompt-injection | Synthesis prompt locks response language to query language (D-06); forbids quote mutation; identifiers byte-identical | unit | `npm test -- tests/ai/groundedSynthesis.test.ts -t "language"` | ❌ W0 | ⬜ pending |
| 19-09-01 | 09 | 4 | ANSWER-01..06 | T-19-stale-turn | `groundedTurn` state machine; per-turn AbortController; stale completion discarded | unit | `npm test -- tests/ai/groundedTurn.test.ts` | ❌ W0 | ⬜ pending |
| 19-09-02 | 09 | 4 | ANSWER-05 / ANSWER-06 | T-19-local-published-confusion | `synthesizeFromStoredEvidence` zero daemon calls; "Tạo câu trả lời từ bằng chứng" uses exact stored evidence; "Tra cứu lại" fresh retrieval | unit | `npm test -- tests/ai/groundedTurn.test.ts -t "stored evidence"` | ❌ W0 | ⬜ pending |
| 19-10-01 | 10 | 2 | ANSWER-01 / ANSWER-02 / ANSWER-07 | T-19-secret-leak | `ChatMessage.grounding` persisted via Dexie transaction; bounded excerpts; no provider payload | unit | `npm test -- tests/backup/backupChatGrounding.test.ts` | ❌ W0 | ⬜ pending |
| 19-10-02 | 10 | 2 | ANSWER-07 | T-19-secret-leak | Backup round-trip preserves grounding; Zod validation at import boundary | unit | `npm test -- tests/backup/backupChatGrounding.test.ts -t "round-trip"` | ❌ W0 | ⬜ pending |
| 19-11-01 | 11 | 3 | ANSWER-01 / ANSWER-03 / ANSWER-04 / ANSWER-07 | T-19-citation-spoof | `CitationChip` + `ClaimBlock` INFERRED label + classification badge; Enter/Space keyboard activation | component | `npm test -- tests/ai/GroundedAnswerCard.test.tsx -t "citation"` | ❌ W0 | ⬜ pending |
| 19-11-02 | 11 | 3 | ANSWER-04 | T-19-conflict-suppress | Neutral "Khác biệt theo môi trường" variant when `scopeProof.overrideRelation ∈ {EXTENDS, SUPPLEMENTS}`; conflict banner only when no winner | component | `npm test -- tests/ai/GroundedAnswerCard.test.tsx -t "variation"` | ❌ W0 | ⬜ pending |
| 19-12-01 | 12 | 4 | ANSWER-02 / ANSWER-03 / ANSWER-04 / ANSWER-05 / ANSWER-07 | T-19-cross-snapshot | `GraphPathCard` renders ordered hops; snapshot ID visible; alternative paths collapsed per snapshot | component | `npm test -- tests/ai/GroundedAnswerCard.test.tsx -t "path"` | ❌ W0 | ⬜ pending |
| 19-12-02 | 12 | 4 | ANSWER-05 / ANSWER-07 | T-19-local-published-confusion | `EvidenceOnly` state renders ranked evidence + "Tạo câu trả lời từ bằng chứng" button; `ScopeChipsBar` optional override chips | component | `npm test -- tests/ai/GroundedAnswerCard.test.tsx -t "evidence-only"` | ❌ W0 | ⬜ pending |
| 19-13-01 | 13 | 4 | ANSWER-07 | T-19-citation-spoof | `QuickPreviewDrawer` renders snapshot excerpt first; content-SHA mismatch warning; focus on highlighted range | component | `npm test -- tests/ai/CitationChipAndQuickPreview.test.tsx -t "snapshot"` | ❌ W0 extend | ⬜ pending |
| 19-13-02 | 13 | 4 | ANSWER-01 | T-19-local-published-confusion | `DocumentSetForm` scope-presets panel: domain + friendly purpose preset required for new sets | component | `npm test -- tests/knowledge/DocumentSetForm.test.tsx -t "presets"` | ❌ W0 | ⬜ pending |
| 19-14-01 | 14 | 5 | ANSWER-01..07 | T-19-stale-turn | `AIChatDrawer` wires `groundedTurn` state machine; `ChatMessageBubble/List` renders grounding; abort cancels in-flight turn | integration | `npm test -- tests/ai/AIChatDrawer.test.tsx` | partial / extend | ⬜ pending |
| 19-14-02 | 14 | 5 | ANSWER-05 / ANSWER-06 | T-19-prompt-injection | Mixed-intent confirmation retained; retrieval first; operational tool flow separate | integration | `npm test -- tests/ai/AIChatDrawer.test.tsx -t "mixed-intent"` | partial / extend | ⬜ pending |
| 19-15-01 | 15 | 6 | ANSWER-01..07 | T-19-citation-spoof | 20-case reference fixture `tests/fixtures/ai/grounded-assistant-reference.json` + eval harness drives `groundedAssistantEval.test.ts` | eval | `npm test -- tests/ai/groundedAssistantEval.test.ts` | ❌ W0 | ⬜ pending |
| 19-15-02 | 15 | 6 | ANSWER-06 / ANSWER-07 | T-19-local-published-confusion / T-19-secret-leak | Offline isolation (zero daemon/model egress on fallback); `firstSeenInDoc` authority audit; REQUIREMENTS sync | integration | `npm test -- tests/knowledge/offlineIsolation.test.ts tests/ai/firstSeenInDocAudit.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `knowledge-server/tests/retrievalProtocol.test.ts` — ordered path/source hash/title/conflict metadata contract.
- [ ] `tests/ai/groundedAssistantEval.test.ts` — 20-case deterministic Phase 19 reference fixture harness defined by AI-SPEC.
- [ ] `tests/fixtures/ai/grounded-assistant-reference.json` — synthetic approved lookup/path/conflict/abstention/fallback/injection cases.
- [ ] `tests/ai/groundedTurn.test.ts` — route/outcome/error taxonomy and zero-model-call gates.
- [ ] `tests/ai/evidencePack.test.ts` — budget, dedupe, citation/path/conflict closure, D-26 override-language rejection.
- [ ] `tests/ai/groundedSynthesis.test.ts` — bounded repair, zero tools, D-06 language lock.
- [ ] `tests/ai/intentRouter.test.ts` — intent routing + no-tool-loop guarantee.
- [ ] `tests/ai/semanticScopeRouter.test.ts` — canonical values only, deterministic alias fallback.
- [ ] `tests/ai/GroundedAnswerCard.test.tsx` — outcome matrix, progressive disclosure, labels, scope-variation vs conflict, narrow layout.
- [ ] `tests/backup/backupChatGrounding.test.ts` — grounding metadata survives export/restore.
- [ ] `tests/ai/firstSeenInDocAudit.test.ts` — guard that `firstSeenInDoc` is never used as authority or citation.
- [ ] Extend `tests/ai/CitationChipAndQuickPreview.test.tsx` — numeric/local variants, Enter/Space, exact range, focus, mismatch, snapshot excerpt first.
- [ ] Extend `tests/knowledge/knowledgeClient.test.ts` — retrieve body/schema and typed timeout/abort/auth/invalid errors.
- [ ] Extend `tests/knowledge/offlineIsolation.test.ts` — automatic BM25 turn with zero daemon/model egress when weak; scoped to resolved set members.
- [ ] Extend `knowledge-server/tests/graphTraversal.test.ts` — ordered-pair adjacency, snapshot pinning.
- [ ] Extend `knowledge-server/tests/retrievalService.test.ts` — enrichment emits sourceTitle + contentSha256 + scopeProof.
- [ ] `knowledge-server/tests/retrievalRoutes.test.ts` — federated fan-out, partial failure handling.
- [ ] Extend `tests/ai/AIChatDrawer.test.tsx` — groundedTurn wiring, abort propagation, mixed-intent.
- [ ] `tests/knowledge/DocumentSetForm.test.tsx` — scope-presets panel enforced on new sets.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Chat drawer at 320 px and 650 px widths renders inline citation chips, graph path cards, EvidenceOnly state, and scope chips without horizontal scroll or truncated focus rings | ANSWER-01, 02, 03, 04, 05, 07 | Visual regression and keyboard focus pathing require a real browser viewport | Open `/` on local Vite dev build, open Chat Drawer, resize window to 320 px then 650 px, keyboard-navigate every chip (Tab, Enter, Space, Escape); verify QuickPreviewDrawer opens at exact range with highlighted focus; verify snapshot mismatch warning renders when `contentSha256` differs |
| Service-worker update prompt does not interrupt an in-flight grounded turn or discard stored evidence | ANSWER-05, 06 | Requires a real PWA install + SW lifecycle | Install PWA via Chromium, trigger grounded turn, force SW update via DevTools Application tab, confirm "Reload" dialog appears but current turn completes and `synthesizeFromStoredEvidence` button survives reload |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
