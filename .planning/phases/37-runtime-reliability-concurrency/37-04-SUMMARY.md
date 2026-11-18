---
phase: 37-runtime-reliability-concurrency
plan: 04
subsystem: runtime
tags: [concurrency, scheduler, queue, stop-abort, delegation, ai-office]
dependency-graph:
  requires:
    - 37-01 (AiTeam.concurrencyLimit, clampTeamConcurrency, aiTeamRunRepo)
    - 37-02 (scheduler.ts acquire/release/setLimit, assignmentControllers slot, dispose)
    - 37-03 (finalizeAttempt, STOPPED_REPORT_COPY, boundedDiagnostic, ledger transitions)
  provides:
    - Coordinator-local scheduler + scheduledHandles + assignmentIdsByAgent
    - TeamRunCoordinator.getRunningCount()
    - setTeamSettings({ concurrencyLimit }) -> scheduler.setLimit (D-04)
    - Queue-aware stopAgent / abortAll (D-10, D-11)
    - Batch result entries carrying stopReason + incomplete (D-14)
    - Drawer control `team-concurrency-limit`
  affects:
    - 37-06 (queued-agent render reads the `queued` status this plan now produces)
    - 37-08 (retry reads the stopped report row this plan guarantees for a queued stop)
tech-stack:
  added: []
  patterns:
    - "one async task per assignment owns acquire -> start -> settle -> release inside one try/finally"
    - "queued cancellation goes through the assignment's own AbortController, never scheduler.cancel"
    - "handles are released only in the dispatch task's finally, after startEmployeeTurn settled the agent"
    - "creation-time agentId -> assignmentId map, because a queued assignment has no runtime entry"
    - "report stamp + terminal writer share one rw transaction, so Dexie serialization makes them mutually exclusive"
key-files:
  created: []
  modified:
    - src/services/ai/office/teamRunCoordinator.ts
    - src/services/ai/office/teamTools.ts
    - src/services/ai/office/teamPrompts.ts
    - src/types/aiOffice.ts
    - src/components/ai/office/TeamSettingsDrawer.tsx
    - src/components/ai/office/TeamWorkspace.tsx
    - tests/services/ai/office/teamRunCoordinator.test.ts
    - tests/services/ai/office/teamTools.test.ts
    - tests/services/ai/office/teamPrompts.test.ts
    - tests/views/TeamsView.test.tsx
decisions:
  - "one dispatchAssignment() owns the whole slot lifetime; runBatch no longer calls startEmployeeTurn directly"
  - "userStopped became a Map<agentId, stopReason> so the stop path and the turn's settle path record the same reason instead of racing to two different values"
  - "saveMessage's link stamp runs inside one rw transaction over chatMessages+aiTeamAssignments and drops its own row when the attempt already settled"
  - "abortAll closes the batch row itself with abortedBy:'user', otherwise runBatch's own close (abortedBy:'none') could win the race"
  - "stopAgent and the catch path branch on the stored runStatus so every finalizeAttempt call passes a literal from token"
actuals:
  tokens: 14400
  tasks: 3
  commits: 3
  plan_head_before: 6a2e736edab82ee27c6d645a8d550dab82f325ac
  plan_head_after: 109b7e5a0b6bde48f4ce13f7b71a86d4bbaf3205
