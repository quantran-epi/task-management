---
phase: quick-261022-djl
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/services/ai/aiOrchestratorLoop.ts
  - src/services/telegram/telegramHeadlessWorker.ts
  - src/components/ai/AIChatDrawer.tsx
  - tests/services/ai/aiOrchestratorLoop.test.ts
  - tests/telegram/telegramHeadlessWorker.test.ts
autonomous: true
requirements:
  - AI-ORCHESTRATOR-SHARED-TOOL-LOOP
must_haves:
  truths:
    - "AIChatDrawer and Telegram worker share unified core tool loop runner (aiOrchestratorLoop.ts) instead of duplicate multi-turn streamChatEvents loops"
    - "Operational tool execution, dynamic MCP routing, tool call dispatching, history pruning, and final synthesis pass logic are centralized in shared orchestrator loop"
    - "Channel-specific confirmation semantics are preserved: AIChatDrawer uses React callback/promise state; Telegram query turns reject mutations or defer to admin mutation preview loop"
    - "Channel-specific transport/streaming and formatting are preserved: AIChatDrawer updates live React streaming status/tokens and saves chat threads; Telegram buffers text and sends split Telegram HTML messages"
    - "Targeted tests for AI orchestrator loop and Telegram headless worker pass cleanly without regressions"
  artifacts:
    - path: "src/services/ai/aiOrchestratorLoop.ts"
      provides: "Shared operational tool orchestration loop engine supporting configurable tool execution, confirmation hook, stream callbacks, and synthesis"
    - path: "tests/services/ai/aiOrchestratorLoop.test.ts"
      provides: "Targeted unit tests for shared orchestrator loop tool dispatch, mutation intercept, and synthesis pass"
    - path: "src/services/telegram/telegramHeadlessWorker.ts"
      provides: "Telegram worker using shared orchestrator loop with Telegram-specific tool set and message formatting"
    - path: "src/components/ai/AIChatDrawer.tsx"
      provides: "AIChatDrawer using shared orchestrator loop with React UI confirmation and streaming hooks"
  key_links:
    - from: "src/components/ai/AIChatDrawer.tsx"
      to: "src/services/ai/aiOrchestratorLoop.ts"
      via: "runAiOrchestratorLoop"
      pattern: "runAiOrchestratorLoop"
    - from: "src/services/telegram/telegramHeadlessWorker.ts"
      to: "src/services/ai/aiOrchestratorLoop.ts"
      via: "runAiOrchestratorLoop"
      pattern: "runAiOrchestratorLoop"
---

<objective>
Refactor AI Chat Drawer and Telegram Chat to share the operational tool execution and synthesis loop via a clean, reusable orchestration engine (`src/services/ai/aiOrchestratorLoop.ts`), while strictly retaining channel-specific confirmation, streaming/transport, and formatting adapters.

Purpose:
Eliminate code duplication between browser drawer and background Telegram worker while enforcing identical anti-hallucination tool policies, multi-turn tool handling, and synthesis fallback across all channels.

Output:
- New `src/services/ai/aiOrchestratorLoop.ts` engine with pluggable tool execution, confirmation, and streaming events.
- Refactored `AIChatDrawer.tsx` consuming the shared loop with interactive UI confirmation and reactive stream updates.
- Refactored `telegramHeadlessWorker.ts` consuming the shared loop with headless security gates and Telegram formatting.
- Unit tests in `tests/services/ai/aiOrchestratorLoop.test.ts` and existing Telegram test verification.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md
@src/components/ai/AIChatDrawer.tsx
@src/services/telegram/telegramHeadlessWorker.ts
@src/services/ai/aiTools.ts
@src/services/ai/nineRouterClient.ts
@src/services/ai/historyPruning.ts
@tests/telegram/telegramHeadlessWorker.test.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extract shared tool orchestration loop engine into aiOrchestratorLoop.ts with targeted tests</name>
  <files>src/services/ai/aiOrchestratorLoop.ts, tests/services/ai/aiOrchestratorLoop.test.ts</files>
  <action>
