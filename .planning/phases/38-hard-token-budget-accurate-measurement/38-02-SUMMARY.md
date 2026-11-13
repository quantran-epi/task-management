---
phase: 38-hard-token-budget-accurate-measurement
plan: 02
subsystem: docs
tags: [requirements, roadmap, override, token-budget, audit-trail]

# Dependency graph
requires:
  - phase: 38-hard-token-budget-accurate-measurement
    provides: D-01/D-02/D-06 locked in 38-CONTEXT.md
  - phase: 37-runtime-reliability-concurrency
    provides: the AIO-RUNTIME-02 struck-through override convention
provides:
  - AIO-BUDGET-01 overridden in REQUIREMENTS.md (budget warns, never refuses)
  - AIO-BUDGET-09 overridden in REQUIREMENTS.md (no pause, no resume-on-top-up)
  - verified warning-only Phase 38 roadmap criteria 1 and 6
affects: [38-03, 38-04, 38-05, 38-06, 38-07, 38-08, 38-09, 38-10, 38-11, 38-12, 39, 40]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Override convention: keep the ID and `- [ ]`, wrap the original in ~~…~~, append a bold `Superseded by <phase> D-xx:` note, keep the source tag and add the decision IDs"

key-files:
  created: []
  modified:
    - .planning/REQUIREMENTS.md

key-decisions:
  - "AIO-BUDGET-01/09 stay unchecked: the override records what will be built, and the checkmarks land when the implementation plans close"
  - "ROADMAP.md was not edited — measured at HEAD, criteria 1 and 6 already carry the warning-only wording citing D-01/D-02, so the task was a verify-and-noop"

patterns-established:
  - "Downstream agents read the struck-through original plus the override note; the old blocking wording is never deleted or renumbered"

requirements-completed: [AIO-BUDGET-01, AIO-BUDGET-09]

# Metrics
duration: 2min
completed: 2026-11-13
---

# Phase 38 Plan 02: Record the D-01/D-02 override Summary

AIO-BUDGET-01 and AIO-BUDGET-09 now read as superseded-by-decision rather than as unmet gaps: the original blocking sentences stay struck through as the audit trail, and each carries an explicit note that budget only warns, the run continues, and the user stops manually. ROADMAP §Phase 38 criteria 1 and 6 were verified already warning-only and left untouched.

## Performance

- **Duration:** 2 min
- **Started:** 2026-11-13T14:12:00Z
- **Completed:** 2026-11-13T14:13:35Z
- **Tasks:** 2 (1 edit, 1 verify-and-noop)
- **Files modified:** 1

## Accomplishments

- `AIO-BUDGET-01` struck through and annotated: budget never blocks; crossing 100% of a member share or the group total raises an in-app warning plus one OS notification, and the user presses Stop manually. Surviving invariant: "no model call is ever refused or parked for budget reasons."
- `AIO-BUDGET-09` struck through and annotated: no pause between tool rounds, no resume-on-top-up; two-level warning, run continues. Surviving invariant: "a threshold crossing is always visible, never a silent hang."
- Confirmed ROADMAP criteria 1 and 6 already cite D-01/D-02 and name `per-team override` and `one OS notification per level`; the old wording (`is refused, not run`, `pauses visibly between tool rounds`) is absent.

## Task Commits

1. **Task 1: Override AIO-BUDGET-01 and AIO-BUDGET-09 in REQUIREMENTS.md** — `4aa22b65` (docs)
2. **Task 2: Verify roadmap success criteria 1 and 6** — no commit (verify-and-noop, no file change)

## Files Created/Modified

- `.planning/REQUIREMENTS.md` — lines 65 and 73 rewritten to the Phase-37 override shape; source tags extended with `D-01, D-02` and `D-01, D-02, D-06`.

## Decisions Made

- Requirement lines stay `- [ ]`. The override note documents the decision; the checkbox is earned when the implementing plans land. This keeps the count of AIO-BUDGET lines at 9 and preserves the audit trail.
- ROADMAP.md untouched. Its wording was already correct at HEAD, so editing it would have been churn with regression risk.

## Deviations from Plan

### Auto-fixed Issues

None.

### Plan-text inaccuracies (no code impact)

- The plan's acceptance criterion `grep -c '^- \[ \] \*\*AIO-BUDGET' .planning/REQUIREMENTS.md` returns 9 is stale: AIO-BUDGET-06 and AIO-BUDGET-08 are already `[x]` from earlier phases, so that grep returns 7. The must-have intent — "no requirement ID's wording changes and no line is removed" — holds: `grep -c '^- \[.\] \*\*AIO-BUDGET'` returns 9 both before and after the edit.

## Issues Encountered

None.

## User Setup Required

None.

## Next Phase Readiness

- D-25 is satisfied: REQUIREMENTS.md and ROADMAP.md both point downstream agents at D-01/D-02 instead of the superseded blocking wording.
- Plan 38-03 (atomic usage increment + shared even-split) can proceed; nothing here blocks it.

## Self-Check: PASSED

- `.planning/REQUIREMENTS.md` exists and contains 2 `Superseded by 38` matches.
- `.planning/ROADMAP.md` contains 2 `overrides the original wording` matches, both citing D-01.
- Commit `4aa22b65` exists in git log.
