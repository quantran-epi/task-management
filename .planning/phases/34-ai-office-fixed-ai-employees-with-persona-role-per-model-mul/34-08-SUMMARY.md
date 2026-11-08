---
phase: 34-ai-office-fixed-ai-employees-with-persona-role-per-model-mul
plan: 08
subsystem: ui
tags: [react, antd, ai-office, attribution, accessibility, aria-live, popconfirm]

requires:
  - phase: 34-ai-office-fixed-ai-employees-with-persona-role-per-model-mul
    provides: AI Office types (`AgentRunStatus`, `AgentIdentity`, `BUDGET_PAUSE_THRESHOLD`), `ChatMessage.agentId/agentName/agentKind`, chat scope `'team'`
provides:
  - AgentAttributionRow / AgentStatusRow / agentColorFor / agentTextColorFor
  - AssignmentPlanCard
  - AgentPausedBanner
  - BudgetTopUpModal
  - ChatMessageBubble agent/agentStatus/onStopAgent props + `agent:` mention target
  - ChatMessageList agentDirectory/agentStatuses/onStopAgent props
  - Team-run capsule with TeamOutlined icon and Popconfirm global stop
affects: [34-09, 34-10, ai-office-team-workspace]

tech-stack:
  added: []
  patterns:
    - "Card IS the wait state: plan card and paused banner render no spinner while parked"
    - "aria-live scoped to one agent bubble's text region, never the transcript container"
    - "Deterministic avatar palette from charCodeSum(agentId) % 6"

key-files:
  created:
    - src/components/ai/office/AgentAttributionRow.tsx
    - src/components/ai/office/AssignmentPlanCard.tsx
    - src/components/ai/office/AgentPausedBanner.tsx
    - src/components/ai/office/BudgetTopUpModal.tsx
    - tests/ai/ChatMessageListAttribution.test.tsx
    - tests/ai/office/AgentOfficeComponents.test.tsx
  modified:
    - src/components/ai/ChatMessageBubble.tsx
    - src/components/ai/ChatMessageList.tsx
    - src/components/ai/ActiveAiTurnIndicator.tsx
    - tests/ai/ActiveAiTurnIndicator.test.tsx

key-decisions:
  - "The agent: mention alternative is appended as the fourth regex branch so match[1..9] indices stay stable (T-34-41)"
  - "AgentStatusRow renders nothing for both done and queued; the row collapses to the existing timestamp/token footer"
  - "Team capsule keeps the active-ai-turn-capsule testid and adds team-run-capsule on the icon wrapper, so existing tests still find it"
  - "BudgetTopUpModal starts with no amount so the confirm is disabled until the user enters at least 1000"

patterns-established:
  - "Wait-state surfaces carry role=status and explicit copy instead of animated placeholders"

requirements-completed: [AIO-MEM-01, AIO-TEAM-01, AIO-BUDGET-02, AIO-BG-01]

duration: 12min
completed: 2026-11-08
---

# Phase 34 Plan 08: Agent Attribution Layer & Transcript-Adjacent Surfaces Summary

**Agent-attributed chat rows with deterministic avatars, per-agent Stop, scoped aria-live streaming, a non-warning plan card, a hang-proof paused banner and a confirmed team-wide stop**

## Performance

- **Duration:** 12 min
- **Started:** 2026-11-08T14:46:00Z
- **Completed:** 2026-11-08T14:58:00Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments

