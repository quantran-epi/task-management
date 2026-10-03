---
phase: quick
plan: 261003-laj
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/Cargo.toml
  - src-tauri/src/lib.rs
  - src/services/ai/aiDebugService.ts
  - src/components/ai/AIDebugModal.tsx
  - src/components/ai/ChatHeader.tsx
  - src/components/ai/AIChatDrawer.tsx
  - tests/ai/aiDebugService.test.ts
  - tests/ai/AIChatDrawer.test.tsx
autonomous: true
requirements: [AI-DEBUG-01, TAURI-DEVTOOLS-01]

must_haves:
  truths:
    - "Tauri app builds with devtools feature enabled so developer console can be opened"
    - "AI chat captures full turn payloads (grounding system prompt, user text, raw messages payload, tool calls, and results)"
    - "Chat header has a BugOutlined debug button opening an interactive AI debug viewer modal"
    - "User can view exact JSON sent to 9router/LLM, inspect tool calls with outputs, copy JSON, and clear logs"
  artifacts:
    - path: "src/services/ai/aiDebugService.ts"
      provides: "In-memory AI trace and debug logging service"
      exports: ["aiDebugService", "AiDebugTurn", "AiDebugEvent"]
    - path: "src/components/ai/AIDebugModal.tsx"
      provides: "Tech-oriented modal for inspecting AI payloads and traces"
      exports: ["AIDebugModal"]
    - path: "tests/ai/aiDebugService.test.ts"
      provides: "Unit tests verifying turn tracking, events, clear, and subscribers"
  key_links:
    - from: "src/components/ai/AIChatDrawer.tsx"
      to: "src/services/ai/aiDebugService.ts"
      via: "logs turn lifecycle (startTurn, stream chunks, tool calls, tool results, finishTurn)"
      pattern: "aiDebugService\\.(startTurn|finishTurn|recordToolCall|recordToolResult)"
    - from: "src/components/ai/ChatHeader.tsx"
      to: "src/components/ai/AIDebugModal.tsx"
      via: "onOpenDebug trigger button with BugOutlined icon"
      pattern: "BugOutlined"
---

<objective>
Enable Tauri developer tools and provide an in-app AI Debug viewer to inspect raw messages, context grounding system prompts, 9router/LLM payloads, tool invocations, and responses with copy-to-clipboard functionality.

Purpose: Provide full transparency into AI conversations, prompt injections, and database tool executions for debugging and prompt engineering.
Output: Tauri devtools enabled in Cargo.toml and Rust invoke handler, `aiDebugService.ts`, `AIDebugModal.tsx`, and wiring into `AIChatDrawer.tsx`.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/components/ai/AIChatDrawer.tsx
@src/components/ai/ChatHeader.tsx
@src-tauri/Cargo.toml
@src-tauri/src/lib.rs
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Enable Tauri devtools and create aiDebugService with unit tests</name>
  <files>src-tauri/Cargo.toml, src-tauri/src/lib.rs, src/services/ai/aiDebugService.ts, tests/ai/aiDebugService.test.ts</files>
  <behavior>
    - Test 1: `aiDebugService.startTurn` creates a new turn record with unique id, timestamp, scope, model, systemPrompt, and sent messages
    - Test 2: `recordToolCall` and `recordToolResult` accurately record tool name, args, output, and latency
    - Test 3: `finishTurn` updates finalResponse, duration, status ('completed' | 'error' | 'aborted'), and notifies subscribers
    - Test 4: `clearLogs` flushes all stored turns and notifies subscribers
  </behavior>
  <action>
    1. Update `src-tauri/Cargo.toml` to add `features = ["devtools"]` to `tauri = { version = "2", features = ["devtools"] }`.
    2. In `src-tauri/src/lib.rs`, add an `open_devtools` command:
       ```rust
       #[tauri::command]
       fn open_devtools(window: tauri::WebviewWindow) {
           #[cfg(feature = "devtools")]
           window.open_devtools();
       }
       ```
       Register `open_devtools` in `generate_handler![]`.
    3. Create `src/services/ai/aiDebugService.ts`:
       - Define interfaces: `AiDebugEvent`, `AiDebugToolExecution`, `AiDebugTurn`, `TurnStatus` ('running' | 'completed' | 'error' | 'aborted').
       - In-memory ring buffer (default max 50 turns) to prevent unbounded memory growth.
       - Methods:
         - `startTurn(params: { scope: string; model: string; systemPrompt?: string; messagesSent: any[]; toolsSent?: any[] }): string`
         - `appendStreamChunk(turnId: string, delta: string): void`
         - `recordToolCall(turnId: string, toolCall: { id: string; name: string; args: Record<string, any> }): void`
         - `recordToolResult(turnId: string, toolCallId: string, result: string, durationMs?: number): void`
         - `finishTurn(turnId: string, result: { finalResponse?: string; error?: string; aborted?: boolean }): void`
         - `getTurns(): AiDebugTurn[]`
         - `getTurn(turnId: string): AiDebugTurn | undefined`
         - `clearLogs(): void`
         - `subscribe(listener: () => void): () => void`
    4. Implement `tests/ai/aiDebugService.test.ts` testing all lifecycle methods, subscribing, and clearing.
  </action>
  <verify>
    <automated>npm test tests/ai/aiDebugService.test.ts && cd src-tauri && cargo check</automated>
  </verify>
  <done>aiDebugService tracks full conversation payloads in memory, emits updates to subscribers, and Tauri devtools compiles without warnings</done>
