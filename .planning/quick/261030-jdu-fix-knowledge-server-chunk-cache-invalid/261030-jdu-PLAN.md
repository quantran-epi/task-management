---
phase: quick
plan: 261030-jdu
type: execute
wave: 1
depends_on: []
files_modified:
  - knowledge-server/src/ai/llmExtraction.ts
  - knowledge-server/src/services/graphBuildService.ts
  - knowledge-server/tests/chunkCache.test.ts
autonomous: true
requirements:
  - CHUNK-CACHE-INVALIDATE-ONTOLOGY
must_haves:
  truths:
    - "computeChunkCacheKey includes ontologyVersion in hash input defaulting to ONTOLOGY_VERSION"
    - "loadDiskCache and saveDiskCache persist and validate ontologyVersion against effective version"
    - "extractWithLLMPure skips stale chunk cache when ontologyVersion differs from cached version"
    - "triggerRebuild and executeRebuildSync purge in-memory chunk cache for target document set"
  artifacts:
    - path: "knowledge-server/src/ai/llmExtraction.ts"
      provides: "Chunk cache hashing and disk cache validation with ontologyVersion"
    - path: "knowledge-server/src/services/graphBuildService.ts"
      provides: "In-memory chunk cache purging during triggerRebuild and executeRebuildSync"
    - path: "knowledge-server/tests/chunkCache.test.ts"
      provides: "Unit test coverage for cache invalidation on ontologyVersion change and rebuild purge"
  key_links:
    - from: "knowledge-server/src/services/graphBuildService.ts"
      to: "knowledge-server/src/ai/llmExtraction.ts"
      via: "globalChunkStore.purgeSet and extractWithLLMPure ontologyVersion forwarding"
      pattern: "globalChunkStore\\.purgeSet"
---

<objective>
Fix knowledge-server chunk cache invalidation on ontology version changes and rebuilds.

Purpose: Prevent serving stale extracted entities and relations when ontology rules change or when user triggers full graph rebuild.
Output: Updated cache key hashing, disk cache validation, RAM store purge on rebuild, and regression test suite.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@knowledge-server/src/ai/llmExtraction.ts
@knowledge-server/src/graph/ontology.ts
@knowledge-server/src/services/graphBuildService.ts
@knowledge-server/tests/chunkCache.test.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add ontologyVersion to cache hashing, disk cache validation, and rebuild purge</name>
  <files>knowledge-server/src/ai/llmExtraction.ts, knowledge-server/src/services/graphBuildService.ts</files>
  <action>
    In knowledge-server/src/ai/llmExtraction.ts:
    1. Update computeChunkCacheKey signature to accept ontologyVersion: string = ONTOLOGY_VERSION and include ontologyVersion in hash input along with chunkContentHash, model, and promptVersion.
    2. Update ChunkCachedResult interface to declare ontologyVersion?: string | undefined (replacing number | undefined).
    3. Update loadDiskCache signature and implementation to accept ontologyVersion: string = ONTOLOGY_VERSION, compute cacheKey with ontologyVersion, and validate that parsed.ontologyVersion === ontologyVersion before returning cached result.
    4. Update saveDiskCache signature and implementation to accept ontologyVersion: string = ONTOLOGY_VERSION, compute cacheKey with ontologyVersion, save ontologyVersion in payload top-level and inside payload.result.
    5. In LLMExtractorOptions, add optional ontologyVersion?: string | undefined.
    6. In extractWithLLMPure:
       - Determine effectiveOntologyVersion = options.ontologyVersion ?? ONTOLOGY_VERSION.
       - When checking in-memory cache with store.getChunkResult, if cached.ontologyVersion exists and does not match effectiveOntologyVersion, treat as cache miss (set cached = undefined).
       - Forward effectiveOntologyVersion to store.loadDiskCache and store.saveDiskCache.
       - Ensure chunkCachedResult object records ontologyVersion: effectiveOntologyVersion.

    In knowledge-server/src/services/graphBuildService.ts:
    1. In triggerRebuild(setId, rebuildKey): call globalChunkStore.purgeSet(setId) before starting rebuild so in-memory chunk entries and cached results are wiped and re-evaluated.
    2. In executeRebuildSync(setId, candidateSnapshotId): call globalChunkStore.purgeSet(setId) before preparing candidate.
    3. In prepareCandidate: forward ontologyVersion: ONTOLOGY_VERSION in extractWithLLMPure options.
  </action>
  <verify>
    <automated>npm --prefix knowledge-server test tests/chunkCache.test.ts</automated>
  </verify>
  <done>
    computeChunkCacheKey factors in ontologyVersion, loadDiskCache and saveDiskCache enforce ontologyVersion match, extractWithLLMPure invalidates on version divergence, and triggerRebuild/executeRebuildSync purge RAM chunk store.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add comprehensive test cases for ontology change invalidation and rebuild purge</name>
  <files>knowledge-server/tests/chunkCache.test.ts</files>
  <action>
    In knowledge-server/tests/chunkCache.test.ts:
    1. Update computeChunkCacheKey tests to assert that cache key changes when ontologyVersion changes (e.g. comparing key with ONTOLOGY_VERSION vs 2026.11.1).
    2. Add test asserting loadDiskCache returns undefined when disk file was written with different ontologyVersion.
    3. Add test verifying extractWithLLMPure with mock LLM:
       - First run caches result with ONTOLOGY_VERSION.
       - Second run with same ONTOLOGY_VERSION hits disk cache (0 new LLM calls).
       - Third run with updated options.ontologyVersion = '2099.01.1' invalidates cache and triggers new LLM call.
    4. Add test verifying that calling triggerRebuild or executeRebuildSync on GraphBuildService purges globalChunkStore memory state for the document set.
  </action>
  <verify>
    <automated>npm --prefix knowledge-server test tests/chunkCache.test.ts</automated>
  </verify>
  <done>
    All chunkCache tests pass including key generation with ontologyVersion, disk cache invalidation on ontology mismatch, LLM re-extraction on version bump, and rebuild RAM cache purge.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Disk cache JSON file reading | Server parses JSON cache files from local filesystem cache directory |
| Rebuild invocation | Rebuild requests trigger memory cache purge and graph candidate generation |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-quick-01 | Tampering | ChunkExtractionStore.loadDiskCache / saveDiskCache | mitigate | Validate setId format with strict UUID regex and cacheKey with 64-char hex regex to prevent path traversal |
| T-quick-02 | Information Disclosure | ChunkExtractionStore cache files | mitigate | Write files strictly inside targetDir with atomic temp file rename and restrictive server process permissions |
| T-quick-SC | Tampering | npm dependencies | accept | No new dependencies added; uses existing node built-ins and vitest |
</threat_model>

<verification>
Automated targeted test command:
`npm --prefix knowledge-server test tests/chunkCache.test.ts`
</verification>

<success_criteria>
- computeChunkCacheKey incorporates ontologyVersion defaulting to ONTOLOGY_VERSION.
- loadDiskCache returns undefined when cached ontologyVersion mismatches effective version.
- saveDiskCache writes ontologyVersion to disk cache JSON payload.
- extractWithLLMPure re-extracts chunks when ontologyVersion changes.
- GraphBuildService.triggerRebuild and executeRebuildSync purge in-memory chunk store for target setId.
- All tests in knowledge-server/tests/chunkCache.test.ts pass.
</success_criteria>

<output>
Create .planning/quick/261030-jdu-fix-knowledge-server-chunk-cache-invalid/261030-jdu-PLAN.md
</output>