1. Create `src/services/ai/aiOrchestratorLoop.ts`:
   - Define options interface `AiOrchestratorLoopOptions`:
     * `endpoint`: string
     * `apiKey`: string
     * `model`: string
     * `messages`: `ChatCompletionMessage[]`
     * `tools`?: any[]
     * `temperature`?: number (default 0.1)
     * `maxLoops`?: number (default 30 for drawer, 5 for telegram)
     * `db`: TaskPlannerDatabase
     * `signal`?: AbortSignal
     * `synthesisPrompt`?: string (customizable per channel or standard default)
     * `onTextChunk`?: (delta: string) => void
     * `onReasoningChunk`?: (delta: string) => void
     * `onStatusChange`?: (status: string | null) => void
     * `onUsage`?: (usage: { promptTokens?: number; completionTokens?: number; totalTokens?: number }) => void
     * `onToolCall`?: (call: { id: string; name: string; args: Record<string, any> }) => void
     * `onToolResult`?: (callId: string, result: string, durationMs: number) => void
     * `onMutationCheck`?: (toolName: string, args: Record<string, any>) => Promise<{ proceed: boolean; cancellationResult?: string }>
     * `onFileGenerated`?: (file: any) => void
     * `executeToolFn`?: (name: string, args: Record<string, any>, db: TaskPlannerDatabase) => Promise<string>
   - Implement `runAiOrchestratorLoop(options: AiOrchestratorLoopOptions)`:
     * Handles loop turns calling `streamChatEvents`.
     * Prunes tool outputs via `pruneToolOutputsInMessages`.
     * Handles tool calls, calls `onMutationCheck` if tool is mutation.
     * Dispatches tool execution (local DB or MCP).
     * Handles file generation capture (`generate_file`, `generate_pptx`).
     * Runs final synthesis pass if tools were called or response is empty after tools.
     * Returns structured result: `{ fullResponse: string; cleanResponse: string; messages: ChatCompletionMessage[]; tokenUsage: ChatTokenUsage; generatedFiles: ChatGeneratedFile[] }`.
2. Create `tests/services/ai/aiOrchestratorLoop.test.ts`:
   - Test loop terminates when no tools are called.
   - Test tool calling executes tool and feeds tool result back into next turn.
   - Test mutation cancellation via `onMutationCheck` injects user cancellation message without executing tool.
   - Test final synthesis pass is invoked when tool calls took place.
  </action>
  <verify>
    <automated>npx vitest run tests/services/ai/aiOrchestratorLoop.test.ts</automated>
  </verify>
  <done>
`runAiOrchestratorLoop` correctly handles iterative tool turns, mutation checks, and synthesis; targeted unit tests pass.
  </done>
</task>

<task type="auto">
  <name>Task 2: Wire AIChatDrawer and telegramHeadlessWorker to use shared runAiOrchestratorLoop</name>
  <files>src/components/ai/AIChatDrawer.tsx, src/services/telegram/telegramHeadlessWorker.ts, tests/telegram/telegramHeadlessWorker.test.ts</files>
  <action>
1. In `src/services/telegram/telegramHeadlessWorker.ts`:
   - Replace manual Step 8 `streamChatEvents` while-loop with `runAiOrchestratorLoop`.
   - Pass Telegram-specific configuration:
     * `maxLoops: 5`
     * `tools: availableTools` (read-only filtered tools)
     * `onMutationCheck`: checks `isMutationTool(toolName, args)`, if mutation attempted returns `{ proceed: false, cancellationResult: JSON.stringify({ error: 'Thao tác thay đổi dữ liệu yêu cầu quyền Admin hoặc lệnh cụ thể.' }) }`.
     * Custom Telegram synthesis prompt formatting instruction.
   - Step 9 and Step 10 retain `markdownToTelegramHtml`, `splitTelegramMessage`, `sendReply`, and `logTelegramSession`.
