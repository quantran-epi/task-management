---
phase: 16
slug: knowledge-server-foundation-dlp-checks-ast-ingestion
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-10-08
updated: 2026-10-08
plan_count: 13
task_count: 21
---

# Phase 16 — Validation Strategy

> Final per-task validation contract for 13-plan dependency graph.

## Test Infrastructure

| Property | Value |
|---|---|
| Framework | Vitest 5.0.2 |
| Client config | `vitest.config.ts` |
| Daemon config | `knowledge-server/vitest.config.ts` created by 16-04-01 |
| Client targeted command | `npm test -- <test files>` |
| Daemon targeted command | `npm run test:knowledge -- <test files>` |
| Build gate | `npm run knowledge:build && npm run build` |
| Watch mode | Forbidden |
| Max targeted feedback latency | 120 seconds |

## Wave Order

| Wave | Plans | Gate before next wave |
|---|---|---|
| 1 | 16-01, 16-03, 16-04 | Schema/DLP contracts and daemon package compile/tests pass |
| 2 | 16-02, 16-05 | Stable repositories and shared AST/hash policy tests pass |
| 3 | 16-06 | Exact zero-network document-and-chunk preview tests pass |
| 4 | 16-07 | Daemon projection/attempt parity with client preview passes |
| 5 | 16-08 | Secure daemon API tests pass |
| 6 | 16-09 | Guarded client egress tests pass |
| 7 | 16-10, 16-11 | Settings plus complete publish management UI tests pass |
| 8 | 16-12 | Docs status and no-daemon local isolation pass |
| 9 | 16-13 | Pilot/client acceptance and both builds pass |

## Sampling Rate

