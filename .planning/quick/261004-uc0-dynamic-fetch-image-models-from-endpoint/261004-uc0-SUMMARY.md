# Quick Task 261004-uc0 Summary: Dynamic Image Model Fetching and AI Header Compact Cleanup

**Plan:** 261004-uc0  
**Date:** 2026-10-04  
**Status:** Completed  

## Overview
1. Made image model selection in settings dynamic: loads cached models from Dexie `image_cached_models`, updates and caches models when testing connection (`testImageGenerationConnection`), and provides an `AutoComplete` input allowing selection from fetched models or typing custom model names.
2. Removed the redundant "Assistant" tag badge from `ChatHeader.tsx` to give the AI header adequate width and prevent visual cramping across compact drawers and popouts.

## Key Changes
- `src/components/ai/ChatHeader.tsx`: Removed the Assistant pill tag badge, leaving the avatar with status dot, title "Trợ lý AI", model select, and header action buttons.
- `src/components/settings/NineRouterConfigCard.tsx`:
  - Added `availableImageModels` state with default presets.
  - Added cache loading from Dexie `image_cached_models` on mount.
  - Automatically saves fetched models from `/v1/models` to Dexie on connection test and updates options.
  - Replaced static `Select` with `AutoComplete` supporting search, preset recommendations, and custom model name typing.

## Verification
- `npm run build`: Passed cleanly.
- `npx vitest run src/utils/__tests__/pptxExport.test.ts src/services/ai/__tests__/imageGenerationTool.test.ts src/services/ai/__tests__/fileGenerationTool.test.ts`: 12 passed.
