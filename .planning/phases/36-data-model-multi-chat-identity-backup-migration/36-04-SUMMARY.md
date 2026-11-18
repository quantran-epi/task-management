---
phase: 36-data-model-multi-chat-identity-backup-migration
plan: 04
subsystem: ai-office-ui
tags: [antd, team-roster, leader-lock, delete-refusal, d-05, d-06, d-09, d-15]
dependency-graph:
  requires:
    - 36-02 (optional leadId, leaderLockedAt, assignLeader/lockLeader/addTeamMember/removeTeamMember)
    - 36-03 (AiOfficeDeleteResult refusal, per-turn roster)
  provides:
    - "Name-only team create path; ACTIVE_TEAM_CAP_MESSAGE deleted with both importers"
    - "TeamSettingsDrawer roster + leader block (onAssignLeader/onAddMember/onRemoveMember/leads)"
    - "lockLeader before the first send, read from the persisted team row"
    - "Delete-refusal alert in AiOfficeView + corrected confirmation copy"
  affects:
    - 36-05 (backup round-trip of the end state these UI paths produce)
tech-stack:
  added: []
  patterns:
    - "drawer stays presentational — every roster/leader action is a prop wired to the repo"
    - "first-run lock decision reads the persisted team row at send time, not the mounted prop"
    - "UI renders the repo's refusal verbatim; it never pre-checks a count"
key-files:
  created: []
  modified:
    - src/components/ai/office/TeamEditorDrawer.tsx
    - src/components/ai/office/TeamSettingsDrawer.tsx
    - src/components/ai/office/TeamCard.tsx
    - src/components/ai/office/TeamWorkspace.tsx
    - src/components/ai/office/EmployeeCard.tsx
    - src/components/ai/office/SkillCard.tsx
    - src/db/repositories/aiTeamRepo.ts
    - src/views/TeamsView.tsx
    - src/views/AiOfficeView.tsx
    - src/workbench/toolwindows/AiOfficeExplorer.tsx
    - tests/views/TeamsView.test.tsx
    - tests/views/AiOfficeView.test.tsx
decisions:
  - "ACTIVE_TEAM_CAP_MESSAGE is gone entirely — no replacement cap constant"
  - "Leader Select options come from listLeads inside TeamWorkspace; the drawer stays presentational"
  - "Lock is written before the first send only when the persisted row has leadId and no leaderLockedAt; a failed lock surfaces an error instead of running"
  - "Roster refusals render inside the drawer's alert; delete refusals render as a warning alert near the segment header"
  - "refusalMessage narrows on payload shape because the AiOfficeDeleteResult union overlaps on entity: 'employee'"
metrics:
  duration: "~40 min"
  completed: 2026-11-10
  tasks: 3
  files: 12
---

# Phase 36 Plan 04: reachable roster, leader lock and delete refusals Summary

**One-liner:** A group is now created from a name alone, its roster and leader are editable in group settings, the leader locks durably on the first send even when assigned after mount, and every delete refusal is visible with the humans named instead of a silent no-op.

## What Was Built

| Layer | Change |
|---|---|
| Create path | `TeamEditorDrawer` saves on `name.trim().length > 0`; `leadId`/`employeeIds`/`budgetTokens` all optional (`budgetTokens: budget ?? 0`); `maxCount={3}` and the "tối đa 3" placeholder deleted |
| Cap removal | `ACTIVE_TEAM_CAP_MESSAGE` deleted from `aiTeamRepo`; `activeCount` prop and tooltip branch removed from `TeamCard` and `TeamEditorDrawer`; counter is `Đang hoạt động ${n}`; explorer header drops `/3` |
| Card | `TeamCard` gains `onOpenSettings` ("Cài đặt nhóm", routes to the workspace) and renders "Chưa chọn lead" when `lead` is undefined; `ROSTER_CAP` kept and commented as avatar overflow only |
| Roster block | `TeamSettingsDrawer` "Thành viên" block: member rows with avatar/role tag, `Popconfirm`-guarded remove on employee rows only, add-agent `Select` excluding current members, leader `Select` from the `leads` prop, `disabled` when `leaderLockedAt` is set plus the D-09 copy |
| Wiring | `TeamWorkspace` passes `leads` (new `listLeads` live query), `onAssignLeader` → `assignLeader`, `onAddMember` → `addTeamMember({ budgetTokens: 0 })`, `onRemoveMember` → `removeTeamMember`; repo throws land in the drawer's alert |
| First-run lock | `sendTurn` awaits `getTeam(team.id)` and calls `lockLeader` when the persisted row has `leadId` and no `leaderLockedAt`; a failed lock sets `sendError` on the widget and does not send |
| Empty group | Workspace header renders `team-header-no-lead` "Chưa chọn lead" instead of nothing |
| Delete refusals | `AiOfficeView` handlers are async and map `AiOfficeDeleteResult` to a warning `Alert` (`ai-office-delete-error`) naming groups/agents only; cleared on success and on segment switch |
| Copy | Employee/lead/skill `Popconfirm` titles promise refusal; the "persona thuần" fallback promise is gone |
| Explorer | Empty group renders "Chưa chọn lead" in the team row (the `leadId`-optional guard was already in place from 36-02) |

## Tests

