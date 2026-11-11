---
phase: 37-runtime-reliability-concurrency
plan: 03
subsystem: runtime
tags: [ai-office, ledger, dexie, transaction, transcript, lifecycle, finally, concurrency]
dependency-graph:
  requires:
    - 37-01 (aiTeamRunRepo: openBatch/closeBatch/createAssignment/transitionAssignment, ledger types)
    - 37-02 (dispose, setPhase, abortAllAssignmentControllers, openBatchId slot)
  provides:
    - ChatMessage link fields (batchId, assignmentId, attemptNo, runStatus, stopReason, incomplete, supersededByMessageId, supersededAt)
    - teamTranscriptRepo.insertReportMessage
    - teamTranscriptRepo.notifyAIChatSync re-export (single import site)
    - TeamRunCoordinator.finalizeAttempt (exported seam for 37-04)
    - BUSY_PHASES
    - "TeamRunCoordinator.send -> 'started' | 'busy' | 'blocked'"
    - assignment instructionMessageId backfill at start time
  affects:
    - 37-04 (stopAgent/abortAll call finalizeAttempt; scheduler reads the queued rows)
    - 37-06 (dispatch reads the three-way send() result)
    - 37-07 (supersedeTeamMessage is the only writer of supersededByMessageId)
    - 37-08 (retry affordance reads the report row's runStatus/incomplete)
tech-stack:
  added: []
  patterns:
    - "one rw transaction over the atomic pair (chatMessages + aiTeamAssignments) composing insert-or-patch with the guarded transition, so Dexie's serialization closes the stop/settle race"
    - "from-guard checked FIRST inside the transaction; a losing caller returns the stored terminal row and never inserts"
    - "explicit-input, transaction-free repo insert (insertReportMessage) that joins the caller's rw scope; the caller owns the single post-commit notify"
    - "per-agent promise settled with .catch on push, because the batch only awaits allSettled"
key-files:
  created: []
  modified:
    - src/types/models.ts
    - src/db/repositories/teamTranscriptRepo.ts
    - src/services/ai/office/teamRunCoordinator.ts
    - tests/services/ai/office/teamRunCoordinator.test.ts
    - tests/services/ai/office/teamTranscriptRepo.test.ts
decisions:
  - "ChatMessage carries the eight link fields; the ledger row stays the source of truth (D-22)"
  - "finalizeAttempt is exported on the coordinator interface so 37-04's stop/abort paths and the concurrency test both use the one writer"
  - "a user stop is remembered in a userStopped Set, because settleAgent's UI state cannot prove who ended the turn and the ledger must not record done for a turn the user stopped"
  - "the userStopped marker is cleared only when that agent starts its next turn, so the racing stop and settle paths both map to stopped/user-abort"
  - "diagnosticDetail is boundedDiagnostic(Error(code)) on the outcome path and the raw bounded message on the catch path; neither reaches content"
  - "send() gates on BUSY_PHASES (live + both parks), never on LIVE_PHASES, which stays the UI derivation"
actuals:
  tokens: 18000
  tasks: 3
  commits: 5
  plan_head_before: f3af6e9cb8ee9ec6bf204e9aca09e798cde49a55
  plan_head_after: 619788c5f22988b8e45b2e2e4b03725c82ea5a4b
requirements-completed: [AIO-RUNTIME-01, AIO-RUNTIME-03]
coverage:
  - id: D1
    description: "One delegation writes one batch row, one attempt row per assignment, and a report message linked both ways"
    requirement: AIO-RUNTIME-01
    verification:
      - kind: unit
        ref: "tests/services/ai/office/teamRunCoordinator.test.ts#writes one batch row, one assignment per attempt, and links the report both ways"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every terminal attempt has exactly one report row carrying the terminal triple, written in the same transaction as the transition"
    requirement: AIO-RUNTIME-01
    verification:
      - kind: unit
        ref: "tests/services/ai/office/teamRunCoordinator.test.ts#links exactly one report row per terminal attempt in a mixed batch"
        status: pass
      - kind: unit
        ref: "tests/services/ai/office/teamRunCoordinator.test.ts#leaves a stopped attempt with one sanitized report row the transcript can read"
        status: pass
      - kind: unit
        ref: "tests/services/ai/office/teamRunCoordinator.test.ts#gives an errored attempt a report row with the sanitized string and no provider text"
        status: pass
    human_judgment: false
  - id: D3
    description: "Two concurrent finalizeAttempt calls from queued produce one report row and one terminal assignment row"
    requirement: AIO-RUNTIME-01
    verification:
      - kind: unit
        ref: "tests/services/ai/office/teamRunCoordinator.test.ts#writes exactly one report row when two finalizeAttempt calls race from queued"
        status: pass
    human_judgment: false
  - id: D4
    description: "insertReportMessage writes every required ChatMessage field from its input alone and never notifies"
    requirement: AIO-RUNTIME-01
    verification:
      - kind: unit
        ref: "tests/services/ai/office/teamTranscriptRepo.test.ts#writes every required ChatMessage field from its input alone and never notifies"
        status: pass
    human_judgment: false
  - id: D5
    description: "A throwing agent, and a throwing pre-start read, still resolve the batch and never leave batch-running"
    requirement: AIO-RUNTIME-01
    verification:
      - kind: unit
        ref: "tests/services/ai/office/teamRunCoordinator.test.ts#resolves the batch when one of three agents throws, and never stays in batch-running"
        status: pass
      - kind: unit
        ref: "tests/services/ai/office/teamRunCoordinator.test.ts#still resolves the batch when a pre-start read throws for one agent"
        status: pass
    human_judgment: false
  - id: D6
    description: "getActiveTurns() drains after completion, plan rejection and abort; the team turn is present while parked"
    requirement: AIO-RUNTIME-03
    verification:
      - kind: unit
        ref: "tests/services/ai/office/teamRunCoordinator.test.ts#keeps the team turn registered while the lead is parked, then drains it"
        status: pass
      - kind: unit
        ref: "tests/services/ai/office/teamRunCoordinator.test.ts#drains after a rejected plan"
        status: pass
      - kind: unit
        ref: "tests/services/ai/office/teamRunCoordinator.test.ts#drains after a completed batch and after abortAll mid-run"
        status: pass
    human_judgment: false
  - id: D7
    description: "send() reports started / busy / blocked distinctly so a caller requeues on busy and never on blocked"
    requirement: AIO-RUNTIME-03
    verification:
      - kind: unit
        ref: "tests/services/ai/office/teamRunCoordinator.test.ts#resolves send() as started, busy or blocked and never as a dropped submit"
        status: pass
    human_judgment: false
  - id: D8
    description: "No assignment runStatus is written outside transitionAssignment"
    requirement: AIO-RUNTIME-01
    verification:
      - kind: unit
        ref: "tests/services/ai/office/teamRunCoordinator.test.ts#never writes an assignment status outside transitionAssignment"
        status: pass
    human_judgment: false
duration: 68 min
completed: 2026-11-11
status: complete
---

# Phase 37 Plan 03: Ledger writes, transcript linking, and guaranteed termination Summary

**Every delegated attempt now has a batch row, an attempt row and one linked report message written in a single transaction with its status transition — and a throwing turn can no longer leave the run parked in `batch-running`**

## Performance

- **Duration:** 68 min
- **Started:** 2026-11-11T19:01:55Z (plan ledger base `f3af6e9c`)
- **Completed:** 2026-11-11T20:10:26Z
- **Tasks:** 3
- **Files modified:** 5 (0 created, 5 modified)

## Accomplishments

- `finalizeAttempt(assignmentId, from, to, stopReason, contentWhenMissing?, diagnosticDetail?)` is the single terminal writer: one `db.transaction('rw', [chatMessages, aiTeamAssignments])` reads the row, checks the `from` guard FIRST, then either inserts one sanitized report message (aborted/errored/cancelled-before-save) or patches exactly `runStatus`/`stopReason`/`incomplete` on the row the runtime already saved, and composes the attempt's one `transitionAssignment` in the same scope. Dexie serializes overlapping `rw` transactions, so two callers racing from `queued` produce one message and one terminal assignment row.
- `insertReportMessage(input, db)` in `teamTranscriptRepo.ts` — explicit input including `threadId` and `createdAt`, no transaction of its own, no notification. `finalizeAttempt` owns the single post-commit `notifyAIChatSync({ type: 'message_saved', threadId })`, using the same `threadId` the row carries.
- `runBatch` opens the batch after the decision resolves (snapshot = what the user saw), creates one `queued` attempt per assignable entry, links the instruction row, and closes the batch when the run ends. A rejected plan leaves a `planDecision: 'rejected'` batch row with `endedAt` and zero assignments.
- `startEmployeeTurn`/`startLeadTurn` restructured to `try/catch/finally`: deferred created first, pre-start reads inside the `try`, the `catch` finalizes `error`/`provider` with `boundedDiagnostic(err)` and settles the agent, and the `finally` deletes the deferred (Pitfall 7). The per-agent promise is pushed with a `catch`, because the batch only awaits `allSettled`.
- `send()` returns `'started' | 'busy' | 'blocked'` and gates on the new `BUSY_PHASES` (live phases plus both parks, D-21); the team turn is finished in a `finally` around the turn body, so `getActiveTurns()` drains after completion, rejection and abort.

## Task Commits

1. **Task 1: End-to-end ledger writes, report linking, terminal finalize** - `0ac7c757` (feat)
2. **Task 2: Termination guarantees on every throw path** - `f5dcf1fb` (fix)
3. **Task 2 follow-up: per-agent rejection can never become unhandled** - `619788c5` (fix)
4. **Task 3: Tests proving the team turn drains** - `9385f3a7` (test)
5. **Task 1 follow-up: report row reachable through the transcript reader** - `e0c54c9f` (test)

## Files Created/Modified

- `src/types/models.ts` — `ChatMessage` gains the eight D-22 link fields (all optional, `| undefined`).
- `src/db/repositories/teamTranscriptRepo.ts` — link fields on `SaveTeamMessageInput`, `linkFields()` spread helper, `insertReportMessage`, `notifyAIChatSync` re-export.
- `src/services/ai/office/teamRunCoordinator.ts` — `activeAssignmentByAgent`, `userStopped`, `finalizeAttempt`, `boundedDiagnostic`, `OUTCOME_RUN_STATUS`/`OUTCOME_STOP_REASON`, `BUSY_PHASES`, `STOPPED_REPORT_COPY`, `saveMessage` override, batch open/close, attempt creation, `instructionMessageId` backfill, try/catch/finally turn bodies, three-way `send()`.
- `tests/services/ai/office/teamRunCoordinator.test.ts` — 50 → 64 `it(` blocks (14 added, two pre-existing assertions updated for the new contract).
- `tests/services/ai/office/teamTranscriptRepo.test.ts` — 15 → 17 `it(` blocks.

## Decisions Made

- **`finalizeAttempt` is exported on the coordinator interface.** 37-04's `stopAgent`/`abortAll` must call it, and the "exactly one report row under concurrency" invariant has to be testable without a provider. The plan's "coordinator-local" wording is honoured in implementation; only the type surface is public.
- **A user stop is tracked in a `userStopped` set.** `stopAgent` settles the agent, but the turn's own settle path also runs (and can win), so `agents.get(id).status` is not proof of who ended the turn. Without the marker the ledger recorded `done` for a turn the user had stopped — contradicting what the transcript showed. The marker clears only when that agent starts its next turn, so both racing paths map to `stopped`/`user-abort`.
- **`diagnosticFor(outcome)` writes `boundedDiagnostic(Error(outcome.error.code))`, not the provider string.** The runtime already converts a thrown error into `phase: 'error'` with code `request_failed`, so the raw message never reaches the coordinator's outcome path. The `catch` path (a throw outside `start()`) does carry the bounded message.
- **`send()` gates on `BUSY_PHASES`.** D-21 forbids a second turn beside a parked one; the old `LIVE_PHASES` guard let a submit through during `awaiting-budget`.
- **`runBatch` closes the batch itself** with `phaseAtEnd: 'lead-synthesizing'`, so `dispose`/`abortAll` cannot double-close it (they clear `openBatchId` defensively).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] A user-stopped turn was recorded as `done` in the ledger**
- **Found during:** Task 1 (mixed-batch linking test)
- **Issue:** When the user stopped an agent, `stopAgent` settled it, but the turn's own `startEmployeeTurn` completion path then ran `finalizeAttempt(..., 'done', ...)` — the `from` guard passed because the ledger row was still `running`, so the ledger and the transcript said `done` while the UI said `stopped`. The report content was likewise the runtime's clean text rather than the stopped copy.
- **Fix:** A `userStopped` set is written by `stopAgent`, read at the settle site, and cleared only when that agent's next turn starts. The terminal mapping uses it to choose `stopped`/`user-abort`.
- **Files modified:** `src/services/ai/office/teamRunCoordinator.ts`
- **Verification:** `links exactly one report row per terminal attempt in a mixed batch` asserts the stopped agent's row is `stopped`/`user-abort`/`incomplete`.
- **Committed in:** `0ac7c757` (Task 1 commit)

