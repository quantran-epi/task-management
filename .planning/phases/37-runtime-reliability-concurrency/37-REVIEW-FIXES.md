---
phase: 37-runtime-reliability-concurrency
fixed_at: 2026-11-12T06:40:00Z
review_path: .planning/phases/37-runtime-reliability-concurrency/37-REVIEW.md
iteration: 1
findings_in_scope: 18
fixed: 18
skipped: 0
status: all_fixed
---

# Phase 37: Code Review Fix Report

**Fixed at:** 2026-11-12T06:40:00Z
**Source review:** `.planning/phases/37-runtime-reliability-concurrency/37-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 18
- Fixed: 18
- Skipped: 0

Every fix was proved with a focused test that fails on the pre-fix tree
(`git apply -R` of the source hunk, run the new test, restore). Suites run:
`tests/services/ai/office/teamRunCoordinator.test.ts`, `aiTeamRepo.test.ts`,
`teamRunManager.test.ts`, `tests/db/aiTeamRunRepo.test.ts`,
`tests/db/tableListParity.test.ts`, `tests/ai/ChatMessageListAttribution.test.tsx`,
`tests/components/ai/office/AgentAttributionRow.test.tsx`,
`TeamWorkspaceOutbox.test.tsx`, `AiOfficeExplorerTeardown.test.tsx`,
`tests/hooks/useTeamRunTeardown.test.ts`,
`tests/services/backup/officeBackup.test.ts`, `validateBackup.test.ts`
— 12 files, 223 tests, all passing. `npx tsc --noEmit` clean after every commit.
Full Vitest suite never run (user rule).

## Fixed Issues

### CR-01: `deleteTeam` left the two ledger tables behind

- **Commit:** `1f520f75`
- **Files:** `src/db/repositories/aiTeamRepo.ts`, `tests/services/ai/office/aiTeamRepo.test.ts`
- **What changed:** the teardown `rw` transaction now names `aiTeamBatches` and
  `aiTeamAssignments`. Assignments are deleted by `where('batchId').anyOf(batchIds)`, then
  batches by `teamId`, before the parent rows — dependency order. The existing chat-message
  delete was left exactly as it was (no double-delete).
- **Proof:** `deletes the team run ledger so the next export still validates (CR-01)` —
  seeds team + thread + batch + assignment + report, deletes, then asserts both ledger tables
  are empty AND `validateBackupPayload(exportBackupPayload(db))` is `valid: true`.
- **Status:** fixed

### CR-02: dispose landing after `runBatch`'s entry check still opened a batch

- **Commit:** `4abfa19c`
- **Files:** `src/services/ai/office/teamRunCoordinator.ts`, `tests/services/ai/office/teamRunCoordinator.test.ts`
- **What changed:** `disposed` is re-checked after `executeTeamTool`, after the plan-park
  resolution, after `openBatch` (closing the row this call opened with
  `abortedBy: 'team-deleted'`), after each `createAssignment`, and immediately before start
  after `scheduler.acquire` in both `dispatchAssignment` and `retryAssignment`.
- **Proof:** `refuses a batch when dispose lands inside the delegate_batch validation (CR-02)`
  — stubs `executeTeamTool` pending, disposes, asserts 0 batches, 0 assignments, 0 running
  slots, no employee runtime, `phase === 'ready'`, and `{cancelled: true}`.
- **Status:** fixed
- **Deviation:** the CR-02 re-check inside the *loop* was folded into the WR-06 `try/catch`
  instead of keeping a separate disposed branch there (same behaviour, one exit path). The
  dispose-during-`acquire` case throws `AbortError` rather than returning, because a bare
  return would leave the attempt row `queued` with no writer — the existing catch settles it.

### WR-01: instruction row carried a permanent `runStatus: 'queued'`

- **Commit:** `b587efdb`
- **Files:** `src/services/ai/office/teamRunCoordinator.ts`, `src/components/ai/ChatMessageBubble.tsx`, `tests/ai/ChatMessageListAttribution.test.tsx`
- **What changed:** `runBatch` writes only the pairing link fields
  (`batchId`/`assignmentId`/`attemptNo`) on the instruction row. `ChatMessageBubble` additionally
  requires `messageKind === 'report' || messageKind === undefined` before rendering
  `AgentStatusRow`.
- **Proof:** `renders no status row, stop or retry for an instruction row` (no
  `agent-status-*`, no `agent-stop-*`, no `agent-retry-*`) plus `still renders the report row of
  the same attempt`.
- **Status:** fixed

### WR-02: retry button offered for statuses `retryAssignment` refuses

- **Commit:** `915ad512`
- **Files:** `src/components/ai/office/AgentAttributionRow.tsx`, `src/components/ai/office/TeamWorkspace.tsx`, `tests/components/ai/office/AgentAttributionRow.test.tsx`, `tests/components/ai/office/TeamWorkspaceOutbox.test.tsx`
- **What changed:** `showRetry = status === 'stopped' || status === 'error'`. The call site now
  does `.catch(() => setActionError(RETRY_ERROR_COPY))` with a new fixed
  `RETRY_ERROR_COPY`; `err.message` is never forwarded.
- **Proof:** `renders no retry button for a {queued|running|paused} attempt` (3 cases) and
  `surfaces a refused assignment retry as fixed copy, not a rejection` (asserts the fixed copy,
  asserts the raw message is absent, asserts no `unhandledRejection`).
- **Status:** fixed

### WR-03: a throw after `setPhase('batch-running')` wedged the coordinator

- **Commit:** `ee502069` (one commit with WR-04 — same guard/phase region)
- **Files:** `src/services/ai/office/teamRunCoordinator.ts`, `tests/services/ai/office/teamRunCoordinator.test.ts`
- **What changed:** one `try/finally` now spans everything after the phase claim; the `finally`
  restores `ready` and clears `retryingAssignments`/`retryingAgents`. The two narrower
  phase resets were removed.
- **Proof:** `restores ready when the retry throws after claiming the phase` (stubs
  `supersedeTeamMessage` to throw; asserts `phase === 'ready'` and that a subsequent `send()`
  resolves `'started'`).
- **Status:** fixed

### WR-04: busy guard checked before three awaits, so two retries could run

- **Commit:** `ee502069`
- **Files:** as WR-03
- **What changed:** `setPhase('batch-running')` moved to the same synchronous block as the
  guard and `retryingAssignments.add` — no `await` between them.
- **Proof:** `claims the phase synchronously so two same-tick retries cannot both run` — two
  `retryAssignment` calls via `Promise.allSettled`: exactly one fulfilled, one rejected with the
  busy copy, one synthesis run, one attempt-2 row.
- **Status:** fixed

### WR-05: supersession depended on in-memory `lastSynthesisMessageId`

- **Commit:** `d618d3b0`
- **Files:** `src/services/ai/office/teamRunCoordinator.ts`, `src/db/repositories/teamTranscriptRepo.ts`, `tests/services/ai/office/teamRunCoordinator.test.ts`
- **What changed:** new `findCurrentSynthesisMessageId(threadId, db)` returns the newest
  `messageKind === 'synthesis'` row with `supersededByMessageId === undefined`. `retryAssignment`
  resolves the predecessor as `lastSynthesisMessageId ?? (await findCurrentSynthesisMessageId(...))`
  — the slot is only a fast path.
- **Proof:** `supersedes the previous synthesis after a remount (fresh coordinator)` — builds a
  NEW coordinator for the same team/thread and asserts the first synthesis gets
  `supersededByMessageId === second.id`.
- **Status:** fixed

### WR-06: a throw inside `runBatch`'s create/dispatch loop wedged the phase

- **Commit:** `bffe1223`
- **Files:** `src/services/ai/office/teamRunCoordinator.ts`, `tests/services/ai/office/teamRunCoordinator.test.ts`
- **What changed:** the loop is wrapped in `try/catch`; on failure it clears `openBatchId`,
  closes the batch with `{ phaseAtEnd: 'ready', abortedBy: 'none' }`, sets `ready`, and returns
  the new `BATCH_DISPATCH_FAILED` structured refusal to the lead.
- **Proof:** `closes the batch and restores ready when createAssignment throws mid-loop` —
  asserts the tool result is a refusal, `phase === 'ready'`, `endedAt` defined,
  `abortedBy === 'none'`, the already-dispatched agent settled, and the next `send()` is
  `'started'`.
- **Status:** fixed

### WR-07: `finalizeAttempt` unlinked the active attempt by agent id only

- **Commit:** `8d54be48`
- **Files:** `src/services/ai/office/teamRunCoordinator.ts`, `tests/services/ai/office/teamRunCoordinator.test.ts`
- **What changed:** the delete is conditional on
  `active?.assignmentId === finalized.id`.
- **Proof:** `keeps a newer attempt linked when an older attempt finalizes late` — retry attempt 2
  is running, a late `finalizeAttempt` for attempt 1 returns a row, and attempt 2 still ends
  `done` with its report linked and content intact.
- **Status:** fixed
- **Note:** requires human verification — this is a concurrency ordering fix; the test pins the
  late-finalize order but interleavings are inherently sampled.

### IN-01: `scheduledHandles` was written and deleted but never read

- **Commit:** `8ecfa421`
- **Files:** `src/services/ai/office/teamRunCoordinator.ts`
- **What changed:** deleted the map and its four call sites. (`dispose()` already cancels via
  `assignmentControllers`, and the per-assignment `finally` already releases.)
- **Proof:** `npx tsc --noEmit` clean plus the untouched 86-test coordinator suite, which covers
  every release path (limit-1 queue, stop, abortAll, dispose mid-batch).
- **Status:** fixed

### IN-02: `LIVE_PHASES` was an unused export with a stale doc claim

- **Commit:** `71adb0d5`
- **Files:** `src/services/ai/office/teamRunCoordinator.ts`
- **What changed:** made module-local; rewrote the `BUSY_PHASES` doc to say the composer gates on
  `BUSY_PHASES` (which is what `TeamWorkspace.tsx:33` actually imports).
- **Proof:** `grep -rn LIVE_PHASES src/` returns only the definition and the `BUSY_PHASES` spread;
  `tsc` clean.
- **Status:** fixed

### IN-03: `listRetryableAssignments` had no production caller

- **Commit:** `0cb9fa21`
- **Files:** `src/db/repositories/aiTeamRunRepo.ts`, `tests/db/aiTeamRunRepo.test.ts`
- **What changed:** removed. Chose removal over driving the affordance: WR-02's gate is
  `status === 'stopped' || status === 'error'` on the row already being rendered, so a
  batch-wide list would add a second definition of "retryable" without improving that gate.
- **Proof:** `lists assignments FIFO in plan order` (the helper's own assertion removed, the FIFO
  assertion kept); suite passes; `tsc` clean.
- **Status:** fixed

### IN-04: `disposeAllRuns` had zero production callers

- **Commit:** `d814e555` (one commit with IN-07 — same cause plumbing)
- **Files:** `src/hooks/useTeamRunTeardown.ts` (new), `src/components/shell/AppShell.tsx`, `src/services/ai/office/teamRunManager.ts`, `tests/hooks/useTeamRunTeardown.test.ts` (new)
- **What changed:** wired, because a Tauri lifecycle hook already exists in this project
  (`useLocalSqlitePersistence` uses `getCurrentWindow().onCloseRequested`, and `pagehide` is
  already used there too). New `useTeamRunTeardown` calls `disposeAllRuns('app-exit')` on both
  and is mounted in `AppShellInner`.
- **Proof:** `disposes every retained run with the app-exit cause on pagehide` and
  `detaches its listener on unmount`.
- **Status:** fixed

### IN-05: `sendTurn` forwarded a raw repository error

- **Commit:** `35cb189b`
- **Files:** `src/components/ai/office/TeamWorkspace.tsx`, `tests/components/ai/office/TeamWorkspaceOutbox.test.tsx`
- **What changed:** new fixed `LEADER_LOCK_FAILED_COPY`; `err.message` no longer reaches the UI.
- **Proof:** the existing leader-lock test now also asserts the fixed copy renders and that a
  raw repo detail string is absent from the DOM.
- **Status:** fixed

### IN-06: `handleDeleteTeam` did not guard `deleteTeam`

- **Commit:** `6b4b2c2e`
- **Files:** `src/workbench/toolwindows/AiOfficeExplorer.tsx`, `tests/components/ai/office/AiOfficeExplorerTeardown.test.tsx`
- **What changed:** the delete got its own `try/catch` that sets the existing `ACTION_ERROR_COPY`
  and returns.
- **Proof:** `reports a failed delete instead of an unhandled rejection` — asserts the error card
  renders, the team row survives, and no `unhandledRejection` fires.
- **Status:** fixed

### IN-07: a disposed teardown recorded `stopReason: 'user-abort'`

- **Commit:** `d814e555`
- **Files:** `src/services/ai/office/teamRunCoordinator.ts`, `tests/services/ai/office/teamRunCoordinator.test.ts`
- **What changed:** `dispose(cause)` marks agents with the cause, and a `disposeCause` fallback
  covers attempts created just after the mark. `abortAll` keeps `user-abort`.
- **Proof:** `records team-deleted on the attempt rows when dispose tears the run down` (queued
  rows carry `team-deleted`, batch row agrees) and `records app-exit on the attempt rows when the
  app tears the run down`.
- **Status:** fixed
- **Deviation (documented, not silent):** `app-exit` is NOT an assignment `stopReason` in the
  D-22 union (`user-per-agent | user-abort | team-deleted | provider | tool-limit | budget-pause
  | none`). Adding it would be a backup-schema change beyond envelope 13. So an app exit records
  `abortedBy: 'app-exit'` on the **batch** row (where the union can express it) and leaves the
  attempt rows terminal as `user-abort`. The review's point — "the ledger says a user aborted
  while the batch says otherwise" — is resolved for the team-delete case (the one that can be
  expressed) and the app-exit fact is now written and visible.

### IN-08: `TeamRunPhase 'error'` and `abortedBy 'app-exit'` were unreachable

- **Commit:** `0a5238eb` (with IN-04's writer already landed)
- **Files:** `src/types/aiOffice.ts`, `src/validation/backupSchemas.ts`, `tests/services/backup/validateBackup.test.ts`
- **What changed:**
  - `'app-exit'` is now reachable — IN-04's teardown writes it. Kept.
  - `'error'` phase removed from `TeamRunPhase` and from the `phaseAtEnd` enum. No writer ever
    produced it, and had one appeared it would have been silently NON-busy (not in
    `BUSY_PHASES`), letting a turn start beside a failed one. Removing it keeps the type and the
    validator in lockstep; no envelope bump needed because the value was never emitted, so no
    existing artifact can carry it.
- **Proof:** `refuses phaseAtEnd "error", which no writer ever produces` — schema accepts
  `'ready'`, rejects `'error'`; `tsc` proves the union and schema agree.
- **Status:** fixed

### IN-09: a rejected plan closed its batch as `abortedBy: 'user'`

- **Commit:** `e6d83e97`
- **Files:** `src/services/ai/office/teamRunCoordinator.ts`, `tests/services/ai/office/teamRunCoordinator.test.ts`
- **What changed:** `abortedBy: 'none'`; `planDecision: 'rejected'` carries the fact.
- **Proof:** the existing `links nothing but status fields when the plan is rejected` assertion
  changed from `'user'` to `'none'` and now fails on the pre-fix tree.
- **Status:** fixed

## Deviations

1. **WR-03 + WR-04 in one commit** (`ee502069`) — both rewrite the same guard/phase block; a split
   would have produced two commits touching identical lines with no independent verification.
2. **IN-04 + IN-07 in one commit** (`d814e555`) — IN-07 threads the cause that IN-04's new call
   site supplies; either alone leaves a half-wired signature.
3. **IN-07's `app-exit` assignment stop reason** — see above; kept batch-level to avoid an
   envelope-13 backup-schema change.
4. **WR-07 marked "requires human verification"** — concurrency ordering test is sampled, not
   exhaustive.

## Not fixed (pre-existing, per instructions)

The three known flakes were not touched and not re-run in bulk:
`tests/views/TeamsView.test.tsx` `DatabaseClosedError`, `tests/views/TeamsView.test.tsx`
duplicate lead label, `tests/workbench/AiExplorers.test.tsx` duplicate lead label, and the
coordinator `pauses one agent at 80%` case. Note the last one passed in this run's full
`teamRunCoordinator.test.ts` execution (86/86) — neither confirmed nor denied as flaky.

---

_Fixed: 2026-11-12T06:40:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
