---
phase: quick
plan: 261027-fzh
type: execute
wave: 1
depends_on: []
files_modified:
  - src/services/ai/mcpRetrievalRunner.ts
  - src/services/ai/mcpEvidence.ts
  - tests/ai/mcpRetrievalRunner.test.ts
  - tests/ai/mcpEvidence.test.ts
autonomous: true
requirements: [FZH-NOVELTY-TERMINATION, FZH-CURSOR-PAGINATION]
must_haves:
  truths:
    - "Retrieval keeps going past 4 turns while each turn adds new evidence records"
    - "Retrieval stops after 2 consecutive zero-novelty turns even when the planner keeps proposing calls"
    - "A stop caused by the turn safety valve (12) or the 5m watchdog is reported with an explicit warning and completeness 'partial'"
    - "Planner-done and no-executable-call stops are still reported as 'complete'"
    - "Cursor-only tools (nextCursor / next_cursor / cursor+has_more, flat or nested) fetch page 2+ instead of stopping at page 1"
    - "A cursor that does not change between pages ends pagination instead of looping"
  artifacts:
    - path: "src/services/ai/mcpRetrievalRunner.ts"
      provides: "Novelty-tracked loop, turn safety valve, cap-aware completeness, cursor-aware page loop"
      contains: "MAX_RETRIEVAL_TURNS_SAFETY_VALVE"
    - path: "src/services/ai/mcpEvidence.ts"
      provides: "PaginationHint with cursor support and structural cursor extraction"
      contains: "nextCursor"
    - path: "tests/ai/mcpRetrievalRunner.test.ts"
      provides: "Novelty termination, safety-valve partial reporting, cursor paging + repeat guard"
    - path: "tests/ai/mcpEvidence.test.ts"
      provides: "Cursor hint extraction and cursor application inside wrapper args"
  key_links:
    - from: "src/services/ai/mcpRetrievalRunner.ts"
      to: "normalizeMcpEvidence"
      via: "recordId set diff per turn to count new evidence"
      pattern: "normalizeMcpEvidence\\(items\\)"
    - from: "src/services/ai/mcpRetrievalRunner.ts"
      to: "extractPaginationHint"
      via: "cursor-or-offset continuation in the per-call page loop"
      pattern: "nextCursor \\?\\? nextOffset"
  user_setup: []
---

<objective>
Make MCP retrieval run until evidence is exhausted instead of stopping at the hard 4-turn cap, and make cursor-only tools paginate.

Root causes (already verified, do not re-investigate):
1. `src/services/ai/mcpRetrievalRunner.ts:56` `MAX_RETRIEVAL_TURNS = 4`; the `for` loop exits silently at the cap and `finish()` reports `completeness: pagesCapped ? 'partial' : 'complete'`, so a turn-cap stop claims 'complete'.
2. `src/services/ai/mcpEvidence.ts:305-340` `extractPaginationHint` docstring claims `{nextCursor}` support but only reads offsets; cursor tools stop at page 1.

Purpose: retrieval stops when it stops learning, not on an arbitrary turn count; every deliberate stop is reported honestly.
Output: novelty-based termination with a 12-turn safety valve, structural cursor pagination, focused regression tests.

Constraints (do not weaken): abort handling, 5-minute watchdog, `MAX_PAGES_PER_CALL = 20`, duplicate-call suppression, unknown-tool rejection, mutation-tool interception. No new dependencies. Targeted tests only — do not run the full suite.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@src/services/ai/mcpRetrievalRunner.ts
@src/services/ai/mcpEvidence.ts
@tests/ai/mcpRetrievalRunner.test.ts
@tests/ai/mcpEvidence.test.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Novelty-based termination with explicit safety-valve reporting</name>
  <files>src/services/ai/mcpRetrievalRunner.ts, tests/ai/mcpRetrievalRunner.test.ts</files>
  <behavior>
    - Turn 1 returns payload P, turn 2 returns the same P with different args: turn 2 adds 0 new recordIds, turn 3 also 0 -> loop stops after turn 3 (2 consecutive zero-novelty turns), completeness 'complete'.
    - Every turn returns a fresh distinct record: loop runs 12 turns, then stops; warnings contains the safety-valve message; completeness 'partial'; pagesCapped false.
    - Planner returns done/no calls: loop stops immediately, no cap warning, completeness 'complete'.
    - Watchdog stop: existing warning preserved, completeness 'partial'.
    - Existing abort, duplicate suppression, unknown-tool rejection, and batch-executes-after-watchdog tests still pass unchanged.
  </behavior>
  <action>
Edit `src/services/ai/mcpRetrievalRunner.ts`:

1. Rename `MAX_RETRIEVAL_TURNS` (line 56) to `MAX_RETRIEVAL_TURNS_SAFETY_VALVE`, value 12, comment "safety valve only: the loop normally ends when a turn adds no new evidence". Update both usages: the loop header (~line 220) and the prompt line `Turn ${turn} of max ...` (~line 252). Update the `runMcpRetrieval` docstring (~line 111) which says "max 4 turns".

