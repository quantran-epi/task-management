---
status: awaiting_human_verify
trigger: "graph retrieval returns graph=unavailable on remote K8s for WRITES_TO, READS_FROM, and multi-hop; DELETE verification set returns HTTP 400"
created: 2026-10-25
updated: 2026-10-25
---

# Remote Graph Unavailable

## Symptoms

- expected: Live fixture publish, graph rebuild, and activation produce graph evidence for WRITES_TO, READS_FROM, and bounded multi-hop retrieval; verification set cleanup succeeds.
- actual: Remote K8s readiness, publish, rebuild, READY build, activation, and facts preflight pass, but relation and multi-hop retrieval report `graph=unavailable` with zero graph entities/paths. DELETE verification set returns HTTP 400.
- errors: Live script exits 0 despite graph-unavailable results. Environment-gated live suite passes 6/7; cleanup assertion receives HTTP 400 instead of 200/202/204/404.
- timeline: First live bootstrap against remote deployment. No document set or graph existed before verification. Script published two synthetic fixture documents and built the graph during this run.
- reproduction: Run Phase 24 live verification against remote K8s. Publish fixed fixture set, rebuild, wait READY, activate, verify facts include WRITES_TO/READS_FROM, then execute direct/relation/multi-hop retrieval and DELETE cleanup. Keep tokens, endpoint, query text, document content, response bodies, stack traces, and Cypher out of debug artifacts.

## Current Focus

- hypothesis: CONFIRMED. (1) `extractQueryTokens` emits bigrams before single words against a hard 20-token cap, so long relation/multi-hop queries exhaust the budget before the bare table identifier. `RESOLVE_ENTITIES` substring matching then finds zero candidates, planning returns `needsClarification`, traversal seeds are empty, and graph status becomes `unavailable`/`NO_GRAPH_SEED`. Direct lookup keeps the identifier inside the budget, matching the observed pass. (2) Verification DELETE calls send `Content-Type: application/json` with an empty body; Fastify's default JSON parser rejects it with `FST_ERR_CTP_EMPTY_JSON_BODY`, which the error handler maps to 400.
- test: Unit-run `extractQueryTokens` on the four live query shapes; inspect Fastify JSON parser empty-body path; trace `NO_GRAPH_SEED` propagation from planning to modality status.
- expecting: Identifier-first token ordering restores entity resolution and graph evidence; omitting Content-Type on bodyless DELETE removes the 400.
- next_action: human live retest against remote K8s with supplied credentials; record metadata only.
- reasoning_checkpoint:
    hypothesis: "Long Vietnamese relation queries lose the bare technical identifier because bigram generation consumes the 20-token cap first. Entity resolution then returns no candidates, planning emits needsClarification/NO_GRAPH_SEED, and graph modality reports unavailable with zero entities. Empty DELETE bodies sent with a JSON Content-Type are rejected by Fastify's JSON parser as 400."
    confirming_evidence:
      - "Running the source `extractQueryTokens` on the relation query shapes returns exactly 20 tokens with the bare table identifier absent."
      - "Running it on the direct-lookup shape keeps the bare identifier at position 5, matching the family that passed live."
      - "`queryPlanning.resolveQueryEntities` returns needsClarification when `rawCandidates.length === 0`; `runBoundedGraphTraversal` maps empty seeds to unavailable/NO_GRAPH_SEED."
      - "Fastify content-type-parser calls the JSON parser on empty bodies and raises FST_ERR_CTP_EMPTY_JSON_BODY; server error handler maps sub-500 status codes to 400."
    falsification_test: "If the relation query token lists already contained the bare identifier (or resolution matched a partial bigram), the truncation hypothesis is wrong. If Fastify ignored empty JSON bodies, the DELETE hypothesis is wrong."
    fix_rationale: "Emit qualified/uppercase identifiers before bigrams so the resolution-critical token always survives the cap; this addresses the root cause, not the symptom. Send verification DELETE requests without a JSON Content-Type since they carry no body; the app client already does this."
    blind_spots: "Remote query planner behavior was not observed (credentials unavailable); the deterministic fallback still needs to produce a valid plan for resolved table/package seeds. No remote retest possible locally."
