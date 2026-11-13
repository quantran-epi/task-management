---
phase: 38-hard-token-budget-accurate-measurement
verified: 2026-11-13T17:26:00Z
status: human_needed
score: 15/15 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 13/15
  gaps_closed:
    - "Changing the global warning threshold in Settings reaches every surface without a reload — the workspace badge, the sidebar percentage, the top-up preview and the coordinator's OS-notification threshold all use the new value."
    - "Requirement traceability: every AIO-BUDGET ID claimed by a plan is marked complete in REQUIREMENTS.md."
  gaps_remaining: []
  regressions: []
deferred: []
human_verification:
  - test: "In the Tauri app, open a team, let a member cross its share, and confirm exactly one OS notification arrives for the member level and one for the group level, and that a second tool round does not re-notify."
    expected: "One notification per level per run; the run keeps going; no pause, no refusal."
    why_human: "OS notification delivery and dedupe across real tool rounds cannot be observed in jsdom (the channel is a Tauri/browser API that tests stub)."
---

# Phase 38: Hard token budget + accurate measurement — Verification Report

**Phase Goal:** The budget is genuinely hard, input and output are both charged on every request, and the numbers the user sees are correct.

**Overridden intent (explicit):** The literal goal wording "genuinely hard" is superseded by locked decisions **D-01/D-02** in `38-CONTEXT.md`, which `REQUIREMENTS.md` (AIO-BUDGET-01, AIO-BUDGET-09) and `ROADMAP.md` criteria 1 and 6 record with struck-through originals plus "Superseded by 38 D-01/D-02" notes. This verification is against the **overridden** intent: a turn whose prompt already exceeds the remaining budget **still runs**; crossing the threshold **warns** in-app plus one OS notification per level and is **never refused or parked**. No blocking gate is expected, and its absence is not a gap.

