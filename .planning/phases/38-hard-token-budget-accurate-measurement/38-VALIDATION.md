---
phase: "38"
slug: "hard-token-budget-accurate-measurement"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-13"
revised: "2026-11-13 (revision round 3 — R2-W3)"
---

# Phase 38 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `38-RESEARCH.md` § Validation Architecture. Criteria 1 and 6 are read per CONTEXT D-01/D-02 (budget warns, never blocks).
> Revised in round 3: task IDs/waves now match the twelve committed plans, the unusable `-t "budget"` / `-t "no usage"` / `-t "threshold"` filters are gone, and every row demands a non-skipped passing test rather than a skipped-only green.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 (jsdom global env; node env per-file) |
| **Config file** | `vite.config.ts` (`test:` block; `setupFiles: ['./tests/setup.ts']`, `fileParallelism: false`) |
| **Quick run command** | `npx vitest run tests/services/ai/office/aiTeamRepo.test.ts` |
| **Full suite command** | **not run** — project rule: the full suite takes ~1 hour |
| **Estimated runtime** | ~10–25 s per focused file |

**Evidence rule.** A verify command counts as green only when its output reports at least one passing test and **zero skipped** for the tests the row names. `vitest` exits 0 while printing `N skipped`; that is not evidence. Filters that match no title (which exit 0 with `0 passed`) are forbidden — every `-t` value below is a title fragment the owning plan author writes into the test name.

---

## Sampling Rate

- **After every task commit:** the focused command in that task's row (below)
- **After every plan wave:** the union of that wave's rows
  - Wave 1: `tests/db/tableListParity.test.ts tests/db/schemaV22Migration.test.ts tests/services/ai/office/aiTeamRepo.test.ts`
  - Wave 2: `tests/services/ai/office/aiTeamRepo.test.ts tests/services/backup/officeBackup.test.ts tests/validation/backupSchemas.test.ts tests/services/ai/budgetWarnSettings.test.ts`
  - Wave 3: `tests/services/ai/office/budgetGate.test.ts tests/db/tableListParity.test.ts`
  - Wave 4: `tests/services/ai/office/aiTeamRepo.test.ts tests/services/ai/office/teamRunCoordinator.test.ts tests/components/ai/office/SettingsSaveBudget.test.tsx`
  - Wave 5: `tests/services/ai/office/teamRunCoordinator.test.ts tests/services/ai/office/tokenEstimate.test.ts`
  - Wave 6: `tests/services/ai/office/teamRunCoordinator.test.ts tests/services/ai/office/budgetWarning.test.ts tests/services/ai/office/budgetGate.test.ts`
  - Wave 7: `tests/views/TeamsView.test.tsx tests/ai/office/AgentOfficeComponents.test.tsx`