</task>

<task type="auto">
  <name>Task 2: Build AIDebugModal viewer and add debug button to ChatHeader</name>
  <files>src/components/ai/AIDebugModal.tsx, src/components/ai/ChatHeader.tsx</files>
  <action>
    1. Create `src/components/ai/AIDebugModal.tsx`:
       - Use Ant Design `Modal` (width 850px, title with BugOutlined, responsive height).
       - Top toolbar: Turn selector dropdown/list (showing timestamp, status badge, model, latency), "Xóa nhật ký (Clear)", "Sao chép toàn bộ JSON (Copy Turn)", and if running in Tauri desktop (`isTauriApp()`), button "Mở Tauri DevTools" calling Tauri `open_devtools`.
       - Turn details displayed in clean Ant Design `Tabs` or `Collapse`:
         - Tab 1: **Ngữ cảnh & Prompt hệ thống** (System Prompt & Grounding context formatted in code block with Copy button).
         - Tab 2: **Payload gửi đến LLM** (Messages array sent to 9router with roles, system, assistant, user messages in JSON viewer + Copy).
         - Tab 3: **Truy vấn công cụ (Tools)** (List of invoked tools with arguments, return data, and execution time in ms).
         - Tab 4: **Kết quả phản hồi** (Final response text and stream statistics: chunk count, duration, status).
         - Tab 5: **Dòng thời gian sự kiện (Raw Events)** (Chronological log of every event with relative time offsets).
       - Empty state when no turns exist ("Chưa có dữ liệu gỡ lỗi. Hãy gửi một tin nhắn AI để bắt đầu theo dõi.").
    2. Update `src/components/ai/ChatHeader.tsx`:
       - Add `onOpenDebug?: () => void` and `debugCount?: number` to `ChatHeaderProps`.
       - Add a `BugOutlined` button in header controls:
         ```tsx
         <Tooltip title="Nhật ký gỡ lỗi AI (Xem tin nhắn & công cụ)">
           <Button
             type="text"
             size="small"
             icon={<BugOutlined />}
             onClick={onOpenDebug}
             aria-label="Nhật ký gỡ lỗi AI"
             style={{ minWidth: 28, minHeight: 28 }}
           />
         </Tooltip>
         ```
  </action>
  <verify>
    <automated>npm test tests/ai/AIChatDrawer.test.tsx</automated>
  </verify>
  <done>AIDebugModal displays turn logs, allows payload inspection, provides 1-click JSON copy, and ChatHeader exposes the debug button</done>