**2. [Rule 3 - Blocking] A lead deferred deadlocked `Promise.all(deferreds)`**
- **Found during:** Task 2 (restructuring `startLeadTurn`)
- **Issue:** Giving the lead a deferred (symmetric with the employee path) made `runBatch`'s `await Promise.all([...agentDeferreds.values()])` wait on a deferred nothing would ever resolve for a lead-only turn — the run hung until the test timeout.
- **Fix:** The lead gets the `try/catch/finally` shape only (release + `phase = 'ready'` + deferred cleanup); no deferred is created for the lead, matching the batch's deferred authority being employee attempts.
- **Files modified:** `src/services/ai/office/teamRunCoordinator.ts`
- **Verification:** the whole 64-test file is green, including every dispose and batch test.
- **Committed in:** `f5dcf1fb` (Task 2 commit)

**3. [Rule 1 - Bug] A per-agent rejection escaped as an unhandled rejection**
- **Found during:** Task 2 (`pre-start read throws` test)
- **Issue:** `runBatch` awaits `Promise.allSettled(started)`, so nobody observed a rejection from `startEmployeeTurn`; Vitest reported an unhandled rejection and, in production, it would reach the global handler.
- **Fix:** Each pushed promise gets `.catch(() => {})`; the agent and its ledger row were already settled inside `startEmployeeTurn`'s own catch.
- **Files modified:** `src/services/ai/office/teamRunCoordinator.ts`
- **Verification:** the pre-start-throw test passes with no "Unhandled Errors" section.
- **Committed in:** `619788c5` (Task 2 follow-up)

