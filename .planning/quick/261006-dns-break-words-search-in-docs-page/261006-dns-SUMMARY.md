---
phase: quick
plan: 261006-dns
status: complete
date: 2026-10-06
requirements:
  - DOCS-BREAK-WORDS-SEARCH
key-files:
  created:
    - src/utils/docSearch.ts
    - tests/utils/docSearch.test.ts
  modified:
    - src/components/notes/DocListPane.tsx
    - src/views/NotesView.tsx
    - src/views/NotesPopoutView.tsx
    - tests/views/NotesView.test.tsx
commits:
  - 8b42919: feat(quick-261006-dns): add matchesDocSearch utility for broken-words search
  - 5350a60: feat(quick-261006-dns): integrate broken-words search into DocListPane, NotesView, and NotesPopoutView
---

# Quick Task 261006-dns: Break Words Search in Docs Page Summary

## Overview

Replaced rigid contiguous substring search (`includes(q)`) in the Docs page, Grid view, and Notes popout view with tokenized broken-words search (`matchesDocSearch`). Users can now search with multiple terms (e.g. "ke hoach api", "design spec 2026") that match across document title, body, tags, attachments, and parent entity names regardless of word order, while supporting Vietnamese diacritic-insensitive matching.

## Key Changes

1. **`src/utils/docSearch.ts` & `tests/utils/docSearch.test.ts`**:
   - Implemented `matchesDocSearch(query, doc, additionalTexts)`:
     - Splits query into words by whitespace `/\s+/`.
     - Collects raw text from `title`, `body`, `tags`, and optional `additionalTexts`.
     - Normalizes text with `normalizeVietnamese` from `bm25.ts`.
     - Validates that every query word matches either raw or diacritic-normalized text.
   - Comprehensive unit test suite covering single word, multi-word broken terms across fields, word order independence, missing terms, and Vietnamese accents.

2. **`src/components/notes/DocListPane.tsx`**:
   - Replaced substring matching in `filteredAndSortedDocs` with `matchesDocSearch(searchTerm, n)`.

3. **`src/views/NotesView.tsx` & `src/views/NotesPopoutView.tsx`**:
   - Updated `filteredGridNotes` in `NotesView` to pass note metadata, attachment texts, and parent entity name into `matchesDocSearch`.
   - Updated `filteredNotes` in `NotesPopoutView` to pass note metadata and attachment texts into `matchesDocSearch`.

4. **`tests/views/NotesView.test.tsx`**:
   - Added integration tests verifying broken words and diacritic-insensitive searches in 3-column Docs and Grid view modes.

## Verification

- `npx vitest run tests/utils/docSearch.test.ts tests/views/NotesView.test.tsx tests/views/NotesPopoutView.test.tsx`: 16 tests passing across 3 test files.
- `npm run build`: Typecheck and Vite production build successful.

## Deviations from Plan

None. Plan executed as specified.
