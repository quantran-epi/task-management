---
phase: quick
plan: 261027-htc
type: execute
wave: 1
depends_on: []
files_modified:
  - knowledge-server/src/services/federatedRetrievalService.ts
  - knowledge-server/tests/federatedRetrieval.test.ts
  - src/services/ai/groundedTurn.ts
  - tests/ai/groundedTurn.test.ts
autonomous: true
requirements: [HTC-BUDGET-ACCOUNTING, HTC-BUDGET-TUNING]
must_haves:
  truths:
    - "Budget counters and the packing loop measure the same population: post-dedupe packed items and chars"
    - "Duplicate graph identities never consume the item budget, and no false BUDGET_ITEMS warning is emitted"
    - "Tier expansion to LIKELY/OPTIONAL is gated on packed survivor count, not on pre-fusion item counts"
    - "BUDGET_ITEMS / BUDGET_EVIDENCE are reported only when the packing loop actually truncated output"
    - "Multiple sets of distinct items return more items than a single set under identical budgets"
    - "Client maxEvidenceChars stays at or below 60000 so single-pass synthesis (no digest pass) is preserved"
  artifacts:
    - path: "knowledge-server/src/services/federatedRetrievalService.ts"
      provides: "Packing-aware budget enforcement and honest stop codes"
      contains: "packFederatedEvidence"
    - path: "knowledge-server/tests/federatedRetrieval.test.ts"
      provides: "Duplicate-identity stop-code regression and multi-set vs single-set item-count regression"
      contains: "SET_ID_4"
    - path: "src/services/ai/groundedTurn.ts"
      provides: "Accuracy-first federated budgets below the synthesis reduce trigger"
      contains: "maxEvidenceChars: 56000"
  key_links:
    - from: "knowledge-server/src/services/federatedRetrievalService.ts"
      to: "packFederatedEvidence"
      via: "per-tier packed preview drives expansion gate and stop code"
      pattern: "packFederatedEvidence\\("
    - from: "knowledge-server/src/services/federatedRetrievalService.ts"
      to: "budgetStopCode"
      via: "packing truncation result, not pre-fusion counters"
      pattern: "truncated === 'items'"
    - from: "src/services/ai/groundedTurn.ts"
      to: "src/services/ai/groundedSynthesis.ts REDUCE_TRIGGER_CHARS"
      via: "maxEvidenceChars kept below the reduce trigger"
      pattern: "maxEvidenceChars: 56000"
  user_setup: []
---

<objective>
Fix federated retrieval budget accounting so multi-set evidence is not silently discarded, then tune the client budget within a justified ceiling.

Root causes (already verified — do not re-investigate):
1. `knowledge-server/src/services/federatedRetrievalService.ts:307-310` increments `accumulatedItemsCount` and `accumulatedEvidenceChars` over every item of every set BEFORE cross-set dedupe and BEFORE the packing loop. The packing loop at `:387-414` applies `budgets.maxItems` / `budgets.maxEvidenceChars` to the POST-dedupe packed set. The two counters measure different populations, so adding sets can yield zero extra evidence and false BUDGET_ITEMS/BUDGET_EVIDENCE labels.
2. `coverageThreshold = budgets.maxItems * 0.6` at `:207` compares against the same inflated counter, so LIKELY/OPTIONAL expansion is skipped once the inflated count crosses the threshold — this is where distinct evidence is actually lost.
3. `:388` contains a dead `|| items.length >= 200` clause: `maxItems` is schema-capped at 200 (`knowledge-server/src/types/retrievalProtocol.ts:668`) and `:315` already breaks at `maxItems`, so `items.length` can never reach 200 there.

Downstream capacity (bounds Task 2): `src/services/ai/evidencePack.ts:413-427` packs every candidate with no char budget and sets `text: candidate.citedExcerpt`; for server chunks `citedExcerpt = chunk.rawSnippet` exactly (`evidencePack.ts:220,242`), and packed entities are capped at 50 (`evidencePack.ts:193`) and go to `seedEntities`, not `promptEvidence`. The federated metric (`rawSnippet` + `sourceDocumentTitle`) therefore upper-bounds the synthesis prompt char count. `src/services/ai/groundedSynthesis.ts:426-427,667-673` triggers `digestEvidence()` only above `REDUCE_TRIGGER_CHARS = 60_000` or `REDUCE_TRIGGER_RECORDS = 400`.

