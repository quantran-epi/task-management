---
phase: 16-knowledge-server-foundation-dlp-checks-ast-ingestion
plan: 22
subsystem: knowledge-ui
tags: [react, dexie, publishing, polling, reconciliation, offline]
requires:
  - phase: 16-21
    provides: durable frozen manifests and terminal reconciliation
  - phase: 16-17
    provides: Docs publishing UI and guarded preview flow
provides:
  - accepted-attempt polling with terminal and uncertainty UI
  - deterministic per-set publish state derivation
  - attempt-ID-only recovery from durable cached manifests
affects: [knowledge-publishing, docs-status, phase-16-verification]
tech-stack:
  added: []
  patterns: [observer-only publish close, frozen-hash status derivation, bounded content-free errors]
key-files:
  created: []
  modified:
    - src/components/knowledge/PublishPreviewModal.tsx
    - src/components/knowledge/PublishProgressPanel.tsx
    - src/components/knowledge/DocumentSetDrawer.tsx
    - src/views/NotesView.tsx
    - tests/knowledge/DocumentSetPublishFlow.test.tsx
key-decisions:
  - "Closing accepted publish UI aborts only local polling through PublishSession.closePreview; server work and frozen manifests remain untouched."
  - "Per-set state priority uses newest active attempt first, then newest explicit Failed/Warning, then frozen published membership and hash comparison."
  - "Reopen recovery requires retained attempt ID plus submittedDocuments and never rebuilds submitted truth from mutable Notes."
patterns-established:
  - "Publishing recovery: validate durable manifest before polling retained attempt ID."
  - "Set badges: derive each row and detail independently from its set ID."
requirements-completed: [INGEST-01, INGEST-02, INGEST-04, INGEST-05]
duration: 25min
completed: 2026-10-09
---

# Phase 16 Plan 22: Publish Lifecycle UI and Durable Recovery Summary

**Accepted publish attempts now resolve to terminal or safe uncertain UI, while drawer and Docs badges derive truthful state from retained attempts, frozen submitted hashes, and current local content.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-10-09T08:04:00Z
- **Completed:** 2026-10-09T08:28:59Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added immediate accepted-attempt polling, explicit In sync/Failed/Warning/Local changes rendering, bounded errors, in-flight guards, and observer-only close behavior.
- Replaced hardcoded set status with deterministic per-set state maps based on active attempts, terminal outcomes, membership, and SHA-256 content hashes.
- Added retained-attempt reconciliation that requires durable submittedDocuments and polls by attempt ID without rereading mutable Markdown as submitted truth.
- Kept attempt history content-free and capped by existing repository/UI behavior.

## Task Commits

1. **Task 1: Render accepted attempt polling through terminal or uncertainty** - `6a9fa46` (feat)
2. **Task 2: Derive truthful per-set states and reconcile durable cached attempts on reopen** - `61b3ba8` (feat)

## Files Created/Modified

- `src/components/knowledge/PublishPreviewModal.tsx` - Poll lifecycle, in-flight guards, bounded failures, observer-only close.
- `src/components/knowledge/PublishProgressPanel.tsx` - Explicit six-state progress and terminal rendering.
- `src/components/knowledge/DocumentSetDrawer.tsx` - Per-set list/detail badges and retained-attempt recovery action.
- `src/views/NotesView.tsx` - Reactive state derivation and attempt-ID-only reconciliation.
- `tests/knowledge/DocumentSetPublishFlow.test.tsx` - Terminal, uncertainty, duplicate-action, close, row-state, and recovery coverage.

## Decisions Made

- Use cached `submittedDocuments` presence as mandatory recovery precondition; missing manifest surfaces bounded protocol/recovery error and performs no mutation.
- Keep connectivity uncertainty subordinate to `Publishing`; only explicit daemon terminal state becomes `Failed`.
- Compute local hashes reactively from canonical Notes only for comparison, never for submitted metadata reconstruction.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added IndexedDB shim to component test**
- **Found during:** Task 1 verification
- **Issue:** `DocumentSetDrawer` live queries hung in jsdom without IndexedDB, timing out targeted test.
- **Fix:** Imported existing `fake-indexeddb/auto` test shim.
- **Files modified:** `tests/knowledge/DocumentSetPublishFlow.test.tsx`
- **Verification:** Targeted suite passed 14 tests after fix; final suite passed 32 tests.
- **Committed in:** `6a9fa46`

**2. [Rule 3 - Blocking] Restored existing knowledge-server workspace dependencies**
- **Found during:** Task 2 verification
- **Issue:** Worktree lacked `knowledge-server/node_modules`, so Vite could not resolve `mdast-util-to-string`.
- **Fix:** Copied existing dependency tree from main checkout; no package install or tracked file change.
- **Files modified:** None; ignored workspace dependency directory only.
- **Verification:** Three targeted suites loaded and passed.
- **Committed in:** Not applicable.

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Verification environment fixes only. No feature scope added.

## Issues Encountered

- Full production build exposed unrelated pre-existing TypeScript errors in Phase 16 test files. Per targeted-test instruction, no unrelated files changed. Plan-owned type errors were fixed before final targeted verification.

## Verification Results

- `npm test -- tests/knowledge/DocumentSetPublishFlow.test.tsx`: 14 passed after Task 1.
- `npm test -- tests/knowledge/NotesWorkspacePublishingIntegration.test.tsx tests/knowledge/DocumentSetPublishFlow.test.tsx tests/knowledge/NotesKnowledgePublishing.test.tsx`: 32 passed.

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- GAP-05 and CR-06/CR-07 UI lifecycle closure ready for phase verification.
- Optional daemon remains non-blocking for local Docs, IndexedDB, search, and editing.

## Self-Check: PASSED

- `src/components/knowledge/PublishPreviewModal.tsx`: FOUND
- `src/components/knowledge/PublishProgressPanel.tsx`: FOUND
- `src/components/knowledge/DocumentSetDrawer.tsx`: FOUND
- `src/views/NotesView.tsx`: FOUND
- `tests/knowledge/DocumentSetPublishFlow.test.tsx`: FOUND
- Commit `6a9fa46`: FOUND
- Commit `61b3ba8`: FOUND

---
*Phase: 16-knowledge-server-foundation-dlp-checks-ast-ingestion*
*Completed: 2026-10-09*
