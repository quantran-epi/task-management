---
phase: 16
slug: knowledge-server-foundation-dlp-checks-ast-ingestion
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-10-08
updated: 2026-10-09
plan_count: 23
task_count: 44
---

# Phase 16 — Validation Strategy

> Final per-task validation contract for 23-plan, 15-wave dependency graph.

## Test Infrastructure

| Property | Value |
|---|---|
| Framework | Vitest 5.0.2 |
| Client config | `vitest.config.ts` |
| Daemon config | `knowledge-server/vitest.config.ts` created by 16-04-01 |
| Client targeted command | `npm test -- <test files>` |
| Daemon targeted command | `npm run test:knowledge -- <test files>` or package-local equivalent from owning plan |
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
| 10 | 16-14, 16-15 | Docs publish entry plus knowledge-table backup round-trip pass |
| 11 | 16-16, 16-17, 16-18 | Executable daemon, shared config/create flow, and document-chat backup safety pass |
| 12 | 16-19, 16-20 | Authoritative manifest gate and service-boundary DLP approval pass |
| 13 | 16-23 | Durable content-free frozen manifest, reload, and backup round-trip pass |
| 14 | 16-21 | Attempt-ID-only terminal reconciliation and H1-versus-H2 regression pass |
| 15 | 16-22 | Terminal UI, close/reload recovery, and truthful badges pass |

## Sampling Rate

- After every task commit: run exact command in Per-Task Verification Map.
- After every wave: run exact union command(s) in Wave Sample Commands; no broad suite replaces targeted task checks.
- Waves 10–15 each receive a gate even when tests existed before gap closure.
- Before `/gsd-verify-work`: run `npm test -- tests/knowledge`, `npm test -- tests/services/backup/knowledgeBackupRestore.test.ts`, `npm run test:knowledge`, `npm run knowledge:build`, and `npm run build`.
- No three consecutive implementation tasks lack automated verification; all 44 tasks have executable checks.

## Wave Sample Commands

