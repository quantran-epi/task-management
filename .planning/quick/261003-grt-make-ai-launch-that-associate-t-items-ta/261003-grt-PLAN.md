---
phase: quick
plan: 261003-grt
type: execute
wave: 1
depends_on: []
files_modified:
  - src/context/AIChatContext.tsx
  - src/components/shell/AppShell.tsx
  - src/components/ai/AIChatDrawer.tsx
  - src/components/ai/ChatHeader.tsx
  - src/components/tasks/TaskDrawer.tsx
  - src/components/projects/ProjectDetailModal.tsx
  - src/components/projects/MilestoneModal.tsx
  - src/views/ItemInsightView.tsx
  - tests/ai/AIChatDrawer.test.tsx
autonomous: true
requirements: [QUICK-AI-LAUNCH-PICK]
must_haves:
  truths:
    - "Cmd+J / Ctrl+J opens AIChatDrawer on top of detail drawers and modals without being trapped or masked"
    - "Detail views (TaskDrawer, ProjectDetailModal, MilestoneModal, ItemInsightView) provide a direct Ask AI button that opens AIChatDrawer grounded to that item"
    - "Active open item is registered with AI chat context so Cmd+J automatically grounds to the open task, project, or milestone"
    - "AIChatDrawer provides an in-drawer item picker allowing users to switch between Global, Tasks, Projects, and Milestones without leaving the drawer"
  artifacts:
    - path: "src/context/AIChatContext.tsx"
      provides: "Global AI chat state, open/close triggers, and active item registration"
    - path: "src/components/ai/AIChatDrawer.tsx"
      provides: "Overlay z-index fix, item scope picker integration, and scope switching"
    - path: "src/components/ai/ChatHeader.tsx"
      provides: "Header with integrated item scope selector"
  key_links:
    - from: "src/components/tasks/TaskDrawer.tsx"
      to: "src/context/AIChatContext.tsx"
      via: "useAIChat hook registering active task and launching grounded chat"
    - from: "src/components/ai/AIChatDrawer.tsx"
      to: "src/db"
      via: "Live query for searchable tasks, projects, and milestones in scope picker"
---

<objective>
Streamline AI assistant launching and item association across the application. Fix Cmd+J stacking so AIChatDrawer appears above open detail drawers and modals (zIndex 1200), add direct "Ask AI" buttons to TaskDrawer, ProjectDetailModal, MilestoneModal, and ItemInsightView, and provide an in-drawer item picker in AIChatDrawer so users can easily ground chat to any task, project, or milestone.

Purpose: Eliminate friction when asking AI questions about specific tasks, projects, or milestones while viewing details or directly inside the AI drawer.
Output: AIChatContext, updated AppShell, z-index and item picker in AIChatDrawer/ChatHeader, Ask AI buttons in detail views, and passing unit tests.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/components/shell/AppShell.tsx
@src/components/ai/AIChatDrawer.tsx
@src/components/ai/ChatHeader.tsx
@src/components/tasks/TaskDrawer.tsx
@src/components/projects/ProjectDetailModal.tsx
@src/components/projects/MilestoneModal.tsx
@src/views/ItemInsightView.tsx
@tests/ai/AIChatDrawer.test.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create AIChatContext and fix AIChatDrawer z-index and Cmd+J binding</name>
  <files>src/context/AIChatContext.tsx, src/components/shell/AppShell.tsx, src/components/ai/AIChatDrawer.tsx</files>
  <action>
    Create src/context/AIChatContext.tsx defining AIChatContext and useAIChat hook providing:
    - isOpen: boolean
    - openChat: (scope?: ActiveScope) => void
    - closeChat: () => void
    - toggleChat: () => void
    - activeScope: ActiveScope
    - setCustomScope: (scope: ActiveScope) => void
    - registerActiveItem: (scope: ActiveScope | null) => () => void (cleanup callback pattern for drawers/modals)

    In src/components/ai/AIChatDrawer.tsx:
    - Update container style zIndex: when pinned on desktop (and not mobile), keep 100; when unpinned / overlay mode, set zIndex to 1200 (higher than TaskDrawer 1050, Ant Design Modal 1000, and masks) so it reliably renders in front of any active inspection drawer or modal.
    - Support controlled or context-driven activeScope updates without losing user detachment.

    In src/components/shell/AppShell.tsx:
    - Wrap shell contents with AIChatProvider.
    - Connect AppShell shortcut listener for Cmd+J / Ctrl+J to toggleChat(). Ensure the keydown listener runs reliably when focus is inside forms or modals (capture phase or window listener with preventDefault).
    - Forward registered active item to activeScope so Cmd+J automatically grounds to the item currently being inspected.
  </action>
  <verify>
    <automated>npm test -- --run tests/ai/AIChatDrawer.test.tsx</automated>
  </verify>
  <done>AIChatContext is available across the app, AIChatDrawer zIndex in overlay mode is 1200, and Cmd+J toggles drawer without being hidden behind TaskDrawer or Modal.</done>
</task>

