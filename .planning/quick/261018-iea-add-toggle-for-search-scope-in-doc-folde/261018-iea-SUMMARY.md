# Quick Task 261018-iea: Add Search Scope Toggle in DocFolderTree Summary

**Plan:** `261018-iea`
**Date:** 2026-10-18
**Subsystem:** Documentation & Notes (`src/components/notes/DocFolderTree.tsx`)

## Overview

Added an Ant Design Segmented search scope toggle control ("Tất cả" vs "Thư mục hiện tại") to `DocFolderTree`. Allows users searching with BM25 worker search to constrain search results either globally across the vault or strictly within the active folder hierarchy (including nested subfolders) and active special categories (`root_docs`, `quick_notes`, `pinned`, `trash`).

## Key Changes

1. **Search Scope Toggle UI & State:**
   - Added `searchScope` state (`'all' | 'folder'`) defaulting to `'all'`.
   - Rendered Ant Design `Segmented` control beneath the BM25 search input with responsive styling and tooltip showing the active folder/category name.
2. **Descendant Hierarchy & Scoped Filtering:**
   - Memoized `activeScopeInfo` computing recursive descendant folder IDs for folder entities and identifying active special categories.
   - Filtered `searchResults` when `searchScope === 'folder'` to include only documents belonging to the descendant folder IDs or the active special filter.
   - Added scope header indicator in `KẾT QUẢ TÌM KIẾM ({count}) • {name}` when scoped.
3. **Automated Unit Testing:**
   - Added comprehensive tests in `tests/components/notes/DocFolderTree.test.tsx` verifying toggle options, cross-folder matching in `all` scope, and constrained matching in `folder` scope including nested subfolders.

## Verification

- `tests/components/notes/DocFolderTree.test.tsx`: 11 passed (11 total)
- `tests/views/NotesView.test.tsx`: 9 passed (9 total)

## Commits

- `09ad259`: `feat(quick-261018-iea): add search scope toggle and scoped filtering to DocFolderTree`
- `2580aa5`: `test(quick-261018-iea): add unit tests for search scope toggle and filtered search`

## Self-Check: PASSED
- [x] File `src/components/notes/DocFolderTree.tsx` updated and committed
- [x] File `tests/components/notes/DocFolderTree.test.tsx` updated and committed
- [x] All tests passing cleanly