| Wave | Exact commands |
|---:|---|
| 10 | `npm test -- tests/views/NotesView.test.tsx tests/knowledge/NotesKnowledgePublishing.test.tsx tests/knowledge/NotesWorkspacePublishingIntegration.test.tsx tests/services/backup/restoreBackup.test.ts tests/services/backup/knowledgeBackupRestore.test.ts -x`<br>`npx tsc --noEmit` |
| 11 | `npm --prefix knowledge-server test -- main.test.ts server.test.ts`<br>`npm --prefix knowledge-server run build`<br>`npm test -- tests/knowledge/KnowledgeServerConfigCard.test.tsx tests/knowledge/NotesWorkspacePublishingIntegration.test.tsx tests/services/backup/knowledgeBackupRestore.test.ts` |
| 12 | `npm test -- tests/knowledge/knowledgeClient.test.ts tests/knowledge/NotesWorkspacePublishingIntegration.test.tsx tests/knowledge/publishDlpGate.test.ts tests/knowledge/DocumentSetPublishFlow.test.tsx` |
| 13 | `npm test -- tests/knowledge/publishStatus.test.ts tests/knowledge/knowledgeClient.test.ts tests/services/backup/knowledgeBackupRestore.test.ts` |
| 14 | `npm test -- tests/knowledge/publishStatus.test.ts tests/knowledge/knowledgeClient.test.ts tests/knowledge/publishDlpGate.test.ts` |
| 15 | `npm test -- tests/knowledge/DocumentSetPublishFlow.test.tsx tests/knowledge/NotesWorkspacePublishingIntegration.test.tsx tests/knowledge/NotesKnowledgePublishing.test.tsx` |

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirements | Primary decisions/threat | Test file or build | Automated command | Exists before task? | Status |
|---|---:|---:|---|---|---|---|---|---|
| 16-01-01 | 01 | 1 | INGEST-01, INGEST-05 | D-01, D-08, D-27, D-29; cache disclosure | `tests/knowledge/schemaV10.test.ts` | `npm test -- tests/knowledge/schemaV10.test.ts` | No — task creates | Complete |
| 16-01-02 | 01 | 1 | INGEST-01, INGEST-05 | canonical-note migration integrity | `tests/knowledge/schemaV10.test.ts` | `npm test -- tests/knowledge/schemaV10.test.ts` | Yes after 16-01-01 | Complete |
| 16-02-01 | 02 | 2 | INGEST-01, INGEST-05 | D-01, D-02, D-27, D-28; canonical tampering | `tests/knowledge/documentSetRepo.test.ts` | `npm test -- tests/knowledge/documentSetRepo.test.ts` | No — task creates | Complete |
| 16-02-02 | 02 | 2 | INGEST-05 | D-08, D-13, D-29; untrusted response/cache | `tests/knowledge/publishStatus.test.ts` | `npm test -- tests/knowledge/publishStatus.test.ts` | No — task creates | Complete |
| 16-03-01 | 03 | 1 | INGEST-02 | D-15, D-17, D-19; missed sensitive egress | `tests/knowledge/dlpScanner.test.ts` | `npm test -- tests/knowledge/dlpScanner.test.ts` | No — task creates | Complete |
| 16-03-02 | 03 | 1 | INGEST-02 | D-16, D-18, D-19; value/audit leakage | `tests/knowledge/dlpScanner.test.ts` | `npm test -- tests/knowledge/dlpScanner.test.ts` | Yes after 16-03-01 | Complete |
| 16-04-01 | 04 | 1 | INGEST-03, INGEST-04 | D-22–D-26; supply chain | daemon build/protocol | `npm run knowledge:build` | No — task creates config/package | Complete |
| 16-05-01 | 05 | 2 | INGEST-03, INGEST-04 | D-04, D-20–D-26; offset corruption/DoS | `knowledge-server/tests/sectionChunker.test.ts`, `atomicBlock.test.ts` | `npm run test:knowledge -- sectionChunker.test.ts atomicBlock.test.ts` | No — task creates | Complete |
| 16-06-01 | 06 | 3 | INGEST-01, INGEST-03, INGEST-04 | D-03, D-04, D-10, D-20–D-26; preview mismatch | `tests/knowledge/changePreview.test.ts` | `npm test -- tests/knowledge/changePreview.test.ts` | No — task creates | Complete |
| 16-07-01 | 07 | 4 | INGEST-03, INGEST-04 | D-04, D-22–D-26; projection mismatch | `knowledge-server/tests/incrementalProjector.test.ts` | `npm run test:knowledge -- incrementalProjector.test.ts` | No — task creates | Complete |
| 16-07-02 | 07 | 4 | INGEST-04, INGEST-05 | D-09–D-14; race/partial activation | `knowledge-server/tests/attemptService.test.ts` | `npm run test:knowledge -- attemptService.test.ts` | No — task creates | Complete |
| 16-08-01 | 08 | 5 | INGEST-01, INGEST-04, INGEST-05 | D-05–D-09, D-11, D-12; CORS/auth/log leak | `knowledge-server/tests/server.test.ts` | `npm run test:knowledge -- server.test.ts` | No — task creates | Complete |
| 16-09-01 | 09 | 6 | INGEST-01, INGEST-05 | D-05–D-08, D-12, D-13; token/response leak | `tests/knowledge/knowledgeClient.test.ts` | `npm test -- tests/knowledge/knowledgeClient.test.ts` | No — task creates | Complete |
| 16-09-02 | 09 | 6 | INGEST-01, INGEST-02, INGEST-04 | D-03, D-04, D-06, D-09, D-10, D-15–D-19; DLP bypass | `tests/knowledge/publishDlpGate.test.ts` | `npm test -- tests/knowledge/publishDlpGate.test.ts` | No — task creates | Complete |
| 16-10-01 | 10 | 7 | INGEST-01, INGEST-05 | D-05, D-07; token persistence/unsafe URL | `tests/knowledge/KnowledgeServerConfigCard.test.tsx` | `npm test -- tests/knowledge/KnowledgeServerConfigCard.test.tsx` | No — task creates | Complete |
| 16-11-01 | 11 | 7 | INGEST-01, INGEST-05 | D-01, D-27–D-29; unsafe history | `tests/knowledge/DocumentSetPublishFlow.test.tsx` | `npm test -- tests/knowledge/DocumentSetPublishFlow.test.tsx` | No — task creates | Complete |
| 16-11-02 | 11 | 7 | INGEST-01, INGEST-02, INGEST-04, INGEST-05 | D-03, D-04, D-10–D-19; stale consent | `tests/knowledge/DocumentSetPublishFlow.test.tsx` | `npm test -- tests/knowledge/DocumentSetPublishFlow.test.tsx` | Yes after 16-11-01 | Complete |
| 16-12-01 | 12 | 8 | INGEST-05 | D-27, D-28; misleading status | `tests/knowledge/NotesKnowledgePublishing.test.tsx` | `npm test -- tests/knowledge/NotesKnowledgePublishing.test.tsx` | No — task creates | Complete |
| 16-12-02 | 12 | 8 | INGEST-01, INGEST-05 | D-02, D-08, D-10; outage/autosave egress | `NotesKnowledgePublishing.test.tsx`, `offlineIsolation.test.ts` | `npm test -- tests/knowledge/NotesKnowledgePublishing.test.tsx tests/knowledge/offlineIsolation.test.ts` | `offlineIsolation` created by task | Complete |
| 16-13-01 | 13 | 9 | INGEST-03, INGEST-04, INGEST-05 | D-04, D-09–D-14, D-20–D-26; parity/activation | `knowledge-server/tests/pilotAcceptance.test.ts` | `npm run test:knowledge -- pilotAcceptance.test.ts` | No — task creates | Complete |
| 16-13-02 | 13 | 9 | INGEST-01–INGEST-05 | D-01–D-29; integrated bypass/leak/offline | `tests/knowledge/phase16Acceptance.test.tsx` | `npm test -- tests/knowledge/phase16Acceptance.test.tsx` | No — task creates | Complete |
| 16-14-01 | 14 | 10 | INGEST-01, INGEST-05 | root provider and safe fallback | `tests/views/NotesView.test.tsx` | `npm test -- tests/views/NotesView.test.tsx -x` | Yes | Complete |
| 16-14-02 | 14 | 10 | INGEST-01, INGEST-05 | D-02, D-08; preview wiring/no mutation | `tests/knowledge/NotesKnowledgePublishing.test.tsx` | `npm test -- tests/knowledge/NotesKnowledgePublishing.test.tsx -x` | Yes | Complete |
| 16-14-03 | 14 | 10 | INGEST-01, INGEST-02, INGEST-05 | DLP modal trigger/no egress on close | `tests/knowledge/NotesWorkspacePublishingIntegration.test.tsx` | `npm test -- tests/knowledge/NotesWorkspacePublishingIntegration.test.tsx -x` | No — task creates | Complete |
| 16-15-01 | 15 | 10 | INGEST-01, INGEST-05 | backup schema integrity/content-free records | TypeScript compile | `npx tsc --noEmit` | Yes | Complete |
| 16-15-02 | 15 | 10 | INGEST-01, INGEST-05 | transactional backup restore/rollback | `tests/services/backup/restoreBackup.test.ts` | `npm test -- tests/services/backup/restoreBackup.test.ts -x` | Yes | Complete |
| 16-15-03 | 15 | 10 | INGEST-01, INGEST-05 | V10 export/validate/restore round-trip | `tests/services/backup/knowledgeBackupRestore.test.ts` | `npm test -- tests/services/backup/knowledgeBackupRestore.test.ts -x` | No — task creates | Complete |
| 16-16-01 | 16 | 11 | INGEST-01, INGEST-03, INGEST-04, INGEST-05 | D-05, D-07; fail-closed listener config | `knowledge-server/tests/main.test.ts` | `npm --prefix knowledge-server test -- main.test.ts` | No — task creates | Pending |
| 16-16-02 | 16 | 11 | INGEST-01, INGEST-03, INGEST-04, INGEST-05 | D-05, D-07; health auth/CORS | `main.test.ts`, `server.test.ts` | `npm --prefix knowledge-server test -- server.test.ts main.test.ts` | `main.test.ts` after 16-16-01 | Pending |
| 16-17-01 | 17 | 11 | INGEST-01, INGEST-05 | D-05, D-07; token continuity/no persistence | config and workspace tests | `npm test -- tests/knowledge/KnowledgeServerConfigCard.test.tsx tests/knowledge/NotesWorkspacePublishingIntegration.test.tsx` | Yes | Pending |
| 16-17-02 | 17 | 11 | INGEST-01, INGEST-05 | D-01, D-02; stable set/no publish | `tests/knowledge/NotesWorkspacePublishingIntegration.test.tsx` | `npm test -- tests/knowledge/NotesWorkspacePublishingIntegration.test.tsx` | Yes | Pending |
| 16-18-01 | 18 | 11 | INGEST-01, INGEST-05 | document-chat referential validation | `tests/services/backup/knowledgeBackupRestore.test.ts` | `npm test -- tests/services/backup/knowledgeBackupRestore.test.ts` | Yes | Pending |
| 16-18-02 | 18 | 11 | INGEST-01, INGEST-05 | export/restore/rollback data safety | `tests/services/backup/knowledgeBackupRestore.test.ts` | `npm test -- tests/services/backup/knowledgeBackupRestore.test.ts` | Yes | Pending |
| 16-19-01 | 19 | 12 | INGEST-01, INGEST-04 | D-08; bounded authoritative error code | `tests/knowledge/knowledgeClient.test.ts` | `npm test -- tests/knowledge/knowledgeClient.test.ts` | Yes | Pending |
| 16-19-02 | 19 | 12 | INGEST-01, INGEST-04 | D-03, D-04, D-08; fail-closed removal preview | client/workspace tests | `npm test -- tests/knowledge/NotesWorkspacePublishingIntegration.test.tsx tests/knowledge/knowledgeClient.test.ts` | Yes | Pending |
| 16-20-01 | 20 | 12 | INGEST-02 | D-15–D-19; service-boundary approval | `tests/knowledge/publishDlpGate.test.ts` | `npm test -- tests/knowledge/publishDlpGate.test.ts` | Yes | Pending |
| 16-20-02 | 20 | 12 | INGEST-02 | D-16; fresh UI approval/reset | DLP/UI tests | `npm test -- tests/knowledge/DocumentSetPublishFlow.test.tsx tests/knowledge/publishDlpGate.test.ts` | Yes | Pending |
| 16-23-01 | 23 | 13 | INGEST-01, INGEST-04, INGEST-05 | D-07, D-08, D-10, D-29; frozen-manifest integrity | `tests/knowledge/publishStatus.test.ts` | `npm test -- tests/knowledge/publishStatus.test.ts` | Yes | Pending |
| 16-23-02 | 23 | 13 | INGEST-01, INGEST-04, INGEST-05 | D-09, D-10, D-12; persist before accepted return | client/repository tests | `npm test -- tests/knowledge/knowledgeClient.test.ts tests/knowledge/publishStatus.test.ts` | Yes | Pending |
| 16-23-03 | 23 | 13 | INGEST-01, INGEST-05 | D-07, D-08, D-18; safe backup manifest | `tests/services/backup/knowledgeBackupRestore.test.ts` | `npm test -- tests/services/backup/knowledgeBackupRestore.test.ts` | Yes | Pending |
| 16-21-01 | 21 | 14 | INGEST-01, INGEST-04, INGEST-05 | D-08, D-10, D-14; atomic activation/retirement | `tests/knowledge/publishStatus.test.ts` | `npm test -- tests/knowledge/publishStatus.test.ts` | Yes | Pending |
| 16-21-02 | 21 | 14 | INGEST-01, INGEST-04, INGEST-05 | D-06, D-10, D-12, D-13; H1 vs H2 close/reload | client/DLP/repository tests | `npm test -- tests/knowledge/knowledgeClient.test.ts tests/knowledge/publishDlpGate.test.ts tests/knowledge/publishStatus.test.ts` | Yes | Pending |
| 16-22-01 | 22 | 15 | INGEST-01, INGEST-02, INGEST-04, INGEST-05 | D-06, D-12, D-13; terminal UI/no cancel | `tests/knowledge/DocumentSetPublishFlow.test.tsx` | `npm test -- tests/knowledge/DocumentSetPublishFlow.test.tsx` | Yes | Pending |
| 16-22-02 | 22 | 15 | INGEST-01, INGEST-04, INGEST-05 | D-08, D-10, D-27–D-29; resumed truthful badges | workspace/publish badge tests | `npm test -- tests/knowledge/NotesWorkspacePublishingIntegration.test.tsx tests/knowledge/DocumentSetPublishFlow.test.tsx tests/knowledge/NotesKnowledgePublishing.test.tsx` | Yes | Pending |