**4. [Rule 1 - Bug] Pre-existing test asserted the old `void` send contract and a park-free second turn**
- **Found during:** Task 1
- **Issue:** (a) `does nothing when the seam reports no lead` asserted `resolves.toBeUndefined()`; (b) `counts usage on a second turn` sent twice at the default budget, which now correctly returns `'busy'` mid-park under D-21.
- **Fix:** (a) asserts `'started'` (the submit was accepted, it simply starts nothing); (b) raises the team budget so the two turns run back to back instead of colliding with D-21.
- **Files modified:** `tests/services/ai/office/teamRunCoordinator.test.ts`
- **Verification:** both tests pass and still assert what their names claim.
- **Committed in:** `0ac7c757` (Task 1 commit)

**5. [Rule 1 - Bug] Three new assertions counted the instruction row as a report**
- **Found during:** Task 1
- **Issue:** The instruction row also carries `assignmentId` (that is the D-22 link), so filtering `chatMessages` by `assignmentId` alone returned 2 rows.
- **Fix:** The assertions filter on `messageKind === 'report'` as well — which is the contract the acceptance criterion means ("exactly one `messageKind: 'report'` row").
- **Files modified:** `tests/services/ai/office/teamRunCoordinator.test.ts`
- **Verification:** all three linking tests pass.
- **Committed in:** `0ac7c757` / `9385f3a7`

