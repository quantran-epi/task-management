# Quick Task 261020-d6r: Align Telegram Chat with AI Chat Drawer Intent and Grounded Pipeline Summary

**Status:** Complete  
**Executed on:** 2026-10-20  

## Key Accomplishments

1. **LLM Intent Classification via `routeIntent`:**
   - In `telegramHeadlessWorker.ts`, user queries are now routed through `routeIntent` (from `src/services/ai/intentRouter.ts`), matching the taxonomy of `AIChatDrawer` (`query_taskmate`, `operate_taskmate`, `query_knowledge`, `mixed`, `clarify`).
   - If the intent requires clarification (`clarify`), the bot immediately replies with the targeted follow-up question (`clarify_question`) without streaming an unnecessary general AI completion.

2. **Scope Security Gate at Intent Boundary:**
   - `tasks_only` users asking knowledge questions (`query_knowledge`) are safely refused with an explicit scope limitation notice, preventing knowledge document leakage.
   - `knowledge_only` users attempting work queries or operations (`query_taskmate`, `operate_taskmate`) are safely refused with an explicit scope limitation notice.
   - `pure_llm` users continue to execute without any task or knowledge database context.

3. **Removed Arbitrary Document Fallback:**
   - Eliminated the naive `notes.slice(0, 3)` fallback in `resolveScopedContext`.
   - When a knowledge query matches zero documents in BM25, the context explicitly notes that no matching document exists in TaskMate, and `matchedSourceTitles` remains empty (stopping false citations like `📚 Nguồn: ...` from leaking arbitrary docs).

4. **Critical Anti-Hallucination Guardrails & Temperature Reduction:**
   - Injected the exact `CRITICAL ANTI-HALLUCINATION RULES` from `AIChatDrawer.tsx`:
     - NEVER GUESS, ASSUME, OR INVENT DATA.
     - Strictly ground statements in concrete context evidence.
     - If data is missing or empty, explicitly state that it is not recorded.
   - Lowered generation `temperature` from `0.7` to `0.1` for factual, grounded replies.

## Verification Results

- `npx tsc --noEmit`: 0 errors. Passed with strict TypeScript checks.
- `npx vitest run tests/telegram/`: 5 test files passed, 44 tests passed (including 4 new tests covering clarify routing, tasks_only scope gate, knowledge_only scope gate, and anti-hallucination prompt/temperature).

## Commits

- Commit pending: `feat(telegram): align chat with ai drawer intent routing and anti-hallucination guardrails`
