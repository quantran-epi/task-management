# Phase 38 — Plan Check Round 3

**Verdict:** ISSUES FOUND — 2 blockers, 2 warnings, 4 info (down from 8 blockers in round 2).
**Plans checked:** 12 (`38-01` … `38-12`), 7 waves, 32 tasks. Reviewed at `5285fd66`.
**Probes:** `/tmp/vp3.json` `not_applicable` (32 commands, severities all `none`); `/tmp/fd3.json` `ok` (32 commands, all `none`). No blocker arises from a probe. `not_applicable` = form unhandled, not proof paths exist.

## Round-2 disposition

| ID | Result |
|---|---|
| R2-B1 typed usage chain | FIXED — `onUsage: (usage: ChatTokenUsage) => void`, 4 mapping sites, accumulator sums cache |
| R2-B2 absent callback still charged | FIXED — `beginRequestAccounting` before `registry.start`; `flushAccounting` estimates `pending` |
| R2-B3 accounting before terminal patch | FIXED — `flushAccounting` first in `finalizeAttempt`; `startLeadTurn` flushes in `finally` |
| R2-B4 pre-call tokenizer | FIXED — `payloadText(request)` + `provisionalInputTokens` at both turn starters; warn-only, supersede once |
| R2-B5 DB writes only terminal | FIXED — `void addUsedTokens(...)` removed from `handleUsage` |
| R2-B6 notification identity/cleanup | FIXED — marker `${teamId}:${level}`, `resetBudgetWarnings(teamId)`, `resetAll` test-seam only |
| R2-B7 absent override survives save/reset | **PARTIAL** → R3-B1 |
| R2-B8 settings save double-increment | FIXED — `applyTopUp` (additive) vs `applyTeamBudgetSettings` (absolute), one repo call per save |
| R2-W1 snapshot mocks | FIXED — helper `tests/helpers/teamRunSnapshot.ts`, 4 stubs migrated, no fifth consumer |
| R2-W2 scope 05/06/08 | FIXED — 06→06+12, 05→05+11, 08 down to 8 files; nothing dropped |
| R2-W3 validation contract | **PARTIAL** → R3-W2 |
| R2-W4 numeric mismatch | FIXED — `splitEvenly` normalizes once; plan 10 drops ungrounded `>` claim |
| R2-I1 plan 10 wave | FIXED in frontmatter (`wave: 6`); prose stale → R3-I1 |

## Blockers

### R3-B1 — clear-override path unreachable; setter type mismatch
**Plans:** 38-09 task 2, 38-04 task 3, 38-05 task 1.
**Required property:** deleting an override must be expressible from drawer to Dexie in one call, distinguishing "leave untouched" from "delete", and every value passed to `setTeamThresholdPct` must satisfy `number | undefined`.

**Evidence:**
- `38-09-PLAN.md:140` — `team-threshold-clear` control sets state to `undefined`; `:141` — payload `budgetWarnThresholdPct: thresholdPct` typed `number | undefined`.
- `38-04-PLAN.md:139` — repo semantics: `undefined`/absent = leave untouched, only `null` = delete key.
- `38-04-PLAN.md:190` — claims plan 09 passes `undefined` for untouched and `null` for cleared; plan 09 never produces `null`.
- `38-05-PLAN.md:112` — `setTeamThresholdPct(pct: number | undefined)`; `38-04-PLAN.md:190` passes `number | null | undefined` → `TS2345` under `strict` + `exactOptionalPropertyTypes` (`tsconfig.json:15-16`).
- `38-05-PLAN.md:179` — test `(D-04, B7)` mirrors the setter with a local state machine, never traverses drawer→repo, so it stays green while the real clear is broken.

**Failure scenario:** team overrides 65; user clicks "use global default" → state `undefined` → repo leaves untouched → override 65 survives; after reload the override reappears.

**Non-binding hint:** carry the true three-state type in the payload (`number | null | undefined`) where the clear control emits `null`, then `setTeamThresholdPct(pct ?? undefined)`; or drop the `null` branch entirely.

### R3-B2 — plan 09 makes `thresholdPct` a required prop; an out-of-plan test consumer breaks its own `tsc` gate
**Plan:** 38-09 task 2.
**Required property:** every consumer of a component whose prop becomes required is updated by some plan, and the `tsc` gate the plan declares is green at end state.