- After every task commit: run exact command listed below.
- After every wave: run union of targeted tests from plans in that wave.
- Before `/gsd-verify-work`: run `npm test -- tests/knowledge`, `npm run test:knowledge`, `npm run knowledge:build`, and `npm run build`.
- No three consecutive implementation tasks lack automated verification; every task has one.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirements | Primary decisions/threat | Test file or build | Automated command | Exists before task? | Status |
|---|---:|---:|---|---|---|---|---|---|
| 16-01-01 | 01 | 1 | INGEST-01, INGEST-05 | D-01, D-08, D-27, D-29; cache disclosure | `tests/knowledge/schemaV10.test.ts` | `npm test -- tests/knowledge/schemaV10.test.ts` | No — Wave 0/task creates | Pending |
| 16-01-02 | 01 | 1 | INGEST-01, INGEST-05 | canonical-note migration integrity | `tests/knowledge/schemaV10.test.ts` | `npm test -- tests/knowledge/schemaV10.test.ts` | Yes after 16-01-01 | Pending |
| 16-02-01 | 02 | 2 | INGEST-01, INGEST-05 | D-01, D-02, D-27, D-28; canonical tampering | `tests/knowledge/documentSetRepo.test.ts` | `npm test -- tests/knowledge/documentSetRepo.test.ts` | No — Wave 0/task creates | Pending |
| 16-02-02 | 02 | 2 | INGEST-05 | D-08, D-13, D-29; untrusted response/cache | `tests/knowledge/publishStatus.test.ts` | `npm test -- tests/knowledge/publishStatus.test.ts` | No — Wave 0/task creates | Pending |
| 16-03-01 | 03 | 1 | INGEST-02 | D-15, D-17, D-19; missed sensitive egress | `tests/knowledge/dlpScanner.test.ts` | `npm test -- tests/knowledge/dlpScanner.test.ts` | No — Wave 0/task creates | Pending |
| 16-03-02 | 03 | 1 | INGEST-02 | D-16, D-18, D-19; value/audit leakage | `tests/knowledge/dlpScanner.test.ts` | `npm test -- tests/knowledge/dlpScanner.test.ts` | Yes after 16-03-01 | Pending |
| 16-04-01 | 04 | 1 | INGEST-03, INGEST-04 | D-22–D-26 policy drift; supply chain | daemon build/protocol | `npm run knowledge:build` | No — task creates config/package | Pending |
| 16-05-01 | 05 | 2 | INGEST-03, INGEST-04 | D-04, D-20–D-26; offset corruption/DoS | `knowledge-server/tests/sectionChunker.test.ts`, `atomicBlock.test.ts` | `npm run test:knowledge -- sectionChunker.test.ts atomicBlock.test.ts` | No — Wave 0/task creates | Pending |
| 16-06-01 | 06 | 3 | INGEST-01, INGEST-03, INGEST-04 | D-03, D-04, D-10, D-20–D-26; pre-send preview mismatch | `tests/knowledge/changePreview.test.ts` | `npm test -- tests/knowledge/changePreview.test.ts` | No — Wave 0/task creates | Pending |
| 16-07-01 | 07 | 4 | INGEST-03, INGEST-04 | D-04, D-22–D-26; projection mismatch | `knowledge-server/tests/incrementalProjector.test.ts` | `npm run test:knowledge -- incrementalProjector.test.ts` | No — Wave 0/task creates | Pending |
| 16-07-02 | 07 | 4 | INGEST-04, INGEST-05 | D-09–D-14; race/partial activation/error leak | `knowledge-server/tests/attemptService.test.ts` | `npm run test:knowledge -- attemptService.test.ts` | No — Wave 0/task creates | Pending |
| 16-08-01 | 08 | 5 | INGEST-01, INGEST-04, INGEST-05 | D-05–D-09, D-11, D-12; CORS/auth/log leak | `knowledge-server/tests/server.test.ts` | `npm run test:knowledge -- server.test.ts` | No — Wave 0/task creates | Pending |
| 16-09-01 | 09 | 6 | INGEST-01, INGEST-05 | D-05–D-08, D-12, D-13; token/response leak | `tests/knowledge/knowledgeClient.test.ts` | `npm test -- tests/knowledge/knowledgeClient.test.ts` | No — Wave 0/task creates | Pending |
| 16-09-02 | 09 | 6 | INGEST-01, INGEST-02, INGEST-04 | D-03, D-04, D-06, D-09, D-10, D-15–D-19; DLP bypass | `tests/knowledge/publishDlpGate.test.ts` | `npm test -- tests/knowledge/publishDlpGate.test.ts` | No — Wave 0/task creates | Pending |
| 16-10-01 | 10 | 7 | INGEST-01, INGEST-05 | D-05, D-07; token persistence/unsafe URL | `tests/knowledge/KnowledgeServerConfigCard.test.tsx` | `npm test -- tests/knowledge/KnowledgeServerConfigCard.test.tsx` | No — Wave 0/task creates | Pending |
| 16-11-01 | 11 | 7 | INGEST-01, INGEST-05 | D-01, D-27–D-29; unsafe history | `tests/knowledge/DocumentSetPublishFlow.test.tsx` | `npm test -- tests/knowledge/DocumentSetPublishFlow.test.tsx` | No — Wave 0/task creates | Pending |
| 16-11-02 | 11 | 7 | INGEST-01, INGEST-02, INGEST-04, INGEST-05 | D-03, D-04, D-10–D-19; stale UI consent | `tests/knowledge/DocumentSetPublishFlow.test.tsx` | `npm test -- tests/knowledge/DocumentSetPublishFlow.test.tsx` | Yes after 16-11-01 | Pending |
| 16-12-01 | 12 | 8 | INGEST-05 | D-27, D-28; misleading status | `tests/knowledge/NotesKnowledgePublishing.test.tsx` | `npm test -- tests/knowledge/NotesKnowledgePublishing.test.tsx` | No — Wave 0/task creates | Pending |
| 16-12-02 | 12 | 8 | INGEST-01, INGEST-05 | D-02, D-08, D-10; daemon outage/autosave egress | `tests/knowledge/NotesKnowledgePublishing.test.tsx`, `offlineIsolation.test.ts` | `npm test -- tests/knowledge/NotesKnowledgePublishing.test.tsx tests/knowledge/offlineIsolation.test.ts` | `offlineIsolation` created by task | Pending |
| 16-13-01 | 13 | 9 | INGEST-03, INGEST-04, INGEST-05 | D-04, D-09–D-14, D-20–D-26; parity/activation | `knowledge-server/tests/pilotAcceptance.test.ts` | `npm run test:knowledge -- pilotAcceptance.test.ts` | No — Wave 0/task creates | Pending |
| 16-13-02 | 13 | 9 | INGEST-01–INGEST-05 | D-01–D-29; integrated bypass/leak/offline | `tests/knowledge/phase16Acceptance.test.tsx` | `npm test -- tests/knowledge/phase16Acceptance.test.tsx` | No — Wave 0/task creates | Pending |

