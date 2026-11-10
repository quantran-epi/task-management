---
phase: 35-shared-primitive-extraction-sdlc-behavior-removal
plan: 02
subsystem: ai
status: complete
tags: [conventions, diff-rendering, shared-primitive, react, vitest, typescript]

# Dependency graph
requires:
  - phase: 35-shared-primitive-extraction-sdlc-behavior-removal
    provides: audited reusable convention and diff-rendering assets
provides:
  - dependency-free conventions segment service for ordinary AI chat
  - common diff syntax renderer shared by remote file and diff viewers
  - focused tests for convention framing and multi-repository output
affects: [35-03, 35-04, 35-05, 35-06, ai-chat, remote-file-viewer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - dependency-free prompt primitive module
    - common component path for reusable diff rendering
    - focused Vitest coverage for extracted behavior

key-files:
  created:
    - src/services/ai/conventionsSegment.ts
    - src/components/common/DiffSyntaxHighlighter.tsx
    - tests/ai/conventionsSegment.test.ts
  modified:
    - src/services/ai/sdlcPromptComposer.ts
    - src/components/ai/AIChatDrawer.tsx
    - src/components/sdlc/diff/RemoteDiffViewer.tsx
    - src/workbench/editor/RemoteFileViewer.tsx
    - tests/services/multiSystemConventionService.test.ts

key-decisions:
  - "Move convention policy and builder verbatim into a zero-import module; the still-live SDLC composer imports and re-exports these symbols until its planned deletion."
  - "Preserve DiffSyntaxHighlighter implementation and export names exactly while relocating it under components/common."

patterns-established:
  - "Shared prompt text belongs in services/ai modules without SDLC-only imports."
  - "Reusable renderers live under components/common; consumers import the common path directly."

requirements-completed: [AIO-REMOVE-01]

# Coverage metadata
coverage:
  - id: D1
    description: "Ordinary chat imports the extracted conventions segment and still injects global and repository conventions."
    requirement: AIO-REMOVE-01
    verification:
      - kind: unit
        ref: "tests/ai/conventionsSegment.test.ts"
        status: pass
      - kind: integration
        ref: "tests/services/multiSystemConventionService.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Remote file viewer and remote diff viewer render through the relocated colored diff renderer."
    requirement: AIO-REMOVE-01
    verification:
      - kind: unit
        ref: "src/workbench/__tests__/RemoteFileViewer.test.tsx"
        status: pass
      - kind: other
        ref: "./node_modules/.bin/tsc --noEmit"
        status: pass
    human_judgment: false

# Metrics
plan_head_before: b0b7f24aa71cbed0e4ace89883f9e898c305ecbb
plan_head_after: 9ae8183fabe56bacf748331c2d0282f160406627
commits: 2
duration: 23 min
completed: 2026-11-10
---

# Phase 35 Plan 02 Summary

**Shared convention prompt framing and colored diff rendering extracted from SDLC paths without changing live consumer behavior**

## Performance

- **Duration:** 23 min
- **Started:** 2026-11-10T04:08:39Z
- **Completed:** 2026-11-10T04:30:56Z
- **Tasks:** 2
- **Files modified:** 8 logical files; one test rename and one component rename

## Accomplishments

- Extracted `CONVENTIONS_CONFLICT_POLICY`, `RepoConventionItem`, and `buildConventionsSegment` into `src/services/ai/conventionsSegment.ts` with zero imports.
- Repointed `AIChatDrawer` and multi-system convention tests; rewrote the former SDLC exemplar test to cover only exported shared behavior.
- Moved `DiffSyntaxHighlighter.tsx` to `src/components/common/` unchanged and repointed both remote viewers while preserving all four exports.

## Task Commits

1. **Task 1: Extract buildConventionsSegment into conventionsSegment.ts** - `59849fac` (feat)
2. **Task 2: Move DiffSyntaxHighlighter to components/common and re-point both importers** - `9ae8183f` (refactor)

## Files Created/Modified

- `src/services/ai/conventionsSegment.ts` - Shared convention conflict policy and untrusted-data framing.
- `src/services/ai/sdlcPromptComposer.ts` - Uses and re-exports extracted convention symbols while composer remains in place for downstream plans.
- `src/components/ai/AIChatDrawer.tsx` - Imports convention builder from shared service.
- `src/components/common/DiffSyntaxHighlighter.tsx` - Relocated syntax tokenizer and colored line renderer.
- `src/components/sdlc/diff/RemoteDiffViewer.tsx` - Imports renderer from common path.
- `src/workbench/editor/RemoteFileViewer.tsx` - Imports renderer from common path.
- `tests/ai/conventionsSegment.test.ts` - Renamed and rewritten convention behavior tests.
- `tests/services/multiSystemConventionService.test.ts` - Imports shared convention symbols.

## Verification Results

- `./node_modules/.bin/tsc --noEmit` — PASS.
- `./node_modules/.bin/vitest run tests/ai/conventionsSegment.test.ts tests/services/multiSystemConventionService.test.ts tests/ai/sdlcPromptComposer.test.ts` — PASS, 3 files / 52 tests.
- `./node_modules/.bin/vitest run tests/ai/conventionsSegment.test.ts tests/services/multiSystemConventionService.test.ts src/workbench/__tests__/RemoteFileViewer.test.tsx` — PASS, 3 files / 18 tests.
- Structural acceptance checks — PASS: zero imports in `conventionsSegment.ts`, exact live import paths, old test path absent, no old renderer import, four renderer exports preserved, moved renderer content byte-identical.

## Decisions Made

- Kept `sdlcPromptComposer.ts` as a temporary consumer/re-export boundary because later plan work deletes the SDLC composer; no live ordinary-chat consumer points at it.
- Used existing locked dependencies only. No package or lockfile changes.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Initial worktree lacked `node_modules`; `npm ci --offline --ignore-scripts --no-audit --no-fund` restored the existing lockfile dependencies without package changes.
- The first Tauri-environment Vitest invocation raised an unrelated `window is not defined` cleanup error after 18 tests passed. The required focused suite passed without the `TAURI_PLATFORM=linux` override. No source fix was needed.

## User Setup Required

None - no external service configuration required.

## Self-Check: PASSED

- Summary exists at expected path.
- Task commits `59849fac` and `9ae8183f` are ancestors of current HEAD.
- Worktree contains no uncommitted code changes.

## Next Phase Readiness

- Both reusable primitives are outside the planned SDLC delete set.
- Downstream plans can delete the old SDLC composer and diff directory after their remaining consumers are handled.

---
*Phase: 35-shared-primitive-extraction-sdlc-behavior-removal*
*Plan: 02*
*Completed: 2026-11-10*