**Evidence:**
- `38-09-PLAN.md:135` — "take a `thresholdPct: number` prop", removes `BUDGET_PAUSE_THRESHOLD`; `:219` — gate `npx tsc --noEmit -p tsconfig.json`.
- `tests/ai/ActiveAiTurnIndicator.test.tsx:118-127` — `baseProps` lacks `thresholdPct`; `:128,138,148` render `<BudgetTopUpModal {...baseProps} />` → `TS2741`.
- `:133` — asserts `toContain('Ngưỡng cảnh báo (80%)')`; once the label becomes `Ngưỡng cảnh báo ({thresholdPct}%)`, the string depends on the prop and renders `undefined%` without it.
- `tsconfig.json:22` — `include: ["src", "tests", "vite.config.ts"]`, so the test file is type-checked.
- `grep -l "ActiveAiTurnIndicator" 38-*-PLAN.md 38-VALIDATION.md` → no match; the file is in no plan's `files_modified`.
- Consumers: `src/components/ai/office/BudgetTopUpModal.tsx:3,70-71` (being changed) and `src/components/ai/office/TeamWorkspace.tsx:1043` (covered).

**Non-binding hint:** add `tests/ai/ActiveAiTurnIndicator.test.tsx` to task 2's `files_modified`, update `baseProps`, and assert the label from `thresholdPct`.

## Warnings

### R3-W1 — `TeamsView` has no global-threshold source, so `TeamCard` silently falls back to 80
**Plans:** 38-09 task 2, 38-11.
**Required property:** every threshold-reading surface has a live global source; no surface falls back to the default constant after the user changes the global.

**Evidence:** `38-09-PLAN.md:133` says `TeamsView` passes the resolved value and `TeamCard` defaults to `DEFAULT_BUDGET_WARN_THRESHOLD_PCT`. `38-11-PLAN.md:9-12` only creates `getGlobalBudgetWarnThresholdPct` for Settings; no plan wires it into `TeamsView`. Current `src/views/TeamsView.tsx:161-172` renders `TeamCard` with `team`/`usedTokens` only. With global 65 and no team override, the card colours by 80 — diverging from badge/sidebar, which `38-09-PLAN.md:49` forbids.

**Non-binding hint:** have `TeamsView` read the global via `useLiveQuery`/`getGlobalBudgetWarnThresholdPct` and pass it down; or remove TeamCard's default and make the prop required.

### R3-W2 — `38-VALIDATION.md` still drifts: wave-6 sampling misses a file, sign-off miscounts tasks
**Plan:** phase-level (`38-VALIDATION.md`), plans 08/10.
**Required property:** each wave's sampling set is the full union of that wave's commands, and sign-off counts the tasks the per-task table lists.

**Evidence:** `38-VALIDATION.md:42` — wave-6 union is `teamRunCoordinator.test.ts budgetWarning.test.ts budgetGate.test.ts`, missing `tests/services/ai/office/tokenEstimate.test.ts`, which `38-10-PLAN.md:132` (wave 6) requires. `38-VALIDATION.md:116` says "All 31 tasks (12 plans)"; actual `<task>` count is 32 (01:3, 02:2, 03:3, 04:3, 05:3, 06:3, 07:3, 08:3, 09:3, 10:2, 11:2, 12:2), and the per-task table has 32 rows. `38-REVISION-R3.md:6,116` repeats 31.

## Info

1. **Plan 10 prose wave stale.** `38-10-PLAN.md:5` = `wave: 6`; `:54` still says "this plan sits in wave 5". `38-REVISION-R3.md:90,103` also says wave 5.
2. **Cross-plan typo.** `38-05-PLAN.md:48` — "`getGlobalBudgetWarnThresholdPct` comes from `39-11`"; no plan 39; it is 38-11.
3. **Duplicate list numbering.** `38-03-PLAN.md:153` and `:156` both number "7." in one list. Cosmetic.
4. **Clamp vs zod bound.** `38-01-PLAN.md:33,161` — zod `z.number().int().min(1).max(100)` rejects `0`; `38-04-PLAN.md:152` — `(D-04, override-set)` expects `budgetWarnThresholdPct: 0` to persist as `1` via clamp. Two writers react differently to the same input. Acceptable as a runtime belt, but plan 04 should state it.

**Estimate note (not an issue):** `estimate-check --calibrated` gives 70k/84k/62k against 100000, `over_budget: false`, max ratio 0.84; `confidence: low`, `sample_count: 0` — read as "not yet trustworthy", not "settled". Plan 06 has 10 files (warning threshold); the rest 2–9.

## Recommendation

2 blockers + 2 warnings need revision before execution. Both blockers sit in plans 09/04 (waves 4 and 7) — a wording fix plus one added test file in `files_modified` suffices. No phase split, no full suite, no old-data migration, no dependency beyond `js-tiktoken`.
