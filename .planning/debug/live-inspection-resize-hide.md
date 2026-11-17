---
status: verifying
trigger: "Bug UAT phase 44: In TeamWorkspace, the Live inspection right rail resize handle works when the left Stripe/Splitter sidebar is open. Reproduce: open a chat team, confirm right rail resize works, close the left sidebar, then click the Live inspection resize handle. Actual: live inspection panel hides immediately and cannot be reopened. Expected: handle resizes/opens the right rail regardless of left sidebar state; rail must remain reopenable."
created: "2026-11-17"
updated: "2026-11-17"
---

# Debug Session: live-inspection-resize-hide

## Symptoms

- Expected behavior: Clicking/dragging the Live inspection right-rail resize handle resizes or opens the rail regardless of whether the left Stripe/sidebar is open. The rail must remain reopenable.
- Actual behavior: When the left sidebar is closed, clicking the Live inspection resize handle hides the Live inspection panel immediately; it cannot be reopened.
- Error messages: none reported.
- Timeline: discovered during phase 44 real-Tauri UAT after push `ec6bfbd2`; right-rail resize works before closing the left sidebar.
- Reproduction: open a team chat workspace → confirm right rail resize works → close left sidebar → click the Live inspection resize handle → right rail disappears and cannot be reopened.

## Additional UAT symptom after first retention fix (new lead turns)

- Expected behavior: Live inspection Timeline is a cumulative id-keyed tool-call history for the whole team run/phase session; a later lead turn that calls `search_team_history`, `read_team_turn`, etc. must not erase earlier completed tool calls such as `delegate_batch`.
- Actual behavior: with the synthesis reset fix in place, `delegate_batch` survives the immediate synthesis turn, but when the leader subsequently runs another tool turn (search team history / read team turn / etc.), the lead's earlier `delegate_batch` row disappears again.
- Interpretation: resetting `steps: []` on every genuine new lead turn is too aggressive for the panel contract. Retention should be keyed to a new user run/thread (or explicit reset boundary), not merely a new lead tool turn inside the same run.
- Required next investigation: find where `steps: []` is set for each lead dispatch turn and decide the correct retention boundary so Live inspection keeps cumulative history across all turns of a run, while still clearing on a genuinely new user request/thread/team switch or teardown.

## Current Focus

- status: RESUMED after owner's real-Tauri UAT. BUG1 (rail min=280) CONFIRMED FIXED — do not revisit. BUG2 partially fixed: delegate_batch now survives the synthesis turn, but disappears again on a LATER lead tool turn in the same run.
- bug_class: bohrbug (deterministic state reset on a specific code path)
- hypothesis: BUG2 residual — `startLeadTurn` (teamRunCoordinator.ts:2326-2335) still executes `steps: []` for EVERY `lead-thinking` turn. Any subsequent lead turn in the same run (a follow-up user message steered into a new `lead-thinking` turn, e.g. after search_team_history/read_team_turn) wipes the cumulative timeline. The phase-44 UI-SPEC §"Timeline event rows" (line 141) defines the timeline as reverse-chronological id-keyed one-row-per-tool-call history bounded by MAX_LIVE_STEPS; retention must be per coordinator session (one coordinator = one team+thread via getOrCreateRun), NOT per lead turn. The correct boundary: do NOT reset `steps` on any lead turn; the timeline lives for the lifetime of the coordinator (disposed on team switch / thread change / teardown). Employee `steps: []` resets at 2110/3265 are per-employee-attempt and do not affect the lead's delegate row.
- test: extend the `tool event upsert` describe block in teamRunCoordinator.test.ts with a regression: one `lead-thinking` turn records delegate_batch, a SECOND `lead-thinking` turn (simulating the follow-up tool turn) records search_team_history — assert BOTH rows present in the lead's steps. Plus keep existing new-run/reset contract test if one exists.
- expecting: current code drops the delegate row after the second lead turn (RED); after removing the unconditional reset, both survive (GREEN).
- next_action: (1) confirm current per-turn reset is the only lead-steps writer beyond upsert (grep evidence above); (2) write the RED regression test; (3) remove the `steps: []` reset from startLeadTurn so steps accumulate for the coordinator's lifetime; (4) run focused tests + typecheck + guardrail signals; (5) commit relevant source/test/debug files only.
- kb: no knowledge-base.md — no prior match
- constraints: branch feature/intellij-workbench only; do NOT stage unrelated pre-existing uncommitted files; do NOT run full suite (use focused tests); commit c3fe64d2 already holds BUG1 + first BUG2 fix.

## Structured Reasoning Checkpoint (BUG2 residual — whole reset policy)

