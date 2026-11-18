---
status: diagnosed
trigger: "uat-37.1-leader-stuck-synthesizing — After every agent finishes, the leader stays in the 'đang tổng hợp' (synthesizing) state forever. It never reaches done, and the user cannot continue."
created: 2026-11-12T00:00:00Z
updated: 2026-11-12T00:00:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: CONFIRMED — `onBatchSettled` writes `lead-synthesizing` at :2657 while the dispatch lead turn is still in flight and the synthesis turn is serialized behind it at :2670; nothing in the batch path clears the phase if that turn never resolves.
test: traced phase writers, chain, runtime lifecycle, Tauri proxy
expecting: —
next_action: report root cause (goal: find_root_cause_only)

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: Once every agent is terminal, the leader synthesizes once and its turn ends; the phase returns to `ready` and the leader can take a new message.
actual: Leader hangs in "đang tổng hợp" (synthesizing) forever; never done; user cannot continue.
errors: None reported in console.
reproduction: UAT test 9 — run multi-agent batch, wait for all agents, watch leader status.
started: Discovered during UAT of phase 37.1.

## Eliminated
<!-- APPEND only - prevents re-investigating -->

- hypothesis: The settle-poll ledger loop parks forever and the phase stays `batch-running`.
  evidence: The poll is bounded by `settlePollDeadlineMs` (default 120s) at :2514-2524, and the deadline branch finalizes stuck rows (:2532-2605). A hang there would render "đang làm việc", not "đang tổng hợp".
  timestamp: 2026-11-12
- hypothesis: `Promise.all(agentDeferreds)` at :2510 never resolves because a deferred is dropped by `settleAgent`'s identity guard.
  evidence: Every drop path is covered — retired attempts resolve their deferred explicitly (:1320), the amend path settles the replacement (:2043), `stopAgent`/`abortAll`/`dispose` settle without an attemptId (:2972, :3036, :3095). Also, a hang there leaves the phase `batch-running`.
  timestamp: 2026-11-12
- hypothesis: `startLeadTurn`'s synthesis turn runs but its `setPhase('ready')` at :1427 is skipped.
  evidence: :1426 accepts both `lead-thinking` and `lead-synthesizing`; the only skips are the `!lead` return at :1365 and the `paused` return at :1421. The paused return leaves the phase at `lead-thinking` (set at :1417), which renders "đang phân tích", not "đang tổng hợp".
  timestamp: 2026-11-12
- hypothesis: The phase is stuck because `closeBatch`/`findCurrentSynthesisMessageId` throws and the `catch` at :2680 swallows it.
  evidence: Reachable in principle (the `finally` does not reset the phase), but requires a Dexie failure; it is a real second gap, not the observed trigger.
  timestamp: 2026-11-12

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-11-12
  checked: `src/services/ai/office/teamRunCoordinator.ts:2657-2670`
  found: `setPhase('lead-synthesizing')` runs BEFORE `closeBatch`, `findCurrentSynthesisMessageId`, and `await runLeadTurnSerialized(() => startLeadTurn(SYNTHESIS_INSTRUCTION, …))`.
  implication: The phase claims "synthesizing" while the synthesis turn has not started and cannot start until the dispatch turn releases the chain.
- timestamp: 2026-11-12
  checked: `teamRunCoordinator.ts:2482-2489` and `:2118-2141`
  found: `onBatchSettled` is fired with `void` from inside the lead's `delegate_batch` tool call; `batchOwnsTeamTurn = true` makes `send()`'s `finally` skip `finishTurn`.
  implication: The batch settles independently of the dispatch turn, so :2657 executes while the dispatch turn is still streaming its final answer.
- timestamp: 2026-11-12
  checked: `teamRunCoordinator.ts:608-611, 2134, 2670, 1620`
  found: Every lead turn shares one `leadTurnChain`; the synthesis turn is chained behind the dispatch turn, and steer turns chain behind both.
  implication: An unresolved dispatch turn blocks the synthesis turn and every later steer turn.
- timestamp: 2026-11-12
  checked: `teamRunCoordinator.ts:278-293, 2103`
  found: `LIVE_PHASES`/`BUSY_PHASES` include `lead-synthesizing`; `send()` routes any busy phase to `steer()`.
  implication: Once the phase is stuck, the user cannot start a turn — every message becomes a steer.
- timestamp: 2026-11-12
  checked: `teamRunCoordinator.ts:1417-1428, 1365, 1421-1424`
  found: The synthesis turn sets `lead-thinking` at :1417 and only returns the phase to `ready` at :1426-1428 after `start()` resolves. Two early returns (`!lead`, `paused`) skip the reset.
  implication: "đang tổng hợp" persists exactly while the synthesis turn has not started; once it starts the label becomes "đang phân tích".
