---
phase: "38"
slug: "hard-token-budget-accurate-measurement"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-13"
---

# Phase 38 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `38-RESEARCH.md` § Validation Architecture. Criteria 1 and 6 are read per CONTEXT D-01/D-02 (budget warns, never blocks).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 (jsdom global env; node env per-file) |
| **Config file** | `vite.config.ts` (`test:` block; `setupFiles: ['./tests/setup.ts']`, `fileParallelism: false`) |
| **Quick run command** | `npx vitest run tests/services/ai/office/aiTeamRepo.test.ts` |
| **Full suite command** | **not run** — project rule: the full suite takes ~1 hour |
| **Estimated runtime** | ~10–25 s per focused file |

---

## Sampling Rate

- **After every task commit:** the single focused file for that task (see map below)
- **After every plan wave:** `npx vitest run tests/services/ai/office/aiTeamRepo.test.ts tests/services/ai/office/teamRunCoordinator.test.ts tests/services/ai/office/budgetGate.test.ts tests/validation/backupSchemas.test.ts`
- **Before `/gsd-verify-work`:** every command in the map green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | 0 | — | — | Fix stale schema literals so the gate can be green | migration | `npx vitest run tests/db/tableListParity.test.ts tests/db/schemaV22Migration.test.ts` | ✅ (red) | ⬜ pending |
| TBD | TBD | TBD | AIO-BUDGET-04 | — | N/A | unit (real Dexie + fake-indexeddb) | `npx vitest run tests/services/ai/office/aiTeamRepo.test.ts -t "concurrent"` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | AIO-BUDGET-05 | — | N/A | unit | `npx vitest run tests/services/ai/office/aiTeamRepo.test.ts -t "remainder"` | ✅ | ⬜ pending |
| TBD | TBD | TBD | AIO-BUDGET-07 | — | N/A | unit | `npx vitest run tests/services/ai/office/aiTeamRepo.test.ts -t "top-up"` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | AIO-BUDGET-02 | — | Notification body carries counts only, never prompt text | unit | `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts -t "no usage"` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | AIO-BUDGET-03 | — | N/A | unit | `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts -t "Retry"` | ✅ | ⬜ pending |
| TBD | TBD | TBD | AIO-BUDGET-01 (override D-01) | — | N/A | unit | `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts -t "budget"` | ✅ (rewrite) | ⬜ pending |
| TBD | TBD | TBD | AIO-BUDGET-06 (override D-02/D-06) | T-38 notification leak | Body templated from numbers + agent name only | unit + component | `npx vitest run tests/services/ai/office/budgetGate.test.ts tests/ai/office/AgentOfficeComponents.test.tsx` | ✅/❌ | ⬜ pending |
| TBD | TBD | TBD | AIO-BUDGET-08 | — | N/A | component | `npx vitest run tests/views/TeamsView.test.tsx tests/ai/office/AgentOfficeComponents.test.tsx` | ✅ | ⬜ pending |
| TBD | TBD | TBD | AIO-BUDGET-09 (override D-01) | — | N/A | unit | `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts -t "threshold"` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | backup parity | T-38 hostile backup counts | `z.number().int().nonnegative()` on new columns | integration | `npx vitest run tests/validation/backupSchemas.test.ts tests/db/tableListParity.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Fix `tests/db/tableListParity.test.ts:101` and `tests/db/schemaV22Migration.test.ts:70` (both assert 23, actual `LATEST_SCHEMA_VERSION = 24`) — nothing else can be green until these are.
- [ ] `tests/services/ai/office/aiTeamRepo.test.ts` — add 20-way concurrency test and two-table top-up test against a real `TaskPlannerDatabase` (`fake-indexeddb/auto` already loaded at `tests/setup.ts:1`). Mocks make the atomicity test vacuous.
- [ ] `tests/services/ai/office/budgetGate.test.ts` — replace bucket assertions with percentage/threshold assertions.
- [ ] One new estimation test file: no usage → estimate; usage present → no estimate; aborted stream → estimate of received text.
- [ ] Install `js-tiktoken@1.0.21` behind a `checkpoint:human-verify` (D-07 approves the dep; the install itself is the checkpoint).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| OS notification actually appears on the desktop when a threshold is crossed | AIO-BUDGET-02/06 | Tauri notification delivery is not exercised under jsdom | Run the app, start a team turn with a tiny budget, confirm one desktop notification per level and none repeated across tool rounds |
| Estimation accuracy vs provider count within a sane band | D-10 | Tokenizer choice is only valid for the model family it encodes | Run a real turn, compare `~`-marked estimate against provider `usage` when it arrives next turn |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
