# Phase 38 — Revision Round 3

**Trigger:** `38-PLAN-CHECK-R2.md` (8 blockers, 4 warnings, 1 info).
**Base:** `8623b09c` + `178565cf` (round-2 revision), plus the two plan files added while drafting round 3 (`38-11`, `38-12`).
**Scope:** planning artifacts only. No application source was modified.
**Result:** 12 plans, 7 waves, 32 tasks. (Corrected in round 4 — this file previously said 31; the per-task table and the `<task>` count are both 32.) All four round-2 sources (R2-B1..B8, R2-W1..W4, R2-I1) dispositioned below.

---

## Blocker dispositions

### R2-B1 — typed cache usage chain
**Disposition:** FIXED in `38-07` task 1 (unchanged from round 2, now cited alongside the B4 work it shares a task with).
`AiOrchestratorLoopOptions.onUsage` is declared `(usage: ChatTokenUsage) => void`; the four `nineRouterClient` mapping sites emit `cacheReadTokens`/`cacheCreationTokens`; `chatTurnRuntime`'s accumulator sums both; the tracer literal `cacheReadTokens: 50` is type-checked. Acceptance names the file and the `tsc` gate.

### R2-B2 — absent usage callback still charged
**Disposition:** FIXED in `38-07` task 1, extended by task 2.
`beginRequestAccounting(agentId, key, assignmentId?)` runs in `startEmployeeTurn` and `startLeadTurn` before `registry.get(id).start(request)`, so a request lifecycle exists whether or not any callback fires. The terminal seam (`flushAccounting`) estimates the `pending` state from the request the turn actually sent. Test `(AIO-BUDGET-02, D-10)` asserts a never-reporting turn yields `usageEstimated === true` and `inputTokens > 0`.

### R2-B3 — accounting before the terminal attempt patch, all terminal paths
**Disposition:** FIXED in `38-07` tasks 1–3.
`finalizeAttempt` awaits `flushAccounting` as its FIRST statement, before `db.transaction`, so the attempt patch can never snapshot a pre-estimation value. `startLeadTurn` flushes after `start` resolves AND in its `finally` (leader turns never call `finalizeAttempt`). `flushAccounting` returns the flushed triple and `finalizeAttempt` uses that return value rather than re-reading the record. Tests: `(R2-B3, ordering)`, `(D-22, leader)`, `(duplicate guard)`.

### R2-B4 — pre-call tokenizer warning
**Disposition:** FIXED — `38-07` task 2 (new "Pre-call measurement" block) + `38-08` task 1 (warning feed) + `38-10` task 2 (real encoder, no call-site change).
- One helper `payloadText(request)` composes system messages + history + text + serialized tools; it is the SAME text used at dispatch and at the terminal seam, so the provisional and charged numbers measure identical input.
- At dispatch (both turn starters), `acc.provisionalInputTokens = await estimateTokens(payloadText(request))` inside a `try/catch`, added to the live input map. Await is bounded; a throw leaves 0 and the turn dispatches unconditionally — never a decision, never a refusal.
- It is a WARNING input, never a charge: `incrementMemberUsage` is only called at the terminal seam, so the persisted row stays `0/0` while a turn runs. Asserted by `(D-07, not a charge)`.
- Provider usage supersedes it exactly once: `handleUsage` subtracts the provisional value from the live map and zeroes the field before applying the reported delta. Asserted by `(D-07, superseded)`.
- `38-08` consumes it: `evaluateBudgetWarnings()` dispatches at the pre-call boundary as well as in `handleUsage`, so a prompt that already blows the share warns before the model answers. Asserted by `(D-07, pre-call warning)`.
- `38-10` only changes the loader; the measurement site and its callers are untouched, and a coordinator test still shows `provisionalInputTokens > 0` at dispatch.

### R2-B5 — DB writes only at the terminal seam
**Disposition:** FIXED in `38-07` task 1 (as in round 2), now enforced by the B4 tests too.
`handleUsage` mutates live maps and the accounting record only; the `void addUsedTokens(...)` block and the `normalizeUsageTotal` import are deleted. A test reads the member row immediately after `onUsage` fires and asserts it is still `0/0`.

