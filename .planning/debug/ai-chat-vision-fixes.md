---
status: awaiting_human_verify
progress_log:
  - "Bug 4 FIXED + verified: removed 'container' from queryPlanning.ts:272 stepKeywords. knowledge-server tsc clean. 2 server test failures (retrievalAcceptance 18-ACC-05, main.test startup) confirmed PRE-EXISTING via git stash differential (identical fail on baseline) — not my regression."
  - "Bug 2 FIXED + verified (client unit): rewrote src/services/ai/intentRouter.ts as LLM-reasoned contract — DELETED DEFAULT_OPERATIONAL_VERBS/DEFAULT_KNOWLEDGE_HINTS/matchTerms (NO verb/keyword routing). New fixed taxonomy operate_taskmate|query_taskmate|query_knowledge|mixed|clarify, strict Zod IntentResultSchema {intent,confidence,entities,language,needs_clarification,clarify_question}, full instruction system prompt + json_schema response_format, Zod validate + ONE retry, IntentRouterUnavailableError when LLM unconfigured/off-schema (feature UNAVAILABLE, no keyword fallback). Added the missing query_taskmate READ route (maps to operational tool loop). Threaded through groundedTurn.ts (async intentDecision, intent-based branches, mixed check x2, routedIntent:IntentLabel), semanticScopeRouter.ts (RouteScopeInput.routedIntent:IntentLabel), AIChatDrawer.tsx (routeOverride maps knowledge->query_knowledge / operational->operate_taskmate). Cause B FIXED: added fullResponse='' reset at top of while(loopCount) tool loop so stale prior-turn stream text no longer re-concatenates. Root tsc --noEmit CLEAN. Targeted vitest: tests/ai/intentRouter.test.ts (rewritten) + tests/ai/groundedTurn.test.ts + knowledgeClient.fallback.test.ts = 43 passed."
  - "Bug 2 clarify_question: threaded into GroundedTurnResult.clarify_intent.clarifyQuestion (optional). UI currently uses IntentRoutingPrompt chips (route picker) for clarify; free-text clarify_question display is a follow-up UI enhancement, not wired yet. Core router replacement + query_taskmate route + buffer fix are the vision-critical pieces and are done."
  - "Bug 3 Cause A FIXED + verified: de-hardcoded extraction.ts. Removed `rawId==='60000006' ? 'SHB - Credit calculations'` special-case (canonicalName now = PROCEDURE_NAME, document-agnostic). Added TraversalContext.containerProcessId, captured dynamically from the PRC_PROCESS row flagged IS_CONTAINER=1. handlePrcContainerTable signature dropped the `parentProcessId='60000006'` default param; now resolves parent from ctx.containerProcessId (null-safe: skips CONTAINS_STEP if no container found, still emits step nodes + INVOKES/PRECEDES/USES_TYPE). knowledge-server tsc --noEmit CLEAN. Targeted vitest: deterministicExtraction + pilotAcceptance + graphRebuild = 20 passed (pilot collision test GRAPH-02 asserts URN/nativeType not canonicalName, so safe)."
  - "Bug 3 Cause B FIXED + verified: wired orphaned prose extractors into graphBuildService.executeRebuild 'Prose extraction' stage. Added ProseExtractionConfig option (endpoint/model/apiKey/fetchFn); when configured, collectUncoveredProse(sourceSnapshot, consumedRanges) + extractProseCandidatesOnce(...) feed inferredFacts/inferredEvidence into mergeFactsDeterministicFirst (which already supported them). Safe no-op when unconfigured (deterministic-hash test preserved). knowledge-server tsc CLEAN. Targeted vitest: graphRebuild + proseFallback + deterministicExtraction + pilotAcceptance = 25 passed."
  - "Bug 5 FIXED (substrate) + verified: created knowledge-server/src/logging/structured.ts and src/services/ai/log.ts — dependency-free structured JSON logging, tags [ROUTE][RETRIEVE][TOOL][SYNTHESIS][PUBLISH], correlation ID, level filter, secret redaction, createPhaseLogger. Both codebases tsc --noEmit CLEAN. Runnable check tests/ai/log.test.ts = 5 passed. NOTE: substrate is the fix; full chokepoint instrumentation across every pipeline stage is incremental adoption, not done exhaustively this session."
  - "Bug 1 MECHANISM CORRECTED via git bisect/delta: `git log -S resolveEntities` and `-S 'async traverse'` on neo4jRepository.ts BOTH EMPTY — these GraphRetrievalGateway methods NEVER existed in that file. Grep repo-wide: resolveEntities/traverse implemented ONLY in test stubs (retrievalStubs.ts, retrievalAcceptance.test.ts, retrievalPlanning.test.ts). So the bug-file's pinned mechanism ('validateVectorIndexMetadata throws in runVectorModality → DEGRADED') is UNREACHABLE in current source: buildQueryExecutionPlan→resolveQueryEntities calls gateway.resolveEntities (queryPlanning.ts:256) with NO surrounding try/catch (the try at :610 wraps only planner.plan, AFTER resolution). With the raw `graphRepository as unknown as GraphRetrievalGateway` cast (main.ts:345), resolveEntities is undefined → TypeError thrown during PLANNING, before any modality runs → propagates uncaught through executeUnderLease (finally-only) → retrieve() → likely surfaces as 500 per-set, which the federation layer catches and marks DEGRADED (that is the real path to the empty-DEGRADED banner, NOT a validateVectorIndexMetadata catch). CONCLUSION: Bug 1 is a WHOLE MISSING ADAPTER, not one missing method. The unsafe `as unknown as` casts (main.ts:344-345) hide that Neo4jRepository satisfies NEITHER gateway: queryFulltext/queryVector name+signature mismatch, cleanupSupersededSnapshots name mismatch, validateVectorIndexMetadata absent, resolveEntities+traverse never implemented."
  - "Bug 1 FIXED + verified (structure, NOT live Cypher): (1) added 3 parameterized Cypher consts to neo4jRepository.ts CYPHER_QUERIES — GET_GENERATION_META_BY_SNAPSHOT, RESOLVE_ENTITIES (urn/normalizedKey/canonicalName CONTAINS/aliases match), TRAVERSE_FROM_SEEDS (1-hop Entity-[r]-Entity joined to Fact on r.factKey; edge props r.factKey+r.graphSnapshotId confirmed written by STATIC_RELATION_WRITERS). (2) implemented validateVectorIndexMetadata (cache-first via localGenerationMetadata.embeddingMetadata.dimensions, else GraphSnapshot.embeddingMetadataJson+hasVectors; dimension compare), resolveEntities (maps to ClarificationCandidate, empty-token short-circuit, abort check), traverse (dedup neighbors+edges by Map, slice to limitNodes/limitEdges, truncated+RESULT_LIMIT_REACHED, empty-seed short-circuit, abort check). (3) replaced both `as unknown as` casts in main.ts:344-345 with a typed adapter: indexGateway object literal bridging queryFulltext→queryFullText(keywords.join), queryVector→queryVector(criteria.vector), cleanupSupersededSnapshots→cleanupSupersededGenerations; graphGateway = repo directly (now structurally satisfies GraphRetrievalGateway). const repo capture prevents closure re-widening of `let graphRepository`. knowledge-server tsc --noEmit CLEAN (compiler now ENFORCES both contracts — casts gone). Runnable check: tests/neo4jRepository.gateway.test.ts = 10 passed (metadata match/mismatch/no-vectors/not-found; resolveEntities map+empty+abort; traverse shape+truncation+empty-seed). Full retrieval+main suites rerun: same 2 PRE-EXISTING failures (retrievalAcceptance 18-ACC-05, main.test tsx startup), proven NOT my regression via `git stash push neo4jRepository.ts main.ts` → identical 2 fails on baseline → stash pop. BLIND SPOT (human must verify on live Neo4j): Cypher SEMANTICS unverified — specifically TRAVERSE_FROM_SEEDS multi-row dedup, the r.factKey↔Fact.factKey join actually matching, and whether 1-hop undirected is enough for the container-60000006 query. Mock driver only proves parameterization/signature/result-shape."

