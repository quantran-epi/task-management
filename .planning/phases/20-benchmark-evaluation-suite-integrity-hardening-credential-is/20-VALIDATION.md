---
phase: 20
slug: benchmark-evaluation-suite-integrity-hardening-credential-is
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-10-17
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 / Node 24 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/ai/groundedAssistantEval.test.ts` |
| **Full suite command** | `npm test` |
| **Benchmark CLI command** | `npm run benchmark` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/ai/groundedAssistantEval.test.ts`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green + `npm run benchmark` passes gates
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 20-01-01 | 01 | 1 | QUAL-01 | T-20-01 | Requirements restoration & report schemas | unit | `npx vitest run tests/ai/groundedAssistantEval.test.ts` | ✅ | ⬜ pending |
| 20-01-02 | 01 | 1 | QUAL-01 | T-20-02 | Grounded assistant 40-case fixture | unit | `npx vitest run tests/ai/groundedAssistantEval.test.ts` | ✅ | ⬜ pending |
| 20-01-03 | 01 | 1 | QUAL-02 | T-20-03 | Traversal & claim evaluator core | unit | `npx vitest run tests/ai/groundedAssistantEval.test.ts` | ✅ | ⬜ pending |
| 20-02-01 | 02 | 2 | QUAL-03 | T-20-04 | Release gate evaluator (>=90% 3-hop, 100% path) | unit | `npx vitest run tests/ai/groundedAssistantEval.test.ts` | ✅ | ⬜ pending |
| 20-02-02 | 02 | 2 | QUAL-01..05 | T-20-05 | Report generator (latest.json + latest.md) | unit | `npx vitest run tests/ai/groundedAssistantEval.test.ts` | ✅ | ⬜ pending |
| 20-02-03 | 02 | 2 | QUAL-01..05 | T-20-06 | Benchmark CLI npm script & reports directory | integration | `npm run benchmark` | ❌ W0 | ⬜ pending |
| 20-03-01 | 03 | 3 | QUAL-04 | T-20-07 | Semantic graph rebuild equivalence | integration | `npx vitest run knowledge-server/tests/graphRebuildEquivalence.test.ts` | ❌ W0 | ⬜ pending |
| 20-03-02 | 03 | 3 | QUAL-04 | T-20-08 | Transport error taxonomy & offline zero-egress | unit | `npx vitest run tests/knowledge/offlineIsolation.test.ts` | ❌ W0 | ⬜ pending |
| 20-03-03 | 03 | 3 | QUAL-05 | T-20-09 | Canary token isolation & DLP scan preservation | unit | `npx vitest run tests/security/credentialIsolation.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/ai/evaluatorCore.ts` — shared assertion engine for 40 reference cases
- [ ] `tests/ai/releaseGate.ts` — multi-tier threshold evaluator
- [ ] `tests/ai/reportGenerator.ts` — JSON and markdown reporter
- [ ] `scripts/run-benchmark.ts` — maintainer CLI entry point
- [ ] `knowledge-server/tests/graphRebuildEquivalence.test.ts` — semantic graph rebuild equivalence suite
- [ ] `tests/knowledge/offlineIsolation.test.ts` — offline zero-egress unit test
- [ ] `tests/security/credentialIsolation.test.ts` — canary token isolation regression suite

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real Docker Knowledge Stack end-to-end benchmark run | QUAL-01..05 | Requires Docker daemon + Neo4j running locally | `docker compose up -d && npm run benchmark -- --live` |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-10-17
