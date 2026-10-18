---
status: in-progress
title: "Granular Chunk Extraction Tracking, Chunk Cache, Selective Retry API, and Chunk Progress UI"
created: 2026-10-19
---

# Plan: Granular Chunk Extraction Tracking & Selective Retry

## Objective
Provide per-chunk tracking and selective retry for Graph extraction:
1. Cache successfully extracted chunks so they are never re-queried from the LLM.
2. Track granular status for each chunk (`PENDING`, `EXTRACTING`, `SUCCESS`, `FAILED`) with exact error messages.
3. Expose API `GET /api/v1/sets/:setId/graph/chunks` and `POST /api/v1/sets/:setId/graph/retry-chunks`.
4. Provide a UI modal/table displaying chunk status with:
   - "Thử lại các phần lỗi" (Retry All Failed Chunks)
   - Individual "Thử lại" button per failed chunk.

## Implementation Tasks
1. Update `knowledge-server/src/ai/llmExtraction.ts`:
   - Store and cache extracted chunk results keyed by `sourceSnapshotId:chunkId`.
   - Support selective extraction passing target `chunkIds` or skipping already successful chunks.
2. Update `knowledge-server/src/services/graphBuildService.ts` & `routes/graph.ts`:
   - Register endpoints: `GET /api/v1/sets/:setId/graph/chunks` & `POST /api/v1/sets/:setId/graph/retry-chunks`.
3. Update `src/services/knowledge/knowledgeClient.ts`:
   - Add client methods `getGraphChunks(setId)` and `retryGraphChunks(setId, chunkIds?)`.
4. Update `src/components/knowledge/DocumentSetDrawer.tsx`:
   - Add "Chi tiết từng phần (Chunks)" button/modal.
   - Render table with status tags, error details, and retry actions.
5. Verification:
   - Add unit tests for selective retry & chunk caching.
   - Verify builds & integration test.
