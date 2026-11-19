---
phase: "45"
slug: "knowledge-sets-docs-workspace-oracle-connections-team-pinned"
status: signed-off
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-19"
updated: "2026-11-19"
---

# Phase 45 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Paths regenerated 2026-11-19 from the FINAL plan commands after plan-check revision:
> colocated `src/**/__tests__/` suites are used where they exist; the legacy Oracle
> test is `src/services/ai/__tests__/oracleSqlclService.test.ts`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vite.config.ts` (`test` block; `vitest.config.ts` does not exist in this repo) |
| **Quick run command** | `npx tsc --noEmit -p tsconfig.json && npx vitest run <focused test files>` |
| **Full suite command** | `npx vitest run` (NOT to be run this phase — full suite can take over an hour) |
| **Server route suite** | `npm --prefix knowledge-server test -- --run tests/setListRoutes.test.ts` |
| **Estimated runtime** | ~2–60 seconds per focused sampling |

---

## Sampling Rate

- **After every task commit:** Run the focused `npx tsc --noEmit -p tsconfig.json && npx vitest run <files for that task>` command copied from the plan.
- **After every plan wave:** Run the union of focused tests for that wave plus typecheck. Do not run the full suite; record this deviation in verification.
- **Before `/gsd-verify-work`:** All focused test files listed in each plan must be green and typecheck clean.
- **Max feedback latency:** 90 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 45-01-01 | 01 | 1 | D-04 | T-45-02 | GET /sets returns authoritative list with auth; listPublishedSets parses + propagates typed errors | unit | `npx tsc --noEmit -p tsconfig.json && npm --prefix knowledge-server test -- --run tests/setListRoutes.test.ts && npx vitest run tests/knowledge/knowledgeClient.test.ts` | ❌ W0 (route test) / ✅ client | ✅ green (focused gate 45-05) |
| 45-01-02 | 01 | 1 | D-03, D-05 | T-45-03 | Settings "Quản lý set" lists sets, confirms purge, refreshes, graceful offline; no live DELETE in tests | component | `npx tsc --noEmit -p tsconfig.json && npx vitest run tests/knowledge/KnowledgeServerConfigCard.test.tsx` | ✅ extend | ✅ green (focused gate 45-05) |
| 45-01-03 | 01 | 1 | D-01, D-02 | T-45-01 | Shared delete dialog: full-delete default + typed confirmation; mounted by drawer and (plan 02) doc_set detail; server discovery unchanged | component | `npx tsc --noEmit -p tsconfig.json && npx vitest run src/components/knowledge/__tests__/DocumentSetDeleteDialog.test.tsx` | ❌ W0 | ✅ green (focused gate 45-05) |
| 45-02-01 | 02 | 2 | D-06, D-07, D-08 | T-45-04, T-45-05 | Dedicated Docs workspace; click set opens persistent in-app doc_set tab; bounded document lists; detail mounts shared delete dialog | component/store | `npx tsc --noEmit -p tsconfig.json && npx vitest run src/workbench/__tests__/DocsWorkspace.test.tsx src/workbench/__tests__/layoutStore.test.ts` | ❌ W0 (DocsWorkspace) / ✅ layoutStore extend | ✅ green (focused gate 45-05) |
| 45-03-01 | 03 | 1 | D-09, D-10, D-11, D-13 | T-45-07 | Named profiles; migration to active profile #1 then legacy key removed; id/name/env/active resolution; name-only errors; read-only guard unchanged | unit | `npx tsc --noEmit -p tsconfig.json && npx vitest run src/services/ai/__tests__/oracleSqlclService.test.ts` | ✅ extend | ✅ green (focused gate 45-05) |
| 45-03-02 | 03 | 1 | D-09, D-12, D-04 | T-45-06, T-45-09 | Safe metadata tool + gated advertisement; readiness from any ready profile; BOTH Oracle keys denylisted from backups | unit | `npx tsc --noEmit -p tsconfig.json && npx vitest run src/services/ai/__tests__/oracleMultiConnection.test.ts src/services/ai/__tests__/chatTurnTools.test.ts tests/services/backup/exportBackup.test.ts` | ❌ W0 (multi) / ✅ extend | ✅ green (focused gate 45-05) |
| 45-03-03 | 03 | 1 | D-14 | T-45-08 | Settings profile management (list/add/edit/test/delete/set-active); no plaintext secrets in UI or errors | unit (via service API) | `npx tsc --noEmit -p tsconfig.json && npx vitest run src/services/ai/__tests__/oracleSqlclService.test.ts src/services/ai/__tests__/oracleMultiConnection.test.ts` | ✅ extend | ✅ green (focused gate 45-05) |
| 45-04-01 | 04 | 2 | D-16, D-17 | T-45-10, T-45-12 | Pin persisted in type/schema/backup; wrapped as untrusted; injected into both prompt builders + both coordinator sites | unit | `npx tsc --noEmit -p tsconfig.json && npx vitest run tests/services/ai/office/teamPrompts.test.ts tests/validation/backupSchemas.test.ts` | ✅ extend | ✅ green (focused gate 45-05) |
| 45-04-02 | 04 | 2 | D-16, D-19 | T-45-11 | Team Settings editor; team-scoped/global-independent semantics | unit (schema layer) | `npx tsc --noEmit -p tsconfig.json && npx vitest run tests/services/ai/office/teamPrompts.test.ts tests/validation/backupSchemas.test.ts` | ✅ extend | ✅ green (focused gate 45-05) |
| 45-04-03 | 04 | 2 | D-18 | T-45-10 | Chat badge with tooltip of current pin; absent when no pin | component | `npx tsc --noEmit -p tsconfig.json && npx vitest run tests/components/ai/office/TeamWorkspacePinnedContext.test.tsx` | ❌ W0 | ✅ green (focused gate 45-05) |
| 45-05-01 | 05 | 3 | all D-01..D-19 | — | Combined focused test + typecheck gate across all plans; no full suite | gate | `npx tsc --noEmit -p tsconfig.json && npx vitest run tests/knowledge/knowledgeClient.test.ts tests/knowledge/KnowledgeServerConfigCard.test.tsx src/components/knowledge/__tests__/DocumentSetDeleteDialog.test.tsx src/workbench/__tests__/DocsWorkspace.test.tsx src/workbench/__tests__/layoutStore.test.ts src/services/ai/__tests__/oracleSqlclService.test.ts src/services/ai/__tests__/oracleMultiConnection.test.ts src/services/ai/__tests__/chatTurnTools.test.ts tests/services/backup/exportBackup.test.ts tests/services/ai/office/teamPrompts.test.ts tests/services/ai/office/teamRunCoordinator.test.ts tests/components/ai/office/TeamWorkspacePinnedContext.test.tsx tests/validation/backupSchemas.test.ts && npm --prefix knowledge-server test -- --run tests/setListRoutes.test.ts` | mixed | ✅ green (focused gate 45-05) |

*Status: ✅ green (focused gate 45-05) · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `knowledge-server/tests/setListRoutes.test.ts` — D-04 GET /sets (new)
- [x] `src/components/knowledge/__tests__/DocumentSetDeleteDialog.test.tsx` — D-01/D-02 type-to-confirm + purge ordering + shared reuse (new)
- [x] `src/workbench/__tests__/DocsWorkspace.test.tsx` — dedicated Docs screen + doc_set tab + delete-dialog mount (new; extend `src/workbench/__tests__/layoutStore.test.ts`)
- [x] `src/services/ai/__tests__/oracleMultiConnection.test.ts` — D-10/D-11 selector + safe errors (new)
- [x] `tests/components/ai/office/TeamWorkspacePinnedContext.test.tsx` — D-18 badge/tooltip (new)
- [x] Extend existing: `src/services/ai/__tests__/oracleSqlclService.test.ts`, `src/services/ai/__tests__/chatTurnTools.test.ts`, `tests/services/backup/exportBackup.test.ts`, `tests/services/ai/office/teamPrompts.test.ts`, `tests/services/ai/office/teamRunCoordinator.test.ts`, `tests/validation/backupSchemas.test.ts`, `tests/knowledge/KnowledgeServerConfigCard.test.tsx`, `src/workbench/__tests__/layoutStore.test.ts`
- No framework install needed (vitest already configured).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live knowledge server `GET /sets` + purge on the deployed instance | D-03/D-04 | Docker/knowledge server unavailable in WSL; live API cannot be exercised from CI here | Use Settings > Knowledge Daemon set list against the configured daemon; verify only the expected disposable test set is listed; **purge a freshly created disposable test set ONLY — never production set `917baf58-...`** |
| Real Oracle SQLcl connection test for SIT/UAT profiles | D-09..D-15 | Requires live SSH/DB credentials not stored in repo | In Settings Oracle card, add profile, Test connection, confirm banner, then ask AI to query by environment name |
| Observed end-of-phase walkthrough (C-15) | D-01..D-19 | No acceptance by reading code | 5 observations in 45-05; recorded PASS/manual-only with automated fallback in 45-VERIFICATION.md |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 90s (per focused suite; combined gate bounded by CPU contention from unrelated sessions)
- [x] `nyquist_compliant: true` set in frontmatter once the gate is green

**Approval:** signed-off 2026-11-19 by executor at plan 45-05. Combined gate green (13 files / 387 tests + server 2/2), code + UI reviews zero open critical/warning. C-15 real-window walkthrough is **manual-only with automated fallback** (Tauri dev blocked: crates.io 403; no daemon): see `45-VERIFICATION.md` Task 3 — owner must complete the five manual observations before C-15 is discharged.
