---
status: in-progress
title: "Refactor Graph Extraction to Pure LLM: Remove Local Fallback, Chunking, Retry, Progress & Error Reporting"
created: 2026-10-18
---

# Plan: Pure LLM Graph Extraction

## Objective
Remove all noisy/buggy local heuristic regex extraction (no more dummy `STEP_1`, `STEP_2`, no more Oracle table inserting Oracle table).
Use purely LLM-driven entity and relation extraction with:
1. Sized chunking (~2,500 - 3,500 chars / chunk).
2. Generous timeouts (60s-120s) with exponential retry backoff.
3. Strict prompt and Zod schema validation ensuring consistent entities and valid ontology relations.
4. Real-time progress tracking (processed chunks / total chunks) exposed to the client.
5. Explicit, clear error reporting with retry ability, no silent fallback to junk data.

## Implementation Tasks
1. Create `knowledge-server/src/ai/llmExtraction.ts`:
   - Chunk document text into bounded pieces (~2,500 chars).
   - Strict LLM prompt for closed ontology entity & relation extraction.
   - Retry logic with backoff for timeouts/rate-limits.
   - Zod validation and entity/relation builder.
2. Refactor `knowledge-server/src/services/graphBuildService.ts`:
   - Replace deterministic regex extraction with pure LLM extraction (or only keep basic SourceDocument node metadata).
   - Track progress: `currentStage`, `processedChunks`, `totalChunks`.
   - Track error details on failure instead of silent fallback.
3. Update `knowledge-server/src/routes/graph.ts` & `src/services/knowledge/knowledgeClient.ts`:
   - Add `progress` object to `GraphStatusDTO` (`{ processedChunks, totalChunks, percent }`).
4. Update `src/components/knowledge/DocumentSetDrawer.tsx`:
   - Display real progress bar during LLM extraction.
   - Show explicit failure reason and allow retrying directly.
5. Run tests and verify build.
