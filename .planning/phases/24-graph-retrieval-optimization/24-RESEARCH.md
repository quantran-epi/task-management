# Phase 24: Graph Retrieval Optimization - Research

**Researched:** 2026-10-24
**Domain:** Neo4j graph retrieval, ontology-constrained query planning, federated RRF fusion, grounded AI Chat rendering
**Confidence:** HIGH on current code behavior; MEDIUM on live-corpus behavior (services not running this session)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Seed-only evidence**
- **D-01:** A resolved seed entity MUST survive retrieval even when no valid edge or path exists. The answer may confirm only that the entity exists; it MUST state that no relationship evidence was found and MUST NOT infer relationships.
- **D-02:** Seed-only retrieval uses a distinct `SEED_ONLY` outcome, not `READY` or `NO_EVIDENCE`.
- **D-03:** AI Chat displays both a limited textual answer and a separate entity card for `SEED_ONLY` results. Counts remain distinct: entity, edge, and path.
- **D-04:** The entity card may offer an explicit “find related” action that starts a new broader query. The original query MUST NOT broaden implicitly.

**Ontology-driven traversal breadth**
- **D-05:** Broad related-information queries search all ontology-valid relations for each seed within bounds. A single hardcoded default relation per node kind is insufficient.
- **D-06:** The AI planner may select only closed ontology relations based on query meaning. Server validation remains authoritative. Regex/keyword matching MUST NOT be the primary relation-intent mechanism.
- **D-07:** If relation intent is uncertain or the selected relation is invalid, fallback searches all ontology-valid relations for that seed within a safe one-hop bound.
- **D-08:** Mixed-kind seeds receive separate per-seed plans based on each seed’s node kind and valid endpoint rules. Results merge deterministically; the first seed’s kind MUST NOT govern all seeds.
- **D-09:** The AI planner proposes `LOOKUP`, `FLOW_TRAVERSAL`, or `IMPACT_ANALYSIS` intent and traversal depth. Server validation caps traversal at three hops. Invalid or unresolved depth falls back safely to one hop.

**Plan validation and failure handling**
- **D-10:** Planner prompts MUST include the closed ontology, resolved seed kinds, allowed relations/directions/endpoints, schema, and bounds. Prompting reduces errors but never replaces server validation.
- **D-11:** Invalid plans receive exactly one bounded AI repair attempt using stable validation reason codes. The repair request MUST NOT contain raw Cypher, secrets, source content, or unrestricted error details.
- **D-12:** If repair still fails, server executes a safe one-hop fallback over ontology-valid relations. Invalid plan portions MUST never reach Neo4j.
- **D-13:** A valid seed continues even when another seed is unresolved or invalid. The response MUST report omitted/failed seeds explicitly; failures MUST NOT be hidden or erase valid evidence.
- **D-14:** Validation uses specific stable reason codes plus plain-language UI explanations. Codes distinguish invalid relation, direction, endpoint kind, hop limit, missing seed, rejection, truncation, and seed-only results.
- **D-15:** A requested depth above three returns `HOP_LIMIT_EXCEEDED` to the single repair attempt. If unrepaired, use the one-hop fallback rather than silently executing five hops or silently changing the original plan to three.

**Fusion, ranking, diagnostics, and evaluation**
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

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

## Summary

The `MAIN1.EVT_EVENT` regression is a chain of six independent defects, each of which alone can zero out graph evidence:

1. `defaultTraversalStepsForKind()` maps every node kind to exactly one relation and always uses direction `BOTH` (`knowledge-server/src/retrieval/queryPlanning.ts:469-498`). `DatabaseObject` gets only `READS_FROM`, so `WRITES_TO` writers are never queried — the regression question.
2. `buildDeterministicFallbackPlan()` applies `resolvedSeeds[0].kind` to all seeds (`queryPlanning.ts:516`), so mixed-kind seeds are planned as the first kind.
3. `normalizePlanSemantics()` rewrites any `IMPACT_ANALYSIS` + `DatabaseObject` plan to a single `READS_FROM` incoming step (`queryPlanning.ts:383-411`), and `neo4jRepository.traverse()` compensates with an ad-hoc second `WRITES_TO` query (`neo4jRepository.ts:1370-1398`). Correct behavior lives in the repository, not in planning or ontology.
4. Validation is incomplete: `validatePlanSemantics()` checks relation existence/hop ceiling/target-kind membership but never validates direction against registry `defaultDirection`, seed kind against `allowedSourceKinds`/`allowedTargetKinds`, or target kind against `allowedTargetKinds` (`queryPlanning.ts:416-464`). `validateTraversalPlan()` then silently clamps hops instead of returning `HOP_LIMIT_EXCEEDED` (`graphTraversal.ts:194-227`), directly contradicting D-15.
5. `neo4jRepository.traverse()` drops every zero-edge path (`neo4jRepository.ts:1468`) and requires `edges.length > 0` for completed partials, so a resolved seed with no relations vanishes entirely. Seed entities are never fetched separately.
6. Downstream, `runGraphModality()` merges chunks/entities/edges into one item list with `itemCount = chunks + entities + edges` and no entity/edge/path breakdown (`graphTraversal.ts:563`, `retrievalService.ts:784-793`); the relevance gate can blank all graph items when textual corroboration is missing (`retrievalService.ts:457-465`); RRF slice can cut a graph closure (`fusion.ts:260`); federated aggregation sums only `itemCount` (`federatedRetrievalService.ts:376-384`); `packEvidence()` packs only `type === 'chunk'` (`evidencePack.ts:178`); and neither protocol nor UI has `SEED_ONLY`, entity cards, counts, or stable plan-validation reason codes.

