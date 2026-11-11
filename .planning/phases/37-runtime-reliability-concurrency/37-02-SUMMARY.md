---
phase: 37-runtime-reliability-concurrency
plan: 02
subsystem: runtime
tags: [concurrency, scheduler, semaphore, ai-office, lifecycle, teardown, dispose]
dependency-graph:
  requires:
    - 37-01 (clampTeamConcurrency, AiTeam.concurrencyLimit, aiTeamRunRepo.closeBatch)
  provides:
    - scheduler.ts (SchedulerHandle, TeamRunScheduler, createTeamRunScheduler)
    - teamRunManager.ts (TeamRunEntry, runKey, getOrCreateRun, peekRun, disposeRun, disposeAllRuns)
    - TeamRunCoordinator.dispose()
    - TeamRunCoordinator.setPhase() internal gated writer
  affects:
    - 37-04 (runBatch acquires through scheduler; assignmentControllers producers land there)
    - 37-05 (deleteTeam calls disposeRun before deleting the row)
    - 37-06/37-07 (backup + SQLite parity unaffected — no schema change here)
    - 40 (live run badge reads peekRun)
tech-stack:
  added: []
  patterns:
    - "abort-aware park: resolver/listener installed before publishing, { once: true }, immediate reject when already aborted (mirrors budgetGate.wait)"
    - "monotonic non-reused slot ids, so release/cancel are provably idempotent"
    - "one phase writer (setPhase) that drops the write and its notify() once disposed"
    - "module-level registry keyed by `${db.name}:${teamId}` so a test DB never inherits a run"
key-files:
  created:
    - src/services/ai/office/scheduler.ts
    - src/services/ai/office/teamRunManager.ts
    - tests/services/ai/office/scheduler.test.ts
    - tests/services/ai/office/teamRunManager.test.ts
  modified:
    - src/services/ai/office/teamRunCoordinator.ts
    - tests/services/ai/office/teamRunCoordinator.test.ts
decisions:
  - "scheduler.acquire(signal) requires the signal; cancel(handle) is documented as release-equivalent only — no handle exists before admission, so a queued assignment is cancelled by aborting its own AbortController"
  - "setLimit clamps via clampTeamConcurrency and drains FIFO; equality with the running count admits nobody"
  - "dispose() sets phase='ready' before its only await (closeBatch), then uses the pre-flag writes, so no observer sees a live phase behind the flag"
  - "getOrCreateRun deletes the map entry BEFORE awaiting the stale dispose, so a concurrent get during the dispose window cannot observe a half-torn-down coordinator"
  - "abortAllAssignmentControllers exported from the coordinator so 37-04's producers and this plan's dispose share exactly one abort-all loop"
actuals:
  tokens: 10600
  tasks: 3
  commits: 3
  plan_head_before: 968ed9222e75a05638597fd810bcb8a9917c3caf
  plan_head_after: b0a3f996f95c309344e18857473c7126f4cc4142
