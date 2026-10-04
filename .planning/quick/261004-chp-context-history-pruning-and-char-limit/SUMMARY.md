---
status: complete
date: 2026-10-04
slug: 261004-chp-context-history-pruning-and-char-limit
---

# Quick Task Summary: Context History Pruning and Char Limit Wiring

## Achievements
1. **Context Grounding Budget Wiring (`src/services/ai/contextGrounding.ts`, `src/components/ai/AIChatDrawer.tsx`)**:
   - Added `charLimit?: number | undefined` to `BuildItemContextPromptOptions`.
   - Updated `buildItemContextPrompt` to dynamically clamp using configured `charLimit` (defaulting to 12,000) and format the truncation notice with the exact limit.
   - Connected `config.charLimit` to all `buildItemContextPrompt` calls for tasks, projects, milestones, and mentioned entities in `AIChatDrawer.tsx`.
2. **Lightweight History & Tool Output Pruning (`src/services/ai/historyPruning.ts`, `src/components/ai/AIChatDrawer.tsx`)**:
   - Created `pruneToolOutputsInMessages`: In multi-loop tool calling turns, retains the most recent 2 tool outputs in full, and truncates older tool outputs (>500 chars) to preserve context tokens.
   - Created `selectMessagesWithinBudget`: Selects recent messages backwards from newest to oldest up to 20 messages while respecting a cumulative character budget (2.5x `charLimit`), guaranteeing the latest message is always preserved.
3. **Verification**:
   - `tests/ai/historyPruning.test.ts` passing (9/9).
   - `tests/ai/contextGrounding.test.ts` passing (10/10).
   - `tests/ai/AIChatDrawer.test.tsx` passing (18/18).
   - `npx tsc --noEmit` verified with 0 errors under `exactOptionalPropertyTypes: true`.
