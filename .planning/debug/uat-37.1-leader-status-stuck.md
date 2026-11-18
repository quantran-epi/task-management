---
status: diagnosed
trigger: "uat-37.1-leader-status-stuck — leader status stuck running after batch settles; after user cancels leader, subsequent messages produce no visible leader activity"
created: 2026-11-12T00:00:00Z
updated: 2026-11-12T00:00:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: CONFIRMED — a lead turn whose provider call ignores the AbortSignal leaves `ChatTurnRuntime.running` true forever; the coordinator's BUSY phase is never released, so every later submit routes to `steer()` whose lead turn is chained behind the same unresolved promise and whose `TURN_IN_PROGRESS` is swallowed by an empty catch. No lead activity is visible.
test: three scoped probes against the real coordinator + runtime (deleted after use)
expecting: —
next_action: report root cause (goal: find_root_cause_only)

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: After a batch settles (or after the user aborts the leader), the leader's status returns to idle; sending another message starts a visible lead turn.
actual: "Eva đã hoàn thành việc trước khi lệnh hủy tới. Không thể hủy. Muốn giao việc mới hay chạy lại? leader báo như thế này, và sau đó vẫn thấy trạng thái leader là đang chạy, tôi thử cancel leader, sau đó thì đưa ra thêm yêu cầu, nhưng không thấy trạng thái leader hoạt động nữa, có vẻ bị lỗi."
errors: None reported in console.
reproduction: Test 1 in .planning/phases/37.1-live-steering-leader-amends-assignments-and-steers-running-a/37.1-UAT.md — run a 3-agent batch in Tauri, send "huỷ việc của B" mid-run, then cancel the leader, then send another message.
started: Discovered during UAT of phase 37.1.

## Eliminated
<!-- APPEND only - prevents re-investigating -->

- hypothesis: The steer row is persisted but never drained, so the leader silently ignores the message.
  evidence: `steer()` persists unconditionally and returns `'steered'`; `runLeadSteerTurn` is invoked (`teamRunCoordinator.ts:1507/1523/1527` pre-edit numbering). Probe 1 showed the steer row IS persisted and `pendingSteerMessageIds` grows to 1 — the turn just never runs.
  timestamp: 2026-11-12
- hypothesis: `onBatchSettled`'s ledger poll parks forever, leaving the batch open.
  evidence: The poll is bounded (`settlePollDeadlineMs`, default 120 s) and the deadline branch finalizes stuck rows. Probe 1 reached `lead-synthesizing` in <1 s, so the poll is not the blocker.
  timestamp: 2026-11-12
- hypothesis: `settleAgent`'s identity guard drops the lead's settle, so the lead stays `running` in the snapshot.
  evidence: Probe 1: after `stopAgent(lead.id)` the snapshot status correctly flipped to `stopped`, yet the phase stayed `lead-synthesizing` and the next send produced no lead model call. The UI status is not the blocker; the phase + runtime `running` flag are.
  timestamp: 2026-11-12
- hypothesis: The team turn (`team:<teamId>`) is left registered forever, so the top-bar indicator lies.
  evidence: Probe 1: after `abortAll()` the team turn reached `complete` within 800 ms. The team turn is not the stuck object — the LEAD turn is.
  timestamp: 2026-11-12

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-11-12
  checked: `chatTurnRuntime.ts:212-219` (`abort`), `:222-224` (`start` guard), `:518-524` (`finally`)
  found: `abort()` only calls `controller.abort()` and `publish('aborted')`. `running` is cleared ONLY in `start()`'s `finally` when the awaited `deps.runLoop(...)` settles. If the loop never settles, `running` stays `true` and every later `start()` throws `TURN_IN_PROGRESS`.
  implication: The runtime has no "aborted means free" transition; abort is advisory to the provider, not authoritative for the runtime.