**Primary recommendation:** Introduce a pure `buildPerSeedPlans()` function in `queryPlanning.ts` that derives, for each resolved seed, the set of ontology-valid `(relation, direction, targetKind, maxHops)` tuples from `RETRIEVAL_ONTOLOGY_REGISTRY`; carry those plans as an internal execution structure (not model output); validate every tuple against the registry before any Neo4j call; execute only static parameterized templates; synthesize and preserve seed entities; return separate `entityCount/edgeCount/pathCount` plus `SEED_ONLY`; and protect complete graph packages through fusion. Extend server and client Zod schemas in lockstep with optional/backward-compatible fields. No new dependencies.

## Phase Success Criteria (planning map)

| SC | Criterion | Research support |
|----|-----------|------------------|
| SC-1 | Trace `MAIN1.EVT_EVENT` AI Chat → planning → Neo4j → normalization → fusion → rendering | Full chain traced in Summary; entry/exit points cited per file |
| SC-2 | Seed survives zero edges; separate entity/edge/path counts | Pitfall 3 + Pattern 3; `neo4jRepository.ts:1468`, `graphTraversal.ts:563` |
| SC-3 | Per-seed ontology rules, mixed kinds, all valid relations, no model Cypher | Pattern 1, 3; `queryPlanning.ts:469-498,516`; `ontology.ts:105-203` |
| SC-4 | Relation/direction/endpoint/hop validation with stable codes | Pattern 2, Pitfalls 1-2; `queryPlanning.ts:416-464`, `graphTraversal.ts:194-227` |
| SC-5 | Stable identity, deterministic ranking, dedup through federation | Pattern 4, Pitfall 6-7; `fusion.ts:16-27,178-260`, `federatedRetrievalService.ts:376-398` |
| SC-6 | Diagnostics metadata-only | Pitfall 10; `retrievalProtocol.ts:49-61,351-374`, `DiagnosticsPanel.tsx:46-140` |
| SC-7 | Reference baseline before `EXPLAIN`/`PROFILE` | Open Q5; `scripts/run-benchmark.ts`, `tests/ai/evaluatorCore.ts` |
| SC-8 | Live checks + offline BM25 preserved | Environment Availability, Pitfall 11; `scripts/test-knowledge-live.mjs`, `groundedTurn.ts:690-760` |

## Project Constraints (from CLAUDE.md)

- Runtime is 100% local; the knowledge server is optional. Docs, autosave, IndexedDB, BM25, and PWA must work with the daemon disabled, unreachable, or absent.
- IndexedDB is the working store; never introduce a server as canonical data source.
- UI must use Ant Design and stay simple, fast, responsive, accessible.
- PWA/service-worker updates must not cause data loss.
- Never put tokens or passphrases in `.env`, source, config, or bundle.
- DLP preview/approval before any Markdown leaves the client.
- Follow repository GSD workflow before edits; preserve unrelated working-tree files.
- Run only the smallest relevant tests (targeted first).
- Persist calendar dates as `YYYY-MM-DD`; stable client-generated UUIDs.
- Avoid new dependencies and broad refactors (roadmap constraint).


## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Entity resolution + token extraction | API/Backend (`queryPlanning.ts`) | — | Requires snapshot-scoped Neo4j data; must stay server-authoritative |
| Intent/depth proposal | API/Backend (LLM planner) | — | Model proposes, server validates; never generates Cypher |
| Ontology derivation of per-seed relations/directions/endpoints | API/Backend (`ontology.ts` registry) | — | Frozen registry is the single allowlist authority |
| Plan validation, repair, safe fallback | API/Backend (`queryPlanning.ts`, `graphTraversal.ts`) | — | Invalid portions must never reach Neo4j |
| Cypher execution | Database/Storage boundary (`neo4jRepository.ts`) | — | Only static parameterized templates; snapshot-scoped |
| Seed preservation + counts | API/Backend (`graphTraversal.ts`) | — | Requires traversal result, no client data |
| Fusion, graph closure protection, deterministic ranking | API/Backend (`fusion.ts`, `retrievalService.ts`) | — | Global result limit and RRF live here |
| Federated aggregation | API/Backend (`federatedRetrievalService.ts`) | — | Multi-set budgets and timeouts |
| Evidence packing + synthesis prompt | Browser/Client (`evidencePack.ts`, `groundedTurn.ts`) | — | Server response is already final evidence |
| Persistence of grounding record | Browser/Client (`groundedAnswerSchemas.ts`, IndexedDB) | — | Must remain readable across schema versions |
| Seed-only answer, entity card, diagnostics UI | Browser/Client (`AIChatDrawer`, `GroundedAnswerCard`, `DiagnosticsPanel`) | — | Rendering only; no retrieval decisions |
| Reference-query evaluation | Build/test tooling (`tests/`, `scripts/`) | API/Backend for live runs | Deterministic offline fixture first, live advisory second |

## Standard Stack

Existing stack only. No new runtime or dev dependencies are required for this phase.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | runtime `v20.19.5` observed (project doc targets 24 LTS) | Server/test runtime | Already installed locally; Vitest 5 requires `^22.12 || ^24 || >=26` — see Environment Availability |
| TypeScript | existing repo config | Types across server/client | Protocol mirrors must stay type-checked |
| Zod | 4.6.5 (root and knowledge-server) | Protocol, plan, response schemas | Already the trust-boundary validator on both sides |
| Fastify | 5.12.5 | Knowledge-server HTTP routes | Existing bearer-protected retrieval routes |
| neo4j-driver | 6.2.0 | Bolt queries | Only sanctioned Neo4j client |
| Vitest | 5.0.2 | Server + root tests | Existing test runner both packages |
| React + Ant Design | 19.3.0 / 6.6.5 | AI Chat UI | Fixed UI stack per CLAUDE.md |
| Dexie | 4.4.6 | Chat/grounding persistence | Existing local store |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@xenova/transformers` + `onnxruntime-node` | 2.17.2 | Local embeddings for vector modality | Existing; untouched by this phase |
| `tsx` | existing script runner | `run-benchmark.ts`, live scripts | Reuse for reference-set runner |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Extending existing `LogicalQueryPlan` with optional `seedPlans` | New parallel plan protocol | New protocol duplicates validation and breaks clients; avoid |
| Reusing `resolveEntities(snapshotId, seedUrns)` to synthesize seed entities | New `FETCH_SEEDS_BY_URN` Cypher query | Reuse is a smaller diff and already exact-URN matched; new query only if kind/canonicalName fidelity fails |
| Extending `ModalityStatusDetail` with optional counts | New diagnostics envelope | Existing status is already threaded server→federated→client; extending is backward-safe |
| Function-local scoring in `fusion.ts` | New graph ranking package | Over-engineering; scoring is a few comparators |

**Installation:** none. `npm install` must not be run for this phase.

## Package Legitimacy Audit

Not applicable — this phase adds **no** packages. All libraries used already exist in `package.json` / `knowledge-server/package.json` and are installed.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| — | — | — | — | — | not run (no new package) | Approved (existing) |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*If a later plan proposes a new dependency, it is out of scope for Phase 24 and must be rejected.*

## Architecture Patterns

### System Architecture Diagram

```text
AI Chat question ("Thành phần nào ghi vào MAIN1.EVT_EVENT?")
  |
  v
