# Quick Task 261016-scn: Fix AI scope chips, citation modal width/table layout, and docs navigation

**Quick Task ID:** 261016-scn
**Slug:** fix-ai-scope-chips-citation-modal-docs-navigation
**Date:** 2026-10-16

## Goal
1. Hide `ScopeChipsBar` ("Đang tra cứu: Mặc định") when routed scope has no meaningful custom facets, avoiding duplicate confusion with chat context.
2. Expand `QuickPreviewDrawer` width (`min(1240px, 94vw)`) and adjust table CSS (`min-width: 100%; width: max-content;`) so tables and data never compress.
3. Fix "Mở trong Docs" button navigation so clicking it closes preview modal, navigates to `#/notes?doc=<id>`, and opens/focuses the document in `NotesView`.

## Tasks
1. **ScopeChipsBar cleanup**:
   - Add `hasMeaningfulRoutedScope` check.
   - Return `null` and omit rendering in `AIChatDrawer` when only default/empty scope.
2. **Citation modal & table sizing**:
   - In `QuickPreviewDrawer.tsx`: increase modal width to `min(1240px, 94vw)`, close preview on "Mở trong Docs".
   - In `src/styles/markdown.css`: update `.markdown-table` to `min-width: 100%; width: max-content;` inside `.markdown-table-wrapper`.
3. **Docs navigation & selection**:
   - In `App.tsx`: pass `params.doc` as `initialDocId` to `<NotesView initialDocId={params.doc} />`.
   - In `NotesView.tsx`: accept `initialDocId`, listen for hash changes with `?doc=`, select document and auto-focus its parent folder in `DocFolderTree`.
4. **Verification**:
   - Run tests for `AIChatDrawer`, `GroundedAnswerCard`, `QuickPreviewDrawer`, and `NotesView`.