### R2-B6 — notification identity and cleanup scope
**Disposition:** FIXED in `38-08` task 1 (plan rewritten).
- Marker key is `${teamId}:${level}` — the agent id is not part of it. The per-member UI badge (`38-09`) is a separate, independent surface and explicitly NOT the notification key.
- Two different members crossing the member threshold in one run produce ONE member notification. Asserted by a test that counts mocked `sendDesktopNotification` calls per level.
- `resetBudgetWarnings(teamId)` deletes only `${teamId}:`-prefixed keys. It is called from `topUp` and from the start of a new turn.
- `dispose()` calls `resetBudgetWarnings(teamId)`, never `resetAllBudgetWarnings()`. `resetAllBudgetWarnings` exists only as a test seam; a grep gate asserts it has no production caller.
- Cross-team tests: a top-up on team A leaves team B's marker intact; disposing team A leaves team B's marker intact.
- `budgetWarning.test.ts` is a new file covering the dispatcher directly (per-level independence, retry after a failed send, cross-team reset).

### R2-B7 — absent threshold override survives save/reset
**Disposition:** FIXED across `38-05`, `38-04`, `38-09`, `38-11`.
- `38-05` snapshot carries BOTH `budgetWarnThresholdPct` (resolved, always a number) and `budgetWarnThresholdPctOverride?: number | undefined` (absent when the team inherits). `setTeamThresholdPct(pct: number | undefined)` — `undefined` means inherit, and that is the clear path.
- `38-09` drawer state is `useState<number | undefined>(team.budgetWarnThresholdPct)` with NO default fallback in the initializer; the input displays `thresholdPct ?? globalThresholdPct` and labels which one it shows; `data-testid="team-threshold-clear"` sets the state back to `undefined`.
- `38-04` `applyTeamBudgetSettings` takes the three-state input `budgetWarnThresholdPct?: number | null | undefined`: absent/undefined leaves the stored value untouched, `null` deletes the key, a number is clamped and stored. Team rows are written by spreading the existing row and applying only that one key, satisfying `exactOptionalPropertyTypes` by omission.
- `38-11` owns the global setting itself (`ai_budget_warn_threshold_pct`, reader/writer/card), so the "inherit" target exists as a real persisted value.
- Regression tests at three levels: repo (`(D-04, override-untouched)`, `(D-04, override-cleared)`, `(D-04, override-set)`), coordinator (`38-05` task 3: inherit/override/clear/unrelated-save), component (`SettingsSaveBudget` `(D-04, unrelated save)`: absent override + global 65, unrelated 4000→4500 save keeps the key absent).

### R2-B8 — Settings save must not double-increment
**Disposition:** FIXED in `38-04` tasks 2–3 (plan rewritten).
- Two distinct verbs: `applyTopUp(...)` is ADDITIVE (raises member share and team total by the same amount, one `rw` over both tables); `applyTeamBudgetSettings(...)` is ABSOLUTE (sets the team total verbatim, spreads member rows preserving usage fields, ignores unknown member ids).
- `TeamWorkspace.handleSaveSettings` is reduced to ONE repo call plus `coordinator?.applyBudgetSettings(result)`. The `updateTeam(total)` + per-member delta loop is deleted. The coordinator mirror writes nothing to Dexie.
- The offline path uses the identical call: no else-branch, no coordinator required.
- `SettingsSaveBudget.test.tsx` asserts 3000→4000 persists as `4000` both with and without a coordinator, and that exactly one repo budget call happens per save.
- `38-09` task 2 routes the threshold through the same single call (no second repo write).

---

## Warning dispositions

### R2-W1 — missing snapshot mocks
**Disposition:** FIXED structurally.
`38-05` task 1 creates `tests/helpers/teamRunSnapshot.ts` exporting `makeTeamRunSnapshot(overrides)`, and converts all FOUR `TeamWorkspace*` stubs (Steer, WhitespaceSubmit, Receipts, TypingCost) to it in the same task. `38-08` and `38-09` extend the helper rather than four files: `38-08` adds `budgetWarnings` and `memberUsage` (with `provisionalInputTokens`); `38-09` adds nothing new. `EMPTY_SNAPSHOT` in `TeamWorkspace.tsx` is widened alongside. A test named `(B6, scoped reset)` and the four component files are re-run in `38-08`'s verify block, so a missing field is a compile/run failure rather than a runtime `undefined`.

