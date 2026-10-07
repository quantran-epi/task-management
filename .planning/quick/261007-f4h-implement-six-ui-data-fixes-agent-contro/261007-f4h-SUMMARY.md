---
phase: quick
plan: 261007-f4h
subsystem: ui-data-fixes
tags:
  - agent-control
  - notes-import
  - ghost-dev
  - project-modal
  - app-shell
dependency_graph:
  requires: []
  provides:
    - agent-diff-fullscreen-toggle
    - zip-import-tag-persistence
    - session-scoped-ghost-dev-history
    - project-notes-empty-clear-persistence
    - header-right-aligned-timer-and-labeled-sync
    - ghost-dev-master-prompt-english
  affects:
    - src/components/agents/AgentDiffReviewer.tsx
    - src/components/notes/ZipImportPreviewModal.tsx
    - src/views/NotesView.tsx
    - src/services/agents/agentSessionHistoryRepo.ts
    - src/utils/ghostDevPrompt.ts
    - src/components/agents/RunGhostDevModal.tsx
    - src/components/agents/AgentSessionList.tsx
    - src/views/AgentControlView.tsx
    - src/components/projects/ProjectModal.tsx
    - src/components/shell/AppShell.tsx
    - src/components/shell/GitHubSyncStatusDot.tsx
tech-stack:
  added: []
  patterns:
    - smartIngestion extractMarkdownMetadata reuse for zip markdown files
    - session-scoped audit history with latest/active target resolution
    - fixed overlay viewport pattern for toolbar fullscreen toggles
key-files:
  created: []
  modified:
    - src/components/notes/ZipImportPreviewModal.tsx
    - src/views/NotesView.tsx
    - src/components/notes/__tests__/zipImport.test.ts
    - src/components/projects/ProjectModal.tsx
    - tests/components/ProjectMilestoneModalAndTable.test.tsx
    - src/services/agents/agentSessionHistoryRepo.ts
    - src/utils/ghostDevPrompt.ts
    - src/components/agents/RunGhostDevModal.tsx
    - src/components/agents/AgentSessionList.tsx
    - src/views/AgentControlView.tsx
    - tests/agents/agentSessionHistoryRepo.test.ts
    - tests/agents/promptBuilder.test.ts
    - tests/agents/AgentControlView.test.tsx
    - src/components/agents/AgentDiffReviewer.tsx
    - src/components/shell/AppShell.tsx
    - src/components/shell/GitHubSyncStatusDot.tsx
    - tests/components/shell/AppShell.test.tsx
decisions:
  - Reused extractMarkdownMetadata in zip extraction so markdown hashtags persist as notes tags identically to pasted document creation
  - Retained empty string for project notes in ProjectModal onSave so intentional clearing updates project record without touching Notes table
  - Ghost Dev audit records are scoped per sessionId with ring-buffer cap 100 and target locator matching active or latest session
  - Replaced Vietnamese prompt literals in Ghost Dev master prompt with English labels and removed language-switch divergence
  - Diff reviewer full-screen mode uses fixed viewport layout maintaining internal diff state and toolbar actions
  - Moved timer and GitHub sync indicator to right header action group with visible "GitHub" text label
metrics:
  duration: 17m
  completed_date: "2026-10-07"
  tasks_completed: 3
  files_modified: 17
---

# Quick Task 261007-f4h: Implement Six UI/Data Fixes Summary

One-liner: Implemented diff fullscreen toggle, ZIP markdown tag extraction parity, session-scoped Ghost Dev audit history, project note clearing persistence, right-aligned labeled GitHub sync/timer header placement, and English-only Ghost Dev master prompt.

## Objectives Achieved

1. **Agent Control Diff Full-Screen Toggle:** Added full-screen toggle button to `AgentDiffReviewer` toolbar (`FullscreenOutlined` / `FullscreenExitOutlined`). Toggles between in-place split layout and full viewport overlay without losing file selection, diff actions, or feedback modals.
2. **ZIP Markdown Tag Extraction Parity:** Integrated `extractMarkdownMetadata` from `src/utils/smartIngestion.ts` into `ZipImportPreviewModal.tsx`. Extracted inline hashtags and H1 titles now pass into `batchCreateNotes` in `NotesView.tsx`, persisting note tags.
3. **Session-Scoped Ghost Dev Audit History:** Removed task ID deduplication on session start so launching the same task creates distinct audit rows. Updated `agentSessionHistoryRepo.ts` with helper to route feedback/status updates to active or latest session, and updated UI to delete by `sessionId`.
4. **Project Note Clear Persistence:** Updated `ProjectModal.tsx` to preserve `notes: values.notes !== undefined ? values.notes.trim() : undefined`, allowing clearing existing notes to save `notes: ''` without creating, modifying, or deleting records in `db.notes`.
5. **Right-Aligned Header Controls & Labeled GitHub Sync:** Removed center header `<Space>` in `AppShell.tsx` and moved `GitHubSyncStatusDot` and `ActiveTimerWidget` into the right action group. `GitHubSyncStatusDot` now renders a visible `GitHub` text label alongside status dot.
6. **English-Only Ghost Dev Initial Prompt:** Rewrote `generateGhostDevMasterPrompt` labels in English (`You are the Master/Lead Agent`, `Working directory`, `Detailed description`, `Goals to complete`). Appended user instructions under `## Additional user instructions` in `RunGhostDevModal.tsx`.

## Tasks and Commits

| Task | Description | Commit | Key Files |
| --- | --- | --- | --- |
| 1 | Fix ZIP import tag persistence and project note clearing | `a3bc724` | `src/components/notes/ZipImportPreviewModal.tsx`, `src/views/NotesView.tsx`, `src/components/projects/ProjectModal.tsx`, `src/components/notes/__tests__/zipImport.test.ts`, `tests/components/ProjectMilestoneModalAndTable.test.tsx` |
| 2 | Make Ghost Dev history session-scoped and prompt English-only | `d35d401` | `src/services/agents/agentSessionHistoryRepo.ts`, `src/utils/ghostDevPrompt.ts`, `src/components/agents/RunGhostDevModal.tsx`, `src/components/agents/AgentSessionList.tsx`, `src/views/AgentControlView.tsx`, `tests/agents/agentSessionHistoryRepo.test.ts`, `tests/agents/promptBuilder.test.ts` |
| 3 | Add diff full-screen toggle and move timer/sync indicators to right header with label | `1ef6364` | `src/components/agents/AgentDiffReviewer.tsx`, `src/components/shell/AppShell.tsx`, `src/components/shell/GitHubSyncStatusDot.tsx`, `tests/agents/AgentControlView.test.tsx`, `tests/components/shell/AppShell.test.tsx` |

## Deviations from Plan

None - plan executed as written.

## Verification

Targeted Vitest runs executed and passing:
- `npm test src/components/notes/__tests__/zipImport.test.ts tests/components/ProjectMilestoneModalAndTable.test.tsx` (13 passed)
- `npm test tests/agents/agentSessionHistoryRepo.test.ts tests/agents/promptBuilder.test.ts tests/agents/AgentControlView.test.tsx` (16 passed)
- `npm test tests/components/shell/AppShell.test.tsx` (4 passed)

## Self-Check: PASSED
- Created summary at `.planning/quick/261007-f4h-implement-six-ui-data-fixes-agent-contro/261007-f4h-SUMMARY.md`: FOUND
- Task commits verified in git log:
  - `a3bc724`: FOUND
  - `d35d401`: FOUND
  - `1ef6364`: FOUND
- No docs artifacts committed (per constraints): VERIFIED
