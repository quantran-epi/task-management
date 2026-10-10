---
phase: 17-pilot-ontology-deterministic-extraction-neo4j-knowledge-grap
plan: 01
subsystem: knowledge-graph
tags: [ontology, identity, urn, factkey, neo4j, collision-safety]
dependency_graph:
  requires: []
  provides:
    - knowledge-server/src/types/graphProtocol.ts
    - knowledge-server/src/graph/ontology.ts
    - knowledge-server/src/graph/identity.ts
    - knowledge-server/tests/fixtures/pilotGoldEntities.ts
  affects:
    - knowledge-server/src/graph/extraction.ts
    - knowledge-server/src/graph/neo4jRepository.ts
tech_stack:
  added: []
  patterns:
    - Collision-safe URN namespacing (urn:plannermate:<sourceSystem>:<nativeType>:<normalizedKey>)
    - Qualifier-sensitive canonical SHA-256 factKey generation
    - Oracle technical identifier normalization with mandatory schema quarantine
key_files:
  created:
    - knowledge-server/src/types/graphProtocol.ts
    - knowledge-server/src/graph/ontology.ts
    - knowledge-server/src/graph/identity.ts
    - knowledge-server/tests/fixtures/pilotGoldEntities.ts
    - knowledge-server/tests/graphIdentity.test.ts
  modified: []
decisions:
  - "Lock ONTOLOGY_VERSION to 2026.10.1 across graph contracts and identity generation"
  - "Exclude deployment environment (SIT/UAT/PROD) from logical URNs; store on evidence records only (D-05)"
  - "Quarantine unqualified Oracle identifiers missing proven schema context to prevent accidental MAIN1 assumptions (D-08, D-16)"
  - "Filter relation qualifiers through strict allow-lists before hashing into semantic factKey (D-14, D-15)"
metrics:
  duration: 4m
  completed_date: "2026-10-10"
---

# Phase 17 Plan 01: Closed Ontology Vocabulary, Collision-Safe Identity, and FactKey Generator Summary

Collision-safe identity rules distinguishing PRC_PROCESS:60000006 from PRC_CONTAINER:60000006, closed ontology contracts, qualifier allow-lists, and deterministic factKey generator with 16 green golden fixture tests.

## Key Changes

1. **Graph Protocol Contracts (`knowledge-server/src/types/graphProtocol.ts`)**
   - Defined strict Zod schemas and TypeScript types for `NodeKind`, `RelationType`, `EvidenceClassification` (`OBSERVED`, `INFERRED`, `BUSINESS_APPROVED`), `ExtractionMethod`, `GraphEvidenceRecord`, `GraphConflictRecord`, `GraphApprovalRecord`, `GraphNode`, and `GraphRelation`.
   - Enforced URN format validation against `URN_REGEX` and 64-character SHA-256 validation for `FactKey`.

2. **Closed Ontology Definition (`knowledge-server/src/graph/ontology.ts`)**
   - Set `ONTOLOGY_VERSION = '2026.10.1'`.
   - Locked seven node kinds: `ScheduledProcess`, `ProcessStep`, `SoftwareComponent`, `DatabaseObject`, `CycleType`, `Status`, `SourceDocument`.
   - Locked ten relation types: `CONTAINS_STEP`, `PRECEDES`, `CALLS`, `INVOKES`, `READS_FROM`, `WRITES_TO`, `EMITS`, `CONSUMES`, `USES_TYPE`, `HAS_STATUS`.
   - Locked relation qualifier allow-lists: `WRITES_TO` (`operation`), `READS_FROM` (`operation`), `PRECEDES` (`condition`), with empty allow-lists for structural relations.
   - Defined controlled `WRITES_TO_OPERATIONS` and `RELATION_SEMANTICS` (`ADDITIVE` vs `FUNCTIONAL`).

3. **Collision-Safe Identity Utilities (`knowledge-server/src/graph/identity.ts`)**
   - `buildUrn` and `parseUrn`: generate collision-safe URNs namespaced by source system and native type, excluding environment per D-05.
   - `normalizeTechnicalIdentifier`: strips Markdown formatting, uppercases unquoted Oracle tokens, preserves multi-part qualification, and flags quarantine for unqualified identifiers lacking default schema context (D-08, D-16).
   - `buildFactKey`: hashes canonical JSON array `[version, subject, rel, object, sortedAllowedQualifiers]` into SHA-256 hex digest, excluding evidence metadata per D-14.

4. **Pilot Golden Fixtures & Test Suite (`pilotGoldEntities.ts`, `graphIdentity.test.ts`)**
   - 14 gold nodes and 8 gold relations from process 60000006 corpus.
   - 16 Vitest tests verifying:
     - Process vs Container collision elimination (`PRC_PROCESS:60000006` vs `PRC_CONTAINER:60000006`)
     - Step identity independence from execution order (D-07)
     - SmartVista rekey continuity without historical rewrite (D-10)
     - Environment metadata exclusion from logical URN (D-05)
     - Oracle identifier normalization and unqualified quarantine (D-08, D-16)
     - Qualifier-sensitive factKey generation with allow-list filtering (D-14, D-15)
     - Complete absence of ID collisions across gold fixtures.

## Verification

- `npm --prefix knowledge-server exec tsc --noEmit` compiled with 0 errors.
- `npm --prefix knowledge-server test -- tests/graphIdentity.test.ts` passed 16/16 tests.

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED
- FOUND: knowledge-server/src/types/graphProtocol.ts
- FOUND: knowledge-server/src/graph/ontology.ts
- FOUND: knowledge-server/src/graph/identity.ts
- FOUND: knowledge-server/tests/fixtures/pilotGoldEntities.ts
- FOUND: knowledge-server/tests/graphIdentity.test.ts
- FOUND: c6b147b
- FOUND: 06e67ee
