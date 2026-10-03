# Quick Plan: Fix AI Assistant 400 Error and Empty Response

## Objective
Fix critical bug where AI Assistant fails to respond because `update_task_checklist` declared an `items` parameter that conflicts with Google Cloud Vertex AI / Gemini protobuf Schema definition (`request.tools[0]...parameters.properties[4].value ... "array"`). Also add error handling for empty SSE stream responses so failures are never silent.

## Tasks
1. **Fix tool schema in `src/services/ai/aiTools.ts`**:
   - In `AI_DATABASE_TOOLS` for `update_task_checklist`: rename property `items` to `checklistItems`.
   - In `executeAiTool` for `update_task_checklist`: accept both `args.checklistItems` and fallback to `args.items` / `args.item`.
   - In `describeToolMutation` for `update_task_checklist`: handle `checklistItems` or `items`.
2. **Improve SSE error & reasoning extraction in `src/services/ai/nineRouterClient.ts`**:
   - In `streamChatEvents`: if `parsed.error` is encountered in SSE chunk, throw Error with message instead of silently swallowing it.
   - Support `delta.reasoning_content` fallback when `delta.content` is absent.
3. **Prevent silent empty responses in `src/components/ai/AIChatDrawer.tsx`**:
   - If stream finishes with empty `fullResponse` and no tool calls, trigger user-facing error message instead of silently hiding spinner.
4. **Update tests**:
   - Update and add tests in `tests/ai/aiTools.test.ts` and `tests/ai/AIChatDrawer.test.tsx`.
   - Verify `npm test -- tests/ai/`.