[Browser] groundedTurn ---------> federated retrieval request (sets, budgets, limit)
  |
  v
[Knowledge Server] retrievalService.executeUnderLease
  |
  +--> pin snapshot lease (or NO_EVIDENCE)
  |
  +--> resolveQueryEntities(query, recentTurns)
  |      -> seeds [{urn, kind, canonicalName}]  (bounded 3 turns / 5 URNs)
  |
  +--> buildQueryExecutionPlan
  |      |
  |      +--> fast path (pure identifier) ------------------+
  |      +--> LLM planner (intent + depth) -> validate -----+--> per-seed derivation
  |      |                                                     from ontology registry
  |      +--> invalid -> ONE repair -> invalid -> safe 1-hop  |
  |      +--> no seeds -> NO_GRAPH_SEED                       |
  |                                                           v
  |                                              per-seed valid tuples
  |                                              (relation, direction, targetKind, hops)
  |                                                           |
  +--> parallel modalities                                    |
  |      fulltext ----+                                        |
  |      vector ------+--> relevance gate --> RRF fusion <-----+
  |      graph -------+        |                 ^
  |         |                  |                 |
  |         +-- validateTraversalPlan (reject, not clamp)
  |         +-- static template per tuple --> Neo4j
  |         +-- seed entities always included (even zero edges)
  |         +-- separate entity/edge/path counts
  |         |
  |         +--> graph package (seed + edge/path + chunks) protected through fusion
  |
  +--> outcome selection: NEEDS_CLARIFICATION | UNSUPPORTED | SEED_ONLY |
  |                       NO_EVIDENCE | DEGRADED | READY
  |
  v
[federated aggregation] preserve per-set ordering + counts + stage metadata
  |
  v
[Browser] packEvidence (chunks for citations + entity refs for cards)
  |
  +--> grounded synthesis (limited answer; no inferred relations from seed-only)
  +--> ChatMessageGrounding persisted (optional new fields, historical records still readable)
  |
  v
AI Chat: limited answer + entity card ("find related" explicit action) + diagnostics detail
```

### Recommended Project Structure (unchanged; touch points only)

```text
knowledge-server/src/
├── graph/ontology.ts                 # registry authority (read-only)
├── retrieval/queryPlanning.ts        # per-seed plan derivation, validation, repair, fallback
├── retrieval/graphTraversal.ts       # reject-not-clamp, seed preservation, counts
├── graph/neo4jRepository.ts          # execute static templates; return zero-edge seeds
├── retrieval/fusion.ts               # closure protection + deterministic ordering
├── services/retrievalService.ts      # relevance gate, outcome, diagnostics assembly
├── services/federatedRetrievalService.ts
└── types/retrievalProtocol.ts        # SEED_ONLY, counts, reason codes

