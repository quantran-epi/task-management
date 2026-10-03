---
phase: quick
plan: 261003-pop
status: complete
date: 2026-10-03
files_modified:
  - src/components/ai/ChatInputBar.tsx
  - src/types/navigation.ts
  - src/hooks/useHashRoute.ts
  - src/utils/aiPopout.ts
  - src/views/AIPopoutView.tsx
  - src/App.tsx
  - src/components/ai/ChatHeader.tsx
  - src/components/ai/AIChatDrawer.tsx
  - src/utils/documentLinks.tsx
  - src/components/tasks/TaskTable.tsx
  - src/components/projects/ProjectTable.tsx
  - src/components/projects/ProjectDetailModal.tsx
  - src/views/ItemInsightView.tsx
  - src-tauri/src/jira_proxy.rs
  - tests/ai/ChatMessageBubble.test.tsx
  - tests/ai/aiPopout.test.ts
  - tests/utils/documentLinks.test.ts
---

# Quick Task Summary: Fix AI Input Cmd+Enter Clearing, Resizable & Pinable AI Popout Window, and Claude Shortcut for Local Paths

## Accomplishments
1. **Fixed AI Input Cmd+Enter Clearing**:
   - Prevented trailing last character or IME composition from lingering in `ChatInputBar.tsx`.
   - Held submission lock `isSubmittingRef.current = true` across microtasks and event loops with a 250ms debounce window.
   - Cleared native DOM value, purged React state on `onChange`, `onInput`, and `onCompositionEnd` during submission lock.
   - Added unit tests in `ChatMessageBubble.test.tsx` verifying clean clearing.

2. **Added Resizable & Pinable AI Popout Window**:
   - Created `src/utils/aiPopout.ts` supporting Tauri secondary WebviewWindow (`ai-popout`) with Always on Top, geometry persistence, and browser popup fallback.
   - Created `src/views/AIPopoutView.tsx` and wired `'ai-popout'` hash route in `App.tsx`, `useHashRoute.ts`, and `navigation.ts`.
   - Added popout button (`ExportOutlined`) to `ChatHeader.tsx` and `AIChatDrawer.tsx` to pop out from the drawer.
   - Supports pin toggle (always-on-top in desktop Tauri) and resizable dimensions.
   - Added unit tests in `tests/ai/aiPopout.test.ts`.

3. **Local Path Prompt Modal & Claude Code Shortcut**:
   - Created `promptLocalPathAction`, `openLocalPathInExplorer`, and `launchClaudeAtLocalPath` in `src/utils/documentLinks.tsx`.
   - Clicking a local path displays an interactive modal with options:
     - Open in File Explorer / Finder (`openLocalPathInExplorer`).
     - Open in Command Prompt / Terminal with Claude Code (`launchClaudeAtLocalPath` running `cd '<path>' && claude`).
   - Added shortcut: `Alt+Click` on any local path link immediately launches Claude Code in terminal without prompting.
   - Updated security check in `src-tauri/src/jira_proxy.rs` to allow `cd '<path>' && claude`.
   - Added unit tests in `tests/utils/documentLinks.test.ts`.

## Verification
- `npm run build`: built client environment and PWA assets successfully in <1s.
- `cargo check --manifest-path src-tauri/Cargo.toml`: passed with zero warnings.
- `npm run test tests/ai/ tests/utils/`: 273 tests in 28 files passed.
