---
phase: 19-grounded-assistant-provenance-citations-offline-fallback
plan: 02
subsystem: api
tags: [zod, retrieval, grounded-ai, provenance, json-schema]

requires:
  - phase: 19-01
    provides: Server retrieval provenance, ordered paths, immutable source identity, and scope proof contracts
  - phase: 18-multi-modal-hybrid-retrieval-engine
    provides: Authenticated knowledge client and per-set retrieval envelope
provides:
  - Browser-safe strict mirror of retrieval, path, source, conflict, modality, and federation contracts
  - Authenticated per-set and federated retrieval methods with typed timeout and abort errors
  - Strict grounded answer and persisted grounding schemas with authority correlation
  - OpenAI-compatible JSON Schema generated from GroundedAnswerSchema
  - Focused trust-boundary regression tests
affects: [19-04, 19-07, 19-08, 19-09, 19-10, 19-12, grounded-synthesis, citation-ui]

tech-stack:
  added: []
  patterns: [strict Zod trust boundary, browser/server protocol mirror, typed transport taxonomy, authority-correlated persistence]

key-files:
  created:
    - src/services/knowledge/retrievalProtocol.ts
    - src/services/ai/groundedAnswerSchemas.ts
    - tests/ai/groundedAnswerSchemas.test.ts
  modified:
    - src/services/knowledge/knowledgeClient.ts
    - tests/knowledge/knowledgeClient.test.ts

key-decisions:
  - "Browser retrieval schemas are re-declared locally instead of importing server modules, preserving bundle isolation."
  - "Local citations use explicit LOCAL evidence class and null immutable snapshot fields; server citations require snapshot ID and published content hash."
  - "Local fallback may retain modality-attempt diagnostics but cannot persist server paths, conflicts, scope, or router authority."

patterns-established:
  - "Trust-boundary parsing: validate request bodies before send and strict-safeParse every daemon response."
  - "Grounded persistence: correlate authority with citation provenance and nullable server-only metadata."

requirements-completed: [ANSWER-01, ANSWER-02, ANSWER-03, ANSWER-05]

duration: 22m
completed: 2026-10-11
---

# Phase 19 Plan 02: Browser Grounding Trust Boundary Summary

**Strict browser retrieval mirrors, typed daemon failure taxonomy, and authority-safe grounded answer contracts now reject malformed remote and model output before use.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-10-11T09:38:59Z
- **Completed:** 2026-10-11T10:01:07Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Mirrored Phase 19 retrieval provenance into browser-safe strict Zod schemas, including ordered paths, immutable source records, scope proof, conflict groups, and bounded federated retrieval envelopes.
- Added `retrieve()` and `retrieveFederated()` while preserving bearer auth, route allowlisting, token redaction, and existing client signatures.
- Distinguished `NETWORK_ERROR`, `INVALID_RESPONSE`, `REMOTE_ERROR`, `TIMEOUT`, and `ABORTED` at knowledge-server boundary.
- Added grounded answer, citation, path, conflict, and persisted message schemas with direct/inferred claim rules and local/server authority correlation.
- Exported `GroundedAnswerJsonSchema` through `z.toJSONSchema` with closed top-level and nested claim objects.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create browser retrievalProtocol mirror and extend knowledgeClient** - `bd2c403` (feat)
2. **Task 2: Create groundedAnswerSchemas with structured JSON Schema export** - `5c6d2d5` (feat)

## Files Created/Modified

- `src/services/knowledge/retrievalProtocol.ts` - Browser-only strict retrieval and federated protocol contracts.
- `src/services/knowledge/knowledgeClient.ts` - Validated retrieval calls and timeout/abort taxonomy.
- `src/services/ai/groundedAnswerSchemas.ts` - Structured model output and persisted provenance contracts.
- `tests/knowledge/knowledgeClient.test.ts` - Per-set/federated route, malformed response, timeout, abort, and redaction coverage.
- `tests/ai/groundedAnswerSchemas.test.ts` - Claim/path, citation ID, authority, fallback, and JSON Schema coverage.