requirements-completed: [AIO-RUNTIME-04, AIO-RUNTIME-05]
coverage:
  - id: D1
    description: "Hand-written per-team scheduler: admits in plan order, parks beyond the limit, honours a live clampable limit"
    requirement: AIO-RUNTIME-05
    verification:
      - kind: unit
        ref: "tests/services/ai/office/scheduler.test.ts#admits in FIFO / plan order for five acquires at limit 1"
        status: pass
      - kind: unit
        ref: "tests/services/ai/office/scheduler.test.ts#admits the third acquire only after the limit is raised to 3"
        status: pass
      - kind: unit
        ref: "tests/services/ai/office/scheduler.test.ts#lowering the limit preempts nothing and admits nobody until the count drops"
        status: pass
      - kind: unit
        ref: "tests/services/ai/office/scheduler.test.ts#clamps every limit through clampTeamConcurrency"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every acquire is abort-aware: already-aborted rejects immediately, a parked acquire rejects and drops its waiter"
    requirement: AIO-RUNTIME-04
    verification:
      - kind: unit
        ref: "tests/services/ai/office/scheduler.test.ts#rejects a parked acquire with a DOMException named AbortError"
        status: pass
      - kind: unit
        ref: "tests/services/ai/office/scheduler.test.ts#rejects immediately when the signal is already aborted"
        status: pass
      - kind: unit
        ref: "tests/services/ai/office/scheduler.test.ts#does not admit an aborted waiter when a slot opens"
        status: pass
    human_judgment: false
  - id: D3
    description: "release/cancel are idempotent and an unknown handle is a no-op"
    requirement: AIO-RUNTIME-05
    verification:
      - kind: unit
        ref: "tests/services/ai/office/scheduler.test.ts#releases one slot on a double release and ignores an unknown handle"
        status: pass
      - kind: unit
        ref: "tests/services/ai/office/scheduler.test.ts#treats cancel as an idempotent release"
        status: pass
    human_judgment: false
  - id: D4
    description: "Coordinator lifetime is owned by a module-level manager, so teardown works from a path that never mounted the workspace"
    requirement: AIO-RUNTIME-04
    verification:
      - kind: unit
        ref: "tests/services/ai/office/teamRunManager.test.ts#isolates teams: disposing one leaves the sibling coordinator in place"
        status: pass
      - kind: unit
        ref: "tests/services/ai/office/teamRunManager.test.ts#awaits the stale dispose before constructing the replacement"
        status: pass
      - kind: unit
        ref: "tests/services/ai/office/teamRunManager.test.ts#drops the entry even when dispose throws, and rethrows to the caller"
        status: pass
    human_judgment: false
  - id: D5
    description: "Coordinator.dispose() ends a live run in bounded time and leaves the coordinator inert"
    requirement: AIO-RUNTIME-04
    verification:
      - kind: unit
        ref: "tests/services/ai/office/teamRunCoordinator.test.ts#resolves a send() parked on the plan card and leaves the phase ready"
        status: pass
      - kind: unit
        ref: "tests/services/ai/office/teamRunCoordinator.test.ts#leaves the phase ready when disposed mid-runBatch"
        status: pass
      - kind: unit
        ref: "tests/services/ai/office/teamRunCoordinator.test.ts#starts no script when send() is called after dispose"
        status: pass
      - kind: unit
        ref: "tests/services/ai/office/teamRunCoordinator.test.ts#aborts every assignment controller and empties the map"
        status: pass
    human_judgment: false
duration: 15 min
completed: 2026-11-11
status: complete
---

# Phase 37 Plan 02: Per-team scheduler and run manager Summary

**A hand-written FIFO scheduler with a live 1–12 limit plus a module-level run manager that makes `dispose()` reachable from a path that never mounted the workspace**

## Performance

- **Duration:** 15 min
- **Started:** 2026-11-11T19:04:34Z
- **Completed:** 2026-11-11T19:20:09Z
- **Tasks:** 3
- **Files modified:** 6 (4 created, 2 modified)

## Accomplishments

- `createTeamRunScheduler(limit)` — `acquire(signal)` parks exactly like `budgetGate.wait` (listener installed before publishing, `{ once: true }`, immediate reject when already aborted); `release`/`cancel` idempotent via monotonic non-reused slot ids; `setLimit` clamps through `clampTeamConcurrency` and drains FIFO. No assignment state, no new dependency (D-07, D-08).
- `teamRunManager` owns every coordinator instance at module level, keyed by `${db.name}:${teamId}`. `getOrCreateRun` awaits the stale dispose before replacing a `threadId`-changed entry; `disposeRun` drops the map entry even when disposal throws and then rethrows.
- `TeamRunCoordinator.dispose()` — releases the plan park and both gate families, aborts every per-assignment `AbortController`, `registry.clear()`s the runtimes, settles every non-terminal agent, closes a tracked batch, and lands `phase = 'ready'`.
- Every post-await phase write now routes through `setPhase()`, which drops the write **and** its `notify()` once `disposed`. That is what keeps `runBatch`'s `lead-synthesizing` tail (`Promise.all(deferreds)` is an await) and `topUp`'s two-await tail from resurrecting a dead run.

