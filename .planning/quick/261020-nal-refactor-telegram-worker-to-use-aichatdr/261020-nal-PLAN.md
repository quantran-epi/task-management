---
phase: quick-261020-nal
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/services/telegram/telegramHeadlessWorker.ts
  - tests/telegram/telegramHeadlessWorker.test.ts
autonomous: true
requirements:
  - TELEGRAM-AICHAT-TOOL-LOOP
must_haves:
  truths:
    - "Telegram worker uses AIChatDrawer-style multi-turn tool execution loop with streamChatEvents for operational/query turns instead of manual TaskMate context stuffing"
    - "Only read/query tools (filtered from AI_DATABASE_TOOLS, excluding mutation tools) are exposed to normal Telegram user turns; admin mutation turns remain protected in existing executeAdminMutationTurn flow"
    - "When read tools return results, model synthesizes complete answer grounded in tool outputs"
    - "Scope security gate (tasks_only vs knowledge_only vs pure_llm) remains strictly enforced before tool execution"
    - "Regression tests prove project/task detail queries invoke tools and synthesize accurate answers, and build typecheck passes"
  artifacts:
    - path: "src/services/telegram/telegramHeadlessWorker.ts"
      provides: "Multi-turn tool loop using streamChatEvents with AI_DATABASE_TOOLS read-only subset"
    - path: "tests/telegram/telegramHeadlessWorker.test.ts"
      provides: "Regression tests verifying tool execution loop and response synthesis"
  key_links:
    - from: "src/services/telegram/telegramHeadlessWorker.ts"
      to: "src/services/ai/aiTools.ts"
      via: "AI_DATABASE_TOOLS, executeAiTool, isMutationTool"
      pattern: "executeAiTool"
    - from: "src/services/telegram/telegramHeadlessWorker.ts"
      to: "src/services/ai/nineRouterClient.ts"
      via: "streamChatEvents"
      pattern: "streamChatEvents"
---

<objective>
Refactor Telegram headless worker's operational/query_taskmate path from brittle manual string context stuffing to AIChatDrawer-style interactive read tool execution loop via streamChatEvents.

Purpose:
Prevent context truncation and hallucinations when users query project, milestone, or task details over Telegram. Allow the LLM to call query_tasks, query_projects, get_item_details, and other read tools on demand, mirroring AIChatDrawer, while strictly preserving admin mutation confirmation boundaries.

Output:
Updated telegramHeadlessWorker.ts with clean read-tool loop, enhanced test suite in telegramHeadlessWorker.test.ts, and verified typecheck/build.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@src/components/ai/AIChatDrawer.tsx
@src/services/telegram/telegramHeadlessWorker.ts
@src/services/ai/aiTools.ts
@src/services/ai/nineRouterClient.ts
@src/services/telegram/telegramMutationSession.ts
@tests/telegram/telegramHeadlessWorker.test.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace manual TaskMate string context stuffing with AIChatDrawer read-tool loop in telegramHeadlessWorker.ts</name>
  <files>src/services/telegram/telegramHeadlessWorker.ts</files>
  <action>
Refactor Step 7 and Step 8 in processTelegramInboundMessage:
1. In telegramHeadlessWorker.ts, import AI_DATABASE_TOOLS, executeAiTool, isMutationTool, and normalizeToolName from ../ai/aiTools. Also import pruneToolOutputsInMessages from ../ai/historyPruning and stripThinkingBlocks from ../ai/nineRouterClient.
2. Filter tools for Telegram query turns to read-only tools:
   Filter AI_DATABASE_TOOLS where !isMutationTool(tool.function.name).
   If dataScope === 'pure_llm', pass no tools ([]).
   If dataScope === 'tasks_only', include read tools for tasks, projects, milestones, worklogs, analytics, etc. (exclude note tools if any, or keep general read tools).
   If dataScope === 'knowledge_only', normal flow already directs or scope-gates knowledge queries.
3. Remove manual string stuffing in Step 7 and Step 8 (resolveScopedContext call for TaskMate context). Prompt only needs base system instructions and anti-hallucination rules (mirroring AIChatDrawer lines 1074-1083), instructing the model:
   - Current Date and Time.
   - Anti-hallucination rules: Call database tools to fetch requested task/project/item details instead of assuming or extrapolating.
   - If requested item does not exist, explicitly state not recorded.
   - Keep markdown formatted cleanly for Telegram reading.
