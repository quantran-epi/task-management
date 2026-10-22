# Graph Retrieval Optimization

## Context

TaskMate AI Chat Drawer uses federated retrieval across graph, vector, full-text, and local BM25 fallback.

Current issue: questions about entities that exist in Neo4j, such as `MAIN1.EVT_EVENT`, can still return zero graph items.

Known causes:

- Fast-path planning may choose a relation incompatible with the resolved entity kind.
- `DatabaseObject` needs relations such as `READS_FROM` and `WRITES_TO`, but existing logic has used `CONTAINS_STEP`.
- A resolved seed entity can disappear when traversal finds no edge.
- Mixed entity kinds, unsupported kinds, and multi-relation traversal are not handled fully.

An experimental partial fix exists at:

`D:\personal\task-management\.claude\worktrees\agent-a6d794e9ed6831a8f`

That patch improves relation selection for several entity kinds, but it is not a complete graph retrieval design.

Target outcome:

- Preserve existing entities even when they have no edges.
- Build query plans from the existing ontology.
- Plan traversal separately for each seed and support multiple valid relations.
- Validate plans before querying Neo4j.
- Keep traversal bounded and deterministic.
- Preserve valid graph results through ranking and federated fusion.
- Provide safe stage-level diagnostics.
- Optimize Neo4j only after correctness is verified.
- Prove behavior with targeted tests and live AI Chat Drawer checks.

Constraints:

- Preserve offline-first behavior and local BM25 fallback.
- Keep knowledge server optional.
- Never generate raw Cypher from model output.
- Never expose user queries, source content, credentials, or raw Cypher in diagnostics.
- Avoid new dependencies and broad refactors.
- Preserve unrelated working-tree files.
- Run only smallest relevant tests.
- Follow repository GSD workflow before editing code.

## Roadmap

### Phase 1 — Trace and Baseline

Trace request from AI Chat Drawer through planning, Neo4j retrieval, normalization, fusion, and UI. Add regression reproduction for `MAIN1.EVT_EVENT` returning zero graph items.

### Phase 2 — Preserve Graph Entities

Keep resolved seed entities when no edge or path exists. Distinguish entity, edge, and path counts.

### Phase 3 — Ontology-Driven Planning

Replace hardcoded relation selection with ontology-driven, per-seed, multi-relation traversal planning.

### Phase 4 — Plan Validation and Bounds

Validate relation, direction, endpoint kinds, and hop limits before Neo4j execution. Return stable reason codes for empty or rejected results.

### Phase 5 — Ranking, Deduplication, and Fusion

Use stable graph identities, deterministic ranking, and correct deduplication. Ensure federated fusion does not suppress valid graph evidence.

### Phase 6 — Diagnostics and Evaluation

Add metadata-only diagnostics for each retrieval stage. Build a reference query set and measure zero-result rate, recall, precision, and latency.

### Phase 7 — Neo4j Performance

Use `EXPLAIN` and `PROFILE` to identify proven bottlenecks. Optimize indexes, Cypher shape, result limits, and query count without hiding correctness problems behind caching.

### Phase 8 — Live End-to-End Verification

Run real Neo4j and knowledge server integration. Verify entity lookup, read/write relations, seed-only results, bounded multi-hop retrieval, and final AI Chat Drawer rendering.

## Reusable Agent Prompt

```md
Read `docs/GRAPH_RETRIEVAL_OPTIMIZATION_ROADMAP.md` and execute Phase <N>: <phase name>.

Dive deep into current implementation and verify assumptions with code and runtime evidence. Scope work to this phase only; do not implement later phases early.

Use repository GSD workflow before edits. Preserve compatibility and unrelated files. Add smallest targeted regression tests and run only relevant tests.

Report:

- Findings or root cause
- Files changed
- Tests run and results
- Phase acceptance result
- Remaining risks
- Readiness for next phase
```