### R2-W2 — scope (plans 05/06/08)
**Disposition:** SPLIT, with the split boundary chosen so every intermediate gate is green.
- Plan 06 (14 files) → `38-06` (10 files: version bump + three record schemas + the nine fixture pins) + `38-12` (4 files: comment-only edits and the membership test). The nine fixture pins MUST stay with the bump — they are red the moment the constant changes — so that changeset stays cohesive; the SQLite/parity work is green either way and moved out. `38-06` carries a scope note stating exactly this.
- Plan 05 (11 files) → `38-05` (9 files) + `38-11` (4 files: the global settings row, reader/writer, Settings card, mount). The card has no dependency on the coordinator wiring, so it is a clean cut with a stable dependency (`38-05` depends on `38-11`).
- Plan 08 (11 files) → reduced to 8 files by deleting work rather than moving it: the banner/UI half moves to `38-09` (which already owns every display surface), and the snapshot widening collapses into the shared helper. `38-08` now touches `budgetGate.ts`, `budgetWarning.ts`, `teamRunCoordinator.ts`, `TeamWorkspace.tsx`, the helper, and three tests.
No item was dropped; every moved item is named in the receiving plan's objective or scope note.

### R2-W3 — validation contract stale
**Disposition:** FIXED — `38-VALIDATION.md` rewritten.
- Every row names a real task (`38-NN Tn`), its plan, its wave (read from frontmatter), its requirement, its threat ref and a focused command.
- `TBD` is gone. The unusable filters (`-t "budget"`, `-t "no usage"`, `-t "threshold"`) are replaced with fragments the plans actually prescribe (`AIO-BUDGET-04`, `AIO-BUDGET-07`, `remainder`, whole-file runs where a rewrite renames titles).
- New evidence rule: a command counts as green only with ≥1 passing test and zero skipped; `0 passed` exits 0 and is now explicitly not evidence. Wave-level sampling commands are listed per wave. Wave 0 list updated to the files this plan set actually creates.
- Manual-only rows kept for Tauri notification delivery and estimation accuracy, plus one new row for the notification body on a real desktop.

### R2-W4 — truth/action numeric mismatch
**Disposition:** FIXED at the contract level in both places.
- `38-03`: `splitEvenly` normalizes ONCE, before dividing — `Math.round(Math.max(0, Number.isFinite(total) ? total : 0))` — so every returned budget is an integer and sums to the normalized total. Truth, action and tests now say the same thing: `1.5` → integers summing to 2, `-5` → zeros, `NaN` → zeros, and `Number.isInteger` holds for every output. The earlier `Math.max(0, total)` + floor combination (which could distribute a fractional total) is gone, and the backstop truth was rewritten to match.
- `38-10`: the Vietnamese truth no longer asserts `> length/4`. It asserts the only honest observables — a positive integer, stable across calls, and different from the chars÷4 value — and states explicitly that no direction is claimed. The action and acceptance criteria say the same.

### R2-I1 — plan 10 wave 7 vs dependency 07 wave 4
**Disposition:** FIXED. Plan 10 is now wave 6, the minimum the dependency graph allows (38-07 is wave 5). Its objective records the reasoning. Nothing else gates it; the version-bump, parity and UI plans do not wait on a tokenizer install. (Corrected in round 4: this paragraph said wave 5 while the frontmatter said 6.)

---

## Wave assignment (recomputed)

| Wave | Plans | Why |
|------|-------|-----|
| 1 | 01, 02 | no dependencies |
| 2 | 03, 06, 11 | depend only on 01 |
| 3 | 05, 12 | 05 needs 01 + 11; 12 needs 06 |
| 4 | 04 | needs 01, 03, 05 |
| 5 | 07 | needs 03, 04, 05 |
| 6 | 08, 10 | 08 needs 05 + 07; 10 needs 07 |
| 7 | 09 | needs 04, 05, 07, 08, 11 |

No same-wave plan pair shares a `files_modified`/`files_deleted` path. Plan 04 moved from wave 3 to wave 4 because it now writes `teamRunCoordinator.ts` and `TeamWorkspace.tsx`, which plan 05 also edits in wave 3.

---

## Verification performed

