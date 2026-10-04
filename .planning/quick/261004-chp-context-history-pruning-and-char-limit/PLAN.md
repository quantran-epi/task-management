# Quick Task 261004-chp: Context History Pruning and Char Limit Wiring

## Goal
Wire the configured `ninerouter_char_limit` to context grounding prompt generation and implement lightweight history message and tool output pruning to prevent context window overflow without expensive auto-summarization.

## Requirements
1. **Context Grounding Budget Wiring (`src/services/ai/contextGrounding.ts`, `src/components/ai/AIChatDrawer.tsx`)**:
   - Add `charLimit?: number` to `BuildItemContextPromptOptions`.
   - In `buildItemContextPrompt`, clamp based on `options.charLimit ?? MAX_CONTEXT_CHAR_LIMIT` and format the truncation notice with the actual limit.
   - Pass `charLimit: config.charLimit` from `AIChatDrawer.tsx` when constructing item context and mentioned entities.
2. **Conversation History & Tool Output Pruning (`src/components/ai/AIChatDrawer.tsx`, `src/services/ai/historyPruning.ts`)**:
   - Create a clean, unit-tested pruning helper `pruneConversationHistory`:
     - Truncate older tool outputs in multi-turn tool loops so earlier tool outputs (>500 chars) are condensed to head + `... [Output truncated]`.
     - Budget-aware history selection: instead of blind `slice(-20)`, select up to 20 messages backwards while respecting a cumulative character budget (e.g. 30,000 characters).
3. **Verification**:
   - Add comprehensive tests for `pruneConversationHistory` and custom `charLimit` in `contextGrounding.test.ts`.
   - Verify all AI tests pass and build succeeds.

## Tasks
- [ ] Task 1: Wire `charLimit` option into `contextGrounding.ts` and `AIChatDrawer.tsx`.
- [ ] Task 2: Implement `pruneConversationHistory` utility with tool output truncation and cumulative character budgeting.
- [ ] Task 3: Integrate pruning into `AIChatDrawer.tsx` message packaging and multi-turn tool calling loop.
- [ ] Task 4: Add unit tests in `tests/ai/contextGrounding.test.ts` and `tests/ai/historyPruning.test.ts`.
