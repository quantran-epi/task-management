---
phase: quick
plan: 261005-kq5
status: complete
date: 2026-10-05
summary: "Fix AI chat silent stops with watchdog timeout, 30-turn tool loop, final synthesis pass, and safe tool error handling"
---

# Quick Task Summary: Fix AI Chat Silent Stop and Error Reporting

## Objective
Prevent the AI chatbox from running for a while, showing tool progress/actions, and abruptly stopping without generating a response or reporting an error.

## Key Changes
1. **Streaming Watchdog & Drop Detection (`src/services/ai/nineRouterClient.ts`)**:
   - Added idle watchdog timeout (`options.watchdogTimeoutMs`, default 60s) for SSE chunk arrivals to detect network stalls and hung connections.
   - Added premature stream drop detection: if the reader completes (`done: true`) without yielding text, tools, or `[DONE]`, it throws an explicit error (`Máy chủ AI đóng kết nối mà không trả về nội dung hoặc công cụ hợp lệ`) instead of silently completing.
   - Handled `finish_reason === 'content_filter'`.

2. **Tool Execution Ceiling & Final Synthesis (`src/components/ai/AIChatDrawer.tsx`)**:
   - Raised tool calling loop ceiling (`MAX_TOOL_LOOPS`) from 5 to 30 to support extensive multi-step investigations.
   - Wrapped tool executions (`executeGraphitiMcpTool` and `executeAiTool`) in a safe `try...catch` block to feed error JSON back to the model rather than crashing the turn.
   - Added an automatic final synthesis pass (`streamChatCompletion` with stripped tools) whenever tools were invoked but the model hasn't generated a closing text response.
   - Guaranteed that any failure or empty text response surfaces via `setApiError` and `InlineApiErrorCard`.

3. **Tests (`tests/ai/nineRouterClient.test.ts`, `tests/ai/AIChatDrawer.test.tsx`)**:
   - Added test for watchdog timeout handling when chunks stall.
   - Added test for premature stream termination error throwing.
   - Added test for final synthesis pass triggering when tools complete without trailing text.
   - Added test for resilient tool execution error handling.

## Verification
- Unit & integration tests: `npx vitest run tests/ai/nineRouterClient.test.ts tests/ai/AIChatDrawer.test.tsx` (all 36 tests passed).
- Production build: `npm run build` (TypeScript compilation & Vite bundle passed).
