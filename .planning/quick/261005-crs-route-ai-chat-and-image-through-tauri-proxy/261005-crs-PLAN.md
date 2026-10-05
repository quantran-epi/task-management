---
phase: quick
plan: 261005-crs
type: execute
wave: 1
depends_on: []
files_modified:
  - src/services/ai/nineRouterClient.ts
  - src/services/ai/imageGenerationClient.ts
  - tests/ai/nineRouterClient.test.ts
  - src/services/ai/__tests__/imageGenerationTool.test.ts
autonomous: true
requirements:
  - QUICK-261005-CRS-AI-PROXY-STREAMING
estimate:
  tokens: 15000
  raw_tokens: 15000
  tasks: 2
  confidence: high
must_haves:
  truths:
    - "In Tauri, streamChatEvents routes POST /v1/chat/completions through ai_proxy_request to avoid WebView CORS."
    - "In Tauri, generateImage and testImageGenerationConnection route through ai_proxy_request to avoid WebView CORS."
    - "In browser/PWA, direct fetch behavior is preserved."
    - "API keys remain redacted from all error messages."
    - "Only targeted, related tests are executed."
  artifacts:
    - path: "src/services/ai/nineRouterClient.ts"
      provides: "Tauri-aware streamChatEvents using ai_proxy_request"
    - path: "src/services/ai/imageGenerationClient.ts"
      provides: "Tauri-aware generateImage and testImageGenerationConnection using ai_proxy_request"
    - path: "tests/ai/nineRouterClient.test.ts"
      provides: "Unit tests for streamChatEvents in Tauri environment"
    - path: "src/services/ai/__tests__/imageGenerationTool.test.ts"
      provides: "Unit tests for image generation in Tauri environment"
---

<objective>
Route AI chat completions (streamChatEvents) and image generation (generateImage, testImageGenerationConnection) through Tauri's native `ai_proxy_request` when running inside the Tauri desktop app, preventing WebView CORS blocks against non-CORS LLM backends (such as 10.4.97.70:30129).
</objective>

<tasks>
1. Update `src/services/ai/nineRouterClient.ts` to route `streamChatEvents` through `ai_proxy_request` when `isTauriApp()` is true.
2. Update `src/services/ai/imageGenerationClient.ts` to route `generateImage` and `testImageGenerationConnection` through `ai_proxy_request` when `isTauriApp()` is true.
3. Add targeted unit tests in `tests/ai/nineRouterClient.test.ts` and `src/services/ai/__tests__/imageGenerationTool.test.ts`.
4. Run targeted tests and push to master.
</tasks>