| Check | Result |
|-------|--------|
| `gsd_run query frontmatter.validate <plan> --schema plan` (×12) | 12/12 `valid: true`, `missing: []` |
| `gsd_run query verify.plan-structure <plan>` (×12) | 12/12 exit 0, `valid: true` |
| Task count | 32 across 12 plans (corrected in round 4; was stated as 31) |
| `gsd_run query check.decision-coverage-plan <phase> <CONTEXT>` | `passed: true`, 25/25 decisions covered |
| Dependency acyclicity / wave monotonicity | verified by hand from frontmatter above |
| Same-wave file overlap | none |
| Warning-only preserved | `awaiting-budget` retained in `src/types/aiOffice.ts` and the backup `phaseAtEnd` enum; `38-06` prohibition forbids deleting it; `38-08` deletes only the producer |
| Tokenizer checkpoint retained | `38-10` task 1 is `checkpoint:human-verify gate="blocking-human"`, `autonomous: false` |
| No new dependency beyond the approved one | `38-10` is the only plan that installs, pinned exact |
| No data-preserving migration (C-16) | `38-06` keeps the v13-rejection behaviour |

**Not proven here (belongs to the checker/executor):** that the named source paths still exist as cited, and that the prescribed test title fragments match what the executor will author. Both were grounded against the tree at `8623b09c` while revising.

---

## Files changed this round

- `38-04-PLAN.md` — absolute settings verb with three-state threshold input; wave 3 → 4; new repo and component tests.
- `38-05-PLAN.md` — (round 2 rewrite retained) wave 3.
- `38-06-PLAN.md` — (round 2 rewrite retained) scope note; SQLite work lives in `38-12`.
- `38-07-PLAN.md` — pre-call measurement block, `provisionalInputTokens` on the accounting record and snapshot, supersede rule, four new tests, verify commands de-filtered; wave 4 → 5.
- `38-08-PLAN.md` — rewritten: `(teamId, level)` marker, team-scoped resets, `budgetWarning.ts`, gate deletion, snapshot widening via the shared helper, pre-call warning feed; wave 6.
- `38-09-PLAN.md` — provisional input in the display math; drawer override state seeded from the stored override with an explicit clear control (three-state `number | null | undefined` after round 4); threshold routed through the single save call; wave 6 → 7.
- `38-10-PLAN.md` — Vietnamese assertion direction removed; wave 7 → 6 with the reasoning recorded; verify commands de-filtered.
- `38-03-PLAN.md` — integer normalization in `splitEvenly`; truth/action/test contract aligned.
- `38-11-PLAN.md` — (new this round) global threshold setting + Settings card.
- `38-12-PLAN.md` — (new this round) SQLite/parity confirmation.
- `38-VALIDATION.md` — rewritten per-task map with the evidence rule.
- `.planning/ROADMAP.md` — Phase 38 plans 10 → 12, wave-grouped list, round-3 change note.

---

## Next

Rerun the plan checker on this revision. No plan is marked Ready before that.

---

# Revision Round 4

**Trigger:** `38-PLAN-CHECK-R3.md` (2 blockers, 2 warnings, 4 info).
**Scope:** planning artifacts only. No application source was modified.
**Result:** 12 plans, 7 waves, 32 tasks. No plan added, removed, split, or re-waved except where R3-W1 required a new dependency edge.

## Dispositions

### R3-B1 — clear-override path unreachable; setter type mismatch — FIXED

Three-state contract carried end to end, one vocabulary per layer:

| Layer | Type | `undefined` | `null` |
|---|---|---|---|
| Drawer state (`TeamSettingsDrawer`) | `number \| null \| undefined` | untouched (seeded from row) | user cleared |
| Drawer `onSave` payload / `handleSaveSettings` input | `number \| null \| undefined` | leave row untouched | delete key |
| `applyTeamBudgetSettings` input (repo, plan 04) | `budgetWarnThresholdPct?: number \| null \| undefined` | leave untouched | `delete row.budgetWarnThresholdPct` |
| `coordinator.setTeamThresholdPct` (plan 05) | `number \| undefined` | inherit global | — |

- `data-testid="team-threshold-clear"` now sets `null`, not `undefined` (`38-09-PLAN.md`). `undefined` survives only as "the user never touched the field", which is what makes the unrelated-save case work.
- `handleSaveSettings` bridges the vocabularies with `coordinator?.setTeamThresholdPct(thresholdPct ?? undefined)` (`38-04-PLAN.md`), so `null` never reaches a `number | undefined` parameter — the `TS2345` under `strict` + `exactOptionalPropertyTypes` is gone by construction, not by cast.
- `applyTeamBudgetSettings`'s input type now spells `| undefined` explicitly, and its branch order is prescribed as `=== null` first, `!== undefined` second — never `??`, which would collapse the clear into the untouched branch.
- The plan-05 pure test stays (it pins the resolution rule) but now carries an explicit scope note saying it cannot prove the drawer→Dexie path; the traversal test moved to `38-09` task 2 as `(D-04, drawer clear)` + `(D-04, drawer untouched)`, asserting the exact value that reaches `applyTeamBudgetSettings` and the key's absence in the re-read row.