**Verified:** 2026-11-13T17:26:00Z
**Status:** human_needed — every automated must-have verifies; one OS-notification smoke test can only be done in the Tauri runtime
**Re-verification:** Yes — after gap closure (`98cc669c`, `2db380f4`)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A turn whose prompt already exceeds the remaining budget still runs; nothing refuses or parks a model call for budget reasons | ✓ VERIFIED | `beforeToolRoundFor` drains the inbox and honours abort only — no gate, no wait. `grep` finds no `createBudgetGate`/`BudgetGate`/`shouldNotifyPause`/`normalizeUsageTotal`/`bucketOf` in `src/`. No production producer of `awaiting-budget` (only the `TeamRunPhase` union member, a UI label, and the backup enum, all retained deliberately). Tests `(AIO-BUDGET-01, D-01)` and `(AIO-BUDGET-09, D-02)` pass. |
| 2 | Crossing the threshold warns in-app and sends one OS notification per level, never pausing | ✓ VERIFIED | `budgetWarning.ts` keys markers by `${teamId}:${level}`, adds the marker before the await, clears it on failure; `evaluateBudgetWarnings` evaluates member then team independently. `sendDesktopNotification` is the single channel. 10 tests in `budgetWarning.test.ts` pass (dedupe, independence, team-scoped reset, body carries numbers/names only). |
| 3 | A response with no usage still increments the ledger under a stated policy (never free) | ✓ VERIFIED | `flushAccounting` estimates from the sent payload and received text when `acc.source === 'pending'`, sets `usageEstimated`, and charges even at 0/0 when estimated. Policy is written in `budgetGate.ts` header (rules 1-8). Test `charges a callback-less turn as an estimate, marked estimated (D-10)` passes. |
| 4 | A retry charges both attempts, each on its own attempt row | ✓ VERIFIED | `finalizeAttempt` stamps `flushed.inputTokens/outputTokens/usageEstimated` on the attempt row. Test `gives each attempt of a retry its own usage row and charges each once (AIO-BUDGET-03, D-11)` asserts attempt 1 = 300/50, attempt 2 = 200/20, member = 500/70. Passes. |
| 5 | 20 concurrent increments sum correctly with no lost update | ✓ VERIFIED | `incrementMemberUsage` (`aiTeamRepo.ts:691-716`) does read-modify-write inside `db.transaction('rw', db.aiTeamMembers, …)`. Tests `sums 20 concurrent increments on one member row` (start+200, 140/60) and the two-row variant pass against real Dexie. |
| 6 | Starting a group splits the budget evenly with a deterministic remainder | ✓ VERIFIED | `splitEvenly` (`budgetSplit.ts`) is the single home: normalize once, floor per row, remainder on the `role === 'lead'` row. `writeEvenSplit` and `TeamSettingsDrawer.evenSplitRows` both import it. Tests cover lead-alone, empty roster, remainder mid-array, NaN/negative/fractional totals. |
| 7 | The threshold is configurable: global default in Settings plus an optional per-team override with a real three-state clear | ✓ VERIFIED | `budgetWarnSettings.ts` reads/writes `ai_budget_warn_threshold_pct` with an 80 fallback; `BudgetWarnThresholdCard` is mounted in the Settings AI tab. `applyTeamBudgetSettings` tests `=== null` (delete) before `!== undefined` (store). `resolveThresholdPct` clamps into 1..100. Tests pass. |
| 8 | Member-level and group-level badges are independent | ✓ VERIFIED | `TeamSidebar` computes `memberAtThreshold` and `teamAtThreshold` from separate numbers and renders `budget-badge-member` / `budget-badge-team`. Test `keeps the member and group badges independent (D-03/D-06)` passes. |
| 9 | Changing the global threshold in Settings reaches every surface without a reload | ✓ VERIFIED | **Fixed by `98cc669c`.** `TeamRunCoordinator.setGlobalThresholdPct` (`teamRunCoordinator.ts:299` interface, `:3406-3411` impl, `:3671` exported) re-runs `recomputeThresholdPct()` and `notify()`. `TeamWorkspace.tsx:396-401` pushes the live `globalThresholdPct` from `useLiveQuery` (`:193`) into the coordinator on every change; the notify drives `subscribe` → `setSnapshot` (`:379-383`), so the sidebar (`:793`) and top-up modal (`:1038`) read a freshly resolved `snapshot.budgetWarnThresholdPct`. `TeamsView` already resolved per card from its own live query. Test `(D-04) a live global threshold change re-resolves the effective value` asserts 80 → 50 → override 65 wins → clear falls back to the CURRENT global 30. Passes. |
| 10 | The coordinator re-resolves the effective threshold from a live global, not a construction-time snapshot | ✓ VERIFIED | Same fix. `recomputeThresholdPct` (`:631-643`) now also DROPS a cleared override from `liveTeam` (IN-05), so the batch snapshot cannot carry a stale percentage. The construction-time read (`:686-694`) remains only as the initial value; the workspace push supersedes it. |
| 11 | Topping up one agent raises that agent's share and the group total in one transaction | ✓ VERIFIED | `applyTopUp` (`aiTeamRepo.ts:524-572`) runs one `rw` over `[aiTeams, aiTeamMembers]`, reads the roster fresh inside it (WR-13/D-18), and raises both. Tests `raises the member share and the group total together (AIO-BUDGET-07, D-17)` and the coordinator variant pass; a refused top-up writes nothing. |
| 12 | An absolute settings save cannot double-increment (3000→4000 stays 4000) | ✓ VERIFIED | `applyTeamBudgetSettings` sets the team total and member budgets verbatim in one `rw`, preserving usage columns. `handleSaveSettings` makes exactly one repo call. Tests in `SettingsSaveBudget.test.tsx` and `aiTeamRepo.test.ts` pass. |
| 13 | The display shows granted, used and remaining per group and per member, with input and output separate, and estimated values marked `~` | ✓ VERIFIED | `TeamSidebar` renders `đã dùng {used} ({in} vào / {out} ra) · còn {remaining}/{granted}` per member and `{used} / {granted} token · {pct}%` plus a split line for the group, all through `toLocaleString()`; estimates carry `~` plus `title`/`aria-label="ước lượng"`. Tests `shows one turn split as granted/used/remaining…` and `marks an estimated usage with a tilde…` pass. No budget number renders in a chat bubble. |
| 14 | Backup envelope stays v13, the new optional columns round-trip, and restore does not destroy the team log | ✓ VERIFIED | `BACKUP_SCHEMA_VERSION = 13`; the phase-38 columns are `.optional()`. `captureSnapshot` emits `teamMessages`/`teamReadCursors` (CR-02); the log clear is gated on the payload carrying it (CR-03); `teamParticipants` is in `RESTORE_TABLES` and cleared with the log (WR-15). `restoreBackup`, `validateBackup`, `officeBackup`, `tableListParity` suites pass (67 tests). |
| 15 | The code-review fixes (CR-01, CR-04, CR-05, WR-02, WR-06) actually landed | ✓ VERIFIED | CR-01: version 13. CR-04: `TeamWorkspace.tsx:716` mirrors `result.team.budgetWarnThresholdPct`; test asserts 65 and never `undefined`. CR-05: `writeLeadRow` (`aiTeamRepo.ts:249-280`) promotes the incoming row in place and demotes a usage-carrying outgoing lead. WR-02: `mapUsage` subtracts `cached_tokens` for the OpenAI shape. WR-06: `flushAccounting` returns zeros and leaves the key unflushed when the roster row is missing. |

