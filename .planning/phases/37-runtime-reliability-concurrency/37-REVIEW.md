---
phase: 37-runtime-reliability-concurrency
reviewed: 2026-11-12T05:45:00Z
depth: deep
files_reviewed: 33
files_reviewed_list:
  - src-tauri/src/sqlite_persistence.rs
  - src/components/ai/AiChatWidget.tsx
  - src/components/ai/ChatMessageBubble.tsx
  - src/components/ai/ChatMessageList.tsx
  - src/components/ai/office/AgentAttributionRow.tsx
  - src/components/ai/office/TeamSettingsDrawer.tsx
  - src/components/ai/office/TeamWorkspace.tsx
  - src/db/index.ts
  - src/db/repositories/aiTeamRepo.ts
  - src/db/repositories/aiTeamRunRepo.ts
  - src/db/repositories/teamTranscriptRepo.ts
  - src/db/schema.ts
  - src/services/ai/office/scheduler.ts
  - src/services/ai/office/teamPrompts.ts
  - src/services/ai/office/teamRunCoordinator.ts
  - src/services/ai/office/teamRunManager.ts
  - src/services/ai/office/teamTools.ts
  - src/services/backup/exportBackup.ts
  - src/services/backup/restoreBackup.ts
  - src/services/backup/validateBackup.ts
  - src/services/localSqlitePersistence.ts
  - src/types/aiOffice.ts
  - src/types/backup.ts
  - src/types/models.ts
  - src/validation/aiOfficeSchemas.ts
  - src/validation/backupSchemas.ts
  - src/workbench/toolwindows/AiOfficeExplorer.tsx
  - tests/db/aiTeamRunRepo.test.ts
  - tests/services/ai/office/teamRunCoordinator.test.ts
  - tests/services/ai/office/aiTeamRepo.test.ts
  - tests/services/backup/officeBackup.test.ts
  - tests/db/tableListParity.test.ts
  - tests/ai/ChatMessageListAttribution.test.tsx
findings:
  critical: 2
  warning: 7
  info: 9
  total: 18
  necessity: 1
status: issues_found
---

# Phase 37: Code Review Report

**Reviewed:** 2026-11-12T05:45:00Z
**Depth:** deep
**Files Reviewed:** 33
**Status:** issues_found

## Summary

The scheduler itself is sound: every `acquire` is paired with a `finally` release in both dispatch wrappers, `release`/`cancel` are idempotent by monotonic slot id, and a queued assignment's only cancellation channel is its own controller (verified against `scheduler.ts:82-108`, `teamRunCoordinator.ts:1255-1324`, `1673-1705`). `BUSY_PHASES` covers the full `TeamRunPhase` union except the two non-busy states (`idle`, `error`), so the "dropped submit" class is closed. The `diagnosticDetail` boundary holds (export projection `exportBackup.ts:167-174`, restore strip `restoreBackup.ts:193`, snapshot strip, and `strictObject` rejection in `backupSchemas.ts:731-779`), and TS/Rust SQLite lists both name both ledger tables.

Two defects are shipment-blocking. `deleteTeam` does not delete the two new ledger tables, so the app's own next export fails its own validator and can never be restored — reproduced with a focused probe. Separately, the disposed check in `runBatch` exists only at entry, so a delete that lands while the lead is inside `delegate_batch` still opens a batch and starts agents against a deleted team.

The transcript-linking and retry surface is where the rest of the risk sits: the instruction row is stamped `runStatus: 'queued'` and never updated, which renders a permanent "Đang xếp hàng" plus a stop button that stops the lead, and the retry affordance is offered for statuses that `retryAssignment` refuses (whose rejection the only call site discards).

The phase's own Tauri walkthrough (D-27/C-15) remains unperformed by design (WINDOWS entry #10); this review cannot substitute for it.

## Critical Issues

### CR-01: `deleteTeam` leaves `aiTeamBatches` / `aiTeamAssignments` behind, so the next export cannot be restored

**File:** `src/db/repositories/aiTeamRepo.ts:319-338` (transaction table list at `:325`), enforced by `src/services/backup/validateBackup.ts:555-571`
**Issue:** The teardown transaction covers `aiTeams`, `aiTeamMembers`, `aiTeamLinks`, `chatThreads`, `chatMessages`, `chatTabs` — not the two ledger tables added in 37-01/37-05. After any team is deleted, its batch and assignment rows survive and still point at the deleted `teamId` / `threadId`. `exportBackupPayload` exports them; `validateBackupPayload` then rejects the app's own artifact ("AiTeamBatch references teamId … not found in aiTeams", "… threadId … not found in chatThreads"). `restoreBackupPayload` validates before writing (`restoreBackup.ts:312-318`), so the backup is permanently unrestorable. GitHub sync uploads it without validating (`githubSyncService.ts:101`), so the user gets silent backup loss. This is the same class of bug CR-03 already fixed for chat threads.