- timestamp: 2026-11-12
  checked: `teamRunCoordinator.ts:2680-2688`
  found: The `catch` swallows every error and the `finally` only deletes the controller and finishes the team turn — it never resets the phase.
  implication: Any throw in the :2657-2679 block leaves `lead-synthesizing` permanently.
- timestamp: 2026-11-12
  checked: `src/components/ai/office/TeamActivityIndicator.tsx:14-20, 53-68`
  found: The inline line renders the lead's phase verb; `lead-synthesizing` maps to `đang tổng hợp`, and a `running`/`paused` lead is the only way the line appears.
  implication: The observed string requires phase `lead-synthesizing` AND lead status `running` — i.e. the dispatch turn never settled.
- timestamp: 2026-11-12
  checked: `src/components/ai/runtime/chatTurnRuntime.ts:212-219, 506-524`
  found: `abort()` only aborts the controller and publishes `aborted`; `running` is cleared in `start()`'s `finally` after `runLoop` resolves. `start()` rejects `TURN_IN_PROGRESS` while `running` is true.
  implication: A `runLoop` that never resolves leaves the runtime permanently "running"; Stop cannot fix it and every later turn throws.
- timestamp: 2026-11-12
  checked: `src/services/ai/nineRouterClient.ts:184-199, 524-527` and `src-tauri/src/ai_proxy.rs:88-127`
  found: In Tauri, `streamChatEvents` awaits `tauriInvoke('ai_proxy_request')`, which buffers the whole SSE body in Rust. The Rust client sets no timeout and the command receives no AbortSignal. The 90s `AbortSignal.timeout` exists only in `completeJson` (non-Tauri path). The 60s read watchdog only guards reads after the buffered body arrives.
  implication: In the Tauri runtime a stalled provider call is unbounded and unabortable — the concrete trigger for an unresolved lead turn.
- timestamp: 2026-11-12
  checked: `teamRunCoordinator.ts:1052-1088, 1146-1147` and `TeamWorkspace.tsx:608`
  found: A TEAM-gate crossing closes `teamGate` without marking any agent `paused` and sets `awaiting-budget` only if `anyLive()`. The banner renders only when `phase === 'awaiting-budget'`.
  implication: If the lead parks on a closed team gate after the batch settles, :2657 overwrites `awaiting-budget`, the banner unmounts, the lead stays `running`, and the turn parks with no visible affordance — a second, non-network trigger for the same stuck state.

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: |
  `onBatchSettled` advances the phase to `lead-synthesizing` (teamRunCoordinator.ts:2657) before the synthesis turn can run, then awaits the shared serialized lead chain (:2670). The dispatch lead turn is still in flight at that moment (the batch settles independently of it; `batchOwnsTeamTurn` keeps the team turn open, :2483/:2140), so the synthesis turn — and every later steer turn — is queued behind it. Nothing else clears `lead-synthesizing`: `startLeadTurn` only resets it after `start()` resolves (:1426-1428), and `onBatchSettled`'s `finally` (:2683-2688) never resets the phase. Because `lead-synthesizing` is in `BUSY_PHASES` (:282/:289-293), `send()` routes every later message to `steer()` (:2103), whose lead turn is chained behind the same unresolved promise (:1620) and whose failure is swallowed (:1702-1703). The leader is therefore frozen at "đang tổng hợp" and the user cannot continue.

  The dispatch turn fails to resolve because the Tauri runtime has no bound on a lead call: `streamChatEvents` awaits `tauriInvoke('ai_proxy_request')` (nineRouterClient.ts:184-199), the Rust command buffers the entire SSE body with no timeout (ai_proxy.rs:88-127), the 90s `AbortSignal.timeout` exists only on the non-Tauri path (nineRouterClient.ts:524-527), and the turn's AbortSignal is never forwarded to the command. A stalled or over-60s provider call therefore leaves `start()` pending forever, `running` true (chatTurnRuntime.ts:518-524), and Stop ineffective. A closed team budget gate reached after the batch settles produces the same stuck state without any network fault: the turn parks at `beforeToolRound` (:1146-1147), :2657 overwrites `awaiting-budget`, and the banner unmounts (TeamWorkspace.tsx:608).

  Share with other gaps: gap 1 (`uat-37.1-leader-status-stuck`) is the SAME root cause — the unresolved lead turn leaves the lead status `running` and the runtime's `running` flag true, so after Stop every later turn throws `TURN_IN_PROGRESS` and is silently swallowed, which is exactly "no leader activity". Gap 6 (`uat-37.1-leader-not-idle-after-dispatch`) is the SAME lifecycle window in its benign form: after the ack the dispatch turn keeps streaming its final answer while the phase is `batch-running`, so the lead legitimately reads "đang làm việc"; it becomes permanent only through the same unresolved-turn defect. One fix addresses all three.
fix: (not applied — find_root_cause_only)
verification: (not applied)
files_changed: []