### R3-B2 — required `thresholdPct` prop breaks the plan's own `tsc` gate — FIXED

`tests/ai/ActiveAiTurnIndicator.test.tsx` added to `38-09` task 2's `files_modified` and to the plan's `files_modified`. `baseProps` gains `thresholdPct: 80`; the `Ngưỡng cảnh báo (80%)` literal assertion becomes prop-driven (render at 80, `rerender` at 65, assert `(65%)` present and `(80%)` absent). Task 2's automated verify now runs that file, so the `npx tsc --noEmit -p tsconfig.json` gate in the plan's `<verification>` is green at end state.

### R3-W1 — `TeamsView` had no live global threshold source — FIXED

`38-09` task 2 now wires `TeamsView` to `getGlobalBudgetWarnThresholdPct(db)` via `useLiveQuery` and passes `resolveThresholdPct(team, globalThresholdPct)` to every `TeamCard`. `TeamCard`'s `DEFAULT_BUDGET_WARN_THRESHOLD_PCT` remains a prop default for hypothetical callers only — after this task no production caller omits the prop, so a global change reaches the card without a reload. `38-09`'s `depends_on` gained `38-05` (the `resolveThresholdPct` home) and `38-11` (the global reader). Wave stays 7 (05 is wave 3, 11 is wave 2 — both below 7), so waves are unchanged and no same-wave overlap is introduced.

### R3-W2 — validation drift — FIXED

- `38-VALIDATION.md` wave-6 set now includes `tests/services/ai/office/tokenEstimate.test.ts` (required by `38-10` task 2).
- Wave-2 set expanded to the full union of `38-06` task 2's nine-file command plus `38-11` task 1 (`aiTeamRepo`, `officeBackup`, `backupSchemas`, `v2Compatibility`, `validateBackup`, `backupSchemasTimer`, `githubPullRestore`, `tabCheckpointBackup`, `noteAttachments`, `SettingsView`, `budgetWarnSettings`); wave-7 set gained the new `ActiveAiTurnIndicator` file.
- A wave-set rule is now stated in the file: a wave's set is the union of every `<automated>` command in that wave's tasks.
- Sign-off count corrected 31 → 32 (the `<task>` count and the per-task table already agreed at 32; only the prose was wrong). `38-REVISION-R3.md` corrected in three places.

### Info fixes

| ID | Fix |
|---|---|
| I1 | `38-10-PLAN.md` objective now says wave 6 (matching its frontmatter) and names 38-07 wave 5; `38-REVISION-R3.md:90,103` corrected from wave 5 |
| I2 | `38-05-PLAN.md` key link `39-11` → `38-11` |
| I3 | `38-03-PLAN.md` duplicate `7.` in task 3 renumbered 1–9 across the two list runs |
| I4 | `38-04-PLAN.md` `(D-04, override-set)` now states the two-writer difference explicitly: zod rejects `0` at the trust boundary, `applyTeamBudgetSettings` clamps `0` → `1` as a runtime belt; both pinned in their own files; do not align them |

## Verification performed (round 4)

| Check | Result |
|-------|--------|
| `frontmatter.validate --schema plan` (×12) | 12/12 `valid: true` |
| `verify.plan-structure` (×12) | 12/12 exit 0, `valid: true` |
| Task count | 32 (`<task>` count matches the validation table) |
| Wave monotonicity | 01,02=1 · 03,06,11=2 · 05,12=3 · 04=4 · 07=5 · 08,10=6 · 09=7; every `depends_on` wave < own wave |
| Same-wave `files_modified` overlap | none |
| Warning-only preserved (D-01/D-02) | unchanged; no refusal/park path added |
| `awaiting-budget` enum | untouched |
| js-tiktoken checkpoint | `38-10` task 1 still `checkpoint:human-verify gate="blocking-human"`, `autonomous: false` |
| Tauri only / no PWA work | unchanged |

**Not proven here:** the round-3 estimate numbers were not re-run; no plan changed task count, so the advisory budget picture is unchanged.

## Next

Rerun the plan checker on this revision.
