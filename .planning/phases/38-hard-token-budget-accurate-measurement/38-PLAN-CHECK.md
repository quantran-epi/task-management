# Phase 38 — Plan Check Findings (Round 1)

**Checked:** 10 plans, 6 waves (planner reported 7 waves)
**Verdict:** `## ISSUES FOUND` — 7 blockers, 8 warnings, 3 advisories
**Checked at commit:** `fe1c42ca` (plans) + `2f9afe97` (research/patterns/validation)

---

## Coverage Summary

| Requirement | Plans | Status |
|---|---|---|
| AIO-BUDGET-01 | 02, 08 | Covered (per D-01 override) |
| AIO-BUDGET-02 | 06, 07, 10 | Covered |
| AIO-BUDGET-03 | 07 | Covered |
| AIO-BUDGET-04 | 03 | Covered |
| AIO-BUDGET-05 | 03, 04 | Covered |
| AIO-BUDGET-06 | 01, 05, 08 | Covered |
| AIO-BUDGET-07 | 04 | Covered |
| AIO-BUDGET-08 | 01, 06, 09 | Covered |
| AIO-BUDGET-09 | 02, 08 | Covered (per D-01 override) |

**Confirmed green:** all 10 structure checks pass (`verify.plan-structure` exit 0); dependency graph acyclic; D-01 honored (no plan reintroduces a pre-call refusal; plan 08 deletes `createBudgetGate` and keeps `budgetGate.ts` alive as threshold math with `teamRunCoordinator.ts` as production importer); `'awaiting-budget'` preserved in `src/types/aiOffice.ts:37` and `src/validation/backupSchemas.ts:724`; no scope-reduction language.

---

## Blockers

### B1 — plan 06: envelope-version bump misses seven literal-`13` tests
Plan 06 bumps `BACKUP_SCHEMA_VERSION` 13→14 and updates only `tests/validation/backupSchemas.test.ts` + `tests/services/backup/officeBackup.test.ts`. Seven other files still pin literal `13`:

- `tests/services/backup/v2Compatibility.test.ts:24-25` (asserts `CURRENT_SCHEMA_VERSION === 13` — outright red, nothing in the phase fixes it)
- `tests/noteAttachments.test.ts:135`
- `tests/services/backup/validateBackup.test.ts:90`
- `tests/validation/backupSchemasTimer.test.ts:69`
- `tests/services/github/githubPullRestore.test.ts:36`
- `tests/backup/tabCheckpointBackup.test.ts:78`
- `tests/views/SettingsView.test.tsx:112`

Plan 06's must_have "version literals live in one place" is false; its `<verification>` list never runs them.

### B2 — plans 05 / 08 / 09: `tsc --noEmit` gate cannot pass at plan completion
Plan 05 adds required `TeamRunSnapshot.budgetWarnThresholdPct` but omits `src/components/ai/office/TeamWorkspace.tsx`, whose typed literal `EMPTY_SNAPSHOT` (`:77-86`) then fails under `strict` + `exactOptionalPropertyTypes`. Plan 05 task 3's verify IS `npx tsc --noEmit`. Plans 08 and 09 add two more required fields (`budgetWarnings`, `memberUsage`) to the same interface and also miss the literal.

### B3 — plan 04 task 3: `-t "topUp"` matches zero tests, so the gate is vacuous
Current file has zero titles containing `topUp` (`grep -cE "(it|describe)\([^)]*topUp" = 0`); the plan's own tests are titled `(AIO-BUDGET-07)`, `(WR-13, D-18)`, `(AIO-BUDGET-07, D-19)`. Measured vitest on a non-matching `-t`: exit **0**, `Tests 12 skipped (12)` — `0 passed` never appears, so `fails_when` cannot fire. Green with nothing run.

### B4 — plan 07 task 2: lazy tokenizer import precedes its install by three waves
`tokenEstimate.ts` writes `await import('js-tiktoken/lite')` in wave 4; the package installs in plan 10 (wave 7). Reproduced on this tree: `npx tsc --noEmit` emits `error TS2307: Cannot find module 'js-tiktoken/lite'` — `try/catch` does not suppress module resolution. Plan 07 `<verification>`, plan 08 `<verification>`, and plan 09 task 2 acceptance all require tsc clean.

### B5 — plan 05: must-have truth 9 is unachievable at this plan's own commit
Truth 9 claims "no `beforeToolRoundFor` or other coordinator path refuses a model call for budget reasons after this plan". Plan 05 explicitly retains all four legacy symbols ("keep the existing four … untouched for now — plan 08 removes the gate itself"): `bucketOf` ×4, `shouldNotifyPause` ×4, `normalizeUsageTotal` ×2 call sites, plus `gateFor(...).wait` in `beforeToolRoundFor`. Task 2's acceptance even requires all 10 `createBudgetGate` tests to survive.