- **Before `/gsd-verify-work`:** every row below green under the evidence rule
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|--------|
| 38-01 T1 | 01 | 1 | AIO-BUDGET-08 | — | N/A | migration (repair) | `npx vitest run tests/db/tableListParity.test.ts tests/db/schemaV22Migration.test.ts` | ⬜ pending |
| 38-01 T2 | 01 | 1 | AIO-BUDGET-08 | T-38-01 | New columns persist and round-trip through real Dexie at V25 | integration (real Dexie) | `npx vitest run tests/services/ai/office/aiTeamRepo.test.ts tests/db/tableListParity.test.ts tests/db/schemaV22Migration.test.ts` | ⬜ pending |
| 38-01 T3 | 01 | 1 | AIO-BUDGET-06 | T-38-02 | Threshold clamped at the write boundary; usage columns seeded on every creation path | unit (real Dexie) | `npx vitest run tests/services/ai/office/aiTeamRepo.test.ts` | ⬜ pending |
| 38-02 T1 | 02 | 1 | AIO-BUDGET-01, AIO-BUDGET-09 | — | Requirement text records the warning-only override (documentation gate) | doc probe | `grep -c 'Superseded by 38' .planning/REQUIREMENTS.md` (must be ≥ 2) | ⬜ pending |
| 38-02 T2 | 02 | 1 | AIO-BUDGET-01, AIO-BUDGET-09 | — | Roadmap criteria 1 and 6 read warning-only | doc probe | `grep -n 'overrides the original wording' .planning/ROADMAP.md` (must match twice) | ⬜ pending |
| 38-03 T1 | 03 | 2 | AIO-BUDGET-04 | T-38-05 | 20 concurrent increments atomic against real Dexie | unit (real Dexie, no mocks) | `npx vitest run tests/services/ai/office/aiTeamRepo.test.ts -t "AIO-BUDGET-04"` | ⬜ pending |
| 38-03 T2 | 03 | 2 | AIO-BUDGET-05 | T-38-06 | One shared `splitEvenly`, integer-normalized total | unit | `npx vitest run tests/services/ai/office/aiTeamRepo.test.ts -t "remainder"` | ⬜ pending |
| 38-03 T3 | 03 | 2 | AIO-BUDGET-04, AIO-BUDGET-05 | T-38-05 | Split/increment edge coverage (empty, zero, leader-alone, no-lead, fractional) | unit | `npx vitest run tests/services/ai/office/aiTeamRepo.test.ts` | ⬜ pending |
| 38-04 T1 | 04 | 4 | AIO-BUDGET-07 | T-38-08 | Agent top-up moves member and team rows in one `rw` | unit (real Dexie) | `npx vitest run tests/services/ai/office/aiTeamRepo.test.ts -t "AIO-BUDGET-07"` | ⬜ pending |
| 38-04 T2 | 04 | 4 | AIO-BUDGET-05, AIO-BUDGET-07 | T-38-10, T-38-29 | Absolute settings save cannot double-increment; threshold three-state contract | unit (real Dexie) | `npx vitest run tests/services/ai/office/aiTeamRepo.test.ts` | ⬜ pending |
| 38-04 T3 | 04 | 4 | AIO-BUDGET-07 | T-38-09, T-38-29 | Fresh roster inside the transaction (WR-13); one repo call per Settings save | unit + component | `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts && npx vitest run tests/components/ai/office/SettingsSaveBudget.test.tsx` | ⬜ pending |
| 38-05 T1 | 05 | 3 | AIO-BUDGET-06 | T-38-11 | Resolved threshold drives the warning boundary; override distinct from effective | unit | `npx vitest run tests/services/ai/office/budgetGate.test.ts` | ⬜ pending |
| 38-05 T2 | 05 | 3 | AIO-BUDGET-06 | T-38-11 | Percentage/threshold tests replace bucket assertions | unit | `npx vitest run tests/services/ai/office/budgetGate.test.ts` | ⬜ pending |
| 38-05 T3 | 05 | 3 | AIO-BUDGET-06 | T-38-11 | `setTeamThresholdPct(undefined)` clears; unrelated save leaves an absent override absent | unit | `npx vitest run tests/services/ai/office/budgetGate.test.ts` | ⬜ pending |
| 38-06 T1 | 06 | 2 | AIO-BUDGET-02, AIO-BUDGET-08 | T-38-17 | Envelope v14 records carry the split columns; restore is lossless | integration | `npx vitest run tests/services/backup/officeBackup.test.ts` | ⬜ pending |
| 38-06 T2 | 06 | 2 | AIO-BUDGET-02 | T-38-17, T-38-18 | Hostile numeric payloads refused; no fixture pins a version literal | integration | `npx vitest run tests/validation/backupSchemas.test.ts tests/services/backup/officeBackup.test.ts tests/services/backup/v2Compatibility.test.ts tests/services/backup/validateBackup.test.ts tests/validation/backupSchemasTimer.test.ts tests/services/github/githubPullRestore.test.ts tests/backup/tabCheckpointBackup.test.ts tests/noteAttachments.test.ts tests/views/SettingsView.test.tsx` | ⬜ pending |
| 38-06 T3 | 06 | 2 | AIO-BUDGET-02 | T-38-19 | Repeated restore is idempotent for the new counters | integration | `npx vitest run tests/services/backup/officeBackup.test.ts` | ⬜ pending |
| 38-07 T1 | 07 | 5 | AIO-BUDGET-02, AIO-BUDGET-03 | T-38-14, T-38-28 | Typed usage chain; memory-only; one terminal flush; stale-key dropped | unit | `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts -t "AIO-BUDGET-02"` | ⬜ pending |
| 38-07 T2 | 07 | 5 | AIO-BUDGET-02, AIO-BUDGET-03 | T-38-15, T-38-16 | Callback-less/aborted charged; pre-call estimate feeds warning only | unit | `npx vitest run tests/services/ai/office/tokenEstimate.test.ts && npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts` | ⬜ pending |
| 38-07 T3 | 07 | 5 | AIO-BUDGET-03 | T-38-28 | Per-attempt rows across retries; reconcile on every terminal path | unit | `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts -t "Retry" && npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts` | ⬜ pending |
| 38-08 T1 | 08 | 6 | AIO-BUDGET-01, AIO-BUDGET-06, AIO-BUDGET-09 | T-38-20, T-38-21, T-38-33 | Never parks; two levels independent; one notification per (team, level); team-scoped reset | unit + mocked notifier | `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts` | ⬜ pending |
| 38-08 T2 | 08 | 6 | AIO-BUDGET-01, AIO-BUDGET-06 | T-38-22 | Gate implementation deleted; threshold math survives with an importer | unit | `npx vitest run tests/services/ai/office/budgetGate.test.ts tests/services/ai/office/budgetWarning.test.ts` | ⬜ pending |
| 38-08 T3 | 08 | 6 | AIO-BUDGET-01 | T-38-22 | No latent park path; phase stays running across three over-budget rounds | unit | `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts` | ⬜ pending |
| 38-09 T1 | 09 | 7 | AIO-BUDGET-08 | T-38-23, T-38-25 | Split numbers rendered; estimate marked; no NaN | component | `npx vitest run tests/views/TeamsView.test.tsx -t "AIO-BUDGET-08"` | ⬜ pending |
| 38-09 T2 | 09 | 7 | AIO-BUDGET-08 | T-38-24 | Threshold-driven colour; override field stays absent unless set | component | `npx vitest run tests/views/TeamsView.test.tsx tests/ai/office/AgentOfficeComponents.test.tsx` | ⬜ pending |
| 38-09 T3 | 09 | 7 | AIO-BUDGET-08 | T-38-23 | Rendered numbers equal the ledger after settle | integration | `npx vitest run tests/views/TeamsView.test.tsx` | ⬜ pending |
| 38-10 T1 | 10 | 6 | AIO-BUDGET-02 | T-38-SC, T-38-26 | Human confirms the pin before any install | checkpoint probe | `grep -n '"js-tiktoken"' package.json` (must match after task 2) | ⬜ pending |
| 38-10 T2 | 10 | 6 | AIO-BUDGET-02 | T-38-26, T-38-27 | Pinned exact; lazy subpath imports; fallback still reachable | unit + build probe | `npx vitest run tests/services/ai/office/tokenEstimate.test.ts` | ⬜ pending |
| 38-11 T1 | 11 | 2 | AIO-BUDGET-06 | T-38-12, T-38-31 | Global threshold row: clamp on write, fallback on read, whitelist pass | unit (real Dexie) | `npx vitest run tests/services/ai/budgetWarnSettings.test.ts` | ⬜ pending |
| 38-11 T2 | 11 | 2 | AIO-BUDGET-06 | T-38-12 | Card mounted; integer 1..100 input | type gate | `npx tsc --noEmit -p tsconfig.json` | ⬜ pending |
| 38-12 T1 | 12 | 3 | AIO-BUDGET-08 | — | No Rust change; reasoning recorded at the read sites | type gate | `npx tsc --noEmit -p tsconfig.json` (plus `git diff --stat src-tauri/` empty) | ⬜ pending |
| 38-12 T2 | 12 | 3 | AIO-BUDGET-08 | T-38-32 | Membership (not length) parity across Dexie, TS list and Rust allowlist | unit (source-text) | `npx vitest run tests/db/tableListParity.test.ts` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Task IDs are `plan-task`; wave numbers are read from each plan's frontmatter.*

