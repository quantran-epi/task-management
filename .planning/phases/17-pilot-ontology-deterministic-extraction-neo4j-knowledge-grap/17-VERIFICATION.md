---
phase: 17-pilot-ontology-deterministic-extraction-neo4j-knowledge-grap
verified: 2026-10-10T16:22:00Z
status: human_needed
score: 6/6 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 6/6
  gaps_closed:
    - "Graph status loads once without infinite GET /graph/status render loop (Plan 17-06)"
    - "Graph rebuild polling terminates on failure with safe error details and no false success toast (Plan 17-06)"
    - "Knowledge-server strict TypeScript compilation errors resolved (clean tsc --noEmit)"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Retest 2: Graph Status Summary"
    expected: "Status loads once for selected set; stable Never built or Active summary without skeleton flicker"
    why_human: "Requires live browser render loop and network panel inspection"
  - test: "Retest 3: Safe Graph Rebuild"
    expected: "Rebuild confirmation, stage progress, error alert on failure with no success toast, or active graph on completion"
    why_human: "Requires interactive modal confirmation and asynchronous rebuild polling in UI"
  - test: "Retest 4: Evidence and Classification Inspection"
    expected: "Nested evidence drawer opens; fact rows display OBSERVED/INFERRED tags; expandable occurrences show source details"
    why_human: "Visual tag appearance and drawer interaction"
  - test: "Retest 5: Pilot Identity and Deterministic Facts"
    expected: "Process 60000006 entities keep PRC_PROCESS and PRC_CONTAINER distinct"
    why_human: "Domain fact verification on live graph view"
  - test: "Retest 6: Conflict and Quarantine Safety"
    expected: "Contradictory assertions show conflict alert; unqualified identifiers stay quarantined"
    why_human: "UI verification of conflict banners and quarantine drawer tab"
  - test: "Retest 7: Durable Rebuild and Failure Isolation"
    expected: "Active snapshot survives server restart; failed rebuild leaves prior graph unchanged"
    why_human: "Requires restarting daemon process and verifying UI state preservation"
---

# Phase 17: Pilot Ontology, Deterministic Extraction & Neo4j Knowledge Graph Verification Report

**Phase Goal:** Build a rebuildable Neo4j knowledge graph for process 60000006 using collision-safe composite identities, deterministic table extraction, and explicit evidence classification.
**Verified:** 2026-10-10T16:22:00Z
**Status:** human_needed
**Re-verification:** Yes — verified after gap-closure Plan 17-06 and compiler cleanup

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Controlled graph projection for process 60000006 covering 7 locked node kinds (GRAPH-01) | ✓ VERIFIED | `ontology.ts` defines `NODE_KINDS`. `extraction.ts` extracts all 7 types deterministically from real markdown corpus. Verified by `pilotAcceptance.test.ts`. |
| 2 | Graph keeps identically numbered domain objects distinct via namespaced composite identities (GRAPH-02) | ✓ VERIFIED | `identity.ts` builds `urn:plannermate:smartvista:PRC_PROCESS:60000006` vs `PRC_CONTAINER:60000006`. Verified by `graphIdentity.test.ts` and `pilotGoldEntities.ts`. |
| 3 | Structured Markdown tables extracted deterministically before prose fallback (GRAPH-03) | ✓ VERIFIED | `extraction.ts` executes MDAST table extractors, records character `consumedRanges`, and passes only uncovered prose to `proseExtraction.ts`. Verified by `deterministicExtraction.test.ts`. |
| 4 | Relations retain source document, range, method, and classification (GRAPH-04) | ✓ VERIFIED | `GraphEvidenceRecord` in `graphProtocol.ts` captures full provenance. Candidate merge links multiple evidence occurrences to single `Fact`. Verified by `graphCandidate.test.ts`. |
| 5 | Distinguish OBSERVED, INFERRED, and BUSINESS_APPROVED knowledge (GRAPH-05) | ✓ VERIFIED | `GraphEvidenceDrawer.tsx` renders distinct Ant Design tags. Hardened in Plan 17-06 with safe error DTOs and client memoization. Verified by `GraphEvidenceDrawer.test.tsx` and `graphRoutes.test.ts`. |
| 6 | Rebuild graph from published Markdown; Neo4j never canonical (GRAPH-06) | ✓ VERIFIED | `snapshotStore.ts` provides durable file persistence across restarts. `graphBuildService.ts` handles candidate build and atomic pointer swap. Plan 17-06 preserves prior active graph on failure. Verified by `graphRebuild.test.ts` and `offlineIsolation.test.ts`. |

