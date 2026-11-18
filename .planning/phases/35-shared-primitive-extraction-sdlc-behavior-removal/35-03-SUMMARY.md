---
phase: 35-shared-primitive-extraction-sdlc-behavior-removal
plan: "03"
subsystem: ui
tags: [react, antd, approval-card, diff, tailwind-free]
status: complete
requires:
  - phase: 35-01
    provides: Generic ArtifactPatchProposal shape and patchProposal service
  - phase: 35-04
    provides: Rescoped note/skill artifact tools with no SDLC proposal tools
provides:
  - PatchDiffApprovalCard presentational diff approval card (note/skill aware)
  - isDarkBase helper re-exported from the card module
  - Rewritten five-case card test built from the rescoped proposal shape
affects: [39-skill-enrichment]
tech-stack:
  added: []
  patterns: [presentational-approval-card, decision-prop-over-local-state]
key-files:
  created:
    - tests/ai/PatchDiffApprovalCard.test.tsx
  modified:
    - src/components/ai/widget/PatchDiffApprovalCard.tsx
    - src/components/ai/AiChatWidget.tsx
  deleted:
    - src/components/ai/widget/ArtifactDiffApprovalCard.tsx
    - tests/ai/ArtifactDiffApprovalCard.test.tsx
key-decisions:
  - Metadata row now renders target label + artifact id + section id because the rescoped proposal no longer carries kind or SDLC version semantics.
  - Kept artifactApprovalState and artifactDecision prop names on AiChatWidget as cosmetic-only aliases (research Asset 4).
  - Test drives the component directly instead of through AiChatWidget so the card is decoupled from the SDLC turn runtime.
requirements-completed: [AIO-REMOVE-01]
actuals:
  tokens: 4280
  tasks: 2
  commits: 2
commits: 2
plan_head_before: 7e9024aec6b81b5320b075d483500f2b89ae04e3
plan_head_after: e7a0e5329e412a2cf9539fb8541465541d5236f6
coverage:
  - id: D1
    description: Patch proposals render through PatchDiffApprovalCard with approve and reject actions wired to the chat turn.
    requirement: AIO-REMOVE-01
    verification:
      - kind: unit
        ref: tests/ai/PatchDiffApprovalCard.test.tsx#reports approve and reject decisions
        status: pass
      - kind: other
        ref: grep -c PatchDiffApprovalCard src/components/ai/AiChatWidget.tsx == 2
        status: pass
    human_judgment: false
  - id: D2
    description: Card implementation and tests are SDLC-free and import only from services/ai/patchProposal.
    requirement: AIO-REMOVE-01
    verification:
      - kind: unit
        ref: npx vitest run tests/ai/PatchDiffApprovalCard.test.tsx
        status: pass
      - kind: other
        ref: grep -c "sdlcArtifactTools|ArtifactDiffApprovalCard|patch.kind" == 0 in touched files
        status: pass
    human_judgment: false
duration: 15min
completed: 2026-11-10
---

# Phase 35 Plan 03: PatchDiffApprovalCard Summary

Renamed the artifact diff card to a note/skill-neutral `PatchDiffApprovalCard`, re-pointed at `patchProposal` and re-wired into the ordinary chat widget with a rewritten five-case test.

## Performance

- **Duration:** 15min
- **Started:** 2026-11-10T06:52:00Z
- **Completed:** 2026-11-10T07:07:00Z
- **Tasks:** 2
- **Files modified:** 4 (2 renamed, 1 deleted, 1 modified)

## Accomplishments

- `ArtifactDiffApprovalCard` → `PatchDiffApprovalCard` via `git mv`, now importing `ArtifactPatchProposal` from `src/services/ai/patchProposal.ts` instead of the delete-set `sdlcArtifactTools`.
- Root test hook renamed `artifact-diff-approval` → `patch-diff-approval`; metadata row now `Ghi chú|Kỹ năng · {id} · mục {sectionId}` because `patch.kind` no longer exists on the rescoped shape.
- `AiChatWidget` imports and renders the card from its new path (2 occurrences, import + render); `artifactApprovalState` / `artifactDecision` prop names left untouched per plan.
- Test rewritten to build proposals inline (no workflow coordinator, no Dexie seed) and run the card directly: 5/5 passing.

