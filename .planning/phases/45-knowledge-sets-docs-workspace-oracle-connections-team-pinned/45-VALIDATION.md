---
phase: "45"
slug: "knowledge-sets-docs-workspace-oracle-connections-team-pinned"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-19"
---

# Phase 45 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` (project standard) |
| **Quick run command** | `npx tsc --noEmit -p tsconfig.json && npx vitest run <focused test files>` |
| **Full suite command** | `npx vitest run` (NOT to be run in this phase per project rule — full suite can take over an hour) |
| **Estimated runtime** | ~2–60 seconds per focused sampling, depending on file set |

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
| 45-W0 | 00 | 0 | Phase-wide support | T-45-SEC-01 / — | Oracle secrets never enter plaintext backups; tool errors never reveal raw connection strings; remote SQLcl command is never logged | unit | `npx tsc --noEmit -p tsconfig.json && npx vitest run tests/services/ai/__tests__/oracleSqlclService.test.ts tests/services/backup/__tests__/validateBackup.test.ts` | ❌ W0 | ⬜ pending |
| 45-01-01 | 01 | 1 | Knowledge set lifecycle | T-45-01 / — | Delete default purges remote; local-only requires typed confirmation; server discovery stays authoritative | unit/component | `npx tsc --noEmit -p tsconfig.json && npx vitest run tests/components/knowledge/DocumentSetDrawer.test.tsx tests/services/knowledge/knowledgeClient.test.ts` | ❌ W0 | ⬜ pending |
| 45-02-01 | 02 | 1 | Docs workspace/tabs | — | Docs page renders bounded set list; clicking set opens app tab without browser navigation | component | `npx tsc --noEmit -p tsconfig.json && npx vitest run tests/components/knowledge/DocsWorkspace.test.tsx tests/stores/layoutStore.test.ts` | ❌ W0 | ⬜ pending |
| 45-03-01 | 03 | 2 | Oracle multi-connection | T-45-SEC-01 | Named profiles resolve by id/name/environment with active fallback; missing selector error lists names only; profiles excluded from plaintext backup | unit | `npx tsc --noEmit -p tsconfig.json && npx vitest run tests/services/ai/__tests__/oracleSqlclService.test.ts tests/services/ai/__tests__/oracleMultiConnection.test.ts` | ❌ W0 | ⬜ pending |
| 45-04-01 | 04 | 3 | Team pinned context | T-45-CTX-01 | Pinned text is wrapped as untrusted data and injected into both lead and employee builders on every turn; badge shows active pin | unit/component | `npx tsc --noEmit -p tsconfig.json && npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts tests/components/ai/office/TeamWorkspace.test.tsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/services/ai/__tests__/oracleSqlclService.test.ts` — extend for config migration, selector resolution, safe errors, backup denylist
- [ ] `tests/components/knowledge/DocumentSetDrawer.test.tsx` — delete default / typed confirmation
- [ ] `tests/components/knowledge/DocsWorkspace.test.tsx` — dedicated docs screen + app tab opening
- [ ] `tests/services/ai/office/teamRunCoordinator.test.ts` — pinned context injection on lead/employee paths
- No framework install needed (vitest already configured).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live knowledge server `GET /sets` + purge on the deployed instance | Phase D-03/D-04 | Docker/knowledge server unavailable in WSL; live API cannot be exercised from CI in this environment | Use Settings > Knowledge Daemon set list against 10.4.97.70:30080; verify only expected set is listed; purge a disposable test set only |
| Real Oracle SQLcl connection test for SIT/UAT profiles | Phase D-09..D-15 | Requires live SSH/DB credentials not stored in repo | In Settings Oracle card, add profile, Test connection, confirm banner, then ask AI to query by environment name |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
