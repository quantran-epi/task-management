---
status: complete
title: "Granular Chunk Extraction Tracking, Chunk Cache, Selective Retry API, and Chunk Progress UI"
created: 2026-10-19
completed: 2026-10-19
---

# Summary: Granular Chunk Extraction Tracking & Selective Retry

## Results
1. **Per-chunk store and cache** (`knowledge-server/src/ai/llmExtraction.ts`):
   - `ChunkExtractionStore` caches extracted nodes, facts, and evidence per chunk so successful chunks are not re-queried.
   - `extractWithLLMPure` checks cache first and only calls LLM for remaining or targeted chunks.
2. **Backend API endpoints** (`knowledge-server/src/routes/graph.ts` & `graphBuildService.ts`):
   - `GET /api/v1/sets/:setId/graph/chunks` returns granular status for each chunk (`PENDING`, `EXTRACTING`, `SUCCESS`, `FAILED`) with exact errors.
   - `POST /api/v1/sets/:setId/graph/retry-chunks` resets targeted chunks and triggers selective extraction.
3. **Frontend Client** (`src/services/knowledge/knowledgeClient.ts`):
   - Added `getGraphChunks(setId)` and `retryGraphChunks(setId, chunkIds?)`.
4. **UI Modal** (`src/components/knowledge/DocumentSetDrawer.tsx`):
   - Modal displays chunks table with status tags, entities/relations count, exact error tooltips.
   - Global button "Thử lại tất cả phần lỗi" and individual "Thử lại" button on failed chunk rows.
   - Re-activated "Tiến trình từng phần" button in DocumentSet summary card.
