---
phase: 14-knowledge-base-integration-docs-linking-ai-retrieval
plan: 01
subsystem: database-and-search
tags: [dexie, schema-v9, bm25, lexical-search, vietnamese-normalization, knowledge-base]
dependency_graph:
  requires: [SCHEMA_V8, notes-table]
  provides: [SCHEMA_V9, NoteType, BM25Engine, VietnameseNormalization]
  affects: [src/types/models.ts, src/db/schema.ts, src/db/index.ts, src/db/repositories/noteRepo.ts, src/utils/bm25.ts]
tech_stack:
  added: []
  patterns: [Okapi-BM25, NFD-Unicode-Normalization, Soft-Delete-Pattern, Dexie-Non-Destructive-Upgrade]
key_files:
  created:
    - src/utils/bm25.ts
    - tests/db/schemaV9.test.ts
    - tests/utils/bm25.test.ts
  modified:
    - src/types/models.ts
    - src/validation/schemas.ts
    - src/db/schema.ts
    - src/db/index.ts
    - src/db/repositories/noteRepo.ts
decisions:
  - "SCHEMA_V9 indexes note type, parentId, deletedAt, and multi-entry *tags while preserving legacy notes as quick_note with empty tags (D-01, D-02)"
  - "BM25 scoring utility implements Okapi BM25 with Title x3, Tags x2, Body x1 weighting and NFD-based Vietnamese diacritic normalization (D-10, D-11)"
  - "noteRepo provides soft-delete with restore capability and folder-scoped retrieval without data loss (D-17)"
metrics:
  duration: 4m
  completed_date: "2026-10-04"
  tasks_completed: 2
  files_changed: 8
---

# Phase 14 Plan 01: Knowledge Base Data Tier & BM25 Search Engine Summary

Offline-first data tier extension for Knowledge Base with Dexie SCHEMA_V9 migration, soft deletion, and diacritic-insensitive BM25 lexical ranking engine.

## Overview of Work

1. **Model & Validation Schema Extensions:**
   - Extended `Note` interface with `type: 'quick_note' | 'document'`, `parentId?: string`, `tags?: string[]`, `slug?: string`, `deletedAt?: string`.
   - Updated Zod validation schemas (`NoteInputSchema`, `NoteUpdateSchema`, `NoteSchema`) with exact validation limits.

2. **Dexie SCHEMA_V9 Migration:**
   - Exported `SCHEMA_V9` in `src/db/schema.ts` indexing `id, type, parentId, entityType, entityId, isPinned, deletedAt, *tags, createdAt, updatedAt`.
   - Implemented non-destructive upgrade handler in `src/db/index.ts` defaulting legacy notes to `quick_note` with empty tags array.

3. **Repository CRUD Operations:**
   - Updated `createNote` and `updateNote` to accept and persist `type`, `parentId`, `tags`, `slug`, `deletedAt`.
   - Added `softDeleteNote`, `restoreNote`, `permanentDeleteNote`, `getNotesByFolder`, `getTrashNotes`.

4. **BM25 Lexical Ranking Engine:**
   - Built `normalizeVietnamese` using Unicode NFD decomposition to map diacritics and 'đ/Đ' to base Latin characters.
   - Built `tokenize` with DoS-safe regex and minimum token length filtering.
   - Built `rankBM25` implementing Okapi BM25 with Title x3, Tags x2, Body x1 field weighting.
   - Built `extractRelevantSnippet` to retrieve heading-grounded text windows within character budgets for AI context.

## Test Verification

- `tests/db/schemaV9.test.ts` (4 passed): Verifies schema upgrade, index creation, legacy notes compatibility, and soft-delete/restore repository flows.
- `tests/utils/bm25.test.ts` (11 passed): Verifies Vietnamese normalization, tokenization, BM25 weighting, and snippet extraction.
- `tests/views/NotesView.test.tsx` (3 passed): Verifies zero regressions on existing notes view.
- `npm run build`: Production bundle and TypeScript type checking passed without errors.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Vitest failure on tokenize and extractRelevantSnippet edge cases**
- **Found during:** Task 2 implementation
- **Issue:** Test expectation missed token `'do'` in `'Báo cáo #1: Tiến độ dự án'`, and `extractRelevantSnippet` ellipsis exceeded maxChars when text was trimmed without subtracting ellipsis length.
- **Fix:** Corrected token list assertion in test and adjusted `extractRelevantSnippet` truncation to guarantee budget bounds.
- **Files modified:** `src/utils/bm25.ts`, `tests/utils/bm25.test.ts`
- **Commit:** `0fe213c`

**2. [Rule 3 - Blocking Issue] Strict TypeScript unused imports in test file**
- **Found during:** Pre-commit verification (`npm run build`)
- **Issue:** `SCHEMA_V9` and `updateNote` were imported but not directly called in `schemaV9.test.ts`, tripping `TS6133`.
- **Fix:** Removed unused imports.
- **Files modified:** `tests/db/schemaV9.test.ts`
- **Commit:** `31c50b0`

## Known Stubs

None. All functions and data methods are fully implemented.

## Self-Check: PASSED
- `src/types/models.ts`: FOUND
- `src/db/schema.ts`: FOUND
- `src/db/index.ts`: FOUND
- `src/validation/schemas.ts`: FOUND
- `src/db/repositories/noteRepo.ts`: FOUND
- `src/utils/bm25.ts`: FOUND
- `tests/db/schemaV9.test.ts`: FOUND
- `tests/utils/bm25.test.ts`: FOUND
- All commits verified in git history.
