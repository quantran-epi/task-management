---
phase: 25-interactive-sdlc-document-wizards
plan: 04
subsystem: testing
tags: [vitest, playwright, wizard, fixtures, change-pack, e2e]

requires:
  - phase: 25-interactive-sdlc-document-wizards
    provides: "Plan 25-01 pinned profile-B archive limits, metadata shapes, and persistence constants"
provides:
  - "Schema-versioned F01-F16 synthetic wizard lifecycle and security reference fixture"
  - "Profile-B adversarial change-pack manifest with stable expected rejection codes"
  - "Targeted Vitest fixture assertions plus named future service/component TODO contracts"
  - "Playwright-managed actual Vite app smoke at /task-management/ with F16 fixme gates"
affects: [25-05, 25-07, 25-11, 25-12, 25-17]

tech-stack:
  added: []
  patterns:
    - "Fixture-first behavior gates with executable structural assertions and explicit named TODOs"
    - "Actual-app Playwright startup through webServer instead of isolated page.setContent DOM"

key-files:
  created:
    - tests/fixtures/ai/wizard-reference.json
    - tests/fixtures/ai/change-packs/manifest.json
    - tests/ai/wizardService.test.ts
    - tests/ai/changePack.test.ts
    - tests/ai/reconciliation.test.ts
    - src/components/ai/wizard/__tests__/documentWizard.test.tsx
    - e2e/documentWizards.spec.ts
  modified:
    - playwright.config.ts

key-decisions:
  - "Keep Wave 0 tests fixture-only until production wizard symbols exist; behavior contracts remain named it.todo/test.fixme rather than fake imports or false-green assertions."
  - "Pin profile-B archive limits directly from Plan 25-01: 5MB compressed, 25MB expanded, 2MB per entry, and 256 entries."
  - "Run Playwright against the real Vite project base using webServer and a source guard that forbids page.setContent."

patterns-established:
  - "F01-F16 each declare requirement mapping, initial records, inputs, evidence hashes/ranges, mocked responses, expected gaps/unknowns/drift/calls/status/effects, and forbidden claims."
  - "Generated Playwright test-results state is removed after targeted E2E runs."

requirements-completed: [WIZ-UI-01, WIZ-INTERACTIVE-01, WIZ-FLOW-01, WIZ-LOOP-01, WIZ-PACK-01]

duration: 9min
completed: 2026-10-28
---

# Phase 25 Plan 04: Wizard Validation Scaffold Summary

**F01-F16 synthetic lifecycle/security contracts, adversarial change-pack catalog, and self-starting actual-app Playwright smoke establish Wave 0 gates before wizard behavior exists.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-10-28T14:07:42Z
- **Completed:** 2026-10-28T14:16:36Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Added exactly 16 contiguous reference scenarios (`F01` through `F16`) covering lifecycle, evidence, drift, stale/cross-project guards, archive attacks, prompt injection, strict output validation, offline degradation, deterministic builders, and full actual-app flow.
- Added profile-B change-pack fixture manifest with stable archive names, expected reason codes, and zero-write/rollback expectations for traversal, collision, bomb, corruption, prohibited, binary, and persistence-failure variants.
- Added four targeted Vitest entrypoints: 9 executable contract assertions pass while 18 named producer behaviors remain explicit TODO gates for later implementation plans.
- Configured Playwright `webServer` to start Vite automatically at `http://127.0.0.1:5173/task-management/`; actual browser smoke reaches app shell and opens AI entry without `page.setContent`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Author strict F01-F16 reference fixture and test entry scaffolds** - `626c510` (test)
2. **Task 2: Configure actual-app Playwright skeleton** - `3df1941` (test)

## Files Created/Modified

- `tests/fixtures/ai/wizard-reference.json` - Versioned F01-F16 expected calls, state, effects, evidence, drift, and forbidden-claim dataset.
- `tests/fixtures/ai/change-packs/manifest.json` - Profile-B archive fixture catalog and expected validation codes.
- `tests/ai/wizardService.test.ts` - Fixture integrity, requirement coverage, synthetic-data checks, and future wizard service contracts.
- `tests/ai/changePack.test.ts` - Archive profile/catalog assertions and future validation/persistence contracts.
- `tests/ai/reconciliation.test.ts` - Exact drift tuple, coverage, and CAB caveat assertions.
- `src/components/ai/wizard/__tests__/documentWizard.test.tsx` - UI copy and F16 lifecycle contract scaffold.
- `e2e/documentWizards.spec.ts` - Real-app smoke plus six named F16 lifecycle fixme cases.
- `playwright.config.ts` - Vite web server startup and project-base URL.

## Decisions Made

- Used fixture-only executable assertions now; avoided importing nonexistent production symbols or creating placeholder implementations solely to make tests compile.
- Kept planned TODO/fixme cases visible and named. Their presence is evidence of pending producer work, not Phase 25 acceptance.
- Used existing Vitest and Playwright dependencies only; no evaluator framework or package added.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Executor worktree started two commits behind `master`, so Plan 25 files were absent. Fast-forwarded worktree to `master` before edits; no conflict or local change loss.
- Playwright creates `test-results/.last-run.json`, which repository did not ignore. Removed generated file after each run; no unrelated file committed.

## User Setup Required

None - no external service configuration required.

## Known Stubs

- `tests/ai/wizardService.test.ts`: 5 intentional `it.todo` producer contracts; Plans 25-07 and 25-17 replace them with production behavior tests.
- `tests/ai/changePack.test.ts`: 4 intentional `it.todo` producer contracts; Plans 25-05, 25-06, and 25-17 activate them.
- `tests/ai/reconciliation.test.ts`: 4 intentional `it.todo` producer contracts; Plans 25-05, 25-15, and 25-17 activate them.
- `src/components/ai/wizard/__tests__/documentWizard.test.tsx`: 5 intentional component `it.todo` contracts; Plans 25-11 through 25-13 and 25-17 activate them.
- `e2e/documentWizards.spec.ts`: 6 intentional `test.fixme` F16 flows; Plan 25-17 replaces them after UI/service integration.

These stubs are deliberate Wave 0 gates. Active fixture assertions and actual-app smoke pass; full wizard acceptance remains blocked until Plan 25-17 removes pending cases.

## Next Phase Readiness

- Plans 25-05, 25-07, 25-11, 25-12, and 25-17 can consume stable F01-F16 labels and archive reason codes.
- Actual-app E2E infrastructure starts Vite automatically and is ready for lifecycle activation.
- Pending TODO/fixme count remains explicit: 18 Vitest TODOs and 6 Playwright fixmes.

## Verification

- `npm test -- tests/ai/wizardService.test.ts tests/ai/changePack.test.ts tests/ai/reconciliation.test.ts src/components/ai/wizard/__tests__/documentWizard.test.tsx` — 4 files passed, 9 tests passed, 18 todo.
- `npm run test:e2e -- e2e/documentWizards.spec.ts --project=chromium` — 1 actual-app Chromium smoke passed; 6 fixmes intentionally excluded until producer UI exists.

## Self-Check: PASSED

- All eight planned code/test artifacts exist.
- Task commits `626c510` and `3df1941` exist in git history.
- No tracked file deletion occurred.
- Working tree clean after generated Playwright status removal.

---
*Phase: 25-interactive-sdlc-document-wizards*
*Completed: 2026-10-28*
