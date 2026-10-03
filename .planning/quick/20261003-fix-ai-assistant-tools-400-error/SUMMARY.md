---
status: complete
date: 2026-10-03
slug: fix-ai-assistant-tools-400-error
---

# Quick Task Summary: Fix AI Assistant 400 Error and Empty Response

## Problem Identified
1. `update_task_checklist` tool defined property `items: { type: 'array', items: { type: 'string' } }`.
2. When passed to 9router with Google Vertex / Gemini provider (`cc-high`), Google's protobuf Schema parser collided with property name `items`, returning `HTTP 400: Invalid value at 'request.tools[0].function_declarations[16].parameters.properties[4].value' ... "array"`.
3. The fallback stream without tools caused reasoning models to spend output in `delta.reasoning_content` without `delta.content`, which `nineRouterClient.ts` ignored.
4. `AIChatDrawer.tsx` silently skipped saving or notifying when `fullResponse` was empty.

## Fix Applied
1. **Tool Schema Collision Fix**: Renamed `items` property to `checklistItems` in `update_task_checklist` in `src/services/ai/aiTools.ts`. Supported both `checklistItems` and legacy `items` in `executeAiTool`.
2. **Error & Reasoning Extraction**: Updated `streamChatEvents` in `src/services/ai/nineRouterClient.ts` to surface `parsed.error` immediately and fall back to `reasoning_content` if `content` is absent.
3. **Empty Response Notification**: Updated `AIChatDrawer.tsx` to set `apiError` when `fullResponse` is empty rather than silently hiding the loading indicator.
4. **Verification**: Verified against live 9router daemon (all 40 tools returning 200 OK), verified 13 unit test files (108 tests passing), and verified clean production build.
