---
status: complete
date: 2026-10-16
slug: fix-ai-scope-chips-citation-modal-docs-navigation
---

# Quick Task 261016-scn: Fix AI scope chips, citation modal width/table layout, and docs navigation Summary

## Completed Work
1. **ScopeChipsBar cleanup**:
   - Added `hasMeaningfulRoutedScope` in `ScopeChipsBar.tsx` to detect whether routed scope contains actual custom facets (`domain` distinct from 'Mặc định'/'default', `environment`, `version`, or `comparisonMode`).
   - Returns `null` when scope is only default/unspecified, preventing duplicate "Đang tra cứu: Mặc định" banner under chat context bar in `AIChatDrawer.tsx`.
2. **Citation modal & table sizing**:
   - Updated `QuickPreviewDrawer.tsx` modal width from fixed `880px` to `min(1240px, 94vw)` and `maxWidth: '96vw'`.
   - Updated `src/styles/markdown.css` for `.markdown-table` to `min-width: 100%; width: max-content; max-width: none;` inside `.markdown-table-wrapper` with generous cell padding and normal word breaks so tabular data never gets squeezed.
   - Updated "Mở trong Docs" button to automatically dismiss the preview modal upon navigation.
3. **Docs navigation & selection**:
   - Updated `App.tsx` to pass `params.doc` as `initialDocId` to `<NotesView initialDocId={params.doc} />`.
   - Updated `NotesView.tsx` to accept `initialDocId`, synchronize `selectedDocId` on initial render and on `hashchange`, and automatically switch `activeFilter` to the document's parent folder.
4. **Testing**:
   - Added unit tests for `hasMeaningfulRoutedScope` and "Mở trong Docs" navigation/modal dismissal in `tests/ai/CitationChipAndQuickPreview.test.tsx`.
   - Added test for `initialDocId` document focus in `tests/views/NotesView.test.tsx`.
   - Verified TypeScript compilation (`npx tsc --noEmit`) and all related Vitest test suites.
