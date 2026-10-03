---
status: complete
date: "2026-10-03"
commit: f53b01f
description: AI tool calling harness with Dexie query tools and recognizable loading UI
---

# Quick Task Summary: 261003-tcl-ai-tool-calling-harness

## What Was Done

1. **Hierarchy Context Grounding**:
   - Enhanced `contextGrounding.ts` so project scope queries and injects child milestones and child tasks with statuses, deadlines, and counts.
   - Enhanced milestone scope with parent project metadata and its child tasks.
   - Enhanced task scope with parent project and milestone names.
   - Added `buildGlobalContextPrompt` to summarize active projects and open tasks across the entire workspace in global chat.

2. **Dexie AI Tool Calling System (`src/services/ai/aiTools.ts`)**:
   - Defined OpenAI-compatible function calling schemas:
     - `query_tasks`: filter by `projectId`, `milestoneId`, `status`, `priority`, `search`, and `limit`.
     - `query_projects`: list/search projects with task and milestone counts.
     - `query_milestones`: list/search milestones by project or keyword.
     - `get_item_details`: retrieve full entity details, checklist, and attached sticky notes.
   - Implemented `executeAiTool` to query Dexie directly in browser.

3. **Tool Execution Harness (`src/services/ai/nineRouterClient.ts` & `AIChatDrawer.tsx`)**:
   - Implemented `streamChatEvents` to parse SSE delta streams, aggregating `tool_calls` chunks and delta text.
   - Built multi-turn tool calling loop in `AIChatDrawer.tsx`: detects tool calls, executes against Dexie, feeds tool outputs back to 9router, and streams final answer.
   - Added automatic fallback to standard text completion if a model does not support function calling tools.

4. **Recognizable Loading UI**:
   - Added `streamingStatus` state tracking ("Đang kết nối 9router...", "Đang truy vấn cơ sở dữ liệu...", "Đang tổng hợp thông tin...").
   - Replaced empty cursor in `ChatMessageBubble.tsx` with an animated loading card featuring Ant Design `Spin` (`LoadingOutlined`), pulsing indicator, and dynamic task status tag.

5. **Test Coverage**:
   - Added tests in `tests/ai/contextGrounding.test.ts` for project child tasks/milestones and global workspace summary.
   - Added `tests/ai/aiTools.test.ts` for all 4 tools against mock DB.
   - Added tool-call SSE parsing test in `tests/ai/nineRouterClient.test.ts`.
   - Added end-to-end tool-calling loop test in `tests/ai/AIChatDrawer.test.tsx`.
   - All 58 AI tests passed. `npm run build` succeeded.
