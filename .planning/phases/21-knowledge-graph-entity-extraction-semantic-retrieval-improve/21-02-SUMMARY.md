# Phase 21 Plan 02: Prompt & Template Standardization Summary

Standardized AI knowledge document prompt and recommended template to stop artificial STEP_ID generation and adopt the THU_TU / TEN_BUOC / TARGET / WRITES / GHI_CHU table structure with backtick code identifiers.

## Key Changes

1. **Prompt Optimization in `src/views/NotesView.tsx` (`AI_KNOWLEDGE_DOC_PROMPT`):**
   - Removed rule requiring `STEP_ID` / `MA_BUOC` as first column for execution tables.
   - Clarified roles of columns:
     - `THU_TU` / `ORDER`: Sequential flow number for `PRECEDES` relations.
     - `TEN_BUOC` / `PROCEDURE`: Human-readable action name providing canonical step identity.
     - `TARGET`: Procedure or downstream process invoked (`CALLS` / `INVOKES`).
     - `WRITES` / `GHI` / `TARGET_TABLE`: Database table modified (`WRITES_TO`).
     - `GHI_CHU`: Additional notes and descriptions.
   - Explicit prohibition against inventing dummy step codes like `STEP_01` / `STEP_02` unless source documentation explicitly defines legacy IDs.
   - Mandated enclosing database tables and procedures in code backticks (e.g. \`MAIN1.TBL_PAYMENT_LOG\`).

2. **Template Modernization in `src/views/NotesView.tsx` (`RECOMMENDED_DOC_TEMPLATE`):**
   - Standardized table header to `| THU_TU | TEN_BUOC | TARGET | WRITES | GHI_CHU |`.
   - Updated template examples with real database and package procedure references wrapped in backticks.

3. **Normalization Guidance in `src/components/notes/NormalizeDocModal.tsx`:**
   - Updated AI user prompt instructions to align with standard step table structure and backtick code conventions.

4. **Testing Verification in `tests/components/notes/NormalizeDocModal.test.tsx`:**
   - Added unit test asserting prompt payload forwarding contains modernized columns and prohibitions.
   - All 5 tests passing.

## Verification

- Automated test run: `npm test -- tests/components/notes/NormalizeDocModal.test.tsx` (5 passed).
- TypeScript check: `npx tsc --noEmit` passed.

## Self-Check: PASSED
- [x] src/views/NotesView.tsx updated and compiles cleanly.
- [x] src/components/notes/NormalizeDocModal.tsx updated.
- [x] tests/components/notes/NormalizeDocModal.test.tsx passes with 5/5 tests.
- [x] Commit hash: d6717b8