Purpose: accuracy and completeness first — every distinct piece of evidence that fits the stated budget must survive; token savings are secondary.
Output: dedupe-aware budget enforcement with truthful stop codes, two regression tests, and a client budget derived from code constants (not invented numbers).
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@knowledge-server/src/services/federatedRetrievalService.ts
@knowledge-server/src/types/retrievalProtocol.ts
@knowledge-server/tests/federatedRetrieval.test.ts
@src/services/ai/groundedTurn.ts
@src/services/ai/groundedSynthesis.ts
@src/services/ai/evidencePack.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Enforce budgets on the packed post-dedupe population and emit honest stop codes</name>
  <files>knowledge-server/src/services/federatedRetrievalService.ts, knowledge-server/tests/federatedRetrieval.test.ts</files>
  <behavior>
    - Duplicate-identity accounting (RED pre-fix): 4 REQUIRED baseline sets in one tier (all four run in both worlds), each returning the same 20 entities plus 1 unique chunk, budgets maxItems 50 / maxEvidenceChars 10000. Both worlds pack to 24 items (20 collapsed entities + 4 unique chunks; 40-char entities and 30-char chunks stay well under 10000). Red signal is the stop code: pre-fix the pre-fusion counter sums 84 and emits a false BUDGET_ITEMS warning with DEGRADED outcome; post-fix `coverageWarnings` is empty and outcome is READY. Both worlds: `retrieveMock` called 4 times, `items.length` 24.
    - Single set vs four sets (RED pre-fix, the real item loss): comparisonMode 'single', baseline roleGroup, budgets maxItems 50 / maxEvidenceChars 10000. Treatment = SET_ID_1 + SET_ID_2 REQUIRED baseline sets each returning the same 20 entities, plus SET_ID_3 + SET_ID_4 LIKELY baseline sets each returning 20 distinct chunks. Control = same request with only SET_ID_1 (REQUIRED). Post-fix: 20 packed survivors < 50*0.6 = 30, so LIKELY expands; treatment length is 50 and greater than control length 20; SET_ID_3/SET_ID_4 were retrieved. Pre-fix: inflated count 40 >= 30 skips LIKELY, treatment length is 20 equal to control, and SET_ID_3/SET_ID_4 are never retrieved.
    - Existing Test Case 2 (maxItems 10, one REQUIRED item then one LIKELY item) still returns 2 items and calls both sets.
    - Existing dedupe, snapshot isolation, role-group ordering, maxSets, timeout, and aggregation tests are unchanged.
  </behavior>
  <action>
Edit `knowledge-server/src/services/federatedRetrievalService.ts`:

1. Add two module-scope types near `computeEvidenceChars`:
   - `FederatedSetResult` with `assignment: FederatedRetrievalRequest['setTierAssignments'][number]`, optional `response?: RetrievalResponse`, optional `failureReason?: 'TIMEOUT' | 'STALE' | 'ERROR'`, optional `latencyMs?: number`. Use it for the `perSetResults` declaration at `:176-181` and for the helper parameter.
   - `PackedFederatedEvidence` with `items: FederatedRetrievalResponse['items']`, `paths: FederatedRetrievalResponse['paths']`, `conflictGroups: FederatedRetrievalResponse['conflictGroups']`, `retainedEntityIds: Set<string>`, `retainedEdgeIds: Set<string>`, `retainedPathIds: Set<string>`, `totalCharsIncluded: number`, and `truncated: 'items' | 'evidence' | null`.

2. Add `packFederatedEvidence(perSetResults: readonly FederatedSetResult[], budgets: { maxItems: number; maxEvidenceChars: number }): PackedFederatedEvidence` after `computeEvidenceChars`. Move the logic currently at `:338-415` into it unchanged (baseline-then-scope_diff ordering per D-22, path cap 100 with the D-14 comment, conflict cap 100, T-24-08 graph identity dedupe via `retainedGraphIdentity`, non-graph key `${setId}:${type}:${id}`, `computeEvidenceChars`, and the `totalCharsIncluded + itemChars > budgets.maxEvidenceChars && items.length > 0` char break) with exactly two changes:
   - Remove the dead `|| items.length >= 200` clause.
   - When the item-count check `items.length >= budgets.maxItems` fires, set `truncated = 'items'` and break. When the char check fires, set `truncated = 'evidence'` and break. Otherwise leave `truncated` null.
   The helper must not mutate `perSetResults` and must return independent arrays/sets each call (it runs once per tier).

