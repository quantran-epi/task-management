# Quick Task 261004-blg: Fix Drawer Interactions, AI Header Actions, Chat Input Height, Task Planner Instructions Modal, and Rename to PlannerMate Summary

Fixed task drawer detail interaction when launching AI chat, streamlined AI drawer header tools into a compact dropdown menu, shortened chat input placeholder to achieve 1-line alignment matching the Send button with auto-focus on open, created an AI task planner instructions modal, and renamed the application app-wide to PlannerMate.

## Accomplishments

1. **Dismiss Task Drawer on "Ask AI" (`src/components/tasks/TaskDrawer.tsx`)**
   - Updated `handleAskAI` to call `handleClose()`, automatically closing the task detail drawer when opening the AI assistant.

2. **Streamlined AI Drawer Header & Dropdown Collapse (`src/components/ai/ChatHeader.tsx`, `AIChatDrawer.tsx`)**
   - Header directly exposes only: Model Select, Popout, Clear Context, Dropdown Menu (More), and Close.
   - Collapsed Auto-Approve Mutations toggle, Pin/Unpin drawer, Debug logs, and the new Instructions action into an Ant Design Dropdown menu.

3. **AI Task Planner Instructions Modal (`src/components/ai/AITaskPlannerInstructionsModal.tsx`)**
   - Created dedicated modal component triggered from the AI drawer header dropdown.
   - Details quick syntax shortcuts (`@` for tasks, `#` for projects, `/` for slash commands), slash commands (`/plan`, `/status`, `/overdue`, `/clear`), data mutations and auto-approve mode, and anti-hallucination grounding principles.

4. **Chat Input Bar Height & Auto-Focus (`src/components/ai/ChatInputBar.tsx`, `AIChatDrawer.tsx`)**
   - Shortened placeholder to `'Hỏi AI... (@, #, /)'` preventing multi-line wrapping in standard drawer widths.
   - Refined textarea line-height (22px) and padding (4px 11px) to align single-line height at 32px matching the Send button.
   - Added `autoFocus` prop and hooked it to `open` state in `AIChatDrawer`, focusing the input automatically when the drawer opens.

5. **App-Wide Rebranding to PlannerMate**
   - Updated `index.html` (title & meta description), `vite.config.ts` (PWA manifest name & short_name), `src-tauri/tauri.conf.json` & `Cargo.toml`.
   - Updated UI headers in `AppShell.tsx`, AI assistant prompt and headers (`AIChatDrawer.tsx`, `ChatMessageBubble.tsx`, `ChatMessageList.tsx`), notification messages (`NotificationSettingsCard.tsx`, `useDesktopNotification.ts`), and AI tool definitions (`aiTools.ts`).
   - Updated all corresponding unit tests and documentation (`CLAUDE.md`).

## Verification

- Targeted automated test suite: `npx vitest run tests/shell.test.tsx tests/hooks/useDesktopNotification.test.ts tests/components/settings/NotificationSettingsCard.test.tsx tests/ai/AIChatDrawer.test.tsx tests/ai/aiTools.test.ts` (5 test files, 68 tests passed).
- Production build: `npm run build` executed with `tsc && vite build` and completed with zero errors.

## Commits

- `6765104`: `fix(ai): dismiss task drawer on ask ai, collapse header tools to dropdown, and add instructions modal`
- `3859dff`: `fix(ai): shorten placeholder for single-line input height and autofocus on open`
- `ade0453`: `feat(branding): rename application app-wide to PlannerMate`
