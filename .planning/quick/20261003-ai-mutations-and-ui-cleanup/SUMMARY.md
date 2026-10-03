---
status: complete
date: 2026-10-03
slug: ai-mutations-and-ui-cleanup
---

# Quick Task Summary: AI Drawer Header Cleanup, Action Mutations with Confirmation, and Inline Input

## Accomplishments
1. **Header Context Picker Removal**: Removed redundant scope picker from `ChatHeader.tsx`. Cleaned up unused props in `AIChatDrawer.tsx` (all scope selection handled by the dedicated sub-bar with "Đổi" and "Gỡ" buttons).
2. **Comprehensive AI Mutation Tools**:
   - Added 26 action tools covering tasks, projects, milestones, allocations, work sessions, live timers, capacity rules, overrides, and notes.
   - Added `isMutationTool` and `describeToolMutation` helpers for tool categorization and user-friendly Vietnamese action descriptions.
3. **Interactive User Confirmation**:
   - Added inline confirmation card (`ai-mutation-confirmation`) in `ChatMessageList.tsx` with summary and simple `[Có (Yes)]` / `[Không (No)]` buttons.
   - Integrated confirmation promise loop into `AIChatDrawer.tsx`.
   - Enabled text confirmation ("yes" / "no" / "có" / "không") via chat input bar.
   - Added rule #6 to system prompt instructing model to use action mutation tools when requested.
4. **Inline Send Button Layout**:
   - Updated `ChatInputBar.tsx` layout to flex row with `alignItems: 'flex-end'` and `autoSize={{ minRows: 1, maxRows: 5 }}` to reduce vertical height.
5. **Targeted Testing**:
   - Updated and added test suites in `tests/ai/` (13 files, 103 tests passing).
   - Clean TypeScript check with zero errors via `npx tsc --noEmit`.
