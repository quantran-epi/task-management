---
phase: quick
plan: 261003-cmd
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/ai/ChatInputBar.tsx
  - src/components/ai/AIChatDrawer.tsx
  - src/components/ai/ChatMessageBubble.tsx
  - tests/ai/ChatInputBar.test.tsx
  - tests/ai/AIChatDrawer.test.tsx
autonomous: true
requirements:
  - AI-CHAT-COMMAND-PALETTE-AND-AUTOCOMPLETE
user_setup: []
must_haves:
  truths:
    - "Typing # in AI Chat input triggers project autocompletion from Dexie DB."
    - "Typing @ in AI Chat input triggers task autocompletion from Dexie DB."
    - "Typing / in AI Chat input triggers command palette (/clear, /plan, /status, /overdue, /help)."
    - "Selecting a task or project mention inserts markdown-link entity syntax (@[Task Name](task:id) / #[Project Name](project:id))."
    - "Submitting a message with mentions extracts entity IDs, fetches full data from Dexie, and injects serialized context into AI system prompt for 100% accuracy."
    - "Chat message bubbles render mentioned task and project tags cleanly."
  artifacts:
    - path: "src/components/ai/ChatInputBar.tsx"
      provides: "Ant Design Mentions input supporting @, #, and / triggers with top-opening dropdown"
    - path: "src/components/ai/AIChatDrawer.tsx"
      provides: "Mention parsing, Dexie entity retrieval, and system context injection for mentions"
    - path: "src/components/ai/ChatMessageBubble.tsx"
      provides: "Visual pill rendering for user message mentions"
    - path: "tests/ai/ChatInputBar.test.tsx"
      provides: "Unit tests for mentions and command palette triggers"
---

<tasks>
<task>
  <name>Task 1: Implement Mentions and Command Palette in ChatInputBar</name>
  <files>
    - src/components/ai/ChatInputBar.tsx
  </files>
  <action>
    Replace Input.TextArea with Ant Design Mentions.
    Add props for db (TaskPlannerDatabase) or query tasks and projects via useLiveQuery.
    Configure prefix=['@', '#', '/'], placement="top", and custom validateSearch.
    Format option labels with tags/icons and option values as markdown link entities.
    Maintain Cmd+Enter / Ctrl+Enter send mechanics and input clearing.
  </action>
</task>
<task>
  <name>Task 2: Implement Mention Extraction and Context Injection in AIChatDrawer</name>
  <files>
    - src/components/ai/AIChatDrawer.tsx
    - src/components/ai/ChatMessageBubble.tsx
  </files>
  <action>
    Parse prompt for @[...](task:id) and #[...](project:id).
    Fetch entity records from Dexie and serialize via serializeTaskContext and serializeProjectContext.
    Inject <mentioned_entities> into system prompt.
    Expand slash commands (/plan, /status, /overdue, /help) into actionable prompts.
    Update ChatMessageBubble to render user mentions as Ant Design tags.
  </action>
</task>
<task>
  <name>Task 3: Add comprehensive tests and verify</name>
  <files>
    - tests/ai/ChatInputBar.test.tsx
    - tests/ai/AIChatDrawer.test.tsx
  </files>
  <action>
    Add tests for mentions search, selection, slash commands, and context injection.
    Verify all existing and new tests pass.
  </action>
</task>
</tasks>
