---
phase: 17-pilot-ontology-deterministic-extraction-neo4j-knowledge-grap
plan: 03
subsystem: knowledge-graph
tags: [neo4j-driver, candidate-merge, conflict-detection, cypher-parameterization, graph-repository]
dependency_graph:
  requires:
    - 17-01
    - 17-02
  provides:
    - knowledge-server/src/graph/candidate.ts
    - knowledge-server/src/graph/graphRepository.ts
    - knowledge-server/src/graph/neo4jRepository.ts
    - knowledge-server/tests/graphCandidate.test.ts
    - knowledge-server/tests/neo4jRepository.test.ts
  affects:
    - knowledge-server/src/routes/graph.ts
    - knowledge-server/src/services/graphBuildService.ts
tech_stack:
  added:
    - "neo4j-driver@6.2.0"
  patterns:
    - Parameterized static Cypher queries with UNWIND $rows batching (no string concatenation)
    - FactKey-based semantic deduplication attaching multiple evidence occurrences to single relation
    - Functional slot conflict detection preserving both contradictory assertions
    - InMemoryGraphRepository for deterministic testing without external Neo4j daemon
key_files:
  created:
    - knowledge-server/src/graph/candidate.ts
    - knowledge-server/src/graph/graphRepository.ts
    - knowledge-server/src/graph/neo4jRepository.ts
    - knowledge-server/tests/graphCandidate.test.ts
    - knowledge-server/tests/neo4jRepository.test.ts
  modified:
    - knowledge-server/package.json
    - knowledge-server/src/types/graphProtocol.ts
decisions:
  - "Verify and install exact neo4j-driver@6.2.0 dependency after human gate"
  - "Map relations to static parameterized query constants preventing Cypher injection"
  - "Preserve both branches of contradictory assertions in functional relation slots as explicit Conflict records"
  - "Calculate normalizedProjectionHash over sorted canonical entity and relation tuples excluding build timestamps"
metrics:
  duration: 6m
  completed_date: "2026-10-10"
---

# Phase 17 Plan 03: Candidate Merge Engine, Conflict Detection & Neo4j Repository Summary

Installed `neo4j-driver@6.2.0`, built the candidate merge engine with factKey deduplication and functional conflict detection, and implemented parameterized Neo4j and in-memory repository adapters.

## Key Changes

1. **Package Dependency Installed (`knowledge-server/package.json`)**
   - Verified legitimacy of `neo4j-driver@6.2.0` per blocking human checkpoint.
   - Installed exact version `6.2.0` with 0 vulnerabilities.

2. **Graph Candidate Merge Engine (`knowledge-server/src/graph/candidate.ts`)**
   - `mergeFactsDeterministicFirst`: merges deterministic facts and validated inferred candidates.
   - Deduplicates facts via `factKey` so repeated statements link multiple `GraphEvidenceRecord` occurrences without duplicating domain edges.
   - Evaluates functional conflicts (`HAS_STATUS` and functional slots) per D-12: conflicting object targets generate `GraphConflictRecord` with both branches preserved.
   - Overlays exact `GraphApprovalRecord` entries upgrading effective classification to `BUSINESS_APPROVED` per D-18/D-19.
   - `computeNormalizedProjectionHash`: deterministic SHA-256 over sorted canonical tuples of entities and relations.

3. **Repository Abstractions & Neo4j Bolt Adapter (`graphRepository.ts`, `neo4jRepository.ts`)**
   - `GraphRepository` interface defining `writeCandidate`, `activateCandidate`, `getActiveGraph`, `getFacts`, and `getQuarantines`.
   - `InMemoryGraphRepository` for lightweight and isolated test execution.
   - `Neo4jRepository` using official `neo4j-driver`:
     - 100% parameterized static Cypher queries via `CYPHER_QUERIES` and `STATIC_RELATION_WRITERS`.
     - `UNWIND $rows AS row` batch insertion for nodes, facts, relationships, evidence, and conflicts.
     - Uniqueness constraints for `Entity(instanceKey)`, `Fact(instanceKey)`, `GraphSnapshot(graphSnapshotId)`.
     - Atomic set pointer activation switching `ACTIVE_GRAPH` relationship to candidate snapshot.

4. **Unit Test Suites (`graphCandidate.test.ts`, `neo4jRepository.test.ts`)**
   - 4 tests in `graphCandidate.test.ts` verifying evidence attachment deduplication, direct contradiction preservation, approval overlay, and hash stability.
   - 3 tests in `neo4jRepository.test.ts` verifying static Cypher templates, in-memory repository lifecycle, and Neo4j driver parameterization.
   - 7/7 tests passed with zero TypeScript errors.

## Verification

- `npm --prefix knowledge-server exec tsc --noEmit` passed with 0 errors.
- `npm --prefix knowledge-server test -- tests/graphCandidate.test.ts tests/neo4jRepository.test.ts` passed (7/7 tests).
- Full test suite `npm --prefix knowledge-server test` passed (13 test files, 88/88 tests).

## Deviations from Plan

None - plan executed exactly as specified.