Reproduced with a focused probe (`tests/db` temporary file, since removed): seed one team + thread + batch + assignment + report message, call `deleteTeam`, then export/validate. Result: `{ batches: 1, assignments: 1 }` remain, and validation returned `valid: false` with exactly the two reference errors above.
**Fix:** Add `db.aiTeamBatches` and `db.aiTeamAssignments` to the `deleteTeam` transaction and delete them by `teamId` / by batch id (the assignment has no `teamId`, so delete via `where('batchId').anyOf(batchIds)`), before `aiTeams.delete(id)`:
```ts
const batchIds = (await db.aiTeamBatches.where('teamId').equals(id).primaryKeys());
await db.aiTeamAssignments.where('batchId').anyOf(batchIds).delete();
await db.aiTeamBatches.where('teamId').equals(id).delete();
```
Add a regression assertion to `tests/services/ai/office/aiTeamRepo.test.ts` ("updates and deletes a team with its child rows") plus an export→validate round trip after a delete.

### CR-02: A dispose/delete that lands after `runBatch`'s entry check still opens a batch and starts every agent

**File:** `src/services/ai/office/teamRunCoordinator.ts:1326-1500` (single `disposed` check at `:1328`; first state write after the awaits at `:1431`/`:1433`)
**Issue:** `runBatch` checks `disposed` once, then awaits `executeTeamTool` (`:1332`), `openBatch` (`:1419`), and per-assignment `createAssignment`/`saveTeamMessage` (`:1443`, `:1462`). `dispose()` cannot cancel that: it aborts `assignmentControllers` (nothing registered yet) and `registry.clear()`s runtimes that do not exist yet, then returns. `runBatch` continues, opens a batch row, sets `openBatchId` **after** dispose already cleared it, creates `queued` attempts, and dispatches them — `scheduler.acquire` resolves (no aborting controller), `registry.get()` creates a fresh runtime in the cleared registry, and each agent writes chat rows into a thread `deleteTeam` is about to delete. Consequences: agent turns run for a team that no longer exists; their report/ledger rows become the orphans CR-01 cannot clean up; and the batch row is never closed (dispose's `closeBatch` already ran against `openBatchId === null`), so `phaseAtEnd`/`endedAt` stay undefined forever. `setPhase` is gated, so nothing in the UI reveals it.

Reachable path: delete a group from the AI Office explorer while the lead is inside the `delegate_batch` tool call (`runBatch` is awaited there, `:690-694`).
**Fix:** Re-check `disposed` after every await in `runBatch` and before dispatching; return `DISPOSED_REFUSAL` (and close any batch this call opened) instead of proceeding:
```ts
const batch = await openBatch(...);
if (disposed) { await closeBatch(batch.id, { phaseAtEnd: 'ready', abortedBy: 'team-deleted' }, db); return DISPOSED_REFUSAL; }
openBatchId = batch.id;
```
Apply the same re-check to `retryAssignment` after `createAssignment`/`acquire` (`:1643`, `:1678`) so a retry cannot start after teardown.

## Warnings

### WR-01: The instruction row carries `runStatus: 'queued'` forever, so the lead's bubble shows a permanent queue badge, a stop button that aborts the leader, and a retry button that throws

**File:** `src/services/ai/office/teamRunCoordinator.ts:1462-1481`; render gate `src/components/ai/ChatMessageBubble.tsx:1201-1215`; `src/components/ai/office/AgentAttributionRow.tsx:80-137`
**Issue:** `saveTeamMessage` for the instruction row passes `batchId`, `assignmentId`, `attemptNo`, `runStatus: 'queued'`, `stopReason: 'none'`. Nothing ever updates those fields: `finalizeAttempt` patches only the *report* row (`:598-607`) and the stamp in `saveMessage` only touches `messageKind === 'report'` rows (`:731-767`). The bubble gate therefore takes `msg.runStatus ?? agentStatus` and renders `AgentStatusRow` for the instruction row permanently, with `status: 'queued'`, `assignmentId` set, and `agent` = the lead. Confirmed with a focused render probe against the real `ChatMessageBubble` (temporary test, since removed) using a row shaped exactly like `runBatch` writes: the output contains "Đang xếp hàng", `agent-stop-<leadId>` and `agent-retry-<assignmentId>`.

Consequences: (a) the queue state is rendered twice — once here and once on the live bubble from `snapshot.agents` (`TeamWorkspace.tsx:613-633`); (b) the badge never clears, including after a remount (it is persisted); (c) clicking the stop button calls `stopAgent(msg.agentId)` = `stopAgent(leadId)`, which aborts the lead's runtime; the lead's loop signal is the `signal` handed to every dispatch (`:1495`), so that one click tears down the whole running batch; (d) the retry button calls `retryAssignment` on a `queued` attempt, which throws (`:1630-1632`).
**Fix:** Do not put attempt-status link fields on the instruction row — keep `batchId`/`assignmentId`/`attemptNo` for pairing, drop `runStatus`/`stopReason`. If the transcript needs the queue state on the instruction row, update it in `finalizeAttempt` alongside the report row and clear it to the terminal value. In `ChatMessageBubble`, additionally require `msg.messageKind === 'report' || msg.messageKind === undefined` before rendering `AgentStatusRow`.

### WR-02: The retry button is rendered for statuses `retryAssignment` refuses, and the only call site discards the rejection

**File:** `src/components/ai/office/AgentAttributionRow.tsx:116-126`; `src/components/ai/ChatMessageBubble.tsx:1209-1213`; `src/components/ai/office/TeamWorkspace.tsx:880`; refusals at `src/services/ai/office/teamRunCoordinator.ts:1617`, `:1622`, `:1630-1632`
**Issue:** `onRetry` is rendered whenever the prop and `assignmentId` exist, with no status gate. Every non-`done` status therefore shows "Chạy lại": `queued` (instruction row, and the live queued bubble), `running`, `paused`, `blocked`, `needs-input`, and a re-rendered `stopped` bubble whose attempt is already superseded-but-not-yet-repainted. `retryAssignment` throws for `disposed`, for a busy phase, and for a non-stopped/error row, and `TeamWorkspace.tsx:880` calls it as `void coordinator.retryAssignment(assignmentId)` with no `.catch`. The user gets no feedback and the app gets an unhandled promise rejection on every such click.
**Fix:** Gate the button to the retryable statuses:
```tsx
{onRetry && assignmentId && (status === 'stopped' || status === 'error') && (<Button …/>)}
```
and give the call site a no-loss outcome: `void coordinator.retryAssignment(id).catch(() => setActionError(RETRY_ERROR_COPY))` (or return a discriminated result like `send()` does).

### WR-03: `retryAssignment` can throw with `phase` left at `batch-running`, wedging the coordinator permanently busy

**File:** `src/services/ai/office/teamRunCoordinator.ts:1663` (phase set) vs `:1707-1733` (throws and the only reset)
**Issue:** After `setPhase('batch-running')` the method awaits `getAssignment` (`:1707`), may throw by design (`:1718-1720`, "source attempt … has no report to supersede"), then awaits `supersedeTeamMessage` (`:1721`) and `collectBatchReports` (`:1727`). The phase is restored to `ready` only inside the `finally` of the `startLeadTurn` block (`:1728-1733`), which none of those statements are inside. Any throw there leaves `phase === 'batch-running'`, which is in `BUSY_PHASES`, so every later `send()` returns `'busy'`: the composer puts each submit in the outbox and the release effect never fires (`TeamWorkspace.tsx:527-538`). The call site drops the rejection (WR-02), so nothing is shown. A source row without `reportMessageId` is reachable (a restored/interrupted attempt, or a row whose own finalize threw and was swallowed at `:1308-1310`).
**Fix:** Wrap everything after `setPhase('batch-running')` in one `try/finally` whose `finally` restores `ready` (and deletes the retry guards), instead of resetting the phase only around the synthesis call.

### WR-04: The busy-phase guard in `retryAssignment` is checked before three awaits, so two retries can run at once

**File:** `src/services/ai/office/teamRunCoordinator.ts:1621-1623` (guard) vs `:1663` (phase set)
**Issue:** Between the guard and `setPhase('batch-running')` there are three awaits (`getAssignment`, `getBatch`, `createAssignment`). Two clicks on two different bubbles in the same turn both pass `BUSY_PHASES.has(phase)`, both create attempt rows, both acquire a scheduler slot, and both run a lead synthesis. The two syntheses then race on `lastSynthesisMessageId` (`:1724-1731`): each captures the same `previousSynthesisId`, each clears it, so one of the two new synthesis rows is never superseded and the transcript shows duplicate current syntheses. `retryingAgents` only protects the same agent, not the same team.
**Fix:** Claim the phase synchronously, before the first await:
```ts
if (retryingAssignments.has(assignmentId)) return;
if (BUSY_PHASES.has(phase)) throw …;
retryingAssignments.add(assignmentId);
setPhase('batch-running');   // now the second call sees busy
```

### WR-05: Re-synthesis supersession depends on an in-memory id, so a retry after a remount/relaunch leaves the old synthesis current

**File:** `src/services/ai/office/teamRunCoordinator.ts:446`, `:734-736`, `:1724-1731`
**Issue:** `lastSynthesisMessageId` is coordinator state and the coordinator is created fresh by `getOrCreateRun` on every workspace mount (`teamRunManager.ts:28-46`); nothing persists it. The retry path only supersedes when `previousSynthesisId !== null` (`:1729`). Retrying a stopped attempt from a previous session — exactly the D-13 use case ("Chạy lại" on a bubble that survived a remount, which WR-08's own summary calls out) — therefore produces a second current synthesis and never marks the first superseded, violating D-12 ("synthesis cũ bị đánh dấu superseded bởi synthesis mới").
**Fix:** Resolve the previous synthesis from the ledger/transcript at retry time (the newest `messageKind: 'synthesis'` row in this thread, `supersededByMessageId === undefined`) instead of from a memory slot; keep the slot only as a fast path.

### WR-06: A throw after `setPhase('batch-running')` inside `runBatch` leaves the phase busy forever and the batch row open

**File:** `src/services/ai/office/teamRunCoordinator.ts:1433-1500`
**Issue:** The dispatch loop awaits `createAssignment` (`:1443`) and `saveTeamMessage` (`:1462`) per assignment. A throw there escapes `runBatch` to the orchestrator, which converts it into a tool-error result (`aiOrchestratorLoop.ts:406-413`) — the lead turn then completes, and `startLeadTurn` only resets `ready` from `lead-thinking`/`lead-synthesizing` (`:1177-1179`), never from `batch-running`. The coordinator is left permanently busy: every submit queues and never dispatches, the batch row has no `endedAt`, and the already-dispatched assignments run with nobody awaiting their results (their rejections are swallowed at `:1496-1498`). The workspace suppresses the widget's own stop control (`turn.status` is hard-coded `'idle'`, `TeamWorkspace.tsx:830-836`), so the phase cannot be cleared from the UI.
**Fix:** Wrap the create/dispatch loop in `try/catch`: on failure, close the batch (`abortedBy: 'none'`), `setPhase('ready')`, and return a structured refusal result to the lead instead of throwing.

### WR-07: `finalizeAttempt` clears the active-attempt link by agent id, so a late finalize of an older attempt can unlink a newer one

**File:** `src/services/ai/office/teamRunCoordinator.ts:636` (`activeAssignmentByAgent.delete(finalized.agentId)`), map set at `:1040-1044`
**Issue:** The map is keyed by `agentId`, and the delete is unconditional on the finalized row being the *current* attempt. `stopAgent` fires its ledger write through a detached `void (async () => …)()` (`:1816-1837`), so attempt 1's finalize can resolve after the agent's next attempt has already registered itself. The delete then removes attempt 2's entry, so attempt 2's runtime report is saved with no link fields and `reportMessageId` is never set (`:737-765`); its terminal `finalizeAttempt(…, 'done', undefined)` then hits the "missing report content" throw (`:574-579`), is caught (`:1077-1107`), and the successful retry is recorded as `error`/`provider` with a sanitized bubble while the real report row sits unlinked in the transcript.
**Fix:** Delete only when the entry still names this attempt:
```ts
const active = activeAssignmentByAgent.get(finalized.agentId);
if (active?.assignmentId === finalized.id) activeAssignmentByAgent.delete(finalized.agentId);
```

## Info

### IN-01: `scheduledHandles` is written and deleted but never read

**File:** `src/services/ai/office/teamRunCoordinator.ts:394`, `:1275`, `:1320`, `:1679`, `:1702`
**Issue:** The map is bookkeeping with no consumer — `dispose()`/`abortAll` cancel through `assignmentControllers`, and `getRunningCount()` reads the scheduler. It cannot detect a leak and cannot release one (the `finally` already does).
**Fix:** Delete the map and its four call sites, or make `dispose()` actually use it and assert emptiness in a test.

### IN-02: `LIVE_PHASES` is an unused export with a stale doc claim

**File:** `src/services/ai/office/teamRunCoordinator.ts:237-253`
**Issue:** The doc says "'is the team working' UI stays on `LIVE_PHASES`", but no UI imports it (only `BUSY_PHASES` is imported, `TeamWorkspace.tsx:33`). The export exists only to build `BUSY_PHASES`.
**Fix:** Make it module-local, or derive the workspace's "working" indicator from it so the claim becomes true.

### IN-03: `listRetryableAssignments` has no production caller

**File:** `src/db/repositories/aiTeamRunRepo.ts:202-208`
**Issue:** Only `tests/db/aiTeamRunRepo.test.ts` calls it; the retry surface reads a single row by id and gates in the UI instead.
**Fix:** Remove it, or use it to drive the retry affordance so dead rows that are no longer the current attempt are not offered.

### IN-04: Generality without instantiation — `disposeAllRuns` has zero production callers

**File:** `src/services/ai/office/teamRunManager.ts:70-74`
**Category:** necessity
**Issue:** The only callers are `tests/services/ai/office/teamRunManager.test.ts` and `tests/components/ai/office/AiOfficeExplorerTeardown.test.tsx`; no app-exit/unload path invokes it (`grep -rn disposeAllRuns src/` returns only the declaration), and consequently no writer ever produces `abortedBy: 'app-exit'` (see IN-08). The helper therefore exists to tear down something nothing tears down at exit.
**Fix:** Either wire it to the Tauri window-close/unload path (which is what makes the function and the `app-exit` enum meaningful), or drop it and let the test use `disposeRun` per team.

### IN-05: `sendTurn` forwards a raw repository error message to the UI

**File:** `src/components/ai/office/TeamWorkspace.tsx:456-461`
**Issue:** `LEADER_LOCK_FAILED` carries `err.message` straight into `InlineApiErrorCard`, while the rest of the phase uses the fixed-copy idiom (`ACTION_ERROR_COPY`, `:83-84`) specifically because repo errors can embed ids.
**Fix:** Use a fixed message and keep the raw text out of the UI.

### IN-06: `handleDeleteTeam` does not guard `deleteTeam`

**File:** `src/workbench/toolwindows/AiOfficeExplorer.tsx:93-101`
**Issue:** The dispose is guarded, but `await deleteTeam(team.id, db)` is not, and `onConfirm={() => handleDeleteTeam(team)}` (`:268`) discards the promise: a delete failure is an unhandled rejection with no `actionError`, after the run has already been torn down.
**Fix:** Wrap the delete in the same `try/catch` and set `actionError`.

### IN-07: A team-deleted / disposed teardown records `stopReason: 'user-abort'` on the attempt rows

**File:** `src/services/ai/office/teamRunCoordinator.ts:1293` and `:1856-1859`; batch records `abortedBy: 'team-deleted'` at `:1910`
**Issue:** The dispatch catch uses `userStopped.get(agentId) ?? 'user-abort'`, so a queued row settled by dispose carries `user-abort`, and `abortAll` writes `user-abort` unconditionally. The ledger then says a user aborted while the batch row says the team was deleted — the `team-deleted` stop reason is never written anywhere.
**Fix:** Thread the actual cause into the finalize call (e.g. a `disposeCause`/`userStopped` default) so dispose writes `team-deleted`.

### IN-08: `TeamRunPhase 'error'` and `abortedBy 'app-exit'` are unreachable states

**File:** `src/types/aiOffice.ts:24-33`, `:127`; no `setPhase('error')` or `abortedBy: 'app-exit'` writer anywhere in `src/`
**Issue:** Both values are declared, validated and backed up but never produced. The `'error'` phase would also be silently non-busy if it ever were produced, letting a new turn start beside a failed one.
**Fix:** Either implement the writers (an app-exit teardown would close the `app-exit` gap) or drop the values before they are relied on.

### IN-09: A rejected plan closes its batch as `abortedBy: 'user'`

**File:** `src/services/ai/office/teamRunCoordinator.ts:1395-1409`
**Issue:** The batch row records `planDecision: 'rejected'` and `abortedBy: 'user'`; a rejection is not an abort, and a later retry or audit reading only `abortedBy` cannot distinguish "user rejected the plan" from "user hit Stop".
**Fix:** Use `abortedBy: 'none'` for a rejection (the decision is already carried by `planDecision`).

---

_Reviewed: 2026-11-12T05:45:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
