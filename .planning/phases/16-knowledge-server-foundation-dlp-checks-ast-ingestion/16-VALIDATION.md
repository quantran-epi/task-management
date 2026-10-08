---
phase: 16
slug: knowledge-server-foundation-dlp-checks-ast-ingestion
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-08
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 |
| **Config file** | `vitest.config.ts` (client); knowledge-server config created in Wave 0 |
| **Quick run command** | `npm test -- tests/knowledge` plus knowledge-server targeted test command defined by server package |
| **Full suite command** | `npm test` plus knowledge-server test suite |
| **Estimated runtime** | ~60 seconds targeted; full suite measured during execution |

---

## Sampling Rate

- **After every task commit:** Run smallest targeted Phase 16 test file or package command covering changed behavior.
- **After every plan wave:** Run `npm test -- tests/knowledge` and knowledge-server tests affected by that wave.
- **Before `/gsd-verify-work`:** Root and knowledge-server targeted suites must be green.
- **Max feedback latency:** 120 seconds for targeted checks.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 16-01-01 | 01 | 1 | INGEST-01 | T-16-04 | Stable set membership does not mutate canonical notes | unit | `npm test -- tests/knowledge/documentSetRepo.test.ts` | ❌ W0 | ⬜ pending |
| 16-01-02 | 01 | 1 | INGEST-02 | All outbound user strings scanned; persisted audit excludes values/excerpts | unit | `npm test -- tests/knowledge/dlpScanner.test.ts` | ❌ W0 | ⬜ pending |
| 16-02-01 | 02 | 1 | INGEST-03 | Exact raw source slices preserved; atomic evidence never split/truncated | integration | knowledge-server AST/chunk tests | ❌ W0 | ⬜ pending |
| 16-02-02 | 02 | 1 | INGEST-04 | Hash normalization changes newlines only; duplicate occurrences preserved | unit | knowledge-server hash/projection tests | ❌ W0 | ⬜ pending |
| 16-02-03 | 02 | 1 | INGEST-04 | Failed candidate cannot replace active snapshot; idempotent key prevents duplicates | integration | knowledge-server attempt/snapshot tests | ❌ W0 | ⬜ pending |
| 16-03-01 | 03 | 2 | INGEST-01, INGEST-02 | Cancelled or unconfirmed DLP warning causes zero content-bearing requests | integration | `npm test -- tests/knowledge/publishDlpGate.test.ts` | ❌ W0 | ⬜ pending |
| 16-03-02 | 03 | 2 | INGEST-05 | Six primary states, uncertain connectivity substatus, newest 10 attempts only | unit | `npm test -- tests/knowledge/publishStatus.test.ts` | ❌ W0 | ⬜ pending |
| 16-03-03 | 03 | 2 | INGEST-05 | Server outage cannot block local Docs CRUD or BM25 | integration | `npm test -- tests/knowledge/offlineIsolation.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/knowledge/documentSetRepo.test.ts` — stable ordered membership and additive Dexie migration.
- [ ] `tests/knowledge/dlpScanner.test.ts` — PAN/Luhn, CVV, PIN, HSM key, credential, PII, overlap, masking, Unicode and CRLF positions.
- [ ] `tests/knowledge/publishDlpGate.test.ts` — fresh confirmation and zero pre-confirmation content requests.
- [ ] `tests/knowledge/publishStatus.test.ts` — six states, connection substatus, bounded history.
- [ ] `tests/knowledge/offlineIsolation.test.ts` — local edit/search remains independent of server.
- [ ] Knowledge-server test config and AST/hash/attempt/snapshot test files — pilot fixtures, atomic limit, exact ranges, incremental diff, idempotency, concurrency, and activation rollback.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Keyboard-accessible publish preview, removal confirmation, DLP warning, set management, and status inspection use existing Vietnamese Ant Design patterns | INGEST-01, INGEST-02, INGEST-05 | Visual focus order and usable status presentation need browser inspection | Run app; complete set creation and publish flow by keyboard; verify focus trap, labels, masked findings, removal warning, six state labels, compact badges, and no blocked local editing while server is offline. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