2. Add loop-state near `items`/`warnings` (before `finish()` so the closure can read it):
   - `let stopReason: 'final' | 'turn_cap' | 'watchdog' | 'abort' | 'error' | 'novelty_exhausted' | null = null;`
   - `const knownRecordIds = new Set<string>();`
   - `let consecutiveZeroNoveltyTurns = 0;`
   Have `finish()` return `completeness: pagesCapped || stopReason === 'turn_cap' || stopReason === 'watchdog' ? 'partial' : 'complete'`. Leave `pagesCapped` itself untouched.

3. In the turn loop, set `stopReason` on every exit path (do not change the messages or the control flow):
   - parent aborted at top -> `'abort'`; watchdog fired at top -> `'watchdog'`
   - planner catch: aborted -> `'abort'`, watchdog -> `'watchdog'`, otherwise -> `'error'`
   - `!plan || !plan.toolCalls || plan.toolCalls.length === 0` -> `'final'`
   - abort inside the per-call loop -> `'abort'`
   - existing `if (plan.done || !attemptedAnyInTurn)` -> `'final'`

4. After the per-call execution loop (before the `plan.done` check), compute novelty once per turn: `const turnRecords = normalizeMcpEvidence(items).records;` count records whose `recordId` is not in `knownRecordIds`, add every `recordId` to `knownRecordIds`, then if the count is 0 increment `consecutiveZeroNoveltyTurns` else reset it to 0.

5. After the `plan.done || !attemptedAnyInTurn` check, add: if `consecutiveZeroNoveltyTurns >= 2`, set `stopReason = 'novelty_exhausted'` and break (no warning — exhaustion is a legitimate completion).

6. Immediately after the for loop (inside the same `try`, so early returns skip it), add: if `stopReason === null` set `stopReason = 'turn_cap'` and push `Đã đạt giới hạn an toàn ${MAX_RETRIEVAL_TURNS_SAFETY_VALVE} lượt truy hồi MCP; bằng chứng có thể chưa đầy đủ` into `warnings`.

Do NOT touch the page loop, `executedToolKeys`, `adaptToolArguments`, or the watchdog timer. Do NOT add a turn cap check inside the loop body; natural loop exhaustion is the cap.

Then update `tests/ai/mcpRetrievalRunner.test.ts`:
- Rewrite the test `bounded loop halts after max turns or when model signals completion` (~line 161): same mocks (non-JSON `'ok'` result, planner always proposes `step_tool` with a new step number). Rename to reflect novelty termination. Assert `callsCount === 3`, `result.items` length 3, `result.warnings` length 0, `result.completeness === 'complete'`.
- Add a test: every planner turn returns a distinct JSON payload (e.g. `{"nodes":[{"name":"Entity${turn}"}]}`) with distinct args so every turn yields a new recordId. Assert `callsCount === 12`, `result.items` length 12, `result.warnings.some(w => w.includes('giới hạn an toàn 12 lượt'))`, `result.completeness === 'partial'`, `result.pagesCapped === false`.
- Leave every other test in the file unchanged; if one fails, fix the production logic, not the test, except for assertions that explicitly encoded the old 4-turn cap.
  </action>
  <verify>
    <automated>npx vitest run tests/ai/mcpRetrievalRunner.test.ts</automated>
  </verify>
  <done>
    Loop stops on evidence exhaustion (0 new recordIds with planner done/no calls, or 2 consecutive zero-novelty turns), runs up to 12 turns while novelty continues, and reports 'partial' plus an explicit warning only when a cap/watchdog stopped it. Abort, watchdog, duplicate suppression, and unknown-tool behavior unchanged.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Structural cursor pagination (nextCursor / next_cursor / cursor+has_more)</name>
  <files>src/services/ai/mcpEvidence.ts, src/services/ai/mcpRetrievalRunner.ts, tests/ai/mcpEvidence.test.ts, tests/ai/mcpRetrievalRunner.test.ts</files>
  <behavior>
    - extractPaginationHint({nextCursor:'abc'}) -> {offsetField:'cursor', nextCursor:'abc', hasMore:true}
    - extractPaginationHint({neighbors:{next_cursor:'n2', has_more:true}}) -> offsetField 'cursor', nextCursor 'n2'
    - extractPaginationHint({cursor:'c', has_more:true}) -> cursor hint; extractPaginationHint({cursor:'c'}) -> null; extractPaginationHint({nextCursor:null}) -> null
    - Existing offset tests still return the same offsetField/nextOffset values.
    - applyPaginationArg({request:{graph_key}}, 'cursor', 'abc') -> {request:{graph_key, cursor:'abc'}}
    - Runner: page 0 returns nextCursor 'c1', page 1 returns nextCursor null -> 2 items, second call args contain cursor 'c1', completeness 'complete'
    - Runner: server echoes the same cursor every page -> exactly 2 tool calls, not 20
  </behavior>
  <action>
Edit `src/services/ai/mcpEvidence.ts`:

1. `PaginationHint` (~line 293): keep `offsetField: string` (the request field to advance for either style), `limitField?: string`, `total?: number`, `hasMore: boolean`; make `nextOffset` optional (`nextOffset?: number`) and add `nextCursor?: string | number`. Comment that exactly one of `nextOffset`/`nextCursor` is set.

