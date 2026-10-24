# Phase 24: Graph Retrieval Optimization - Context

**Gathered:** 2026-10-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Make Neo4j retrieval ontology-driven, bounded, deterministic, and observable so resolved graph entities and valid evidence survive per-seed planning, traversal, fusion, and AI Chat rendering. Scope includes seed-only results, mixed-kind and multi-relation traversal, plan validation and fallback, stable ranking/deduplication, safe stage diagnostics, reference-query evaluation, measured Neo4j tuning, and live end-to-end verification. Offline BM25 behavior and optional knowledge-server isolation remain unchanged.

</domain>

<decisions>
## Implementation Decisions

### Seed-only evidence
- **D-01:** A resolved seed entity MUST survive retrieval even when no valid edge or path exists. The answer may confirm only that the entity exists; it MUST state that no relationship evidence was found and MUST NOT infer relationships.
- **D-02:** Seed-only retrieval uses a distinct `SEED_ONLY` outcome, not `READY` or `NO_EVIDENCE`.
- **D-03:** AI Chat displays both a limited textual answer and a separate entity card for `SEED_ONLY` results. Counts remain distinct: entity, edge, and path.
- **D-04:** The entity card may offer an explicit “find related” action that starts a new broader query. The original query MUST NOT broaden implicitly.

### Ontology-driven traversal breadth
- **D-05:** Broad related-information queries search all ontology-valid relations for each seed within bounds. A single hardcoded default relation per node kind is insufficient.
- **D-06:** The AI planner may select only closed ontology relations based on query meaning. Server validation remains authoritative. Regex/keyword matching MUST NOT be the primary relation-intent mechanism.
- **D-07:** If relation intent is uncertain or the selected relation is invalid, fallback searches all ontology-valid relations for that seed within a safe one-hop bound.
- **D-08:** Mixed-kind seeds receive separate per-seed plans based on each seed’s node kind and valid endpoint rules. Results merge deterministically; the first seed’s kind MUST NOT govern all seeds.
- **D-09:** The AI planner proposes `LOOKUP`, `FLOW_TRAVERSAL`, or `IMPACT_ANALYSIS` intent and traversal depth. Server validation caps traversal at three hops. Invalid or unresolved depth falls back safely to one hop.

### Plan validation and failure handling
- **D-10:** Planner prompts MUST include the closed ontology, resolved seed kinds, allowed relations/directions/endpoints, schema, and bounds. Prompting reduces errors but never replaces server validation.
- **D-11:** Invalid plans receive exactly one bounded AI repair attempt using stable validation reason codes. The repair request MUST NOT contain raw Cypher, secrets, source content, or unrestricted error details.
- **D-12:** If repair still fails, server executes a safe one-hop fallback over ontology-valid relations. Invalid plan portions MUST never reach Neo4j.
- **D-13:** A valid seed continues even when another seed is unresolved or invalid. The response MUST report omitted/failed seeds explicitly; failures MUST NOT be hidden or erase valid evidence.
- **D-14:** Validation uses specific stable reason codes plus plain-language UI explanations. Codes distinguish invalid relation, direction, endpoint kind, hop limit, missing seed, rejection, truncation, and seed-only results.
- **D-15:** A requested depth above three returns `HOP_LIMIT_EXCEEDED` to the single repair attempt. If unrepaired, use the one-hop fallback rather than silently executing five hops or silently changing the original plan to three.

### Fusion, ranking, diagnostics, and evaluation
- **D-16:** Valid graph evidence receives protected closure during fusion: required seed/target entities, edge or path, and supporting citation chunks survive as one complete package. Graph evidence MUST NOT disappear solely because full-text/vector candidates fill the shared limit.
- **D-17:** Protection applies only to graph evidence that is snapshot-consistent, ontology-valid, within bounds, and citation-closed. Graph results do not receive unconditional priority.
- **D-18:** When several graph paths are valid, rank deterministically by intent relevance, ability to answer the question, evidence strength, appropriate path length, then stable identity. Neo4j return order MUST NOT determine final order.
- **D-19:** Diagnostics use a concise default summary plus an expandable detail view. Safe details include per-stage status, timings, entity/edge/path counts, accepted/rejected counts, reason codes, truncation, fallback, and graph items before/after fusion.
- **D-20:** Diagnostics MUST NOT expose raw user queries, source content, excerpts, credentials, sensitive URLs, stack traces, or raw Cypher.
- **D-21:** Establish a fixed reference-query set covering direct entity lookup, read/write relations, seed-only results, nonexistent entities, mixed kinds, multiple valid relations, and bounded multi-hop flow/impact queries.
- **D-22:** Measure correctness first: zero-result rate, recall, precision, identity preservation, citation/path closure, and deterministic output. Only after correctness baseline passes may Neo4j tuning use `EXPLAIN` and `PROFILE`; tuning MUST NOT reduce retrieval quality.

### Claude's Discretion
- Exact names and schema placement for new protocol fields, provided `SEED_ONLY`, separate counts, and stable reason-code semantics remain explicit.
- Exact protected graph-package quota under the global result limit, provided every retained edge/path stays citation-closed and textual evidence still has bounded room.
- Exact path scoring weights and tie-break implementation, provided ordering is deterministic and follows D-18.
- Exact Vietnamese UI wording for plain-language reason explanations.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase source and constraints
- `docs/GRAPH_RETRIEVAL_OPTIMIZATION_ROADMAP.md` — Canonical Phase 24 problem statement, staged roadmap, constraints, and acceptance direction.
- `.planning/ROADMAP.md` — Phase goal and eight required success criteria.
- `.planning/PROJECT.md` — Offline-first, Markdown-canonical, optional-daemon, evidence-integrity, and pilot-corpus constraints.
- `.planning/REQUIREMENTS.md` — Existing graph retrieval, grounded-answer, fallback, and trust requirements that Phase 24 must preserve.