## Task Commits

1. **Task 1: Move + rename the card and re-point AiChatWidget** - `17f392ae` (refactor)
2. **Task 2: Rewrite the card test against the rescoped proposal shape** - `e7a0e532` (test)

**Plan metadata:** docs commit created after this file.

## Files Created/Modified

- `src/components/ai/widget/PatchDiffApprovalCard.tsx` - renamed card; exports `PatchDiffApprovalCard`, `PatchDiffApprovalCardProps`, `isDarkBase`
- `src/components/ai/AiChatWidget.tsx` - import + render branch re-pointed
- `tests/ai/PatchDiffApprovalCard.test.tsx` - five focused cases (dark base, render, decisions, stale, approved state)
- `src/components/ai/widget/ArtifactDiffApprovalCard.tsx` - deleted (renamed away)
- `tests/ai/ArtifactDiffApprovalCard.test.tsx` - deleted (renamed away)

## Decisions Made

- Metadata row uses `target` label plus artifact `id`; `version` is intentionally dropped from display because the rescoped snapshot pins `version: 0` until skill versioning lands in phase 39.
- Test targets the card component directly rather than the widget, removing the Dexie/workflow fixture that existed only to exercise the deleted SDLC path.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `npx tsc --noEmit` cannot be green in this worktree**
- **Found during:** Task 1 verification
- **Issue:** The isolated worktree has no `node_modules`; `npx tsc` resolves the parent checkout's TypeScript binary but not its modules. The parent install is also missing declared `@dnd-kit/*` packages, so repo-wide typecheck reports pre-existing TS2307/TS7006 errors unrelated to this plan. Plan 04 recorded the same environment failure.
- **Fix:** Scoped the typecheck gate to the plan's files. `npx tsc --noEmit | grep -E "PatchDiffApprovalCard|AiChatWidget|tests/ai/PatchDiff"` returns zero matches (exit 1). Remaining diagnostics in `src/components/sdlc/chat/StepChatPanel.tsx` are expected: that file still imports the old `sdlcArtifactTools` shape and is inside plan 06's delete set.
- **Files modified:** none
- **Verification:** Scoped grep returns no diagnostics; `tests/ai/PatchDiffApprovalCard.test.tsx` runs 5/5 green.
- **Committed in:** n/a (no code change)

---

**Total deviations:** 1 auto-fixed (Rule 3)
**Impact on plan:** No functional change. The whole-repo typecheck gate remains an orchestrator environment issue, consistent with plan 04's recorded state.

## Issues Encountered

Whole-repo typecheck can only be validated after the worktree has a complete dependency install and after plan 06 deletes `StepChatPanel`. Focused test and scoped diagnostics are green.

## Known Stubs

None.

## Threat Flags

None - the card remained presentational; no new write path, endpoint, or trust boundary was introduced. T-35-07 (write gate stays in `chatTurnRuntime`) and T-35-08 (stale disables approve) preserved and covered by the new test.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `PatchDiffApprovalCard` is ready for phase 39 skill-version approval reuse.
- `AiChatWidget` no longer imports anything from the SDLC delete set.
- Remaining `ArtifactPatchProposal` mismatch lives only in `StepChatPanel.tsx` (plan 06 delete set).

## Self-Check: PASSED

- FOUND: src/components/ai/widget/PatchDiffApprovalCard.tsx
- FOUND: tests/ai/PatchDiffApprovalCard.test.tsx
- FOUND: 17f392ae
- FOUND: e7a0e532
- CONFIRMED absent: src/components/ai/widget/ArtifactDiffApprovalCard.tsx, tests/ai/ArtifactDiffApprovalCard.test.tsx

---
*Phase: 35-shared-primitive-extraction-sdlc-behavior-removal*
*Completed: 2026-11-10*