## Wave 0 Requirements

Wave 0 means test/config scaffold created at start of owning task before production code. No separate unverified implementation task may precede it.

- [ ] `knowledge-server/package.json`, `knowledge-server/tsconfig.json`, `knowledge-server/vitest.config.ts` — daemon build/test harness (16-04-01).
- [ ] `tests/knowledge/schemaV10.test.ts` — strict contracts and V9→V10 preservation (16-01-01).
- [ ] `tests/knowledge/documentSetRepo.test.ts` — stable membership/canonical safety (16-02-01).
- [ ] `tests/knowledge/publishStatus.test.ts` — six states, strict reconciliation, newest 10 (16-02-02).
- [ ] `tests/knowledge/dlpScanner.test.ts` — all categories, locations, masking, overlap, safe audit (16-03-01).
- [ ] `knowledge-server/tests/sectionChunker.test.ts`, `atomicBlock.test.ts` — pilot exact ranges, shared policy, 50,001 rejection (16-05-01).
- [ ] `tests/knowledge/changePreview.test.ts` — zero-network exact document/chunk four-way preview and freeze (16-06-01).
- [ ] `knowledge-server/tests/incrementalProjector.test.ts`, `attemptService.test.ts` — parity/delta/idempotency/concurrency/activation (16-07-01/02).
- [ ] `knowledge-server/tests/server.test.ts` — CORS/auth/protocol/log redaction/no-cancel (16-08-01).
- [ ] `tests/knowledge/knowledgeClient.test.ts`, `publishDlpGate.test.ts` — token/response/polling and preview-bound fresh DLP gate (16-09-01/02).
- [ ] `tests/knowledge/KnowledgeServerConfigCard.test.tsx` — config UI security/diagnostics (16-10-01).
- [ ] `tests/knowledge/DocumentSetPublishFlow.test.tsx` — set/preview/DLP/progress/history UI (16-11-01).
- [ ] `tests/knowledge/NotesKnowledgePublishing.test.tsx`, `offlineIsolation.test.ts` — badges and no-daemon continuity (16-12-01/02).
- [ ] `knowledge-server/tests/pilotAcceptance.test.ts`, `tests/knowledge/phase16Acceptance.test.tsx` — phase acceptance (16-13-01/02).

## Requirement Coverage Gate

| Requirement | Direct automated coverage |
|---|---|
| INGEST-01 | 16-01, 16-02, 16-06, 16-08, 16-09, 16-10, 16-11, 16-12, 16-13 |
| INGEST-02 | 16-03, 16-09, 16-11, 16-13 |
| INGEST-03 | 16-04, 16-05, 16-06, 16-07, 16-13 |
| INGEST-04 | 16-04, 16-05, 16-06, 16-07, 16-08, 16-09, 16-11, 16-13 |
| INGEST-05 | 16-01, 16-02, 16-07, 16-08, 16-09, 16-10, 16-11, 16-12, 16-13 |

## Manual Verification

| Behavior | Requirements | Why manual | Steps |
|---|---|---|---|
| Focus order, responsive layout, semantic color/text/icon, keyboard reorder, sticky mobile actions | INGEST-01, INGEST-02, INGEST-05 | Visual/focus quality needs browser inspection | Run app without daemon; open Docs → `Bộ tài liệu`; create/reorder set by keyboard; inspect exact document/chunk preview; cancel and confirm removal/DLP paths; close accepted progress; verify focus restore at desktop/tablet/mobile widths. |
| Independent deployment smoke | INGEST-01, INGEST-05 | Process/network environment differs by operator | Start daemon with `npm run knowledge:dev`; connect via loopback; stop daemon and confirm local Docs/BM25 stay usable and cached status remains. |

## Final Gates

- [x] Every task has `<automated>` verification.
- [x] Exact task IDs match final 13-plan graph.
- [x] Wave 0 entries identify every not-yet-existing test/config file.
- [x] No watch-mode flags.
- [x] Sampling continuity has no unverified implementation gap.
- [x] D-04 has executable zero-network document-and-chunk preview tests plus daemon parity tests.
- [x] Critical security threats have concrete negative assertions.
- [x] `nyquist_compliant: true`.

**Approval:** ready for execution; runtime test statuses remain Pending until plans run.
