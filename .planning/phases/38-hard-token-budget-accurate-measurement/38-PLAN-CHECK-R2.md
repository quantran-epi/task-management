# Phase 38 — Plan Check Round 2

**Verdict:** ISSUES FOUND — 8 blockers, 4 warnings, 1 info.
**Revision reviewed:** `8623b09c` + `178565cf`.
**Next:** planner revision round 3, push complete revision, rerun checker.
**Delivery:** agent connection dropped at final response; findings below received. No files changed by checker. Checked identical committed tree in isolated worktree; source paths below normalized to repository-relative paths.

## Round-1 disposition

B1–B7 resolved. W1–W7 resolved. W8 partial: two snapshot stubs repaired, two more missing (R2-W1).
- Version sweep covers 9 pinning test files.
- EMPTY_SNAPSHOT widened with required fields.
- Nonmatching topUp filter removed.
- Deferred tokenizer imports compile before install; plan 10 switches to literal imports for bundling after install.
- No-gate assertion moved to plan 08.
- SQLite parity uses membership, not equal lengths.
- Research adopts explicit defaults without claiming cache forwarding measured.
- Summary path corrected; ROADMAP update idempotent; raw threshold contract unambiguous.
- Estimator tests unfiltered; tautological guard removed; shim delegates atomic top-up; grep counts per-file.

## Verified checks

10 plans, 28 tasks. Structure 10/10 exit 0. Dependency graph acyclic, no same-wave file overlap. All AIO-BUDGET-01..09 assigned. No budget refusal/pause/abort introduced; historical awaiting-budget enum retained. Tauri-only; human tokenizer checkpoint retained. Deterministic probes: 28 commands have fails_when, no severity findings; path probe not_applicable is not proof paths exist.

## Blockers

### R2-B1 — typed cache usage chain (38-07 task 1)
**Required property:** Cache fields traverse typed callback chain; accumulator and tracer compile.
**Evidence:** `src/services/ai/aiOrchestratorLoop.ts:62-66`, `AiOrchestratorLoopOptions.onUsage`, declares only promptTokens/completionTokens/totalTokens. Plan 07 requires runtime accesses to cacheReadTokens/cacheCreationTokens and tracer literal cacheReadTokens:50; no plan owns callback type/file. TypeScript rejects fields.
**Nonbinding hint:** use ChatTokenUsage consistently through callback chain.

### R2-B2 — absent usage callback still charged (38-07 task 2)
**Required property:** Request emitting no onUsage callback is estimated and charged.
**Evidence:** needsEstimate set only by handleUsage(empty/zero usage); settle estimates keys in set. A request with no callback never enters set. No start marker task. Cannot satisfy plan's own never-calls-onUsage test.
**Nonbinding hint:** initialize unreported-usage state at request start and choose authoritative source on settle.

### R2-B3 — accounting before terminal attempt patch, all terminal paths (38-07 tasks 2–3)
**Required property:** Accounting completes before attempt usage snapshot; every terminal path flushes and reconciles.
**Evidence:** task 2 schedules async estimate in usageWriteChain from settleAgent. Task 3 snapshots attemptUsage before transaction, awaits chain only after terminal commit. Estimate may not exist in patch. Error path `teamRunCoordinator.ts:1532-1558` finalizes before settle. Leader path `:1644-1665` never calls finalizeAttempt, so reconcile there misses leader-only turns.
**Nonbinding hint:** shared awaitable terminal-accounting seam for leader and employees before terminal patch.

### R2-B4 — pre-call tokenizer warning (38-07 task 2; 38-10 task 2)
**Required property:** D-07 estimates prompt with tokenizer before model call to warn, never block.
**Evidence:** plan 07 calls estimateTokens only at settleAgent; plan 10 changes loader only. No task tokenizes outgoing payload before request or feeds pre-call estimate into warning evaluation.
**Nonbinding hint:** measure actual outgoing payload at request boundary, warn then send regardless.

### R2-B5 — DB writes only at terminal seam (38-07 task 1)
**Required property:** D-22 updates live state during turn, ledger only at turn/attempt end.
**Evidence:** handleUsage immediately appends incrementMemberUsage to running promise chain. Writes happen per report. Awaiting chain in finalize does not defer writes that already ran.
**Nonbinding hint:** accumulate memory delta, atomically flush at terminal seam.

