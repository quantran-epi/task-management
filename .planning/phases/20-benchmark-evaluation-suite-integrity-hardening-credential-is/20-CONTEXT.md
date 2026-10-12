# Phase 20: Benchmark Evaluation Suite, Integrity Hardening & Credential Isolation - Context

**Gathered:** 2026-10-12
**Status:** Ready for planning after Phase 19.1 completes

<domain>
## Phase Boundary

Phase 20 validates Phase 16–19 behavior after Phase 19.1 delivers the real Neo4j artifact and runtime integration. It expands the existing 20-case grounded-assistant replay suite to 40 risk-weighted cases, applies explicit answer/path release gates, verifies semantic rebuild equivalence against the real Neo4j artifact, exercises offline recovery behavior, and preserves the existing minimal server-side credential boundary.

Phase 20 does not deploy Neo4j, redesign retrieval or answer synthesis, broaden the pilot corpus, add a secret-management subsystem, or expand DLP to all chat/query traffic. Those implementation contracts must come from completed Phase 19.1 and existing Phase 16–19 decisions.

**Execution prerequisite:** Phase 20 MUST start only after Phase 19.1 is complete and its final context, plans, summaries, artifact topology, schema initialization, readiness, rebuild, and runtime commands are available. Planning must consume those artifacts rather than guess their final paths or commands.

</domain>

<decisions>
## Implementation Decisions

### Scoring and release gate
- **D-01:** Use hybrid release gates: aggregate score, per-category score, explicit three-hop score, path-fidelity gate, and zero-tolerance trust invariants.
- **D-02:** Required thresholds are overall pass rate `>= 90%`, every category `>= 80%`, three-hop answer success `>= 90%`, and graph path fidelity `100%`.
- **D-03:** Trust invariants have zero tolerance. Any unsupported material claim, invalid or cross-snapshot path, suppressed conflict branch or silently selected winner, credential leakage, Phase 16 DLP bypass, or network egress from an offline fallback path fails the release regardless of aggregate score.
- **D-04:** Run all cases and report all failures. Never mask a failure with retry. Retry may diagnose nondeterminism, but an unstable first result remains a failure.
- **D-05:** A correct conclusion with an invalid hop fails path fidelity. Every expected path edge must match its source identity, relation type, target identity, and snapshot boundary.

### Benchmark case mix
- **D-06:** Benchmark contains exactly 40 version-controlled cases for this phase: preserve the existing 20 Phase 19 reference cases and add 20 risk-weighted cases.
- **D-07:** Allocate the 20 new cases as: 6 multi-hop/path, 4 semantic/scope, 3 conflict/abstention, 4 security/integrity, and 3 rebuild/offline recovery.
- **D-08:** Use mixed fixtures. Representative user queries and three-hop acceptance cases use the canonical process `60000006` pilot corpus. Rare corruption, cycle, timeout, isolation, and other controlled failure states may use small synthetic fixtures.
- **D-09:** Each case uses a semantic expected contract, not an exact prose snapshot. Contracts may assert expected outcome, required facts, required paths, expected sources and ranges, forbidden claims, and behavioral invariants.
- **D-10:** Existing exact lookup, process flow, call chain, conflict, abstention, fallback, language-lock, prompt-injection, and navigation cases remain regression baseline. New cases concentrate on uncovered high-risk behavior rather than inflate scores with duplicate easy lookups.

### Harness and reports
- **D-11:** `npm run benchmark` is the maintainer entry point. It runs the deterministic suite and applies release gates. Targeted Vitest invocation remains available for debugging individual cases; do not create an independent duplicate assertion engine.
- **D-12:** Deterministic, offline replay is the authoritative release gate. Provider calls are mocked or replaced by fixed fixtures, making the gate reproducible, free of network dependencies, and safe for CI.
- **D-13:** An optional live-provider smoke mode may exist only behind explicit opt-in. It uses sanitized fixtures, writes a separate advisory report, and never replaces or changes the deterministic release score.
- **D-14:** Each benchmark run produces one schema-versioned canonical JSON report and one Markdown report rendered from that JSON. Console output is a concise summary.
- **D-15:** Reports include thresholds, aggregate and category scores, failed case IDs, expected-versus-actual semantic failures, path failures, and invariant violations. Reports must not dump secrets, raw sensitive payloads, or full private documents.
- **D-16:** Generated reports are ignored locally. CI uploads JSON and Markdown reports for both passing and failing runs. Fixtures, schemas, and report rendering code remain version-controlled; timestamped run outputs do not.

