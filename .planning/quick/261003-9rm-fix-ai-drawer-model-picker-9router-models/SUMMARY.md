---
id: 261003-9rm
title: Fix AI drawer model picker not listing 9router models and failing with no active credentials
status: complete
completed: 2026-10-03
---

# Summary: Fix AI Drawer Model Picker & 9Router Model Selection

## What was done
1. **Model Discovery Service**: Added `fetchAvailableModels(db)` to `src/services/ai/nineRouterTokenService.ts`. Queries 9Router's `/v1/models` and caches to `ninerouter_cached_models` in Dexie with fallback support.
2. **Dynamic Model Sync in AI Drawer**: In `src/components/ai/AIChatDrawer.tsx`, automatically loads cached models and fetches live models from 9Router in background when opened. Guarantees that `selectedModel` is set to an active available model, preventing unroutable model payloads.
3. **Searchable Model Picker**: Updated `src/components/ai/ChatHeader.tsx` to add `showSearch`, lowercase search filtering, responsive width, and removed hardcoded fallback models (`gpt-4o`, etc.) so only real models from 9Router are listed.
4. **Settings Model Sync**: In `src/components/settings/NineRouterConfigCard.tsx`, auto-adjusts `defaultModel` when models are retrieved and defaultModel is not among available models. Added search filtering to default model select.
5. **Clean Headers**: In `src/services/ai/nineRouterClient.ts`, only attach `Authorization` header when `apiKey` is provided.
6. **Tests**: Added unit tests in `tests/ai/nineRouterTokenService.test.ts` and `tests/ai/AIChatDrawer.test.tsx`. All 47 AI tests pass.
