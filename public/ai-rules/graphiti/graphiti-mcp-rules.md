# Shared Graphiti MCP and Source MCP Rules

Use these rules in Claude Code. Connect `graphiti-memory` (Graphiti MCP) and `svng-source` (Source MCP) separately; use the `svng-source` endpoint only from the approved office/VPN network. The reader has no TLS, authentication, or application authorization. Never expose it publicly.

## Graphiti MCP (`graphiti-memory`): catalog identity and memory

- Search before proposing or recording knowledge. Call `list_advertised_groups` to select the relevant catalog and memory groups; do not guess group IDs. Use `search_nodes` for entities and `search_memory_facts` for relationships, both with explicit `group_ids`. Use `center_node_uuid` only for an already identified node.
- Search `Preference`, `AgentProcedure`, and `Requirement` for conventions and SOPs. The catalog Procedure is not the agent SOP type; use `Procedure` for Oracle stored routines. Prefer specific applicable results over general ones.
- Use `resolve_typed_entities` to resolve a qualified catalog identity. Use `get_catalog_object_context` with `system_key`, `group_id`, `entity_type`, and `graph_key` in `request` for exact context, and `get_catalog_evidence` for links on an exact entity or edge. For a section citation, verify the occurrence in the matching pinned document; a `DocumentedBy` citation does not prove a call or data transfer.

## Source MCP (`svng-source`): read-only evidence for business flows

1. Start with a concrete business question. Resolve the relevant catalog objects and `SourceArtifact` identities in Graphiti. Use the reader's configured `group_id`; do not pass `projectPath`, arbitrary paths, or credentials.
2. Use `search_source` or `explore_source` to find candidates, and `source_callers` or `source_callees` to narrow a call path. These tools query only the active indexed generation (`latest`). Check each result's `commit_sha`; a rollout can change it between calls. Do not combine results from different commits into one trace.
3. Verify the exact snippet with `read_source`: pass `group_id`, `graph_key`, `start_line`, `end_line` (1-based, at most 100 lines per call), and an explicit `commit_sha`. For a dump-backed claim, use the dump's baseline commit, not `latest`. Get the repository-relative path and expected hash from matching catalog evidence or the approved manifest for that commit. Check the returned `source_sha256` against that hash. Cite group, graph key, commit, path, hash, and line range. If any of these cannot be verified, report the gap; never substitute `latest` or reuse its line numbers for the baseline.
4. Separate what the code proves from what ran in production. Search hits, caller/callee candidates, shared queue names, unresolved dynamic SQL, and ambiguous dispatch do not establish a relationship. Verify the type, direction, and both endpoints; use approved configuration or traces where runtime routing is at issue. Keep unresolved candidates out of the graph.

Source MCP reads the mounted snapshots; it does not call Graphiti or Neo4j or write to the graph. Business-flow investigation and rule validation are read-only. Prepare an evidence-backed proposal when asked for enrichment; do not apply it to a live group.

## Catalog and memory write routes

These routes describe permitted writes, not permission to write. Use them only for an explicitly authorized task targeting an approved, writable, non-live group. Record only new or changed durable knowledge. Do not deploy, replay catalog batches into live groups, run full ingest, clear graphs, or delete existing data.

- Use `add_memory` for durable contextual findings, rules, and exceptions. Supply `catalog_binding` and `fact_metadata` for catalog-bound learning. The binding and write must use the same `group_id`; do not bind across groups. `add_memory` does not change catalog summary.
- Use `patch_catalog_enrichment` deliberately to set or unset a current enrichment value, with evidence, a reason, and an idempotency key. Business descriptions belong in business_description, not summary. Read `get_catalog_object_context` and `get_catalog_enrichment_history` when needed. Do not turn every episode into an enrichment patch.
- Use `upsert_catalog_batch` only for missing catalog objects backed by DDL or dictionary evidence, with provenance covering every new entity and edge. Never infer ForeignKeyTo from a join hypothesis; store inferred joins as contextual memory facts, not catalog structure. Never guess endpoint existence or graph keys. Do not use upsert_typed_* to bypass create-only.
- For `add_memory`, accepted is not completion. Poll `get_memory_receipt` with `receipt_id` and `group_ids` until completed or failed. If completed with bound_fact_count = 0, report catalog_binding_unattached; do not claim attachment. Inspect `bound_catalog_uuid`, `bound_fact_count`, and `warning` before claiming a catalog-bound fact was remembered.
- Enrichment is not fulltext/vector searchable in Milestone 1; read exact object context/history or related facts instead. `update_entity` may repair only ordinary memory nodes, never catalog-managed nodes.
- Always pass explicit group_id for mutations and catalog requests; pass explicit group_ids for search and receipt reads. The server derives write_mode; do not send it or assume permissions. Create-only permits created or unchanged; a different catalog hash returns catalog_update_not_permitted.
- Do not bypass permission_denied, protected_group, or catalog_update_not_permitted through another tool; stop and report the denial. Rights and group tiers are enforced by the server, not this prompt.
- Never persist secrets (passwords, connection strings, API keys). Never use `clear_graph`, `delete_episode`, or `delete_entity_edge` in the SQL-memory workflow.
