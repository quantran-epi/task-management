---
phase: 25
slug: interactive-sdlc-document-wizards
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-28
updated: 2026-10-28
---

# Phase 25 — Validation Strategy

> Pre-execution contract. `nyquist_compliant` and `wave_0_complete` stay false until plans execute and evidence exists.

## Test Infrastructure

| Property | Value |
|---|---|
| Unit/component | Vitest 5 + jsdom + fake-indexeddb |
| E2E | Playwright Chromium against actual Vite app |
| Quick state | `npm test -- tests/ai/wizardState.test.ts` |
| Quick archive | `npm test -- tests/ai/changePack.test.ts` |
| Quick builder | `npm test -- tests/export/wizardDocx.test.ts` |
| Full phase | `npm test -- tests/ai/wizardState.test.ts tests/ai/wizardService.test.ts tests/ai/changePack.test.ts tests/ai/reconciliation.test.ts tests/export/wizardDocx.test.ts src/components/ai/wizard/__tests__/wizardEntryLifecycle.test.tsx src/components/ai/wizard/__tests__/wizardInterviewPack.test.tsx src/components/ai/wizard/__tests__/documentWizard.test.tsx tests/backup/wizardBackup.test.ts` |
| Actual app | `npm run test:e2e -- e2e/documentWizards.spec.ts --project=chromium` |
| Runtime | Node 24 LTS required by project standard |

## Sampling Policy

- Sau mỗi task: command nhỏ nhất trong map dưới, target <30 giây.
- Sau mỗi wave: full phase command khi tất cả producer files cho wave đã tồn tại.
- Sau builder changes: `tests/export/wizardDocx.test.ts` + rendered manual check cho form bị đổi.
- Final: full phase + actual-app E2E + manual template fidelity + opt-in live synthetic review.
- Không chạy unrelated full repository suite.

## Wave 0 Producer/Consumer Contract

| Producer | Produces | Consumers | Gate |
|---|---|---|---|
| 25-01 T1 | Three real bank DOCX under `docs/pl-templates/` | 25-02, 25-08, 25-09, 25-18 | Blocking human source input; ZIP signature |
| 25-01 T2 | P25-R01..R06 copied into `25-01-SUMMARY.md` | 25-03, 25-05, 25-06, 25-16 | Context assertion command; no decision checkpoint |
| 25-02 T1 | Source hashes, PL07 baseline, semantic structure fixtures, builder test scaffold | 25-08, 25-09, 25-10, 25-18 | `npm test -- tests/export/wizardDocx.test.ts` |
| 25-02 T2 | Human baseline/source-structure review | 25-09, 25-18 | Blocking human verdict |
| 25-03 T1/T2 | Wizard/artifact schemas, backup parity tests | 25-05..25-16 | State + backup targeted suites |
| 25-04 T1 | F01–F16 fixture and unit/component test scaffolds | 25-05, 25-07, 25-11, 25-12, 25-17 | Scaffold command with named TODO count |
| 25-04 T2 | Playwright `webServer` and real-app E2E scaffold | 25-17 | Playwright smoke |

Exact resolutions consumed by Wave 0 and later:

- `maxCompressedBytes=5_242_880`
- `maxExpandedBytes=26_214_400`
- `maxEntryBytes=2_097_152`
- `maxEntries=256`
- `commits: {sha:string, subject:string}[]`
- `files: {path:string, status:string}[]`; status is non-empty bounded string because D-14 does not lock an enum
- optional `DocumentSet.sdlc={projectId,purpose:'sdlc'}` and `Note.sdlcArtifact`
- canonical Markdown + validated export payload in Project-linked Note
- ChatMessage pointer + bounded render snapshot; structured payload cap `524_288` UTF-8 bytes
- no new table/index/migration
- direct-anchor copy `Đã bắt đầu tải`; full `Đã tải` only after save picker confirms saved and Note save succeeds

## Complete Plan/Task Verification Map

