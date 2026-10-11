---
phase: 19-grounded-assistant-provenance-citations-offline-fallback
plan: 01
subsystem: api
tags: [zod, retrieval, provenance, graph-paths, snapshots]

requires:
  - phase: 18-multi-modal-hybrid-retrieval-engine
    provides: Per-set retrieval protocol, snapshot-pinned items, evidence classifications, and conflict tagging
provides:
  - Strict ordered 1-3 hop graph path contract with citation and snapshot closure
  - Immutable chunk source title and published content hash identity
  - Metadata-only conflict scope proof with controlled dimensions
  - Retrieval protocol invariant regression suite
affects: [19-02, 19-03, 19-04, grounded-synthesis, citation-ui]

tech-stack:
  added: []
  patterns: [strict Zod trust boundary, snapshot-scoped path closure, metadata-only scope proof]

key-files:
  created:
    - knowledge-server/tests/retrievalPathProtocol.test.ts
  modified:
    - knowledge-server/src/types/retrievalProtocol.ts
    - knowledge-server/src/graph/graphRepository.ts
    - knowledge-server/src/graph/neo4jRepository.ts
    - knowledge-server/tests/retrievalProtocol.test.ts

key-decisions:
  - "Path citation IDs resolve only to returned chunk item IDs, making closure deterministic at protocol boundary."
  - "Conflict scope proof permits only structured Version, Environment, Behavior, or Unknown dimensions and no free-text explanation."

patterns-established:
  - "Ordered path closure: node count equals edge count plus one, with classification and citation arrays aligned per hop."
  - "Snapshot isolation: every returned path must match response snapshot ID before server output is trusted."

requirements-completed: [ANSWER-01, ANSWER-02, ANSWER-04]

duration: 18m
completed: 2026-10-11
---

# Phase 19 Plan 01: Retrieval Provenance Protocol Summary

**Strict Zod contracts now preserve immutable source identity, ordered graph paths, citation closure, snapshot isolation, and structured conflict scope.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-10-11T09:10:00Z
- **Completed:** 2026-10-11T09:28:26Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added `OrderedPathSchema`, `SourceRefSchema`, and `ScopeProofSchema` with bounded strict fields and cross-field invariants.
- Extended chunk/repository projections with source document title and lowercase SHA-256 published content hash.
- Added response-level path citation membership and snapshot-isolation checks.
- Added 14 focused tests covering path closure, malformed hashes, missing provenance, citation membership, and conflict scope restrictions.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add ordered paths, source identity, and scope proof** - `89c5f0c` (feat)
2. **Task 2: Cover retrieval path protocol invariants** - `d43f82c` (test)
3. **Task 2 compatibility: Align Phase 18 positive fixtures** - `ac31219` (test)

## Files Created/Modified

- `knowledge-server/src/types/retrievalProtocol.ts` - Strict provenance, path, scope, conflict, and response closure schemas.
- `knowledge-server/src/graph/graphRepository.ts` - Carries title and published document hash from in-memory retrieval generation.
- `knowledge-server/src/graph/neo4jRepository.ts` - Persists and projects title/hash through Neo4j chunk queries.
- `knowledge-server/tests/retrievalPathProtocol.test.ts` - Focused path and source identity protocol tests.
- `knowledge-server/tests/retrievalProtocol.test.ts` - Existing positive fixtures updated for required source identity.

## Decisions Made

- Citation IDs in ordered paths reference returned chunk item IDs because Phase 18 protocol has no nested citation object; this preserves strict closure without adding another redundant citation shape.
- `ConflictGroupSchema` contains stable group ID, controlled dimension, and optional scope proof; conflict branches remain represented by existing tagged retrieval items.
- Existing response fixtures remain additive through defaults for `paths` and `conflictGroups`, while every chunk now requires immutable source title/hash.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Propagated required source identity through retrieval repositories**
- **Found during:** Task 1
- **Issue:** Making chunk title/hash required at boundary left repository outputs unable to satisfy contract.
- **Fix:** Stored document hash with generated chunks and returned title/hash from both in-memory and Neo4j retrieval paths.
- **Files modified:** `knowledge-server/src/graph/graphRepository.ts`, `knowledge-server/src/graph/neo4jRepository.ts`
- **Verification:** Knowledge-server TypeScript build passed.
- **Committed in:** `89c5f0c`

**2. [Rule 1 - Bug] Updated Phase 18 positive fixtures for required provenance**
- **Found during:** Overall regression verification
- **Issue:** Two existing positive chunk fixtures omitted newly required title/hash fields and failed strict parsing.
- **Fix:** Added valid immutable source identity to positive fixtures only.
- **Files modified:** `knowledge-server/tests/retrievalProtocol.test.ts`
- **Verification:** Both targeted protocol suites passed, 39 tests total.
- **Committed in:** `ac31219`

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 bug)
**Impact on plan:** Required contract propagation and fixture compatibility only; no unrelated scope.

## Issues Encountered

- Assigned worktree initially lacked Phase 19 planning commits. Fast-forwarded from `phase-19-grounded-assistant` before edits.
- Worktree had no local dependency directory. Verification used temporary Windows junction to existing installed `knowledge-server/node_modules`, removed after each run; no package install or dependency change.
- Plan referenced pre-existing `ConflictGroupSchema` and nested item citations absent from Phase 18 code. Added minimum strict conflict-group contract and closed path citations against chunk item IDs.

## Verification

- `npm --prefix knowledge-server run build` passed.
- `npm --prefix knowledge-server test -- tests/retrievalPathProtocol.test.ts tests/retrievalProtocol.test.ts` passed: 2 files, 39 tests.
- `safeParse` count: 13; protocol test length: 159 lines.

## Known Stubs

None.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: provenance-validation | `knowledge-server/src/types/retrievalProtocol.ts` | New server response trust boundary validates snapshot-scoped paths, citation membership, hashes, and scope metadata. |

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Browser protocol mirror and grounded answer schemas can consume authoritative server path/source contracts in Plan 19-02.
- Runtime path construction remains intentionally deferred to Wave 2 Plan 19-03.

## Self-Check: PASSED

- All five created/modified implementation and test files exist.
- Task commits `89c5f0c`, `d43f82c`, and `ac31219` exist in git history.
- Targeted build and protocol tests pass.

---
*Phase: 19-grounded-assistant-provenance-citations-offline-fallback*
*Completed: 2026-10-11*
