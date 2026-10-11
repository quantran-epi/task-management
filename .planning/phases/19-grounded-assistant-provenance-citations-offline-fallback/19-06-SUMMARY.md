---
phase: 19-grounded-assistant-provenance-citations-offline-fallback
plan: 06
subsystem: search
tags: [bm25, local-retrieval, offline-fallback, grounded-assistant]
requires:
  - 19-02 (offline fallback requirements and citation types)
provides:
  - runLocalGroundedRetrieval scoped BM25 engine
  - LocalEvidenceRange with exact lines, offsets, and content hash
  - strongEvidenceVerdict deterministic check
affects:
  - AIChatDrawer offline grounded fallback
  - QuickPreviewDrawer exact-range highlighting
tech-stack:
  added: []
  patterns:
    - Scoped lexical search bounded strictly by resolved set membership (D-37)
    - Deterministic line window and character offset mapping
    - SHA-256 normalized Markdown content hashing for UI mismatch detection (D-10)
key-files:
  created:
    - src/services/search/localGroundedRetrieval.ts
    - tests/search/localGroundedRetrieval.test.ts
  modified: []
decisions:
  - "Scoped BM25 strictly restricts corpus to current local document members of resolved sets; empty resolved sets returns empty immediately without scanning global drafts (D-37)."
  - "Each result returns LocalEvidenceRange with lineStart, lineEnd, startOffset, endOffset, rawSnippet, and normalized contentHash for exact [L#] navigation (D-21, D-42)."
  - "Documents belonging to multiple resolved sets are deduplicated into a single evidence range with combined setMemberships list (D-39)."
  - "Deterministic strongEvidence verdict requires top score > 0 and (>=2 distinct matched query terms OR exact title token match) (D-38)."
metrics:
  duration: 10m
  completed: 2026-10-11
---

# Phase 19 Plan 06: Scoped Offline Local Grounded Retrieval Summary

Scoped offline BM25 fallback engine restricting corpus to resolved document sets and emitting line-ranged snippets with normalized content hashes and set memberships.

## Implementation Details

- **Scoped Corpus Restriction (`runLocalGroundedRetrieval`)**:
  - Implemented in `src/services/search/localGroundedRetrieval.ts`.
  - Reuses existing `tokenize` and `rankBM25` functions from `src/utils/bm25.ts`.
  - Accepts `resolvedSetIds`; queries `deps.loadSetMembers` and resolves canonical notes only for members of resolved sets.
  - Guard ensures empty `resolvedSetIds` returns zero results immediately, never falling back to a global document scan (D-37, T-19-17).
  - Handles missing/deleted notes gracefully without fabricating results.

- **Exact Range & Offset Computation**:
  - Finds highest-scoring line window (centered near match density, up to 6 lines) and captures nearest Markdown section anchor (`# ...`).
  - Computes exact 1-based `lineStart`/`lineEnd` and running character `startOffset`/`endOffset`.
  - Binds snippet substring to `[startOffset, endOffset]`, respecting `maxSnippetChars`.
  - Computes `contentHash` via `computeSha256(normalizeMarkdownForHash(body))` from `documentSetRepo.ts` for UI drift detection (D-10).

- **Multi-set Deduplication**:
  - Deduplicates records by `(documentId, lineStart, lineEnd)` and combines `setMemberships` into `{ setId, setName }[]` (D-39).

- **Deterministic Strong-vs-Weak Verdict**:
  - Helper `strongEvidenceVerdict` and `isStrongEvidence` evaluate whether evidence is strong enough for synthesis or should fall back to ranked list.
  - Requires top BM25 score > 0 and either ≥ 2 distinct matched query tokens or exact match with title tokens (D-38).

## Test Verification

12 Vitest cases passing in `tests/search/localGroundedRetrieval.test.ts`:
1. Scope restriction (only resolvedSetIds members scanned).
2. Empty scope guard (returns empty, skips member loading).
3. Range accuracy (verifies line numbers, section anchor, and snippet content).
4. Offset accuracy (exact substring slice match).
5. Dedup across multi-set memberships (D-39).
6. Strong evidence verdict (multiple term matches).
7. Weak evidence verdict (isolated body term match).
8. Content hash matching `computeSha256(normalizeMarkdownForHash(body))`.
9. Vietnamese diacritic normalization (accents matching unaccented query).
10. MaxResults bounding (top scores preserved).
11. Snippet cap adherence (`endOffset - startOffset <= maxSnippetChars`).
12. Missing document handling (no crashing on missing notes).

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- `src/services/search/localGroundedRetrieval.ts`: FOUND
- `tests/search/localGroundedRetrieval.test.ts`: FOUND
- Commit `3f8d61f`: FOUND
- Commit `b8abe84`: FOUND