## Wave 0 Requirements

Wave 0 means test/config scaffold created at start of owning task before production code. No unverified implementation task precedes it.

- [x] Plans 16-01 through 16-15 created their listed test/config files during completed execution.
- [ ] `knowledge-server/tests/main.test.ts` — executable daemon startup and invalid configuration coverage (16-16-01).
- Existing focused files extended by 16-17 through 16-23: `KnowledgeServerConfigCard.test.tsx`, `NotesWorkspacePublishingIntegration.test.tsx`, `knowledgeBackupRestore.test.ts`, `knowledgeClient.test.ts`, `publishDlpGate.test.ts`, `DocumentSetPublishFlow.test.tsx`, `publishStatus.test.ts`, and `NotesKnowledgePublishing.test.tsx`.

## Requirement Coverage Gate

| Requirement | Direct automated coverage |
|---|---|
| INGEST-01 | 16-01, 16-02, 16-06, 16-08–16-19, 16-21–16-23 |
| INGEST-02 | 16-03, 16-09, 16-11, 16-13, 16-14, 16-20, 16-22 |
| INGEST-03 | 16-04–16-07, 16-13, 16-16 |
| INGEST-04 | 16-04–16-09, 16-11, 16-13, 16-16, 16-19, 16-21–16-23 |
| INGEST-05 | 16-01, 16-02, 16-07–16-18, 16-21–16-23 |