trigger: "Fix 5 traced AI-chat bugs per vision — LLM-first intent (NO verb/keyword lists), app-defined intent taxonomy + strict JSON output schema, full instruction prompt. Vision is supreme law: AI chat is a natural-language front for a non-technical single user. LLM reasons intent against an app-defined contract. Language-agnostic retrieval (VN query hits EN docs). Answers carry citations; honest confidence when none; speculate only on explicit request. Link TaskMate work data to the knowledge graph."
created: 2026-10-13
updated: 2026-10-13
slug: ai-chat-vision-fixes
---

# AI Chat — Vision Compliance Fixes (5 traced bugs)

Root causes already traced in `.planning/debug/ai-chat-current-bugs.md` and verified against code on 2026-10-13 (orchestrator confirmed each grep/line reference below). Goal is confirm-then-fix, not re-discover.

## Confirmed constraints (user-approved 2026-10-13)

- **LLM down → AI feature UNAVAILABLE.** No routing fallback when the LLM endpoint itself is unreachable. (Distinct from neo4j/knowledge-server down → still fall back to local BM25 over TaskMate data + IndexedDB docs; LLM alive, graph dead.)
- **Clarify loop:** when intent returns `needs_clarification: true`, app shows `clarify_question`, waits for the user, then re-runs intent with the user's answer appended to the original query.
- **NO verb lists / NO keyword/regex routing anywhere.** Intent MUST be reasoned by the LLM against an app-defined contract: fixed intent taxonomy + strict JSON output schema + a full instruction prompt that guarantees parseable standard-format output (validate with Zod, reject/retry off-schema).