## Task Commits

1. **Task 1: End-to-end scheduler (acquire → hold → release with a live limit)** — `8caabc1d` (feat)
2. **Task 2: Run manager — one owner for every coordinator, with an ordered dispose** — `32b36ec7` (feat)
3. **Task 3: Coordinator `dispose()` — abort inbox, abort agents, resolve parks, close the ledger** — `b0a3f996` (feat)

## Files Created/Modified

- `src/services/ai/office/scheduler.ts` (new) — `SchedulerHandle`, `TeamRunScheduler`, `createTeamRunScheduler`; parked waiters in issue order (D-05).
- `src/services/ai/office/teamRunManager.ts` (new) — `runKey`, `getOrCreateRun`, `peekRun`, `disposeRun`, `disposeAllRuns` (D-18).
- `src/services/ai/office/teamRunCoordinator.ts` — `dispose()` on the interface + implementation, `disposed`/`openBatchId`/`assignmentControllers` state, `setPhase()` writer, `abortAllAssignmentControllers` export.
- `tests/services/ai/office/scheduler.test.ts` (new) — 13 tests.
- `tests/services/ai/office/teamRunManager.test.ts` (new) — 9 tests.
- `tests/services/ai/office/teamRunCoordinator.test.ts` — 44 → 50 `it(` blocks (6 dispose tests appended, none rewritten).

## Decisions Made

- **`acquire(signal)` requires the signal; `cancel(handle)` is release-equivalent only.** No handle exists before admission, so a queued assignment is cancelled by aborting its own `AbortController`. The doc comment states both facts because a caller that reached for `cancel` to stop a parked acquire would leave it parked forever (D-10).
- **`dispose()` writes `phase = 'ready'` before its only `await` (`closeBatch`).** The flag is already up, so `setPhase` would refuse the write; doing it first means no observer can catch a live phase behind a disposed coordinator.
- **`getOrCreateRun` deletes the map entry before awaiting the stale dispose.** A concurrent `get` during the dispose window therefore constructs a fresh coordinator rather than observing a half-torn-down one; the plan's "two coordinators never coexist" property holds because the replacement is only stored after the await.
- **`abortAllAssignmentControllers` is exported from the coordinator** so 37-04's producers and this plan's `dispose()` share one abort-all loop instead of two copies drifting.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `teamRunManager` could not typecheck without `TeamRunCoordinator.dispose()`**
- **Found during:** Task 2
- **Issue:** The plan splits `dispose()` into Task 3, but `teamRunManager.ts` calls `entry.coordinator.dispose()`, so `npx tsc --noEmit` failed with `TS2339: Property 'dispose' does not exist on type 'TeamRunCoordinator'` and Task 2 could not be verified or committed on its own.
- **Fix:** Added the `dispose(): Promise<void>` member to the interface and its implementation in the same change as the manager, then extended the dispose test suite in Task 3 as planned. Task boundaries moved; no behaviour was added outside the plan.
- **Files modified:** `src/services/ai/office/teamRunCoordinator.ts`
- **Verification:** `npx tsc --noEmit` clean; 44 pre-existing coordinator tests still pass.
- **Committed in:** `32b36ec7` (Task 2 commit)

**2. [Rule 3 - Blocking] Scheduler doc comment tripped the acceptance grep**
- **Found during:** Task 1 (acceptance criteria)
- **Issue:** The prohibition grep for `p-limit|p-queue|async-mutex` matched the scheduler's own doc comment, which named the rejected packages verbatim.
- **Fix:** Reworded the comment to "no queue or mutex dependency is added" — the decision (D-07) is still stated, the grep is clean.
- **Files modified:** `src/services/ai/office/scheduler.ts`
- **Verification:** `grep -n "p-limit\|p-queue\|async-mutex" src/services/ai/office/scheduler.ts package.json` returns no match (exit 1).
- **Committed in:** `8caabc1d` (Task 1 commit)