## Manual Verification

| Behavior | Requirements | Why manual | Steps |
|---|---|---|---|
| Focus order, responsive layout, semantic color/text/icon, keyboard reorder, sticky mobile actions | INGEST-01, INGEST-02, INGEST-05 | Visual/focus quality needs browser inspection | Run app without daemon; open Docs → `Bộ tài liệu`; create/reorder set by keyboard; inspect exact preview; cancel and confirm removal/DLP paths; close accepted progress; verify focus restore at desktop/tablet/mobile widths. |
| Independent deployment smoke | INGEST-01, INGEST-05 | Process/network environment differs by operator | Start daemon with `npm run knowledge:dev`; connect via loopback; stop daemon and confirm local Docs/BM25 stay usable and cached status remains. |
| Durable close/reload recovery | INGEST-01, INGEST-04, INGEST-05 | Browser lifecycle complements deterministic automated DB test | Submit H1, close progress, edit local Markdown to H2, reload app, run `Kiểm tra trạng thái`, and confirm terminal success leaves badge `Có thay đổi cục bộ` while canonical H2 remains untouched. |

## Final Gates

- [x] Every one of 44 tasks has `<automated>` verification.
- [x] Exact task IDs cover final 23-plan graph through 16-23.
- [x] Wave order covers Waves 1–15; exact sampling commands cover Waves 10–15.
- [x] Wave 0 entries identify remaining not-yet-existing test/config files.
- [x] No watch-mode flags in verification commands.
- [x] Sampling continuity has no unverified implementation gap.
- [x] D-10 has executable POST-close-edit-reload-resume H1-versus-H2 regression coverage.
- [x] Critical security threats have concrete negative assertions.
- [x] `nyquist_compliant: true`.

**Approval:** revised graph ready for execution; Plans 16-16 through 16-23 remain Pending until run.