- tdd_checkpoint:

## Evidence

- timestamp: 2026-10-25
  observation: Remote readiness, publish, rebuild, build READY, activation, and facts preflight passed; facts count was 6 and included WRITES_TO and READS_FROM.
  implication: Graph extraction and at least one graph-read route can observe built fixture data.
- timestamp: 2026-10-25
  observation: WRITES_TO, READS_FROM, and bounded multi-hop retrieval returned text results while graph modality was unavailable with zero graph entity/path counts.
  implication: Failure lies after build/facts success and before or inside retrieval graph traversal/result normalization.
- timestamp: 2026-10-25
  observation: Environment-gated live suite passed 6 of 7 tests; cleanup DELETE received HTTP 400.
  implication: Cleanup route or deployed request contract differs from test expectation.
- timestamp: 2026-10-25
  checked: Source `extractQueryTokens` on the relation-family query shapes
  found: 20-token cap reached with zero bare qualified identifier present; direct-lookup shape retained the identifier.
  implication: Entity resolution had no exact identifier to match for the failing families.
- timestamp: 2026-10-25
  checked: `knowledge-server/node_modules/fastify/lib/content-type-parser.js`
  found: Empty body with JSON content type raises FST_ERR_CTP_EMPTY_JSON_BODY before the route handler runs; server maps it to HTTP 400.
  implication: DELETE 400 originates in request construction, not in purge logic.

## Eliminated

- hypothesis: No source corpus existed before test, so graph retrieval had nothing to query.
  reason: Live verifier itself successfully published fixture documents, rebuilt, activated, and read six facts before retrieval checks.
- hypothesis: Graph build or activation state was lost between requests on the remote deployment.
  reason: Facts preflight reads the activated snapshot successfully in a separate request; only queries whose token list omitted the identifier failed.
- hypothesis: DELETE route or purge implementation rejects the set.
  reason: Request is rejected by Fastify's content-type parser before the route handler; app client omitting JSON Content-Type purges successfully.

## Resolution

- root_cause: `extractQueryTokens` emitted bigrams before single words under a hard 20-token cap, so long Vietnamese relation/multi-hop queries dropped the bare qualified table identifier (`MAIN1.EVT_EVENT`, `MAIN1.FCL_CYCLE_COUNTER`). `resolveQueryEntities` found no candidates, planning returned `needsClarification` with `NO_GRAPH_SEED`, and the graph modality reported `unavailable` with zero entities/paths. Separately, verification DELETE requests advertised `Content-Type: application/json` with an empty body; Fastify's default JSON parser raises `FST_ERR_CTP_EMPTY_JSON_BODY` and the error handler maps it to HTTP 400.
- fix: Emit qualified/uppercase/numeric identifiers before bigrams in `extractQueryTokens` so resolution-critical tokens always survive the cap. Send bodyless DELETE requests without a JSON Content-Type in the live script and gated suite. Tighten the live script and gated suite so a relation family whose corpus fact exists fails on `graph=unavailable` instead of passing.
- verification: `npx vitest run tests/server.test.ts tests/retrievalPlanning.test.ts tests/liveGraphRetrieval.test.ts tests/retrievalService.test.ts` -> 69 passed, 7 skipped (live suite skipped without LIVE_KNOWLEDGE). Token probe retains identifier for all four live query shapes. `node scripts/test-knowledge-live.mjs --self-check` exits 0 with `network_calls=0`. `npm run build` clean. Remote live retest blocked on credentials.
- files_changed:
  - knowledge-server/src/retrieval/queryPlanning.ts
  - knowledge-server/tests/retrievalPlanning.test.ts
  - knowledge-server/tests/liveGraphRetrieval.test.ts
  - knowledge-server/tests/server.test.ts
  - scripts/test-knowledge-live.mjs
  - .planning/debug/remote-graph-unavailable.md
