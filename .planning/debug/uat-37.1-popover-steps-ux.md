---
status: diagnosed
trigger: "uat-37.1-popover-steps-ux"
created: 2026-11-12T00:00:00Z
updated: 2026-11-12T00:00:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: CONFIRMED — three independent gaps: (1) steps truncated in the coordinator at `slice(-6)`; (2) popover body has no max-height/overflow, so it cannot scroll; (3) step objects already carry `at` but the UI never renders it, and there is no expand affordance or per-step detail field.
test: read all three files end-to-end plus the plan/summary that introduced the cap; grepped for every `steps`/`.at` read
expecting: n/a — diagnosis only
next_action: "Return ROOT CAUSE FOUND; no fix applied (goal: find_root_cause_only)"

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: Popover lists every step (no truncation), scrolls when long, each step expands to show detail, each step carries a timestamp.
actual: "pass, nhưng phải show full các step có scroll và expand xem chi tiết được và có timestamp"
errors: None reported.
reproduction: Test 8 in .planning/phases/37.1-live-steering-leader-amends-assignments-and-steers-running-a/37.1-UAT.md — run a long multi-agent batch, open the inline indicator popover.
started: Discovered during UAT of phase 37.1.

## Eliminated
<!-- APPEND only - prevents re-investigating -->

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-11-12T00:00:00Z
  checked: src/services/ai/office/teamRunCoordinator.ts:637-645 (pushStep)
  found: `const next = [...steps, { id: 'step-' + stepSeq, label, at: new Date().toISOString() }]; updateAgent(agentId, { steps: next.slice(-6) });`
  implication: hard truncation to the last 6 steps per agent. Older steps are discarded before they ever reach the UI. This is the "show full các step" gap.

- timestamp: 2026-11-12T00:00:00Z
  checked: .planning/phases/37.1-.../37.1-06-PLAN.md:180, :210, :281 and 37.1-06-SUMMARY.md:27,73,100
  found: the 6-cap was an explicit plan choice ("the popover is a glance, not a log") and is the T-37.1-06-05 DoS mitigation.
  implication: removing the cap outright drops a recorded threat mitigation; a much larger bound + a scroll container keeps the mitigation while satisfying the user.

- timestamp: 2026-11-12T00:00:00Z
  checked: src/components/ai/office/TeamActivityIndicator.tsx:76-115
  found: popover body style is `{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 220 }` — no `maxHeight`, no `overflowY`. Steps render as flat `Typography.Text` with no expand control.
  implication: no scroll possible; no expand possible; nothing else in the repo styles this popover (`grep ant-popover` → 0 hits).

- timestamp: 2026-11-12T00:00:00Z
  checked: src/types/aiOffice.ts:230-248 (AgentLiveStep, AgentRunState)
  found: `AgentLiveStep { id: string; label: string; at: string }` — timestamp field EXISTS and is populated. `AgentRunState.steps?: AgentLiveStep[]`.
  implication: the timestamp requirement needs NO data change. Only rendering.

- timestamp: 2026-11-12T00:00:00Z
  checked: grep for `.at` / `step.at` reads across src/components/ai and src/services/ai
  found: the only occurrence is the write at teamRunCoordinator.ts:643. Nothing reads `step.at`.
  implication: timestamp is captured but never displayed — pure UI omission.

- timestamp: 2026-11-12T00:00:00Z
  checked: src/services/ai/office/teamRunCoordinator.ts:963-980 (onStatus/onToolEvent wiring)
  found: `pushStep(agentId, label)` is called with a label only. `onToolEvent` receives `ChatTurnToolEvent` which already carries `args` (serialized) and `result` (chatTurnRuntime.ts:34-42, emitted at :352-357 and :361-367), but both are dropped.
  implication: there is no detail payload to expand today. Expand-to-detail requires a `detail?: string` on AgentLiveStep + passing `event.args` at the call site — a coordinator/type change, not UI-only.

- timestamp: 2026-11-12T00:00:00Z
  checked: src/components/ai/office/TeamWorkspace.tsx:325-337, :585-591
  found: snapshot is live (`coordinator.subscribe(() => setSnapshot(coordinator.getState()))`), indicator receives `snapshot.agents` directly.
  implication: no plumbing gap; the popover already re-renders on every pushStep.

- timestamp: 2026-11-12T00:00:00Z
  checked: tests/components/ai/office/TeamChatIndicator.test.tsx:113-177
  found: step fixtures already include `at` values; assertions use `toContain` and `indexOf` ordering only. No test asserts the 6-cap or the absence of a timestamp.
  implication: adding timestamps/expand/scroll breaks no existing assertion; the cap itself is untested.

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: |
  Three separate gaps, not one bug:
  (1) Truncation lives in the data layer, not the UI: teamRunCoordinator.ts:644 `steps: next.slice(-6)` discards all but the last 6 steps per agent. The popover faithfully renders whatever it is given.
  (2) No scroll: TeamActivityIndicator.tsx:79 popover body has no maxHeight/overflowY, so a long list grows the popover instead of scrolling.
  (3) Timestamp exists but is unrendered: AgentLiveStep.at (aiOffice.ts:237) is written at teamRunCoordinator.ts:643 and read nowhere; TeamActivityIndicator.tsx:96-98 renders only `step.label`. There is also no expand affordance and no detail field on the step.
fix: ""
verification: ""
files_changed: []