### Integrity, recovery, and credential boundaries
- **D-17:** Prove rebuildability through semantic equivalence, not byte-identical storage. Before/after rebuild comparisons cover stable entity URNs, `factKey` values, relation endpoints, classifications, conflicts, provenance locators, required graph paths, and gold retrieval results. Internal database IDs, timestamps, and physical index order are non-semantic.
- **D-18:** Use a layered gate after Phase 19.1: the 40-case deterministic suite is the primary gate, plus a focused integration subset against the real Neo4j artifact for rebuild equivalence, representative one-, two-, and three-hop paths, and recovery behavior.
- **D-19:** The real-artifact subset must use Phase 19.1's final runtime contract. Do not invent container topology, artifact paths, schema commands, readiness probes, or reset/rebuild commands in Phase 20 context or planning.
- **D-20:** Automated offline coverage includes daemon disabled, connection refused, timeout, `401`, and invalid response. Only the transport states allowed by Phase 19 trigger local BM25 fallback; authentication/configuration/invalid-response failures stay visible. Every offline fallback case proves zero external egress.
- **D-21:** Keep the Phase 16 DLP boundary unchanged: publish attempts retain sensitive-data scanning and fresh confirmation. Do not expand DLP to every AI chat prompt or query in this phase. Optional live smoke uses sanitized fixtures, and remote providers remain off by default.
- **D-22:** Keep provider and Neo4j secrets in knowledge-daemon environment variables. Do not add OS-keyring integration, encrypted config files, secret dashboards, rotation workflows, or client-supplied provider keys.
- **D-23:** Credential-isolation verification stays minimal: one focused protocol-boundary regression check proves representative API output and generated benchmark reports do not include a configured test secret. Phase 20 must focus effort on main benchmark, rebuild, path, and recovery flows rather than build a general secret-scanning framework.

### Requirements traceability
- **D-24:** `QUAL-01` through `QUAL-05` are referenced by `.planning/ROADMAP.md` but are absent from `.planning/REQUIREMENTS.md`. Planning must restore concise requirement definitions and traceability without changing this phase's scope or overriding decisions above.

### Claude's Discretion
- Exact names and JSON fields for case definitions and reports, provided they are schema-versioned and represent all semantic assertions in D-09/D-15.
- Exact selection of cases within each D-07 allocation and the size of the real-Neo4j integration subset, provided all required categories, one-/two-/three-hop paths, rebuild equivalence, and recovery states are covered.
- Exact local report output directory and CI artifact name.
- Exact optional live-smoke command name and provider adapter, provided opt-in, sanitization, separation from release score, and remote-off-by-default rules hold.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 19.1 prerequisite
- Phase 19.1 final `CONTEXT.md`, `PLAN.md`, `SUMMARY.md`, and runtime/deployment documentation — **not present on this branch when context was gathered**. Add their exact relative paths as canonical references after Phase 19.1 is integrated. They are authoritative for the real Neo4j artifact, topology, commands, readiness, schema initialization, rebuild, and recovery contracts.

### Milestone and phase scope
- `.planning/PROJECT.md` — active benchmark and hardening requirements, Markdown authority, rebuildability, offline behavior, pilot boundary, and sensitive-data constraint.
- `.planning/ROADMAP.md` — Phase 20 goal and success criteria; references `QUAL-01` through `QUAL-05`.
- `.planning/REQUIREMENTS.md` — inherited Phase 16–19 contracts. Current gap: no definitions for `QUAL-01` through `QUAL-05`.

### Upstream answer and evaluation contracts
- `.planning/phases/19-grounded-assistant-provenance-citations-offline-fallback/19-CONTEXT.md` — claim closure, same-snapshot paths, conflicts, abstention, offline fallback taxonomy, and Phase 20 calibration boundary.
- `.planning/phases/19-grounded-assistant-provenance-citations-offline-fallback/19-AI-SPEC.md` — answer schemas, evidence budgets, guardrails, and evaluation strategy.
- `.planning/phases/18-multi-modal-hybrid-retrieval-engine/18-CONTEXT.md` — retrieval outcomes, RRF, modality degradation, one-to-three-hop traversal, snapshot pinning, and index rebuild rules.
- `.planning/phases/17-pilot-ontology-deterministic-extraction-neo4j-knowledge-grap/17-CONTEXT.md` — URN/fact identity, evidence classification, conflict preservation, provenance, and atomic graph rebuild behavior.
- `.planning/phases/16-knowledge-server-foundation-dlp-checks-ast-ingestion/16-CONTEXT.md` — canonical Markdown snapshots, fresh DLP override, exact source ranges, and optional-daemon isolation.

### Existing benchmark and runtime code
- `tests/ai/groundedAssistantEval.test.ts` — existing deterministic 20-case replay harness to extend rather than replace.
- `tests/fixtures/ai/grounded-assistant-reference.json` — existing 20 reference cases.
- `tests/fixtures/ai/grounded-reference-fixture-schema.ts` — existing Zod case contract.
- `src/services/ai/evidencePack.ts` — evidence packing and claim/citation/path closure validation.
- `src/services/ai/groundedTurn.ts` — grounded-turn state machine and fallback/error taxonomy.
- `src/services/ai/groundedAnswerSchemas.ts` — grounded claim, answer, and persisted grounding schemas.
- `tests/knowledge/offlineIsolation.test.ts` — existing zero-egress offline isolation proof.
- `knowledge-server/tests/retrievalAcceptance.test.ts` — pilot-corpus retrieval and one-to-three-hop acceptance coverage.
- `knowledge-server/tests/graphRebuild.test.ts` — snapshot persistence and atomic graph rebuild coverage.
- `knowledge-server/tests/firstSeenInDocNotAuthority.test.ts` — source authority regression coverage.
- `knowledge-server/src/services/retrievalService.ts` — degradation, timeout, fusion, and pinned-snapshot behavior.
- `knowledge-server/src/graph/neo4jRepository.ts` — Neo4j projection, query templates, constraints/indexes, and snapshot-scoped graph access.
- `src/services/knowledge/publishOrchestrator.ts` — Phase 16 snapshot binding, DLP scan, one-time confirmation, and publish submission state machine.
- `src/services/knowledge/knowledgeConfig.tsx` — memory-only client token and knowledge-server URL boundary.
- `knowledge-server/src/main.ts` — daemon environment configuration for provider and database credentials.
- `knowledge-server/src/server.ts` — authentication, origin policy, logger redaction, and API boundary.