reasoning_checkpoint:
  hypothesis: "startLeadTurn's unconditional `steps: []` on every lead-thinking turn (teamRunCoordinator.ts:2334) clears the lead's cumulative id-keyed tool-call history. The phase-44 Timeline contract is cumulative for one coordinator session (one team+thread), so no lead turn should reset steps; the coordinator's lifetime IS the new-run/thread/team boundary (getOrCreateRun disposes+recreates on thread change/team switch/teardown), and a fresh coordinator starts with empty agent state. Remove the lead steps reset entirely; upsertToolStep + MAX_LIVE_STEPS keep history cumulative and bounded."
  confirming_evidence:
    - "RED test: delegate-call present after lead turn 1, absent after lead turn 2 (assertion line 7374 returned false) on unfixed code."
    - "grep of all `steps: []` writers: 2110/3265 are per-employee-attempt (emp rows, do not touch lead delegate row); 2334 is the sole lead writer that clears on a NON-synthesis turn."
    - "UI-SPEC line 141: timeline is reverse-chronological one-row-per-tool-call id-keyed history, max 200 (MAX_LIVE_STEPS) — no per-turn reset in the contract."
    - "teamRunManager.getOrCreateRun disposes old coordinator when threadId changes; a new thread/team/teardown yields a fresh coordinator with empty state, so no in-turn reset is needed to clear on a genuine new run."
  falsification_test: "After removing the lead steps reset, if either (a) the delegate-call row still vanishes after a second lead turn, or (b) an established 'new run resets timeline within one coordinator' contract exists and a test fails, the hypothesis is wrong and an explicit new-run boundary marker is required."
  fix_rationale: "Removes the root cause (steps cleared on a lead tool turn inside one run) rather than special-casing synthesis. History now accumulates for the coordinator session, bounded at 200, matching the UI-SPEC; clearing happens naturally at the real boundaries (thread change / team switch / dispose) via coordinator replacement."
  blind_spots: "Need to confirm no test expects a within-coordinator timeline reset on plain new user send; grep found none. Real-Tauri multi-tool-turn UAT still needed for final human confirmation. Employee per-attempt resets left unchanged (they are the employee's own attempt history, not the lead timeline)."
  candidate_causes:
    - "code: unconditional `steps: []` in startLeadTurn wipes cumulative lead history on each thinking turn (CONFIRMED)"
    - "data: tool-event upsert drops the row on result/cap — RULED OUT (id-keyed, RED shows row present after turn 1, only removed by the reset on turn 2)"
    - "config: MAX_LIVE_STEPS=200 cap evicting the row — RULED OUT (only 2 rows in repro, far below cap)"
    - "environment: Tauri-only timing/state — RULED OUT as root (deterministic in jsdom RED test)"
  and_gate: "No — the single `steps: []` reset on a lead-thinking turn fully accounts for the symptom; no second co-occurring condition required."

## Additional UAT symptom (added while session active)

- Expected behavior: after a team turn completes, the Live inspection timeline keeps every tool call from the turn, including the lead's `delegate_batch`.
- Actual behavior: during the run the lead's `delegate_batch` row is visible, but after the turn completes only the employee's `explore_repo` row remains; `delegate_batch` disappears from the timeline.
- Concrete example from owner: Modric (lead) `delegate_batch` disappears after the turn; Vidic (employee) `explore_repo` remains.
- Timeline: discovered in the same real-Tauri UAT session after push `ec6bfbd2`.
- Reproduction: run a team turn where the lead calls `delegate_batch` and an employee calls `explore_repo`; watch the Live inspection timeline during the run and again after the run settles.
- Investigation hint: check per-agent step reset/replacement at turn completion (`settleAgent`, batch-settled synthesis, synthesis turn handling) versus the call/result upsert introduced in phase 44. The lead's dispatch turn may be cleared when the synthesis turn resets agent state; employee rows survive. Treat this as the same debug scope: Live inspection must preserve completed tool-call history for all agents in the run.

## Evidence

- 2026-11-17: read TeamWorkspace.tsx; right rail is `{activityOpen ? <Splitter.Panel defaultSize="28%" min="280px" max="50%">...} : null}` (line 1053); `activityOpen` toggled only by Activity affordance (true) and panel Close (false). Splitter resize handlers do not touch `activityOpen`.
- 2026-11-17: read AgentActivityPanel.tsx — presentational; owns no open/resize state. `ACTIVITY_RAIL_ID` shared for aria-controls.
- 2026-11-17: antd 6.6.5 `useSizes.getPtg(str)=Number(str.slice(0,-1))/100`. Executed: `getPtg("280px")` → **NaN**; `getPtg("50%")` → 0.5. Left panel uses numeric `min={260} max={380}` (valid); middle panel has no min. Only this rail (and AgentControlView panels) use px-strings.
- 2026-11-17: `fitPtgSizes` computes `totalMin` including NaN → NaN, and `result[2] = Math.min(max, Math.max(NaN, size))` → NaN. NaN percentage flows to `postPxSizes` → `panelSizes` → `InternalPanel flexBasis: NaN`. A container-width change (sidebar collapse) recomputes this, collapsing/hiding the rail with no React-state path to restore.

