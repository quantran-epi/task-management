---
phase: 16-knowledge-server-foundation-dlp-checks-ast-ingestion
plan: "06"
subsystem: knowledge-ingestion-preview
tags: [markdown, ast, sha256, immutable-snapshot, change-preview]
requires:
  - phase: 16-02
    provides: Stable document sets and content-free remote cache
  - phase: 16-05
    provides: Isomorphic Markdown chunker and shared hash policy
provides:
  - Exact zero-network document and chunk four-way preview
  - Deeply frozen publish snapshot for later DLP and POST
  - Duplicate-aware reusable content matching with movement metadata
affects: [16-07, 16-09, 16-11, 16-13]
tech-stack:
  added: []
  patterns: [shared isomorphic parser policy, content-free baseline comparison, deep-frozen reviewed payload]
key-files:
  created:
    - src/services/knowledge/changePreview.ts
    - tests/knowledge/changePreview.test.ts
  modified: []
key-decisions:
  - "Match unchanged chunks by documentId plus contentHash queues so duplicate evidence occurrences remain independent."
  - "Represent occurrence movement independently from reusable content identity instead of converting moves into mutations."
patterns-established:
  - "Preview first freezes selected Notes, then all later DLP and transport stages consume that reviewed snapshot."
  - "Cached active comparison data contains IDs, hashes, occurrence ranges, and heading metadata but no Markdown bodies."
requirements-completed: [INGEST-01, INGEST-03, INGEST-04]
duration: 15min
completed: 2026-10-08
---

# Phase 16 Plan 06: Exact Local Change Preview Summary

**Browser-local preview now computes exact added, changed, removed, and unchanged document/chunk deltas from shared AST and SHA-256 policy while freezing reviewed content before any network use.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-10-08T06:55:00Z
- **Completed:** 2026-10-08T07:10:02Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- Built `buildChangePreview` with no network, storage, polling, or daemon route dependency.
- Reused daemon `chunkMarkdownSnapshot` and shared document hash normalization to prevent client/server policy drift.
- Preserved duplicate content occurrences and reported moves without forcing chunk mutations.
- Deep-froze exact set name, title, body, tags, hashes, and generated chunks for later DLP and POST stages.
- Covered four-way deltas, CRLF/CR/LF equivalence, whitespace/case sensitivity, removals, immutability, and post-preview local edits.

## Task Commits

1. **Task 1: Compute exact local document and chunk four-way preview** — `d28113f` (feat)

## Files Created/Modified

- `src/services/knowledge/changePreview.ts` — Browser-compatible frozen snapshot builder and exact four-way classifier.
- `tests/knowledge/changePreview.test.ts` — Six targeted tests for zero-network preview policy and immutable input binding.

## Decisions Made

- Unchanged chunk reuse matches per-document content hashes through queues, preserving equal-content duplicates rather than deduplicating them.
- Movement compares independent occurrence metadata while content remains classified unchanged.
- Missing selected Notes fail closed before preview rather than silently omitting publish-set members.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected duplicate-movement fixture to use byte-identical chunks**
- **Found during:** Task 1 targeted test run
- **Issue:** Initial fixture changed heading text, so chunk hashes correctly differed and could not prove reusable duplicate identity.
- **Fix:** Used repeated byte-identical sections and inserted a preceding section to shift both occurrence ranges.
- **Files modified:** `tests/knowledge/changePreview.test.ts`
- **Verification:** `npm test -- tests/knowledge/changePreview.test.ts` passes 6/6 tests.
- **Committed in:** `d28113f`

---

**Total deviations:** 1 auto-fixed bug in test evidence. **Impact on plan:** No scope change; fixture now proves intended D-24 behavior.

## Issues Encountered

- Two isolated executor attempts failed before edits: one malformed HTTP 200 response, then one stale worktree base. User approved inline execution against current checkout.

## User Setup Required

None - no external service configuration required.

## Verification

- `npm test -- tests/knowledge/changePreview.test.ts` — 6/6 passed.
- `npm run build` — TypeScript and Vite production build passed; only existing bundle-size/dynamic-import warnings remained.
- Production source static assertion rejects `fetch`, knowledge client, polling, and server route dependencies.

## Self-Check: PASSED

- `src/services/knowledge/changePreview.ts` exists.
- `tests/knowledge/changePreview.test.ts` exists.
- Commit `d28113f` exists.
- Task acceptance criteria and plan-level verification pass.

## Next Phase Readiness

Plan 16-07 can consume exact frozen snapshot and delta output for idempotent incremental projection and atomic activation.

---
*Phase: 16-knowledge-server-foundation-dlp-checks-ast-ingestion*
*Completed: 2026-10-08*