4. Implement iterative tool loop (up to 5 loops max, similar to AIChatDrawer and telegramMutationSession):
   - In each loop, call streamChatEvents({ endpoint, apiKey, payload: { model, messages, tools: readTools, temperature: 0.1 } }).
   - Accumulate text chunks, handle tool_calls chunks and usage chunks.
   - If tool_calls are emitted:
     * Push assistant message with tool_calls.
     * For each call, check isMutationTool(tc.function.name). If any mutation tool is attempted on this non-admin query path, return error message string: "Thao tác thay đổi dữ liệu yêu cầu quyền Admin hoặc lệnh cụ thể."
     * Otherwise, call executeAiTool(tc.function.name, args, db).
     * Push tool result message { role: 'tool', tool_call_id: tc.id, name: tc.function.name, content: toolResult }.
   - If no tool calls, break loop.
5. If tool calls occurred and !rawAiResponse.trim() or after loop exits with tools called, run final synthesis pass or ensure assistant text is emitted, exactly as in AIChatDrawer (lines 1395-1432).
6. Ensure existing admin mutation path (executeAdminMutationTurn), knowledge federated retrieval (runGroundedTurn), scope security gates, slash commands, and quota logic remain 100% intact and unaffected.
  </action>
  <verify>
    <automated>npx vitest run tests/telegram/telegramHeadlessWorker.test.ts</automated>
  </verify>
  <done>
Telegram query turns invoke read tools dynamically via streamChatEvents without manual TaskMate context stuffing; mutation attempts in read loop are rejected; tests pass.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add regression tests for Telegram tool-driven project query and synthesis, and verify build</name>
  <files>tests/telegram/telegramHeadlessWorker.test.ts</files>
  <action>
1. In tests/telegram/telegramHeadlessWorker.test.ts, add comprehensive test case:
   - Seeds project with milestones and tasks in testDb.
   - Sets user chatId: 'query_tool_user' with dataScope: 'full'.
   - Mocks streamChatEvents to simulate first yield with type: 'tool_calls' calling get_item_details or query_tasks, followed by second turn yielding type: 'text' summarizing project tasks.
   - Dispatches processTelegramInboundMessage with text "Cho tôi biết chi tiết dự án Core Banking".
   - Verifies mockStreamChatEvents was invoked with tools containing read tools (query_tasks, get_item_details), tool was executed against testDb, and final reply sent to user contains synthesized project detail.
2. Add test case ensuring non-admin users cannot trigger mutation tools even if model attempts to emit mutation tool call during query turn (returns refusal/rejection in tool result, does not mutate DB).
3. Update existing tests in telegramHeadlessWorker.test.ts that asserted on previous string context stuffing behavior to match tool loop payload structure.
4. Run targeted tests and verify full project typecheck via npm run build.
  </action>
  <verify>
    <automated>npx vitest run tests/telegram/telegramHeadlessWorker.test.ts tests/telegram/telegramAdminMutation.test.ts && npm run build</automated>
  </verify>
  <done>
All Telegram worker unit tests pass, new regression tests prove tool execution loop works for project detail queries, and npm run build succeeds without type or bundle errors.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Telegram inbound message -> AI tool execution | Untrusted remote input from Telegram user triggers tool loop |
| AI tool execution -> IndexedDB | Local database read/write boundary |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-NAL-01 | Elevation of Privilege | telegramHeadlessWorker.ts | mitigate | Filter AI_DATABASE_TOOLS to only read/query tools. If LLM attempts mutation tool during query turn, reject execution and return error tool result without modifying DB. |
| T-NAL-02 | Information Disclosure | telegramHeadlessWorker.ts | mitigate | Enforce dataScope gate prior to tool loop: pure_llm receives empty tools; tasks_only does not receive note tools; unauthorized users rejected early. |
| T-NAL-03 | Denial of Service | telegramHeadlessWorker.ts | mitigate | Cap tool loop at MAX_LOOPS = 5 to prevent infinite recursion on repeated tool calls. |
</threat_model>

<verification>
1. npx vitest run tests/telegram/telegramHeadlessWorker.test.ts tests/telegram/telegramAdminMutation.test.ts
2. npm run build
</verification>

<success_criteria>
- Telegram worker replaces manual string context stuffing with AIChatDrawer-style read tool loop.
- Normal queries safely execute query/read tools (query_tasks, get_item_details, etc.) and synthesize final responses.
- Admin mutation confirmation flow remains intact and unbypassed.
- Targeted tests pass and npm run build succeeds cleanly.
</success_criteria>

<output>
Create .planning/quick/261020-nal-refactor-telegram-worker-to-use-aichatdr/261020-nal-PLAN.md
</output>
