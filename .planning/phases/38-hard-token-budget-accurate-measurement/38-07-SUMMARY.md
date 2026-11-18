---
phase: 38-hard-token-budget-accurate-measurement
plan: 07
subsystem: ai
tags: [token-budget, ai-office, usage-split, estimator, ledger, reconcile]

# Dependency graph
requires:
  - phase: 38-hard-token-budget-accurate-measurement
    plan: 01
    provides: ChatTokenUsage.cacheReadTokens/cacheCreationTokens, AiTeamAssignment.inputTokens/outputTokens/usageEstimated
  - phase: 38-hard-token-budget-accurate-measurement
    plan: 03
    provides: incrementMemberUsage (atomic delta sink)
  - phase: 38-hard-token-budget-accurate-measurement
    plan: 05
    provides: splitUsage (input/output retained, cache charged as input)
provides:
  - AiOrchestratorLoopOptions.onUsage typed as (usage: ChatTokenUsage) => void
  - mapUsage in nineRouterClient (cached_tokens / cache_read / cache_creation mapped)
  - src/services/ai/office/tokenEstimate.ts (estimateTokens, getEncoderKind, resetTokenEstimatorForTests, setEncoderLoaderForTests)
  - usageAccounting + beginRequestAccounting + flushAccounting + reconcileUsage in the coordinator
  - payloadText + provisionalInputTokens (pre-call measurement, warning only)
  - TeamRunSnapshot.memberUsage (MemberUsageSnapshot[])
  - per-attempt inputTokens/outputTokens/usageEstimated rows