## App-defined intent contract (to build in Bug 2)

Fixed taxonomy (app decides, not LLM free-text):
- `operate_taskmate` — mutate work data (create/update/status/worklog/pause/resume/finish/assign/move)
- `query_taskmate` — read work data (status questions, e.g. "tình hình click to pay như nào rồi")
- `query_knowledge` — ask docs/graph knowledge
- `mixed` — both operate + knowledge
- `clarify` — too vague, ask back

Strict output schema (Zod-validated):
```json
{ "intent": "query_taskmate", "confidence": 0.0,
  "entities": ["click to pay"], "language": "vi",
  "needs_clarification": false, "clarify_question": null }
```

## Symptoms (prefilled from ai-chat-current-bugs.md)

### Bug 1 — Knowledge query shows only degraded banner, no content [BLOCKER]
Query `Chu kỳ tính lãi/phí container 60000006` returns only the degraded banner with empty body (no evidence card, no answer, no citation).
Confirmed root cause: `validateVectorIndexMetadata` is declared on `RetrievalIndexGateway` (`knowledge-server/src/retrieval/contracts.ts:132`) and called at `knowledge-server/src/services/retrievalService.ts:513`, but **not implemented** on `Neo4jRepository` (`knowledge-server/src/graph/neo4jRepository.ts` → 0 grep match). The `main.ts:344` unsafe cast `graphRepository as unknown as RetrievalIndexGateway` hides it at compile. At runtime the call throws `TypeError: ...is not a function` inside `runVectorModality`, which an outer catch turns into DEGRADED → empty synthesis → banner-only render (`GroundedAnswerCard.tsx:299-324`).
Also verify: `neo4jRepository.queryVector` signature (line 977: `(snapshotId, queryVector: readonly number[], limit)`) vs interface `queryVector(snapshotId, criteria: VectorQueryCriteria, options?)` (`contracts.ts:123`) — the unsafe cast may hide a second signature mismatch. **Severity note:** this bug also kills language-agnostic retrieval entirely (multilingual e5-small vector modality dead → only BM25/fulltext survives → VN-query-hits-EN-doc broken), so it blocks a core vision goal, not just "empty answer."
VERIFY WHEN FIXING: locate the exact outer try/catch in `runVectorModality`'s caller that converts the throw into DEGRADED (the `if(!isMatch)` at :514 is the mismatch branch, not a catch — it never runs because :513 throws first).