| Plan | Wave | Task | Requirements | Automated command | Producer/observable proof |
|---|---:|---|---|---|---|
| 25-01 | 0 | T1 Restore DOCX | WIZ-DOCX-01 | `node -e "const fs=require('fs'); const p=['docs/pl-templates/PL02.537962 Điều chỉnh logic và chức năng quản lý spending limit của the TDDN.docx','docs/pl-templates/PL03B-tokenization-CTM-TichHop.docx','docs/pl-templates/PL07-tokenization-ctm.docx']; for(const f of p){const b=fs.readFileSync(f); if(b.length<4||b[0]!==0x50||b[1]!==0x4b) throw Error(f)}"` | Three source files exist; human confirms origin |
| 25-01 | 0 | T2 Pin resolutions | WIZ-PACK-01, WIZ-LOOP-01 | `node -e "const fs=require('fs'); const s=fs.readFileSync('.planning/phases/25-interactive-sdlc-document-wizards/25-CONTEXT.md','utf8'); for(const x of ['5_242_880','26_214_400','2_097_152','maxEntries=256','524_288','DocumentSet.sdlc']) if(!s.includes(x)) throw Error(x)"` | Exact constants copied to summary |
| 25-02 | 1 | T1 Extract fixtures | WIZ-DOCX-01 | `npm test -- tests/export/wizardDocx.test.ts` | Source manifest, PL07 baseline, three structure fixtures |
| 25-02 | 1 | T2 Human fixture review | WIZ-DOCX-01 | `npm test -- tests/export/wizardDocx.test.ts` | Reviewer/tool/hash verdict |
| 25-03 | 1 | T1 State/schema | WIZ-FLOW-01, WIZ-LOOP-01 | `npm test -- tests/ai/wizardState.test.ts` | Strict transitions, 524288-byte cap, no migration |
| 25-03 | 1 | T2 Backup parity | WIZ-LOOP-01 | `npm test -- tests/backup/wizardBackup.test.ts tests/ai/chatRepo.test.ts` | Export/validate/restore deep equality |
| 25-04 | 0 | T1 F01–F16 scaffold | All except WIZ-DOCX-01 direct builder | `npm test -- tests/ai/wizardService.test.ts tests/ai/changePack.test.ts tests/ai/reconciliation.test.ts src/components/ai/wizard/__tests__/documentWizard.test.tsx` | Exactly F01..F16 and named TODOs |
| 25-04 | 0 | T2 Actual-app scaffold | WIZ-UI-01 | `npm run test:e2e -- e2e/documentWizards.spec.ts --project=chromium` | Vite webServer smoke, no `page.setContent` |
| 25-05 | 2 | T1 ZIP validation | WIZ-PACK-01 | `npm test -- tests/ai/changePack.test.ts` | Exact profile-B and adversarial boundary cases; zero writes |
| 25-05 | 2 | T2 Reconciliation | WIZ-FLOW-01, WIZ-PACK-01 | `npm test -- tests/ai/reconciliation.test.ts` | Four sections, drift tuples, complete coverage gate |
| 25-07 | 2 | T1 Evidence/gaps | WIZ-INTERACTIVE-01 | `npm test -- tests/ai/wizardService.test.ts` | Gap-only questions, strict output, degraded path, budgets |
| 25-07 | 2 | T2 Artifact proposals | WIZ-FLOW-01 | `npm test -- tests/ai/wizardService.test.ts` | PL02/SOLUTION/PL03/PL07/CAB strict proposals |
| 25-08 | 2 | T1 PL02 builder | WIZ-DOCX-01 | `npm test -- tests/export/wizardDocx.test.ts -t PL02` | Source-derived semantic OOXML |
| 25-08 | 2 | T2 PL02 dispatcher | WIZ-DOCX-01 | `npm test -- tests/export/wizardDocx.test.ts -t "PL02|dispatcher"` | Local Blob, deterministic semantics, no script |
| 25-11 | 2 | T1 Entry/metadata UI | WIZ-UI-01 | `npm test -- src/components/ai/wizard/__tests__/wizardEntryLifecycle.test.tsx tests/ai/ChatInputBar.test.tsx` | Project gate, keyboard, metadata/focus |
| 25-11 | 2 | T2 Lifecycle UI | WIZ-UI-01 | `npm test -- src/components/ai/wizard/__tests__/wizardEntryLifecycle.test.tsx` | Progress/draft/cancel semantics |
| 25-06 | 3 | T1 Artifact persistence | WIZ-FLOW-01, WIZ-LOOP-01 | `npm test -- tests/ai/wizardState.test.ts tests/backup/wizardBackup.test.ts` | Atomic idempotent version/save |
| 25-06 | 3 | T2 Pack persistence | WIZ-PACK-01 | `npm test -- tests/ai/changePack.test.ts` | All-or-nothing transaction and replay guard |
| 25-09 | 3 | T1 PL03B builder | WIZ-DOCX-01, WIZ-FLOW-01 | `npm test -- tests/export/wizardDocx.test.ts -t PL03B` | Four-section PL03B semantic OOXML |
| 25-09 | 3 | T2 PL07 builder | WIZ-DOCX-01 | `npm test -- tests/export/wizardDocx.test.ts -t PL07` | Exact immutable I–V and dynamic VI |
| 25-12 | 3 | T1 Gap cards | WIZ-UI-01, WIZ-INTERACTIVE-01 | `npm test -- src/components/ai/wizard/__tests__/wizardInterviewPack.test.tsx -t "gap|question|skip"` | Skip remains unknown; escaped text |
| 25-12 | 3 | T2 Pack/drift UI | WIZ-UI-01, WIZ-PACK-01 | `npm test -- src/components/ai/wizard/__tests__/wizardInterviewPack.test.tsx -t "pack|drop|drift"` | File identity, stable errors, partial coverage warning |
| 25-10 | 4 | T1 CAB builder | WIZ-DOCX-01, WIZ-FLOW-01 | `npm test -- tests/export/wizardDocx.test.ts -t CAB` | Minimal same-thread caveat-preserving CAB |
| 25-10 | 4 | T2 Full dispatcher | WIZ-DOCX-01 | `npm test -- tests/export/wizardDocx.test.ts` | Four kinds, no TODO/script/network |
| 25-14 | 4 | T1 Coordinator | WIZ-INTERACTIVE-01, WIZ-LOOP-01 | `npm test -- tests/ai/wizardState.test.ts` | Currentness, restore, cancel, version flow |
| 25-14 | 4 | T2 Drawer core wiring | WIZ-UI-01 | `npm test -- tests/ai/AIChatDrawerWizard.test.tsx tests/ai/AIChatDrawerGroundedWiring.test.tsx` | Project lifecycle + normal chat regression |
| 25-13 | 5 | T1 Review cards | WIZ-UI-01, WIZ-DOCX-01 | `npm test -- src/components/ai/wizard/__tests__/documentWizard.test.tsx -t "preview|solution|saved|export"` | Immutable preview and truthful outcomes |
| 25-13 | 5 | T2 Message routing | WIZ-UI-01 | `npm test -- tests/ai/ChatMessageBubble.test.tsx src/components/ai/wizard/__tests__/documentWizard.test.tsx` | Wizard-first callback; sandbox zero |
| 25-15 | 5 | T1 Pack loop | WIZ-PACK-01, WIZ-FLOW-01 | `npm test -- tests/ai/changePack.test.ts tests/ai/reconciliation.test.ts` | Validate→confirm→persist→reconcile→PL03/PL07 |
| 25-15 | 5 | T2 Drawer pack/CAB | WIZ-FLOW-01, WIZ-LOOP-01 | `npm test -- tests/ai/AIChatDrawerWizard.test.tsx` | Same-thread chain, CAB no re-supply |
| 25-16 | 6 | T1 Export effects | WIZ-DOCX-01, WIZ-LOOP-01 | `npm test -- tests/export/wizardDocx.test.ts -t "export|download|idempotent"` | Build/save/download split outcomes |
| 25-16 | 6 | T2 Drawer export actions | WIZ-UI-01, WIZ-DOCX-01 | `npm test -- tests/ai/AIChatDrawerWizard.test.tsx tests/ai/ChatMessageBubble.test.tsx` | Exact direct-anchor/save-picker copy, retry no duplicate |
| 25-17 | 7 | T1 Activate acceptance | All six | Full phase command above | F01–F16; zero TODO/skip; critical invariants |
| 25-17 | 7 | T2 Actual-app E2E | All six | Actual app command above | Full loop/reload/offline/daemon-down/no network export |
| 25-18 | 8 | T1 Render fidelity | WIZ-DOCX-01 | Full phase command + actual app command | Human source-hash/viewer/region verdict |
| 25-18 | 8 | T2 Dependency/live review | WIZ-INTERACTIVE-01, WIZ-FLOW-01 | `node -e "const fs=require('fs'); const s=fs.readFileSync('.planning/phases/25-interactive-sdlc-document-wizards/25-VALIDATION.md','utf8'); for(const x of ['status: approved','nyquist_compliant: true','wave_0_complete: true']) if(!s.includes(x)) throw Error(x)"` | Explicit Phase 24-08 preflight + opt-in F01/F02/F06/F08/F09/F11 review |