</task>

<task type="auto">
  <name>Task 3: Wire aiDebugService into AIChatDrawer and verify end-to-end</name>
  <files>src/components/ai/AIChatDrawer.tsx, tests/ai/AIChatDrawer.test.tsx</files>
  <action>
    1. In `src/components/ai/AIChatDrawer.tsx`:
       - Import `aiDebugService` and `AIDebugModal`.
       - Add state `isDebugModalOpen: boolean`.
       - Pass `onOpenDebug={() => setIsDebugModalOpen(true)}` to `ChatHeader`.
       - Render `<AIDebugModal open={isDebugModalOpen} onClose={() => setIsDebugModalOpen(false)} />`.
       - In `handleSendMessage`:
         - When assembling `currentMessages`, call `const turnId = aiDebugService.startTurn({ scope: effectiveScope.title || effectiveScope.type, model: targetModel, systemPrompt: systemInstruction, messagesSent: currentMessages, toolsSent: AI_DATABASE_TOOLS });`
         - In SSE streaming chunk loop: call `aiDebugService.appendStreamChunk(turnId, chunk.delta)`.
         - When tool calls arrive: call `aiDebugService.recordToolCall(turnId, { id: tc.id, name: tc.function.name, args })`.
         - When tool returns: record start/end time, call `aiDebugService.recordToolResult(turnId, tc.id, toolResult, toolDurationMs)`.
         - On success: call `aiDebugService.finishTurn(turnId, { finalResponse })`.
         - On abort: call `aiDebugService.finishTurn(turnId, { finalResponse, aborted: true })`.
         - On error: call `aiDebugService.finishTurn(turnId, { error: err?.message || String(err) })`.
    2. Update `tests/ai/AIChatDrawer.test.tsx` to assert:
       - ChatHeader renders the debug button (`Nhật ký gỡ lỗi AI`).
       - Clicking the debug button opens the AIDebugModal.
       - Sending a message logs turn details into `aiDebugService`.
  </action>
  <verify>
    <automated>npm test tests/ai/AIChatDrawer.test.tsx && npm run build</automated>
  </verify>
  <done>Full message payloads, tool calls, and responses are captured in real-time, inspectable in the debug modal, and tests pass cleanly</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| AI Debug Logger → In-memory state | Logs are kept strictly in-memory (never persisted to IndexedDB, SQLite, or disk) |
| Debug Viewer → Clipboard | User-initiated copy exports debug JSON safely to local clipboard |
| Frontend → Tauri open_devtools | Only opens internal webview developer tools, no privileged shell execution |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-DEBUG-01 | Information Disclosure | `aiDebugService.ts` | mitigate | In-memory ring buffer limited to 50 turns; never persist API keys (API key is not stored in debug payload); no disk writes |
| T-DEBUG-02 | Denial of Service | `aiDebugService.ts` | mitigate | Cap text delta chunks and buffer turn count to 50 max to prevent memory leakage during long sessions |
| T-DEBUG-03 | Elevation of Privilege | Tauri `open_devtools` | mitigate | Only opens Webview devtools on the existing window; no arbitrary command invocation |
</threat_model>

<verification>
- `npm test tests/ai/aiDebugService.test.ts` passes
- `npm test tests/ai/AIChatDrawer.test.tsx` passes
- `cd src-tauri && cargo check` passes with devtools feature enabled
- `npm run build` succeeds with zero TypeScript errors
</verification>

<success_criteria>
- Developer can open Tauri devtools (Inspect Element / Console)
- User can click the BugOutlined button in the AI chat drawer to view full payload history
- Context grounding prompt, messages array, tool arguments, tool outputs, and LLM responses are inspectable with copy-to-clipboard
</success_criteria>

<output>
Create `.planning/quick/261003-laj-add-debug-feature-to-see-ai-messages-bac/261003-laj-PLAN.md`
</output>