requirements-completed: [AIO-RUNTIME-05, AIO-GROUP-04, AIO-LEAD-05]
coverage:
  - id: D1
    description: "Limit 2 with 5 assignments: never more than 2 running, all 5 finish"
    requirement: AIO-RUNTIME-05
    verification:
      - kind: unit
        ref: "tests/services/ai/office/teamRunCoordinator.test.ts#never runs more than the limit and still finishes all five assignments (limit 2)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Admission order equals the order the lead emitted the assignments"
    requirement: AIO-RUNTIME-05
    verification:
      - kind: unit
        ref: "tests/services/ai/office/teamRunCoordinator.test.ts#admits in plan order at limit 1 (D-05)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Assignment limit+1 stays queued: no runtime, no live-use claim, script never invoked"
    requirement: AIO-RUNTIME-05
    verification:
      - kind: unit
        ref: "tests/services/ai/office/teamRunCoordinator.test.ts#leaves the third assignment queued and never starts its script while two run"
        status: pass
    human_judgment: false
  - id: D4
    description: "A live limit raise admits queued agents; a lower preempts nothing"
    requirement: AIO-RUNTIME-05
    verification:
      - kind: unit
        ref: "tests/services/ai/office/teamRunCoordinator.test.ts#raises the limit mid-batch and admits the queued agent without rebuilding (D-04)"
        status: pass
      - kind: unit
        ref: "tests/services/ai/office/teamRunCoordinator.test.ts#lowers the limit mid-batch: both keep running and nothing new starts (D-04)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Every acquired slot is released on the throw, abort and dispose paths"
    requirement: AIO-RUNTIME-05
    verification:
      - kind: unit
        ref: "tests/services/ai/office/teamRunCoordinator.test.ts#releases the slot of a pre-start throw so the rest of the queue still runs"
        status: pass
      - kind: unit
        ref: "tests/services/ai/office/teamRunCoordinator.test.ts#abortAll settles every queued assignment and closes the batch as a user abort (D-11)"
        status: pass
      - kind: unit
        ref: "tests/services/ai/office/teamRunCoordinator.test.ts#dispose mid-batch rejects the parked acquire and settles the queued assignment (limit 1)"
        status: pass
    human_judgment: false
  - id: D6
    description: "A per-agent Stop on a queued assignment settles it stopped/incomplete and invokes its script zero times"
    requirement: AIO-LEAD-05
    verification:
      - kind: unit
        ref: "tests/services/ai/office/teamRunCoordinator.test.ts#stops a QUEUED agent without invoking its script, and names it incomplete (D-10)"
        status: pass
    human_judgment: false
  - id: D7
    description: "MAX_BATCH_SIZE is gone; a 30-assignment batch is accepted and the other refusals still work"
    requirement: AIO-GROUP-04
    verification:
      - kind: unit
        ref: "tests/services/ai/office/teamTools.test.ts#accepts a 30-assignment batch — the scheduler, not a cap, bounds concurrency (D-06)"
        status: pass
      - kind: unit
        ref: "tests/services/ai/office/teamTools.test.ts#refuses an empty assignments array with EMPTY_BATCH"
        status: pass
      - kind: unit
        ref: "tests/services/ai/office/teamTools.test.ts#refuses an agentId outside the roster with AGENT_NOT_IN_ROSTER"
        status: pass
      - kind: unit
        ref: "tests/services/ai/office/teamPrompts.test.ts#(lead rule text no longer matches /tối đa \\d+ phân công/)"
        status: pass
    human_judgment: false
  - id: D8
    description: "The delegate_batch result names every unfinished assignment with status, stopReason and incomplete"
    requirement: AIO-LEAD-05
    verification:
      - kind: unit
        ref: "tests/services/ai/office/teamRunCoordinator.test.ts#stops a QUEUED agent without invoking its script, and names it incomplete (D-10)"
        status: pass
    human_judgment: false
duration: 48 min
completed: 2026-11-11
status: complete
---

# Phase 37 Plan 04: Scheduler-gated batch, live limit, queue-aware stop Summary

**The per-team concurrency limit is now the only rule: the batch queues in plan order, a queued agent is stoppable through its own controller, every stop writes a ledger row, and `MAX_BATCH_SIZE` is gone**

## Performance

- **Duration:** 48 min
- **Started:** 2026-11-11T20:14:00Z (plan ledger base `6a2e736e`)
- **Completed:** 2026-11-11T21:02:00Z
- **Tasks:** 3
- **Files modified:** 10 (0 created)

## Accomplishments

- `dispatchAssignment()` is the single acquisition unit: `try` opens before `scheduler.acquire(controller.signal)`, `startEmployeeTurn` runs inside it, and `finally` is the only release point (`scheduledHandles.delete` + `scheduler.release`). Nothing is released when `start()` returns, so a paused agent keeps its slot (Pitfall 10).
- `runBatch` creates every attempt `queued`, registers `assignmentIdsByAgent` at creation time, sets UI status `queued`, and dispatches through `Promise.allSettled`. At limit 2 with 5 assignments the observed maximum `running` count is exactly 2 and all five reach `done`; at limit 1 the started order equals the plan order.
- The queued cancellation channel is the assignment's own `AbortController`. `stopAgent` finds the assignment through the creation-time map, aborts that controller (the parked acquire rejects with `AbortError`), settles the ledger row with `from: 'queued'`, and never calls `registry.get`. `abortAll` aborts every queued controller, finalizes each queued row `stopped`/`user-abort`, settles agents, sets phase `ready`, and closes the batch row with `abortedBy: 'user'`.
- `setTeamSettings` forwards `concurrencyLimit` to `scheduler.setLimit`; the drawer renders a 1–12 `InputNumber` (`data-testid="team-concurrency-limit"`) seeded once per open, and `TeamWorkspace.handleSaveSettings` persists it and applies it to the live run.
- `MAX_BATCH_SIZE`, `BATCH_TOO_LARGE`, both description interpolations and the prompt clause are deleted; `grep -rn "MAX_BATCH_SIZE\|BATCH_TOO_LARGE" src tests` returns nothing.
- The `delegate_batch` result now carries `{ agentId, agentName, status, stopReason, incomplete, report }` per assignment, read from the ledger row (D-14).