### Retrieval planning and traversal
- `knowledge-server/src/retrieval/queryPlanning.ts` — Current entity resolution, fast path, planner validation/repair, hardcoded kind defaults, and deterministic fallback.
- `knowledge-server/src/graph/ontology.ts` — Closed node/relation ontology and traversal registry; authority for per-seed relation, direction, endpoint, and hop validation.
- `knowledge-server/src/retrieval/graphTraversal.ts` — Static traversal query catalog, plan validation, bounded graph result mapping, counts, and path closure input.
- `knowledge-server/src/graph/neo4jRepository.ts` — Entity resolution and traversal execution; currently loses zero-edge seeds and contains special-case multi-relation behavior.
- `knowledge-server/src/types/retrievalProtocol.ts` — Retrieval outcome, item, plan, modality status, diagnostics, and response schemas requiring compatible extensions.

### Fusion and end-to-end delivery
- `knowledge-server/src/retrieval/fusion.ts` — Current RRF, composite identity, conflict tagging, citation closure, and deterministic tie-breaking.
- `knowledge-server/src/services/retrievalService.ts` — Planning, parallel modalities, relevance gating, fusion, outcome selection, and diagnostics assembly.
- `knowledge-server/src/services/federatedRetrievalService.ts` — Knowledge-server response normalization and federated delivery boundary.
- `src/services/ai/groundedTurn.ts` — PlannerMate orchestration consuming retrieval evidence and preserving offline fallback.
- `src/services/ai/evidencePack.ts` — Evidence normalization and citation packing before grounded synthesis.
- `src/components/ai/AIChatDrawer.tsx` — Final AI Chat flow and integration point for seed-only rendering/actions.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `resolveQueryEntities()` and `buildQueryExecutionPlan()` in `knowledge-server/src/retrieval/queryPlanning.ts`: retain bounded entity resolution and one-repair planner loop; replace first-kind/single-relation assumptions with per-seed ontology plans.
- `RETRIEVAL_ONTOLOGY_REGISTRY` and static relation templates: reuse as authoritative allowlist; no model-generated Cypher or new query builder dependency.
- `runBoundedGraphTraversal()` in `knowledge-server/src/retrieval/graphTraversal.ts`: retain snapshot/evidence/cap checks while adding seed preservation and separate counts.
- `fuseRetrievalCandidates()`, `tagRetrievalConflicts()`, and `closeOrderedPaths()` in `knowledge-server/src/retrieval/fusion.ts`: extend current deterministic identity and closure logic instead of replacing fusion wholesale.
- Existing grounded-answer cards and diagnostics UI patterns: reuse for limited seed-only answer, entity card, and expandable safe metadata.

### Established Patterns
- Static parameterized Cypher templates generated from frozen ontology; runtime/model output never contains executable Cypher.
- Pinned snapshot lease and snapshot-ID sanitization across all modalities.
- Parallel full-text, vector, and graph retrieval with modality-local timeouts and fail-soft behavior.
- Citation closure requires graph edges/paths to retain supporting chunks before final rendering.
- Stable composite item identity currently uses `type:id`; phase must preserve compatible identity through federated fusion.
- Diagnostics currently expose content-free status, latency, counts, and reason codes; extend this pattern rather than logging payloads.

### Integration Points
- `queryPlanning.ts`: per-seed planning, intent/depth proposal, repair/fallback policy.
- `graphTraversal.ts` and `neo4jRepository.ts`: endpoint validation, seed lookup/preservation, bounded multi-relation execution, per-stage counts.
- `retrievalService.ts` and `fusion.ts`: relevance gate, graph closure protection, deterministic ranking, outcome and diagnostics.
- Retrieval protocol schemas on server and client: `SEED_ONLY`, count breakdowns, stable reason codes, stage diagnostics.
- Grounded turn/evidence pack/AI Chat rendering: prevent valid graph evidence loss after server response and render seed-only answer plus entity card.
- Existing targeted unit/integration/live test layers: trace `MAIN1.EVT_EVENT` from request through planning, Neo4j, fusion, protocol normalization, and UI.

</code_context>

<specifics>
## Specific Ideas

- Primary regression example: “Thành phần nào ghi vào `MAIN1.EVT_EVENT`?” A valid answer package contains `MAIN1.EVT_EVENT`, writer entity, `WRITES_TO`, and supporting chunk citation.
- Seed-only message example: “Đã tìm thấy `MAIN1.EVT_EVENT`, nhưng chưa tìm thấy bằng chứng về thành phần ghi dữ liệu vào đối tượng này.”
- Seed-only diagnostic example: entity `1`, edge `0`, path `0`, reason `SEED_FOUND_NO_RELATION`.
- Safe expanded diagnostics trace entity resolution, planning, validation, Neo4j traversal, fusion, and rendering using only statuses, timings, counts, and stable codes.
- Live verification must preserve local BM25 fallback when Neo4j or knowledge server is unavailable.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 24-graph-retrieval-optimization*
*Context gathered: 2026-10-24*
