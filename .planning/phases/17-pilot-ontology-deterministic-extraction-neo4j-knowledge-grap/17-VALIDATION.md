---
phase: 17
slug: pilot-ontology-deterministic-extraction-neo4j-knowledge-grap
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-10
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest `^5.0.2` |
| **Config file** | `knowledge-server/vitest.config.ts` |
| **Quick run command** | `npm --prefix knowledge-server test -- tests/graphIdentity.test.ts tests/deterministicExtraction.test.ts` |
| **Full suite command** | Targeted Phase 17 graph tests listed below; no unrelated full-suite run |
| **Estimated runtime** | Measure after Wave 0 fixtures and tests exist |

---

## Sampling Rate

- **After every task commit:** Run smallest changed-module test from map below
- **After every plan wave:** Run targeted graph tests for that wave
- **Before `/gsd-verify-work`:** Phase 17 targeted suite, live Neo4j atomic-failure test, server build, and one offline-isolation test must be green
- **Max feedback latency:** 120 seconds for automated unit/component checks; live Neo4j gate may exceed this and runs at phase boundary

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 17-01-01 | 01 | 1 | GRAPH-01 | T-17-01 | Strict ontology contracts reject unknown node/relation kinds | gold/unit | `npm --prefix knowledge-server test -- tests/deterministicExtraction.test.ts tests/pilotAcceptance.test.ts` | ❌ W0 | ⬜ pending |
| 17-01-02 | 01 | 1 | GRAPH-02 | T-17-02 | Namespaced string identities prevent cross-type collisions and precision loss | unit | `npm --prefix knowledge-server test -- tests/graphIdentity.test.ts` | ❌ W0 | ⬜ pending |
| 17-02-01 | 02 | 2 | GRAPH-03 | T-17-03 | Deterministic extraction precedes bounded prose fallback; unsupported structures quarantine | unit | `npm --prefix knowledge-server test -- tests/deterministicExtraction.test.ts tests/proseFallback.test.ts` | ❌ W0 | ⬜ pending |
| 17-03-01 | 03 | 3 | GRAPH-04 | T-17-04 | Parameterized writes retain exact evidence occurrences without direct Cypher input | integration | `npm --prefix knowledge-server test -- tests/graphCandidate.test.ts tests/neo4jRepository.test.ts` | ❌ W0 | ⬜ pending |
| 17-04-01 | 04 | 4 | GRAPH-05 | T-17-05 | Closed evidence classes and authorized approvals remain distinguishable | unit/component | `npm --prefix knowledge-server test -- tests/graphCandidate.test.ts tests/graphRoutes.test.ts GraphEvidenceDrawer.test.tsx` | ❌ W0 | ⬜ pending |
| 17-05-01 | 05 | 5 | GRAPH-06 | T-17-06 | Candidate isolation, atomic pointer activation, stale-source guard, and idempotency prevent partial graph exposure | integration | `npm --prefix knowledge-server test -- tests/graphRebuild.test.ts tests/neo4jRepository.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Freeze 15–20 labeled pilot examples from `docs/sample-markdown-flow/60000006-SHB-Credit-calculations/*.md`
- [ ] Add `knowledge-server/tests/graphIdentity.test.ts`
- [ ] Add `knowledge-server/tests/deterministicExtraction.test.ts`
- [ ] Add `knowledge-server/tests/pilotAcceptance.test.ts`
- [ ] Add `knowledge-server/tests/graphCandidate.test.ts`
- [ ] Add `knowledge-server/tests/proseFallback.test.ts`
- [ ] Add `knowledge-server/tests/neo4jRepository.test.ts`
- [ ] Add `knowledge-server/tests/graphRoutes.test.ts`
- [ ] Add `knowledge-server/tests/graphRebuild.test.ts`
- [ ] Add `GraphEvidenceDrawer.test.tsx` and local offline-isolation test
- [ ] Add opt-in official-image Neo4j integration setup without a test-container dependency

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Official `neo4j-driver` package version and legitimacy approval | GRAPH-04, GRAPH-06 | `slopcheck` unavailable during research | Verify current official Neo4j install docs, npm ownership/repository metadata, selected exact version, and lockfile diff before install |
| Atomic candidate failure against real Neo4j | GRAPH-06 | Requires external Neo4j instance or Docker daemon absent during research | Build candidate, inject failure before pointer swap, confirm active graph remains unchanged, then retry and confirm one active snapshot |
| Evidence drawer keyboard/focus behavior | GRAPH-05 | Accessibility interaction needs browser observation | Open graph section from `DocumentSetDrawer`, traverse evidence, open nested drawer, close with Escape, and confirm focus returns to trigger |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s for automated unit/component checks
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