**Score:** 6/6 truths verified

### Plan 17-06 Gap Closure Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| G-1 | Graph status loads once without continuous re-render loop | ✓ VERIFIED | `DocumentSetDrawer.tsx`: `client` memoized from stable inputs; effect dependency stable. |
| G-2 | Rebuild polling treats `Failed` as immediate terminal state | ✓ VERIFIED | `knowledgeClient.ts`: `pollGraphStatus` stops immediately on `Failed`. Tested in `knowledgeClient.test.ts`. |
| G-3 | Failed rebuild exposes structured safe error code without credential leakage | ✓ VERIFIED | `graph.ts`: `GraphStatusDTOSchema` includes bounded safe `error`. `graphBuildService.ts`: `safeBuildError` maps to allow-listed codes and copy. Tested in `graphRoutes.test.ts`. |
| G-4 | UI shows error toast and alert banner on rebuild failure, preserving prior graph | ✓ VERIFIED | `DocumentSetDrawer.tsx`: `handleTriggerRebuild` emits error toast and renders red alert. Summary card preserves prior active graph metrics. |
| G-5 | Failed rebuild never reports success toast | ✓ VERIFIED | `DocumentSetDrawer.tsx`: `message.success` guarded in `else` branch, skipped on failure. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `knowledge-server/src/types/graphProtocol.ts` | Zod schemas and TypeScript interfaces for graph nodes, relations, URNs, fact keys, evidence | ✓ VERIFIED | Strict schemas for `NodeKind`, `RelationType`, `EvidenceClassification`, `UrnSchema`, `FactKeySchema`. |
| `knowledge-server/src/graph/ontology.ts` | Ontology version definition, controlled vocabularies, qualifier allow-lists | ✓ VERIFIED | `ONTOLOGY_VERSION = '2026.10.1'`, 7 node kinds, 10 relations, qualifier allow-lists. |
| `knowledge-server/src/graph/identity.ts` | Collision-safe URN builder, normalizer, deterministic factKey generator | ✓ VERIFIED | `buildUrn`, `parseUrn`, `normalizeTechnicalIdentifier`, `buildFactKey`. |
| `knowledge-server/src/graph/extraction.ts` | Deterministic MDAST extractors and consumed range tracker | ✓ VERIFIED | Parses markdown AST for PRC_PROCESS, PRC_CONTAINER, binds, data objects, statuses; emits OBSERVED facts and consumed ranges. |
| `knowledge-server/src/ai/proseExtraction.ts` | Single bounded prose fallback client | ✓ VERIFIED | Uncovered prose segmentation, 12k char cap, 30s timeout, zero retries, strict validation. |
| `knowledge-server/src/graph/candidate.ts` | FactKey deduplication, multi-evidence linking, functional conflict detection | ✓ VERIFIED | Merges facts, overlays approval ledger, detects conflicts in functional slots. |
| `knowledge-server/src/graph/graphRepository.ts` | Graph repository interface and InMemoryGraphRepository | ✓ VERIFIED | Implements `writeCandidate`, `activateCandidate`, `getActiveGraph`, `getFacts`, `getQuarantines`. |
| `knowledge-server/src/graph/neo4jRepository.ts` | Parameterized static Cypher writers and snapshot constraints | ✓ VERIFIED | Parameterized Cypher templates with `UNWIND $rows`, single transaction pointer switch. |
| `knowledge-server/src/routes/graph.ts` | Fastify graph routes (rebuild, status, facts, evidence, quarantine) | ✓ VERIFIED | Strict Zod DTO validation, safe error envelope, Bearer token auth, idempotency. |
| `knowledge-server/src/services/graphBuildService.ts` | Build pipeline orchestrator, stale-source guard, atomic promotion | ✓ VERIFIED | Manages stages, safe error mapping (`safeBuildError`), preserves prior active graph on failure. |
| `knowledge-server/src/indexing/snapshotStore.ts` | Durable published snapshot store with atomic file writes | ✓ VERIFIED | Atomic `.tmp` rename persistence for snapshots and approvals. |
| `src/services/knowledge/knowledgeClient.ts` | Frontend client methods for graph endpoints and polling | ✓ VERIFIED | Typed DTO validation, immediate `Failed` terminal return in `pollGraphStatus`. |
| `src/components/knowledge/DocumentSetDrawer.tsx` | Extended drawer with graph status, counts, rebuild modal | ✓ VERIFIED | Memoized client identity, stage progress bar, failure Alert rendering, prior active graph preservation. |
| `src/components/knowledge/GraphEvidenceDrawer.tsx` | 680px inspection drawer with classification tags, row expansion | ✓ VERIFIED | Ant Design table, distinct tags, expandable occurrences, conflict alert, quarantine tab. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Knowledge server test suite | `npm --prefix knowledge-server test` | 15 test files passed, 104/104 tests green | ✓ PASS |
| Frontend knowledge tests | `npm test -- tests/knowledge/knowledgeClient.test.ts tests/knowledge/offlineIsolation.test.ts src/components/knowledge/GraphEvidenceDrawer.test.tsx` | 2 test files passed, 16/16 tests green | ✓ PASS |
| Vite production build | `npm run build` | Built in 4.45s, PWA generated, 0 errors | ✓ PASS |
| Knowledge server TypeScript compiler | `npx tsc --noEmit -p knowledge-server/tsconfig.json` | 0 errors | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| GRAPH-01 | 17-01, 17-05 | Controlled graph projection for process 60000006 covering 7 locked node kinds | ✓ SATISFIED | `ontology.ts`, `extraction.ts`, `pilotAcceptance.test.ts` |
| GRAPH-02 | 17-01, 17-05 | Namespaced composite identities preventing numeric collisions | ✓ SATISFIED | `identity.ts`, `graphIdentity.test.ts`, `pilotGoldEntities.ts` |
| GRAPH-03 | 17-02, 17-05 | Deterministic structured extraction before prose fallback | ✓ SATISFIED | `extraction.ts`, `proseExtraction.ts`, `deterministicExtraction.test.ts` |
| GRAPH-04 | 17-03, 17-05 | Relations retain source document, range, method, and classification | ✓ SATISFIED | `graphProtocol.ts`, `candidate.ts`, `neo4jRepository.ts`, `graphCandidate.test.ts` |
| GRAPH-05 | 17-04, 17-05, 17-06 | User distinguishes OBSERVED, INFERRED, and BUSINESS_APPROVED knowledge | ✓ SATISFIED | `GraphEvidenceDrawer.tsx`, `DocumentSetDrawer.tsx`, `graphRoutes.ts` |
| GRAPH-06 | 17-05, 17-06 | Rebuild graph and indexes from published Markdown; Neo4j never canonical | ✓ SATISFIED | `snapshotStore.ts`, `graphBuildService.ts`, `graphRebuild.test.ts`, `offlineIsolation.test.ts` |

Zero orphaned requirements. All 6 requirements mapped to Phase 17 in `REQUIREMENTS.md` are satisfied.

### Anti-Patterns Found

Zero blocker debt markers (`TBD`, `FIXME`, `XXX`) found across `knowledge-server/src` and `src/components/knowledge`. No stub implementations, hollow props, or hardcoded empty returns.

### Human Verification Required

Awaiting manual execution of UAT Tests 2 through 7:
1. Retest 2 (Graph Status Summary) — verify single GET call and stable card
2. Retest 3 (Safe Graph Rebuild) — verify confirmation modal, stage progress, and error alert
3. Retest 4 (Evidence and Classification Inspection) — verify drawer tags and occurrences
4. Retest 5 (Pilot Identity and Deterministic Facts) — verify process 60000006 separation
5. Retest 6 (Conflict and Quarantine Safety) — verify conflict warnings and quarantined entities
6. Retest 7 (Durable Rebuild and Failure Isolation) — verify restart durability and failed rebuild isolation

---

_Verified: 2026-10-10T16:22:00Z_
_Verifier: Claude (gsd-verifier)_
