---
phase: 17-pilot-ontology-deterministic-extraction-neo4j-knowledge-grap
verified: 2026-10-10T13:46:00Z
status: passed
score: 6/6 must-haves verified
overrides_applied: 0
---

# Phase 17: Pilot Ontology, Deterministic Extraction & Neo4j Knowledge Graph Verification Report

**Phase Goal:** Build a rebuildable Neo4j knowledge graph for process 60000006 using collision-safe composite identities, deterministic table extraction, and explicit evidence classification.
**Verified:** 2026-10-10T13:46:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can build a controlled graph projection for process 60000006 covering scheduled processes, container steps, software components, database objects, cycle types, statuses, and source documents (GRAPH-01) | ✓ VERIFIED | `knowledge-server/src/graph/ontology.ts` defines 7 locked node kinds (`NODE_KINDS`). `extraction.ts` extracts all 7 types deterministically from real process 60000006 markdown corpus. Verified by `pilotAcceptance.test.ts`. |
| 2 | Graph keeps identically numbered domain objects distinct through namespaced composite identities (`PRC_PROCESS:60000006` vs `PRC_CONTAINER:60000006`) (GRAPH-02) | ✓ VERIFIED | `knowledge-server/src/graph/identity.ts` (`buildUrn`) encodes `urn:plannermate:smartvista:PRC_PROCESS:60000006` vs `urn:plannermate:smartvista:PRC_CONTAINER:60000006`. Verified by `graphIdentity.test.ts` and `pilotGoldEntities.ts`. |
| 3 | Structured Markdown tables and explicit identifiers are extracted deterministically before LLM extraction is used for prose-only relationships (GRAPH-03) | ✓ VERIFIED | `knowledge-server/src/graph/extraction.ts` executes MDAST table extractors first, records character-level `consumedRanges`, and passes only uncovered paragraphs to `proseExtraction.ts`. Verified by `deterministicExtraction.test.ts` and `proseFallback.test.ts`. |
| 4 | Every graph relation retains source document, section, source range, extraction method, and evidence classification (`OBSERVED`, `INFERRED`, or `BUSINESS_APPROVED`) (GRAPH-04) | ✓ VERIFIED | `GraphEvidenceRecord` in `graphProtocol.ts` captures `documentId`, `headingPath`, line/offset ranges, `method`, and `classification`. Candidate merge engine links multiple evidence occurrences to single `Fact` without edge duplication. Verified by `graphCandidate.test.ts` and `neo4jRepository.test.ts`. |
| 5 | User can distinguish `OBSERVED`, `INFERRED`, and `BUSINESS_APPROVED` knowledge in graph-backed results (GRAPH-05) | ✓ VERIFIED | `GraphEvidenceDrawer.tsx` renders 6 columns with distinct Ant Design tags: `Quan sát trực tiếp` (blue), `Suy luận` (gold), `Đã phê duyệt nghiệp vụ` (green), and expandable occurrences. Fastify API routes return typed DTOs. Verified by `GraphEvidenceDrawer.test.tsx` and `graphRoutes.test.ts`. |
| 6 | User can rebuild graph and indexes from published Markdown without treating Neo4j as canonical storage (GRAPH-06) | ✓ VERIFIED | `SnapshotStore` provides durable atomic file persistence across restarts. `GraphBuildService` orchestrates candidate build, stale-source check, and atomic pointer swap in single Neo4j transaction. If build fails, prior active graph remains unchanged. Verified by `graphRebuild.test.ts` and `offlineIsolation.test.ts`. |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `knowledge-server/src/types/graphProtocol.ts` | Zod schemas and TypeScript interfaces for graph nodes, relations, URNs, fact keys, evidence | ✓ VERIFIED | Substantive (340 lines). Strict schemas for `NodeKind`, `RelationType`, `EvidenceClassification`, `UrnSchema`, `FactKeySchema`. Imported across backend. |
| `knowledge-server/src/graph/ontology.ts` | Ontology version definition, controlled vocabularies, qualifier allow-lists | ✓ VERIFIED | Substantive (130 lines). `ONTOLOGY_VERSION = '2026.10.1'`, 7 node kinds, 10 relations, qualifier allow-lists (`WRITES_TO`, `READS_FROM`, `PRECEDES`), relation semantics. |
| `knowledge-server/src/graph/identity.ts` | Collision-safe URN builder, normalizer, deterministic factKey generator | ✓ VERIFIED | Substantive (180 lines). `buildUrn`, `parseUrn`, `normalizeTechnicalIdentifier`, `buildFactKey`. |
| `knowledge-server/src/graph/extraction.ts` | Deterministic MDAST extractors and consumed range tracker | ✓ VERIFIED | Substantive (470 lines). Parses markdown AST, handles PRC_PROCESS, PRC_CONTAINER, binds, data objects, statuses; emits OBSERVED facts and consumed ranges. |
| `knowledge-server/src/ai/proseExtraction.ts` | Single bounded prose fallback client | ✓ VERIFIED | Substantive (210 lines). Uncovered prose segmentation, 12k char cap, 30s timeout, zero retries, strict endpoint validation, INFERRED classification. |
| `knowledge-server/src/graph/candidate.ts` | FactKey deduplication, multi-evidence linking, functional conflict detection | ✓ VERIFIED | Substantive (245 lines). Merges facts, overlays approval ledger, detects conflicts in functional slots, computes `normalizedProjectionHash`. |
| `knowledge-server/src/graph/graphRepository.ts` | Graph repository interface and InMemoryGraphRepository | ✓ VERIFIED | Substantive (140 lines). Implements `writeCandidate`, `activateCandidate`, `getActiveGraph`, `getFacts`, `getQuarantines`. |
| `knowledge-server/src/graph/neo4jRepository.ts` | Parameterized static Cypher writers and snapshot constraints | ✓ VERIFIED | Substantive (310 lines). Uses `neo4j-driver@6.2.0`, parameterized static Cypher templates with `UNWIND $rows`, single transaction pointer switch. |
| `knowledge-server/src/routes/graph.ts` | Fastify graph routes (rebuild, status, facts, evidence, quarantine) | ✓ VERIFIED | Substantive (240 lines). Strict Zod DTO validation, Bearer token auth, idempotency handling. |
| `knowledge-server/src/services/graphBuildService.ts` | Build pipeline orchestrator, stale-source guard, atomic promotion | ✓ VERIFIED | Substantive (260 lines). Stages: Preparing -> Structured -> Prose -> Validation -> Activation. Retains sourceMissing approved facts per D-20. |
| `knowledge-server/src/indexing/snapshotStore.ts` | Durable published snapshot store with atomic file writes | ✓ VERIFIED | Substantive (240 lines). Atomic `.tmp` rename persistence for snapshots and human approvals. |
| `src/services/knowledge/knowledgeClient.ts` | Frontend client methods for graph endpoints and polling | ✓ VERIFIED | Substantive (340 lines). Client methods with typed DTO responses and network fallback. |
| `src/components/knowledge/DocumentSetDrawer.tsx` | Extended drawer with graph status, counts, rebuild modal | ✓ VERIFIED | Substantive (522 lines). Renders `Đồ thị tri thức` card, status counters, rebuild CTA, opens `GraphEvidenceDrawer`. |
| `src/components/knowledge/GraphEvidenceDrawer.tsx` | 680px inspection drawer with classification tags, row expansion | ✓ VERIFIED | Substantive (420 lines). Ant Design table, distinct tags, expandable occurrences, conflict alert, quarantine tab. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `identity.ts` | `ontology.ts` | `ONTOLOGY_VERSION`, `RELATION_QUALIFIER_ALLOWLIST` | ✓ WIRED | Imported and verified in factKey hashing |
| `extraction.ts` | `identity.ts` | `buildUrn`, `buildFactKey`, `normalizeTechnicalIdentifier` | ✓ WIRED | Directly invoked in MDAST table parsers |
| `proseExtraction.ts` | `ontology.ts` | `ONTOLOGY_VERSION`, relation types | ✓ WIRED | Enforces closed ontology on candidate parsing |
| `candidate.ts` | `ontology.ts` | `RELATION_SEMANTICS`, `ONTOLOGY_VERSION` | ✓ WIRED | Detects conflicts in functional relation slots |
| `neo4jRepository.ts` | `graphRepository.ts` | `implements GraphRepository` | ✓ WIRED | Implements all repository methods with parameterized Cypher |
| `knowledgeClient.ts` | `routes/graph.ts` | `/api/v1/sets/:setId/graph/*` REST endpoints | ✓ WIRED | Calls rebuild, status, facts, evidence, quarantine |
| `DocumentSetDrawer.tsx` | `GraphEvidenceDrawer.tsx` | Nested drawer rendering on "Xem bằng chứng" | ✓ WIRED | Component mounted conditionally and triggered by state |
| `graphBuildService.ts` | `snapshotStore.ts` | `getActiveSnapshot`, `getApprovals` | ✓ WIRED | Ingests durable snapshots and overlays approvals |
| `graphBuildService.ts` | `neo4jRepository.ts` | `writeCandidate`, `activateCandidate` | ✓ WIRED | Atomic pointer swap in transaction |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `DocumentSetDrawer.tsx` | `graphStatus` | `client.getGraphStatus(setId)` / polling | Real counts from GraphBuildService / Neo4j repository | ✓ FLOWING |
| `GraphEvidenceDrawer.tsx` | `facts`, `quarantines` | `client.getGraphFacts(setId)`, `client.getGraphQuarantines(setId)` | Real facts, URNs, classifications from GraphRepository | ✓ FLOWING |
| `GraphEvidenceDrawer.tsx` (expanded row) | `evidenceCache[factKey]` | `client.getFactEvidence(setId, factKey)` | Real occurrences with document title, lines, quotes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Knowledge server tests | `npm --prefix knowledge-server test` | 15 test files passed, 103/103 tests green | ✓ PASS |
| Graph evidence drawer & offline isolation tests | `npm test -- src/components/knowledge/GraphEvidenceDrawer.test.tsx tests/knowledge/knowledgeClient.test.ts tests/knowledge/offlineIsolation.test.ts` | 3 test files passed, 24/24 tests green | ✓ PASS |
| TypeScript check on knowledge server | `npm --prefix knowledge-server exec tsc --noEmit` | Clean compilation, 0 errors | ✓ PASS |
| Vite production build | `npm run build` | Built in 6.65s, PWA generated, 0 errors | ✓ PASS |