affects: [38-08, 38-09, 38-10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One accounting record per agent per request; memory-only during the turn, flushed once at the terminal seam"
    - "Flushed-key guard set BEFORE the increment awaits — the duplicate-charge guard for a stop/settle race"
    - "Ledger writes serialized on one promise chain so two attempts settling in one tick both land"
    - "Estimation is a warning input, never a decision: an estimated charge never closes the legacy gate"
    - "Two deliberately widened string specifiers + @vite-ignore so an absent tokenizer reaches the runtime catch"

key-files:
  created:
    - src/services/ai/office/tokenEstimate.ts
    - tests/services/ai/office/tokenEstimate.test.ts
  modified:
    - src/services/ai/aiOrchestratorLoop.ts
    - src/services/ai/nineRouterClient.ts
    - src/components/ai/runtime/chatTurnRuntime.ts
    - src/services/ai/office/teamRunCoordinator.ts
    - src/components/ai/office/TeamWorkspace.tsx
    - tests/helpers/teamRunSnapshot.ts
    - tests/services/ai/office/teamRunCoordinator.test.ts

key-decisions:
  - "The provisional pre-call estimate lives on the accounting record only — never in the live charge maps, so a guess cannot park a turn the reported number would not have parked"
  - "An estimated charge updates the live numbers but skips gate evaluation (D-07: an estimate is never a decision); plan 08 deletes the gate"
  - "flushAccounting returns the flushed triple and the accounting record keeps its numbers after the flush — the flushed-key guard, not a zeroed record, is the duplicate-charge defence"
  - "The employee turn's finally also flushes and reconciles, covering mention-started turns that have no attempt row"
  - "A failed estimate degrades to source='provider' with zeros so the flush still completes; a failed ledger write is swallowed on the chain"

requirements-completed: [AIO-BUDGET-02, AIO-BUDGET-03]

# Metrics
duration: 22min
completed: 2026-11-13
---

# Phase 38 Plan 07: Real Usage Through the Runtime into Split Ledger Columns

**Provider usage now reaches the member and attempt rows as two separate numbers, every request has an accounting lifecycle from dispatch, and one awaitable terminal seam estimates, charges and reconciles — so a callback-less or aborted turn is never free**

## Performance

- **Duration:** 22 min
- **Started:** 2026-11-13T21:50:00Z
- **Completed:** 2026-11-13T22:12:00Z
- **Tasks:** 3
- **Files modified:** 9 (2 created)

## Accomplishments

- `AiOrchestratorLoopOptions.onUsage` is `(usage: ChatTokenUsage) => void`; the inline object literal is gone, so `cacheReadTokens`/`cacheCreationTokens` compile at every call site instead of being cast in.
- `nineRouterClient` gained one `mapUsage` helper used by all four mapping sites. It reads `prompt_tokens_details.cached_tokens ?? cache_read_input_tokens` (two names for one quantity) and `cache_creation_input_tokens`, emitting each only when it is a number so an absent provider field stays absent.
- `chatTurnRuntime`'s accumulator sums both cache fields across rounds — keeping only the last round's value would under-charge a multi-round turn.
- The coordinator's usage path is rewritten: `beginRequestAccounting` runs at dispatch in `startEmployeeTurn` and `startLeadTurn`, `handleUsage` is memory-only (no `addUsedTokens`, no `normalizeUsageTotal`), and `flushAccounting` is the single ledger writer. `finalizeAttempt` awaits it as its first statement, before its `rw` transaction, so the attempt patch can never snapshot a pre-estimation value.
- `tokenEstimate.ts` ships with `estimateTokens`, `getEncoderKind`, `resetTokenEstimatorForTests` and a `setEncoderLoaderForTests` seam. The chars÷4 fallback is the live path until plan 10 installs `js-tiktoken`; the two specifiers are widened `string` variables loaded through `import(/* @vite-ignore */ …)` so an absent package reaches the runtime catch rather than failing `tsc` or Vitest transformation.
- `payloadText(request)` measures system messages + history + user text + serialized tool schemas, and is called from both dispatch sites and from the flush — the measured text and the charged text cannot drift.
- `provisionalInputTokens` is measured before `registry.start`, exposed on `getState().memberUsage`, and never reaches `incrementMemberUsage`.
- A pending request is estimated exactly once at the seam (prompt from `payloadText`, output from `streamingText`), marked `estimated`, and the attempt row carries `inputTokens`/`outputTokens` plus `usageEstimated` when true.
- `finalizeAttempt` reconciles from `listTeamMembers` after the commit and before `notifyAIChatSync`; `startLeadTurn` flushes and reconciles before its `finally`'s `notify()`.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end "one turn's usage lands as two numbers on the member row"** — `b8753c1f` (feat)
2. **Task 2: Estimator module + callback-less and aborted requests charged before the terminal patch** — `8bd26c62` (feat)
3. **Task 3: Per-attempt usage rows across retries + reconcile live counters at every terminal** — `c7d36a1d` (test)

**Plan metadata:** committed with this SUMMARY (docs)

## Files Created/Modified

- `src/services/ai/office/tokenEstimate.ts` — new; `estimateTokens`, `getEncoderKind`, `resetTokenEstimatorForTests`, `setEncoderLoaderForTests`; chars÷4 fallback with a `ponytail:` comment naming plan 10's upgrade
- `src/services/ai/aiOrchestratorLoop.ts` — `onUsage` typed on `ChatTokenUsage`
- `src/services/ai/nineRouterClient.ts` — `mapUsage` helper; five call sites (four mappings + the export)
- `src/components/ai/runtime/chatTurnRuntime.ts` — accumulator sums `cacheReadTokens`/`cacheCreationTokens`
- `src/services/ai/office/teamRunCoordinator.ts` — `MemberUsageSnapshot`, `UsageAccountingRecord`, `usageAccounting`, `flushedAccounting`, `usageWriteChain`, `agentByAssignmentId`, `memberUsedInput`/`memberUsedOutput`, `applyLiveUsage`, `beginRequestAccounting`, `flushAccounting`, `reconcileUsage`, `payloadText`, `measureProvisionalInput`; `finalizeAttempt` patch + reconcile; `startLeadTurn` flush/reconcile; `getState().memberUsage`
- `src/components/ai/office/TeamWorkspace.tsx` — `EMPTY_SNAPSHOT.memberUsage`
- `tests/helpers/teamRunSnapshot.ts` — `memberUsage: []` in the shared stub
- `tests/services/ai/office/tokenEstimate.test.ts` — new; 6 tests
- `tests/services/ai/office/teamRunCoordinator.test.ts` — 16 new tests in a "Phase 38 plan 07" describe; `afterEach` resets the estimator

## Decisions Made

- **The provisional estimate never enters the live charge maps.** It lives on the accounting record, so `getState().memberUsage[].provisionalInputTokens` carries it for plan 08's warning and plan 09's `~`, while the legacy gate keeps reading provider numbers only. Putting a guess into `memberUsed` would let an estimate park a turn that the reported number would not have parked — the opposite of D-07.
- **An estimated charge updates the live counters but skips gate evaluation.** D-07 says an estimate is never consulted for a decision, and closing the legacy gate is a decision. The numbers still move so plan 09 has something to render; plan 08 deletes the gate entirely. Without this, adding the estimator broke 83 existing tests: a chars÷4 estimate of a real prompt crosses a 600-token budget, so every parked-agent test parked one round earlier than the script intended.
- **The accounting record keeps its numbers after the flush.** Zeroing it made `getState().memberUsage` report `0/0` post-settle, which contradicts the D-22 reconcile story and the snapshot's purpose. The duplicate-charge defence is the `flushedAccounting` key set before the increment awaits, not a zeroed record. The next dispatch overwrites the whole record.
- **The employee turn's `finally` also flushes and reconciles.** A mention-started turn has no attempt row, so `finalizeAttempt` never runs for it. The flushed-key guard makes the extra call a no-op for attempt turns.
- **A failed estimate degrades to `source='provider'` with zeros** rather than propagating: the flush must complete and the turn must end. A failed ledger write is swallowed inside the promise chain for the same reason.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Estimated charges closed the legacy budget gate and broke 83 existing tests**
- **Found during:** Task 2 (first full-suite run after wiring the estimator)
- **Issue:** `applyLiveUsage` evaluated the bucket/gate crossing for every charge, including the terminal estimate. A chars÷4 estimate of a real team prompt exceeds the 600-token test budget, so the gate closed before the script's own `beforeToolRound` and every parked-agent test timed out at `waitFor`.
- **Fix:** `applyLiveUsage` gained `evaluateGates` (default true); the estimated branch passes `false`. Counters still move; the gate is not consulted. This matches D-07 ("ước lượng … không dùng để chặn").
- **Files modified:** `src/services/ai/office/teamRunCoordinator.ts`
- **Commit:** `8bd26c62`

**2. [Rule 1 - Bug] Zeroing the accounting record after a flush hid the charged numbers**
- **Found during:** Task 3 (reconcile tests)
- **Issue:** `flushAccounting` zeroed `acc.inputTokens`/`acc.outputTokens` after awaiting the write, so `getState().memberUsage` reported `0/0` once a turn settled — the D-22 "live converges to the ledger" assertion could not hold.
- **Fix:** keep the numbers on the record; the flushed-key guard is the duplicate-charge defence and the next dispatch replaces the record wholesale.
- **Files modified:** `src/services/ai/office/teamRunCoordinator.ts`
- **Commit:** `c7d36a1d`

**3. [Rule 1 - Bug] A late `onUsage` for an already-flushed key could charge twice**
- **Found during:** Task 2 (stale-report review)
- **Issue:** `handleUsage` guarded only on `acc.key !== accountingKey`. A provider chunk arriving after the terminal flush would have re-added its delta to a record whose numbers had already been written.
- **Fix:** `handleUsage` also returns when `flushedAccounting.has(acc.key)`.
- **Files modified:** `src/services/ai/office/teamRunCoordinator.ts`
- **Commit:** `8bd26c62`

## Issues Encountered

- The full coordinator suite takes ~8 s when green but 375 s when many tests time out at the 5 s `waitFor` ceiling; two background runs were killed before the gate fix landed. Scoped runs were used to isolate the failure (`-t "parks on the plan card"`) rather than re-running the whole file.
- `npx vitest run … --reporter=basic` fails in this project's Vitest 5 (`Failed to load custom Reporter from basic`). Plain `npx vitest run <path>` was used instead.

Scoped runs: `tests/services/ai/office/teamRunCoordinator.test.ts` 143/143, `tests/services/ai/office/tokenEstimate.test.ts` 6/6, `tests/services/ai/office/aiTeamRepo.test.ts` 60/60. `npx tsc --noEmit -p tsconfig.json` prints no `error TS` line. `bash .planning/scripts/verify-team-chat-architecture.sh` exits 0 (the dead-module check passes — `tokenEstimate` has a production importer).

## User Setup Required

None - no external service configuration required. `js-tiktoken` is NOT installed by this plan (`grep -n "js-tiktoken" package.json` returns no match); its install is gated behind plan 10's blocking checkpoint.

## Threat Surface Notes

- T-38-14 (tampering, `splitUsage` inputs): mitigated — `splitUsage` `?? 0`s every component and the coordinator only applies non-negative deltas (`Math.max(0, …)`), so a negative or non-numeric provider field cannot decrease a counter.
- T-38-15 (DoS, estimation on the hot path): mitigated — estimation runs at dispatch and at the terminal seam only, never per delta; a throw is swallowed and the turn proceeds (proved by the "encoder throws" test).
- T-38-16 (information disclosure, estimation source text): mitigated — `estimateTokens` returns a count and the text is discarded; nothing writes prompt text to a row or a notification.
- T-38-28 (repudiation, stale report): mitigated — the record carries the turn key, a mismatched key is dropped, and the flushed-key guard makes a second terminal flush a no-op. Both are pinned by tests.
- T-38-SC: no package installed in this plan.

## Known Stubs

- `tokenEstimate.ts` uses the chars÷4 heuristic until plan 10 installs `js-tiktoken`. This is the documented interim state (D-07, plan 10's blocking checkpoint), not an unmarked stub: `getEncoderKind()` reports `'chars-div-4'`, every value it produces is marked estimated, and a `ponytail:` comment names the ceiling and the upgrade path.

## Next Phase Readiness

- Plan 08 can delete the legacy `BudgetGate` and build the two-level warning from `getState().memberUsage` (`inputTokens` + `provisionalInputTokens` while a request is pending) plus `isAtThreshold`.
- Plan 09 can render the `~` marker from `memberUsage[].estimated` and the split columns now present on member and attempt rows.
- Plan 10 switches the two widened specifiers in `tokenEstimate.ts` to literal lazy subpaths after its install checkpoint; the public shape does not change.

## Self-Check: PASSED

- `src/services/ai/office/tokenEstimate.ts`, `tests/services/ai/office/tokenEstimate.test.ts`, `src/services/ai/office/teamRunCoordinator.ts`, `src/services/ai/nineRouterClient.ts` all present.
- Commits `b8753c1f`, `8bd26c62`, `c7d36a1d` all exist in `git log`.
