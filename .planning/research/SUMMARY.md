# Research Summary: Hybrid GraphRAG Knowledge Assistant MVP

**Milestone:** v1.2
**Synthesized:** 2026-10-07
**Confidence:** High

## Executive Summary

Build an optional TypeScript/Fastify knowledge server over the scheduled-process `60000006` Markdown corpus. Markdown remains the canonical source; Neo4j graph, vector, and full-text indexes are disposable projections. PlannerMate retains local IndexedDB documents and local BM25 search when the server is unavailable.

Ingestion uses deterministic Markdown AST parsing for headings, tables, code blocks, identifiers, wiring, and source ranges before Claude handles semantic relationships found only in prose. Every fact retains provenance and an evidence classification of `OBSERVED`, `INFERRED`, or `BUSINESS_APPROVED`. Composite URNs prevent collisions such as `PRC_PROCESS:60000006` and `PRC_CONTAINER:60000006`.

Queries combine full-text, vector, and bounded Cypher traversal through Reciprocal Rank Fusion. Answers must cite exact document sections or line ranges, expose graph paths for dependency questions, report conflicts, and abstain when evidence is missing.

## Recommended Stack

- Node.js 24 LTS with TypeScript and Fastify 5.12.5.
- Neo4j 5.26+ with `neo4j-driver` 6.2.0 for graph, vector, and full-text retrieval.
- `unified` 11.0.5, `remark-parse` 11.0.0, `remark-gfm` 4.0.1, and `mdast-util-to-string` 4.0.0 for provenance-preserving Markdown parsing.
- Official `@anthropic-ai/sdk` 0.131.0 for structured extraction and grounded synthesis.
- Zod 4.6.5 for ingestion and API boundary validation.
- Existing local BM25 implementation as offline fallback.

Avoid Python/LangChain, a separate vector database, regex-only chunking, Kafka, and autonomous agent infrastructure for this MVP.

## Expected Features

### Table Stakes

- Publish normalized Markdown with SHA-256 change detection and incremental reindexing.
- Preserve tables, code blocks, ASCII call chains, headings, and source line spans as atomic evidence.
- Build collision-safe graph identities and a controlled pilot ontology.
- Classify evidence as observed, inferred, or business-approved.
- Support exact-code lookup, semantic search, process flow, call chain, and bounded three-hop impact queries.
- Return source-grounded answers with citations and explicit abstention.
- Fall back to local BM25 search when the optional server is unavailable.

### Useful Differentiators

- Temporal or environment-specific conflict reporting, such as unconstrained versus `IVN_OBJECT`-filtered behavior.
- Step-by-step graph path cards in the existing AI Chat Drawer.
- Review visibility for inferred relationships.

### Deferred

- All card-system domains beyond the `60000006` pilot.
- Interactive graph canvas/editor.
- Automated EAR decompilation.
- Production ingestion of sensitive banking/customer data.
- Separate vector database or message broker.

## Architecture

1. PlannerMate publishes selected normalized Markdown through a knowledge client.
2. Fastify server runs DLP checks, AST parsing, source-range extraction, and SHA-256 delta detection.
3. Deterministic extraction creates identifiers and explicit relations from tables and structured blocks.
4. Claude extracts prose-only semantic relations, always tagged `INFERRED` unless supported by stronger evidence.
5. Identity resolver creates composite URNs and validates entities/relations before Neo4j upsert.
6. Query router runs Neo4j full-text, vector, and bounded Cypher retrieval in parallel, then fuses results.
7. Evidence packager emits facts, paths, citations, conflicts, and missing-evidence markers.
8. Claude synthesizes the answer under strict evidence-only and abstention rules.
9. PlannerMate renders answer, citations, and path cards; on server failure it uses local BM25.

## Critical Pitfalls and Controls

1. **Entity collision:** namespace every graph identity, e.g. `urn:bpc:entity:prc_process:60000006`.
2. **Epistemic collapse:** preserve `OBSERVED`, `INFERRED`, and `BUSINESS_APPROVED`; never silently promote inferred relations.
3. **Syntax-destructive chunking:** use Markdown AST and keep tables, SQL, and ASCII diagrams atomic.
4. **Hub-node explosion:** store low-value enums as properties where suitable; bound traversal to 1–3 hops and cap returned paths.
5. **Hard server coupling:** use short health checks/circuit breaking and immediate local-search fallback.
6. **Citation hallucination:** citations come from server-created evidence IDs and source spans, not model-generated paths.
7. **Sensitive data leakage:** reject or redact PAN, CVV, PIN/PIN block, HSM keys, credentials, and customer PII before indexing or external calls.
8. **Shallow evaluation:** benchmark exact lookup, semantic retrieval, call chains, three-hop paths, conflicts, and required abstention.

## Suggested Build Order

1. Knowledge server foundation, DLP checks, AST ingestion, incremental hashes, and offline client fallback.
2. Collision-safe ontology, deterministic extraction, evidence classification, and Neo4j ingestion.
3. Full-text/vector indexes, bounded graph traversal, query routing, and result fusion.
4. Evidence packaging, Claude synthesis, citations, graph-path UI, conflicts, and abstention.
5. Benchmark verification, security checks, and offline smoke testing.

## Research Flags

- Tune Neo4j uniqueness constraints and branch-pruned bounded Cypher during graph phase planning.
- Benchmark embedding quality and latency for Vietnamese/English technical text before locking provider/model.
- Keep path UI as lightweight Ant Design cards; no graph visualization dependency for MVP.
