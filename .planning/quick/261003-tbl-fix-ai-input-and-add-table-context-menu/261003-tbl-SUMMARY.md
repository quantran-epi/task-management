---
phase: quick
plan: 261003-tbl
status: complete
date: 2026-10-03
files_modified:
  - src/components/ai/ChatInputBar.tsx
  - src/components/tasks/TaskTable.tsx
  - src/components/projects/ProjectTable.tsx
  - tests/ai/ChatMessageBubble.test.tsx
  - tests/components/tasks/TaskTable.test.tsx
  - tests/components/ProjectMilestoneModalAndTable.test.tsx
---

# Quick Task Summary: Fix AI Input Cmd+Enter Clearing & Add Table Context Menu with Ask AI

## Accomplishments
1. **Fixed AI Chat Drawer Cmd+Enter clearing**:
   - Resolved race condition where macOS IME / composition commits trailing word into textarea right after Cmd+Enter.
   - Clears native DOM textarea element value, sets submission lock, and discards trailing composition input events in `ChatInputBar.tsx`.
   - Verified with unit test in `ChatMessageBubble.test.tsx`.

2. **Added table row right-click context menu & unified action dropdown**:
   - `TaskTable.tsx`: Right-click on task row opens context menu with "Hỏi Trợ lý AI", "Sửa tác vụ", "Xóa". Unified with action dropdown button (`aria-label="Thao tác khác"`).
   - `ProjectTable.tsx`: Right-click on Project row, Milestone row, and Task row opens context menu with "Hỏi Trợ lý AI", "Thêm tác vụ/cột mốc", "Sửa", "Xóa".
   - Replaced cluttered multi-button actions in ProjectTable with clean "Tác vụ" quick button + action dropdown button.
   - Wired "Hỏi Trợ lý AI" to `useAIChat().openChat` with appropriate scope (`task`, `project`, `milestone`).

## Verification
- Targeted tests:
  - `npx vitest run tests/components/ProjectMilestoneModalAndTable.test.tsx tests/components/HierarchyView.test.tsx tests/components/tasks/TaskTable.test.tsx tests/ai/ChatMessageBubble.test.tsx tests/ai/AIChatDrawer.test.tsx` (40 passed, 0 failed).