src/
├── services/knowledge/retrievalProtocol.ts   # mirrored schemas — change in lockstep
├── services/ai/groundedTurn.ts
├── services/ai/evidencePack.ts
├── services/ai/groundedAnswerSchemas.ts
└── components/ai/...                 # AIChatDrawer, GroundedAnswerCard, entity card, DiagnosticsPanel
```

### Pattern 1: Registry-derived per-seed relation sets

**What:** For a seed of kind `K`, a relation `R` is usable inbound when `K ∈ R.allowedTargetKinds`, outbound when `K ∈ R.allowedSourceKinds`. Direction defaults to `OUTGOING`; `INCOMING` is required for target-only seeds (e.g. `DatabaseObject`); `BOTH` only when the node kind appears on both sides or when explicitly justified.

**When to use:** Every plan — fast path, LLM plan, repair, fallback. This is the only sanctioned way to choose relations.

**Example:**
```ts
// Derived from RETRIEVAL_ONTOLOGY_REGISTRY; do NOT hardcode a relation list.
function validStepsForSeed(kind: NodeKind, maxDepth: number, allRelations: boolean): TraversalStep[] {
  const steps: TraversalStep[] = [];
  for (const [relationType, entry] of Object.entries(RETRIEVAL_ONTOLOGY_REGISTRY)) {
    const outbound = entry.allowedSourceKinds.includes(kind);
    const inbound = entry.allowedTargetKinds.includes(kind);
    if (!outbound && !inbound) continue;
    const direction = outbound && inbound ? 'BOTH' : outbound ? 'OUTGOING' : 'INCOMING';
    steps.push({
      relationType: relationType as RelationType,
      direction,
      maxHops: Math.min(1, entry.maxHops, maxDepth),
      targetKind: outbound ? entry.allowedTargetKinds[0] : entry.allowedSourceKinds[0],
    });
    if (!allRelations) break; // only when the planner selected a specific relation
  }
  return steps;
}
```
Note: with the current registry, only `PRECEDES`, `CALLS`, `EMITS`, `CONSUMES`, `USES_TYPE`, `HAS_STATUS` can produce `BOTH`; `CONTAINS_STEP`, `INVOKES`, `READS_FROM`, `WRITES_TO` are asymmetric and must not use `BOTH` blindly.

### Pattern 2: Reject-not-clamp validation

**What:** Plan validation returns a stable reason code; it never mutates depth. The single repair attempt receives that code. Unrepaired → safe one-hop ontology fallback (D-12, D-15).

**When to use:** `validatePlanSemantics` (pre-LLM-response acceptance) and `validateTraversalPlan` (pre-Neo4j execution).

**Required codes (minimum):** `INVALID_RELATION`, `INVALID_DIRECTION`, `INVALID_ENDPOINT_KIND`, `HOP_LIMIT_EXCEEDED`, `SEED_NOT_FOUND`, `PLAN_REJECTED`, `SEED_FOUND_NO_RELATION`, plus existing `NO_GRAPH_SEED`, `RESULT_LIMIT_REACHED`, `PLANNER_SCHEMA_FAILURE`, `PINNED_SNAPSHOT_UNAVAILABLE`, `TIMEOUT`, `UNCONFIGURED`, `PROVIDER_ERROR`, `MODEL_INDEX_MISMATCH`. Codes exposed to the client must be added to both protocol mirrors.

### Pattern 3: Seed preservation as a first-class traversal result

**What:** `BoundedGraphTraversalResult` carries `seedEntities`, `entities`, `edges`, `paths`, and `counts {entity, edge, path}`. Seeds come from a snapshot-scoped entity fetch and are unioned with traversal-discovered entities; zero-edge seeds are returned, never dropped.

**When to use:** Every graph execution that has at least one resolved seed.

**Example shape:**
```ts
interface BoundedGraphTraversalResult {
  status: { status: string; latencyMs: number; itemCount: number;
            entityCount: number; edgeCount: number; pathCount: number; reason?: string };
  seedEntities: EntityItem[];
  chunks: ChunkItem[];
  entities: EntityItem[];
  edges: EdgeItem[];
  paths: OrderedPathCandidate[];
}
```

### Pattern 4: Protected graph package through fusion

**What:** Before applying the global limit, identify each valid graph package = `{required seed URNs, required target URNs, required edge factKeys/path, supporting chunk IDs}`. Admit whole packages up to a bounded quota before filling remaining slots with RRF-ranked items. Drop only packages that already fail snapshot/ontology/bounds/citation closure (D-17).

**When to use:** `fuseRetrievalCandidates` + `tagRetrievalConflicts` + `closeOrderedPaths` pipeline.

**Quota (Claude's discretion):** e.g. up to 60% of `request.limit` reserved for graph packages, remainder for text; at least one textual item retained when text candidates exist. Never admit an edge/path without its supporting chunk.

### Anti-Patterns to Avoid

- **Hardcoded relation per kind:** reproduces the `CONTAINS_STEP`/`READS_FROM` blind spot. Derive from registry.
- **First-seed-kind governs all seeds:** wrong for mixed kinds; plan per seed.
- **`BOTH` as a safe default:** traverses invalid endpoint directions and inflates cost. Use registry-derived direction.
- **Silent clamping:** hides over-depth plans and violates D-15; reject with code, repair, then fallback.
- **Repository special cases:** the ad-hoc `IMPACT_ANALYSIS + READS_FROM` → also `WRITES_TO` branch belongs in planning, not Cypher selection.
- **Dropping zero-edge paths:** destroys valid seed evidence.
- **Separate counts collapsed into `itemCount`:** makes seed-only indistinguishable from empty.
- **Relevance gate blanking graph items:** removes evidence the user explicitly asked for by identifier.
- **Packing only chunks client-side:** entities never reach synthesis or rendering.
- **New protocol version without backward compatibility:** historical `ChatMessageGrounding` records become unreadable.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Relation/direction/endpoint validity | Hand-written relation switch per kind | `RETRIEVAL_ONTOLOGY_REGISTRY` | Frozen single authority; avoids drift |
| Cypher generation from plan | String concatenation or model-authored Cypher | `STATIC_TRAVERSAL_QUERIES` keyed `${relation}:${direction}:${hops}` | Injection surface + plan/query divergence |
| Cross-version schema validation | Manual field checks | Zod schemas in both protocol mirrors | Strict objects, superRefine invariants, existing test patterns |
| Rank fusion | New ranking engine | `fuseRetrievalCandidates` (RRF_K=60) + tie-break extension | Already deterministic and tested |
| Graph identity | New ID scheme | `type:id` composite + `factKey`/URN | Federated dedup depends on it |
| Citation closure | New closure check | `tagRetrievalConflicts` + `closeOrderedPaths` | Handles missing supporting chunks and conflicts |
| Timeouts / partial failure | `Promise.race` ad hoc | `runWithTimeout` + modality-local status mapping | Established fail-soft semantics |
| Live verification plumbing | New script | `scripts/test-knowledge-live.mjs` | Already does readiness→publish→rebuild→activate→retrieve |
| Reference evaluation | New harness | `scripts/run-benchmark.ts` + `tests/ai/evaluatorCore.ts` + `releaseGate.ts` | Deterministic-offline vs live-advisory modes already defined |

**Key insight:** every missing behavior has an existing seam. Phase 24 is mostly deletion of hardcoded shortcuts plus a small number of new pure functions and optional schema fields.

## Common Pitfalls

### Pitfall 1: Plan valid by Zod, invalid by ontology
**What goes wrong:** LLM emits `{relationType:'CONTAINS_STEP', direction:'BOTH', targetKind:'DatabaseObject'}`. Current validation accepts it (Zod knows the enum, not endpoints), Neo4j returns zero rows, and the failure is indistinguishable from "no data."
**Why it happens:** `validatePlanSemantics` (`queryPlanning.ts:416-464`) never compares kinds to `allowedSourceKinds`/`allowedTargetKinds`, and direction is never checked against registry.
**How to avoid:** Validate every step against the seed kind, registry endpoints, and direction legality; return `INVALID_ENDPOINT_KIND` / `INVALID_DIRECTION`.
**Warning signs:** graph status `ok`, `itemCount 0`, `NO_GRAPH_SEED` or `NO_EVIDENCE`, plan trace shows a plausible relation.

### Pitfall 2: Two validators disagree on depth
**What goes wrong:** planner validation rejects >3 while traversal validation silently clamps. Tests encode clamping (`knowledge-server/tests/graphTraversal.test.ts`, "clamps overall depth > 3 to 3").
**Why it happens:** `validateTraversalPlan` predates D-15.
**How to avoid:** Return `HOP_LIMIT_EXCEEDED`; update the clamping test to assert rejection + fallback.
**Warning signs:** warnings array populated while request succeeds with fewer hops than requested.

### Pitfall 3: Seed disappears at the repository boundary
**What goes wrong:** entity resolves, traversal runs, no edges, result empty.
**Why it happens:** `neo4jRepository.ts:1468` `if (path.edges.length === 0) continue;` and partial completion requires `edges.length > 0`.
**How to avoid:** Return seed nodes as first-class entities independent of path completion; never let path assembly gate entity output.
**Warning signs:** `NO_GRAPH_SEED` with a non-empty `resolvedUrns` trace, or `entities: []` while `RESOLVE_ENTITIES` matched.

### Pitfall 4: Seed-only treated as failure
**What goes wrong:** client falls back to BM25, asks for refinement, or reports "no evidence," even though the entity exists.
**Why it happens:** outcome enum has no `SEED_ONLY`; `isGraphNonProductive` treats `itemCount === 0` as failure (`groundedTurn.ts:708-713`); `evidencePack` packs only chunks.
**How to avoid:** Add `SEED_ONLY` to both outcome enums, branch before the refine/fallback logic, and render a limited answer + entity card.
**Warning signs:** entity present in diagnostics, answer says nothing found, no entity card.

### Pitfall 5: Graph evidence erased by the relevance gate
**What goes wrong:** identifier query resolves a seed, graph returns entities/edges, but `!hasTextualSupport` empties all graph items.
**Why it happens:** relevance gate is applied uniformly to all modalities (`retrievalService.ts:457-465`), and paths are only closed when `hasTextualSupport` (`:503`).
**How to avoid:** Exempt ontology-valid, bounded, snapshot-consistent graph packages from the textual-corroboration gate; keep the gate for text modalities.
**Warning signs:** graph status `ok`, counts > 0 in traversal, final `items` contain no graph entries.

### Pitfall 6: RRF slice truncates closure
**What goes wrong:** edge survives but its supporting chunk is cut by `slice(0, clampedLimit)`; `closeOrderedPaths` then drops the path.
**Why it happens:** fusion ranks individual items without package awareness.
**How to avoid:** Admit complete packages atomically; run closure before final slice or reserve quota.
**Warning signs:** paths returned by graph modality, zero paths in response, `MISSING_SUPPORTING_CHUNK`.

### Pitfall 7: Federated aggregation loses the evidence shape
**What goes wrong:** per-set entity/edge/path counts and reason codes disappear; only summed `itemCount` survives.
**Why it happens:** `federatedRetrievalService.ts:376-384` sums item counts and overwrites status.
**How to avoid:** Add optional count breakdown and per-stage metadata; aggregate additively without overwriting a more severe status with `ok`.
**Warning signs:** client diagnostics show only one number, no reason code.

### Pitfall 8: Protocol mirrors drift
**What goes wrong:** server adds `SEED_ONLY`, client parse rejects the response → `ERROR_INVALID_RESPONSE` → local fallback.
**Why it happens:** `src/services/knowledge/retrievalProtocol.ts` is a hand-maintained copy of the server types (it also inlines schemas the server imports from `graphProtocol.ts`).
**How to avoid:** Change both files in the same task; add a parity test asserting the enums/keys match.
**Warning signs:** server tests green, client normalization error, fallback reason `ERROR_INVALID_RESPONSE`.

### Pitfall 9: Persisted grounding schema breaks history
**What goes wrong:** strict `ChatMessageGroundingSchema` rejects old records once new required fields appear.
**Why it happens:** schema is `.strictObject` with `schemaVersion: z.literal(1)` and a superRefine requiring complete server provenance.
**How to avoid:** Add new fields as optional/defaulted; keep v1 records parseable; do not raise `schemaVersion` unless a migration is written.
**Warning signs:** chat history fails to load after deploy.

### Pitfall 10: Diagnostics leak content
**What goes wrong:** validation reason strings include URNs, query text, excerpts, or raw Cypher.
**Why it happens:** reason codes are currently `ReasonCodeSchema.or(z.string())` on `PlanTrace`, and error strings are interpolated with values.
**How to avoid:** Emit enum codes only; keep URNs only in the existing bounded `resolvedUrns` allowlist field; log counts/statuses.
**Warning signs:** any free-text reason containing user input or a Cypher fragment.

### Pitfall 11: Live verification assumes corpus contents
**What goes wrong:** live test asserts `MAIN1.EVT_EVENT` exists, but the gold fixture only defines `MAIN1.EVT_EVENT_OBJECT` (`knowledge-server/tests/fixtures/pilotGoldEntities.ts:28`).
**Why it happens:** the regression example is from a real corpus not committed as a fixture.
**How to avoid:** gate live assertions on preflight lookup; assert graceful `SEED_NOT_FOUND`/`NO_EVIDENCE` when absent; add a synthetic fixture for offline tests.
**Warning signs:** live test fails depending on machine/corpus.

## Code Examples

### Deriving valid relations per seed (replace kind switch)
```ts
// Source: knowledge-server/src/graph/ontology.ts (RETRIEVAL_ONTOLOGY_REGISTRY, lines 105-203)
// and queryPlanning.ts defaultTraversalStepsForKind (lines 469-498) to be replaced.
const entry = RETRIEVAL_ONTOLOGY_REGISTRY[relation];
const outbound = entry.allowedSourceKinds.includes(seed.kind);
const inbound = entry.allowedTargetKinds.includes(seed.kind);
if (!outbound && !inbound) continue;
```

### Reject instead of clamp
```ts
// Source: knowledge-server/src/retrieval/graphTraversal.ts:194-227 (current clamp to remove)
if (plan.overallMaxDepth > 3) {
  return { valid: false, reason: 'HOP_LIMIT_EXCEEDED' };
}
if (hops > registryEntry.maxHops) {
  return { valid: false, reason: 'HOP_LIMIT_EXCEEDED' };
}
```

### Preserve seed entities without edges
```ts
// Source: knowledge-server/src/graph/neo4jRepository.ts:1468 (current drop) and contracts.ts resolveEntities
const seedRecords = await this.resolveEntities(snapshotId, validSeeds);
const seedEntities = seedRecords.map(toEntityItem);
// union with traversal-discovered entities by urn; zero-edge seeds remain in output
```

### Separate counts + SEED_ONLY decision
```ts
// Source: knowledge-server/src/retrieval/graphTraversal.ts:563 (current combined itemCount)
const counts = { entityCount: seedEntities.length + entityList.length,
                 edgeCount: edgeList.length,
                 pathCount: paths.length };