- `AgentAttributionRow` renders avatar + name + role + lead crown above the bubble; `AgentStatusRow` renders the running/paused/stopped/error badge below it with a per-agent Stop for `running` and `paused` only.
- `renderUserMessageWithMentions` gained an `agent:` target rendered as a palette-colored pill; task/CR/system/doc branches are byte-identical and their capture indices are unchanged.
- Agent streaming bubbles carry `aria-live="polite"` + `aria-atomic="false"` on the text region only; the non-agent streaming branch is unchanged.
- `AssignmentPlanCard` uses `colorBgContainer` + a 3px primary left border (never warning), and swaps its buttons for a `role="status"` line after a decision.
- `AgentPausedBanner` is a `role="status"` warning alert with agent/team scope copy and a top-up action; it contains no spinner, shimmer or "Đang xử lý".
- `ActiveAiTurnIndicator` renders a `TeamOutlined` capsule for `team:` turns and wraps the global stop in a `Popconfirm`; the elapsed ticker stays ungated by turn status.
- `BudgetTopUpModal` shows used/budget/80%-threshold rows, enforces `min={1000}` on the confirm and previews `budget + amount`.

## Task Commits

1. **Task 1: Attribution row, status row, aria-live region, mention renderer** — `32fe0325` (test, RED) + `0cf58e96` (feat)
2. **Task 2: Assignment plan card and paused banner** — `828653da` (test, RED) + `6ff787ec` (feat)
3. **Task 3: Team capsule and budget top-up dialog** — `4e4684d9` (test, RED) + `0033a46c` (feat)

## Files Created/Modified

- `src/components/ai/office/AgentAttributionRow.tsx` — avatar/name/role/crown row, `agentColorFor`, `agentTextColorFor`, `AgentStatusRow`
- `src/components/ai/office/AssignmentPlanCard.tsx` — plan confirmation card
- `src/components/ai/office/AgentPausedBanner.tsx` — paused-scope alert
- `src/components/ai/office/BudgetTopUpModal.tsx` — top-up dialog
- `src/components/ai/ChatMessageBubble.tsx` — agent props, attribution/status rows, aria-live region, `agent:` mention
- `src/components/ai/ChatMessageList.tsx` — `agentDirectory` / `agentStatuses` / `onStopAgent` wiring
- `src/components/ai/ActiveAiTurnIndicator.tsx` — team capsule icon + Popconfirm global stop
- `tests/ai/ChatMessageListAttribution.test.tsx`, `tests/ai/office/AgentOfficeComponents.test.tsx`, `tests/ai/ActiveAiTurnIndicator.test.tsx`

## Decisions Made

- Appended the `agent:` regex branch instead of interleaving it, keeping `match[1..9]` stable for the existing branches.
- `AgentStatusRow` returns null for `done` and `queued`; the UI-SPEC only defines badges for running/paused/stopped/error.
- Team capsule keeps `active-ai-turn-capsule` on the container and puts `team-run-capsule` on the icon wrapper so pre-existing indicator tests keep passing.
- Top-up amount starts empty rather than at 1000, so the confirm disabled state is observable and the user must opt in.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Initial `aria-live` implementation used a spread of a conditional props object, which failed the acceptance grep for the literal attribute. Rewrote as an explicit JSX branch so `aria-live="polite"` appears literally and only in the agent streaming branch.
- The paused banner's doc comment originally contained the forbidden strings (`Spin`, `Đang xử lý`), tripping its own acceptance grep. Reworded the comment.

## User Setup Required

None.

## Next Phase Readiness

- Team workspace plans (34-09/34-10) can pass `agentDirectory`/`agentStatuses`/`onStopAgent` into `ChatMessageList` and render `AssignmentPlanCard` / `AgentPausedBanner` / `BudgetTopUpModal` directly.
- No stubs: every component is fully wired to its props; no placeholder data sources.

## Self-Check: PASSED

Verified files exist: `src/components/ai/office/AgentAttributionRow.tsx`, `AssignmentPlanCard.tsx`, `AgentPausedBanner.tsx`, `BudgetTopUpModal.tsx`, `tests/ai/ChatMessageListAttribution.test.tsx`, `tests/ai/office/AgentOfficeComponents.test.tsx`.
Verified commits exist: `32fe0325`, `0cf58e96`, `828653da`, `6ff787ec`, `4e4684d9`, `0033a46c`.
Scoped test run green: 4 files, 54 tests. `npx tsc --noEmit` exit 0. No package.json / package-lock.json changes.