## Eliminated

- hypothesis: "Prior synthesis-only guard (`...(announcedPhase === 'lead-synthesizing' ? {} : { steps: [] })`) is sufficient to keep delegate_batch across the run."
  evidence: "Owner's real-Tauri UAT: delegate_batch survives synthesis but disappears on a later lead tool turn (search_team_history/read_team_turn). New RED test confirms: delegate-call present after turn 1, gone after turn 2 (expect(...===true) returns false at test line 7374). The `steps: []` still fires for every lead-thinking turn."
  timestamp: "2026-11-17"

## Evidence (bug 2 — delegate_batch disappearing)

- 2026-11-17: `startLeadTurn` (teamRunCoordinator.ts:2245) writes `updateAgent(lead.id, { ..., steps: [] })` at line 2326-2331. It is called for BOTH the dispatch turn (`lead-thinking`, where `delegate_batch` tool-call row is upserted via `upsertToolStep`) and the synthesis turn (`lead-synthesizing`, opened later by `onBatchSettled`). The synthesis turn's `steps: []` wipes the lead's `delegate_batch` row.
- 2026-11-17: employee `steps: []` sites (2110 startEmployeeTurn, 3261 createAssignment) reset per employee turn; the employee's `explore_repo` row is written in its own turn and survives because no later employee turn resets it in the reported scenario. Matches symptom (employee row stays, lead row gone).
- 2026-11-17: phase 44 UI-SPEC §"Timeline event rows" defines the timeline as reverse-chronological one-row-per-tool-call history (id-keyed upsert, max 200), i.e. it must survive across the dispatch→synthesis turns of one run. Confirmed `runLeadTurn` (849) wraps `startLeadTurn` and `leadTurnKind` distinguishes 'thinking' vs 'synthesizing'.

- 2026-11-17 (resume): all lead `steps` writers enumerated — `upsertToolStep` (947, id-keyed, MAX_LIVE_STEPS cap), `pushStep` (889, label-only compact popover), and `startLeadTurn` (2334, the unconditional reset). Employee resets at 2110/3265 touch employee rows only, never the lead's delegate row.
- 2026-11-17 (resume): new-run/thread/team boundary is concrete — `getOrCreateRun` (teamRunManager.ts:28-46) disposes the old coordinator when threadId changes; team switch uses a different runKey (`db.name:teamId`); dispose()/disposeRun() are teardown. A fresh coordinator has empty agent state, so no in-turn reset is needed to clear the timeline on a genuine new run.
- 2026-11-17 (resume): RED confirmed — added regression test "keeps cumulative tool-call history across a later lead-thinking turn": on unfixed code, `delegate-call` present after lead turn 1, gone after lead turn 2 (assertion line 7374 false). Root cause directly observed.
- 2026-11-17 (resume): GREEN after fix — removed `steps: []` from startLeadTurn entirely (no reset on ANY lead turn). All 3 retention tests pass: synthesis preservation, later lead-thinking turn, fresh-session empty timeline. Typecheck exits 0. Adjacent AgentActivityPanel + TeamWorkspaceActivityRail suites pass (15/15).
- 2026-11-17 (resume): Timeline filters label-only steps — `AgentActivityPanel.toTimelineRow` (line 134) drops rows with no `toolName` and no `phase`, so a plain lead turn's compact-popover status row never renders as a tool-call row. This is why the fresh-session test asserts on tool rows, not raw step count.

## Structured Reasoning Checkpoint

