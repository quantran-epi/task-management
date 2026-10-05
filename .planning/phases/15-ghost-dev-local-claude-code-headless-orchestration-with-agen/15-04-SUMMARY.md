# Phase 15 Plan 04: Shell Integration, Task Execution Triggers, and Settings Summary

**One-liner:** Integrated Ghost Dev into PlannerMate's shell navigation with dynamic running badges, added task triggers in TaskTable and TaskDrawer with toast notifications, created the Settings configuration card, and delivered an automated component test suite for AgentControlView.

## Frontmatter

- **phase:** 15-ghost-dev-local-claude-code-headless-orchestration-with-agen
- **plan:** 04
- **subsystem:** agents-shell-integration
- **tags:** [ghost-dev, navigation, badge, task-trigger, settings, component-tests]
- **dependency_graph:**
  - **requires:**
    - `15-01` (Contracts, prompt generator, shell whitelist)
    - `15-02` (Rust agent manager, process isolation, Tauri commands)
    - `15-03` (AgentControlView, session hooks, diff reviewer)
  - **provides:**
    - `src/types/navigation.ts` ('agents' route definition)
    - `src/components/shell/Navigation.tsx` (Agent Control menu with live running sessions badge)
    - `src/hooks/useGhostDevNotifications.ts` (OS desktop notifications on agent done/error and shell permission gate)
    - `src/services/agents/ghostDevConfig.ts` (LocalStorage config service with model sanitization)
    - `src/components/agents/RunGhostDevModal.tsx` (Working directory selection and model confirmation modal)
    - `src/components/settings/GhostDevConfigCard.tsx` (Default Master/Worker model customization card)
    - `tests/agents/AgentControlView.test.tsx` (Comprehensive component test suite)
  - **affects:**
    - Task table & Task drawer user workflow (adds direct Ghost Dev agent triggers)
    - Settings page (adds AI & Ghost Dev model configuration)
- **tech_stack:**
  - **added:** None
  - **patterns:**
    - Real-time badge counter on sidebar navigation (`#4f46e5`)
    - Toast feedback with non-blocking action button to view session
    - Strict regex validation (`^[a-zA-Z0-9.-]+$`) for model identifiers against CLI argument injection (T-15-10)
    - Path normalization and validation for local git directories (T-15-09)
- **key_files:**
  - **created:**
    - `src/hooks/useGhostDevNotifications.ts`
    - `src/services/agents/ghostDevConfig.ts`
    - `src/components/agents/RunGhostDevModal.tsx`
    - `src/components/settings/GhostDevConfigCard.tsx`
    - `tests/agents/AgentControlView.test.tsx`
  - **modified:**
    - `src/types/navigation.ts`
    - `src/components/shell/Navigation.tsx`
    - `src/App.tsx`
    - `src/components/tasks/TaskTable.tsx`
    - `src/components/tasks/TaskDrawer.tsx`
    - `src/views/TasksView.tsx`
    - `src/views/SettingsView.tsx`
- **decisions:**
  - Placed Ghost Dev configuration in the existing "Trợ lý AI & Ghost Dev" settings tab to unify AI services and avoid navigation clutter.
  - Used an explicit toast CTA button ("Xem trong Agent Control") instead of immediately redirecting the user, allowing users to initiate agent runs and remain in their active task view.
  - Built `useGhostDevNotifications` to listen for agent completion and shell permission requests, integrating desktop OS notifications via `@tauri-apps/plugin-notification`.
- **metrics:**
  - **duration:** ~9 minutes
  - **completed_date:** 2026-10-05

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Add 'agents' route to navigation, sidebar badge counter, and App router | `e46e23e` | `src/types/navigation.ts`, `src/components/shell/Navigation.tsx`, `src/App.tsx`, `src/hooks/useGhostDevNotifications.ts` |
| 2 | Build RunGhostDevModal, integrate task triggers, and add GhostDevConfigCard | `b04edd3` | `src/components/agents/RunGhostDevModal.tsx`, `src/components/settings/GhostDevConfigCard.tsx`, `src/services/agents/ghostDevConfig.ts`, `src/components/tasks/TaskTable.tsx`, `src/components/tasks/TaskDrawer.tsx`, `src/views/SettingsView.tsx`, `src/views/TasksView.tsx` |
| 3 | Create component test for AgentControlView and verify full test suite | `6e34aa6` | `tests/agents/AgentControlView.test.tsx` |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added optionality to exactOptionalPropertyTypes in TaskTable and TaskDrawer props**
- **Found during:** Task 2 verification (`npx tsc --noEmit`)
- **Issue:** Passing `onNavigate` as potentially undefined caused TS2375 error under `exactOptionalPropertyTypes: true`.
- **Fix:** Explicitly typed `onNavigate?: ((route: AppRoute) => void) | undefined;` in `RunGhostDevModalProps`, `TaskTableProps`, and `TaskDrawerProps`.
- **Files modified:** `src/components/agents/RunGhostDevModal.tsx`, `src/components/tasks/TaskTable.tsx`, `src/components/tasks/TaskDrawer.tsx`
- **Commit:** `b04edd3`

## Verification Results

- `npx tsc --noEmit`: Clean pass with 0 errors.
- `npx vitest run tests/agents/`: 4 test files, 12 passed (including AgentControlView 4 component tests).

## Self-Check: PASSED
- `src/types/navigation.ts`: FOUND
- `src/components/shell/Navigation.tsx`: FOUND
- `src/App.tsx`: FOUND
- `src/components/agents/RunGhostDevModal.tsx`: FOUND
- `src/components/settings/GhostDevConfigCard.tsx`: FOUND
- `src/services/agents/ghostDevConfig.ts`: FOUND
- `tests/agents/AgentControlView.test.tsx`: FOUND
- Commits `e46e23e`, `b04edd3`, `6e34aa6`: FOUND in git log.