- timestamp: 2026-11-12
  checked: `nineRouterClient.ts:184-199` (Tauri branch) and `src-tauri/src/ai_proxy.rs:77-134`
  found: In Tauri, `streamChatEvents` awaits `tauriInvoke('ai_proxy_request')`, which buffers the whole HTTP response in Rust. The turn's `AbortSignal` is never passed to the command, and the Rust command has no timeout. The 90 s `AbortSignal.timeout` exists only on the non-Tauri branch (`:524-527`, `:683-686`).
  implication: A slow/stalled provider call in Tauri is genuinely unabortable from the UI — the exact precondition for the stuck runtime.

- timestamp: 2026-11-12
  checked: PROBE 3 (`createChatTurnRuntime` alone, loop that ignores its signal)
  found: After `abort()`: `isRunning() === true`, `getStatus() === 'aborted'`. A second `start()` throws `TURN_IN_PROGRESS`. Only after the ignored promise resolves does `isRunning()` become false.
  implication: Confirms the runtime-level defect in isolation, with no coordinator involved.

- timestamp: 2026-11-12
  checked: PROBE 1 (full coordinator, 3-agent batch, synthesis turn parked on a non-abortable gate)
  found: `phase=lead-synthesizing`, `leadStatus=running`, lead calls `['dispatch','synthesis']`. After `stopAgent(lead.id)`: `leadStatus=stopped` but `phase` still `lead-synthesizing`. Second `send('việc mới')` resolved `'steered'`, phase unchanged, `pendingSteers=1`, and NO new lead model call. Only after releasing the parked synthesis did the queued steer turn run.
  implication: Reproduces the user's report exactly: leader looks stopped, next message produces no visible lead activity.

- timestamp: 2026-11-12
  checked: PROBE 1 second half (`abortAll()` then a third send)
  found: `abortAll()` set phase `ready` and finished the team turn, but the third `send()` stayed PENDING past 300 ms with `leadCalls` unchanged and the team turn re-registered as `preparing`.
  implication: `abortAll` releases the phase but NOT the lead runtime — the new turn is appended to `leadTurnChain` behind the still-unresolved synthesis turn, so the composer appears dead.

- timestamp: 2026-11-12
  checked: `teamRunCoordinator.ts:486`, `:614-616` (`leadTurnChain` / `runLeadTurnSerialized`), `:2206` (`send` → chain), `:1664` (`runLeadSteerTurn` → chain), `:2746` (synthesis → chain)
  found: ONE module-lifetime promise chain serializes every lead turn. A task that never settles blocks every later lead turn permanently — there is no timeout, no cancellation, no chain reset.
  implication: The chain turns one unabortable provider call into a permanent, silent lead lockout.

- timestamp: 2026-11-12
  checked: `teamRunCoordinator.ts:295-300` (`BUSY_PHASES`), `:2137` (`send` routing)
  found: `BUSY_PHASES` includes `lead-thinking`/`lead-synthesizing`. While the phase is BUSY, every submit is routed to `steer()` and never starts a new lead turn.
  implication: The stuck phase is what converts the stuck runtime into "no leader activity at all".

- timestamp: 2026-11-12
  checked: `teamRunCoordinator.ts:1746-1748` (steer-turn `catch`)
  found: `} catch { /* a steer turn must never break the batch; the ids stay pending */ }` — the `TURN_IN_PROGRESS` throw from `registry.get(lead.id).start(request)` is swallowed with no user-visible signal, no retry, no phase change.
  implication: The failure is completely silent, matching "no errors in console, no leader activity".

- timestamp: 2026-11-12
  checked: `teamRunCoordinator.ts:3007-3035` (`stopAgent`), `:3051-3085` (`abortAll`)
  found: `stopAgent` calls `registry.abort(agentId)` (advisory) and `settleAgent(...)` (UI status only). Neither clears `phase`, and neither can clear the runtime's `running` flag. `abortAll` DOES `setPhase('ready')` but still cannot clear `running`.
  implication: The user's "cancel leader" action fixes the badge, not the lock.

