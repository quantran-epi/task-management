# Quick Plan: 261003-tcl-ai-tool-calling-harness

AI tool calling harness with Dexie query tools, hierarchy context grounding, and recognizable loading UI.

## Context
User reported:
- When asking "how many tasks contain in this project", the AI responds "none" despite having tasks and milestones inside.
- Single entity serialization previously omitted child tasks/milestones.
- User wants an intelligent tool-calling harness (similar to Claude Code CLI harness) where AI can query Dexie IndexedDB on demand.
- User wants recognizable loading UI during AI thinking/tool-calling/streaming.

## Tasks

### Task 1: Hierarchy Context Grounding (Immediate baseline)
- In `src/services/ai/contextGrounding.ts`:
  - Enhance `serializeProjectContext` and `buildItemContextPrompt`: query child milestones and child tasks from Dexie `db`. Include count and summary (name, status, priority, deadline).
  - Enhance milestone context: include parent project name and child tasks.
  - Enhance task context: include parent project and milestone names.
  - Add global context summary: active projects and top pending tasks when in global scope.
  - Respect 12,000 character context ceiling.

### Task 2: Dexie Query Tools & Schemas
- Create `src/services/ai/aiTools.ts`:
  - OpenAI-compatible function tool definitions:
    - `query_tasks`: parameters `{ projectId?, milestoneId?, status?, search?, limit? }`
    - `query_projects`: parameters `{ status?, search?, limit? }`
    - `query_milestones`: parameters `{ projectId?, status?, search?, limit? }`
    - `get_item_details`: parameters `{ type: 'task'|'project'|'milestone', id: string }`
  - Tool execution function `executeAiTool(name, args, db)` querying Dexie directly.

### Task 3: Tool-Calling Loop & 9Router Client Enhancement
- In `src/services/ai/types.ts`:
  - Add tool definitions and tool messages (`role: 'tool' | 'function' | 'assistant' with tool_calls`).
- In `src/services/ai/nineRouterClient.ts`:
  - Enhance streaming or support chat completion with tools.
  - Handle tool call chunk assembly from SSE delta (`delta.tool_calls`) or non-streaming fallback.
  - Return generator events: `{ type: 'text', delta: string } | { type: 'tool_call', calls: ToolCall[] }`.
- In `AIChatDrawer.tsx`:
  - Orchestrate tool loop: if model calls tool(s), update status ("Đang tra cứu dữ liệu..."), execute tools via Dexie, append tool response messages, and make subsequent call to stream final answer. Limit max tool iterations (e.g. 5) to prevent infinite loops.

### Task 4: Recognizable Loading & Status UI
- In `src/components/ai/AIChatDrawer.tsx`, `ChatMessageList.tsx`, `ChatMessageBubble.tsx`:
  - Support `statusMessage` (e.g., "Đang kết nối 9router...", "Đang tra cứu dữ liệu...", "Đang tạo câu trả lời...").
  - When streaming starts and `streamingText` is empty, show a distinct animated loading card with spinner, pulsing dots, and status indicator instead of an almost-invisible blank cursor.
  - Clean styling in Ant Design matching theme tokens.

### Task 5: Tests and Verification
- Unit tests for `contextGrounding.ts` (child task/milestone serialization).
- Unit tests for `aiTools.ts` (tool execution against `fake-indexeddb`).
- Unit tests for `nineRouterClient.ts` / tool loop / loading states.
- Run `npm test` and `npm run build`.

## Verification
- Ask AI about tasks in project -> AI responds with accurate task count and names.
- Tool call triggers seamlessly when asking cross-entity questions.
- Loading indicator is prominent, clear, and informative.
