# Phase 31 Plan 04: Exemplar and Witness Tests Summary

**Exemplar and witness test suite proving convention-following behavior and conflict-surfacing enforcement (SDLC-CONV-06, D-14, D-15)**

## Key Accomplishments

1. **Exemplar Observance Tests (D-14):**
   - Implemented automated verification ensuring organization standard (`ResponseEnvelope<T>` and `correlationId`) is populated into the SOLUTION prompt conventions segment and system prompt without user turn mentioning either.
   - Tested both Q&A and full artifact generation (`SOLUTION.md`) turns.

2. **Conflict Witness Tests (D-15):**
   - Verified that conflicting conventions between Global (`INFO` level logging) and Repository (`DEBUG` level logging) are both preserved with explicit source headers (`[GLOBAL CONVENTIONS - QUY ƯỚC CHUNG TỔ CHỨC]` and `[REPOSITORY CONVENTIONS - CONVENTIONS.md]`).
   - Confirmed `CONVENTIONS_CONFLICT_POLICY` precedes convention documents and forbids silent choice by AI.

3. **Untrusted Data Boundary & Injection Resilience (T-31-10, T-31-11):**
   - Asserted that conventions are enclosed by `[QUY ƯỚC TỔ CHỨC — DỮ LIỆU KHÔNG TIN CẬY]` and `[HẾT QUY ƯỚC TỔ CHỨC]`.
   - Verified malicious instructions inside convention strings are bounded within delimiters and cannot override `SHARED_EVIDENCE_POLICY`.

4. **Zero-Regression Scoped Test Suite:**
   - Empty/absent conventions omit the conventions block cleanly without header residue.
   - Global-only, Repo-only (with/without path) configurations compile cleanly.
   - Scoped suite (`tests/ai/sdlcConventionsExemplar.test.ts`, `tests/ai/sdlcPromptComposer.test.ts`, `tests/services/conventionService.test.ts`) executed 49 tests across 3 suites with 100% pass rate.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

```bash
npx vitest run tests/ai/sdlcConventionsExemplar.test.ts tests/ai/sdlcPromptComposer.test.ts tests/services/conventionService.test.ts
```
Results: 3 test files passed, 49 tests passed, 0 failures.

## Self-Check: PASSED

- FOUND: `tests/ai/sdlcConventionsExemplar.test.ts`
- FOUND commit `7f9449be`: `test(31-04): add exemplar and conflict witness tests for conventions`