- timestamp: 2026-11-12
  checked: `tests/services/ai/office/teamRunCoordinator.test.ts` (all lead scripts resolve immediately)
  found: Every harness `runLoop` returns a resolved promise; no test models a loop that ignores its abort signal. The defect is therefore invisible to the whole suite.
  implication: Explains why 166 coordinator tests pass while UAT fails.

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: |
  TWO defects compose into one user-visible failure.

  (A) `ChatTurnRuntime` has no abort-authoritative state transition. `abort()` (chatTurnRuntime.ts:212-219)
  only aborts the signal and publishes `'aborted'`; `running` is cleared exclusively in `start()`'s
  `finally` (chatTurnRuntime.ts:518-524) once `deps.runLoop(...)` settles. In Tauri the loop CANNOT
  settle on abort: `streamChatEvents` awaits `tauriInvoke('ai_proxy_request')`
  (nineRouterClient.ts:184-199), the Rust command buffers the whole response with no timeout and no
  signal (src-tauri/src/ai_proxy.rs:77-134), and the 90 s `AbortSignal.timeout` exists only on the
  non-Tauri branch (nineRouterClient.ts:524-527). PROBE 3: after `abort()`, `isRunning()` is still
  true and a second `start()` throws `TURN_IN_PROGRESS`.

  (B) The coordinator serializes EVERY lead turn on one module-lifetime promise chain
  (`leadTurnChain`, teamRunCoordinator.ts:486, :614-616) used by `send` (:2206), `runLeadSteerTurn`
  (:1664), the synthesis turn (:2746) and `retryAssignment` (:2970). A task that never settles blocks
  the chain permanently. Because `lead-synthesizing`/`lead-thinking` are in `BUSY_PHASES`
  (:295-300), `send()` routes every later message to `steer()` (:2137) instead of starting a turn;
  `runLeadSteerTurn` then hits `TURN_IN_PROGRESS` on the live lead runtime and its `catch`
  (:1746-1748) swallows it with no phase change, no retry and no user-visible error. The steer row is
  persisted and `pendingSteerMessageIds` grows, so the transcript shows the user's message but the
  leader never answers — exactly "không thấy trạng thái leader hoạt động nữa".

  Why the leader looked "still running" first: the synthesis turn is queued behind the dispatch turn
  on the same chain while the dispatch turn is still streaming its final answer, so the lead entry
  legitimately reads `running` after the batch settles. It becomes permanent only through (A).

  Why "cancel leader" did not help: `stopAgent` (:3007) only calls `registry.abort()` (advisory) and
  `settleAgent()` (snapshot status). It cannot clear the runtime's `running` flag and does not clear
  the phase. `abortAll` (:3051) does `setPhase('ready')`, but the runtime stays busy, so the next
  `send()` re-enters the chain and hangs (PROBE 1: third send PENDING past 300 ms).

  This is the SAME root cause as `uat-37.1-leader-stuck-synthesizing`; that session diagnosed it from
  the phase side. This session adds the runtime/chain side and proves it with probes.

fix: (not applied — find_root_cause_only)

  Direction (three independent layers, cheapest first):
  1. Bound the Tauri path so the loop always settles: give `ai_proxy_request` a timeout (or forward
     the turn signal through a cancellable command / abortable handle). Without this, no amount of
     coordinator logic can free the runtime.
  2. Make `abort()` authoritative in `ChatTurnRuntime`: clear `running` (and detach `controller`)
     immediately on abort so a new `start()` can proceed, and let the abandoned loop's late result be
     discarded by the existing `isCurrent(turnId, turnController)` guard (:199-201, :438-441,
     :499-501). This is the minimal runtime fix and is safe because every post-await branch already
     checks `isCurrent`.
  3. Make the coordinator's lead chain fail-open: reset `leadTurnChain` when a lead turn is aborted
     (or race each chained task against the turn's abort), and replace the silent `catch` at :1746
     with a visible outcome (restore the phase and surface a fixed user-facing message) so a refused
     steer turn is never invisible. Optionally drop a BUSY phase when no lead turn is actually live.

verification: (not applied)

files_changed: []