---

## Wave 0 Requirements

- [ ] Fix `tests/db/tableListParity.test.ts:101` and `tests/db/schemaV22Migration.test.ts:70` (both assert 23, actual `LATEST_SCHEMA_VERSION = 24`) — plan 01 task 1, nothing else can be green until these are.
- [ ] `tests/services/ai/office/aiTeamRepo.test.ts` — 20-way concurrency test and two-table top-up test against a real `TaskPlannerDatabase` (`fake-indexeddb/auto` already loaded at `tests/setup.ts:1`). Plan 03 task 1 and plan 04 task 1.
- [ ] `tests/services/ai/office/budgetGate.test.ts` — percentage/threshold assertions; plan 05 task 2 rewrites it and plan 08 task 2 deletes the gate half.
- [ ] `tests/services/ai/office/tokenEstimate.test.ts` — no usage → estimate; usage present → no estimate; aborted stream → estimate of received text; pre-call measurement visible before dispatch. Plan 07 task 2.
- [ ] `tests/services/ai/office/budgetWarning.test.ts` — new file, plan 08 task 2.
- [ ] `tests/components/ai/office/SettingsSaveBudget.test.tsx` — new file, plan 04 task 3.
- [ ] `tests/helpers/teamRunSnapshot.ts` — new shared helper, plan 05 task 1 (all four `TeamWorkspace*` stubs import it).
- [ ] Install `js-tiktoken@1.0.21` behind plan 10 task 1's `checkpoint:human-verify` (D-07 approves the dep; the install itself is the checkpoint).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| OS notification actually appears on the desktop when a threshold is crossed | AIO-BUDGET-06 | Tauri notification delivery is not exercised under jsdom | Run the app, start a team turn with a tiny budget, confirm exactly one desktop notification per level (member, team) and none repeated across tool rounds or across two teammates |
| Estimation accuracy vs provider count within a sane band | D-07/D-10 | The tokenizer is only valid for the model family it encodes | Run a real turn, compare the `~`-marked pre-call estimate against provider `usage` when it arrives |
| Notification body leaks no prompt text on a real desktop surface | T-38-20 | The test asserts on the payload; the OS renders it | Trigger one warning and read the notification text — numbers and names only |

---

## Validation Sign-Off

- [ ] All 31 tasks (12 plans) have a focused `<automated>` verify or a named Wave 0 dependency
- [ ] No verify filter matches zero titles (every `-t` fragment is a title the plan prescribes)
- [ ] Every row's command run shows passing tests and zero skipped
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter after execution confirms every row

**Approval:** pending