## Decisions Made

- Re-declared graph primitives in browser protocol mirror because importing `knowledge-server` would violate browser bundle isolation.
- Added explicit federated request/response contracts from locked Phase 19 plan fields because server Plan 04 consumes these shapes after this browser foundation.
- Represented local citation classification as `LOCAL`, outside server evidence classifications, preventing current-local evidence from gaining observed/inferred/business-approved authority.
- Kept local modality diagnostics nullable-but-allowed so fallback can record attempted modality state without persisting server-only paths or scope.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added federated schemas absent from completed server Plan 01 contract**
- **Found during:** Task 1 (browser retrieval protocol mirror)
- **Issue:** Plan required `FederatedRetrievalRequestSchema` and `FederatedRetrievalResponseSchema`, but server protocol had not yet defined them; blind copying could not satisfy client API or later Plan 04 contract.
- **Fix:** Added minimum strict bounded federation schemas using locked tier, role-group, budget, snapshot, and coverage-warning fields from Phase 19 plans.
- **Files modified:** `src/services/knowledge/retrievalProtocol.ts`
- **Verification:** Targeted client tests and strict response parsing passed.
- **Committed in:** `bd2c403`

**2. [Rule 1 - Bug] Fixed container-level Zod issue path typing**
- **Found during:** Task 2 TypeScript verification
- **Issue:** Wrapping `RefinementCtx.addIssue` with spread syntax failed under Zod 4 issue union typing.
- **Fix:** Passed an explicit path prefix into shared claim validation instead of wrapping refinement context.
- **Files modified:** `src/services/ai/groundedAnswerSchemas.ts`
- **Verification:** Grounded schema tests passed after fix; subsequent TypeScript output contained no task-file errors before environment timeout.
- **Committed in:** `5c6d2d5`

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 bug)
**Impact on plan:** Both fixes were required for contract completeness and strict compilation; no UI or runtime orchestration added.

## Issues Encountered

- Assigned worktree initially ended at Phase 18. Fast-forwarded to completed Plan 19-01 branch before edits.
- Worktree lacked installed dependencies. Targeted Vitest runs reused repository-root dependencies without package installation.
- Full `tsc --noEmit` first exposed pre-existing unresolved knowledge-server parser dependencies (`unified`, `remark-parse`, `remark-gfm`, `mdast`, `mdast-util-to-string`). Linking server dependencies removed that blocker, but full check exceeded bounded execution time. Targeted tests compile all changed modules and passed; no changed-file TypeScript errors remained in captured compiler output.

## Verification

- `npm test -- tests/knowledge/knowledgeClient.test.ts tests/ai/groundedAnswerSchemas.test.ts` passed: 2 files, 32 tests.
- Acceptance counts: `RetrievalResponseSchema` 6, `retrieve(` 1, `retrieveFederated` 1, `superRefine` 6, `toJSONSchema` 1.
- `git diff --check 91c04ef..HEAD` passed.
- No runtime dependency added.

## Known Stubs

None.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: remote-response-validation | `src/services/knowledge/retrievalProtocol.ts` | New daemon JSON boundary validates strict retrieval and federation envelopes, snapshot identities, and path closure. |
| threat_flag: model-output-validation | `src/services/ai/groundedAnswerSchemas.ts` | New 9router structured-output boundary constrains model claim IDs, citation IDs, and path IDs before persistence. |

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 19-04 can implement server federation against browser-compatible tier, role-group, budget, and response contracts.
- Plans 19-07 through 19-12 can consume grounded answer, citation, path, conflict, modality, and persistence types.
- Full repository type-check remains environment-bound by dependency layout and duration; targeted trust-boundary suites are green.

## Self-Check: PASSED

- All five created/modified implementation and test files exist.
- Task commits `bd2c403` and `5c6d2d5` exist in git history.
- Targeted verification passed with 32 tests.
- `STATE.md` and `ROADMAP.md` unchanged by Plan 02 commits.

---
*Phase: 19-grounded-assistant-provenance-citations-offline-fallback*
*Completed: 2026-10-11*