3. In `runFederatedRetrieval`:
   - Delete `accumulatedItemsCount` / `accumulatedEvidenceChars` declarations (`:183-184`) and the accumulation loop inside tier-results handling (`:307-310`). Keep pushing results and the failure-warning branch unchanged.
   - Before the tier loop, initialize `let finalPack = packFederatedEvidence([], budgets);`.
   - In the expansion gate (`currentTier !== 'REQUIRED'`, `:206-233`), replace `accumulatedItemsCount < coverageThreshold` with `finalPack.items.length < coverageThreshold`. Keep `coverageThreshold = budgets.maxItems * 0.6`, `missingScope`, `hasBaselineSuccess`, and `hasScopeDiffSuccess` untouched.
   - At the end of each tier body (replacing `:314-326`), assign `finalPack = packFederatedEvidence(perSetResults, budgets);`, then run the stop checks in this order: `finalPack.truncated === 'items'` sets `budgetStopCode = 'BUDGET_ITEMS'` and breaks; `finalPack.truncated === 'evidence'` sets `budgetStopCode = 'BUDGET_EVIDENCE'` and breaks; the existing elapsed check (`now() - startTime >= budgets.elapsedMs` sets `BUDGET_ELAPSED` and breaks) stays last. This preserves the old precedence where a packing stop overwrites a `BUDGET_SETS` code set at `:244`.
   - After the loop, delete the re-packing block (`:337-415`) and every local `items` / `paths` / `conflictGroups` / `retained*` / `totalCharsIncluded` declaration, then reference `finalPack.*` everywhere downstream: modality aggregation (`graph.itemCount`), `everySetSeedOnly`, the `items.length === 0 && paths.length === 0` outcome check, and `responsePayload`. The `budgetStopCode` warning push and the aggregation/outcome logic stay otherwise unchanged.
   - Keep `computeEvidenceChars`, `retainedGraphIdentity`, `runWithTimeout`, `mapConcurrent`, per-set timeout, abort handling, `maxSets`, and modality severity aggregation untouched.

Then extend `knowledge-server/tests/federatedRetrieval.test.ts`:
- Add module-scope `SET_ID_4 = '00000000-0000-4000-8000-000000000004'` next to `SET_ID_3`, and a `mockEntityItem(id, snapshotId)` helper next to `mockChunkItem` returning `{ type: 'entity', id, score: 1, modalitiesContributed: ['graph'], urn: id, canonicalName: id, kind: 'DatabaseObject', snapshotId, hasConflict: false }` (same shape as the passing `entityItem` in the 24-03 describe).
- Append `describe('Federated budget accounting (261027-htc)', ...)` with a local helper that injects requests through `buildKnowledgeServer` (mirror `runFederation` at `:605-635`) taking `responses`, `assignments`, and `budgets`, returning `{ body, retrieveMock }` so call counts are assertable.
- Add the two tests from `<behavior>`: duplicate-identity stop-code test, and single-set vs four-set test (control request with only SET_ID_1).
- Leave every existing test unchanged; if one fails, fix the production logic, not the assertion (no existing assertion encodes pre-fusion counting).

Before applying the production fix, run the new tests once and record the red results for both tests in the SUMMARY.
  </action>
  <verify>
    <automated>cd knowledge-server && ./node_modules/.bin/vitest run tests/federatedRetrieval.test.ts</automated>
    <automated>cd knowledge-server && npx tsc --noEmit</automated>
  </verify>
  <done>
    Budgets are enforced once, on the packed post-dedupe population. Duplicate identities no longer consume the item budget or emit false stop codes; tier expansion reads packed survivors and admits distinct LIKELY evidence; BUDGET_ITEMS/BUDGET_EVIDENCE fire only on real packing truncation; the dead 200 clause is gone. All pre-existing federated retrieval tests pass and `tsc --noEmit` is clean.
  </done>
</task>

<task type="auto">
  <name>Task 2: Raise client evidence budget to the justified ceiling below the synthesis reduce trigger</name>
  <files>src/services/ai/groundedTurn.ts, tests/ai/groundedTurn.test.ts</files>
  <behavior>
    - Federated request budgets from the client become maxItems 200, maxEvidenceChars 56000; elapsedMs 300000, maxSets 10, concurrency 4, limit 20 unchanged.
    - 56000 is derived from `REDUCE_TRIGGER_CHARS = 60_000` (`src/services/ai/groundedSynthesis.ts:426`) with 4000 chars of headroom. The federated metric (`rawSnippet` + `sourceDocumentTitle`) upper-bounds the synthesis prompt metric (`citedExcerpt` text length, which for server chunks is exactly `rawSnippet`), so a federated total of 56000 cannot push `evidenceChars` past 60000 or force the digest pass.
    - 200 equals the schema cap (`knowledge-server/src/types/retrievalProtocol.ts:668`, mirrored at `src/services/knowledge/retrievalProtocol.ts:705`) and the maximum supply (`limit: 20` x `maxSets: 10`), and stays below `REDUCE_TRIGGER_RECORDS = 400`. Note honestly: with `TARGET_CHUNK_SIZE = 6000` (`knowledge-server/src/types/protocol.ts:8`) the 56000-char budget binds at about 9 chunks and maxItems never binds; the items raise only matters for small items (average under ~280 chars), where 50 would otherwise truncate silently. Do not claim a bigger effect.
    - Guard: if Task 1's regressions do not pass (four sets do not beat one set, or a false stop code remains), skip this task, keep the current values (`maxItems: 50`, `maxEvidenceChars: 30000`), and record "Task 2 skipped — Task 1 regressions did not pass" in the SUMMARY. Do not invent alternative numbers.
  </behavior>
  <action>
