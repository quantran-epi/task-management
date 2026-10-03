---
phase: quick
plan: 261003-pop
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/ai/ChatInputBar.tsx
  - src/types/navigation.ts
  - src/hooks/useHashRoute.ts
  - src/utils/aiPopout.ts
  - src/views/AIPopoutView.tsx
  - src/App.tsx
  - src/components/ai/ChatHeader.tsx
  - src/components/ai/AIChatDrawer.tsx
  - src/utils/documentLinks.ts
  - src-tauri/src/jira_proxy.rs
  - tests/ai/ChatMessageBubble.test.tsx
  - tests/ai/aiPopout.test.ts
autonomous: true
requirements:
  - FIX-AI-CMD-ENTER-CLEAR
  - AI-DRAWER-POPOUT-AND-RESIZABLE
  - LOCAL-PATH-CLAUDE-SHORTCUT-AND-PICKER
user_setup: []
must_haves:
  truths:
    - "Typing and pressing Cmd+Enter / Ctrl+Enter completely clears the ChatInputBar without leaving the last character or trailing IME composition."
    - "AI chat can pop out into a standalone resizable window via openAiPopout in both Tauri and web browser."
    - "The AI popout window is resizable and pinable (always-on-top in desktop Tauri)."
    - "Clicking a local path opens a choice modal allowing user to pick between opening File Explorer or launching Command Prompt / Terminal with Claude Code at that path (with Alt+Click quick shortcut)."
---

<tasks>
<task>
  <name>Task 1: Fix Cmd+Enter input clearing in ChatInputBar</name>
  <files>
    - src/components/ai/ChatInputBar.tsx
    - tests/ai/ChatMessageBubble.test.tsx
  </files>
  <action>
    Fix ChatInputBar retaining the last character of the message after Cmd+Enter.
    Hold a lock `isSubmittingRef.current = true` with a timeout of 200ms across event cycles.
    In `onChange`, if the lock is held, purge `e.target.value = ''` and call `setValue('')`.
    In `onCompositionEnd`, if lock is held, purge `e.target.value = ''` and call `clearInput()`.
    In `handleKeyDown`: read the message from state or target element before clearing, clear native element and state, call `onSubmit`, and keep lock active for 200ms to absorb trailing IME or input events.
    Add unit test in tests/ai/ChatMessageBubble.test.tsx verifying input is fully cleared even if an onChange event follows Cmd+Enter.
  </action>
  <verify>
    npx vitest run tests/ai/ChatMessageBubble.test.tsx
  </verify>
  <done>
    ChatInputBar input field is completely cleared on Cmd+Enter without trailing character.
  </done>
</task>

<task>
  <name>Task 2: Implement AI popout standalone resizable & pinable window</name>
  <files>
    - src/types/navigation.ts
    - src/hooks/useHashRoute.ts
    - src/utils/aiPopout.ts
    - src/views/AIPopoutView.tsx
    - src/App.tsx
    - src/components/ai/ChatHeader.tsx
    - src/components/ai/AIChatDrawer.tsx
    - tests/ai/aiPopout.test.ts
  </files>
  <action>
    1. Create `src/utils/aiPopout.ts` matching existing `notesPopout.ts` and `timerPopout.ts` pattern:
       - Export `AI_POPOUT_LABEL = 'ai-popout'`
       - Export `openAiPopout(scope?: { type: string; id?: string; title?: string }): Promise<void>`
       - Support Tauri WebviewWindow with title 'Trợ lý AI', width: 480, height: 720, minWidth: 360, minHeight: 480, resizable: true, alwaysOnTop: true.
       - Browser fallback: `window.open(buildAiPopoutUrl(base, scope), 'task-planner-ai-popout', 'width=480,height=720,resizable=yes')`.
       - Window pin functions: `isAiWindowAlwaysOnTop`, `setAiWindowAlwaysOnTop`, `closeCurrentAiPopoutWindow`.
    2. Add `'ai-popout'` route to `src/types/navigation.ts` and `src/hooks/useHashRoute.ts`.
    3. Create `src/views/AIPopoutView.tsx` with full ChatHeader, ChatMessageList, ChatInputBar, ScopePickerModal, AIDebugModal, and alwaysOnTop pin toggle.
    4. Connect route in `src/App.tsx`.
    5. In `ChatHeader.tsx`: add Popout button (`ExportOutlined`) when `onPopout` callback is provided.
    6. In `AIChatDrawer.tsx`: provide `onPopout` that calls `openAiPopout(currentScope)` and `onClose()`.
    7. Add unit tests for `aiPopout.ts` in `tests/ai/aiPopout.test.ts`.
  </action>
  <verify>
    npx vitest run tests/ai/aiPopout.test.ts tests/ai/AIChatDrawer.test.tsx
  </verify>
  <done>
    AI drawer has popout button, opens resizable and pinable standalone window in both Tauri and browser.
  </done>
</task>

<task>
  <name>Task 3: Local path action picker modal and Claude Code terminal shortcut</name>
  <files>
    - src/utils/documentLinks.ts
    - src-tauri/src/jira_proxy.rs
    - tests/utils/documentLinks.test.ts
  </files>
  <action>
    1. In `src-tauri/src/jira_proxy.rs`: update `launch_claude_terminal` to allow commands starting with `cd ` and containing `&& claude`, or starting with `claude`.
    2. In `src/utils/documentLinks.ts`:
       - Add `launchClaudeAtLocalPath(path: string)`:
         - In Tauri: invokes `launch_claude_terminal` with command `cd '<clean_path>' && claude`.
         - In Web: copies `cd "<clean_path>" && claude` to clipboard and shows toast notice.
       - Update `openDocumentLink(urlOrPath: string, options?: { quickClaude?: boolean })`:
         - If `options?.quickClaude` is true (e.g. Alt+Click): directly invoke `launchClaudeAtLocalPath`.
         - If local path: display an Ant Design interactive choice modal / prompt with options:
           - Option 1: "Mở Trình duyệt tệp" (File Explorer / Finder) -> calls `openLocalPath`.
           - Option 2: "Mở Claude Code trong Terminal" (Terminal / Claude CLI) -> calls `launchClaudeAtLocalPath`.
           - Option 3: "Hủy" (Cancel).
         - If web link: open as normal.
    3. Add unit tests in `tests/utils/documentLinks.test.ts`.
  </action>
  <verify>
    npx vitest run tests/utils/documentLinks.test.ts && cargo check --manifest-path src-tauri/Cargo.toml
  </verify>
  <done>
    Clicking any local path prompts user to choose File Explorer vs Command Prompt with Claude Code, with direct shortcut support.
  </done>
</task>
</tasks>
