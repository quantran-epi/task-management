---
phase: quick
plan: 261027-htc
subsystem: federated-retrieval
tags: [budget-accounting, dedupe, retrieval, grounded-turn]
requires: []
provides:
  - "packFederatedEvidence helper: dedupe-aware packing with truncated stop signal"
  - "Tier expansion driven by packed survivor count"
  - "Truthful BUDGET_ITEMS / BUDGET_EVIDENCE stop codes"
  - "Client federated budgets maxItems 200 / maxEvidenceChars 56000"
affects:
  - knowledge-server/src/services/federatedRetrievalService.ts
  - src/services/ai/groundedTurn.ts
tech-stack:
  added: []
  patterns:
    - "Budget enforced once, on the packed post-dedupe population"
key-files:
  created: []
  modified:
    - knowledge-server/src/services/federatedRetrievalService.ts
    - knowledge-server/tests/federatedRetrieval.test.ts
    - src/services/ai/groundedTurn.ts
    - tests/ai/groundedTurn.test.ts
decisions:
  - "Pack per tier via packFederatedEvidence and drive expansion + stop codes from it, so counters and packing measure the same population"
  - "Client maxItems 200 = schema cap and limit(20) x maxSets(10) supply bound; maxEvidenceChars 56000 = REDUCE_TRIGGER_CHARS(60000) minus 4000 headroom"
metrics:
  duration: "~9 min"
  completed: "2026-10-27"
---

# Quick 261027-htc: Federated Retrieval Budget Accounting Summary

Budgets now enforced once on the packed post-dedupe population; multi-set evidence no longer silently discarded.

## What changed

### Task 1 — budget accounting fix (`3fc728a`)

Root cause: `accumulatedItemsCount` / `accumulatedEvidenceChars` summed every item of every set before cross-set dedupe, while the packing loop applied `maxItems` / `maxEvidenceChars` to the deduped packed set. Two counters, two populations. Coverage gate `maxItems * 0.6` read the inflated counter, so LIKELY/OPTIONAL expansion was skipped exactly when distinct evidence was still missing.

Fix:
- New `PackedFederatedEvidence` + `FederatedSetResult` module-scope types.
- New `packFederatedEvidence(perSetResults, budgets)` helper holding the former post-loop packing logic (baseline-then-scope_diff D-22 order, path cap 100 D-14, conflict cap 100, T-24-08 graph dedupe, set-aware non-graph key, char break). Two deliberate changes: dead `items.length >= 200` clause removed; item/char breaks set `truncated = 'items' | 'evidence'`.
- Tier loop packs after each tier (`finalPack = packFederatedEvidence(perSetResults, budgets)`), then checks `truncated` before the elapsed check — preserving the old precedence where packing stop overwrites `BUDGET_SETS`.
- Expansion gate reads `finalPack.items.length < coverageThreshold`.
- Accumulation loop and post-loop re-pack deleted; downstream modality counts, `NO_EVIDENCE` check, and payload read `finalPack.*`.

Regressions added to `knowledge-server/tests/federatedRetrieval.test.ts` (`SET_ID_4`, `mockEntityItem`, `describe('Federated budget accounting (261027-htc)')`):
1. Duplicate graph identities across 4 REQUIRED baseline sets with identical 20 entities + 1 unique chunk each.
2. Single-set control vs 4-set treatment (2 REQUIRED + 2 LIKELY).

### Task 2 — client budget tuning (`697cb86`)

`src/services/ai/groundedTurn.ts`: `maxItems` 50 -> 200, `maxEvidenceChars` 30000 -> 56000, with a comment naming the constraint. `elapsedMs 300000`, `maxSets 10`, `concurrency 4`, `limit 20` unchanged. `tests/ai/groundedTurn.test.ts` test 25 renamed and asserts all five budget fields.

Both numbers derive from code constants, not invention:
- 200 = `FederatedRetrievalBudgetsSchema` cap (`retrievalProtocol.ts:668`) = `limit: 20` x `maxSets: 10` supply bound; below `REDUCE_TRIGGER_RECORDS = 400`.
- 56000 = `REDUCE_TRIGGER_CHARS = 60_000` (`groundedSynthesis.ts:426`) minus 4000 headroom. Federated char metric (`rawSnippet` + `sourceDocumentTitle`) upper-bounds the synthesis prompt metric (`citedExcerpt`, which for server chunks is exactly `rawSnippet`), so it cannot force the digest pass.

Honest note: with `TARGET_CHUNK_SIZE = 6000`, the 56000-char budget binds at ~9 chunks; `maxItems` never binds for chunks. The items raise only helps small items (average under ~280 chars), where 50 would otherwise truncate silently.