---

**Total deviations:** 5 auto-fixed (4 bug, 1 blocking)
**Impact on plan:** All five were correctness defects in the new writer or in tests that encoded the pre-37-03 contract. No architectural change; D-09, D-17, D-22 are all honoured.

## Issues Encountered

- The task-1 acceptance criterion "every committed terminal status change came through `transitionAssignment` and the raw table's update/put was never called" needed a precise reading: `transitionAssignment` itself writes with `put`. The test therefore asserts (a) no direct `update` patch ever carries `runStatus`/`stopReason`/`incomplete` and (b) the only `put` calls are the guarded ones.

## Known Stubs

- `assignmentControllers` still has no producers (37-04 task 1 wires them), so `abortAllAssignmentControllers` remains proven directly against a populated map. Carried over from 37-02; tracked in `.planning/WINDOWS.md`.
- `openBatchId` is now populated by `runBatch`, so `dispose()`'s `closeBatch` path is live; the 37-02 stub is closed.
- `supersededByMessageId` / `supersededAt` are declared and threaded through `SaveTeamMessageInput`, but nothing writes them — 37-07's `supersedeTeamMessage` is the only writer by design.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 37-04 can call `finalizeAttempt(id, 'queued' | 'running', 'stopped', 'user-per-agent' | 'user-abort', STOPPED_REPORT_COPY)` from `stopAgent` and `abortAll` — a `null` return means the settle path won the race and is expected.
- 37-06 can dispatch on `send()`'s three-way result: requeue on `'busy'`, surface an error and drop on `'blocked'`.
- 37-08 reads `reportMessageId`'s `runStatus`/`incomplete` for the retry affordance; the row is reachable through `getMessagesByThreadId`.
- `TeamWorkspace.tsx` still ignores `send()`'s return value; the outbox that consumes it is 37-06's call site, not this plan's.

---
*Phase: 37-runtime-reliability-concurrency*
*Completed: 2026-11-11*

## Self-Check: PASSED

- `src/types/models.ts`, `src/db/repositories/teamTranscriptRepo.ts`, `src/services/ai/office/teamRunCoordinator.ts`, and both test files exist and are tracked.
- All five commits (`0ac7c757`, `f5dcf1fb`, `9385f3a7`, `e0c54c9f`, `619788c5`) are ancestors of HEAD.
- `npx tsc --noEmit` is clean; `npx vitest run` on the two owned test files reports 81 passed.
