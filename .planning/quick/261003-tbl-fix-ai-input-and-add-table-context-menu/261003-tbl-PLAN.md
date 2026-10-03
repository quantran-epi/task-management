---
phase: quick
plan: 261003-tbl
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/ai/ChatInputBar.tsx
  - src/components/tasks/TaskTable.tsx
  - src/components/projects/ProjectTable.tsx
  - tests/ai/ChatMessageBubble.test.tsx
  - tests/components/tasks/TaskTable.test.tsx
autonomous: true
requirements:
  - FIX-AI-CMD-ENTER-CLEAR
  - TABLE-ITEM-CONTEXT-MENU-AND-ASK-AI
user_setup: []
must_haves:
  truths:
    - "Pressing Cmd+Enter or Ctrl+Enter in ChatInputBar clears the input completely without leaving trailing IME composition / last word."
    - "TaskTable rows have right-click context menu with Ask AI, Edit Task, Delete."
    - "ProjectTable project rows and milestone rows have right-click context menu and clean action dropdown with Ask AI, Add Task/Milestone, Edit, Delete."
    - "Asking AI opens AIChatDrawer scoped to the clicked entity (task, project, or milestone)."
  artifacts:
    - path: "src/components/ai/ChatInputBar.tsx"
      provides: "Hardened input clearing that prevents IME composition leaks on Cmd+Enter"
    - path: "src/components/tasks/TaskTable.tsx"
      provides: "Row context menu and action dropdown for tasks with Ask AI"
    - path: "src/components/projects/ProjectTable.tsx"
      provides: "Row context menu and action dropdown for projects and milestones with Ask AI"
---

<tasks>
<task>
  <name>Task 1: Fix Cmd+Enter input clearing in ChatInputBar</name>
  <files>
    - src/components/ai/ChatInputBar.tsx
    - tests/ai/ChatMessageBubble.test.tsx
  </files>
  <action>
    In ChatInputBar, prevent IME / browser input events after Cmd+Enter from populating the textarea with the committed last word. Set isSubmittingRef lock, clear native DOM textarea value, reset state immediately and after tick, and ignore trailing input while lock is held. Add unit test verifying input clears and stays empty after Cmd+Enter.
  </action>
  <verify>
    npx vitest run tests/ai/ChatMessageBubble.test.tsx
  </verify>
  <done>
    ChatInputBar immediately clears and ignores post-submit IME input events on Cmd+Enter.
  </done>
</task>

<task>
  <name>Task 2: Add row context menu and Ask AI to TaskTable and ProjectTable</name>
  <files>
    - src/components/tasks/TaskTable.tsx
    - src/components/projects/ProjectTable.tsx
    - tests/components/tasks/TaskTable.test.tsx
  </files>
  <action>
    1. In TaskTable: Add onRow onContextMenu right-click handler showing context menu with Ask AI (RobotOutlined), Edit Task, Delete. Connect to openChat({ type: 'task', id, title }).
    2. In ProjectTable: Use useAIChat. Add onRow onContextMenu right-click handler for Project and Milestone rows. Replace cluttered multi-button actions with quick task button + action dropdown button. Add 'Hỏi Trợ lý AI' for Project (type: 'project') and Milestone (type: 'milestone').
    3. Ensure existing tests pass (action dropdown with label 'Thao tác khác', 'Tác vụ' button).
  </action>
  <verify>
    npx vitest run tests/components/tasks/TaskTable.test.tsx tests/components/ProjectMilestoneModalAndTable.test.tsx tests/components/HierarchyView.test.tsx
  </verify>
  <done>
    Both TaskTable and ProjectTable support right-click context menu and action dropdown containing Ask AI.
  </done>
</task>
</tasks>
