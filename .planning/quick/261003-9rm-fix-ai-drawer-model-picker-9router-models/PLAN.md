---
id: 261003-9rm
title: Fix AI drawer model picker not listing 9router models and failing with no active credentials
status: in-progress
created: 2026-10-03
---

# Plan: Fix AI Drawer Model Picker & 9Router Model Credentials Error

## Root Cause
1. `ChatHeader.tsx` hardcoded fallback models to `['gpt-4o', 'gpt-4o-mini', 'claude-3-5-sonnet', 'deepseek-chat']` when `availableModels` was empty.
2. `AIChatDrawer.tsx` never queried 9Router for live models; it only read `ninerouter_cached_models` which was only populated if the user ran a manual connection test in Settings.
3. `selectedModel` defaulted to `'gpt-4o'` which was sent to 9Router. 9Router evaluated `gpt-4o` as provider `openai`, for which no credentials existed, resulting in `{"message":"No active credentials for provider: openai","type":"invalid_request_error","code":"model_not_found"}`.

## Tasks
1. [x] Implement `fetchAvailableModels(db)` in `src/services/ai/nineRouterTokenService.ts` to fetch `/v1/models` and sync to Dexie `ninerouter_cached_models`.
2. [x] Refactor `src/services/ai/nineRouterClient.ts` to only attach `Authorization` header when `apiKey` is non-empty.
3. [x] Update `src/components/ai/AIChatDrawer.tsx` to automatically fetch available models on open, select a valid model, and guard against sending unroutable models.
4. [x] Update `src/components/ai/ChatHeader.tsx` to enable search filter, responsive width, and show real available models without fake hardcoded fallbacks.
5. [x] Update `src/components/settings/NineRouterConfigCard.tsx` to auto-adjust `defaultModel` when models are fetched and default is not present in available models.
6. [x] Verify tests and run test suite.
