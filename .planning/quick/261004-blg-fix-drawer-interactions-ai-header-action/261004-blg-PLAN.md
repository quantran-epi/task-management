# Quick Task 261004-blg: Fix Drawer Interactions, AI Header Actions, Chat Input Height, Task Planner Instructions Modal, and Rename to PlannerMate

## Goal
1. When user clicks "Ask AI" in Task Drawer, hide the Task Drawer.
2. In AI Drawer header, keep Popout, Clear Context, and Close directly visible; collapse all other tools (Auto-Approve, Pin, Debug, and new Instructions tool) into a compact Dropdown menu.
3. Shorten Chat Input Bar placeholder so it stays on a single line matching the Send button height, and autofocus input on drawer open.
4. Add "AI Task Planner Instructions" modal triggered from the AI drawer header dropdown.
5. Rename the app app-wide to PlannerMate.

## Tasks

### Task 1: Task Drawer and AI Drawer Header Actions & Instructions Modal
- **Files**:
  - `src/components/tasks/TaskDrawer.tsx`
  - `src/components/ai/ChatHeader.tsx`
  - `src/components/ai/AITaskPlannerInstructionsModal.tsx`
  - `src/components/ai/AIChatDrawer.tsx`
- **Action**:
  - In `TaskDrawer.tsx`, call `handleClose()` in `handleAskAI()` to dismiss the task drawer when opening AI chat.
  - Create `AITaskPlannerInstructionsModal.tsx` providing a comprehensive, elegant Ant Design modal detailing AI task planner usage, slash commands (`/plan`, `/status`, `/overdue`, `/clear`, `/help`), shortcuts (`@`, `#`), tool mutations, auto-approve mode, and grounding anti-hallucination rules.
  - In `ChatHeader.tsx`, retain model select, popout button, clear context button, and close button in the main bar; collapse remaining tools into a Dropdown menu (`MoreOutlined`) containing:
    - AI Task Planner Instructions
    - Auto-approve mutations toggle
    - Pin drawer toggle
    - Debug logs (if provided)
  - In `AIChatDrawer.tsx`, integrate `AITaskPlannerInstructionsModal` state and trigger it via `onOpenInstructions` on `ChatHeader`.
- **Verify**: `npx vitest run tests/ai/AIChatDrawer.test.tsx` passes with updated header structure.

### Task 2: Chat Input Bar Single-Line Height and Auto-Focus
- **Files**:
  - `src/components/ai/ChatInputBar.tsx`
  - `src/components/ai/AIChatDrawer.tsx`
- **Action**:
  - Shorten default placeholder in `ChatInputBar.tsx` to `Hỏi AI... (@, #, /)` to prevent wrapping in default drawer width.
  - Set `styles.textarea` padding and line-height so 1-line text height matches the 32px Send button.
  - Add `autoFocus?: boolean` prop in `ChatInputBar.tsx` and pass `open` from `AIChatDrawer.tsx` to focus the textarea whenever the AI drawer opens.
- **Verify**: Component renders with 1-line input matching send button and focuses input when drawer opens.

### Task 3: App-Wide Rename to PlannerMate
- **Files**:
  - `index.html`
  - `vite.config.ts`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
  - `src/components/shell/AppShell.tsx`
  - `src/components/ai/AIChatDrawer.tsx`
  - `src/components/ai/ChatMessageBubble.tsx`
  - `src/components/ai/ChatMessageList.tsx`
  - `src/components/settings/NotificationSettingsCard.tsx`
  - `src/hooks/useDesktopNotification.ts`
  - `src/services/ai/aiTools.ts`
  - `tests/shell.test.tsx`
  - `tests/hooks/useDesktopNotification.test.ts`
  - `tests/components/settings/NotificationSettingsCard.test.tsx`
  - `CLAUDE.md`
- **Action**:
  - Replace "Personal Task & Workload Planner", "Personal Task and Workload Planner", and "Task Planner" (where branding/app title) with "PlannerMate".
  - Update associated test assertions.
- **Verify**: `npx vitest run tests/shell.test.tsx tests/hooks/useDesktopNotification.test.ts tests/components/settings/NotificationSettingsCard.test.tsx` pass.