2. Add a structural cursor reader next to `readContainer` inside `extractPaginationHint`:
   - Explicit continuation keys in priority order: `nextCursor`, `next_cursor`, `nextPageToken`, `next_page_token`.
   - Otherwise `cursor` or `page_token` only when the same object has `has_more === true` or `truncated === true` (a bare `cursor` is likely the echo of the current request).
   - Accept a value only when it is a non-empty string or a finite number (null/undefined/empty string mean end).
   - Request field to set: strip the `next` prefix — `nextCursor`/`next_cursor`/`cursor` -> `cursor`, `nextPageToken`/`next_page_token`/`page_token` -> `page_token` for the snake case; use a small lookup map, no semantics beyond the prefix strip.
   - Search the payload root first, then one level of plain-object children (covers `neighbors`, `evidence`, `data`, `result`). Do not recurse deeper.
   - Apply cursor detection only after the existing offset checks return null, so offset pagination behavior is unchanged.
   Update the docstring (~line 305) to match the real behavior.

3. `applyPaginationArg` (~line 343): widen the third parameter to `next: string | number`. Behavior unchanged (flat field, single plain-object wrapper, flat fallback).

Edit `src/services/ai/mcpRetrievalRunner.ts` page loop (~lines 361-401):
- Declare `let lastApplied: string | number | undefined;` next to `let pageArgs` (reset per call).
- Replace the final `pageArgs = applyPaginationArg(pageArgs, hint.offsetField, hint.nextOffset);` with: resolve `const next = hint.nextCursor ?? hint.nextOffset;` if `next === undefined` break; if `next === lastApplied` break (cursor/offset did not advance — prevents repeat-page loops); set `lastApplied = next`; then `pageArgs = applyPaginationArg(pageArgs, hint.offsetField, next);`.
- Keep the `MAX_PAGES_PER_CALL` check exactly where it is so both offset and cursor paths set `pagesCapped` and push the warning.

Then update tests:
- `tests/ai/mcpEvidence.test.ts`: fix the existing call at ~line 86 to `hint!.nextOffset!` (now optional). Add tests for top-level `nextCursor`, nested `next_cursor` + `has_more`, `cursor` + `has_more` vs bare `cursor` (null), and `nextCursor: null` (null); add `applyPaginationArg` with a string cursor inside the `request` wrapper.
- `tests/ai/mcpRetrievalRunner.test.ts`: add two tests. (a) cursor paging: `executeDynamicMcpTool` returns `{"nodes":[{"name":"A"}],"nextCursor":"c1"}` for args without `cursor` and `{"nodes":[{"name":"B"}],"nextCursor":null}` when args.cursor === 'c1'; planner proposes one call then done. Assert 2 items, second item args contain `cursor: 'c1'`, `pagesFetched === 2`, no pagination warning, `completeness === 'complete'`. (b) repeat guard: tool always returns `{"nodes":[{"name":"X"}],"cursor":"same","has_more":true}`; assert `executeDynamicMcpTool` called exactly twice and `pagesCapped === false`.
  </action>
  <verify>
    <automated>npx vitest run tests/ai/mcpEvidence.test.ts tests/ai/mcpRetrievalRunner.test.ts</automated>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>
    Cursor-only tools fetch every page up to `MAX_PAGES_PER_CALL` and report `pagesCapped`/warning when capped; a repeated cursor ends pagination after the first repeat; offset pagination behavior and all pre-existing tests are unchanged; `tsc --noEmit` is clean.
  </done>
</task>

</tasks>

<verification>
- `npx vitest run tests/ai/mcpEvidence.test.ts tests/ai/mcpRetrievalRunner.test.ts` — all green.
- `npx tsc --noEmit` — clean (required by the optional `nextOffset` change).
- Grep check: `MAX_RETRIEVAL_TURNS` no longer appears in `src/services/ai/mcpRetrievalRunner.ts`; `nextCursor` appears in both `mcpEvidence.ts` and the runner page loop.
- Only these files changed: `src/services/ai/mcpRetrievalRunner.ts`, `src/services/ai/mcpEvidence.ts`, `tests/ai/mcpRetrievalRunner.test.ts`, `tests/ai/mcpEvidence.test.ts`.
- No full-suite run, no new dependencies, no changes to abort/watchdog/duplicate/mutation-interception code paths.
</verification>

<success_criteria>
- A retrieval run with continuing novelty exceeds 4 turns and stops no later than 12.
- A repetitive planner (same evidence, new args) stops after 3 turns, not 12 and not forever.
- Turn-cap and watchdog stops are 'partial' with a warning; planner-done stops stay 'complete'.
- Cursor-paginated tool results produce page 2+ items with the cursor forwarded into flat or wrapped args; repeated cursors terminate.
- Two atomic commits: (1) novelty termination, (2) cursor pagination.
</success_criteria>

<output>
Create `.planning/quick/261027-fzh-make-mcp-retrieval-loop-run-until-eviden/261027-fzh-SUMMARY.md` when done.
</output>
