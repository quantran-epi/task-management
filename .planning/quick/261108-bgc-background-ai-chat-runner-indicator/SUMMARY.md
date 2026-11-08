---
id: 261108-bgc
title: Background AI Chat Runner and Bottom Status Indicator
status: complete
completed: 2026-11-08
---

# Quick Task Summary: Background AI Chat Runner and Bottom Status Indicator

## Changes Made
1. **Created `src/services/ai/aiTurnManager.ts`**:
   - Central singleton service tracking active AI turns (`tabId` / `scopeKey`) across the application runtime.
   - Provides reactive subscription via React `useSyncExternalStore` (`useActiveAiTurns`, `useAiTurn`).
   - Manages turn lifecycle: `registerTurn`, `updateTurn`, `finishTurn`, `abortTurn`, `abortAll`.
2. **Preserved Drawer Tab Runtimes & Removed Unmount Abort (`src/components/ai/runtime/useTabRuntimes.ts`, `src/components/ai/AIChatDrawer.tsx`)**:
   - Lifted `useTabRuntimes` store to module level so in-flight streaming text, tool events, and status persist across drawer unmounts and page/route changes.
   - Preserved `globalTabTurnRegistry` across `AIChatDrawer` mounts so in-flight `runLoop` requests are never orphaned or killed.
   - Removed destructive `abortAll` on unmount and on scope changes in `AIChatDrawer.tsx`.
   - Connected `AIChatDrawer` turn events to `aiTurnManager`.
3. **Enhanced `useChatTurn.ts` (`src/components/ai/runtime/useChatTurn.ts`, `src/components/sdlc/chat/StepChatPanel.tsx`)**:
   - Added `background?: boolean` support to `UseChatTurnOptions`.
   - In background mode, keeps `runtime` in `globalScopeTurnRuntimes` without aborting on unmount.
   - Re-attaches to existing running turn upon component remount, showing streaming response and progress indicator immediately.
   - Enabled `background: true` in `StepChatPanel.tsx`.
4. **Created `src/components/ai/ActiveAiTurnIndicator.tsx`**:
   - Patterned after `ActiveTimerWidget.tsx` using Ant Design theme tokens and styling.
   - Renders `null` when no AI turns are active (zero visual clutter).
   - Single turn: renders pill capsule with spinning icon, title, formatted elapsed ticker, and Stop button with tooltip for manual abort. Clicking the capsule opens/focuses the AI Chat.
   - Multiple turns: renders pill capsule with badge count and dropdown list of running processes with individual abort and "Dừng tất cả" actions.
   - Supports `compact` mode for status bar placement.
5. **Mounted in UI (`src/workbench/StatusBar.tsx`, `src/components/shell/AppShell.tsx`)**:
   - Added `<ActiveAiTurnIndicator compact />` in `StatusBar.tsx` next to `ActiveTimerWidget`.
   - Added `<ActiveAiTurnIndicator />` in `AppShell.tsx` header next to `ActiveTimerWidget`.
6. **Tests**:
   - Added `tests/ai/aiTurnManager.test.ts` (5 tests passing).
   - Added `tests/ai/ActiveAiTurnIndicator.test.tsx` (3 tests passing).
   - Added background unmount test in `tests/ai/useChatTurn.test.tsx` (8 tests passing).
   - Ran scoped suite (6 test files, 62 tests passing).
   - Verified clean `tsc --noEmit`.