## Task Commits

1. **Task 1: scheduler-gated batch, in plan order, cap removed** — `1e36b186` (feat)
2. **Task 2: live limit from the settings drawer** — `f84d527c` (feat)
3. **Task 3: stop/abort reach the queue; unfinished work named** — `109b7e5a` (fix)

## Files Created/Modified

- `src/services/ai/office/teamRunCoordinator.ts` — scheduler instance, `scheduledHandles`, `assignmentIdsByAgent`, `attemptIdsByAgent`, `dispatchAssignment`, `getRunningCount`, live-limit `setTeamSettings`, queue-aware `stopAgent`/`abortAll`, ledger-backed batch results, serialized report stamp.
- `src/services/ai/office/teamTools.ts` — cap removal; `delegate_batch` descriptions name no number.
- `src/services/ai/office/teamPrompts.ts` — lead rule 2 no longer states a cap.
- `src/types/aiOffice.ts` — `MAX_BATCH_SIZE` deleted.
- `src/components/ai/office/TeamSettingsDrawer.tsx` — concurrency `InputNumber`, save payload widened.
- `src/components/ai/office/TeamWorkspace.tsx` — persists and applies `concurrencyLimit`.
- `tests/services/ai/office/teamRunCoordinator.test.ts` — 64 → 73 `it(` blocks (9 added, 2 pre-existing assertions updated for the corrected stop reason).
- `tests/services/ai/office/teamTools.test.ts` — cap test replaced by the 30-assignment acceptance test.
- `tests/services/ai/office/teamPrompts.test.ts` — cap assertion replaced by a "no cap in the prompt" assertion.
- `tests/views/TeamsView.test.tsx` — asserts the drawer exposes the concurrency control.

## Decisions Made

- **One `dispatchAssignment()` owns the slot lifetime.** `runBatch` must not call `startEmployeeTurn` directly any more, because only a wrapper whose `try` begins before `acquire` can release a slot for an assignment that never started.
- **`userStopped` became a `Map<agentId, stopReason>`.** With a plain `Set`, the stop path wrote `user-per-agent` while the turn's settle path wrote `user-abort`; which one won depended on timing, so the same user action produced two different ledger reasons across runs. The map makes both writers agree by construction.
- **The report stamp and `finalizeAttempt` share one `rw` transaction over both tables.** Before this, a runtime that saved its report row after the attempt had already settled gave that attempt a second bubble (reproduced roughly 1 run in 3 with the mixed-batch test). The stamp now checks `reportMessageId`/terminal status inside the transaction and deletes its own row when it lost.
- **`abortAll` closes the batch itself.** `runBatch`'s tail closes with `abortedBy: 'none'`; a global abort that relied on it would report a user abort as a normal end.
- **Every `finalizeAttempt` call passes a literal `from` token.** The catch paths read the stored status and branch, so the acceptance grep sees no variable argument and an already-terminal row is never re-finalized.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The 5-assignment tracer test could not pass while the cap existed**
- **Found during:** Task 1
- **Issue:** The plan's task-1 test requires a 5-assignment batch, but `MAX_BATCH_SIZE` (task 2's deletion) refused it, so task 1 could not be verified on its own.
- **Fix:** Deleted the constant, the refusal code, both description interpolations and the prompt clause inside task 1, together with the two test files' cap assertions. Task 2 kept the live-limit half.
- **Files modified:** `src/types/aiOffice.ts`, `src/services/ai/office/teamTools.ts`, `src/services/ai/office/teamPrompts.ts`, both test files.
- **Verification:** `grep -rn "MAX_BATCH_SIZE\|BATCH_TOO_LARGE" src tests` exits 1.
- **Committed in:** `1e36b186` (Task 1 commit)