### B6 — plan 06 task 3: equal-length parity test is red on creation
New `(D-23)` parity test asserts the three lists have the same length. Measured at HEAD: Dexie declared tables **35**, `SQLITE_DOMAIN_TABLES` **24** (+3 local = 27), Rust `ALLOWED_TABLES` **27**. Eleven Dexie-only tables (`documentSets`, `publishedDocuments`, `publishAttempts`, `dlpAudits`, `knowledgeLinks`, `telegramSettings`, `telegramWhitelist`, `telegramSessionLogs`, `settings`, `backupMetadata`, `activeTimers`) are absent from both mirrors today. Not fixable within the plan's authorized scope.

### B7 — `38-RESEARCH.md:551` — `## Open Questions` undispositioned
Section has no `(RESOLVED)` suffix and three questions, none marked resolved. Q1 ("Does 9router expose cache token counts?", Assumption A1) is load-bearing for plan 07's must_have "Cache tokens reported by the provider are charged as input". Plan 07 carries a defaulting fallback so the phase goal survives, but the question is undispositioned.

---

## Warnings

| # | Plan | Property | Detail |
|---|---|---|---|
| W1 | 07 | Plan writes its own SUMMARY | `<output>` says `38-06-SUMMARY.md` — plan 06's path. Executing plan 07 overwrites the summary plans 08 and 09 read as context. |
| W2 | 02 | Premises match tree at plan start | `ROADMAP.md` at HEAD already carries warning-only wording for criteria 1 & 6 (`grep 'is refused, not run'` = 0, `grep 'pauses visibly between tool rounds'` = 0, `grep -c 'overrides the original wording'` = 2). Task 2 targets text that no longer exists. Only REQUIREMENTS.md (task 1) still needed. |
| W3 | 05 | Crossing contract stated once | Task 2 says `isAtThreshold(1, 3, 33)` is `false`, then reverses to TRUE in the same sentence (`3 × 33 / 100 = 0.99`, so `1 >= 0.99` is TRUE). Executor can write either. Raw-comparison contract itself is consistent elsewhere (plan 09 colours on `used >= granted*pct/100`, displays `Math.round`). |
| W4 | 07 | `-t` exercises the named file | `-t "D-10"` applies to both `tokenEstimate.test.ts` and `teamRunCoordinator.test.ts`; no `tokenEstimate.test.ts` title carries `D-10`, so the estimator file is fully skipped by its own first gate. |
| W5 | 06 | Stated guard guards something | Split-usage cross-invariant asserts `usedTokens >= 0` and integer splits — already guaranteed by `aiTokensSchema` (`backupSchemas.ts:608`). The only non-tautological relation (`usedTokens === input + output`) is explicitly forbidden. |
| W6 | 04 | Cross-plan handoff true | Says `topUpMemberBudget` is a "deprecated shim (caller removed in plan 09)". Plan 09 never mentions it; live caller `TeamWorkspace.tsx:716` survives. `aiTeamRepo.ts:476` keeps a comment referencing the deleted `bucketOf`. |
| W7 | 03, 08, 09 | Multi-file `grep -c` read as one total | `grep -c` over two files prints per-file counts (`file:N`), not a sum. Affects plan 03 task 2, plan 08 (measured 1+1), plan 09. |
| W8 | 05, 08, 09 | Extending `TeamRunSnapshot` covers consumers | Test stubs at `tests/components/ai/office/TeamWorkspaceSteer.test.tsx:74-82` and `TeamWorkspaceWhitespaceSubmit.test.tsx:54-62` return snapshots without the new fields; only the steer stub types `getState` as `unknown`. |

---

## Advisories (info, no action required)

1. **Edge-coverage counts not traceable.** Measured 22 `verification: backstop` markers and 95 total `truths` entries (73 plain + 22 backstop), vs the planner's reported "14 plain + 19 backstop". All 30 probe edges do have a plausible carrier (boundary → 01/05/09; adjacency → 03/04/05/07/09; empty → 01/03/05/07; ordering → 03/08/09; precision → 01/05/09; concurrency → 03/07; idempotency → 03), but no edge→truth mapping exists. Prohibitions correctly descriptor-less.
2. **Plan 10 wave = 7** with only `depends_on: [38-07]` (wave 4) → rule gives wave 5. Harmless serialization.
3. **Estimates** all `over_budget: false` (largest plan 08 at 82k/100k). `confidence: low`, `sample_count: 0` — not yet calibrated; task/file counts are the stronger signal. No `recommendation` returned.

---

## Recommendation

7 blockers, 8 warnings require revision. Cheapest high-value fixes: B1 (literal sweep, seven files) and B3 (`-t` filter) are one-line scope/command corrections; B2 and B4 are missing file/ordering instructions; B7 is a section-heading edit.

The phase's central question — no blocking gate, input+output charged, correct numbers — is well covered. The blockers are verifiability and achievability defects, not missing functionality.

---

*Round 1 — plan-checker, 2026-11-13*