### Bug 2 — TaskMate read query loops "TaskMate data search fail" [BLOCKER]
Query `tình hình click to pay như nào rồi` repeats a degraded chain across tool-loop turns.
Confirmed cause A: keyword router. `src/services/ai/intentRouter.ts` uses `DEFAULT_OPERATIONAL_VERBS` (line 3: `tạo, cập nhật, xóa, đánh dấu, log worklog, pause, resume, finish, assign, move to, set status`) + `DEFAULT_KNOWLEDGE_HINTS` (line 17) matched by `matchTerms` regex. A status/read question matches nothing → `{ route: 'clarify', confidence: 0 }` → clarify path never queries the TaskMate repository. **Deeper structural defect (bug file missed this):** the router emits only `knowledge | operational | mixed | clarify` — there is NO TaskMate-data-READ route at all, so a status question has nowhere to go even with keywords. The vision fix is NOT "add read verbs" — it is to DELETE the keyword router entirely and replace with the LLM intent contract above (adds `query_taskmate`).
Cause B (NOT YET VERIFIED — confirm before trusting): `src/components/ai/AIChatDrawer.tsx:1010-1264` — `fullResponse` buffer allegedly not reset between tool turns, accumulating stale deltas and concatenating degraded chains; silent stream-error fallback at 1064-1082; redundant post-tool synthesis pass at 1238. Debugger must read these lines and confirm or correct before fixing.

