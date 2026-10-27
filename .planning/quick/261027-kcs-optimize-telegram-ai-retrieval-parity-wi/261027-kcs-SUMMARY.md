---
phase: quick
plan: 261027-kcs
subsystem: telegram-ai
tags: [telegram, grounded-retrieval, parity, mcp, admin-mutation]
requires: [runGroundedTurn, discoverAllMcpTools, executeAdminMutationTurn]
provides: [runTelegramGroundedTurn, formatGroundedNonAnswer]
affects: [src/services/telegram/telegramHeadlessWorker.ts]
tech-stack:
  added: []
  patterns: [shared-grounded-helper, grounded-first-mixed-routing, explicit-terminal-dispatch]
key-files:
  created: []
  modified:
    - src/services/telegram/telegramHeadlessWorker.ts
    - tests/telegram/telegramHeadlessWorker.test.ts
decisions:
  - Mixed admin turns run grounded retrieval first and pass evidence as mutation context, never as a separate reply.
  - Grounded terminal outcomes (clarify_intent, clarify_entity, error) dispatch one reply and return, blocking ungrounded fall-through.
  - Fallback loop ceiling raised to 30 with dynamic MCP tools merged for full/knowledge_only scopes.
  - Dropped all source-title caps; SEED_ONLY entity caps retained.
metrics:
  duration: ~25m
  completed: 2026-10-27
---

# Quick Task 261027-kcs: Telegram AI retrieval parity

## One-liner

Telegram AI now grounds mixed requests before admin mutations, stops on clarify/error outcomes, and runs the 30-loop AI-Chat-parity fallback with dynamic MCP tools and uncapped citation titles.

## Changes

### `src/services/telegram/telegramHeadlessWorker.ts`

- Added module-scope `runTelegramGroundedTurn(params)` owning knowledge config lookup, catalog fetch, deps creation and `runGroundedTurn`. Reused by both mixed continuation and Step 6 `query_knowledge`.
- Added `formatGroundedNonAnswer(result)` producing concise Vietnamese replies for `clarify_intent`, `clarify_entity`, and `error` (all four codes). Returns `null` so callers continue normal handling.
- Mixed (`operate_taskmate`/`mixed`) admin path: non-admin refusal and quota refund preserved; admin mixed runs grounded first. Terminal outcome replies once and returns. `grounded_answer` is formatted and appended to `contextText` before `executeAdminMutationTurn`; the grounded answer is not sent separately. Preview/confirmation semantics untouched.
- Step 6 no longer duplicates grounded setup; terminal dispatcher runs before `grounded_answer`/fallback handling.
- Step 7 merges `discoverAllMcpTools(db)` into local read tools for `full` and `knowledge_only`. Discovery failure is warning-only. `pure_llm`/`tasks_only` receive no MCP tools. Mutation gate and read-only MCP execution unchanged.
- Fallback `maxLoops` raised from 5 to 30 with comment noting no natural cancellation source.
- Removed `.slice(0,3)` on fallback reference titles and `.slice(0,5)` on citation title arrays. SEED_ONLY entity caps retained.

### `tests/telegram/telegramHeadlessWorker.test.ts`

Added `AI Chat retrieval parity` suite (6 behavioral tests):

1. Mixed grounded retrieval runs before mutation stream, evidence lands in mutation system context, exactly one preview reply, no task written before confirmation.
2. `clarify_intent` sends one reply, no fallback stream.
3. `clarify_entity` sends one reply listing candidates, no fallback stream.
4. `ERROR_AUTH` sends one useful reply, no fallback stream.
5. Six tool rounds then final text proves `maxLoops > 5`; first payload includes mocked dynamic MCP tool.
6. Six cited document titles all survive HTML conversion and lossless splitting.

## Verification

- `./node_modules/.bin/vitest run tests/telegram/telegramHeadlessWorker.test.ts` → 43 passed, 1 file passed.
- `./node_modules/.bin/tsc --noEmit -p tsconfig.json` → exit 0, no diagnostics.
- `grep "maxLoops: 5"` → no match; `grep "slice(0, *[35])"` → only SEED_ONLY entity caps and comment.

## Deviations from Plan

- Test infrastructure: worktree lacked `node_modules` and the shared checkout had a corrupted install (`@jridgewell/sourcemap-codec` missing). Used a junction to a complete sibling worktree's `node_modules` for targeted test/typecheck runs only; no dependency or lockfile changes.
- Test authoring fix during TDD: initial title-survival test passed a wrapper object instead of `.grounding`; corrected to the real formatter input.

## Commits

- `71a117f` fix(telegram): reach AI Chat retrieval parity (production + tests, atomic)

## Deferred

- None.