2. In `src/components/ai/AIChatDrawer.tsx`:
   - Replace operational loop in Step 5 (lines ~1176-1443) with `runAiOrchestratorLoop`.
   - Wire `onMutationCheck` to existing modal confirmation promise flow (`setPendingConfirmation`, `pendingConfirmationRef`, `autoApproveMutations`).
   - Wire `onTextChunk`, `onReasoningChunk`, `onStatusChange`, and `onUsage` to existing React state updaters (`setStreamingText`, `setStreamingStatus`, `accumulatedTokenUsage`).
   - Wire `onToolCall` and `onToolResult` to `aiDebugService` and `toolLog`.
   - Keep post-loop message persistence (`saveMessage`), desktop notifications, and error handling unchanged.
3. Run targeted tests for Telegram worker and AI tools:
   - `npx vitest run tests/telegram/telegramHeadlessWorker.test.ts`
   - `npx vitest run tests/telegram/telegramAdminMutation.test.ts`
   - `npx vitest run tests/ai/aiTools.test.ts`
   - `npx vitest run tests/services/ai/aiOrchestratorLoop.test.ts`
  </action>
  <verify>
    <automated>npx vitest run tests/services/ai/aiOrchestratorLoop.test.ts tests/telegram/telegramHeadlessWorker.test.ts tests/telegram/telegramAdminMutation.test.ts tests/ai/aiTools.test.ts</automated>
  </verify>
  <done>
Both AIChatDrawer and Telegram worker delegate tool execution to `runAiOrchestratorLoop`; confirmation and formatting remain channel-specific; all targeted tests pass.
  </done>
</task>

<task type="auto">
  <name>Task 3: Run full build typecheck to verify interface compatibility</name>
  <files>src/components/ai/AIChatDrawer.tsx, src/services/telegram/telegramHeadlessWorker.ts, src/services/ai/aiOrchestratorLoop.ts</files>
  <action>
Run `npm run build` to verify TypeScript typechecking and Vite bundle creation pass cleanly with no unused variable or missing property errors.
  </action>
  <verify>
    <automated>npm run build</automated>
  </verify>
  <done>
Typecheck and production build pass with zero errors.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Inbound channel (Telegram / Web UI) -> Shared Orchestrator Loop | Input parameters and tool permissions flow across boundary |
| Orchestrator Loop -> Tool Execution & Database | Local database reads/writes and dynamic MCP calls |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-DJL-01 | Elevation of Privilege | aiOrchestratorLoop.ts | mitigate | Enforce `onMutationCheck` callback before invoking any mutation tool; Telegram defaults to rejecting mutations on query turns; Web UI prompts confirmation unless autoApprove is active. |
| T-DJL-02 | Denial of Service | aiOrchestratorLoop.ts | mitigate | Enforce bounded `maxLoops` (default 30 for UI, 5 for Telegram) to prevent runaway recursive tool calls. |
| T-DJL-03 | Information Disclosure | aiOrchestratorLoop.ts | mitigate | Prune tool outputs before sending to model via `pruneToolOutputsInMessages`; ensure tools passed to loop are pre-filtered according to channel permissions/scope. |
</threat_model>

<verification>
1. npx vitest run tests/services/ai/aiOrchestratorLoop.test.ts tests/telegram/telegramHeadlessWorker.test.ts tests/telegram/telegramAdminMutation.test.ts tests/ai/aiTools.test.ts
2. npm run build
</verification>

<success_criteria>
- Core operational tool loop extracted to `src/services/ai/aiOrchestratorLoop.ts`.
- `AIChatDrawer.tsx` and `telegramHeadlessWorker.ts` share the orchestration loop without duplicating loop logic.
- Channel-specific confirmation, streaming transport, and message formatting remain fully preserved.
- All targeted tests pass and `npm run build` succeeds cleanly.
</success_criteria>

<output>
Create .planning/quick/261022-djl-refactor-ai-chat-drawer-and-telegram-cha/261022-djl-PLAN.md
</output>
