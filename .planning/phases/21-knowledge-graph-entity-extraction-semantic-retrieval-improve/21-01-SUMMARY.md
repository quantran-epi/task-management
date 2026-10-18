# Phase 21 Plan 01: Enhanced Step Names, WRITES_TO Relations, and Code Spans Extraction Summary

- Phase: 21-knowledge-graph-entity-extraction-semantic-retrieval-improve
- Plan: 01
- Subsystem: knowledge-server (graph extraction)
- Tags: graph, extraction, AST, process-step, writes-to, code-spans
- Key Files Modified:
  - `knowledge-server/src/graph/extraction.ts`
  - `knowledge-server/tests/deterministicExtraction.test.ts`
  - `knowledge-server/tests/generalDocumentExtraction.test.ts`
- Commit: `a76eebd`

## Execution Overview

Upgraded deterministic graph extraction in `knowledge-server/src/graph/extraction.ts`:
1. **ProcessStep Canonical Name & Aliases**:
   - `handleStepTable` now extracts natural business names (`TEN_BUOC`, `PROCEDURE_NAME`, `NAME`) directly into `canonicalName`.
   - Populates `aliases` with `rawStepId`, `canonicalName`, and NFD-normalized diacritic-free lowercase variants (e.g. `'khoi tao giao dich'`).
   - Supports tables that omit `STEP_ID` columns by routing via `orderIdx` (`THU_TU`).
2. **Database Object & WRITES_TO Extraction**:
   - Parses `WRITES` (`GHI`, `WRITES_TO`) columns in step tables.
   - Creates `DatabaseObject` entities with normalized technical identifiers (defaulting schema to `MAIN1`).
   - Emits `WRITES_TO` fact assertions from the `ProcessStep` (and invoked `SoftwareComponent` if present) to the target table with `operation: 'INSERT' | 'UPDATE'`.
3. **Code Blocks and Inline Code Spans Extraction**:
   - AST traversal parses code blocks (SQL, PL/SQL) and inline code spans.
   - Extracts Oracle tables (`TBL_[A-Z0-9_]+` and `SCHEMA.TBL_[A-Z0-9_]+`) into `DatabaseObject` nodes.
   - Extracts PL/SQL packages/procedures (`[A-Z0-9_]+PKG` or `[A-Z0-9_]+_PKG.[A-Z0-9_]+`) into `SoftwareComponent` nodes.
4. **Test Verification**:
   - 17 unit tests pass cleanly across `deterministicExtraction.test.ts` and `generalDocumentExtraction.test.ts`.

## Deviations from Plan

### Auto-fixed Issues
**1. [Rule 1 - Bug] Table schema detection false positive on `Ý nghĩa` column**
- **Found during:** Task 3 verification
- **Issue:** Regex `/GHI/` in `writesIdx` matched `"Y_NGHIA"` (`Ý nghĩa`), treating normal dictionary column tables as dispatch/write tables instead of data object tables.
- **Fix:** Refined `writesIdx` patterns with explicit start/end boundaries (`/^WRITES$/`, `/^GHI$/`, `/^GHI_VAO$/`, `/TARGET_TABLE/`, `/BANG_DICH/`).
- **Files modified:** `knowledge-server/src/graph/extraction.ts`
- **Commit:** `a76eebd`

## Self-Check: PASSED
- `knowledge-server/src/graph/extraction.ts`: FOUND
- `knowledge-server/tests/deterministicExtraction.test.ts`: FOUND
- `knowledge-server/tests/generalDocumentExtraction.test.ts`: FOUND
- Commit `a76eebd`: FOUND
