---
id: 261108-bgc
title: Background AI Chat Runner and Bottom Status Indicator
status: in-progress
created: 2026-11-08
---

# Quick Task: Background AI Chat Runner and Bottom Status Indicator

## Problem Statement
1. When a user asks a question in the AI Chat Panel or Common Widget and then switches pages/tabs or closes the drawer, the loading indicator disappears and no response is ever received.
2. Root Cause:
   - AI turn state (`status`, `streamingText`) is stored strictly in React component local state (`useChatTurn`, `useTabRuntimes`, `AIChatDrawer`).
   - When the host component unmounts upon navigation or closing, `useEffect` unmount cleanup calls `runtime.abort()` / `turnRegistry.abortAll()`.
   - The loop catches the `AbortSignal`, aborts the in-flight HTTP request/tool execution, and terminates before saving the assistant message to Dexie (`db.chatMessages`).
   - On remounting, the state starts clean (`idle`), losing all progress.
3. User Requirement:
   - Ensure AI processes keep running in the background even if the chat UI is closed or unmounted.
   - Add a bottom status indicator (similar to `ActiveTimerWidget`) showing active running background AI processes, allowing the user to view progress and manually abort if desired.

## Proposed Solution
1. **Create `src/services/ai/aiTurnManager.ts`**:
   - Singleton service tracking active turns across the entire app lifecycle.
   - Holds active turn metadata: `id`, `scopeKey`, `title`, `status`, `streamingText`, `streamingStatusLabel`, `startedAt`, `abort()`.
   - Native `useSyncExternalStore` subscription hook: `useActiveAiTurns()`.
2. **Lift `useTabRuntimes` & `turnRegistry` in `AIChatDrawer.tsx`**:
   - Persist tab runtime state across drawer unmounts so background streaming/loading persists.
   - Remove automatic `abortAll()` on drawer unmount. Only abort on explicit user action (Stop button / discard tab).
   - Register active turns in `aiTurnManager`.
3. **Update `useChatTurn.ts` (`StepChatPanel.tsx`)**:
   - Register active turn in `aiTurnManager`.
   - Remove automatic `runtime.abort()` on component unmount.
   - Restore active state if a turn is already running for `scopeKey`.
4. **Create `src/components/ai/ActiveAiTurnIndicator.tsx`**:
   - Patterned after `ActiveTimerWidget.tsx`.
   - Returns `null` when 0 active AI turns.
   - When 1 active turn: renders capsule with spinning AI indicator, title/scope, status/elapsed ticker, and manual Abort (Stop) button with tooltip. Clicking opens the chat.
   - When >1 active turns: renders capsule with badge count and dropdown list of running processes with individual and global abort buttons.
   - Supports `compact` prop for statusbar fitting.
5. **Mount `ActiveAiTurnIndicator`**:
   - In `src/workbench/StatusBar.tsx` (bottom status bar).
   - In `src/components/shell/AppShell.tsx` (header bar next to `ActiveTimerWidget`).
6. **Tests**:
   - Add unit tests for `aiTurnManager` and `ActiveAiTurnIndicator`.
   - Verify existing scoped tests pass.
