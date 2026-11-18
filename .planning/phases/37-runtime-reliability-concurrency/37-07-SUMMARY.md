---
phase: 37-runtime-reliability-concurrency
plan: 07
subsystem: runtime
tags: [ai-office, retry, ledger, append-only, supersede, synthesis, d-12, d-13, d-14, d-23]
dependency-graph:
  requires:
    - 37-01 (createAssignment with retryOfAssignmentId/attemptNo, getAssignment, listBatchAssignments, getBatch)
    - 37-03 (finalizeAttempt, STOPPED_REPORT_COPY, reportMessageId for every terminal attempt)
    - 37-04 (scheduler acquire/release shape, dispatchAssignment try/finally, batch result fields)
    - 37-06 (BUSY_PHASES-driven outbox that queues against a retry's batch-running phase)
  provides:
    - TeamRunCoordinator.retryAssignment(assignmentId)
    - teamTranscriptRepo.supersedeTeamMessage(messageId, supersededByMessageId, db)
    - Batch result tail entry { kind: 'unfinished', agents: [...] }
    - buildLeadTurnRequest({ batchResults }) for the re-synthesis pass
    - Lead prompt rule 6 (incomplete-parts mandate)
  affects:
    - 37-08 (retry affordance calls retryAssignment; bubble reads runStatus/incomplete)
tech-stack:
  added: []
  patterns:
    - "retry = append a new attempt row; the source row is read-only (D-23)"
    - "one scheduler slot owned by one try/finally, identical to the batch dispatch wrapper"
    - "supersession is a message-level link with exactly one writer; nothing is deleted"
    - "re-synthesis resolves report TEXT through reportMessageId, never from an in-memory cache"
    - "the batch result stays an array; honesty is a final kind:'unfinished' entry, not a wrapper"
key-files:
  created: []
  modified:
    - src/services/ai/office/teamRunCoordinator.ts
    - src/services/ai/office/teamPrompts.ts
    - src/db/repositories/teamTranscriptRepo.ts
    - tests/services/ai/office/teamRunCoordinator.test.ts
    - tests/services/ai/office/teamPrompts.test.ts
decisions:
  - "the double-click guard claims the assignment id before any await, and is checked before the busy-phase guard so a repeat click is ignored rather than refused"
  - "a retry reuses the source row's instructionMessageId, so one instruction pairs with every attempt of the chain"
  - "the re-synthesis turn is a lead turn carrying batchResults; the previous synthesis id is captured from saveMessage, not guessed from the transcript"
  - "collectBatchReports takes the highest attemptNo per agent and emits an explicit unfinished entry when that attempt has no current report"
  - "the batch result keeps its array shape and gains a final kind:'unfinished' entry, because a wrapper object would break every caller and the tool contract"
actuals:
  tokens: 26000
  tasks: 2
  commits: 2
  plan_head_before: 86de027ccacb27ef96df78388a896459bf607194
  plan_head_after: 06ff92d726a5e24624713c34f0cd779afcd4680f
requirements-completed: [AIO-LEAD-05, AIO-RUNTIME-01]
coverage:
  - id: D1
    description: "A retry of a stopped/errored assignment appends attempt 2 with retryOfAssignmentId; the source row is never mutated"
    requirement: AIO-LEAD-05
    verification:
      - kind: unit
        ref: "tests/services/ai/office/teamRunCoordinator.test.ts#re-runs only the failed agent, appends attempt 2, and re-synthesizes the full batch"
        status: pass
    human_judgment: false
  - id: D2
    description: "The retry runs the STORED task and does not reopen the plan card; siblings are not re-run"
    requirement: AIO-LEAD-05
    verification:
      - kind: unit
        ref: "tests/services/ai/office/teamRunCoordinator.test.ts#re-runs only the failed agent, appends attempt 2, and re-synthesizes the full batch"
        status: pass
    human_judgment: false
  - id: D3
    description: "The previous report is marked superseded by the new one, with both fields written, by exactly one writer"
    requirement: AIO-LEAD-05
    verification:
      - kind: unit
        ref: "tests/services/ai/office/teamRunCoordinator.test.ts#re-runs only the failed agent, appends attempt 2, and re-synthesizes the full batch"
        status: pass
    human_judgment: false
  - id: D4
    description: "A retry holds exactly one scheduler slot and refuses a done assignment; a double click is ignored"
    requirement: AIO-RUNTIME-01
    verification:
      - kind: unit
        ref: "tests/services/ai/office/teamRunCoordinator.test.ts#holds exactly one scheduler slot during the retry and refuses a done assignment"
        status: pass
    human_judgment: false
  - id: D5
    description: "A retry while the phase is busy is refused; a stopped retry leaves exactly one report row"
    requirement: AIO-RUNTIME-01
    verification:
      - kind: unit
        ref: "tests/services/ai/office/teamRunCoordinator.test.ts#refuses a retry while the phase is busy"
        status: pass
      - kind: unit
        ref: "tests/services/ai/office/teamRunCoordinator.test.ts#leaves exactly one report row when the retry is stopped before it settles"
        status: pass
    human_judgment: false
  - id: D6
    description: "Re-synthesis carries the report TEXT of agents that finished on attempt 1, resolved through reportMessageId"
    requirement: AIO-LEAD-05
    verification:
      - kind: unit
        ref: "tests/services/ai/office/teamRunCoordinator.test.ts#re-runs only the failed agent, appends attempt 2, and re-synthesizes the full batch"
        status: pass
    human_judgment: false
  - id: D7
    description: "A batch with an unfinished agent appends a final kind:'unfinished' entry; a fully successful batch appends none"
    requirement: AIO-LEAD-05
    verification:
      - kind: unit
        ref: "tests/services/ai/office/teamRunCoordinator.test.ts#resolves the batch when one of three agents throws, and never stays in batch-running"
        status: pass
      - kind: unit
        ref: "tests/services/ai/office/teamRunCoordinator.test.ts#adds no unfinished entry when every assignment completed (D-14)"
        status: pass
    human_judgment: false
  - id: D8
    description: "The lead prompt carries the literal kind:'unfinished' rule and keeps the untrusted wrapper intact"
    requirement: AIO-LEAD-05
    verification:
      - kind: unit
        ref: "tests/services/ai/office/teamPrompts.test.ts#states the incomplete-parts rule so a partial batch cannot read as complete (D-14)"
        status: pass
      - kind: unit
        ref: "tests/services/ai/office/teamPrompts.test.ts#keeps the untrusted wrapper intact when a re-synthesis carries batch results"
        status: pass
    human_judgment: false
duration: 42 min
completed: 2026-11-12
status: complete
---

# Phase 37 Plan 07: Retry path and honest partial batches Summary

**A stopped or errored agent can be re-run alone as a new attempt whose old report is linked as superseded, and the lead is re-invoked once with the whole batch's report text plus a structural list of what did not finish**

## Performance

- **Duration:** 42 min
- **Started:** 2026-11-12T04:15:00Z (plan ledger base `86de027c`)
- **Completed:** 2026-11-12T04:57:00Z
- **Tasks:** 2 executed (plan listed 3 units of work; tasks 1+2 each absorbed their own test work)
- **Files modified:** 5 (0 created)

## Accomplishments

- `retryAssignment(assignmentId)` appends a NEW `aiTeamAssignments` row: `createAssignment` allocates `attemptNo` and `retryOfAssignmentId` points at the source. `task`, `agentName`, `skillId`, `skillVersion` and `model` are copied from the stored row, so the retry replays exactly what the attempt ran with (D-25) and never reopens the plan card (D-13).
- The retry owns exactly ONE scheduler slot in the same shape `dispatchAssignment` uses: `try` opens before `scheduler.acquire`, `finally` deletes `scheduledHandles` and releases. The `catch` calls `finalizeAttempt(id, 'queued', 'stopped', 'user-abort', STOPPED_REPORT_COPY)`, so an aborted parked retry still leaves exactly one report row.
- `supersedeTeamMessage(messageId, supersededByMessageId, db)` is the only writer of `supersededByMessageId`/`supersededAt`. It patches the row (no delete), is idempotent, and returns `null` for a missing row or a self-link. 37-03's `finalizeAttempt` still never touches those two fields.
- The source report id is asserted, not skipped: a terminal attempt always carries `reportMessageId`, and an absent one throws a named error rather than silently producing an unsuperseded transcript.
- `collectBatchReports(batchId)` takes the highest `attemptNo` per agent from `listBatchAssignments`, resolves `reportMessageId` through `db.chatMessages.get()`, skips a report that is itself superseded, and emits an explicit unfinished entry when a latest attempt has no current report. The re-synthesis call is `startLeadTurn(SYNTHESIS_INSTRUCTION, reports)`; the previous synthesis id is captured from `saveMessage` (a new `lastSynthesisMessageId` slot) and superseded by the new one.
- `delegate_batch`'s result keeps its ARRAY shape and appends `{ kind: 'unfinished', agents: [{ agentId, agentName, status, stopReason }] }` when at least one assignment is stopped/errored. A fully successful batch appends nothing, so existing assertions on `length` and per-entry `status` still hold.
- `buildLeadTurnRequest` accepts `batchResults`, renders them through `wrapUntrusted('KẾT QUẢ CỦA LÔ', …)`, and `[QUY TẮC ĐIỀU HÀNH NHÓM]` gained rule 6 mandating that unfinished work be named.

## Task Commits

1. **Task 1: retry one assignment and re-synthesize the batch** — `eb370008` (feat)
2. **Task 2: name unfinished work in the batch result and the lead prompt** — `06ff92d7` (feat)

## Files Created/Modified

- `src/services/ai/office/teamRunCoordinator.ts` — `retryAssignment`, `collectBatchReports`, `unfinishedReportCopy`, `SYNTHESIS_INSTRUCTION`, `retryingAgents`/`retryingAssignments` guards, `lastSynthesisMessageId`, `startLeadTurn(text, batchResults?)`, `AttemptRef.instructionMessageId` optional, `kind: 'unfinished'` result tail, interface entry.
- `src/db/repositories/teamTranscriptRepo.ts` — `supersedeTeamMessage`.
- `src/services/ai/office/teamPrompts.ts` — lead rule 6; `batchResults` on `BuildLeadTurnRequestInput` and rendered in the system prompt.
- `tests/services/ai/office/teamRunCoordinator.test.ts` — 73 → 78 `it(` blocks (4 retry tests + 1 fully-successful-batch test), 3 pre-existing result-length assertions updated for the new tail entry.
- `tests/services/ai/office/teamPrompts.test.ts` — 11 → 13 `it(` blocks.

## Decisions Made

- **The double-click guard is checked before the busy-phase guard.** `retryAssignment` claims the assignment id synchronously (before any await) and returns early for a repeat call. Checking it after `BUSY_PHASES.has(phase)` turned a legitimate second click into a "team is running" refusal, because the first retry sets `batch-running` itself.
- **A retry reuses the source row's `instructionMessageId`.** The instruction message is already in the transcript and belongs to the whole chain (D-22 links), so a second instruction row would read as a second delegation.
- **The batch result stays an array.** D-14's honesty requirement is satisfied by a final entry carrying `kind: 'unfinished'`; changing the result to a wrapper object would have broken the `delegate_batch` contract and every existing consumer/test for no behavioural gain.
- **`collectBatchReports` resolves text per agent, not per attempt.** The lead needs each agent's CURRENT result; a superseded report would re-tell a story the retry already replaced.
- **The batch's `phaseAtEnd` is rewritten to `ready` after a retry.** The batch row closed when the original run ended (`lead-synthesizing`); the retry is its new tail, so leaving the stale phase would misreport the batch as still synthesizing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] A second click on the same assignment was refused as a busy phase**
- **Found during:** Task 1 (scheduler-slot test)
- **Issue:** The in-flight guard sat after `BUSY_PHASES.has(phase)`, and the first retry sets `batch-running` before awaiting `acquire`, so the second click was rejected with "Nhóm đang chạy" instead of being ignored. T-37-22 requires the click be a no-op.
- **Fix:** The assignment id is claimed in `retryingAssignments` before any await and checked before the busy guard. The busy guard still refuses a retry that targets a different assignment during a live turn.
- **Files modified:** `src/services/ai/office/teamRunCoordinator.ts`
- **Verification:** `holds exactly one scheduler slot during the retry and refuses a done assignment` asserts the repeat call resolves and exactly two B rows exist.
- **Committed in:** `eb370008`

**2. [Rule 1 - Bug] Three pre-existing result assertions encoded the pre-D-14 shape**
- **Found during:** Task 2
- **Issue:** `resolves the batch when one of three agents throws`, `abortAll settles every queued assignment`, and `dispose mid-batch rejects the parked acquire` asserted the raw array length, which now includes the `kind: 'unfinished'` tail for a batch with unfinished agents.
- **Fix:** Each filters `kind !== 'unfinished'` for its per-assignment assertions and then asserts the tail entry explicitly — which is the D-14 contract, not a weakened check.
- **Files modified:** `tests/services/ai/office/teamRunCoordinator.test.ts`
- **Verification:** both edited suites are green (90 passed).
- **Committed in:** `06ff92d7`

---
**Total deviations:** 2 auto-fixed (2 bug)
**Impact on plan:** No architectural change. Both were contract-shape corrections: one guard-order bug in the new retry path, one set of tests still encoding the pre-D-14 result shape.

## Issues Encountered

- `tests/services/ai/office/teamRunCoordinator.test.ts > pauses one agent at 80% and leaves the sibling running` flakes intermittently (roughly 3 of 4 runs fail with `expected undefined to be 'running'`). Verified on the plan's base commit `86de027c` in a detached worktree with the same source: it fails there too (2 of 3 runs). Pre-existing and out of scope per the fix-attempt limit; recorded in `.planning/WINDOWS.md`.

## Known Stubs

None. `retryAssignment` has a consumer in 37-08 (the bubble action); `supersedeTeamMessage` is only called by the retry path by design; `batchResults` on the lead prompt has one producer (`collectBatchReports`).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 37-08 can call `coordinator.retryAssignment(assignment.reportMessageId ? assignment.id : assignment.id)` — it takes the ASSIGNMENT id (the ledger row), not the report message id — and it resolves only after the re-synthesis pass.
- The bubble's "Chưa hoàn tất" label should come from the report row's `runStatus`/`incomplete`, which this plan guarantees for every terminal attempt including one stopped before `start()`.
- A retry requires `phase` to be outside `BUSY_PHASES`; the UI should disable the action while `getState().phase` is live or parked.

---
*Phase: 37-runtime-reliability-concurrency*
*Completed: 2026-11-12*

## Self-Check: PASSED

- All five files exist and are tracked.
- Both commits (`eb370008`, `06ff92d7`) are ancestors of HEAD.
- `npx tsc --noEmit` clean; the two plan-owned suites report 90 passed.