## RED results (verbatim, pre-fix)

Command: `cd knowledge-server && ./node_modules/.bin/vitest run tests/federatedRetrieval.test.ts`

```
 FAIL  tests/federatedRetrieval.test.ts > Federated budget accounting (261027-htc) > does not charge duplicate graph identities to the item budget (no false BUDGET_ITEMS)
AssertionError: expected [ { code: 'BUDGET_ITEMS', …(2) } ] to have a length of +0 but got 1

- Expected
+ Received

- 0
+ 1

 ❯ tests/federatedRetrieval.test.ts:935:47
    933|     expect(retrieveMock).toHaveBeenCalledTimes(4);
    934|     expect(body.items).toHaveLength(24);
    935|     expect(body.diagnostics.coverageWarnings).toHaveLength(0);
       |                                               ^
    936|     expect(body.outcome).toBe('READY');
    937|   });

 FAIL  tests/federatedRetrieval.test.ts > Federated budget accounting (261027-htc) > admits distinct LIKELY evidence when packed survivors are below the coverage threshold
AssertionError: expected [ { …(4) }, { …(4) }, { …(4) }, …(17) ] to have a length of 50 but got 20

- Expected
+ Received

- 50
+ 20

 ❯ tests/federatedRetrieval.test.ts:965:34
    963|
    964|     expect(control.body.items).toHaveLength(20);
    965|     expect(treatment.body.items).toHaveLength(50);
       |                                  ^

 Test Files  1 failed (1)
      Tests  5 failed | 14 passed (19)
```

Red signals matched the plan exactly: false `BUDGET_ITEMS` warning on the duplicate-identity case, and treatment equal to control at 20 items (LIKELY never admitted).

## Final packed counts (post-fix, measured by tests)

| Test | Control | Treatment | Assertion |
|------|---------|-----------|-----------|
| Duplicate-identity | — | 24 items (20 collapsed entities + 4 unique chunks) | `coverageWarnings` empty, outcome `READY` |
| Multi-set vs single-set | 20 items (one REQUIRED set) | 50 items (2 REQUIRED + 2 LIKELY) | 50 > 20, SET_ID_3 + SET_ID_4 retrieved |

## Verification

- `cd knowledge-server && ./node_modules/.bin/vitest run tests/federatedRetrieval.test.ts` — both new tests pass; 16 of 19 pass. The 3 remaining failures are pre-existing at HEAD (verified by running the unmodified HEAD test file) and unrelated to this change: two use a 2-arg `toHaveBeenCalledWith` against the 3-arg `retrievePerSet` call (`signal` added in an earlier change), one asserts all-timeout modality status with a mock whose abort timing is not exercised. Out of scope per scope boundary; not fixed.
- `cd knowledge-server && npx tsc --noEmit` — exit 0.
- `npx vitest run tests/ai/groundedTurn.test.ts` — 52 passed.
- Grep checks: `accumulatedItemsCount` / `accumulatedEvidenceChars` / `items.length >= 200` absent; `packFederatedEvidence(` at definition (line 181) and tier loop (line 424); `maxEvidenceChars: 56000` present in `groundedTurn.ts`.
- Only the four planned files changed. No new dependencies. No full-suite run.

## Deviations from Plan

**1. [Rule 3 - Blocking] New-test assertion switched from `toHaveBeenCalledWith` to call-argument inspection**

- **Found during:** Task 1 verification
- **Issue:** `retrievePerSet` is invoked with a third `signal` argument by the existing timeout wrapper, so `expect(fn).toHaveBeenCalledWith(setId, expect.anything())` never matches. The plan text for the new test used that form (mirroring the older tests).
- **Fix:** Assert on `retrieveMock.mock.calls.map((c) => c[0])` with `expect.arrayContaining([SET_ID_3, SET_ID_4])`.
- **Files modified:** `knowledge-server/tests/federatedRetrieval.test.ts`
- **Commit:** `3fc728a`

**2. [Out of scope, documented] Three pre-existing test failures at HEAD**

- Same 2-arg/3-arg matcher issue (2 tests) and an all-timeout modality assertion (1 test). Present before this plan's changes; left untouched per scope boundary. Task 1's gate is judged on the two new regressions plus `tsc`, both of which pass.

## Self-Check: PASSED

- `knowledge-server/src/services/federatedRetrievalService.ts` — modified, committed `3fc728a`
- `knowledge-server/tests/federatedRetrieval.test.ts` — modified, committed `3fc728a`
- `src/services/ai/groundedTurn.ts` — modified, committed `697cb86`
- `tests/ai/groundedTurn.test.ts` — modified, committed `697cb86`
