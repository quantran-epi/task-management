# Quick Task 261030-jdu: Fix knowledge-server chunk cache invalidation on ontology version changes and rebuilds

## Overview
Added `ontologyVersion` to chunk cache key hashing, disk cache validation, and extraction caching to ensure that changes in ontology version or rebuilding a document set invalidate existing chunk cache entries and re-extract technical entities and relations.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add ontologyVersion to cache hashing, disk cache validation, and rebuild purge | 8d752b2 | `knowledge-server/src/ai/llmExtraction.ts`, `knowledge-server/src/services/graphBuildService.ts` |
| 2 | Add comprehensive test cases for ontology change invalidation and rebuild purge | fdc6132 | `knowledge-server/src/ai/llmExtraction.ts`, `knowledge-server/tests/chunkCache.test.ts` |

## Changes Made
1. **Cache Key Hashing (`computeChunkCacheKey`)**: Added `ontologyVersion: string = ONTOLOGY_VERSION` as 4th parameter; included in SHA-256 hash input (`${chunkContentHash}:${model}:${promptVersion}:${ontologyVersion}`).
2. **Chunk Cached Result Interface (`ChunkCachedResult`)**: Updated `ontologyVersion?: string | undefined` property type to hold string ontology version.
3. **Disk Cache Validation (`loadDiskCache` & `saveDiskCache`)**: Persisted `ontologyVersion` in top-level JSON file payload and inside `result.ontologyVersion`. `loadDiskCache` checks that `parsed.ontologyVersion === ontologyVersion`.
4. **Extraction Cache Miss on Version Divergence (`extractWithLLMPure`)**: Resolves `effectiveOntologyVersion = options.ontologyVersion ?? ONTOLOGY_VERSION`. If in-memory cached result has a different `ontologyVersion`, it treats it as a miss. Forwards `effectiveOntologyVersion` to `loadDiskCache` and `saveDiskCache`. Reports progress on cache hits.
5. **Rebuild Purge (`GraphBuildService`)**: Calls `globalChunkStore.purgeSet(setId)` in `triggerRebuild` and `executeRebuildSync` to wipe in-memory chunk extractions and status before starting candidate preparation.
6. **Unit Tests (`knowledge-server/tests/chunkCache.test.ts`)**: Added unit tests verifying hash divergence on version change, disk cache invalidation on ontology mismatch, LLM re-extraction upon ontology version bump, and memory store purge on rebuild trigger and sync.

## Verification
- Targeted unit tests passed: `npm --prefix knowledge-server test tests/chunkCache.test.ts` (9 passed).
- Extractor tests passed: `npm --prefix knowledge-server test tests/ai/llmExtraction.test.ts` (3 passed).