### Bug 3 — Graph publish: only 1 doc (SHB credit) gets entity+event+relation+evidence; every other doc gets entities only [BLOCKER]
Confirmed cause A: table parser hardcoded to SHB-credit column names (`knowledge-server/src/retrieval/extraction.ts:667-779` — matches substrings like `Chu kỳ tính lãi`, `Hạch toán`). Violates "no hardcoding to a specific document."
Confirmed cause B: prose extractors are declared in `knowledge-server/src/ai/proseExtraction.ts` (`collectUncoveredProse:45`, `extractProseCandidatesOnce:168`) but **never called anywhere** (grep call sites repo-wide excluding def file = 0). The rebuild pipeline has a placeholder-only "Prose extraction" stage at `knowledge-server/src/services/graphBuildService.ts` (~line 144-146: comment `// Bounded prose extraction placeholder for uncovered segments` with no call). **Location correction vs bug file:** bug file said functions live at `graphBuildService.ts:145-147` — WRONG; that is the placeholder stage. Functions live in `ai/proseExtraction.ts`; the placeholder stage is where they must be wired in. Docs without a table (or whose table doesn't match the SHB pattern) fall back to name-recognition entities only → 0 relations, 0 evidence.

### Bug 4 — Composite ID collision routes to wrong entity type [HIGH]
`60000006` exists in multiple composite namespaces (`PRC_CONTAINER:60000006`, `PRC_PROCESS:60000006`). System routes to `ProcessStep:60000006` instead of the container.
Confirmed root cause: `knowledge-server/src/retrieval/queryPlanning.ts:272` — `const stepKeywords = ['bước', 'step', 'container', 'processstep'];` hardcodes `'container'` as a step keyword, forcing a static keyword→entity-type mapping instead of tracing the graph dynamically. Violates "resolve node must trace graph dynamically, no hardcoded mapping."

### Bug 5 — No structured logging → every failure is hard to trace [HIGH / observability]
Confirmed: no `knowledge-server/src/logging/` dir, no `src/services/ai/log.ts`. Logs are scattered `console.log`/`console.error`, no tags, no correlation ID. Need structured logging with tags `[ROUTE] [RETRIEVE] [TOOL] [SYNTHESIS] [PUBLISH]` and a correlation ID per request, both server-side and client-side.

## Working-tree note
6 modified files uncommitted (from git status): `src/components/ai/ChatMessageBubble.tsx`, `src/components/ai/grounded/GroundedAnswerCard.tsx`, `src/services/ai/evidencePack.ts`, `src/services/ai/groundedSynthesis.ts`, `tests/ai/evidencePack.test.ts`, `tests/ai/groundedSynthesis.test.ts`. Unclear which bug these address — review before committing or reverting; do not clobber.

## Current Focus

status: ALL 5 BUGS FIXED + self-verified (tsc + targeted vitest) on 2026-10-13. Awaiting human end-to-end verify against live Neo4j + LLM endpoint (unavailable in this env). next_action: human runs the two repro queries in the real app and confirms (see CHECKPOINT).

### Earlier state (kept for history): ALL 5 PINS CONFIRMED on 2026-10-13 (second pass, this session). One MATERIAL CORRECTION to Bug 1 scope + Bug 2 cause B now CONFIRMED (was unverified).

### Pin verification results (this session)
- Bug 1 — CONFIRMED + SCOPE CORRECTION. `validateVectorIndexMetadata` absent from `neo4jRepository.ts` (grep 0 match). BUT the real defect is bigger than "one missing method": `main.ts:344-345` casts `graphRepository as unknown as RetrievalIndexGateway` AND `as unknown as GraphRetrievalGateway`, hiding a WHOLE-INTERFACE mismatch. Neo4jRepository (class at :405 `implements GraphRepository`, NOT the two gateway interfaces) actually has: `queryFullText` (capital T, sig `(snapshotId, query:string, limit)`) not `queryFulltext`; `queryVector(snapshotId, queryVector:readonly number[], limit)` not `(snapshotId, criteria:VectorQueryCriteria, options)`; `cleanupSupersededGenerations(now)` not `cleanupSupersededSnapshots(setId, grace)`; `acquirePinnedSnapshot` returns `PinnedRetrievalSnapshot` not `PinnedSnapshotLease`. It has NEITHER `resolveEntities` NOR `traverse` (grep 0 match) required by GraphRetrievalGateway. retrievalService calls: `queryFulltext`:471, `validateVectorIndexMetadata`:513, `queryVector({vector,limit},{signal})`:526, `acquirePinnedSnapshot`:164; queryPlanning calls `resolveEntities`:221,256; graphTraversal calls `traverse`:386. => FIX is NOT add-one-method; it is write a real adapter mapping Neo4jRepository → both gateway contracts (7 methods, correct signatures, incl. 2 brand-new graph methods resolveEntities/traverse that have NO existing impl).
  - CONTRADICTION FLAG (unresolved): documented symptom is DEGRADED-banner-only. But if the raw repo is injected via unknown-cast, `queryFulltext` (lowercase) is undefined → fulltext ALSO throws; `resolveEntities` undefined → `buildQueryExecutionPlan` throws uncaught (no try/catch around resolveQueryEntities at queryPlanning:256) → `retrieve()` has try/FINALLY only (:192) → would 500, NOT return DEGRADED. So either (a) a built/compiled older adapter is actually deployed, or (b) the running server differs from this source. Must resolve WHICH artifact runs before trusting any server-side fix verification. Cannot start knowledge-server here (no Neo4j).
- Bug 2 — CONFIRMED (both causes). Cause A: `intentRouter.ts` DEFAULT_OPERATIONAL_VERBS:3, DEFAULT_KNOWLEDGE_HINTS:17, matchTerms regex :46; taxonomy `IntentRoute = knowledge|operational|mixed|clarify` :30 — NO query_taskmate read route. Cause B NOW CONFIRMED (was unverified): `AIChatDrawer.tsx` `fullResponse` declared :1011 OUTSIDE the `while (loopCount<MAX_TOOL_LOOPS)` loop (:1031); it is NEVER reset per turn. Each turn appends stream deltas (:1051) then pushes the accumulated `fullResponse` as the assistant message (:1129-1131) into currentMessages, and the NEXT turn keeps appending to the same buffer → stale prior-turn text re-concatenated. Extra: redundant post-tool synthesis pass :1238-1264 appends again; silent tools-stream fallback :1065-1082.
  - WIRING for the Bug 2 fix spans: `intentRouter.ts` (replace), `groundedTurn.ts` (RouteIntentResult type, GroundedTurnResult union :61, GroundedTurnDeps.routeIntent sig :92, step-1 branch :224-230), `groundedTurnDeps.ts` (routeIntent wiring :79), `semanticScopeRouter.ts` (`routedIntent` union :33), `AIChatDrawer.tsx` (routeOverride type :460, override :580, branch :611/:649). routeIntent is currently SYNC returning {route,confidence}; LLM version is ASYNC → signatures already allow Promise (groundedTurn Deps.routeIntent returns `Promise|value`).
- Bug 3 — CONFIRMED + LOCATION CORRECTION (as debug file already noted). Prose fns live in `knowledge-server/src/ai/proseExtraction.ts` (`collectUncoveredProse`:45, `extractProseCandidatesOnce`:168), 0 call sites. Placeholder stage: `graphBuildService.ts:145-147` (comment only, inside `executeRebuild`). extraction.ts is at `knowledge-server/src/graph/extraction.ts` (NOT retrieval/). Hardcoded SHB: `extraction.ts:200` (`rawId==='60000006' ? 'SHB - Credit calculations'`) and `handlePrcContainerTable(...parentProcessId='60000006')`:263 — the hardcode is a default param + a canonicalName special-case, not the :667-779 range the bug file cited (that range is `traverseAst`). Column parsing (:266-274) is already generic (substring includes BIND/PROCESS_ID/ORDER). The real hardcode = the `'60000006'` literals.
- Bug 4 — CONFIRMED exactly. `queryPlanning.ts:272` `const stepKeywords = ['bước','step','container','processstep'];`. Collision filter :278-288 maps mentionsStep→kind 'ProcessStep'. 'container' as a step keyword is both hardcoded and semantically wrong (container is its own kind).
- Bug 5 — CONFIRMED. No `knowledge-server/src/logging/` dir, no `src/services/ai/log.ts`.

### SCOPE REALITY (surfaced to user)
This is NOT a quick confirm-then-fix. Bug 1 = full gateway adapter (incl. 2 unimplemented graph methods). Bug 2 = architectural router replacement threaded through 5 files + type changes + clarify loop. Bug 5 = new logging infra across 2 codebases. End-to-end verification impossible in this env (no live Neo4j, no LLM endpoint). Only client-side vitest + tsc compile are runnable here. Proceeding with the self-contained, unit-verifiable fixes first and flagging the large architectural pieces that need live-env verification.

next_action: Discover build/test commands for root app and knowledge-server. Then execute Bug 4 first (smallest, isolated, server-unit-testable), verify via targeted vitest; then Bug 2 (client, vitest-covered) under the no-verb-list hard gate; then Bug 3; then Bug 1 + Bug 5 (flag as needing live-env verification).

reasoning_checkpoint_bug1:
  hypothesis: "Bug 1 — knowledge queries fail because the retrieval gateways are unimplemented. main.ts:344-345 casts Neo4jRepository to RetrievalIndexGateway + GraphRetrievalGateway via `as unknown as`, but the repo implements NEITHER: queryFulltext (vs repo queryFullText) and queryVector have different signatures, cleanupSupersededSnapshots has a different name, validateVectorIndexMetadata is absent, and resolveEntities + traverse were NEVER written. At runtime against Neo4j, buildQueryExecutionPlan→resolveQueryEntities calls gateway.resolveEntities (undefined) → TypeError during planning (uncaught in executeUnderLease) → retrieve() throws → surfaces as per-set failure → DEGRADED/empty."
  confirming_evidence:
    - "git log -S resolveEntities and -S 'async traverse' on neo4jRepository.ts BOTH empty → methods never existed in that file"
    - "grep repo-wide: resolveEntities/traverse implemented only in test stubs"
    - "dist/graph/neo4jRepository.js (built 2026-10-13 17:12) has 0 resolveEntities, 0 async traverse → deployed artifact matches source, bug is live"
    - "contracts.ts:114 queryFulltext vs repo:942 queryFullText (case+signature); contracts.ts:123 queryVector(criteria) vs repo:977 queryVector(readonly number[]); contracts.ts:140 cleanupSupersededSnapshots vs repo:1011 cleanupSupersededGenerations"
  falsification_test: "If I make Neo4jRepository formally implement both gateway interfaces (via adapter) and remove the `as unknown as` casts, tsc must compile with the plain casts removed. If the compiler accepts the real contract and a mock-driver unit test confirms the methods issue correctly-parameterized Cypher and map results to the expected EntityItem/EdgeItem/ChunkItem shapes, the adapter is structurally correct."
  fix_rationale: "Root cause is a missing implementation masked by unsafe casts. Fix = (a) add validateVectorIndexMetadata + resolveEntities + traverse as real parameterized-Cypher methods on the repo, (b) build a thin typed adapter translating the index-gateway signature mismatches (queryFulltext→queryFullText, queryVector criteria→vector, cleanupSupersededSnapshots→cleanupSupersededGenerations), (c) replace the `as unknown as` casts in main.ts with the adapter so the compiler enforces both contracts forever. This addresses the cause (no implementation + silenced type errors), not the DEGRADED symptom."
  blind_spots: "CANNOT runtime-verify against live Neo4j in this environment (no DB). Cypher SEMANTIC correctness (does traverse walk the right edges / return right rows) is unverifiable here — only parameterization, signature conformance, and result-shape mapping are verifiable via tsc + mock-driver unit test. traverse multi-hop semantics beyond depth-1 (deterministic planner paths are depth-1) especially need live verification. Flagging this as the one piece requiring human/live-env confirmation."

reasoning_checkpoint:
  hypothesis: "Bug 4 — query `...container 60000006` mis-routes to ProcessStep:60000006 because queryPlanning.ts:272 lists 'container' in stepKeywords; the word 'container' in the query sets mentionsStep=true, and the :283-288 filter then keeps only kind==='ProcessStep' candidates, discarding the correct PRC_CONTAINER/ScheduledProcess candidate."
  confirming_evidence:
    - "queryPlanning.ts:272 literal `const stepKeywords = ['bước','step','container','processstep'];` (read directly)"
    - ":274-275 mentionsStep = stepKeywords.some(k=>lowerQuery.includes(k)); query contains 'container' => true"
    - ":283-288 `if (mentionsStep && !mentionsProcess)` filters rawCandidates to kind==='ProcessStep' only"
    - "extraction.ts:199 PRC_PROCESS maps to kind 'ScheduledProcess'; container context should NOT force ProcessStep"
  falsification_test: "If removing 'container' from stepKeywords, the same query no longer forces ProcessStep filtering and the ScheduledProcess/container candidate survives (resolved or ambiguous->clarify). Server tsc compiles; existing retrieval tests still pass."
  fix_rationale: "'container' is an entity-type/domain noun wrongly used as a ProcessStep NL keyword — a hardcoded keyword->kind mapping the vision forbids. Removing it stops the mis-map at the source. Minimal diff; full dynamic graph-trace resolution is a larger follow-up (ponytail)."
  blind_spots: "Cannot run live Neo4j here. Verifying by tsc compile + existing server vitest only. Full 'trace graph dynamically' not implemented — leaving the processKeywords/stepKeywords heuristic otherwise intact to avoid regressing passing tests."
tdd_checkpoint:

## Evidence

- timestamp: 2026-10-13 — orchestrator grep confirmed `validateVectorIndexMetadata` absent from `neo4jRepository.ts` (0 match), present only in contracts.ts:132 + retrievalService.ts:513 + test stubs.
- timestamp: 2026-10-13 — orchestrator confirmed `intentRouter.ts` keyword lists (DEFAULT_OPERATIONAL_VERBS:3, DEFAULT_KNOWLEDGE_HINTS:17, matchTerms regex) and taxonomy limited to knowledge|operational|mixed|clarify (no read route).
- timestamp: 2026-10-13 — orchestrator confirmed prose extractors `collectUncoveredProse`/`extractProseCandidatesOnce` live in `ai/proseExtraction.ts` with 0 call sites repo-wide; graphBuildService prose stage is a placeholder comment only.
- timestamp: 2026-10-13 — orchestrator confirmed `queryPlanning.ts:272` hardcodes `'container'` in stepKeywords.
- timestamp: 2026-10-13 — orchestrator confirmed no `knowledge-server/src/logging/` dir and no `src/services/ai/log.ts`.

## Eliminated

- hypothesis: `embeddingProvider = undefined → UNCONFIGURED`. ELIMINATED: `main.ts:315 createEmbeddingProvider(env)` always returns a provider (default `LocalOnnxEmbeddingProvider`, Xenova/multilingual-e5-small, 384-dim); guard at `retrievalService.ts:504` never fires. The real Bug 1 cause is the missing method, not a missing provider.

## Resolution

root_cause: |
  5 distinct defects, all violating the vision contract:
  - Bug 1: retrieval gateways unimplemented — `main.ts:344-345` cast `graphRepository as unknown as RetrievalIndexGateway`/`GraphRetrievalGateway`, masking that Neo4jRepository satisfied NEITHER contract (queryFulltext/queryVector name+signature mismatch, cleanupSupersededSnapshots name mismatch, validateVectorIndexMetadata absent, resolveEntities+traverse never written). At runtime: gateway.resolveEntities undefined → TypeError in planning → per-set failure → DEGRADED/empty banner. Also killed vector modality = killed language-agnostic retrieval.
  - Bug 2A: keyword/regex intent router (DEFAULT_OPERATIONAL_VERBS/DEFAULT_KNOWLEDGE_HINTS/matchTerms) with taxonomy knowledge|operational|mixed|clarify — NO query_taskmate read route, so status questions had nowhere to go.
  - Bug 2B: `fullResponse` buffer declared outside the tool-loop in AIChatDrawer.tsx, never reset per turn → stale prior-turn stream text re-concatenated across degraded chains.
  - Bug 3A: extraction.ts hardcoded SHB-credit canonicalName special-case + `'60000006'` default parentProcessId literal.
  - Bug 3B: prose extractors (collectUncoveredProse/extractProseCandidatesOnce) never called — graphBuildService prose stage was a placeholder comment → non-table/non-SHB docs got entities only, 0 relations/evidence.
  - Bug 4: `queryPlanning.ts:272` hardcoded `'container'` in stepKeywords, forcing ProcessStep routing for a container-kind noun.
  - Bug 5: no structured logging substrate (no logging/ dir, no ai/log.ts) → failures untraceable.
fix: |
  - Bug 1: added GET_GENERATION_META_BY_SNAPSHOT / RESOLVE_ENTITIES / TRAVERSE_FROM_SEEDS parameterized Cypher; implemented validateVectorIndexMetadata (dimension compare, cache-first), resolveEntities (→ClarificationCandidate), traverse (1-hop Entity-Entity joined to Fact on r.factKey, dedup+limit+truncation) on Neo4jRepository; replaced both `as unknown as` casts in main.ts with a typed indexGateway adapter (bridges queryFulltext→queryFullText, queryVector criteria.vector, cleanupSupersededSnapshots→cleanupSupersededGenerations) + graphGateway = repo directly. Compiler now enforces both contracts.
  - Bug 2: deleted the keyword lists + matchTerms; rewrote intentRouter.ts as async LLM-reasoned step with fixed taxonomy (operate_taskmate|query_taskmate|query_knowledge|mixed|clarify), strict Zod IntentResultSchema, json_schema response_format, ONE retry on off-schema, IntentRouterUnavailableError when LLM unconfigured/off-schema; added query_taskmate READ route; threaded through groundedTurn.ts/semanticScopeRouter.ts/AIChatDrawer.tsx; reset fullResponse='' at top of tool loop (Cause B).
  - Bug 3: de-hardcoded extraction.ts (canonicalName = PROCEDURE_NAME, dynamic ctx.containerProcessId, null-safe CONTAINS_STEP); wired prose extractors into graphBuildService.executeRebuild via ProseExtractionConfig (safe no-op when unconfigured).
  - Bug 4: removed 'container' from queryPlanning.ts:272 stepKeywords.
  - Bug 5: created knowledge-server/src/logging/structured.ts + src/services/ai/log.ts (dependency-free, tags [ROUTE][RETRIEVE][TOOL][SYNTHESIS][PUBLISH], correlation ID, level filter, secret redaction).
verification: |
  Structural (runnable here): knowledge-server tsc --noEmit CLEAN; root tsc CLEAN. Targeted vitest — Bug 2: 43 client tests; Bug 3: 25 server tests; Bug 5: 5 tests; Bug 1: 10 new mock-driver gateway tests (tests/neo4jRepository.gateway.test.ts). 2 server failures (retrievalAcceptance 18-ACC-05, main.test tsx startup) proven PRE-EXISTING (not regressions) via git stash differential on both passes.
  NOT verifiable here (needs human + live env): end-to-end run against live Neo4j + LLM endpoint — the two repro queries, Cypher traverse semantics (r.factKey↔Fact.factKey join, multi-row dedup, 1-hop sufficiency for container-60000006), and whether DEGRADED banner is gone.
files_changed:
  - knowledge-server/src/graph/neo4jRepository.ts
  - knowledge-server/src/main.ts
  - knowledge-server/src/graph/extraction.ts
  - knowledge-server/src/services/graphBuildService.ts
  - knowledge-server/src/retrieval/queryPlanning.ts
  - knowledge-server/src/logging/structured.ts
  - knowledge-server/tests/neo4jRepository.gateway.test.ts
  - src/services/ai/intentRouter.ts
  - src/services/ai/groundedTurn.ts
  - src/services/ai/semanticScopeRouter.ts
  - src/services/ai/log.ts
  - src/components/ai/AIChatDrawer.tsx
  - tests/ai/intentRouter.test.ts
  - tests/ai/log.test.ts