- `tests/views/TeamsView.test.tsx` — 30 cases (22 at HEAD, 1 from 36-03, 7 new/rewritten):
  counter without denominator; activation stays enabled with four active teams and no cap copy; name-only create writes no `leadId`, no member rows and `budgetTokens: 0`; four employees stored with a 600-token lead row; roster list with remove-on-employee-only; add-agent options exclude existing members; leader Select offers every persisted lead, calls `assignLeader`, and is `disabled` once `leaderLockedAt` is set; empty group workspace renders; first send writes `leaderLockedAt` and a second send leaves it unchanged; assign-after-mount then first send runs the ASSIGNED lead with its persona/model and locks; explorer shows "Chưa chọn lead".
- `tests/views/AiOfficeView.test.tsx` — 19 cases (15 at HEAD + 4 new): refused employee delete names "Nhóm Alpha", leaves the card and the DB row, renders no id; unreferenced delete removes the card with no alert; refused skill delete names "An Nguyễn" and keeps the row; confirmation copy asserts the refusal wording and the absence of the cascade/persona-only promises.
- The old `caps employee selection at 3` case was rewritten (not deleted) into the four-employee case, so the cap removal is proven by the same production path that used to enforce it.

## Verification

- `npx vitest run tests/views/TeamsView.test.tsx tests/views/AiOfficeView.test.tsx` — 2 files, **49 passed**.
- `npx tsc --noEmit` — clean (exit 0) after every task.
- `git grep ACTIVE_TEAM_CAP_MESSAGE src/ tests/` — no matches.
- No npm dependency added. Full suite deliberately not run.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `AiOfficeDeleteResult` union overlaps on `entity: 'employee'`**

- **Found during:** Task 3
- **Issue:** the second union member is `{ entity: 'employee' | 'skill'; usedBy: { agentId, agentName }[] }`, so `result.entity === 'skill'` alone does not narrow `usedBy` — `tsc` rejected `row.teamName` with TS2339.
- **Fix:** `refusalMessage` narrows on the payload shape (`'agentName' in row`) as well as `entity`.
- **Files modified:** `src/views/AiOfficeView.tsx`
- **Commit:** `222de53d`

**2. [Rule 1 - Bug] The remove control's label collided with the Popconfirm's OK button**

- **Found during:** Task 2
- **Issue:** both the row button and the confirm dialog used "Gỡ", so `findByText('Gỡ')` matched two nodes.
- **Fix:** the row button is now "Gỡ khỏi nhóm"; the confirm action keeps "Gỡ".
- **Files modified:** `src/components/ai/office/TeamSettingsDrawer.tsx`, `tests/views/TeamsView.test.tsx`
- **Commit:** `e00fd639`

**3. [Rule 3 - Blocking] Card "Xóa" and Popconfirm "Xóa" are both buttons with the same name**

- **Found during:** Task 3
- **Issue:** `getByRole('button', { name: 'Xóa' })` matched the card button and the dialog's OK button; three refusal cases failed on ambiguity.
- **Fix:** added a `confirmDelete()` helper that scopes the click to `.ant-popconfirm`.
- **Files modified:** `tests/views/AiOfficeView.test.tsx`
- **Commit:** `222de53d`

**4. [Rule 2 - Missing critical functionality] A failed `lockLeader` would have been an unhandled rejection**

- **Found during:** Task 2
- **Issue:** `handleSubmit` fired `void coordinator?.send(...)`, so the new lock call had nowhere to report a refusal (e.g. a lead row missing after a race).
- **Fix:** `sendTurn` catches the lock failure into `sendError` and returns without sending; the widget renders it and Retry re-enters the same path.
- **Files modified:** `src/components/ai/office/TeamWorkspace.tsx`
- **Commit:** `e00fd639`

## Deferred Issues

Pre-existing at HEAD, outside this plan's scope:

| Item | Detail |
|---|---|
| `tests/views/TeamsView.test.tsx` unhandled rejections | 3 `DatabaseClosedError` unhandled rejections after individual cases; present before this plan (recorded in 36-03's summary). All cases pass. |
| No `eslint.config.*` in the repo | `npx eslint` cannot run; `tsc --noEmit` is the static gate. |
| `TeamSidebar` lead display | Still hides the lead block entirely when `lead` is undefined; the workspace header now carries the explicit "Chưa chọn lead" state. Not in this plan's file set. |

## Known Stubs

None. "Chưa chọn lead" is the D-05 contract for an empty group, not a placeholder: no leader exists yet and the settings drawer is the path to assign one.

## Threat Flags

None beyond the plan's register. The leader `disabled` state is a UX affordance only — `assignLeader` still refuses on `leaderLockedAt` inside its transaction (36-02). Refusal alerts render names only, never ids (T-36-15).

## Self-Check: PASSED

- `src/components/ai/office/TeamSettingsDrawer.tsx` — FOUND (`onAssignLeader`, `leads`, roster block)
- `src/components/ai/office/TeamEditorDrawer.tsx` — FOUND (name-only `valid`)
- `src/views/AiOfficeView.tsx` — FOUND (`refusalMessage`, `ai-office-delete-error`)
- `src/db/repositories/aiTeamRepo.ts` — `ACTIVE_TEAM_CAP_MESSAGE` ABSENT (intended)
- commit `01b0316d` — FOUND
- commit `e00fd639` — FOUND
- commit `222de53d` — FOUND
