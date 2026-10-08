---
phase: 16-knowledge-server-foundation-dlp-checks-ast-ingestion
plan: 16-12
subsystem: docs-knowledge-publishing
tags: [knowledge, publishing, local-first, docs, accessibility, ant-design]
requires: [16-02, 16-07]
provides: [docs-publish-badges, offline-knowledge-integration]
affects: [notes-view, doc-list-pane, doc-editor-pane]
tech-stack:
  added: []
  patterns: [local-first-persistence, aggregate-publish-status, responsive-badge, tdd-red-green]
key-files:
  created:
    - src/components/knowledge/DocPublishBadge.tsx
    - tests/knowledge/NotesKnowledgePublishing.test.tsx
    - tests/knowledge/offlineIsolation.test.ts
  modified:
    - src/components/notes/DocListPane.tsx
    - src/components/notes/DocEditorPane.tsx
    - src/views/NotesView.tsx
decisions:
  - "DocPublishBadge derives compact mode dynamically under 1100px width with fallback to explicit prop"
  - "Local IndexedDB autosave indicator and remote projection publish badge remain distinct elements with separate semantic styling"
  - "DocumentSetDrawer opens via secondary PageHeader button and restores focus to trigger button upon close"
  - "Post-freeze edits update local Dexie note record immediately and transition publish status to Local changes without network call"
metrics:
  duration: 18m
  completed: 2026-10-08
---

# Phase 16 Plan 12: Docs Knowledge Publishing Integration Summary

Local-first document publish status badges, DocumentSet drawer trigger, and strict offline isolation preserving debounced autosave, CRUD, and BM25 search.

## Overview

Plan 16-12 integrates knowledge publishing state indicators into PlannerMate's Docs interface without coupling application behavior to knowledge daemon availability. The implementation satisfies strict local-first constraints: zero automatic network egress, immediate IndexedDB persistence, separate local save state versus remote projection status, and seamless offline degradation when daemon is absent or failing.

## Tasks Executed

### Task 1: Accessible document publish badges across list and editor

- **RED Commit**: `7b11898` (`test(16-12): add failing tests for publish badges`)
  - Created `tests/knowledge/NotesKnowledgePublishing.test.tsx` verifying the six canonical publish states (`Never published`, `In sync`, `Local changes`, `Publishing`, `Warning`, `Failed`), Vietnamese localization, Ant Design semantic tokens, multi-set priority, accessible tooltip listing every containing set, responsive compact mode (<1100px), list placement before date, and editor placement beside save indicator.
- **GREEN Commit**: `1b28507` (`feat(16-12): add accessible document publish badges`)
  - Created `src/components/knowledge/DocPublishBadge.tsx` implementing `DocPublishBadge` with `aria-label`, accessible tooltips, and width-aware compact mode.
  - Updated `src/components/notes/DocListPane.tsx` to render the badge before the date timestamp.
  - Updated `src/components/notes/DocEditorPane.tsx` to display publish status inside `#doc-editor-status` beside the 500ms debounced autosave indicator.

### Task 2: NotesView DocumentSet trigger, live query, and offline isolation

- **RED Commit**: `8278663` (`test(16-12): add failing tests for offline Docs integration`)
  - Added tests for `NotesView` secondary drawer trigger button, focus restoration, cached status persistence across post-freeze local edits, and `tests/knowledge/offlineIsolation.test.ts` testing zero-egress CRUD, BM25 search, and no-daemon startup.
- **GREEN Commit**: `b14a536` (`feat(16-12): integrate local-first knowledge status in Docs`)
  - Updated `src/views/NotesView.tsx` with secondary `Bộ tài liệu` button in `PageHeader`, `DocumentSetDrawer` integration with focus management, and `useLiveQuery` loading document publish statuses via `getDocumentPublishStatuses`.
  - Ensured `exactOptionalPropertyTypes` compliance across drawer props.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Asynchronous tooltip rendering in Vitest DOM**
- **Found during:** Task 1 GREEN verification
- **Issue:** Ant Design `Tooltip` mounts asynchronously into portal; `screen.getByText` threw before portal rendered.
- **Fix:** Switched assertion to `await screen.findByText` after `mouseOver`.
- **Files modified:** `tests/knowledge/NotesKnowledgePublishing.test.tsx`

**2. [Rule 1 - Bug] Drawer header title DOM element matching**
- **Found during:** Task 2 GREEN verification
- **Issue:** `findByRole('heading', { name: 'Bộ tài liệu xuất bản' })` failed because Drawer title rendered as a `div`.
- **Fix:** Switched selector to `await screen.findByText('Bộ tài liệu xuất bản')`.
- **Files modified:** `tests/knowledge/NotesKnowledgePublishing.test.tsx`

**3. [Rule 3 - Blocking] Missing remark parser type declarations in knowledge-server workspace**
- **Found during:** Root build verification
- **Issue:** Root `npm run build` runs project-wide type checking; `knowledge-server` workspace dependencies were not hydrated in fresh worktree.
- **Fix:** Hydrated dependencies via `npm --prefix knowledge-server ci --legacy-peer-deps`.
- **Files modified:** None (environment workspace hydration).

## Verification

- Targeted test suite: `npm test -- tests/knowledge/NotesKnowledgePublishing.test.tsx tests/knowledge/offlineIsolation.test.ts` passed (14/14 tests).
- Root production build: `npm run build` (`tsc && vite build`) passed with zero errors.
- Verified network egress is 0 for all local document operations and app startup.

## Self-Check: PASSED
- FOUND: `src/components/knowledge/DocPublishBadge.tsx`
- FOUND: `src/components/notes/DocListPane.tsx`
- FOUND: `src/components/notes/DocEditorPane.tsx`
- FOUND: `src/views/NotesView.tsx`
- FOUND: `tests/knowledge/NotesKnowledgePublishing.test.tsx`
- FOUND: `tests/knowledge/offlineIsolation.test.ts`
- FOUND: `.planning/phases/16-knowledge-server-foundation-dlp-checks-ast-ingestion/16-12-SUMMARY.md`
