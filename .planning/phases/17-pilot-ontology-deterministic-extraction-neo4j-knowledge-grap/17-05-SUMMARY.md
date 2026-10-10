---
phase: 17-pilot-ontology-deterministic-extraction-neo4j-knowledge-grap
plan: 05
subsystem: knowledge-graph
tags: [snapshot-persistence, rebuild-orchestration, atomic-promotion, pilot-acceptance, offline-isolation]
dependency_graph:
  requires:
    - 17-04
  provides:
    - knowledge-server/src/indexing/snapshotStore.ts
    - knowledge-server/src/services/graphBuildService.ts
    - knowledge-server/tests/graphRebuild.test.ts
    - knowledge-server/tests/pilotAcceptance.test.ts
    - tests/knowledge/offlineIsolation.test.ts
  affects:
    - knowledge-server/src/graph/candidate.ts
    - knowledge-server/src/graph/extraction.ts
    - knowledge-server/src/routes/graph.ts
    - knowledge-server/src/server.ts
tech_stack:
  added: []
  patterns:
    - Durable snapshot persistence using atomic tmp file write and rename
    - Isolated human approval ledger persistence surviving graph wipes
    - Pipeline stages: Preparing -> Structured extraction -> Prose extraction -> Validation -> Activation
    - Single Neo4j transaction atomic pointer swap with previous graph preserved on failure
    - Stale-source guard preventing outdated candidate activation
    - Retaining approved facts with sourceMissing=true and BUSINESS_APPROVED classification upon source removal
key_files:
  created:
    - knowledge-server/src/services/graphBuildService.ts
    - knowledge-server/tests/graphRebuild.test.ts
  modified:
    - knowledge-server/src/indexing/snapshotStore.ts
    - knowledge-server/src/graph/candidate.ts
    - knowledge-server/src/graph/extraction.ts
    - knowledge-server/src/routes/graph.ts
    - knowledge-server/src/server.ts
    - knowledge-server/tests/pilotAcceptance.test.ts
    - tests/knowledge/offlineIsolation.test.ts
decisions:
  - "Durably persist published Markdown snapshots and human approvals to disk using atomic .tmp rename pattern"
  - "Orchestrate rebuild pipeline with stale-source guard ensuring sourceSnapshotId matches before activation"
  - "Preserve approved facts as sourceMissing=true and BUSINESS_APPROVED when source evidence disappears (D-20)"
  - "Execute atomic pointer swap in single Neo4j transaction ensuring failure leaves prior active graph untouched"
metrics:
  duration: 9m
  completed_date: "2026-10-10"
---

# Phase 17 Plan 05: Durable Snapshot Persistence, Rebuild Service & Pilot Acceptance Summary

Implemented durable published snapshot and approval storage, graph build orchestration pipeline with atomic promotion and failure isolation, full end-to-end pilot acceptance tests against real process 60000006 corpus, and offline isolation tests.

## Key Changes

1. **Durable Snapshot & Approval Storage (`knowledge-server/src/indexing/snapshotStore.ts`)**
   - File-backed storage option using atomic write (`.tmp` write then `renameSync`).
   - Persists active snapshots per `setId` so published documents survive daemon restarts.
   - Separately persists durable human approval ledger across graph wipes (D-19).

2. **Graph Build Orchestration Service (`knowledge-server/src/services/graphBuildService.ts`, `candidate.ts`)**
   - Coordinates build lifecycle: `Preparing` -> `Structured extraction` -> `Prose extraction` -> `Validation` -> `Activation`.
   - Stale-source guard: validates `sourceSnapshotId` before activating candidate.
   - Preserves prior active graph if candidate build throws or fails validation (D-21).
   - Retains approved facts whose source evidence disappeared with `sourceMissing = true` and `BUSINESS_APPROVED` classification (D-20).

3. **Graph Rebuild Verification Suite (`knowledge-server/tests/graphRebuild.test.ts`)**
   - Verified active snapshot and approval persistence across simulated daemon restarts.
   - Verified atomic pointer swap leaving prior active graph unchanged until promotion.
   - Verified failure isolation leaving prior graph intact.
   - Verified identical normalized projection hashes across rebuilds.
   - Verified stale-source guard and source disappearance retention.

4. **Pilot Acceptance Suite (`knowledge-server/tests/pilotAcceptance.test.ts`)**
   - Validated against real frozen SmartVista corpus (`docs/sample-markdown-flow/60000006-SHB-Credit-calculations/`).
   - Verified GRAPH-01 (7 core node kinds including SourceDocument), GRAPH-02 (`PRC_PROCESS:60000006` vs `PRC_CONTAINER:60000006`), GRAPH-03 (consumed ranges before prose), GRAPH-04 (exact provenance on all relations), GRAPH-05 (OBSERVED/INFERRED/BUSINESS_APPROVED classifications), and GRAPH-06 (rebuild from Markdown without data loss).

5. **Client Offline Isolation Suite (`tests/knowledge/offlineIsolation.test.ts`)**
   - Verified PlannerMate local Docs CRUD, autosave, IndexedDB, and BM25 search function 100% locally with zero egress.
   - Verified graph client operations report `NETWORK_ERROR` cleanly without unhandled UI exceptions when daemon is unavailable.

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED
- `knowledge-server/src/services/graphBuildService.ts`: FOUND
- `knowledge-server/tests/graphRebuild.test.ts`: FOUND
- `knowledge-server/tests/pilotAcceptance.test.ts`: FOUND
- `tests/knowledge/offlineIsolation.test.ts`: FOUND
- Commit 051d774: FOUND
- Commit 51fe95d: FOUND
