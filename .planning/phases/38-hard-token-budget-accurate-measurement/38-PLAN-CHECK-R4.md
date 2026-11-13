# Phase 38 — Plan Check Round 4 (narrow re-check)

**Verdict:** ISSUES FOUND — 0 blockers, 1 warning, 3 advisories.
**Reviewed at:** `768fb19f`. **Plans:** 12, 7 waves, 32 tasks.
**Probes:** `/tmp/vp4.json` `not_applicable` (32 commands, severities all `none`); `/tmp/fd4.json` `ok` (32 commands, all `none`).

## Round-3 disposition

| ID | Result | Evidence |
|---|---|---|
| R3-B1 clear path + setter type | **FIXED** | `38-09-PLAN.md:150` clear sets `null`; `:152` `setTeamThresholdPct(thresholdPct ?? undefined)` matches plan 05's `number \| undefined`; `38-04-PLAN.md:140` tests `=== null` before `!== undefined`, forbids `??`; `:133` input `number \| null \| undefined`; `38-09-PLAN.md:154` traversal test asserts value reaching `applyTeamBudgetSettings` is `null` (clear) / `undefined` (untouched) plus key absence |
| R3-B2 required `thresholdPct` prop | **FIXED** | `tests/ai/ActiveAiTurnIndicator.test.tsx` present at `38-09-PLAN.md:17,126,134,159` and `38-VALIDATION.md:43,79`; `:144` `baseProps` +80, label asserted 80 then 65; only other consumer `TeamWorkspace.tsx:1043` is in plan 09 |
| R3-W1 `TeamsView` global source | **FIXED** | `38-09-PLAN.md:140` `useLiveQuery(getGlobalBudgetWarnThresholdPct(db))` + `resolveThresholdPct(team, global)` per card; `TeamCard` constant fallback-only; plan 11 owns reader (`38-11-PLAN.md:81`); plan 09 `depends_on` includes 11 |
| R3-W2 validation drift | **FIXED** | `38-VALIDATION.md:41-43` wave 5/6/7 full unions incl. `tokenEstimate.test.ts` and `ActiveAiTurnIndicator.test.tsx`; `:45` wave-set rule; `:118` 32 tasks; table 32 rows, IDs match frontmatter waves; no TBD; every `-t` fragment matches an authored title |
| I1 wave prose | APPLIED — `38-10-PLAN.md:54`, `38-REVISION-R3.md:90` |
| I2 `39-11` typo | APPLIED — `38-05-PLAN.md:48` |
| I3 duplicate numbering | APPLIED — `38-03-PLAN.md:147-157` numbered 1–9 |
| I4 clamp vs zod | APPLIED — `38-04-PLAN.md:155` two-writer note |

## Regression sweep (clean)

- Same-wave `files_modified` overlap: none. Wave map 1: 01,02 · 2: 03,06,11 · 3: 05,12 · 4: 04 · 5: 07 · 6: 08,10 · 7: 09; every dep wave < own.
- Structure 12/12 exit 0 `valid: true`; frontmatter 12/12 `valid: true, missing: []`; 32/32 tasks carry `read_first`/`action`/`acceptance_criteria`/`automated` + immediately following `fails_when`; 12/12 have `must_haves.artifacts`; 0 fenced code in `<action>`; 0 TBD; 0 full-suite commands.
- New-file paths (`budgetSplit.ts`, `budgetWarnSettings.ts`, `BudgetWarnThresholdCard.tsx`, `teamRunSnapshot.ts`, `SettingsSaveBudget.test.tsx`, `tokenEstimate.*`, `budgetWarning.*`) do not exist yet — correct; every existing path is git-tracked.
- D-01/D-02 warning-only preserved; `awaiting-budget` retained one occurrence per file in `src/types/aiOffice.ts` + `src/validation/backupSchemas.ts`; plan 10 task 1 keeps `checkpoint:human-verify gate="blocking-human"` and `autonomous: false`.
- Measured at HEAD to confirm acceptance baselines: `TeamCard.tsx:129` and `TeamSidebar.tsx:146` each hold exactly one literal `0.8`; `BudgetTopUpModal.tsx:70-71` still `Ngưỡng cảnh báo (80%)` + `BUDGET_PAUSE_THRESHOLD`; `aiOffice.ts:260` still exports the constant.

## Warning (fixed after the check)

### R4-W1 — `applyTeamBudgetSettings` input type described inconsistently between plans
**Required property:** every plan describes the same type for the threshold parameter, and a three-state `number | null | undefined` value passes without a cast.
**Evidence:** `38-09-PLAN.md:151` said `budgetWarnThresholdPct?: number | null`, while `38-04-PLAN.md:133` declares `?: number | null | undefined`. Under `strict` + `exactOptionalPropertyTypes` the shorter type blocks the `undefined` plan 09 forwards — the exact error class R3-B1 closed. Not a blocker because plan 04 is normative and carries its own acceptance (`:216`).
**Fix applied:** `38-09-PLAN.md:151` now reads `number | null | undefined`; `38-09-PLAN.md` acceptance criterion also renamed the drawer-local `thresholdPct` to `input.budgetWarnThresholdPct` and attributed the behaviour to 38-04 T3.

## Advisories

1. **R4-I1** — plan 09 task 2's `handleSaveSettings` criterion referenced a drawer-local variable not in that task's `files`. Applied: criterion now names `input.budgetWarnThresholdPct` and attributes the behaviour to 38-04 T3.
2. **R4-I2** — plan 09 touches 10 files after gaining the test file (7 src + 3 test), at the Dimension-5 warning threshold. `estimate-check --tokens 72000 --calibrated` → 72000/100000, ratio 0.72, `over_budget: false`, `confidence: low`, `sample_count: 0`. Accepted as advisory, consistent with how round 3 recorded plan 06 at 10 files.
3. **R4-I3** — `38-REVISION-R3.md` wave table still listed plan 09 as needing only 04/07/08. Applied: now `needs 04, 05, 07, 08, 11`.

## Recommendation

Zero blockers. The single warning was a one-line type-sync and is fixed. No scope change, no phase split, no dependency beyond `js-tiktoken`.