Edit `src/services/ai/groundedTurn.ts:504-511`: change `maxItems` from 50 to 200 and `maxEvidenceChars` from 30000 to 56000. Leave `concurrency: 4`, `elapsedMs: 300000`, `maxSets: 10`, `limit: 20`, and every other field untouched. Add a short comment above `maxEvidenceChars` naming the constraint: federated chars count raw snippet plus title and therefore upper-bound the synthesis prompt text, so 56000 stays under `REDUCE_TRIGGER_CHARS = 60_000` and keeps single-pass synthesis; the headroom absorbs the snippet-vs-excerpt difference.

Edit `tests/ai/groundedTurn.test.ts`, test 25 (`Uses a bounded 300-second federated retrieval budget`, around line 751): rename it to reflect accuracy-first budgets and extend the `expect.objectContaining` assertion to `{ elapsedMs: 300000, maxItems: 200, maxEvidenceChars: 56000, maxSets: 10, concurrency: 4 }`. Change nothing else in the file.

Commit Task 1 and Task 2 separately so each can be reverted independently.
  </action>
  <verify>
    <automated>npx vitest run tests/ai/groundedTurn.test.ts</automated>
  </verify>
  <done>
    Client federated budgets are maxItems 200 / maxEvidenceChars 56000, each derived from a code constant (schema cap and supply bound; reduce trigger minus headroom), and the budget test asserts them. Single-pass synthesis remains guaranteed because the federated char metric upper-bounds the prompt char metric below 60000.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client → knowledge-server `/api/v1/retrieve` | Budget values cross here; already Zod-capped (`maxItems` 200, `maxEvidenceChars` 100_000) |
| knowledge-server → client synthesis | Packed evidence size determines downstream LLM payload; bounded by the same budgets |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-htc-01 | Denial of Service | `packFederatedEvidence` called once per tier | accept | Tier count is 3; packing is a single pass over per-set items. No new unbounded work beyond the existing packing loop. |
| T-htc-02 | Denial of Service | Raised client budgets | mitigate | `maxItems` 200 equals the schema cap and `limit * maxSets` supply bound; `maxEvidenceChars` 56000 stays below the 60000 synthesis reduce trigger, so no extra model call or unbounded payload. |
| T-htc-03 | Tampering | Budget values from the wire | mitigate | Server keeps Zod validation (`FederatedRetrievalBudgetsSchema`) unchanged; the helper only reads already-validated values. |
| T-htc-04 | Information disclosure | Stop-code warnings | mitigate | Warnings remain content-free enum codes plus a fixed message; no query text or excerpts added. |
</threat_model>

<verification>
- `cd knowledge-server && ./node_modules/.bin/vitest run tests/federatedRetrieval.test.ts` — all green, including both new accounting tests.
- `cd knowledge-server && npx tsc --noEmit` — clean (tsconfig includes `src/**/*`; the new helper types are compiled).
- `npx vitest run tests/ai/groundedTurn.test.ts` — green.
- Grep checks: `accumulatedItemsCount` and `accumulatedEvidenceChars` no longer appear in `knowledge-server/src/services/federatedRetrievalService.ts`; `items.length >= 200` is gone; `packFederatedEvidence(` appears in both the helper definition and the tier loop; `maxEvidenceChars: 56000` appears in `src/services/ai/groundedTurn.ts`.
- Only these files changed: `knowledge-server/src/services/federatedRetrievalService.ts`, `knowledge-server/tests/federatedRetrieval.test.ts`, `src/services/ai/groundedTurn.ts`, `tests/ai/groundedTurn.test.ts`.
- No full-suite run, no new dependencies, no changes to abort handling, per-set timeout, maxSets, elapsedMs, modality severity aggregation, cross-set dedupe (T-24-08), or path/conflict caps.
</verification>

<success_criteria>
- Four sets with distinct items return more evidence than one set under identical budgets; duplicate identities never consume the item budget; tier expansion is driven by packed survivors.
- BUDGET_ITEMS and BUDGET_EVIDENCE are truthful: they appear only when the packing loop truncated output.
- Client budgets are accuracy-first and justified: 56000 chars stays under the 60000 reduce trigger; 200 items equals the schema cap and supply bound.
- Two atomic commits: (1) budget accounting fix + regressions, (2) client budget tuning (or an explicit, recorded skip if Task 1's evidence does not justify it).
</success_criteria>

<output>
Create `.planning/quick/261027-htc-fix-federated-retrieval-budget-accountin/261027-htc-SUMMARY.md` when done, recording the pre-fix red results and the final packed counts.
</output>
