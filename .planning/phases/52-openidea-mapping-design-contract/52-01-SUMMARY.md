---
phase: 52-openidea-mapping-design-contract
plan: 01
subsystem: ui
tags: [design-contract, openidea, mapping, api-lock, verification, documentation-only]

# Dependency graph
requires:
  - phase: 51-control-inventory-surface-audit
    provides: "56 wrapper files, 257 export guard, 56 CLASSIFY rows, 34 new-design labels"
provides:
  - "Verified 52-UI-SPEC.md as the single approved design contract for MAP-01/02/03"
  - "Machine-checked evidence: 56 mapping = 56 API = 56 wrappers; 34 N-01..N-34 specs; 22 MAP-01 analogs; 25 baseline rows"
  - "Focused gate green: 3 test files / 12 tests passed; no full Vitest suite"
affects: [phase-53-native-core-form-controls, phase-54-native-overlay-complex-controls, phase-55-full-surface-adoption, phase-56-antd-removal, phase-57-chrome-visual-sweep]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Documentation-only plan: verify approved artifact, commit atomic evidence per task, never edit src/"

key-files:
  created:
    - ".planning/phases/52-openidea-mapping-design-contract/52-01-TASK-1-EVIDENCE.md"
    - ".planning/phases/52-openidea-mapping-design-contract/52-01-TASK-2-EVIDENCE.md"
    - ".planning/phases/52-openidea-mapping-design-contract/52-01-TASK-3-EVIDENCE.md"
    - ".planning/phases/52-openidea-mapping-design-contract/52-01-SUMMARY.md"
  modified: []

key-decisions:
  - "52-UI-SPEC.md remains byte-identical: approved 6/6 by gsd-ui-checker on 2026-11-22; plan only verifies, no rewrite"
  - "56 wrapper files drive the mapping table; 257 export guard is a separate count and is not merged"
  - "22 MAP-01 analogs + 34 MAP-02 new designs = 56 CLASSIFY rows from Phase 51"
  - "Control palette stays separated from workbench shell; accent #3871e1 in light and dark; --ui-spin-accent preserved from D-12"
  - "No UI runtime library added; @floating-ui/react-dom banned, flip/shift computed natively"
  - "API contract MAP-03 is byte-for-byte; data-oi-control/data-state/data-lead are measurement hooks, not props"

patterns-established:
  - "Per-task evidence files committed atomically for documentation-only verification plans"

requirements-completed: [MAP-01, MAP-02, MAP-03]

# Metrics
duration: ~2 min
completed: 2026-11-22
---

# Phase 52 Plan 01: OpenIDEA Mapping Design Contract Summary

**Verified the approved 52-UI-SPEC.md design contract against Phase 51 inventory: 56/56/34 counts, 22+34 mapping split, byte-identical API lock, and a green 3-file focused gate.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-11-21T18:18:00Z
- **Completed:** 2026-11-21T18:20:08Z
- **Tasks:** 3 of 3
- **Files modified:** 4 new planning artifacts (3 evidence + 1 summary); zero source files

## Accomplishments

- Confirmed contract `status: approved`, `phase: 52`, checker sign-off 6/6 PASS (2026-11-22), `shadcn_initialized: false`, registry safety gate banning all new UI runtime libraries.
- Machine-checked `contract verified 56 56 34 34`: 56 §1 mapping rows = 56 §7.2 API rows = 56 wrapper `.tsx` files = 56 `WRAPPER-ROW` = 56 `CLASSIFY`; 34 `N-01..N-34` specs match the 34 "cần thiết kế mới" labels, leaving 22 MAP-01 analogs.
- Confirmed MAP-01 anatomy specs (`S-BTN`..`S-TT`), OpenIDEA-derived metrics, `PROOF.md` absolute path, 28 CSS modules, and the ban on `@floating-ui/react-dom`.
- Confirmed MAP-03 sections 7.1/7.2/8/9/10: 10 API facets, 56 `identical` rows, 25 measurement baseline rows, Vietnamese copy and keyboard/focus/a11y criteria, and the 30→28 / accent `#3871e1` token migration.
- Ran focused Vitest only: `npx vitest run src/components/ui/__tests__/antdInventory.test.ts src/components/ui/__tests__/coverage.test.ts src/components/ui/__tests__/staticApiGuard.test.ts --bail=1` → 3 files / 12 tests passed. No full suite.
- Kept `git status --short src` empty at every task; no dependency installed; no drift found, so no contract edit was necessary.

## Task Commits

Each task was committed atomically:

1. **Task 1: Verify design contract approved và khớp 56/34/56/25** - `62a6eb8e` (docs)
2. **Task 2: Khóa MAP-01/MAP-02 design decision làm nguồn cho Phase 53/54** - `6ebefb30` (docs)
3. **Task 3: Verify MAP-03 API lock + baseline measurement cho Phase 57** - `eee33d20` (docs)

**Plan metadata:** about to be committed (SUMMARY + STATE + ROADMAP)

## Files Created/Modified

- `.planning/phases/52-openidea-mapping-design-contract/52-UI-SPEC.md` - approved contract, read and verified only, left byte-identical
- `.planning/phases/52-openidea-mapping-design-contract/52-01-TASK-1-EVIDENCE.md` - Task 1 reproduction output and count cross-checks
- `.planning/phases/52-openidea-mapping-design-contract/52-01-TASK-2-EVIDENCE.md` - Task 2 MAP-01/MAP-02 design source and metric gate output
- `.planning/phases/52-openidea-mapping-design-contract/52-01-TASK-3-EVIDENCE.md` - Task 3 API/baseline checks and focused Vitest result
- `.planning/phases/52-openidea-mapping-design-contract/52-01-SUMMARY.md` - this summary

## Decisions Made

- No new design decision: all choices were already locked by the approved contract and Phase 51 inventory; this plan only records evidence.
- The 257 export guard count is a separate axis from the 56 wrapper file count; mapping rows must follow the file count.
- Contract drift, had it appeared, would be fixed with a minimal Edit preserving locked decisions; none was needed.

## Self-Check: PASSED

All three task verification gates re-run after task commits (contract verified 56 56 34 34; Task 2 token gate; focused Vitest 3 files / 12 tests), `git status --short src` empty, evidence files and three task commits present.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. All three task verification gates passed on first run. The only repository changes present at start were pre-existing `.planning/STATE.md` and `.planning/config.json` edits from phase setup; they were left untouched by task commits and are handled in plan metadata.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for `52-02`. Design contract is verified and frozen; Phase 53 can consume `52-UI-SPEC.md` as the sole source of truth for native core/form control implementation. No blockers.

---
*Phase: 52-openidea-mapping-design-contract*
*Completed: 2026-11-22*