const outcome = counts.edgeCount === 0 && counts.pathCount === 0 && counts.entityCount > 0
  ? 'SEED_ONLY' : /* existing READY / DEGRADED / NO_EVIDENCE selection */;
```

### Client outcome branch before fallback
```ts
// Source: src/services/ai/groundedTurn.ts:708-760 (current isGraphNonProductive / refine branch)
if (serverResponse.outcome === 'SEED_ONLY') {
  // limited answer + entity card; do NOT route to local BM25; do NOT imply relations
}
```

### Optional backward-compatible grounding fields
```ts
// Source: src/services/ai/groundedAnswerSchemas.ts:301-377
entities: z.array(PersistedEntityRefSchema).max(50).optional(),
graphCounts: z.strictObject({ entity: z.number().int().nonnegative(),
  edge: z.number().int().nonnegative(), path: z.number().int().nonnegative() }).optional(),
stageDiagnostics: z.array(StageDiagnosticSchema).max(20).optional(),
```

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Live graph snapshot contains `MAIN1.EVT_EVENT` as a `DatabaseObject` with at least one `WRITES_TO` writer and supporting chunk | Summary, Pitfalls 11 | Live acceptance cannot assert the exact regression; must assert graceful states |
| A2 | Docker daemon can be started and Neo4j + knowledge server can run locally for Phase 8 checks | Environment Availability | Live E2E blocked; correctness must be proven by unit/integration only |
| A3 | Nesting per-seed plans as optional `seedPlans` on `LogicalQueryPlan` is acceptable without breaking external consumers | Open Questions | If rejected, need internal-only plan type; larger diff |
| A4 | No external consumer (Telegram, MCP bridge) depends on `LogicalQueryPlan` shape or `itemCount` semantics | Open Questions | New optional fields are safe, semantic changes to `itemCount` may not be |
| A5 | The 9router LLM is available for planner repair testing | Environment Availability | Planner live tests must be mocked; still valid offline |
| A6 | Existing corpus exhibits mixed-kind seeds with multiple valid relations | Scenarios | Per-seed planning tests may need synthetic fixtures only |

## Open Questions

1. **How should per-seed plans be represented without breaking the strict single-plan protocol?**
   - What we know: `LogicalQueryPlanSchema` has one `seedUrns[]` and one `traversalSteps[]` (`retrievalProtocol.ts:128-141`).
   - What's unclear: whether `TraversalStep` should gain an optional `seedUrn`, or `LogicalQueryPlan` an optional `seedPlans[]`.
   - Recommendation: add optional `seedUrn` to `TraversalStep` (smallest change; unplanned steps apply to all seeds) OR keep per-seed plans purely internal to the server and expose only aggregate counts. Planner should choose one and test mixed kinds.

2. **What exactly is the `SEED_ONLY` response payload?**
   - What we know: D-02/D-03 require the outcome, limited answer, entity card, distinct counts.
   - What's unclear: whether seed entities appear in `items` (as `EntityItem`) or a new `seedEntities` field; whether `paths`/citations are empty.
   - Recommendation: reuse `EntityItem` in `items` (already a supported union member), return `paths: []`, `conflictGroups: []`, and `diagnostics` reason `SEED_FOUND_NO_RELATION`. No new item type.

3. **What is the protected graph quota?**
   - What we know: D-16 requires complete-package survival; D-17 forbids unconditional priority.
   - What's unclear: exact fraction under `limit` (10–50) and under federated `maxItems` (≤200).
   - Recommendation: reserve up to 50–60% for graph packages, always keep at least 1 text item when available, and enforce at package granularity.

4. **Where do stage diagnostics live: `ModalityStatusDetail`, `RetrievalDiagnostics`, or a new field?**
   - What we know: D-19 wants per-stage status/timings/counts/accepted/rejected/codes/truncation/fallback/before-after fusion.
   - What's unclear: client `ChatMessageGrounding` currently persists only `modalityDiagnostics` + `coverageWarnings`.
   - Recommendation: extend `ModalityStatusDetail` with optional counts, and add optional `stageDiagnostics[]` to server diagnostics and persisted grounding. Keep content-free.

5. **Where is the reference query set stored and what thresholds gate the phase?**
   - What we know: D-21 lists required query categories; `tests/fixtures/ai/grounded-assistant-reference.json` and `scripts/run-benchmark.ts` already exist.
   - What's unclear: whether Phase 24 adds a new graph-specific fixture or extends the existing 40-case set; what zero-result/recall/precision thresholds count as pass.
   - Recommendation: new deterministic graph fixture (no live dependency) with explicit expected URNs/relations; measure zero-result rate, entity recall, edge precision, identity preservation, citation/path closure, deterministic ordering, p50/p95 latency.

6. **Does any Telegram/MCP consumer read the changed fields?**
   - What we know: repo contains Telegram integration and MCP retrieval runner.
   - What's unclear: whether either serializes `itemCount` or outcome enums strictly.
   - Recommendation: grep both consumers during planning; add `SEED_ONLY` handling or map it to a safe message.

7. **How should Neo4j tuning be evidenced?**
   - What we know: D-22 mandates correctness baseline first, then `EXPLAIN`/`PROFILE` without quality loss.
   - What's unclear: where plans/profiles are captured.
   - Recommendation: capture query text hash + plan summary in a dev-only test/script, never in diagnostics; re-run the same reference set after each index/query change.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | all tests/scripts | ✓ | v20.19.5 (project doc targets 24 LTS) | Vitest 5 declares Node `^22.12 || ^24 || >=26`; verify before full-suite runs; targeted scripts may still run |
| npm | installs/scripts | ✓ | 10.8.2 | — |
| Docker CLI | local Neo4j/knowledge stack | ✓ | Compose v2.39.1 | — |
| Docker daemon | containers | ✗ (`docker info` failed) | — | Start Docker Desktop; otherwise skip live checks |
| Knowledge server | live retrieval/E2E | ✗ (`127.0.0.1:3001` unreachable) | — | Mock/integration tests; complete offline verification |
| Neo4j HTTP/Bolt | live graph checks | ✗ (`localhost:7474` unreachable) | — | `docker compose up -d` then poll readiness |
| 9router LLM | planner repair live tests | not probed | — | Stub planner + repair in tests |
| Local ONNX embedding model | vector modality live | not probed | `Xenova/multilingual-e5-small` (384d) | Existing offline tests mock embeddings |

**Missing dependencies with no fallback:**
- None for offline implementation and unit/integration verification.

**Missing dependencies with fallback:**
- Docker daemon / Neo4j / knowledge server / 9router: required only for the final live E2E criterion. Start `docker compose up -d` and `npm run knowledge:dev`, then `npm run test:knowledge:live`. If unavailable, live criterion must be reported as blocked, not silently skipped — correctness evidence still comes from offline suites.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 (root and `knowledge-server`) |
| Config file | `vite.config.ts` (root); `knowledge-server/vite.config.ts` (inferred — verify) |
| Quick run command | `npm --prefix knowledge-server test -- tests/retrievalPlanning.test.ts tests/graphTraversal.test.ts` |
| Full suite command | `npm --prefix knowledge-server test` then `npm test` |
| Live suite command | `npm run test:knowledge:live` |
| Benchmark command | `npm run benchmark` (deterministic offline), `tsx scripts/run-benchmark.ts --live` (advisory) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SC-1 | `MAIN1.EVT_EVENT` request traces planning→Neo4j→normalization→fusion→rendering | integration (stubbed gateway) + live | `npm --prefix knowledge-server test -- tests/retrievalService.test.ts`; `npm run test:knowledge:live` | ✅ (live needs corpus) |
| SC-2 | Resolved zero-edge seed survives with separate entity/edge/path counts | unit | `npm --prefix knowledge-server test -- tests/graphTraversal.test.ts` | ✅ |
| SC-3 | Per-seed ontology plans, mixed kinds, all valid relations, no model Cypher | unit | `npm --prefix knowledge-server test -- tests/retrievalPlanning.test.ts tests/nineRouterPlanner.test.ts` | ✅ (extend) |
| SC-4 | Relation/direction/endpoint/hop validation with stable codes | unit | `npm --prefix knowledge-server test -- tests/graphTraversal.test.ts tests/retrievalPlanning.test.ts` | ✅ (central test to add) |
| SC-5 | Stable identities, deterministic ranking, dedup through federation | unit | `npm --prefix knowledge-server test -- tests/retrievalFusion.test.ts tests/federatedRetrieval.test.ts` | ✅ |
| SC-6 | Diagnostics metadata-only; no query/content/credentials/raw Cypher | unit | `npm --prefix knowledge-server test -- tests/retrievalLogger.test.ts tests/retrievalRoutes.test.ts`; `npm test -- tests/ai/groundedAnswerSchemas.test.ts` | ✅ |
| SC-7 | Reference baseline: zero-result rate, recall, precision, latency | deterministic fixture | `npm run benchmark` (extend fixture/evaluator) | ✅ harness, ❌ graph reference set |
| SC-8 | Live Neo4j/knowledge-server/AI Chat checks + offline BM25 preserved | live + unit | `npm run test:knowledge:live`; `npm test -- tests/ai/groundedTurn.test.ts` | ✅ (live env needed) |

### Sampling Rate
- **Per task commit:** targeted file(s) only, e.g. `npm --prefix knowledge-server test -- tests/retrievalPlanning.test.ts`
- **Per wave merge:** `npm --prefix knowledge-server test`
- **Before `/gsd-verify-work`:** both full suites green; record skipped live checks explicitly
- **Live gate:** `docker compose up -d` → `npm run knowledge:dev` → `npm run test:knowledge:live`

### Wave 0 Gaps
- [ ] `knowledge-server/tests/ontologyPlanning.test.ts` (or extend `retrievalPlanning.test.ts`) — per-seed derivation, mixed kinds, all-relations fallback
- [ ] `knowledge-server/tests/graphPlanValidation.test.ts` — relation/direction/endpoint/hop reject codes, repair-once, fallback; replace clamping assertions
- [ ] `knowledge-server/tests/graphSeedPreservation.test.ts` — zero-edge seed, counts, `SEED_ONLY` mapping
- [ ] `knowledge-server/tests/fixtures/pilotGoldEntities.ts` — add synthetic `MAIN1.EVT_EVENT` seed + `WRITES_TO` writer + supporting chunk (fixture currently has only `MAIN1.EVT_EVENT_OBJECT`, line 28)
- [ ] `tests/fixtures/ai/graph-retrieval-reference.json` — deterministic graph reference cases (D-21 categories)
- [ ] Client parity test — server/client outcome + reason-code enums match; (`groundedAnswerSchemas` backward-compat test may already exist)
- [ ] `src/services/ai/groundedTurn.test.ts` — `SEED_ONLY` branch does not trigger local BM25
- [ ] UI test — `GroundedAnswerCard`/entity card renders seed-only without implying relations

*Existing tests that must change (not gaps):* `knowledge-server/tests/graphTraversal.test.ts` currently asserts clamping (`clamps overall depth > 3 to 3`); D-15 requires rejection.

## Security Domain

`workflow.security_enforcement: true`, `security_asvs_level: 1`.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no (unchanged) | Existing bearer auth on knowledge-server routes |
| V3 Session Management | no | — |
| V4 Access Control | yes (preserve) | Bearer-protected retrieval/graph routes; no new public surface; snapshot scoping |
| V5 Input Validation | yes | Zod schemas both sides; registry allowlist; plan validation before Neo4j; static Cypher templates only |
| V6 Cryptography | no (unchanged) | Existing transport/auth only |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cypher injection via plan/model output | Tampering | Never interpolate; use `STATIC_TRAVERSAL_QUERIES` with parameters; validate enums first |
| Prompt injection causing over-broad traversal | Elevation of privilege | Closed ontology allowlist, server-authoritative validation, depth cap 3, bounded limit |
| Secret/credential leakage in diagnostics or repair prompt | Information disclosure | Content-free codes only; never include tokens, query text, excerpts, Cypher, or stack traces |
| Cross-snapshot evidence mixing | Tampering | Pinned snapshot lease; path/edge/chunk snapshot equality checks remain enforced |
| Resource exhaustion via many relations/seeds | DoS | ≤5 seeds, ≤5 steps, hop ceilings, 100 nodes/200 edges/20 paths caps, modality timeout |
| Unauthorized data access | Information disclosure | Preserve route auth and set/snapshot scoping; no new endpoints needed |
| Stored XSS via entity card labels | Tampering | Canonical names rendered as text (React escapes); no HTML injection |

## Sources

### Primary (HIGH confidence — repository evidence)
- `knowledge-server/src/graph/ontology.ts:92-203` — registry fields, per-relation endpoints, directions, hop ceilings, `HAS_STATUS` functional slot
- `knowledge-server/src/retrieval/queryPlanning.ts:383-411,416-464,469-498,503-544,549-564,675-782` — normalization, incomplete validation, hardcoded kind defaults, first-seed fallback, fast path, repair/fallback
- `knowledge-server/src/retrieval/graphTraversal.ts:83-92,152-265,466-577` — static templates, clamping, entity/edge/path mapping, combined `itemCount`
- `knowledge-server/src/graph/neo4jRepository.ts:63-72,373-382,1279-1313,1370-1398,1401-1468` — constraints/indexes, `RESOLVE_ENTITIES`, depth guard, ad-hoc `WRITES_TO`, zero-edge-drop
- `knowledge-server/src/services/retrievalService.ts:409-465,487-503,551-555,727-794` — relevance gate, fusion inputs, outcome selection, graph modality combination
- `knowledge-server/src/retrieval/fusion.ts:16,27,56,178-260,272-361` — RRF, priority, slice, closure, supporting-chunk tagging
- `knowledge-server/src/services/federatedRetrievalService.ts:268-272,333-352,376-398` — budgets, status aggregation, outcome
- `knowledge-server/src/types/retrievalProtocol.ts:13-22,49-61,66-90,100-141,215-250,279-330,351-374,417-518,560-623` — outcomes, reason codes, plan, path, items, response invariants, federated
- `src/services/knowledge/retrievalProtocol.ts:51-60,98,168-181,255-290,624-660` — client mirror (drifts from server imports)
- `src/services/ai/groundedTurn.ts:708-760` — graph non-productive / refine / fallback branch
- `src/services/ai/evidencePack.ts:147-213` — chunk-only packing
- `src/services/ai/groundedAnswerSchemas.ts:277-377` — outcome enum and strict persisted grounding
- `src/components/ai/grounded/DiagnosticsPanel.tsx:46-140` — current metadata surface
- `knowledge-server/tests/graphTraversal.test.ts`, `retrievalPlanning.test.ts`, `retrievalFusion.test.ts`, `federatedRetrieval.test.ts`, `tests/ai/evalHarness.test.ts` — existing coverage
- `knowledge-server/tests/fixtures/pilotGoldEntities.ts:28` — only `MAIN1.EVT_EVENT_OBJECT`
- `.planning/phases/24-graph-retrieval-optimization/24-CONTEXT.md` — D-01…D-22
- `docs/GRAPH_RETRIEVAL_OPTIMIZATION_ROADMAP.md` — staged roadmap and constraints
- `.planning/phases/23-knowledge-graph-build-reliability-entity-fidelity/23-VALIDATION.md` — validation-doc format precedent
- `scripts/test-knowledge-live.mjs`, `scripts/run-benchmark.ts`, `tests/ai/{evaluatorCore,releaseGate,reportGenerator}.ts` — live and benchmark harnesses
- `docker-compose.yml`, `CLAUDE.md` — local stack and offline-first constraints

### Secondary (MEDIUM confidence)
- Runtime probes this session: `node --version` → v20.19.5; `npm --version` → 10.8.2; `docker compose version` → v2.39.1; `docker info` failed; knowledge server and Neo4j HTTP unreachable.

### Tertiary (LOW confidence)
- Assumption A1 that the live corpus contains `MAIN1.EVT_EVENT` with a `WRITES_TO` writer and supporting chunk — not verifiable without the live stack.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all existing, versions read from repo/registry files; no additions
- Architecture: HIGH — line-level evidence for every failure point
- Pitfalls: HIGH for offline behavior; MEDIUM for live-corpus assumptions
- Environment: MEDIUM — daemon/services down; Node version mismatch with documented target

**Research date:** 2026-10-24
**Valid until:** ~2026-11-23 for stable code paths; re-check if Phase 23 or retrieval protocol changes land first
