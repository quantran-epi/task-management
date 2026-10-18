---
status: complete
title: "Refactor Graph Extraction to Pure LLM: Remove Local Fallback, Chunking, Retry, Progress & Error Reporting"
created: 2026-10-18
completed: 2026-10-18
---

# Summary: Pure LLM Graph Extraction

## What Was Done:
1. **Created Pure LLM Extraction Engine (`knowledge-server/src/ai/llmExtraction.ts`)**:
   - Implemented `splitDocumentIntoChunks` dividing documents into ~2,500 - 3,500 characters chunks.
   - Built strict JSON schema & prompt enforcing closed ontology and safety rules:
     - Strips dummy generic steps (`STEP_1`, `STEP_2`, `BUOC_1`).
     - Bans `DatabaseObject` writing to another `DatabaseObject`.
   - Built automatic retry with exponential backoff (up to 3 retries, 60s timeout) for HTTP 429, 50x, network dropouts.
   - Added real-time progress callbacks reporting `processedChunks`, `totalChunks`, and `stageMessage`.

2. **Cleaned Heuristics in `knowledge-server/src/graph/extraction.ts`**:
   - Removed generation of dummy `STEP_1`, `STEP_2` when row IDs are missing.
   - Removed direct `stepUrn WRITES_TO tableUrn` when step is just a container; only actual `compUrn` (SoftwareComponent) writes to tables.

3. **Refactored `GraphBuildService` (`knowledge-server/src/services/graphBuildService.ts`)**:
   - Replaced silent fallback to regex tables with strict error reporting when LLM extraction fails.
   - Integrated `extractWithLLMPure` as the primary graph extractor.
   - Tracked and exposed `progress: { processedChunks, totalChunks, percent, stageMessage }`.

4. **Updated Client Protocol & UI**:
   - Extended `GraphStatusResponseSchema` and `GraphStatusDTOSchema` with `progress` field.
   - In `src/components/knowledge/DocumentSetDrawer.tsx`:
     - Displayed live progress bar and current chunk ratio (`Phần: x/y`).
     - Enhanced error alert with detailed reason and direct **"Thử lại xây dựng đồ thị" (Retry)** action button.

5. **Verified**:
   - Unit tests in `knowledge-server/tests/ai/llmExtraction.test.ts` pass (100%).
   - Frontend and knowledge-server TypeScript builds compile cleanly with zero errors.
