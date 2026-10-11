---
phase: 19-grounded-assistant-provenance-citations-offline-fallback
plan: 15
subsystem: ai-eval
tags: [grounded-eval, fixture-replay, offline-isolation, first-seen-in-doc, provenance]
dependency_graph:
  requires: [19-14]
  provides: [ANSWER-01, ANSWER-02, ANSWER-03, ANSWER-04, ANSWER-05, ANSWER-06, ANSWER-07]
  affects: [REQUIREMENTS.md, knowledge-server]
tech-stack:
  added: []
  patterns: [deterministic-fixture-replay, zero-egress-fallback, closure-validation]
key-files:
  created:
    - tests/fixtures/ai/grounded-assistant-reference.json
    - tests/fixtures/ai/grounded-reference-fixture-schema.ts
    - tests/ai/groundedAssistantEval.test.ts
    - knowledge-server/tests/firstSeenInDocNotAuthority.test.ts
  modified:
    - .planning/REQUIREMENTS.md
    - knowledge-server/src/retrieval/fusion.ts
    - tests/knowledge/offlineIsolation.test.ts
decisions:
  - "Replay 20 hand-crafted reference cases across direct lookup, paths, conflicts, abstention, fallback, safety, and persistence without network or provider calls."
  - "Enforce D-06 language lock and UTF-8 byte-identical quote preservation on mixed-language cases using Buffer.equals."
  - "Extend offlineIsolation.test.ts to verify zero retrieve egress during local fallback."
  - "Enforce firstSeenInDoc is never used as citation authority (D-34) via pickRepresentativeSource sorted by evidenceClass then stable documentId."
metrics:
  duration: 25m
  completed_date: "2026-10-11"
---

# Phase 19 Plan 15: Grounded Assistant Eval, Provenance Citations & Offline Fallback Acceptance Summary

Deterministic evaluation and release-blocking acceptance for Phase 19 Grounded Assistant with 20 reference cases, offline isolation verification, and firstSeenInDoc authority audit.

## Accomplishments

1. **Updated REQUIREMENTS.md**:
   - Added `ANSWER-01` through `ANSWER-07` with Phase 19 traceability linking claims, graph paths, evidence classification, conflicts, abstention, local BM25 fallback, and QuickPreviewDrawer navigation.

2. **20-Case Reference Fixture (`grounded-assistant-reference.json`)**:
   - Built 20 hand-crafted test cases covering the complete AI-SPEC §5 composition matrix:
     - 4 direct-lookup cases (including exact identifier, duplicate source occurrence, exact snapshot range)
     - 4 graph-flow/dependency/impact cases (1-hop, 2-hop, 3-hop, disconnected path)
     - 3 conflict/scope cases (version variation, environment variation, unknown scope)
     - 3 abstention/clarification cases (NEEDS_CLARIFICATION with 3 candidate chips, NO_EVIDENCE with 3 refinement chips, partial support)
     - 3 degraded/local authority cases (DEGRADED modality timeout, allowed TIMEOUT fallback with `[L#]`, disallowed AUTH 401 error)
     - 2 routing/safety cases (operational route, prompt injection data quarantine)
     - 1 persistence/interaction case (round-trip through BackupChatMessageRecordSchema)
   - Covered language distribution per D-06 including 2 mixed VI/EN cases (`GR-MIX-01` and `GR-MIX-02`) with byte-identical UTF-8 quote assertions.

3. **Deterministic Replay Harness (`groundedAssistantEval.test.ts`)**:
   - Replayed all 20 reference cases through `runGroundedTurn` using mock dependencies and strict closure validation.
   - Enforced 100% citation coverage, graph topology closure, conflict bias avoidance, zero-model-call abstention, and byte-identical quote checks.

4. **Zero-Egress Offline Isolation (`offlineIsolation.test.ts`)**:
   - Proved that network errors during federated retrieval cleanly trigger `LOCAL_FALLBACK_SYNTHESIS` with zero subsequent daemon `/retrieve` calls.
   - Proved that `serverEnabled: false` triggers local synthesis with zero `/retrieve` calls and `SERVER_DISABLED`.

5. **FirstSeenInDoc Authority Audit (`firstSeenInDocNotAuthority.test.ts` & `fusion.ts`)**:
   - Added pure `pickRepresentativeSource` in `knowledge-server/src/retrieval/fusion.ts` selecting by `evidenceClass` weight then stable `documentId`.
   - Verified that all supporting source occurrences are cited across documents, never relying on `firstSeenInDoc` as authority (D-34).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected KnowledgeClientError argument order in test harness**
- **Found during:** Task 2 replay harness test run
- **Issue:** Test mock threw `new KnowledgeClientError('Timeout from server', 'TIMEOUT')` which swapped `code` and `message`.
- **Fix:** Swapped arguments to `new KnowledgeClientError('TIMEOUT', 'Timeout from server')`.
- **Files modified:** `tests/ai/groundedAssistantEval.test.ts`
- **Commit:** `8e3394f`

**2. [Rule 1 - Bug] URN format and conflict branch citation compliance in fixture**
- **Found during:** Task 2 replay harness run
- **Issue:** Fixture URNs in GR-05..GR-07 lacked `plannermate` namespace prefix, and conflict claims in GR-09..GR-11 cited only one branch, violating closure validator conflict-branch-bias rule.
- **Fix:** Updated fixture cases to use valid PlannerMate URNs and cite both conflict branches.
- **Files modified:** `tests/fixtures/ai/grounded-assistant-reference.json`
- **Commit:** `8e3394f`

## Self-Check: PASSED
- FOUND: tests/fixtures/ai/grounded-assistant-reference.json
- FOUND: tests/fixtures/ai/grounded-reference-fixture-schema.ts
- FOUND: tests/ai/groundedAssistantEval.test.ts
- FOUND: knowledge-server/tests/firstSeenInDocNotAuthority.test.ts
- FOUND: .planning/REQUIREMENTS.md
- Commits verified in git history: `fbb9e1e`, `8e3394f`, `eaa098d`
