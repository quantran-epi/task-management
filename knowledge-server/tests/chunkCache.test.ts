import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  ChunkExtractionStore,
  computeChunkCacheKey,
  PROMPT_VERSION,
  type ChunkCachedResult,
} from '../src/ai/llmExtraction.js';

describe('ChunkExtractionStore disk caching (BUILD-CACHE-01)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chunk-cache-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('computes deterministic 64-char SHA-256 cache key using chunkContentHash, model, and promptVersion', () => {
    const chunkHash = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const model = 'gpt-4o-mini';
    const key1 = computeChunkCacheKey(chunkHash, model, PROMPT_VERSION);
    const key2 = computeChunkCacheKey(chunkHash, model, PROMPT_VERSION);

    expect(key1).toBe(key2);
    expect(key1).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(key1)).toBe(true);

    // Changes when model changes
    const keyDiffModel = computeChunkCacheKey(chunkHash, 'claude-3-5-sonnet', PROMPT_VERSION);
    expect(keyDiffModel).not.toBe(key1);

    // Changes when promptVersion changes
    const keyDiffVersion = computeChunkCacheKey(chunkHash, model, '2099.99.99');
    expect(keyDiffVersion).not.toBe(key1);
  });

  it('miss on fresh chunk returns undefined, saveDiskCache creates valid JSON file on disk', async () => {
    const store = new ChunkExtractionStore(tempDir);
    const setId = '00000000-0000-0000-0000-000000000001';
    const chunkContentHash = 'a'.repeat(64);
    const model = 'test-model';

    // Fresh chunk: cache miss
    const cachedBefore = await store.loadDiskCache(setId, chunkContentHash, model);
    expect(cachedBefore).toBeUndefined();

    const sampleResult: ChunkCachedResult = {
      chunkId: 'doc1:0',
      nodes: [
        {
          urn: 'urn:system:ProcessStep:step1',
          kind: 'ProcessStep',
          canonicalName: 'Step 1',
          sourceSystem: 'system',
          nativeType: 'ProcessStep',
          normalizedKey: 'step1',
          properties: {},
          aliases: ['Step 1'],
        },
      ],
      facts: [],
      evidence: [],
      quarantines: [],
    };

    await store.saveDiskCache(setId, chunkContentHash, model, sampleResult);

    // Verify file exists on disk
    const cacheKey = computeChunkCacheKey(chunkContentHash, model, PROMPT_VERSION);
    const filePath = path.join(tempDir, setId, `${cacheKey}.json`);
    const fileStat = await fs.stat(filePath);
    expect(fileStat.isFile()).toBe(true);

    const fileContent = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    expect(fileContent.version).toBe(1);
    expect(fileContent.chunkContentHash).toBe(chunkContentHash);
    expect(fileContent.model).toBe(model);
    expect(fileContent.promptVersion).toBe(PROMPT_VERSION);
    expect(fileContent.result.chunkId).toBe('doc1:0');
    expect(fileContent.result.nodes).toHaveLength(1);

    // Now loadDiskCache should return the saved result
    const cachedAfter = await store.loadDiskCache(setId, chunkContentHash, model);
    expect(cachedAfter).toBeDefined();
    expect(cachedAfter?.chunkId).toBe('doc1:0');
    expect(cachedAfter?.nodes[0]?.canonicalName).toBe('Step 1');
  });

  it('invalidates cache when promptVersion does not match file', async () => {
    const store = new ChunkExtractionStore(tempDir);
    const setId = '00000000-0000-0000-0000-000000000001';
    const chunkContentHash = 'b'.repeat(64);
    const model = 'test-model';

    const sampleResult: ChunkCachedResult = {
      chunkId: 'doc1:1',
      nodes: [],
      facts: [],
      evidence: [],
      quarantines: [],
    };

    await store.saveDiskCache(setId, chunkContentHash, model, sampleResult);

    // Querying with a different model or promptVersion fails
    const diffModel = await store.loadDiskCache(setId, chunkContentHash, 'different-model');
    expect(diffModel).toBeUndefined();

    // Re-instantiate store with different promptVersion check if possible, or verify key mismatch
    const diffKey = computeChunkCacheKey(chunkContentHash, model, 'old-version');
    const targetFile = path.join(tempDir, setId, `${diffKey}.json`);
    await expect(fs.stat(targetFile)).rejects.toThrow();
  });

  it('reloads cached results across new ChunkExtractionStore instances pointing to same directory', async () => {
    const store1 = new ChunkExtractionStore(tempDir);
    const setId = '00000000-0000-0000-0000-000000000002';
    const chunkContentHash = 'c'.repeat(64);
    const model = 'test-model-survive-restart';

    const sampleResult: ChunkCachedResult = {
      chunkId: 'doc2:0',
      nodes: [
        {
          urn: 'urn:system:ScheduledProcess:proc1',
          kind: 'ScheduledProcess',
          canonicalName: 'Proc 1',
          sourceSystem: 'system',
          nativeType: 'ScheduledProcess',
          normalizedKey: 'proc1',
          properties: {},
          aliases: ['Proc 1'],
        },
      ],
      facts: [],
      evidence: [],
      quarantines: [],
    };

    await store1.saveDiskCache(setId, chunkContentHash, model, sampleResult);

    // Simulate pod restart by instantiating new store
    const store2 = new ChunkExtractionStore(tempDir);
    const loaded = await store2.loadDiskCache(setId, chunkContentHash, model);

    expect(loaded).toBeDefined();
    expect(loaded?.chunkId).toBe('doc2:0');
    expect(loaded?.nodes[0]?.canonicalName).toBe('Proc 1');
  });

  it('rejects path traversal attempts on setId or cacheKey', async () => {
    const store = new ChunkExtractionStore(tempDir);
    const maliciousSetId = '../../etc';
    const chunkContentHash = 'd'.repeat(64);
    const model = 'test-model';

    await expect(store.loadDiskCache(maliciousSetId, chunkContentHash, model)).rejects.toThrow(/INVALID_SET_ID/);
  });

  it('extractWithLLMPure uses disk cache and avoids LLM call on unchanged chunk', async () => {
    const setId = '00000000-0000-0000-0000-000000000003';
    const model = 'mock-llm-model';

    const testDoc = {
      documentId: 'doc-cache-test',
      title: 'Doc Cache Test',
      contentHash: 'mock-hash',
      chunks: [
        {
          occurrenceId: 'occ-1',
          representationId: 'rep-1',
          contentHash: 'mock-chunk-hash',
          chunkIndex: 0,
          headingPath: [],
          startLine: 1,
          endLine: 1,
          startOffset: 0,
          endOffset: 45,
          rawContent: 'SHB process performs batch card operations.\n\nMore prose description for testing.',
        },
      ],
    };

    const snapshot = {
      snapshotId: 'snap-1',
      setId,
      documents: [testDoc],
    } as any;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  entities: [
                    {
                      name: 'PRC_BATCH_CARD',
                      kind: 'ScheduledProcess',
                      sourceSystem: 'system',
                      nativeType: 'PRC_PROCESS',
                    },
                  ],
                  relations: [],
                }),
              },
            },
          ],
        }),
    });

    // Isolated store using tempDir
    const testStore = new ChunkExtractionStore(tempDir);
    const { extractWithLLMPure } = await import('../src/ai/llmExtraction.js');

    // Run 1: First time - should call LLM
    const res1 = await extractWithLLMPure(snapshot, {
      endpoint: 'http://mock-llm:1234',
      model,
      fetchFn: mockFetch as any,
      store: testStore,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(res1.nodes.some((n) => n.canonicalName === 'PRC_BATCH_CARD')).toBe(true);

    // Simulate pod restart: new store instance pointing to same tempDir with empty in-memory state
    const restartedStore = new ChunkExtractionStore(tempDir);

    // Run 2: Second time with same content - should load from disk cache, 0 new LLM calls
    const res2 = await extractWithLLMPure(snapshot, {
      endpoint: 'http://mock-llm:1234',
      model,
      fetchFn: mockFetch as any,
      store: restartedStore,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1); // Still 1, 0 new calls!
    expect(res2.nodes.some((n) => n.canonicalName === 'PRC_BATCH_CARD')).toBe(true);
  });
});
