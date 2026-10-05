---
phase: quick
plan: 261005-crs
status: complete
date: 2026-10-05
files_modified:
  - src/services/ai/nineRouterClient.ts
  - src/services/ai/imageGenerationClient.ts
  - tests/ai/nineRouterClient.test.ts
  - src/services/ai/__tests__/imageGenerationTool.test.ts
---

# Quick Task Summary: Route AI Chat and Image Generation Through Tauri Proxy

## Outcome
- In Tauri desktop, `streamChatEvents` now routes `POST /v1/chat/completions` through native `ai_proxy_request` instead of direct browser `fetch`, eliminating WebView CORS blocks against non-CORS LLM backends (such as `10.4.97.70:30129`).
- `generateImage` and `testImageGenerationConnection` in `imageGenerationClient.ts` now route through native `ai_proxy_request` when `isTauriApp()` is true.
- SSE stream chunk parsing and non-SSE JSON response formats are supported over the proxy response.
- In browser/PWA, direct fetch behavior is preserved.
- Credential safety maintained: API keys are redacted from error messages.

## Verification
- Targeted Vitest tests:
  - `tests/ai/nineRouterClient.test.ts` (12 passed)
  - `src/services/ai/__tests__/imageGenerationTool.test.ts` (6 passed)
- TypeScript verification: `tsc --noEmit` passed with 0 errors.
