---
phase: 34-ai-office-fixed-ai-employees-with-persona-role-per-model-mul
plan: 10
subsystem: ui
tags: [react, antd, dexie, ai-office, teams, coordinator, splitter, mentions]

# Dependency graph
requires:
  - phase: 34-ai-office
    provides: aiOffice types, validation schemas, aiOffice/aiTeam/teamTranscript repos
  - phase: 34-ai-office
    provides: teamRunCoordinator, budgetGate, teamRunRegistry, teamPrompts, teamTools
  - phase: 34-ai-office
    provides: AgentAttributionRow, AssignmentPlanCard, AgentPausedBanner, BudgetTopUpModal
  - phase: 34-ai-office
    provides: AiOfficeView employee tab and the 'teams' registration in layoutStore/EditorArea/WorkbenchLayout
provides:
  - TeamsView list + workspace modes
  - TeamCard, TeamEditorDrawer, TeamSettingsDrawer, TeamSidebar
  - TeamWorkspace hosting AiChatWidget with attribution, plan card, paused banner, approval card
  - LinkedItemsList and LinkedItemPicker
  - AiChatWidget agentDirectory/agentStatuses/onStopAgent/agentMentionOptions pass-through
  - ChatInputBar agentOptions lead-first @ suggestions
  - renderViewContent 'agents' -> AiOfficeView, 'teams' -> TeamsView
  - TitleBar AI Office nav entry
affects: [phase-35, ai-office-team-page, workbench-routing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-level coordinator registry keyed by db.name + teamId so a run survives unmount (D-22)"
    - "Transcript region is a single focus stop with roving focus across agent Stop buttons"
    - "Test seam: createRuntimeDeps forwarded TeamsView -> TeamWorkspace -> createTeamRunCoordinator"

key-files:
  created:
    - src/views/TeamsView.tsx
    - src/components/ai/office/TeamCard.tsx
    - src/components/ai/office/TeamEditorDrawer.tsx
    - src/components/ai/office/TeamSettingsDrawer.tsx
    - src/components/ai/office/TeamWorkspace.tsx
    - src/components/ai/office/TeamSidebar.tsx
    - src/components/ai/office/LinkedItemsList.tsx
    - src/components/ai/office/LinkedItemPicker.tsx
    - tests/views/TeamsView.test.tsx
    - tests/ai/ChatInputBarAgentMentions.test.tsx
  modified:
    - src/components/ai/AiChatWidget.tsx
    - src/components/ai/ChatInputBar.tsx
    - src/workbench/EditorArea.tsx
    - src/workbench/TitleBar.tsx

key-decisions:
  - "TeamsView drives list/workspace by local state, not routing, so a run survives a view switch without URL coupling"
  - "Coordinator registry is keyed by db.name + teamId; a test database never inherits another one's run"
  - "The transcript region renders before the coordinator resolves and shows a 'Đang chuẩn bị nhóm...' line, so the focus stop exists in every state"
  - "ChatInputBar agent options cap at 5 and are prepended to the existing task/doc list; the value is inserted verbatim by antd Mentions"

patterns-established:
  - "Agent mention value form: @[Name](agent:<id>) — the exact shape the coordinator router parses"
  - "Even split: floor(total / memberCount) per row, remainder on the lead row"

requirements-completed: [AIO-UI-01, AIO-TEAM-01, AIO-TEAM-04, AIO-BG-01, AIO-BUDGET-01, AIO-LINK-01, AIO-EMP-02]

# Metrics
duration: 24min
completed: 2026-11-08
---

# Phase 34 Plan 10: Team Page Summary

**Team page with activate/pause caps, a splitter workspace hosting the shared transcript and the headless coordinator, a lead-first `@agent` composer, and the final workbench routing wiring**

## Performance

- **Duration:** ~24 min
- **Started:** 2026-11-08T16:04:00Z
- **Completed:** 2026-11-08T16:28:24Z
- **Tasks:** 3
- **Files modified:** 14 (10 created, 4 modified)

## Accomplishments

- Team list with the 3-active cap, last-active pause guard, roster avatar stack and 80% budget bar
- Create-team drawer with lead select, 3-employee cap and the live even-split preview; save creates the team, seeds member rows and honours `Kích hoạt ngay`
- Workspace: `Splitter` with a 300px `TeamSidebar`, workspace header, transcript region as one focus stop with roving focus over agent Stop buttons
- Team thread resolved through `ensureTeamThread` on open and reused across activations, so the transcript accumulates (D-17)
- One coordinator per team held in a module-level registry keyed by database name + team id, so a run survives a view switch (D-22)
- Lead approval card wired both ways: `snapshot.pendingApproval` into `turn`, `onResolveApproval` into `coordinator.resolveApproval`
- Composer offers lead-first `@` options whose selected value is `@[Name](agent:<id>)`; a bare message routes to the lead
- `renderViewContent` routes `'agents'` to `AiOfficeView` and `'teams'` to `TeamsView`; TitleBar gains the `AI Office` entry after `Ghost Dev`

## Task Commits

Each task was committed atomically:

1. **Task 1: Team list, team card and the create-team drawer** - `1332e423` (feat)
2. **Task 2: Workspace, sidebar and settings drawer, workspace wiring, thread resolution, approval wiring and focus order** - `d0eaaea1` (feat)
3. **Task 3: AiChatWidget and ChatInputBar agent surfaces, the teams route, the TitleBar entry and the tests** - `98c5cb85` (feat)

## Files Created/Modified

- `src/views/TeamsView.tsx` - list and workspace modes, live team/lead/employee/skill reads, `createRuntimeDeps` seam
- `src/components/ai/office/TeamCard.tsx` - status tag, lead row, roster stack, budget bar, activate/pause footer
- `src/components/ai/office/TeamEditorDrawer.tsx` - create form; `createTeam` then `applyEvenSplit`
- `src/components/ai/office/TeamSidebar.tsx` - members, team budget, links, mode switches
- `src/components/ai/office/TeamSettingsDrawer.tsx` - total + per-row split table (`evenSplitRows` exported for the sum test)
- `src/components/ai/office/TeamWorkspace.tsx` - splitter, thread resolution, coordinator registry, transcript region, widget wiring
- `src/components/ai/office/LinkedItemsList.tsx` - typed rows plus the empty state
- `src/components/ai/office/LinkedItemPicker.tsx` - five-type picker, adds immediately and stays open
- `src/components/ai/AiChatWidget.tsx` - four new optional agent props forwarded to list/composer
- `src/components/ai/ChatInputBar.tsx` - `agentOptions` prepended to the `@` option list
- `src/workbench/EditorArea.tsx` - `'agents'` -> `AiOfficeView`, new `'teams'` -> `TeamsView`
- `src/workbench/TitleBar.tsx` - `titlebar-ai-office` button after Ghost Dev
- `tests/views/TeamsView.test.tsx` - 20 assertions across list, caps, drawer, links, workspace, thread reuse, focus, routing, composer, approval
- `tests/ai/ChatInputBarAgentMentions.test.tsx` - lead-first order, `agent:` value form, task options preserved, absent-prop behaviour

## Decisions Made

- Coordinator registry keyed by `db.name + teamId` rather than teamId alone, so parallel test databases cannot share a run (the plan said "module-level Map<teamId, ...>"; the key change is a test-isolation fix, not a behaviour change).
- The transcript region renders in every state (coordinator pending, config error) so the single focus stop and the `team-transcript-region` testid never disappear; the widget itself only mounts once a coordinator exists.
- `AgentControlView` import removed from `EditorArea.tsx` — routing `'agents'` to `AiOfficeView` left it unused and `noUnusedLocals` fails the typecheck.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Disabled activate button swallowed its own tooltip**
- **Found during:** Task 1 (team card)
- **Issue:** antd `Button disabled` stops pointer events, so the cap `Tooltip` never opened and the required cap copy was unreachable.
- **Fix:** Wrapped the button in a live `<span style={{ display: 'inline-flex' }}>` inside the `Tooltip`.
- **Files modified:** `src/components/ai/office/TeamCard.tsx`
- **Verification:** `tests/views/TeamsView.test.tsx` asserts the cap tooltip text renders at 3 active teams.
- **Committed in:** `1332e423` (Task 1 commit)

**2. [Rule 3 - Blocking] `token.colorBackground` does not exist in antd 6's `GlobalToken`**
- **Found during:** Task 2 (workspace)
- **Issue:** `tsc` rejected the spec's `background: token.colorBackground` on the `Splitter`.
- **Fix:** Used `token.colorBgContainer`, the token the neighbouring splitter (`AgentControlView`) uses.
- **Files modified:** `src/components/ai/office/TeamWorkspace.tsx`
- **Verification:** `npx tsc --noEmit` clean.
- **Committed in:** `d0eaaea1` (Task 2 commit)

**3. [Rule 3 - Blocking] Unused `AgentControlView` import after the routing change**
- **Found during:** Task 3 (`renderViewContent`)
- **Issue:** `noUnusedLocals` fails the build once `case 'agents'` returns `AiOfficeView`.
- **Fix:** Removed the import; `AiOfficeView` renders `AgentControlView` behind its Ghost Dev segment, so the surface is still reachable.
- **Files modified:** `src/workbench/EditorArea.tsx`
- **Verification:** `npx tsc --noEmit` clean; `tests/views/AiOfficeView.test.tsx` still green.
- **Committed in:** `98c5cb85` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking)
**Impact on plan:** All three were correctness or build blockers. No scope creep; no new domain logic.

