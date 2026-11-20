---
phase: 48-agent-developer-workbench-ssh-worktree-coding-zone-popout-hu
plan: 02
subsystem: ui
tags: [coding-zone, ssh-worktree, react, antd, diff-review, team-chat, tauri]

requires:
  - phase: 48-01
    provides: "confined SSH worktree descriptors and applyHunk/revertHunk verbs"

provides:
  - "Fullscreen two-perspective Coding Zone modal with one shared state object"
  - "SSH worktree tree with search, Diff/Tất cả scope, status badges and delta counts"
  - "Center tabs embedding RemoteFileViewer with full parity props"
  - "Compact team-chat strip mirroring the existing team transcript"
  - "Worktree-local hunk review with Unified/Side-by-side, per-hunk and bulk actions"
  - "Mở Coding Zone trigger gated on a live Agent Developer session"

affects: [48-03, 48-04]

tech-stack:
  added: []
  patterns:
    - "Draft-class dense CSS scoped under .cz-* using workbench-tokens.css palette"
    - "Decision keys combine filePath + hunk header + content hash + diff revision"
    - "Trigger visibility derived from live roster/session state, never sample data"

key-files:
  created:
    - src/components/agents/CodingZoneModal.tsx
    - src/components/agents/CodingZoneTree.tsx
    - src/components/agents/CodingZoneChatStrip.tsx
    - src/components/agents/CodingZoneDiffPanel.tsx
    - src/components/agents/office/CodingZoneTrigger.tsx
    - src/components/agents/__tests__/CodingZoneModal.test.tsx
    - src/components/agents/__tests__/CodingZoneDiffPanel.test.tsx
    - src/styles/coding-zone.css
  modified:
    - src/components/ai/office/TeamWorkspace.tsx
    - src/components/ai/office/AgentActivityPanel.tsx

key-decisions:
  - "Two perspectives swap layout only; tabs, active file, hunk decisions, tree query/scope and messages live in one modal state object"
  - "Center code tabs embed the existing RemoteFileViewer instead of duplicating a weaker viewer"
  - "Accept calls applyHunk and Reject calls revertHunk from plan 01; no merge or PR surface in the UI"
  - "Hunk decisions are keyed by file path, hunk header, body hash and revision; failures and stale diffs surface fixed Vietnamese copy without clearing decisions"
  - "Bulk disabled states follow semantics: Accept All disabled without pending hunks, Revert All disabled without accepted hunks"
  - "Remote repo identity comes from the team's linked System row, not from the AiTeam row"
  - "Trigger is mounted in TeamWorkspace header and AgentActivityPanel via a slot; AIChatDrawer, ChatMessageBubble and team-chat.css untouched"

patterns-established:
  - "Data-testid-prefixed cz-* contract for focused Coding Zone component tests"
  - "Remote paths and hunk text render only as escaped text nodes"

requirements-completed: [D-01, D-02, D-03, D-04, D-05, D-11, D-12, D-14, D-16]

duration: 14min
completed: 2026-11-21
---

# Phase 48 Plan 02: Coding Zone Workbench UI Summary

**Fullscreen two-perspective Coding Zone with a real SSH worktree tree, RemoteFileViewer parity tabs, worktree-local hunk review, and a session-gated team-chat trigger**

## Performance

- **Duration:** 14min
- **Started:** 2026-11-20T18:57:53Z
- **Completed:** 2026-11-20T19:11:54Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- `CodingZoneModal` renders the approved 3-pane draft layout (260px | 1fr | 300px), a 48px header with both perspective labels, a truthful 26px footer, Escape-to-close and Light/Dark toggle using draft tokens.
- `CodingZoneTree` derives folders from live `listWorktreeFiles` results, shows M/A/D tags and +N/−N deltas from real diff metadata, filters by query, and hides unchanged subtrees in Diff scope.
- A pinned `Tổng quan` tab has no close control; closing the active tab falls to its neighbor; drag reorder keeps the pinned tab first.
- Code tabs embed `RemoteFileViewer` with `config`/`repoPath`/`branch`/`filePath`/`initialLine`; viewer parity is asserted by a mock-based test.
- `CodingZoneChatStrip` mirrors the existing team store and sends via the workspace's current `runTurn` path; Enter sends and Shift+Enter inserts a newline. No new chat schema.
- `CodingZoneDiffPanel` renders unified and side-by-side hunks, per-hunk Accept/Reject toggles, pending-only counters, Accept All/Revert All, and the exact stale/failure/revert-confirm copy from the UI spec.
- `CodingZoneTrigger` appears only when the live roster contains an active Agent Developer session and opens the modal from both TeamWorkspace header and AgentActivityPanel.

