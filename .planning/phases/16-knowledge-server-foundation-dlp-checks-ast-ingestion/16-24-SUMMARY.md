---
phase: 16-knowledge-server-foundation-dlp-checks-ast-ingestion
plan: 24
subsystem: knowledge

tags: [markdown, mdast, recursive-validation, ant-design, security]

requires:
  - phase: 16-05
    provides: isomorphic Markdown AST chunker and atomic block limit
  - phase: 16-22
    provides: terminal publish polling and status UI
provides:
  - Recursive atomic block validation at every Markdown AST depth
  - Structured sanitized oversized-block metadata through daemon polling
  - Actionable Vietnamese preview and publish failure feedback
affects: [phase-17, knowledge-server, document-publishing]

tech-stack:
  added: []
  patterns: [recursive AST validation, metadata-only trust-boundary errors, targeted regression tests]

key-files:
  created:
    - tests/knowledge/atomicBlockClientError.test.tsx
  modified:
    - knowledge-server/src/parser/atomicBlockValidator.ts
    - knowledge-server/src/parser/sectionChunker.ts
    - knowledge-server/tests/atomicBlock.test.ts
    - knowledge-server/src/indexing/snapshotStore.ts
    - knowledge-server/src/services/attemptService.ts
    - knowledge-server/src/types/protocol.ts
    - knowledge-server/src/routes/attempts.ts
    - knowledge-server/tests/pilotAcceptance.test.ts
    - src/services/knowledge/knowledgeClient.ts
    - src/views/NotesView.tsx
    - src/components/knowledge/PublishPreviewModal.tsx
    - src/components/knowledge/PublishProgressPanel.tsx

key-decisions:
  - "Validate atomic Markdown blocks recursively at every AST depth while leaving total document length unconstrained."
  - "Carry only sanitized block type, line, column, and limit metadata across daemon/client boundaries; never raw Markdown content."

patterns-established:
  - "Recursive validation: validate current AST node, then visit every child before projection."
  - "Safe structured errors: render trusted metadata through one shared formatter and ignore payload excerpts."

requirements-completed: [INGEST-03]

duration: 7min
completed: 2026-10-09
---

# Phase 16 Plan 24: Recursive Atomic Block Validation Summary

**Nested Markdown code, table, and blockquote limits now reject safely at every AST depth while large normal documents still split into valid chunks and UI shows exact remediation metadata.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-10-09T16:20:25Z
- **Completed:** 2026-10-09T16:27:42Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments

- Added recursive MDAST traversal before chunk projection, closing nested-list and container bypasses.
- Proved documents over 50,000 total characters remain valid when no individual atomic block crosses limit.
- Preserved `blockType`, `line`, `column`, and `limit` through server attempt responses and client polling.
- Added one safe Vietnamese formatter for pre-preview and terminal publish errors with split guidance and no raw content.

## Task Commits

Each task was committed atomically:

1. **Task 1: Recursive AST atomic block validation at all depths and multi-chunk preservation** - `5089c8b` (fix)
2. **Task 2: Structured client UI error presentation with line, column, limit, and split guidance** - `85f018f` (fix)

## Files Created/Modified

- `knowledge-server/src/parser/atomicBlockValidator.ts` - Recursively validates atomic nodes at all AST depths.
- `knowledge-server/src/parser/sectionChunker.ts` - Runs recursive validation before section chunking.
- `knowledge-server/tests/atomicBlock.test.ts` - Covers nested oversized code and valid large multi-section documents.
- `knowledge-server/src/indexing/snapshotStore.ts` - Stores safe block type and limit metadata on failed candidates.
- `knowledge-server/src/services/attemptService.ts` - Maps typed parser failures to sanitized attempt errors.
- `knowledge-server/src/types/protocol.ts` - Extends attempt error schema with block metadata.
- `knowledge-server/src/routes/attempts.ts` - Serializes sanitized block metadata to clients.
- `knowledge-server/tests/pilotAcceptance.test.ts` - Confirms structured metadata, prior snapshot retention, and no source leak.
- `src/services/knowledge/knowledgeClient.ts` - Validates structured poll errors.
- `src/views/NotesView.tsx` - Shows actionable local preview rejection.
- `src/components/knowledge/PublishPreviewModal.tsx` - Passes structured server failures to progress UI.
- `src/components/knowledge/PublishProgressPanel.tsx` - Formats line, column, limit, and split advice safely.
- `tests/knowledge/atomicBlockClientError.test.tsx` - Covers safe preview formatting and terminal UI rendering.

## Decisions Made

- Total document length remains unconstrained. Only individual atomic code, table, and blockquote nodes use 50,000-character hard limit.
- UI formatter accepts only bounded structured metadata and whitelists block types, preventing arbitrary source content from reaching DOM.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Extended daemon protocol to preserve required safe metadata**
- **Found during:** Task 2
- **Issue:** Existing server failure mapping discarded `blockType` and `limit`, so UI could not satisfy structured feedback requirement.
- **Fix:** Extended candidate, protocol, route, and client schemas with sanitized metadata only.
- **Files modified:** `knowledge-server/src/indexing/snapshotStore.ts`, `knowledge-server/src/services/attemptService.ts`, `knowledge-server/src/types/protocol.ts`, `knowledge-server/src/routes/attempts.ts`, `src/services/knowledge/knowledgeClient.ts`
- **Verification:** Knowledge Server build and pilot acceptance test passed; raw source canary absent from serialized error.
- **Committed in:** `85f018f`

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Required to carry planned UI metadata across server boundary. No new dependency or unrelated scope.

## Issues Encountered

- Worktree-local `knowledge-server/node_modules` lacked declared parser packages. Reused existing main-checkout dependency directory through an untracked symlink; no package install or repository change.
- Initial client typecheck found optional `limit` narrowing error. Tightened numeric guards, then typecheck passed.

## Verification Results

- `npm --prefix knowledge-server test -- tests/atomicBlock.test.ts`: 6 passed.
- `npx vitest run tests/knowledge/atomicBlockClientError.test.tsx`: 3 passed.
- `npm --prefix knowledge-server test -- tests/pilotAcceptance.test.ts`: 5 passed.
- `npm --prefix knowledge-server run build`: passed.
- `npx tsc --noEmit`: passed.

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- INGEST-03 gap closed; nested atomic content cannot bypass pre-projection limit.
- Phase 17 can rely on safe, location-aware ingestion failures and unchanged active snapshots after rejection.

## Self-Check: PASSED

- All created and modified plan files found.
- Task commits `5089c8b` and `85f018f` found.
- No raw Markdown content stored or rendered by oversized-block error path.

---
*Phase: 16-knowledge-server-foundation-dlp-checks-ast-ingestion*
*Completed: 2026-10-09*