reasoning_checkpoint:
  hypothesis: "Two independent deterministic causes. BUG1: `min=\"280px\"` is parsed by antd getPtg() as NaN, disabling the rail panel's min-size clamp so a resize/collapse drives it to 0 and `activityOpen` stays true (Activity button no-op). BUG2: `startLeadTurn` resets `steps: []` on the synthesis turn, wiping the lead's id-keyed `delegate_batch` tool-call row written during the dispatch turn."
  confirming_evidence:
    - "getLimitSize('280px') returns NaN (executed), while getLimitSize(280)=280; left/middle panels use valid numeric px and work."
    - "antd SplitBar disables dragger when nextSize===0 && nextMin; React activityOpen remains true so the affordance cannot restore the rail."
    - "startLeadTurn line 2326 resets steps unconditionally; called for both dispatch and synthesis turns; phase-44 spec says timeline is cumulative id-keyed history."
  falsification_test: "If I change ONLY the rail min to numeric 280 and the lead synthesis reset to preserve prior steps, then (a) the rail panel never collapses below 280px across container resizes and the Activity affordance restores it, and (b) after a real batch turn the lead's delegate_batch row is still present in snapshot alongside the employee's explore_repo. If either still fails, hypothesis is wrong."
  fix_rationale: "BUG1 fix removes the NaN → restores antd's min clamp at the true root (invalid prop), not a symptom workaround. BUG2 fix stops the synthesis turn from calling `steps: []`, preserving cumulative tool-call history the timeline contract requires; keeps the reset on genuine new dispatch turns."
  blind_spots: "jsdom cannot reproduce the real browser ResizeObserver layout math, so the rail fix is verified by antd source semantics + static invariant tests rather than visual drag; need real-Tauri UAT for final confirmation. For BUG2, not yet verified whether chained batches legitimately expect per-batch reset — if so, reset should key on a new user turn, not just non-synthesis."
  candidate_causes:
    - "code: invalid string px min prop parsed as NaN (BUG1)"
    - "code: unconditional steps reset on synthesis turn (BUG2)"
    - "config: antd version-specific prop type strictness — ruled out, antd 6.6.5 documents numeric px min"
    - "data: tool-event upsert might drop delegate row — ruled out, upsert is id-keyed and correct; the row is explicitly cleared by reset"
  and_gate: "No — each bug reproduces independently from a single code defect; no second contributing condition required (left sidebar close merely changes container width, exposing BUG1)."

## Resolution

root_cause: "BUG1: TeamWorkspace right rail Splitter.Panel uses min=\"280px\" (string), which antd 6.6.5 parses as NaN, disabling the min-size clamp so resize/collapse hides the rail irreversibly while activityOpen stays true. BUG2: teamRunCoordinator.startLeadTurn resets `steps: []` on EVERY lead-thinking turn. The first fix only spared the synthesis turn; a subsequent lead tool turn in the same run (search_team_history/read_team_turn) still wiped the lead's cumulative delegate_batch tool-call row. The timeline is cumulative for one coordinator session (UI-SPEC), so ANY per-lead-turn reset is the wrong boundary."
fix: "BUG1: TeamWorkspace.tsx right rail `min=\"280px\"` → `min={280}` (numeric px, avoids antd getPtg NaN). BUG2: teamRunCoordinator.ts startLeadTurn now NEVER resets `steps` on a lead turn (removed the phase-conditional spread entirely). The id-keyed upsertToolStep + MAX_LIVE_STEPS cap keep the timeline cumulative and bounded for the coordinator's lifetime; clearing happens at the concrete boundaries via getOrCreateRun (thread change / team switch / teardown → fresh coordinator with empty state). Added 2 focused regression tests: later lead-thinking turn retains both rows; fresh session starts clean."
verification:
  target_test: { result: pass, note: "BUG2 residual RED confirmed before fix (delegate-call gone after lead turn 2), GREEN after: 3 retention tests pass (synthesis preservation, later lead-thinking turn, fresh session clean). BUG1 rail tests from c3fe64d2 unchanged." }
  mutation_check: { result: skipped, reason: "Stryker not configured in repo (no stryker config, not in package.json)" }
  no_op_deletion: { result: pass, deletion_justified_by_rca: true, note: "BUG2 fix REMOVES the unconditional `steps: []` reset from startLeadTurn — a behavior deletion, but explicitly justified by RCA: the per-turn reset is itself the root cause; history must accumulate. upsertToolStep + MAX_LIVE_STEPS keep the timeline populated and bounded. No assertion weakened; 2 new tests STRENGTHEN coverage." }
  adjacent_tests: { result: pass, suites_run: [AgentActivityPanel.test.tsx, TeamWorkspaceActivityRail.test.tsx, teamRunCoordinator.test.ts], note: "Component suites 15/15 pass; full coordinator test file 190/190 pass (195.87s); no newly-broken neighbor." }
  revert_and_reconfirm: { result: pass, bug_returned_on_revert: true, fixed_on_reapply: true, note: "BUG2 residual reproduced RED on the pre-fix code (assertion line 7374 false with the unconditional reset present); GREEN after removing it. c3fe64d2's BUG1 + first BUG2 fix already had revert evidence." }
  typecheck: { result: pass, note: "npx tsc --noEmit exits 0 after the fix" }
  guardrail_verdict: accepted
  verification_caveat: "Rail resize fix verified by antd source semantics + static invariant test, not a real browser drag (jsdom has no layout/ResizeObserver); needs real-Tauri UAT. BUG2 residual verified in jsdom via tool-event upsert path (same path the Timeline reads); final multi-tool-turn real-Tauri UAT still needed via human-verify checkpoint."
files_changed:
  - src/components/ai/office/TeamWorkspace.tsx
  - src/services/ai/office/teamRunCoordinator.ts
  - tests/services/ai/office/teamRunCoordinator.test.ts
  - tests/components/ai/office/TeamWorkspaceActivityRail.test.tsx
