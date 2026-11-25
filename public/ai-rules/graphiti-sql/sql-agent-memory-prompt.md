# SQL agent memory prompt

<!-- BEGIN COPY-PASTE PROMPT -->
When developing SQL — writing or editing queries, DDL, migrations, views, indexes, stored procedures, functions, packages, schema objects, or triggers — use the `graphiti-memory` MCP server.

LLM types never authorize ForeignKeyTo, endpoint existence, or graph keys. extraction types are memory vocabulary; catalog topology is deterministic. add_memory and add_triplet must not accept or emit catalog structural edge types. Physical facts stay under catalog upsert/replay.

Before writing SQL:
1. Call `list_advertised_groups`.
2. Call `search_nodes` with `entity_types` `Preference`, `AgentProcedure`, `Requirement` for conventions and pitfalls; also `Table`, `Column`, `View` when looking up schema. Pass `group_ids` on every search. Omitted or blank `group_ids` return a validation error (no default-group fallback).
3. Call `search_memory_facts` with `edge_types` `ForeignKeyTo` when looking up keys. Pass `group_ids`. Omitted or blank `group_ids` return a validation error (no default-group fallback). For `SVFE_SHB` and `MAIN1` FK lookups, use exactly one of `current_only: true` or `as_of`. For other schemas, these filters are optional but still mutually exclusive. The table shows API defaults, not the required values for those two schemas.

| Parameter | Default | Meaning |
|---|---|---|
| `current_only` | `False` | When true, return only facts with no invalid_at (current valid-time facts). Cannot be combined with `as_of` or invalid_at bounds. |
| `as_of` | `None` | ISO-8601 instant; facts active when valid_at <= as_of and (invalid_at is null or invalid_at > as_of). Valid-time only; transaction-time created_at/expired_at are omitted. When set, raw `valid_at_*` / `invalid_at_*` bounds are ignored. Cannot be combined with `current_only`. |

4. Use `center_node_uuid` only after a node UUID is known.
5. Use `get_catalog_object_context` for one known catalog object. Join discovery is one-hop only: read ForeignKeyTo neighbors from that object-context page and reconstruct multi-column joins from neighbor attributes `source_columns` paired with `target_columns` at matching indices as AND-ed ON predicates — do not guess column order. Do not ask for a path tool or extra hop parameters.
When `get_catalog_object_context` returns `freshness.stale` true, do not treat catalog metadata as the current source of truth; re-verify column types, keys, and DDL against the live source before relying on them.

Column-to-column lineage, extra index-membership topology, and BusinessConcept/QueryPattern taxonomies are deferred until a concrete producer and SQL acceptance case exist.

When tracing how application code uses SQL, follow the [Source MCP workflow](graphiti-mcp-rules.md#source-mcp-svng-source-read-only-evidence-for-business-flows). Use pinned source evidence; a SQL text match does not prove a business-flow edge.

Record durable SQL facts (conventions, join patterns, pitfalls, required filters) only when the task permits writes and the target group is approved, writable, and non-live. Use `add_memory` with the note in `episode_body`. Pass `group_id`; it is required, and a call that omits it returns `group_id_required`. Searches and receipt reads require explicit `group_ids`. For catalog-bound learning, pass `catalog_binding` with the same `group_id` and either `uuid` or `entity_type` plus `graph_key`, and `fact_metadata` with `evidence_level` (`approved_business` or `unverified_hypothesis`). A protected catalog object cannot be bound by writing into another group. `accepted` is not completion: poll `get_memory_receipt` with `receipt_id` and `group_ids` until `completed` or `failed` before reporting the result.

Search the catalog `Procedure` label only for Oracle stored routines; it is not the agent SOP type.

Follow retrieved `AgentProcedure` steps. Prefer specific hits over general ones.

If `add_memory` is refused with `protected_group`, stop and tell the user. Do not retry via catalog upsert or deletion tools.

Never persist secrets (passwords, connection strings, API keys) via `add_memory`.
Never call `clear_graph`, `delete_episode`, or `delete_entity_edge` as part of this SQL-memory workflow.

Choose the write route deliberately:
- Use `add_memory` for contextual findings, rules, and exceptions; use the binding and fact metadata described above for catalog-bound learning. `add_memory` does not change catalog summary.
- Use `patch_catalog_enrichment` to set or unset a current enrichment value, with evidence, a reason, and an idempotency key. Business descriptions belong in `business_description`, not `summary`. Read `get_catalog_object_context` and `get_catalog_enrichment_history` when needed. Do not turn every episode into an enrichment patch.
- Use `upsert_catalog_batch` only for missing catalog objects backed by DDL or dictionary evidence, with provenance covering every new entity and edge. Never infer `ForeignKeyTo` from a join hypothesis; store inferred joins as contextual memory facts, not catalog structure. Never guess endpoint existence or graph keys. Do not use `upsert_typed_*` to bypass create-only.

If the polled receipt is completed with `bound_fact_count` = 0, report `catalog_binding_unattached`; do not claim attachment. Inspect `bound_catalog_uuid`, `bound_fact_count`, and `warning` before claiming a catalog-bound fact was remembered.
Enrichment is not fulltext/vector searchable in Milestone 1; read exact object context/history or related facts instead. `update_entity` may repair only ordinary memory nodes, never catalog-managed nodes.
Always pass explicit `group_id` for mutations and catalog requests; pass explicit `group_ids` for search and receipt reads. The server derives `write_mode`; do not send it or assume permissions. Create-only permits created or unchanged; a different catalog hash returns `catalog_update_not_permitted`.
Do not bypass `permission_denied`, `protected_group`, or `catalog_update_not_permitted` through another tool; stop and report the denial. Rights and group tiers are enforced by the server, not this prompt.
<!-- END COPY-PASTE PROMPT -->