## Security Test Matrix

| Threat | Automated proof |
|---|---|
| Prompt injection/untrusted source | F11; unknown effect/tool fields rejected; script/network spies zero |
| ZIP traversal/collision/bomb | Exact profile-B boundary/+1, unsafe original names and canonical duplicate cases |
| Stale cross-project commit | Interleaved project/thread/session/revision/hash tests and E2E scope switch |
| Unsupported approval/drift claims | Unknown states and complete-coverage gate; mixed CAB revisions rejected |
| Sensitive diagnostics | Allowlisted flat metrics; source scans/assertions exclude raw doc/diff/prompt/secret/path/title/query/URL/stack |
| Generated executable export | `executeDynamicFileScript` spy/source gate zero for all four outputs |
| Duplicate/replay | Concurrent save/confirm/export idempotency tests and IndexedDB count assertions |

## Manual Gates

| Gate | Evidence required |
|---|---|
| Source restore | Three filenames, positive bytes, ZIP signature, human source-origin confirmation |
| PL07 fixture | Source SHA-256, reviewer, viewer/version, exact I–V and II.5 wording/order verdict |
| Render fidelity | Generated/source side-by-side; viewer/version; page/section/table/merge/font/margin/header/footer/sign-off verdict per form |
| Live AI | Explicit opt-in; synthetic F01/F02/F06/F08/F09/F11; model/config identity without secrets; schema/prompt versions; attempts; evidence/support/drift/injection verdict |
| Phase 24 | Read/check `24-08-SUMMARY.md`; missing/failing preflight blocks final sign-off but is not a cross-phase frontmatter dependency |

## Sign-Off Rules

- Before execution: `nyquist_compliant: false`, `wave_0_complete: false`, `status: draft`.
- Set `wave_0_complete: true` only after 25-01..25-04 producer gates and 25-02 human review pass.
- Set `nyquist_compliant: true` and `status: approved` only after 25-17 suites, Phase 24-08 preflight, 25-18 rendered fidelity, and opt-in live review pass.
- `skip live review` leaves rollout unverified; never marks pass.
- No result implies institutional, CAB, deployment, regulatory, or security approval.
