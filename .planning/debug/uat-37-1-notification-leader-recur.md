---
status: investigating
trigger: "gửi thử nghiệm ok, còn app vẫn chẳng thấy noti đâu . và có 1 lỗi nghiêm trọng lại lặp lại, nhắn tin cho leader, leader báo đang phân tích và treo, không seen"
created: 2026-11-13T07:29:23Z
updated: 2026-11-13T07:29:23Z
---

## Current Focus

hypothesis: Unknown. Notification test works but team notification path fails; leader stalls without seen again. Do not conflate these symptoms.
next_action: Prioritize leader hang only. User confirms Debug Prompt completely empty and DevTools no provider request. Defer OS notification investigation explicitly per user. Trace pre-runLoop awaits and coordinator lifecycle; reproduce before fixing.

## Symptoms

expected: Unfocused Tauri receives team notifications; leader processes ordinary messages and advances seen when consumed.
actual: Native test notification succeeds, group notification still absent after blur; leader stuck analysing with no seen.
timeline: User retest after fa96058b, following earlier e8ce7e4f lag/budget fix. Installed build identity not independently checked.
errors: No new console error supplied.

## Evidence

- Native permission and dispatch test succeeded in user's app. Do not repeat OS permission setup as diagnosis or claim global notification transport unavailable.
- useTeamChatNotifications and workspace currently use document.hasFocus and DOM focus/blur, not Tauri native onFocusChanged/isFocused. Their equivalence on user's runtime is unproven; unit test stubs do not establish native focus behavior.
- Native isFocused() exists in installed @tauri-apps/api/window and invokes plugin:window|is_focused. Existing core:default capability needs verification before using; no need invent custom native command.
- Leader beforeToolRound awaits agent budget and team budget gates BEFORE drainInbox. No seen can occur before those gates, but no evidence yet that this occurrence is a budget pause.
- A leader still in an earlier model/tool request may not drain newly appended message until next round. No seen alone does not prove request never started.

## Constraints

Keep user's current stuck runtime intact. No restart/reset, live DB mutation, provider calls, full suite, commits or pushes in diagnosis. Prior push authorization already consumed by fa96058b. Preserve unrelated untracked files. Treat existing old macOS/PWA notification debug as historical, not evidence for this Tauri occurrence.

## Source-review verification

Delegated report proposed an unresolved leader agentDeferreds wait and ruled out budget/serial queue from displayed verb. Inline verification does NOT support those conclusions: only startEmployeeTurn creates agentDeferreds entries (line 1387), not startLeadTurn; leader optional await at 1643 can therefore resolve immediately when no entry exists. derivePhase checks closed team gate first. Top-up sets paused rows running when both gates open. No reproduced execution showing unresolved leader deferred was provided. Do not apply proposed phase reset as confirmed fix, rule out budget from UI text alone, or rule out serialized previous turn without runtime state.

User further reports DevTools shows NO leader LLM request during stall. This narrows investigation to pre-request/runtime scheduling rather than slow model generation, but does not identify which await. beforeToolRoundFor waits on agent gate, team gate, then DB-backed drainInbox before HTTP; workspace Debug Prompt is recorded before runLoop, so presence/absence of matching prompt distinguishes earlier runtime preparation from round-hook waits. Await native/DOM focus sample and matching Debug Prompt entry/budget state. No new runtime fix applied.

## Reproduced source defect

Independent debugger reproduced retained leader member-budget gate across turns using real coordinator, fake IndexedDB and scripted loop. First turn final usage of 600/750 or 601/750 closes own gate, then turn completes. Next turn resets agent status to running before waiting on still-closed gate. derivePhase requires paused status to expose own closed gate, so UI claims lead-thinking while no inbox drain/provider call occurs. At 599/750 next turn succeeds. Proposed fix publishes paused before round-boundary wait if own/team gate closed; keep accounting and budget policy unchanged. Live incident attribution remains unconfirmed.

Separately coordinator persisted across remount retains old workspace debug callback; local Debug Prompt empty is not reliable evidence that runLoop never started. No callback fix yet.

## Resolution

root_cause: Confirmed by user in live Tauri: budget exceeded 80%; adding tokens immediately resumed leader. Retained closed member gate was hidden because new turn reset status to running and derivePhase only exposed member gate when status paused.
fix: Applied 5-line change in beforeToolRoundFor: publish paused before awaiting closed member/team budget gate. No budget bypass.
verification: Main-worktree baseline 599 passes, 600/601 fail with lead-thinking instead of awaiting-budget. Patched focused coordinator run 7 passed, 129 skipped (budgetGate file entirely skipped by name filter; do not claim it ran). Tests cover boundary, top-up/drain/completion and parked stop. TypeScript noEmit and git diff --check exit 0. Real Tauri retest pending; uncommitted/unpushed.
