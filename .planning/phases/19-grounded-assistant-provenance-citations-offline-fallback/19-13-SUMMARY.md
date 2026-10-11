---
phase: 19-grounded-assistant-provenance-citations-offline-fallback
plan: 13
subsystem: ai-assistant
tags: [grounded-assistant, quick-preview, document-set, scope-presets, citations]
requires: [19-02, 19-10, 19-11]
provides: [quick-preview-snapshot-first, document-set-scope-presets, presentation-revision-ordering]
affects: [src/components/notes/QuickPreviewDrawer.tsx, src/components/knowledge/DocumentSetForm.tsx, src/types/models.ts, src/db/repositories/documentSetRepo.ts]
tech-stack:
  added: []
  patterns: [snapshot-first excerpt panel, reduced-motion highlight, presentation revision monotonic counter]
key-files:
  created:
    - tests/knowledge/documentSetForm.test.tsx
    - tests/knowledge/documentSetRepo-ordering.test.ts
  modified:
    - src/components/notes/QuickPreviewDrawer.tsx
    - src/components/knowledge/DocumentSetForm.tsx
    - src/components/knowledge/DocumentSetDrawer.tsx
    - src/types/models.ts
    - src/validation/knowledgeSchemas.ts
    - src/db/repositories/documentSetRepo.ts
    - tests/ai/CitationChipAndQuickPreview.test.tsx
decisions:
  - "QuickPreviewDrawer renders snapshot-first line-numbered raw pre excerpt above current markdown when citedExcerpt is present (D-47, D-48)."
  - "QuickPreviewDrawer performs SHA-256 comparison between normalized current markdown and citedContentHash only for server authority, showing destructive alert banner on mismatch (D-10, D-21)."
  - "QuickPreviewDrawer focuses anchor, scrolls center, and applies static highlight for prefers-reduced-motion or 1600ms animated highlight (ANSWER-07)."
  - "DocumentSet carries scope (domain, environment, version), aliases, relations[], isBase, presentationRevision, preset without requiring shape migration for pre-19 data (D-17, D-18, D-32, D-35)."
  - "updatePresentationOrder updates ordering column and increments presentationRevision by 1 without touching graphSnapshotId, publishedContentHash, or publish state (D-32, D-33)."
metrics:
  duration: 15m
  completed_date: "2026-10-11"
---

# Phase 19 Plan 13: QuickPreviewDrawer & DocumentSet Scope Form Summary

Snapshot-first citation drawer navigation with mismatch detection and DocumentSet scope presets with presentation revision isolation.

## What Was Done

1. **QuickPreviewDrawer (Task 1)**:
   - Added props `sectionAnchor`, `lineRange`, `citedSnapshotId`, `citedExcerpt`, `citedContentHash`, `citationAuthority`, `snapshotAvailable`.
   - Rendered top snapshot excerpt card with monospace 13px line-numbered `<pre>` (with start line offset from `lineRange.start`).
   - Added SHA-256 comparison of current document body vs `citedContentHash` using `computeSha256(normalizeMarkdownForHash(...))`; rendered destructive `GroundedBanner variant="snapshot-mismatch"` on divergence.
   - Handled missing snapshot state (`snapshotAvailable === false`) preserving raw excerpt and showing clear unavailable status (D-48).
   - Added keyboard focus (`tabIndex={-1}`), center scroll, and reduced-motion-aware highlight (2000ms static or 1600ms fade).
   - Added 8 new test cases in `tests/ai/CitationChipAndQuickPreview.test.tsx` (cases 8-15) covering excerpt, mismatch banner, local authority skip, missing snapshot state, reduced-motion, focus, and citation group activation.

2. **DocumentSet Model & Form (Task 2)**:
   - Extended `DocumentSet` model with `scope` (`domain`, `environment`, `version`), `aliases`, `relations`, `isBase`, `presentationRevision`, and `preset` (D-17, D-18, D-32).
   - Implemented `updatePresentationOrder` in `documentSetRepo.ts` inside a Dexie transaction bumping `presentationRevision += 1` while strictly leaving `graphSnapshotId` and published hashes untouched (D-32, D-33).
   - Implemented `fetchSetCatalog` returning lightweight catalog entries consumed by `semanticScopeRouter.routeScope` (D-19, D-20).
   - Extended `DocumentSetForm.tsx` with friendly preset radio group (`Chung`, `Theo môi trường`, `Theo module`, `Theo phiên bản`, `Bổ sung`, `Tùy chỉnh`), validation rules for required domain/facets, and collapsed advanced panel for aliases chips and base knowledge toggle.
   - Created `tests/knowledge/documentSetForm.test.tsx` with 6 form test cases and `tests/knowledge/documentSetRepo-ordering.test.ts` with 4 ordering and catalog test cases.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] FormItem exactOptionalPropertyTypes validateStatus typing**
- **Found during:** Task 2 verification (`npm run build`)
- **Issue:** `validateStatus: submittedAttempt && !environment ? 'error' : undefined` failed under strict `exactOptionalPropertyTypes: true` because `undefined` is not a valid status string.
- **Fix:** Used conditional spreading `{...(submittedAttempt && !environment ? { validateStatus: 'error', help: '...' } : {})}`.
- **Files modified:** `src/components/knowledge/DocumentSetForm.tsx`
- **Commit:** `4a5803f`

**2. [Rule 1 - Bug] ScopeProof dimension typing in toPersistedConflicts**
- **Found during:** Task 2 verification (`npm run build`)
- **Issue:** `toPersistedConflicts` in `groundedTurn.ts` mapped `scopeProof` omitting the required `dimension` property.
- **Fix:** Added `dimension: cg.scopeProof.dimension ?? cg.dimension` in `toPersistedConflicts`.
- **Files modified:** `src/services/ai/groundedTurn.ts`
- **Commit:** `4a5803f`

## Self-Check: PASSED

- Created files exist:
  - FOUND: `tests/knowledge/documentSetForm.test.tsx`
  - FOUND: `tests/knowledge/documentSetRepo-ordering.test.ts`
- Commits exist:
  - FOUND: `4e2f38f` (feat(19-13): extend QuickPreviewDrawer with snapshot excerpt, mismatch warning, and range focus)
  - FOUND: `4a5803f` (feat(19-13): extend DocumentSet with scope presets, aliases, relations, and presentationRevision)
- Automated verification:
  - `npm test -- tests/ai/CitationChipAndQuickPreview.test.tsx tests/knowledge/documentSetForm.test.tsx tests/knowledge/documentSetRepo-ordering.test.ts`: 29 tests passed across 3 suites.
  - `npm run build`: successful production build.