### Probe Execution

No standalone shell probes configured for Phase 17. Test suites executed via Vitest as shown above.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| GRAPH-01 | 17-01, 17-05 | Controlled graph projection for process 60000006 covering 7 locked node kinds | ✓ SATISFIED | `ontology.ts` (`NODE_KINDS`), `extraction.ts`, `pilotAcceptance.test.ts` |
| GRAPH-02 | 17-01, 17-05 | Namespaced composite identities preventing numeric collisions | ✓ SATISFIED | `identity.ts` (`buildUrn`), `graphIdentity.test.ts`, `pilotGoldEntities.ts` |
| GRAPH-03 | 17-02, 17-05 | Deterministic structured extraction before prose fallback | ✓ SATISFIED | `extraction.ts`, `proseExtraction.ts`, `deterministicExtraction.test.ts` |
| GRAPH-04 | 17-03, 17-05 | Relations retain source document, range, method, and classification | ✓ SATISFIED | `graphProtocol.ts`, `candidate.ts`, `neo4jRepository.ts`, `graphCandidate.test.ts` |
| GRAPH-05 | 17-04, 17-05 | User distinguishes OBSERVED, INFERRED, and BUSINESS_APPROVED knowledge | ✓ SATISFIED | `GraphEvidenceDrawer.tsx`, `graphRoutes.ts`, `GraphEvidenceDrawer.test.tsx` |
| GRAPH-06 | 17-05 | Rebuild graph and indexes from published Markdown; Neo4j never canonical | ✓ SATISFIED | `snapshotStore.ts`, `graphBuildService.ts`, `graphRebuild.test.ts`, `offlineIsolation.test.ts` |

Zero orphaned requirements. All 6 requirements mapped to Phase 17 in `REQUIREMENTS.md` are satisfied.

### Anti-Patterns Found

Zero blocker debt markers (`TBD`, `FIXME`, `XXX`) found across `knowledge-server/src` and `src/components/knowledge`. No stub implementations, hollow props, or hardcoded empty returns found.

### Human Verification Required

None. All automated unit, component, API, integration, and offline isolation tests pass with 100% green assertions.

### Gaps Summary

Zero gaps found. All 6 must-haves verified in actual codebase.

---

_Verified: 2026-10-10T13:46:00Z_
_Verifier: Claude (gsd-verifier)_
