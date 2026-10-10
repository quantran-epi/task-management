import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InMemoryGraphRepository, RETRIEVAL_GENERATION_GRACE_MS } from '../src/graph/graphRepository.js';
import { GraphBuildService } from '../src/services/graphBuildService.js';
import { SnapshotStore } from '../src/indexing/snapshotStore.js';
import type { ProjectionSnapshot } from '../src/indexing/incrementalProjector.js';
import { DeterministicEmbeddingStub } from './fixtures/retrievalStubs.js';
import type { EmbeddingProviderMetadata } from '../src/types/retrievalProtocol.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Retrieval Index Lifecycle & Generation Pinning (Plan 18-03)', () => {
  let tempDir: string;
  const setId = '60000006-0000-4000-8000-000000000000';

  const mockSnapshot: ProjectionSnapshot = {
    snapshotId: 'source-snapshot-v1',
    setId,
    chunkingPolicyVersion: '2026.10.1',
    documents: [
      {
        documentId: 'doc-1',
        title: '01-wiring.md',
        contentHash: '1'.repeat(64),
        chunks: [
          {
            occurrenceId: 'occ-1',
            representationId: 'rep-1',
            contentHash: 'a'.repeat(64),
            chunkIndex: 0,
            headingPath: ['Container / processes'],
            startLine: 1,
            endLine: 15,
            startOffset: 0,
            endOffset: 350,
            rawContent: `# Wiring\nProcess 60000006 CONTAINER with FCL_PRC_CYCLE_COUNTER_PKG.PROCESS\n`,
          },
          {
            occurrenceId: 'occ-2',
            representationId: 'rep-2',
            contentHash: 'b'.repeat(64),
            chunkIndex: 1,
            headingPath: ['Container / processes', 'Binds'],
            startLine: 16,
            endLine: 35,
            startOffset: 351,
            endOffset: 700,
            rawContent: `Binds table for cycle counter and overdue date MAIN1.FCL_CYCLE_COUNTER\n`,
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'retrieval-index-test-'));
  });

  it('records retrieval generation metadata and activates atomically with graph candidate', async () => {
    const repo = new InMemoryGraphRepository();
    const store = new SnapshotStore({ storageDir: tempDir });
    const embeddingProvider = new DeterministicEmbeddingStub();
    const service = new GraphBuildService(repo, store, { embeddingProvider });

    store.createCandidate('c-1', 'att-1', setId);
    store.completeCandidate('c-1', mockSnapshot);
    store.promoteCandidate('c-1');

    const graphSnapshotId = await service.executeRebuildSync(setId);
    const active = await repo.getActiveGraph(setId);

    expect(active?.graphSnapshotId).toBe(graphSnapshotId);
    expect(active?.retrievalGeneration).toBeDefined();
    expect(active?.retrievalGeneration?.fulltextIndexName).toMatch(/^chunk_fulltext_[a-f0-9]{16}$/);
    expect(active?.retrievalGeneration?.vectorIndexName).toMatch(/^chunk_vector_[a-f0-9]{16}$/);
    expect(active?.retrievalGeneration?.embeddingMetadata?.provider).toBe('local-onnx');
    expect(active?.retrievalGeneration?.embeddingMetadata?.dimensions).toBe(384);
  });

  it('rebuild with changed embedding metadata forces full re-embed for all chunks', async () => {
    const repo = new InMemoryGraphRepository();
    const store = new SnapshotStore({ storageDir: tempDir });
    const providerA = new DeterministicEmbeddingStub({
      provider: 'local-onnx',
      model: 'multilingual-e5-small',
      revision: 'v1.0.0',
      dimensions: 384,
      policyVersion: '2026.10.1',
    });
    const serviceA = new GraphBuildService(repo, store, { embeddingProvider: providerA });

    store.createCandidate('c-1', 'att-1', setId);
    store.completeCandidate('c-1', mockSnapshot);
    store.promoteCandidate('c-1');

    await serviceA.executeRebuildSync(setId);
    expect(providerA.embedDocumentsCalls.length).toBeGreaterThan(0);

    const providerB = new DeterministicEmbeddingStub({
      provider: 'remote-openai',
      model: 'text-embedding-3-small',
      revision: 'v2',
      dimensions: 384,
      policyVersion: '2026.10.2',
    });
    const serviceB = new GraphBuildService(repo, store, { embeddingProvider: providerB });

    await serviceB.executeRebuildSync(setId);
    // Provider B must have been invoked for all chunks
    expect(providerB.embedDocumentsCalls.length).toBeGreaterThan(0);
    const totalEmbedded = providerB.embedDocumentsCalls.reduce((sum, batch) => sum + batch.length, 0);
    expect(totalEmbedded).toBe(2);
  });

  it('dimension mismatch between provider and candidate causes validation failure before activation', async () => {
    const repo = new InMemoryGraphRepository();
    const store = new SnapshotStore({ storageDir: tempDir });
    const badProvider = new DeterministicEmbeddingStub({
      provider: 'local-onnx',
      model: 'multilingual-e5-small',
      revision: 'v1.0.0',
      dimensions: 384,
      policyVersion: '2026.10.1',
    });
    // Stub returns wrong dimension count
    (badProvider as any).embedDocuments = async (texts: readonly string[]) => {
      return texts.map(() => new Array(128).fill(0.1)); // 128 instead of declared 384
    };

    const service = new GraphBuildService(repo, store, { embeddingProvider: badProvider });
    store.createCandidate('c-1', 'att-1', setId);
    store.completeCandidate('c-1', mockSnapshot);
    store.promoteCandidate('c-1');

    await expect(service.executeRebuildSync(setId)).rejects.toThrow(/DIMENSION_MISMATCH/);
    expect(await repo.getActiveGraph(setId)).toBeNull();
  });

  it('request-start pinned snapshot acquires lease and remains queryable even after candidate activation', async () => {
    const repo = new InMemoryGraphRepository();
    const store = new SnapshotStore({ storageDir: tempDir });
    const embeddingProvider = new DeterministicEmbeddingStub();
    const service = new GraphBuildService(repo, store, { embeddingProvider });

    store.createCandidate('c-1', 'att-1', setId);
    store.completeCandidate('c-1', mockSnapshot);
    store.promoteCandidate('c-1');

    const firstGraphId = await service.executeRebuildSync(setId);

    // Acquire pinned lease
    const pinnedLease = await repo.acquirePinnedSnapshot(setId);
    expect(pinnedLease).not.toBeNull();
    expect(pinnedLease?.snapshotId).toBe(firstGraphId);

    // Rebuild and promote second snapshot
    const secondGraphId = await service.executeRebuildSync(setId);
    expect(secondGraphId).not.toBe(firstGraphId);

    // Current active pointer has moved
    const currentActive = await repo.getActiveGraph(setId);
    expect(currentActive?.graphSnapshotId).toBe(secondGraphId);

    // Old generation remains queryable via pinned snapshot
    const ftResults = await repo.queryFullText(pinnedLease!.snapshotId, 'CONTAINER', 10);
    expect(ftResults.length).toBeGreaterThan(0);
    expect(ftResults[0]?.snapshotId).toBe(firstGraphId);

    // Release lease
    await pinnedLease!.release();
  });

  it('cleanup retains superseded generations during 10-minute grace period or while active leases exist', async () => {
    const repo = new InMemoryGraphRepository();
    const store = new SnapshotStore({ storageDir: tempDir });
    const embeddingProvider = new DeterministicEmbeddingStub();
    const service = new GraphBuildService(repo, store, { embeddingProvider });

    store.createCandidate('c-1', 'att-1', setId);
    store.completeCandidate('c-1', mockSnapshot);
    store.promoteCandidate('c-1');

    const firstGraphId = await service.executeRebuildSync(setId);
    const lease = await repo.acquirePinnedSnapshot(setId);
    expect(lease).not.toBeNull();

    // Advance to second generation
    await service.executeRebuildSync(setId);

    const now = Date.now();
    // 1. Cannot cleanup because lease is still active
    const cleanedWithLease = await repo.cleanupSupersededGenerations(now + RETRIEVAL_GENERATION_GRACE_MS + 1000);
    expect(cleanedWithLease).toBe(0);

    // Release lease
    await lease!.release();

    // 2. Cannot cleanup yet if 10-minute grace has not passed
    const cleanedBeforeGrace = await repo.cleanupSupersededGenerations(now);
    expect(cleanedBeforeGrace).toBe(0);

    // 3. Can cleanup once grace has elapsed and lease count is 0
    const cleanedAfterGrace = await repo.cleanupSupersededGenerations(now + RETRIEVAL_GENERATION_GRACE_MS + 1000);
    expect(cleanedAfterGrace).toBe(1);

    // First generation is no longer queryable
    const ftResults = await repo.queryFullText(firstGraphId, 'CONTAINER', 10);
    expect(ftResults).toHaveLength(0);
  });

  it('candidate index failure leaves previous active graph and retrieval generation untouched', async () => {
    const repo = new InMemoryGraphRepository();
    const store = new SnapshotStore({ storageDir: tempDir });
    const embeddingProvider = new DeterministicEmbeddingStub();
    const service = new GraphBuildService(repo, store, { embeddingProvider });

    store.createCandidate('c-1', 'att-1', setId);
    store.completeCandidate('c-1', mockSnapshot);
    store.promoteCandidate('c-1');

    const firstGraphId = await service.executeRebuildSync(setId);
    const activeBefore = await repo.getActiveGraph(setId);

    // Injected build failure on next embedding
    embeddingProvider.failNextWith = new Error('INJECTED_EMBEDDING_FAILURE');

    await expect(service.executeRebuildSync(setId)).rejects.toThrow('INJECTED_EMBEDDING_FAILURE');

    // Active pointer untouched
    const activeAfter = await repo.getActiveGraph(setId);
    expect(activeAfter?.graphSnapshotId).toBe(firstGraphId);
    expect(activeAfter?.retrievalGeneration).toEqual(activeBefore?.retrievalGeneration);
  });
});
