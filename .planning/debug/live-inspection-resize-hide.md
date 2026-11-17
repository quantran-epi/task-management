---
status: awaiting_human_verify
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

## Current Focus

- hypothesis: BUG 1 — right rail `Splitter.Panel min="280px"` is an INVALID AntD 6.6.5 limit. `useSizes.getPtg()` does `Number(str.slice(0,-1))/100`, so `"280px"` → `Number("280x")` → `NaN`. The NaN min poisons `fitPtgSizes` (`result[2]=NaN`), producing `flexBasis: NaN` on the rail panel; when the container resizes (left sidebar collapse/reopen, or a resize handle drag) the rail collapses to 0 and cannot be restored. Fix: use numeric px `min={280}` (or `%` string), matching the working left/middle panels.
- bug_class: bohrbug (deterministic layout/state interaction, no timing in report)
- next_action: (a) write focused probe test rendering TeamWorkspace with a fixed-width ResizeObserver container to observe rail panel flexBasis/visibility before and after a container-width change; (b) confirm NaN sizing is the cause. Then apply minimal fix + regression test. BUG 2 (delegate_batch disappearing) to investigate after bug 1.
- test: focused Vitest probe in tests/components/ai/office; assert rail panel width > 0 across container resizes, and Activity affordance can reopen.
- expecting: with `min="280px"` the rail panel flexBasis becomes NaN/0 after resize; with `min={280}` it stays > 0.
- mode: symptoms_prefilled=true, goal=find_and_fix
- kb: no knowledge-base.md — no prior match

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

(none yet)

## Evidence (bug 2 — delegate_batch disappearing)

- 2026-11-17: `startLeadTurn` (teamRunCoordinator.ts:2245) writes `updateAgent(lead.id, { ..., steps: [] })` at line 2326-2331. It is called for BOTH the dispatch turn (`lead-thinking`, where `delegate_batch` tool-call row is upserted via `upsertToolStep`) and the synthesis turn (`lead-synthesizing`, opened later by `onBatchSettled`). The synthesis turn's `steps: []` wipes the lead's `delegate_batch` row.
- 2026-11-17: employee `steps: []` sites (2110 startEmployeeTurn, 3261 createAssignment) reset per employee turn; the employee's `explore_repo` row is written in its own turn and survives because no later employee turn resets it in the reported scenario. Matches symptom (employee row stays, lead row gone).
- 2026-11-17: phase 44 UI-SPEC §"Timeline event rows" defines the timeline as reverse-chronological one-row-per-tool-call history (id-keyed upsert, max 200), i.e. it must survive across the dispatch→synthesis turns of one run. Confirmed `runLeadTurn` (849) wraps `startLeadTurn` and `leadTurnKind` distinguishes 'thinking' vs 'synthesizing'.

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

root_cause: "BUG1: TeamWorkspace right rail Splitter.Panel uses min=\"280px\" (string), which antd 6.6.5 parses as NaN, disabling the min-size clamp so resize/collapse hides the rail irreversibly while activityOpen stays true. BUG2: teamRunCoordinator.startLeadTurn resets `steps: []` on the synthesis turn, wiping the lead's delegate_batch tool-call row from the preceding dispatch turn."
fix: "BUG1: TeamWorkspace.tsx right rail `min=\"280px\"` → `min={280}` (numeric px, avoids antd getPtg NaN). BUG2: teamRunCoordinator.ts startLeadTurn preserves `steps` on the synthesis turn (`...(announcedPhase === 'lead-synthesizing' ? {} : { steps: [] })`) so the lead's delegate_batch tool-call row survives; genuine new lead turns still reset."
verification:
  target_test: { result: pass, note: "3 focused tests pass: delegate_batch preservation (coordinator), numeric-min invariant + Activity affordance invariant (new rail test)" }
  mutation_check: { result: skipped, reason: "Stryker not configured in repo (no stryker config, not in package.json)" }
  no_op_deletion: { result: pass, deletion_justified_by_rca: true, note: "BUG1 is a 1-line prop value fix; BUG2 replaces unconditional `steps: []` with a phase-conditional spread — behavior is narrowed to the true root cause, RCA justifies it" }
  adjacent_tests: { result: pass, suites_run: [AgentActivityPanel.test.tsx, TeamWorkspaceView.test.tsx, teamRunCoordinator.test.ts], note: "All adjacent suites exit 0; coordinator suite 188/188 passed (220s); no newly-broken neighbor" }
  revert_and_reconfirm: { result: pass, bug_returned_on_revert: true, fixed_on_reapply: true, note: "Reverted each fix in turn: both regression tests FAILED (delegate row missing / px-string min matched), reapplied: both PASS" }
  typecheck: { result: pass, note: "npx tsc --noEmit exits 0" }
  guardrail_verdict: accepted
  verification_caveat: "Rail resize fix verified by antd source semantics + static invariant test, not a real browser drag (jsdom has no layout/ResizeObserver); needs real-Tauri UAT confirmation via human-verify checkpoint."
files_changed:
  - src/components/ai/office/TeamWorkspace.tsx
  - src/services/ai/office/teamRunCoordinator.ts
  - tests/services/ai/office/teamRunCoordinator.test.ts
  - tests/components/ai/office/TeamWorkspaceActivityRail.test.tsx