<task type="auto">
  <name>Task 2: Add direct Ask AI buttons and active item registration to detail views</name>
  <files>src/components/tasks/TaskDrawer.tsx, src/components/projects/ProjectDetailModal.tsx, src/components/projects/MilestoneModal.tsx, src/views/ItemInsightView.tsx</files>
  <action>
    In src/components/tasks/TaskDrawer.tsx:
    - Use useAIChat hook to register active task while open: registerActiveItem({ type: 'task', id: currentTask.id, title: currentTask.name }).
    - Add an "Hỏi AI" / "Ask AI" button with RobotOutlined icon in the Drawer extra / header actions or footer next to save/close buttons. Clicking calls openChat({ type: 'task', id: currentTask.id, title: currentTask.name }).

    In src/components/projects/ProjectDetailModal.tsx:
    - Use useAIChat hook to register active project while open.
    - Add an "Hỏi AI" button in the modal footer or title actions that calls openChat({ type: 'project', id: project.id, title: project.name }).

    In src/components/projects/MilestoneModal.tsx:
    - When milestone exists, register active milestone with useAIChat.
    - If milestone is not null, provide an "Hỏi AI" button in the modal footer or header that calls openChat({ type: 'milestone', id: milestone.id, title: milestone.name }).

    In src/views/ItemInsightView.tsx:
    - Register current inspected item (task, project, or milestone) with useAIChat.
    - Add an "Hỏi AI" button in the top action bar next to timer / edit buttons that calls openChat({ type: itemType, id: itemId, title: ... }).
  </action>
  <verify>
    <automated>npm test -- --run tests/tasks/TaskDrawer.test.tsx tests/projects/ProjectDetailModal.test.tsx</automated>
  </verify>
  <done>TaskDrawer, ProjectDetailModal, MilestoneModal, and ItemInsightView each contain an explicit Ask AI button and register their active item with AIChatContext.</done>
</task>

<task type="auto">
  <name>Task 3: Add in-drawer item picker in AIChatDrawer and update test suite</name>
  <files>src/components/ai/AIChatDrawer.tsx, src/components/ai/ChatHeader.tsx, tests/ai/AIChatDrawer.test.tsx</files>
  <action>
    In src/components/ai/ChatHeader.tsx and AIChatDrawer.tsx:
    - Query tasks, projects, and milestones from db via useLiveQuery.
    - Replace or augment the static scope tag with an interactive item picker (Select with showSearch and filterOption, or a dropdown menu button).
    - Provide grouped or categorized options:
      - "Toàn cục (Không gắn ngữ cảnh)"
      - "Tác vụ": lists active tasks with status/name
      - "Dự án": lists projects
      - "Mốc": lists milestones
    - When user picks an item, update currentScope in AIChatDrawer (and notify AIChatContext), clear detachment if switched to a valid item, and load the corresponding thread.
    - If currentScope is not global, keep the detach ("Tách riêng") action button or allow selecting "Toàn cục" in the picker to return to global chat.

    In tests/ai/AIChatDrawer.test.tsx:
    - Add test verifying that AIChatDrawer renders with zIndex 1200 in overlay mode.
    - Add test verifying that the item picker lists available items and selecting an item changes the active scope and thread.
    - Add test verifying that calling openChat with an active item sets the grounded scope correctly.
  </action>
  <verify>
    <automated>npm test -- --run tests/ai/AIChatDrawer.test.tsx</automated>
  </verify>
  <done>In-drawer item picker allows switching context between Global, Tasks, Projects, and Milestones directly inside AIChatDrawer, and all AI chat tests pass.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Client UI → IndexedDB | Scope switching accesses local Dexie tables (tasks, projects, milestones, chatThreads) |
| Client UI → 9Router API | Item context prompts include sanitized title and details of selected items |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-quick-01 | Information Disclosure | Item Picker in AIChatDrawer | mitigate | Only query and display local IndexedDB records belonging to current user storage |
| T-quick-02 | Denial of Service | Item Picker live queries | mitigate | Memoize and limit dropdown options to active items; use search filtering rather than loading uncapped payload |
| T-quick-03 | Elevation of Privilege | AIChatContext active item | mitigate | Validate scope types strictly against ChatScopeType ('global', 'task', 'project', 'milestone') |
</threat_model>

<verification>
1. Run `npm test -- --run tests/ai/AIChatDrawer.test.tsx` to verify AI drawer rendering, zIndex, and item picker.
2. Run `npm run test` or check targeted component tests to verify no regressions in TaskDrawer or ProjectDetailModal.
3. Verify build with `npm run build`.
</verification>

<success_criteria>
- AIChatDrawer renders at zIndex 1200 when unpinned, appearing above detail drawers and modals.
- Cmd+J / Ctrl+J functions reliably with open detail drawers and modals.
- TaskDrawer, ProjectDetailModal, MilestoneModal, and ItemInsightView have visible "Ask AI" buttons.
- In-drawer item picker allows changing scope to any task, project, milestone, or global.
- All unit tests pass.
</success_criteria>

<output>
Create `.planning/quick/261003-grt-make-ai-launch-that-associate-t-items-ta/261003-grt-PLAN.md`
</output>
