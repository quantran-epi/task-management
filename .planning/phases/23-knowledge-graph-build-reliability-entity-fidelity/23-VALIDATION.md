---
phase: 23
slug: knowledge-graph-build-reliability-entity-fidelity
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-20
---

# Phase 23 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 |
| **Config file** | `knowledge-server/vite.config.ts` |
| **Quick run command** | `npm --prefix knowledge-server test -- tests/graphIdentity.test.ts` |
| **Full suite command** | `npm --prefix knowledge-server test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run targeted test file (`npm --prefix knowledge-server test -- <test-file>`)
- **After every plan wave:** Run `npm --prefix knowledge-server test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 23-01-01 | 01 | 1 | ENTITY-FIDELITY-01 | T-23-01 / Injection | Vietnamese text slugifies to ASCII without underscore runs; preserves canonicalName | unit | `npm --prefix knowledge-server test -- tests/graphIdentity.test.ts` | ✅ | ⬜ pending |
| 23-01-02 | 01 | 1 | ENTITY-FIDELITY-01 | T-23-01 / Injection | GET_FACTS_BY_SNAPSHOT returns canonicalName & kind from nodes; DTO does not slice URN | unit | `npm --prefix knowledge-server test -- tests/graphBuildService.test.ts` | ✅ | ⬜ pending |
| 23-02-01 | 02 | 2 | BUILD-CACHE-01 | T-23-02 / Traversal | Cache key is hex SHA-256; persists and reloads chunk extractions across restarts | unit | `npm --prefix knowledge-server test -- tests/chunkCache.test.ts` | ❌ W0 | ⬜ pending |
| 23-03-01 | 03 | 3 | BUILD-OOM-01 | T-23-03 / DoS | Embedding and DB write run in bounded batches (<=50) yielding event loop per batch | unit / integration | `npm --prefix knowledge-server test -- tests/retrievalBatching.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `knowledge-server/tests/chunkCache.test.ts` — covers BUILD-CACHE-01 (disk persistence, key generation, hit/miss flow)
- [ ] `knowledge-server/tests/retrievalBatching.test.ts` — covers BUILD-OOM-01 (batching logic, event loop yield)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Peak RAM stay under 1.5Gi on >200 chunks rebuild | BUILD-OOM-01 | Requires live K8s or Docker container monitoring with large dataset | Run full rebuild of large document set in Docker / K8s, monitor `docker stats` or `kubectl top pod` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending 2026-10-20
