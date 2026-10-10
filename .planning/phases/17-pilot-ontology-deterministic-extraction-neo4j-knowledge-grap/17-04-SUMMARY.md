---
phase: 17-pilot-ontology-deterministic-extraction-neo4j-knowledge-grap
plan: 04
subsystem: knowledge-graph
tags: [fastify-routes, graph-evidence-drawer, provenance-inspection, classification-badges, rebuild-trigger]
dependency_graph:
  requires:
    - 17-03
  provides:
    - knowledge-server/src/routes/graph.ts
    - knowledge-server/tests/graphRoutes.test.ts
    - src/components/knowledge/GraphEvidenceDrawer.tsx
    - src/components/knowledge/GraphEvidenceDrawer.test.tsx
  affects:
    - src/components/knowledge/DocumentSetDrawer.tsx
    - src/services/knowledge/knowledgeClient.ts
tech_stack:
  added: []
  patterns:
    - Authenticated Fastify routes with x-rebuild-key idempotency and strict Zod DTO validation
    - Bounded status polling preserving last known state on connectivity disruption
    - 680px desktop inspection drawer with expandable fact rows revealing exact source provenance
    - Visible classification badges distinguishing OBSERVED, INFERRED, and BUSINESS_APPROVED facts
    - Dual-branch display for functional relation slot conflicts
key_files:
  created:
    - knowledge-server/src/routes/graph.ts
    - knowledge-server/tests/graphRoutes.test.ts
    - src/components/knowledge/GraphEvidenceDrawer.tsx
    - src/components/knowledge/GraphEvidenceDrawer.test.tsx
  modified:
    - knowledge-server/src/server.ts
    - src/services/knowledge/knowledgeClient.ts
    - src/components/knowledge/DocumentSetDrawer.tsx
    - tests/knowledge/knowledgeClient.test.ts
decisions:
  - "Protect all graph endpoints with bearer authentication and allowed-origin CORS validation"
  - "Enforce strict Zod parsing on graph DTOs ensuring zero leakage of Cypher strings or credentials"
  - "Add Đồ thị tri thức section into DocumentSetDrawer before Lịch sử xuất bản"
  - "Preserve prior active graph during candidate rebuild and present explicit confirmation modal"
  - "Render expandable occurrences in GraphEvidenceDrawer displaying exact heading paths, line ranges, and extraction methods"
metrics:
  duration: 10m
  completed_date: "2026-10-10"
---

# Phase 17 Plan 04: Graph API Routes, Status Summary & Evidence Inspection Drawer Summary

Implemented authenticated Fastify graph routes, frontend client integration, DocumentSetDrawer graph summary with candidate rebuild flow, and nested GraphEvidenceDrawer displaying exact provenance and classification badges.

## Key Changes

1. **Fastify Graph Routes (`knowledge-server/src/routes/graph.ts`, `server.ts`)**
   - `POST /api/v1/sets/:setId/graph/rebuild`: requires bearer auth, accepts `x-rebuild-key` header for replay safety, returns 202 with candidate info, returns 409 when build is in progress.
   - `GET /api/v1/sets/:setId/graph/status`: returns `GraphStatusDTO` with state ('Never built' | 'Building' | 'Active' | 'Active with warnings' | 'Failed'), current stage, entity/fact/evidence/conflict/quarantine counts, and ontology version.
   - `GET /api/v1/sets/:setId/graph/facts`: returns `FactsListDTO` with fact summary list.
   - `GET /api/v1/sets/:setId/graph/facts/:factKey/evidence`: returns `FactEvidenceDetailDTO` with full occurrences list.
   - `GET /api/v1/sets/:setId/graph/quarantine`: returns `QuarantineListDTO` with quarantined technical identifiers.
   - Integrated routes into `server.ts` protected by existing origin validation and timing-safe bearer token check.

2. **Frontend Knowledge Client Integration (`src/services/knowledge/knowledgeClient.ts`)**
   - Added `triggerGraphRebuild`, `getGraphStatus`, `getGraphFacts`, `getFactEvidence`, `getGraphQuarantines`, and `pollGraphStatus`.
   - Polling bounds backoff and preserves last known status with `uncertain: true` if connectivity drops.

3. **DocumentSetDrawer Graph Section (`src/components/knowledge/DocumentSetDrawer.tsx`)**
   - Added `Đồ thị tri thức` card showing active snapshot ID, activation timestamp, ontology version, stage badge, node/fact/evidence counts, and conflict/quarantine counters.
   - Primary CTA `Xây dựng lại đồ thị` enabled only when published snapshot exists, daemon reachable, and no build running.
   - Rebuild confirmation modal explaining candidate rebuild and preservation of prior graph.
   - Secondary CTA `Xem bằng chứng` opening nested `GraphEvidenceDrawer`.

4. **Nested GraphEvidenceDrawer (`src/components/knowledge/GraphEvidenceDrawer.tsx`)**
   - 680px width on desktop (100% on mobile). Parent drawer remains open.
   - 6 columns: `Chủ thể`, `Quan hệ`, `Đối tượng`, `Phân loại`, `Bằng chứng`, `Trạng thái`.
   - Distinct tags for `OBSERVED` (blue info), `INFERRED` (gold warning), and `BUSINESS_APPROVED` (green success).
   - Expandable rows revealing document title, heading path, `Dòng {start}–{end}`, extraction method, environment, confidence score, and quote snippet.
   - Direct contradiction alert rendering both conflicting branches (`A` and `B`).
   - Dedicated tab for quarantined identifiers.

5. **Test Suites (`graphRoutes.test.ts`, `GraphEvidenceDrawer.test.tsx`, `knowledgeClient.test.ts`)**
   - `knowledge-server/tests/graphRoutes.test.ts`: 5 tests verifying auth, idempotency replay, status progression, and DTO parsing (5/5 passed).
   - `src/components/knowledge/GraphEvidenceDrawer.test.tsx`: 4 tests verifying badge treatments, contradiction warning, expandable provenance details, and quarantine tab (4/4 passed).
   - `tests/knowledge/knowledgeClient.test.ts`: 17 tests verifying client methods and graph endpoints (17/17 passed).

## Verification

- `npm --prefix knowledge-server exec tsc --noEmit` passed with 0 errors.
- `npm --prefix knowledge-server test -- tests/graphRoutes.test.ts` passed (5/5 tests).
- `npm --prefix knowledge-server test` passed full suite (14 files, 93/93 tests).
- `npm run build` passed with 0 errors.
- `npm test -- src/components/knowledge/GraphEvidenceDrawer.test.tsx tests/knowledge/knowledgeClient.test.ts` passed (21/21 tests).

## Deviations from Plan

None - plan executed exactly as specified.
