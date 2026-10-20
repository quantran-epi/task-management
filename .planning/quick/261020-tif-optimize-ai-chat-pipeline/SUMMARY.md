---
title: "Optimize AI Chat Pipeline"
status: complete
date: 2026-10-20
slug: 261020-tif-optimize-ai-chat-pipeline
---

# Quick Task Summary: Optimize AI Chat Pipeline (Drawer First)

## Changes Implemented
1. **Dynamic MCP Granularity Rules (`mcpRetrievalRunner.ts`)**:
   - Replaced plain prompt with domain-agnostic Information Depth / Granularity Rules.
   - Instructed planner to never mark `done: true` when a query requests specific attributes/fields but retrieved data only has container/table/node names.
   - Increased max budget from 3 to 4 turns, with timeout expanded to 20s.
2. **MCP Output Pruning (`mcpRetrievalRunner.ts`)**:
   - Added `pruneMcpRawResult` to strip embedding vectors, heavy visual metadata, and large raw chunks before injecting into EvidencePack and LLM tool calling contexts.
3. **Contextual Tool Pruning (`aiTools.ts` & `AIChatDrawer.tsx`)**:
   - Implemented `pruneToolsForContext` to selectively strip out 15+ personal operational and task manipulation tools (`create_task`, `start_timer`, `query_worklogs`, etc.) when executing knowledge / continuation / technical turns.
   - Applied tool pruning in `AIChatDrawer.tsx` when preparing `toolsForTurn` for `streamChatEvents`.
4. **Architecture Trace Documentation (`docs/traces/unified-ai-chat-pipeline.md`)**:
   - Recorded the entire unified chat pipeline engine, sequence of steps (IntentRouter -> Scope Guard -> Parallel Retrieval & MCP Granularity -> Short Circuit / Continuation -> Contextual Tool Pruning -> Final Output Format).

## Verification
- TypeScript build (`npx tsc --noEmit`) passes with 0 errors.
- Vitest suite for `tests/ai/mcpClient.test.ts` and `tests/ai/aiTools.test.ts` passed 61/61 tests.
