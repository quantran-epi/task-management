---
status: diagnosed
trigger: "uat-37.1-leader-not-idle-after-dispatch — After the leader dispatches a batch, the UI still shows the leader as typing/working. It should go idle immediately because dispatch is event-driven."
created: 2026-11-12T00:00:00Z
updated: 2026-11-12T00:00:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: CONFIRMED — "leader still typing after dispatch" is not a stuck state. `delegate_batch` IS event-driven (the coordinator's lead turn ends at dispatch), but the UI derives the leader's working label from `snapshot.agents[leadId].status` + `snapshot.phase`, not from the lead turn. During `batch-running` the lead's `AgentRunState` is only settled when the *model's* dispatch turn finishes writing its answer — and the orchestration loop keeps running after the tool returns. So the label is honest about the model still generating, but the label's verb ("đang làm việc") is the batch verb, not a lead verb, and it survives the whole dispatch turn.
test: Rendered the real `TeamWorkspace` + `ActiveAiTurnIndicator` against a real coordinator and sampled state/UI every 100 ms across dispatch → batch → synthesis.
expecting: n/a — confirmed
next_action: Report root cause. Do not fix (goal: find_root_cause_only).

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: The lead turn ends as soon as `delegate_batch` returns; the leader's UI status returns to idle while agents keep running (VERIFICATION truth 6).
actual: "tại sao khi leader giao xong việc, nó vẫn có trạng thái typing là đang làm việc nhỉ, tôi tưởng là event driven, giao việc xong nó idle chờ lệnh của user hoặc chờ agent trả kết quả chứ"
errors: None reported.
reproduction: Test 6 in .planning/phases/37.1-live-steering-leader-amends-assignments-and-steers-running-a/37.1-UAT.md — dispatch a multi-agent batch, watch the leader's status right after it says "đã giao".
started: Discovered during UAT of phase 37.1.

## Eliminated
<!-- APPEND only - prevents re-investigating -->

- hypothesis: The team turn (`team:<teamId>`) staying registered through the batch is what the user sees as "leader typing".
  evidence: The status-bar capsule renders `TeamOutlined` (no spin) for a team run (`ActiveAiTurnIndicator.tsx:124-133`), and in the probe the single-turn capsule was absent — only the multi-turn capsule ("N thủ tục AI") appeared. The user's "typing" is the inline transcript line, not the capsule.
  timestamp: 2026-11-12

- hypothesis: The lead's `AgentRunState` is left `running` after dispatch (a genuine stuck state / missing settle).
  evidence: Probe sampled `getState().agents` over time: `lead=running` only while the dispatch turn's model call is still in flight; it flips to `done` at t+600 ms in the probe, exactly when the lead turn's `start()` resolves and `settleAgent(lead.id, ...)` runs (`teamRunCoordinator.ts:1425`). No leak.
  timestamp: 2026-11-12

- hypothesis: `batchOwnsTeamTurn` / `send()`'s `finally` fails to finish the team turn, leaving a phantom active turn.
  evidence: `teamRunCoordinator.ts:2140` skips `finishTurn` only when `batchOwnsTeamTurn`; `onBatchSettled`'s `finally` (`:2683-2688`) always finishes it. Probe showed the team turn present during `batch-running` and gone after `ready`. This is the designed D-24 behavior (VERIFICATION truth 9).
  timestamp: 2026-11-12

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-11-12
  checked: `teamRunCoordinator.ts:2249-2490` (`dispatchBatch`) and `:2096-2142` (`send`)
  found: `dispatchBatch` returns the ack at `:2489` and the lead's tool result is delivered there. The coordinator side is genuinely event-driven: `batchOwnsTeamTurn = true` at `:2483`, `void onBatchSettled(...)` at `:2486`, and `send()`'s `finally` at `:2140` deliberately does NOT finish the team turn.
  implication: The coordinator contract matches D-24. The defect is not in the dispatch lifecycle.

- timestamp: 2026-11-12
  checked: `aiOrchestratorLoop.ts:354-477`
  found: When a round yields tool calls, the loop pushes the assistant tool-call message, executes the tool, pushes the tool result, then continues to the NEXT round (`while (loopCount < maxLoops)` at `:225`). `delegate_batch` returning does not end the loop — the model gets another round to write its visible answer ("Đã giao việc..."), and `chatTurnRuntime` only calls `deps.onCompleted` after that final text is saved (`chatTurnRuntime.ts:503-504`).
  implication: The lead's `AgentRunState` legitimately stays `running` until the model finishes speaking, which is AFTER the ack. "Dispatch returned" ≠ "lead turn ended".

- timestamp: 2026-11-12
  checked: `teamRunCoordinator.ts:1410-1428` (`startLeadTurn`) and `:1678-1706` (`runLeadSteerTurn`)
  found: The lead's live state is set to `running` at `:1410-1415` and settled only after `registry.get(lead.id).start(request)` resolves at `:1419` → `settleAgent(lead.id, OUTCOME_STATUS[outcome.phase])` at `:1425`.
  implication: `snapshot.agents[leadId].status === 'running'` for the whole dispatch turn, including the post-tool answer round.

- timestamp: 2026-11-12
  checked: `TeamActivityIndicator.tsx:53-74` (the inline line the user reads as "typing")
  found: `active = agents.filter(status === 'running' || 'paused')` (`:53`); the lead's verb is `PHASE_ACTIVITY_VERB[phase] ?? WORKING` (`:66-67`), and `PHASE_ACTIVITY_VERB['batch-running'] = 'đang làm việc'` (`:17`). So while the lead is still generating its dispatch answer, the line reads "Minh đang làm việc" — the BATCH verb, applied to the LEAD.
  implication: The label is derived from `AgentRunState`, not from the lead turn, and it uses the batch-running verb for the lead.

- timestamp: 2026-11-12
  checked: Live probe — real `TeamWorkspace` + `ActiveAiTurnIndicator` + real coordinator, 100 ms sampling
  found: |
    [t+100ms] phase=batch-running lead=running line="Minh đang làm việc"
    [t+200ms] phase=batch-running lead=running line="Minh đang làm việc · An đang làm việc · Bình đang làm việc"
    [t+600ms] phase=batch-running lead=done   line="An đang làm việc · Bình đang làm việc"
    (agents released) → phase=lead-synthesizing, line="(none)"
    → phase=lead-thinking, lead=running, line="Minh đang phân tích"
    → phase=ready, lead=done, line="(none)"
  implication: Two distinct user-visible windows. (1) The reported one: the lead shows "đang làm việc" for the entire post-ack answer generation, which reads as "leader is still working on the batch". (2) The second, worse one: the synthesis turn re-labels the lead "Minh đang phân tích" even though the lead is only writing a summary — `PHASE_ACTIVITY_VERB['lead-thinking']` is the dispatch verb, and `startLeadTurn` sets `lead-thinking` for BOTH the dispatch turn and the synthesis turn (`:1417`; `onBatchSettled` sets `lead-synthesizing` at `:2657` but `startLeadTurn` immediately overwrites it with `lead-thinking`).

- timestamp: 2026-11-12
  checked: `teamRunCoordinator.ts:2657` vs `:1417`
  found: `onBatchSettled` sets `setPhase('lead-synthesizing')` at `:2657`, then calls `startLeadTurn(...)` at `:2670`, whose body unconditionally sets `setPhase('lead-thinking')` at `:1417`. `lead-synthesizing` is therefore never observable during the synthesis turn — the probe confirms `lead-synthesizing` appears for one sample (~100 ms) and is replaced.
  implication: `PHASE_ACTIVITY_VERB['lead-synthesizing'] = 'đang tổng hợp'` (`TeamActivityIndicator.tsx:18`) is dead code in practice; the lead shows "đang phân tích" while synthesizing. This is a second, independent label defect on the same surface.

- timestamp: 2026-11-12
  checked: `tests/services/ai/office/teamRunCoordinator.test.ts:3582-3621` (`the leader turn ends while agents are still running`)
  found: The test asserts `leadTurnFinished` only after the scripted lead function *returns* (`:3595`), i.e. after the model's answer. It asserts phase and agent statuses, never the lead's `AgentRunState` nor the rendered line.
  implication: The test pins the coordinator contract (truth 6) correctly; nothing pins the UI label, so the mismatch shipped.

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: |
  Not a stuck state — a label-derivation defect. `delegate_batch` IS event-driven: `dispatchBatch` returns the ack (`teamRunCoordinator.ts:2489`), `batchOwnsTeamTurn = true` (`:2483`) hands the team turn to the batch, and `send()`'s `finally` skips `finishTurn` (`:2140`). But the UI never reads the lead turn for the leader's status. It reads `snapshot.agents[leadId].status`, which is set to `running` at `startLeadTurn` (`:1410-1415`) and cleared only when `registry.get(lead.id).start(request)` resolves (`:1419` → `:1425`). Between the ack and that resolution, the orchestration loop is still running: after a tool round it pushes the tool result and loops for another model round (`aiOrchestratorLoop.ts:354-477`), so the model can spend seconds writing "Đã giao việc...". `TeamActivityIndicator` (`:53`, `:66-67`) then renders the lead with `PHASE_ACTIVITY_VERB['batch-running'] = 'đang làm việc'` — the BATCH verb — so the user sees "Minh đang làm việc" alongside the agents and reads it as "the leader is still working on the batch".

  Secondary defect on the same surface: `onBatchSettled` sets `lead-synthesizing` (`:2657`) then `startLeadTurn` overwrites it with `lead-thinking` (`:1417`), so the synthesis turn shows "Minh đang phân tích" instead of "đang tổng hợp"; `PHASE_ACTIVITY_VERB['lead-synthesizing']` is unreachable.

fix: [not applied — goal: find_root_cause_only]
verification: [not applied]
files_changed: []