### Pilot acceptance corpus
- `docs/sample-markdown-flow/60000006-SHB-Credit-calculations/README.md` — pilot scope and process/container identity collision.
- `docs/sample-markdown-flow/60000006-SHB-Credit-calculations/01-wiring.md` — process/container/bind structure.
- `docs/sample-markdown-flow/60000006-SHB-Credit-calculations/02-data-objects.md` — database object dependencies.
- `docs/sample-markdown-flow/60000006-SHB-Credit-calculations/03-call-chain.md` — representative call-chain paths.
- `docs/sample-markdown-flow/60000006-SHB-Credit-calculations/04-cycles.md` — cycle behavior and status transitions.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tests/ai/groundedAssistantEval.test.ts` already runs `runGroundedTurn` through deterministic mocked dependencies with zero network egress. Extend this harness to 40 cases and extract shared scoring/reporting only where needed.
- `tests/fixtures/ai/grounded-assistant-reference.json` already covers direct lookup, mixed Vietnamese/English, one-/two-/three-hop paths, disconnected paths, conflicts, clarification, no evidence, degraded retrieval, local fallback, auth failure, operational routing, prompt injection, and citation navigation.
- `validateGroundedAnswerClosure()` in `src/services/ai/evidencePack.ts` already validates citations, graph paths, and conflict branches. Reuse it as core semantic assertion logic.
- `knowledge-server/tests/retrievalAcceptance.test.ts` and `knowledge-server/tests/graphRebuild.test.ts` provide foundations for the real-artifact integration subset after Phase 19.1.
- Existing DLP scanner, audit, publish nonce, and binding-hash flow already provide Phase 16's fresh-confirmation boundary; Phase 20 should test it, not redesign it.

### Established Patterns
- PlannerMate remains offline-first; knowledge daemon, Neo4j, embeddings, and answer providers are optional.
- Protocol boundaries use strict Zod schemas. Benchmark fixtures and JSON reports should follow this pattern.
- Published Markdown is canonical. Neo4j, full-text, vector, and answer artifacts are rebuildable projections.
- Graph paths are valid only inside one pinned snapshot. Cross-snapshot concatenation is forbidden.
- Exact technical identifiers and source quotes remain byte-stable; free-form answer wording is not a stable snapshot contract.
- Existing tests use focused deterministic fixtures. Live provider behavior must remain advisory and opt-in.

### Integration Points
- Add scoring, category aggregation, invariant evaluation, and JSON/Markdown report rendering around the existing replay harness.
- Add `npm run benchmark` without creating a second independent evaluator.
- Extend the existing reference fixture schema with category, required facts/paths/sources, forbidden claims, and invariants where missing.
- Add the Phase 19.1 real Neo4j artifact as an integration-test dependency only after its final runtime contract exists.
- Add CI artifact upload for generated JSON/Markdown reports while keeping local outputs ignored.
- Preserve existing Phase 16 publish orchestration, Phase 19 fallback taxonomy, and daemon environment configuration.

</code_context>

<specifics>
## Specific Ideas

- Example aggregate failure: 46/50-equivalent score would still fail if one answer fabricates a material claim or one path crosses snapshots.
- Example path rule: a correct three-hop conclusion with one wrong edge fails path fidelity even if prose and final target appear correct.
- Example rebuild rule: changed Neo4j internal IDs are acceptable when stable URNs, `factKey` values, provenance, paths, and query results remain equivalent.
- Example report: identify `GR-07`, missing third edge, expected source locator, actual path, category threshold, and invariant status without dumping full Markdown.
- Example layered gate: deterministic fixtures validate all 40 contracts; real Neo4j subset validates representative one-, two-, and three-hop queries plus rebuild/recovery against Phase 19.1 artifact.

</specifics>

<deferred>
## Deferred Ideas

- General DLP coverage for every AI chat prompt, retrieval query, and provider request — not needed for Phase 20; retain Phase 16 publish boundary.
- OS keyring or encrypted secret-file support for the knowledge daemon — deferred unless deployment evidence proves environment variables insufficient.
- Full live-provider benchmark as a release gate — rejected because cost, network state, and model drift make it nondeterministic.
- Full-corpus expansion beyond process `60000006` — outside v1.2 pilot scope.

</deferred>

---

*Phase: 20-Benchmark Evaluation Suite, Integrity Hardening & Credential Isolation*
*Context gathered: 2026-10-12*
