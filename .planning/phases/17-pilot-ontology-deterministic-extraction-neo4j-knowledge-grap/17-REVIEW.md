---
phase: 17-pilot-ontology-deterministic-extraction-neo4j-knowledge-grap
reviewed: 2026-10-10T16:04:00Z
depth: standard
files_reviewed: 28
findings:
  critical: 0
  warning: 2
  info: 1
  total: 3
status: issues_found
---

# Phase 17: Code Review Report

**Reviewed:** 2026-10-10T16:04:00Z
**Depth:** standard
**Files Reviewed:** 28
**Status:** issues_found

## Summary

Phase 17 architecture implements deterministic extraction, closed ontology, collision-safe composite URNs, strict DTO validation, and atomic graph pointer activation. Plan 17-06 fixes the status request loop and failed-rebuild success masking.

Review found two production Neo4j persistence/status warnings and one informational timestamp issue. Findings are advisory for execution flow.

## Warnings

### WR-01: Neo4j active graph status hardcodes summary counts to zero

**File:** `knowledge-server/src/graph/neo4jRepository.ts:459`

**Issue:** `Neo4jRepository.getActiveGraph` returns `0` for node, relation, fact, conflict, quarantine, and approved-fact counts. Real Neo4j-backed `GET /graph/status` therefore displays zero metrics and cannot derive `Active with warnings` from stored conflicts.

**Failure scenario:** Build and activate a non-empty candidate through `Neo4jRepository`, then request graph status. Snapshot ID is correct, but UI receives zero nodes, facts, evidence, conflicts, and quarantines.

**Fix:** Persist candidate counts on `GraphSnapshot` during `writeCandidate`, then return those properties from `GET_ACTIVE_GRAPH`, converting Neo4j integers safely.

### WR-02: Neo4j quarantine records disappear after daemon restart

**File:** `knowledge-server/src/graph/neo4jRepository.ts:253`

**Issue:** `quarantinesBySnapshot` is an in-memory `Map` while graph entities, facts, evidence, and conflicts are persisted to Neo4j.

**Failure scenario:** Build a graph containing quarantined identifiers, restart Knowledge Server, then inspect quarantine for active graph. Active graph remains in Neo4j, but quarantine response becomes empty.

**Fix:** Persist quarantine records in Neo4j under graph snapshot identity, or persist them durably with snapshot artifacts and reload them on startup.

## Info

### IN-01: Deterministic evidence uses fixed observed timestamp

**File:** `knowledge-server/src/graph/extraction.ts:131`

**Issue:** Deterministic evidence uses hardcoded `observedAt: '2026-10-10T00:00:00.000Z'` rather than extraction-run or source-snapshot time.

**Fix:** Pass one reproducible snapshot timestamp through extraction context.

## Verified Fixes from Plan 17-06

- `DocumentSetDrawer` memoizes `KnowledgeClient`; graph status effect no longer loops on state updates.
- Failed rebuild remains terminal even with prior active graph metadata.
- Client does not emit success toast for `Failed`.
- Server and browser graph error schemas are strict and bounded.
- Stored raw build errors are mapped to allow-listed codes and fixed safe messages.

---
_Reviewed: 2026-10-10T16:04:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