## Task Commits
1. **Task 1: Build Coding Zone modal shell, tree and file viewer tabs** — `b1c3015e` (feat)
2. **Task 2: Build diff hunk review panel and wire 'Mở Coding Zone' trigger** — `6c841f07` (feat)

## Files Created/Modified
- `src/components/agents/CodingZoneModal.tsx` — fullscreen shell, shared state, tabs, perspective switch
- `src/components/agents/CodingZoneTree.tsx` — compact live worktree tree
- `src/components/agents/CodingZoneChatStrip.tsx` — transcript mirror and composer
- `src/components/agents/CodingZoneDiffPanel.tsx` — hunk review and conflict surfacing
- `src/components/agents/office/CodingZoneTrigger.tsx` — session-gated open action
- `src/components/agents/__tests__/CodingZoneModal.test.tsx` — shell, tree, tabs, viewer parity, chat tests
- `src/components/agents/__tests__/CodingZoneDiffPanel.test.tsx` — hunk, bulk, stale/failure, trigger tests
- `src/styles/coding-zone.css` — draft-derived scoped styling
- `src/components/ai/office/TeamWorkspace.tsx` — trigger mount and live-state wiring
- `src/components/ai/office/AgentActivityPanel.tsx` — optional trigger slot

## Decisions Made
- Two perspectives render the same `CodingZoneChatStrip` instance state by keeping perspective in modal state; no remount on switch.
- The center viewer passes conditional optional props to satisfy `exactOptionalPropertyTypes`.
- Bulk revert confirmation is the only destructive dialog; per-hunk rejection is immediate and reversible by clicking the same decision again.
- `Popout Coding Zone` and `⤢` affordances are reserved and rendered only when an `onPopout` callback is supplied (plan 03).
- Activity timeline content is deliberately empty in plan 02; plan 03/04 will feed live ghost-dev events (D-17).

## Deviations from Plan
### Auto-fixed Issues
**1. [Rule 2 — Missing critical wiring] Team SSH target source**
- **Found during:** Task 2
- **Issue:** `AiTeam` has no `sshConfigId`/`remoteRepoPath`; plan 01's provisioning target is not exposed to the UI.
- **Fix:** Derived worktree descriptor from the team's linked `System` row via `db.systems`, and used `getSshConfigById` for the viewer config. No synthetic path or fake connection chip.
- **Files modified:** `src/components/ai/office/TeamWorkspace.tsx`
- **Commit:** `6c841f07`

**2. [Rule 3 — Test scope] Split diff/trigger tests into a second focused file**
- **Found during:** Task 2
- **Issue:** The plan listed a single test file; hunk-review tests needed a service mock that would affect shell tests.
- **Fix:** Added `CodingZoneDiffPanel.test.tsx` so both suites stay scoped and independent.
- **Files modified:** `src/components/agents/__tests__/CodingZoneDiffPanel.test.tsx`
- **Commit:** `6c841f07`

## Issues Encountered
- No new packages installed; reused Ant Design, Testing Library and existing viewer/diff primitives.
- `git diff -- src/components/ai/AIChatDrawer.tsx src/components/ai/ChatMessageBubble.tsx src/styles/team-chat.css` is empty (D-01).

## Verification
- `npx vitest run src/components/agents/__tests__/CodingZoneModal.test.tsx src/components/agents/__tests__/CodingZoneDiffPanel.test.tsx --bail=1` — 15/15 passed.
- `npx tsc --noEmit` — clean.
- D-01 protected-file diff — 0 lines.

## Known Stubs
- `renderDiffPanel` fallback in `CodingZoneModal` shows a loading message when no panel prop is supplied; production wiring in `CodingZoneTrigger` supplies the real `CodingZoneDiffPanel`.
- Agent activity area renders an empty-state message until plan 03/04 wires live `ghost-dev` events (D-17).
- `onPopout` is optional and only rendered when plan 03 supplies the real Tauri handler (D-06).

## Threat Flags
None. Remote paths and hunk text render as escaped text; review verbs are confined to plan 01's worktree-only service.

## Self-Check: PASSED
- Created files verified: `CodingZoneModal.tsx`, `CodingZoneTree.tsx`, `CodingZoneChatStrip.tsx`, `CodingZoneDiffPanel.tsx`, `CodingZoneTrigger.tsx`, both test files, `coding-zone.css`.
- Task commits `b1c3015e` and `6c841f07` verified in git log.

---
*Phase: 48-agent-developer-workbench-ssh-worktree-coding-zone-popout-hu*
*Completed: 2026-11-21*
