---
phase: 19-grounded-assistant-provenance-citations-offline-fallback
plan: 07
subsystem: ai
tags: [grounded-ai, evidence-pack, closure-validator, provenance]
requires:
  - phase: 19-02
    provides: Grounded answer schemas and browser retrieval contracts
provides:
  - packEvidence service assigning opaque short IDs and managing context budgets
  - validateGroundedAnswerClosure enforcing provenance closure and D-26 override guards
  - computeWeakestClassification helper for mixed-classification claims
  - claimAssertsOverride helper for Vietnamese and English override terms
affects:
  - 19-08 (grounded synthesis orchestration)
  - 19-11 (claim card and grounded answer rendering)
tech-stack:
  added: []
  patterns:
    - Opaque identifier assignment isolating provenance mapping in application code
    - Strict packing order (conflicts -> identifier hits -> path support -> RRF)
    - Whole-unit truncation dropping over-budget items rather than slicing snippets
    - Deterministic closure validation rejecting model-manufactured claims and citations
key-files:
  created:
    - src/services/ai/evidencePack.ts
    - tests/ai/evidencePack.test.ts
  modified: []
key-decisions:
  - "Pack assigns opaque S#/L# and P# ids; model prompt receives only opaque ids and bounded text without set/snapshot exposure."
  - "Evidence packing follows strict priority: conflict branches first, exact identifier hits second, complete path support third, remainder by rank."
  - "Over-budget citations are dropped as whole units, setting contextTruncated: true and naming dropped category."
  - "Closure validator rejects unknown citations, unlinked paths, conflict branch bias, and unproven supersede/override assertions (D-26)."
patterns-established:
  - "Provenance isolation: application owns scope, snapshot, and document mapping; model sees only short IDs."
  - "D-26 override guard: regex matching Vietnamese ('thay thế', 'ghi đè') and English ('supersedes', 'overrides') requires SUPERSEDES metadata or allowlisted evidenceKind."
requirements-completed: [ANSWER-01, ANSWER-02, ANSWER-03, ANSWER-04]
duration: 12m
completed: 2026-10-11
---

# Phase 19 Plan 07: Evidence Packing and Closure Validation Summary

**Built the pack-and-close layer bridging retrieval and model synthesis with opaque ID assignment, deterministic packing priority, whole-unit budget dropping, and strict post-synthesis closure validation.**

## Implementation Details

- **Evidence Packing (`packEvidence`)**:
  - Implemented in `src/services/ai/evidencePack.ts`.
  - Assigns opaque citation IDs (`S1, S2, ...` for server authority, `L1, L2, ...` for local authority).
  - Deduplicates citations by document ID and line range, merging `setMemberships` across occurrences (D-39).
  - Assigns opaque path IDs (`P1, P2, ...`) for server paths and drops any path whose hop citations were pruned.
  - Enforces packing order:
    1. Conflict-branch citations
    2. Exact identifier/title hits
    3. Path-supporting citations
    4. Remaining ranked items
  - Enforces character and count budgets (`maxEvidenceChars`, `maxPromptEvidenceCount`), dropping whole units and setting `contextTruncated: true` when truncated (D-03).
  - Propagates federated coverage warnings and budget warnings.

- **Closure Validator (`validateGroundedAnswerClosure`)**:
  - Validates all claim citations exist in the evidence pack (D-01).
  - Verifies INFERRED claims reference a validated path with all hops supported (D-02).
  - Verifies DIRECT claims carry null `pathId` (D-30).
  - Rejects claims derived from only one branch of an active conflict group (D-28).
  - Enforces D-26 override-language guard: rejects claim text with override/supersede terms (English and Vietnamese `thay thế`, `ghi đè`) unless backed by `scopeProof.overrideRelation === 'SUPERSEDES'` or allowlisted evidence kinds (`policy_change`, `release_note`, `migration_record`).

- **Helpers**:
  - `computeWeakestClassification`: determines weakest supporting classification for mixed evidence (`LOCAL` < `INFERRED` < `OBSERVED` < `BUSINESS_APPROVED`).
  - `claimAssertsOverride`: Unicode-aware regex check matching Vietnamese and English override terms.

## Verification

Targeted Vitest test suite `tests/ai/evidencePack.test.ts` covering 17 cases:
- Server pack happy path with path closure
- Cross-set deduplication with merged memberships
- Deterministic packing order
- Whole-unit budget dropping and warning emission
- Orphan path pruning
- Unknown citation rejection
- INFERRED claim path requirement enforcement
- DIRECT claim path rejection
- Conflict branch bias detection
- Weakest classification resolution
- Local pack structure
- Federated coverage warning propagation
- D-26 override-language rejection without proof
- D-26 override-language acceptance with SUPERSEDES metadata
- D-26 override-language acceptance with allowlisted evidenceKind
- D-26 Vietnamese token coverage (`thay thế`, `ghi đè`)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Unicode boundary handling in OVERRIDE_TERMS regex**
- **Found during:** Task 1 / Task 2 test run
- **Issue:** Standard ASCII word boundaries `\b` failed to match Vietnamese diacritic words like `ghi đè` and `thay thế` because `đ` and `ế` are non-ASCII word characters.
- **Fix:** Switched to unicode-aware punctuation/boundary matching `(?:^|\P{L})...(?:\P{L}|$)` with the `u` flag.
- **Files modified:** `src/services/ai/evidencePack.ts`
- **Verification:** All Vietnamese and English token tests passed.

## Self-Check: PASSED
- FOUND: src/services/ai/evidencePack.ts
- FOUND: tests/ai/evidencePack.test.ts
- Commit 4ceb7c9: feat(19-07): implement packEvidence and validateGroundedAnswerClosure
- Commit 86e4019: test(19-07): add evidence pack and closure validator test suite