**2. [Rule 1 - Bug] A per-agent stop recorded `user-abort` instead of `user-per-agent`**
- **Found during:** Task 3
- **Issue:** The stop path and the queued-dispatch catch both called `finalizeAttempt`; whichever won the `from` guard decided the reason, so an identical user action produced `user-per-agent` or `user-abort` from run to run.
- **Fix:** `userStopped` holds the intended reason, and both writers read it (`user-abort` remains the default for a genuine global abort).
- **Files modified:** `src/services/ai/office/teamRunCoordinator.ts`
- **Verification:** the stopped-queued test asserts `user-per-agent` ten consecutive runs.
- **Committed in:** `109b7e5a` (Task 3 commit)

**3. [Rule 1 - Bug] A settled attempt could own two report bubbles**
- **Found during:** Task 3 (mixed-batch test, intermittent)
- **Issue:** `saveMessage`'s link stamp wrote `runStatus: 'running'` and `reportMessageId` outside any transaction. When a stop settled the attempt first, the runtime's own row still landed and the attempt ended with two `messageKind: 'report'` rows.
- **Fix:** the stamp runs in one `rw` transaction over `chatMessages` + `aiTeamAssignments`; if the attempt already carries a `reportMessageId` or a terminal status, the newly written row is deleted instead of linked.
- **Files modified:** `src/services/ai/office/teamRunCoordinator.ts`
- **Verification:** the mixed-batch test passed 12 consecutive runs (it failed roughly 1 in 3 before).
- **Committed in:** `109b7e5a` (Task 3 commit)

**4. [Rule 1 - Bug] Three pre-existing tests were timing-dependent once admission is gated**
- **Found during:** Task 3
- **Issue:** (a) `links exactly one report row…` waited for `running` count 3 while one agent threw instantly; (b) `drains after a completed batch…` read the agent turn before the scheduler admitted it; (c) the 5-assignment test sampled `running` counts while unsubscribing mid-run, and a late `notify()` could keep pushing samples.
- **Fix:** each waits on the specific fact it asserts (the stop target's status, the admitted agent's turn, `getRunningCount()`), and the sampler unsubscribes after the batch resolves.
- **Files modified:** `tests/services/ai/office/teamRunCoordinator.test.ts`
- **Verification:** 10 consecutive full-file runs plus 12 consecutive 3-file runs, all green.
- **Committed in:** `109b7e5a` (Task 3 commit)

**5. [Rule 3 - Blocking] Task-1 and task-2 boundaries moved**
- **Found during:** Task 1
- **Issue:** the cap deletion (task 2) had to land with task 1 (deviation 1); the scheduler-driven stop semantics (task 3) needed `stopReason` in the batch result, which the plan assigns to task 3 as well — so task 3 carries both.
- **Fix:** task 1 = scheduler + cap; task 2 = live limit + drawer; task 3 = queue-aware stop + result fields. Everything in the plan's file list is covered; nothing outside it changed.
- **Files modified:** none beyond the plan's list.
- **Committed in:** `1e36b186`, `f84d527c`, `109b7e5a`

---

**Total deviations:** 5 auto-fixed (3 bug, 2 blocking)
**Impact on plan:** No architectural change. The two real defects (2 and 3) were concurrency races the plan's must_haves demand be impossible; both are now closed by construction (a stateful stop reason, and one transaction), not by retry logic.

## Issues Encountered

- `npx vitest run tests/views/TeamsView.test.tsx` reports 7–8 "Unhandled Rejection: DatabaseClosedError" errors on the current branch **and on the plan's base commit with my changes reverted**; the tests themselves pass (36/36). Pre-existing, out of scope, recorded in `.planning/WINDOWS.md`.

## Known Stubs

None. `assignmentControllers`, `scheduledHandles` and `assignmentIdsByAgent` all have producers now, so the 37-02/37-03 stub entries for `assignmentControllers` are closed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 37-06 can render a `queued` agent: the coordinator emits `status: 'queued'` at creation and keeps it until admission, and `getRunningCount()` exposes the live slot count for a badge.
- 37-08 can rely on a stopped queued attempt owning exactly one `messageKind: 'report'` row with `runStatus: 'stopped'` and `incomplete: true`.
- A batch of any size is accepted; the scheduler is the only bound (T-37-10).

---

*Phase: 37-runtime-reliability-concurrency*
*Completed: 2026-11-11*

## Self-Check: PASSED

- All ten modified files exist and are tracked.
- All three commits (`1e36b186`, `f84d527c`, `109b7e5a`) are ancestors of HEAD.
- `npx tsc --noEmit` clean; the three focused suites report 102 passed, and the four-file run (plus `scheduler.test.ts`) reports 115 passed.
