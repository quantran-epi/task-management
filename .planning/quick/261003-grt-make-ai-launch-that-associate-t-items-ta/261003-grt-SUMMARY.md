# Quick Task 261003-grt: Streamline AI Assistant Launching & Item Association Summary

**One-liner:** Global AIChatContext with z-index 1200 overlay, detail view "Ask AI" launchers, and in-drawer item picker for switching chat grounding between global, tasks, projects, and milestones.

## Overview & Value
Users previously had to close inspection drawers or modals to use Cmd+J without masking issues, and lacked direct buttons to ground the AI chat to specific items being inspected. This update:
1. Elevates `AIChatDrawer` overlay mode to `zIndex: 1200` (higher than `TaskDrawer` 1050 and `Modal` 1000).
2. Connects global `Cmd+J` / `Ctrl+J` key listener with capture phase to toggle chat from anywhere.
3. Automatically grounds AI chat to whatever task, project, or milestone is currently open via `registerActiveItem` in `AIChatContext`.
4. Adds dedicated "Hỏi AI" ("Ask AI") buttons in `TaskDrawer`, `ProjectDetailModal`, `MilestoneModal`, and `ItemInsightView`.
5. Integrates an in-drawer scope picker in `ChatHeader` / `AIChatDrawer` to change grounding to any task, project, milestone, or global scope without leaving the drawer.

## Key Changes
- **src/context/AIChatContext.tsx**: Provides `AIChatContext`, `useAIChat`, stack-based item registration (`registerActiveItem`), and programmatic `openChat(scope)`. Includes safe defaults when unparented in unit tests.
- **src/components/shell/AppShell.tsx**: Wrapped in `AIChatProvider`. Bound global `Cmd+J` / `Ctrl+J` shortcut listener with event capture. Synchronized modal/drawer inspection states to active scope.
- **src/components/ai/AIChatDrawer.tsx**: Overlay mode z-index changed from 1000 to 1200. Added live queries for searchable active tasks, projects, and milestones. Connected scope changing logic.
- **src/components/ai/ChatHeader.tsx**: Integrated searchable `Select` scope dropdown with grouped categories (Toàn cục, Tác vụ, Dự án, Mốc) and tag fallback.
- **src/components/tasks/TaskDrawer.tsx**: Added `useAIChat` registration while open and "Hỏi AI" extra header action button.
- **src/components/projects/ProjectDetailModal.tsx**: Added `useAIChat` registration and "Hỏi AI" footer action button.
- **src/components/projects/MilestoneModal.tsx**: Added `useAIChat` registration and "Hỏi AI" footer action button when milestone exists.
- **src/views/ItemInsightView.tsx**: Added item registration and "Hỏi AI" toolbar action button.
- **tests/ai/AIChatDrawer.test.tsx**: Added test assertions for `zIndex: 1200` in overlay mode and in-drawer scope picking between global and items.

## Verification
- `npm test -- --run tests/ai/AIChatDrawer.test.tsx` (6/6 tests passing)
- `npm test -- --run tests/components/TaskDrawer.test.tsx tests/components/projects/ProjectDetailModal.test.tsx` (9/9 tests passing)
- `npm test -- --run tests/components/ProjectMilestoneModalAndTable.test.tsx` (6/6 tests passing)
- `npm run build` (TypeScript compilation & Vite production bundle succeeded)

## Self-Check: PASSED
- [x] All 3 tasks executed and committed individually
- [x] Overlay z-index 1200 set and verified
- [x] Cmd+J capture binding wired to toggleChat
- [x] Ask AI buttons added to TaskDrawer, ProjectDetailModal, MilestoneModal, and ItemInsightView
- [x] In-drawer item picker operational
- [x] Automated test suite passing