**Score:** 15/15 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/services/ai/office/budgetGate.ts` | threshold math, split usage | ✓ VERIFIED | `splitUsage`, `resolveThresholdPct`, `isAtThreshold`, `nextThresholdOverride`; production importer `teamRunCoordinator.ts`; 14 tests pass |
| `src/services/ai/office/budgetSplit.ts` | single even-split home | ✓ VERIFIED | imported by `aiTeamRepo.ts` and `TeamSettingsDrawer.tsx` |
| `src/services/ai/office/budgetWarning.ts` | team+level dedupe, OS notify | ✓ VERIFIED | production importer `teamRunCoordinator.ts`; 10 tests pass |
| `src/services/ai/office/tokenEstimate.ts` | BPE + chars÷4 fallback | ✓ VERIFIED | lazy `js-tiktoken/lite` + `o200k_base`; WR-14 retry with `'all'` present |
| `src/services/ai/budgetWarnSettings.ts` | global setting read/write | ✓ VERIFIED | 80 fallback, clamp before write |
| `src/components/settings/BudgetWarnThresholdCard.tsx` | Settings card | ✓ VERIFIED | mounted in the Settings AI tab; load/save rejection handlers present (WR-12) |
| `src/db/repositories/aiTeamRepo.ts` | atomic increment, additive/absolute writers | ✓ VERIFIED | `incrementMemberUsage`, `applyTopUp`, `applyTeamBudgetSettings`, `nonNegativeInt` |
| `src/components/ai/office/TeamSidebar.tsx` | split display, badges, `~` | ✓ VERIFIED | charged-only team aggregate (WR-04), `> 0` output idiom (WR-03) |
| `src/services/ai/office/teamRunCoordinator.ts` | live global threshold setter | ✓ VERIFIED | `setGlobalThresholdPct` in the interface (`:299`), implemented (`:3406-3411`), returned (`:3671`); `recomputeThresholdPct` drops a cleared override (IN-05) |
| `src/components/ai/office/TeamWorkspace.tsx` | push live global into the coordinator | ✓ VERIFIED | effect at `:396-401`, deps `[coordinator, globalThresholdPct]`; no loop (the setter early-returns on an equal value) |
| `src/validation/backupSchemas.ts` | v13 + optional columns | ✓ VERIFIED | `budgetWarnThresholdPct`, split usage, cache fields in both sub-schemas (WR-10) |
| `package.json` / `package-lock.json` | `js-tiktoken@1.0.21` pinned | ✓ VERIFIED | exact pin in both files |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `chatTurnRuntime.onUsage` | coordinator `handleUsage` | typed `(usage: ChatTokenUsage) => void` | ✓ WIRED | cache fields accumulate in all three loop branches and survive the runtime overwrite (WR-09) |
| `handleUsage` | `incrementMemberUsage` | terminal flush only | ✓ WIRED | memory-only during the turn (D-22); test proves the row stays 0/0 mid-turn |
| `finalizeAttempt` | attempt row usage | `transitionAssignment` patch | ✓ WIRED | flush awaited before the `rw` (Dexie cannot nest) |
| `applyTopUp` / `applyTeamBudgetSettings` | coordinator live maps | `mirrorBudgetResult` | ✓ WIRED | coordinator mirrors, never re-derives |
| `evaluateBudgetWarnings` | `sendDesktopNotification` | `dispatchBudgetWarning` | ✓ WIRED | marker before await |
| `getGlobalBudgetWarnThresholdPct` | coordinator warning math | construction read + `setGlobalThresholdPct` push | ✓ WIRED (live) | **closed** — `TeamWorkspace.tsx:398-401` pushes every live change; `recomputeThresholdPct` re-resolves |
| `getGlobalBudgetWarnThresholdPct` | `TeamsView` card list | `useLiveQuery` + `resolveThresholdPct` per card | ✓ WIRED | live |
| `getGlobalBudgetWarnThresholdPct` | `TeamWorkspace` sidebar/badges/top-up | `snapshot.budgetWarnThresholdPct` | ✓ WIRED (live) | **closed** — the snapshot is now refreshed by the push, not a construction-time cache |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `TeamSidebar` member rows | `member.inputTokens/outputTokens` + `liveUsage` | `listTeamMembers` live query + coordinator snapshot | Yes | ✓ FLOWING |
| `TeamSidebar` team panel | `teamUsedIn/teamUsedOut` | summed member rows / live map | Yes | ✓ FLOWING |
| `TeamSidebar` threshold | `snapshot.budgetWarnThresholdPct` | coordinator resolved value, refreshed by the live-global push | Yes | ✓ FLOWING |
| `BudgetTopUpModal` preview | `snapshot.budgetWarnThresholdPct` | same refreshed value | Yes | ✓ FLOWING |
| `TeamCard` (list) | `resolveThresholdPct(team, globalThresholdPct)` | `useLiveQuery` on settings | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Live global threshold re-resolves (the gap-1 fix) | `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts -t "D-04"` | 11 pass, 143 skipped | ✓ PASS |
| Coordinator budget subset | `npx vitest run …/teamRunCoordinator.test.ts -t "AIO-BUDGET"` | 29 pass, 125 skipped | ✓ PASS |
| Coordinator full file (regression) | `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts` | 154 pass | ✓ PASS |
| Repo/gate/warning/estimator/settings | `npx vitest run tests/services/ai/office/{aiTeamRepo,budgetGate,budgetWarning,tokenEstimate}.test.ts tests/services/ai/budgetWarnSettings.test.ts` | 5 files, 102 pass | ✓ PASS |
| Workspace component tests (the five stubs that gained the new method) | `npx vitest run tests/components/ai/office/{SettingsSaveBudget,TeamWorkspaceReceipts,TeamWorkspaceSteer,TeamWorkspaceTypingCost,TeamWorkspaceWhitespaceSubmit}.test.tsx` | 5 files, 44 pass | ✓ PASS |
| Other workspace-mounting tests | `npx vitest run tests/components/ai/office/{AiOfficeExplorerTeardown,TeamChatIndicator}.test.tsx tests/services/ai/office/disposeMidRunDelete.test.ts` | 3 files, 27 pass | ✓ PASS |
| UI surfaces | `npx vitest run tests/views/TeamsView.test.tsx tests/ai/office/AgentOfficeComponents.test.tsx tests/components/settings/BudgetWarnThresholdCard.test.tsx` | 3 files, 50 pass | ✓ PASS |
| Backup + parity | `npx vitest run tests/services/backup/{restoreBackup,validateBackup,officeBackup}.test.ts tests/db/tableListParity.test.ts` | 4 files, 67 pass | ✓ PASS |
| Usage chain + migration + schemas | `npx vitest run tests/ai/nineRouterClient.test.ts tests/ai/chatTurnRuntime.test.ts tests/services/ai/aiOrchestratorLoop.test.ts tests/db/schemaV22Migration.test.ts tests/ai/ActiveAiTurnIndicator.test.tsx tests/validation/backupSchemas.test.ts tests/services/backup/v2Compatibility.test.ts` | 7 files, 160 pass | ✓ PASS |
| Typecheck | `npx tsc --noEmit` | exit 0, no output | ✓ PASS |
| Architecture gate | `bash .planning/scripts/verify-team-chat-architecture.sh` | exit 0, dead-module check passes | ✓ PASS |

Step 7b: full Vitest suite deliberately not run (project rule: over an hour); scoped paths only.

### Probe Execution

Step 7c: SKIPPED — no phase-declared probes and no `scripts/*/tests/probe-*.sh` in the repo.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| AIO-BUDGET-01 | 38-02, 38-08 | Overridden: budget never blocks; over-budget turn runs and warns | ✓ SATISFIED | no gate in `beforeToolRoundFor`; no `awaiting-budget` producer; over-budget tests pass |
| AIO-BUDGET-02 | 38-06, 38-07, 38-10 | Input and output both charged; no-usage response still charged | ✓ SATISFIED | `splitUsage` + terminal estimate; tests pass |
| AIO-BUDGET-03 | 38-07 | Retries charged per attempt | ✓ SATISFIED | attempt rows stamped; retry test passes |
| AIO-BUDGET-04 | 38-03 | 20 concurrent increments atomic | ✓ SATISFIED | `rw` transaction; tests pass |
| AIO-BUDGET-05 | 38-03, 38-04 | Even split, deterministic remainder | ✓ SATISFIED | `splitEvenly`; tests pass |
| AIO-BUDGET-06 | 38-01, 38-05, 38-08, 38-11 | Configurable threshold warning | ✓ SATISFIED | **closed** — a global change now reaches a live coordinator (`setGlobalThresholdPct` + workspace effect, D-04 test passes) |
| AIO-BUDGET-07 | 38-04 | Agent top-up raises share and group total in one transaction | ✓ SATISFIED | `applyTopUp` + passing tests; checkbox at `REQUIREMENTS.md:71` is now `- [x]` (commit `2db380f4`) |
| AIO-BUDGET-08 | 38-01, 38-06, 38-09, 38-12 | Display granted/used/remaining per group and member, input/output separate | ✓ SATISFIED | sidebar + tests pass |
| AIO-BUDGET-09 | 38-02, 38-08 | Overridden: no pause, warns and continues | ✓ SATISFIED | no pause path; warning tests pass |

No orphaned requirements: every AIO-BUDGET ID in the phase's ROADMAP list is claimed by at least one plan, and all nine are now checked in `REQUIREMENTS.md`.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/services/ai/office/teamRunCoordinator.ts` | 3637-3641 | `TeamRunSnapshot.budgetWarnings` has no production reader (IN-01) | ℹ️ Info | known debt, out of scope |
| `src/components/ai/office/TeamActivityIndicator.tsx` | 20 | `awaiting-budget` label still rendered (IN-02) | ℹ️ Info | unreachable, out of scope |
| `src/services/ai/office/scheduler.ts` | 9 | comment points at the deleted parking gate (IN-03) | ℹ️ Info | known debt, out of scope |
| `src/services/ai/office/budgetWarning.ts` | 45 | `resetAllBudgetWarnings` is a test-only export (IN-04) | ℹ️ Info | out of scope |
| `src/services/ai/office/teamRunCoordinator.ts` | 3569-3571 | `topUp` comment claims a `disposed` guard that does not exist (IN-06) | ℹ️ Info | out of scope |
| `src/db/repositories/aiTeamRepo.ts` | 395 | `activateTeam` comment claims a racing-count guard never written (IN-07) | ℹ️ Info | out of scope |
| `src/services/localSqlitePersistence.ts` | 189 | every usage increment marks the DB dirty for auto-sync (IN-08) | ℹ️ Info | out of scope |
| `src/services/ai/office/teamRunCoordinator.ts` | 287, 3388, 3669 | `setTeamBudget` exported and never called (IN-09) | ℹ️ Info | out of scope |

No `TBD`/`FIXME`/`XXX` markers in any file touched by this phase or by the two fix commits. No debt-marker blocker.

**IN-05 is now resolved**, not carried: `recomputeThresholdPct` (`teamRunCoordinator.ts:636-642`) deletes a cleared override from `liveTeam` instead of leaving it to travel with the batch snapshot.

### Known Debt (deliberately out of scope)

The nine Info findings from `38-REVIEW.md` were excluded from the fix round by decision. Eight remain (IN-01, IN-02, IN-03, IN-04, IN-06, IN-07, IN-08, IN-09) and are recorded above; IN-05 was fixed as a side effect of the gap-1 fix. None of them fails the phase.

One additional test-coverage gap, recorded as debt rather than a failure: the live-global push is proven at the coordinator seam (`(D-04) a live global threshold change re-resolves the effective value`) and by code reading of the four-line `TeamWorkspace` effect, but there is no component-level regression test that writes `ai_budget_warn_threshold_pct`, keeps `TeamWorkspace` mounted, and asserts the sidebar percentage follows. The wiring is verified; the guard against a future regression is missing.

### Human Verification Required

1. **OS notification dedupe across real tool rounds (Tauri runtime)**
   **Test:** Open a team, let a member cross its share, and let several tool rounds run.
   **Expected:** Exactly one member-level and one group-level OS notification; the run continues; no pause; a second tool round does not re-notify.
   **Why human:** the channel is a Tauri/browser API that tests stub (`sendDesktopNotification` is mocked in `budgetWarning.test.ts`).

### Gaps Summary

Both gaps from the previous verification are closed, verified in code and by test, not by trusting the fix description.

Gap 1 (stale global threshold): `setGlobalThresholdPct` now exists on the coordinator interface, implementation and returned object; `TeamWorkspace` pushes the live `useLiveQuery` value into it on every change; the resulting `notify()` refreshes the snapshot that the sidebar, badges and top-up modal read. The D-04 test proves the effective value follows the global, that an override still wins, and that clearing the override falls back to the *current* global rather than the construction-time one. `recomputeThresholdPct` also drops a cleared override from `liveTeam`, which closes IN-05.

Gap 2 (bookkeeping): `REQUIREMENTS.md:71` now reads `- [x] **AIO-BUDGET-07**`.

No regressions: 154 coordinator tests, 102 repo/gate/warning/estimator/settings tests, 44 workspace component tests, 27 other workspace tests, 50 UI-surface tests, 67 backup tests, 160 usage-chain/migration tests, `tsc --noEmit` exit 0 and the team-chat architecture gate exit 0.

The measurement half of the phase was already solid and remains so: usage is split into input and output on every request, cache tokens are charged as input, a response with no usage is estimated and marked, retries charge both attempts, increments are atomic, the even split has one home, top-ups and settings saves are single two-table transactions, the display separates input/output with a `~` estimate marker, and the backup envelope stays at v13 with the new optional columns intact. The warning-only override (D-01/D-02) is implemented: no gate, no pause, no refusal, one OS notification per team per level.

The only thing not machine-verifiable is OS notification delivery in the real Tauri runtime, which is why the status is `human_needed` rather than `passed`.

---

_Verified: 2026-11-13T17:26:00Z_
_Verifier: Claude (gsd-verifier)_