**3. [Rule 1 - Bug] `abort()` on a waiter could not remove itself from the queue**
- **Found during:** Task 1
- **Issue:** The `onAbort` closure needs the waiter object it belongs to, but the object literal is being constructed at the same moment; a naive `waiters.filter(w => w.signal !== signal)` would also mis-handle two waiters sharing one signal (the coordinator hands each assignment its own controller, but the scheduler must not rely on that).
- **Fix:** Declared the waiter first, then assigned `onAbort` that splices it by identity, then registered the listener and pushed. Identity-based removal is signal-sharing-safe.
- **Files modified:** `src/services/ai/office/scheduler.ts`
- **Verification:** `rejects a parked acquire and drops the waiter when its signal aborts` asserts `getQueuedCount() === 0` after the rejection.
- **Committed in:** `8caabc1d` (Task 1 commit)

**4. [Rule 1 - Bug] Two scheduler tests were vacuous**
- **Found during:** Task 1 (self-review of the new suite)
- **Issue:** (a) `Promise.all` over three acquires preserves array order, so a `parked[0]` assertion would pass without any FIFO behaviour; (b) one test computed an `admitted` array it never asserted against.
- **Fix:** Added an `awaitsInOrder` helper that yields settles in completion order and asserts the full `[0,1,2,3,4]` plan order; replaced the vacuous test with one that asserts the third acquire stays parked until `setLimit(3)` and resolves after it.
- **Files modified:** `tests/services/ai/office/scheduler.test.ts`
- **Verification:** 13 scheduler tests pass; the FIFO test fails if `drain()` takes the newest waiter.
- **Committed in:** `8caabc1d` (Task 1 commit)

---

**Total deviations:** 4 auto-fixed (2 blocking, 2 bug)
**Impact on plan:** The Task 2/Task 3 boundary moved (the interface member had to land with its only consumer). No architectural change, no scope creep, no behaviour outside the plan's must_haves.

## Issues Encountered

- `dispose()` cannot await the in-flight `send()`/`runBatch` — releasing the parks is precisely what lets them finish. The gated `setPhase()` writer is the resolution, and the `leaves the phase ready when disposed mid-runBatch` test is the proof: the batch promise settles and the phase is still `ready`.

## Known Stubs

- `openBatchId` in `src/services/ai/office/teamRunCoordinator.ts` is declared `null` and never assigned, so `dispose()`'s `closeBatch` call is currently a no-op. This is the plan's explicit staging decision — 37-03 task 1 owns the batch open/close producers. Tracked in `.planning/WINDOWS.md`.
- `assignmentControllers` is declared, aborted and cleared by `dispose()`, but has no producers until 37-04 task 1 wires the per-assignment `AbortController`. The abort-all loop is proven directly in `aborts every assignment controller and empties the map`. Tracked in `.planning/WINDOWS.md`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 37-04 can instantiate `createTeamRunScheduler(liveTeam.concurrencyLimit ?? DEFAULT_TEAM_CONCURRENCY)` and gate `runBatch`'s dispatch on `acquire(controller.signal)`, reusing `abortAllAssignmentControllers` for stop/abort/dispose.
- 37-05 can call `await disposeRun(db, teamId)` before `deleteTeam` — the manager is importable from the explorer path, which never mounts `TeamWorkspace`.
- `TeamWorkspace.tsx` still owns its own `coordinatorRegistry` (`:62-74`); moving it onto `teamRunManager` is 37-05's call site rewrite, not this plan's.
- `MAX_BATCH_SIZE` and its `BATCH_TOO_LARGE` refusal remain live until 37-04 by design.

---
*Phase: 37-runtime-reliability-concurrency*
*Completed: 2026-11-11*

## Self-Check: PASSED