## Issues Encountered

- The plan's `Mở nhóm` test expected a `team-workspace-placeholder`; Task 2 replaces it with the real workspace, so the placeholder assertion was replaced by the workspace assertion in the same file (the file is extended, not restructured).
- antd `Mentions` renders options as `li[role="menuitem"]` with the option key on `data-menu-id`, not `data-value`. The composer test reads the key suffix and additionally asserts the exact `@[Name](agent:<id>)` string round-trips through submit.
- `ChatInputBar` swaps `Gửi` for `Dừng` while a turn runs, so the two-message routing test waits for the send button to return between submits.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The team page is complete and consumes every earlier plan's exports; no plan in phase 34 remains.
- Wave gate still to be run by the orchestrator: `npx vitest run tests/services/ai/office tests/ai tests/db tests/services/backup tests/views`.
- `git diff --stat package.json package-lock.json` is empty — no packages added.

## Self-Check: PASSED

- `src/views/TeamsView.tsx` — FOUND
- `src/components/ai/office/TeamWorkspace.tsx` — FOUND
- `src/components/ai/office/TeamSidebar.tsx` — FOUND
- `src/components/ai/office/TeamSettingsDrawer.tsx` — FOUND
- `tests/views/TeamsView.test.tsx` — FOUND
- `tests/ai/ChatInputBarAgentMentions.test.tsx` — FOUND
- Commits `1332e423`, `d0eaaea1`, `98c5cb85` — FOUND
- `npx tsc --noEmit` — clean
- `npx vitest run tests/views/TeamsView.test.tsx tests/views/AiOfficeView.test.tsx tests/ai/ChatInputBarAgentMentions.test.tsx` — 41 passed

---
*Phase: 34-ai-office-fixed-ai-employees-with-persona-role-per-model-mul*
*Completed: 2026-11-08*