### R2-B6 — notification identity and cleanup scope (38-08 tasks 1–2)
**Required property:** D-06 one OS notification per (team, level) until top-up/new turn; disposing team must not reset others.
**Evidence:** teamId:level:agentId key permits two member-level notifications from two members in same team/run, and tests require it. Dispose calls resetAllBudgetWarnings(), which deletes markers for every team.
**Nonbinding hint:** key teamId/level, cleanup scoped to owning team.

### R2-B7 — absent threshold override survives save/reset (38-05 task 1; 38-09 task 2)
**Required property:** Absent override remains absent, reset inherits global, setter supports clear.
**Evidence:** setTeamThresholdPct(pct:number) cannot accept undefined reset from plan 09. Drawer seeds absent override as default 80 and always saves it. Team inheriting global 65 becomes explicit 80 on unrelated save.
**Nonbinding hint:** separate optional override and resolved effective threshold; explicit clear semantics.

### R2-B8 — Settings-save does not double-increment (38-04 task 1; 38-09 task 2)
**Required property:** Settings-save does not add twice; member/team budget changes one transaction.
**Evidence:** topUp/shim now increase team total. `TeamWorkspace.tsx:685-718` still updateTeam(total), then separately await topUp for positive member deltas. Drawer applyTotal redistributes shares at `TeamSettingsDrawer.tsx:155-158`. Total 3000→4000: update writes 4000, summed positive share deltas 1000 raise total to 5000. No task changes this composition or saves atomically.
**Nonbinding hint:** distinguish absolute settings update from additive top-up; transactional repo operation for absolute budgets.

## Warnings

### R2-W1 — missing snapshot mocks (38-05/08 task 1)
**Required property:** Snapshot mocks supply fields read directly by components.
**Evidence:** `tests/components/ai/office/TeamWorkspaceReceipts.test.tsx:54-63` and `TeamWorkspaceTypingCost.test.tsx:46-55` getState mocks lack threshold/budgetWarnings/memberUsage. Plan 08 accesses snapshot.budgetWarnings.team; subscription replaces EMPTY_SNAPSHOT, causing runtime error.
**Nonbinding hint:** include both mocks and focused component checks in widening plan.

### R2-W2 — scope (38-05/06/08)
**Required property:** File scope stays within stable execution budget.
**Evidence:** files_modified counts 11/14/11 exceed warning threshold 10. Plan 06 task 2 touches 9 version-pinning tests; estimates confidence low, sample_count 0.
**Nonbinding hint:** split mechanical work with valid intermediate gates, or explicitly justify cohesive atomic changeset with concrete task-level bounds. File count itself is not proof of missing behavior.

### R2-W3 — validation contract stale (phase-level)
**Required property:** Validation map has actual task IDs/waves and runnable test selections matching plans.
**Evidence:** `38-VALIDATION.md:39-50` still TBD IDs and budget/no usage/threshold filters. Plan 08 explicitly replaced unusable budget filter with whole focused file. Validation requires all table commands green, permitting skipped-only checks.
**Nonbinding hint:** sync map with final executable plans, demand non-skipped passed-test evidence.

### R2-W4 — truth/action numeric mismatch (38-03 task 2; 38-10 task 2)
**Required property:** Truths/actions/tests prescribe same result.
**Evidence:** plan 03 says fractional total clamped integer, action uses Math.max(0,total), so 1.5 can distribute total 1.5. Plan 10 truth says Vietnamese token count greater than length/4; action forbids that assertion, only requires different from chars-div-4.
**Nonbinding hint:** single numeric contract in truths/actions/tests; do not force unsupported tokenization ordering.

## Info

R2-I1: Plan 10 wave 7 depends only on 38-07 wave 4; minimum wave 5. No conflict/cycle. Document serialization reason or dependency edge.

## Execution constraints unchanged

Warning-only D-01/D-02. No historical data-preserving migration (C-16). No full suite. No extra dependency. js-tiktoken approved but installation checkpoint retained by current plans; final phase cannot claim D-07/D-10/D-12 complete without tokenizer. Checkpoint is execution gate, not permission to silently replace tokenizer with heuristic.
