import { describe, it, expect, vi } from 'vitest';
import {
  splitDocumentIntoChunks,
  extractWithLLMPure,
  globalChunkStore,
  LLMExtractorOptions,
} from '../../src/ai/llmExtraction.js';
import type { ProjectedDocument, ProjectionSnapshot } from '../../src/indexing/incrementalProjector.js';

describe('Pure LLM Extraction', () => {
  it('splits long documents into bounded chunks under target characters', () => {
    const fakeDoc: ProjectedDocument = {
      documentId: '11111111-1111-4111-8111-111111111111',
      title: 'Settlement Architecture',
      chunks: [
        {
          occurrenceId: '22222222-2222-4222-8222-222222222222',
          chunkIndex: 0,
          headingPath: ['Settlement'],
          startLine: 1,
          endLine: 20,
          startOffset: 0,
          endOffset: 5000,
          rawContent: 'Paragraph 1\n\n' + 'A'.repeat(3000) + '\n\nParagraph 2\n\n' + 'B'.repeat(3000),
          contentHash: 'hash1',
          chunkKey: 'key1',
        },
      ],
      indexedAt: new Date().toISOString(),
    };

    const chunks = splitDocumentIntoChunks(fakeDoc);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(3500);
      expect(c.documentId).toBe(fakeDoc.documentId);
      expect(c.totalChunksInDoc).toBe(chunks.length);
    }
  });

  it('rejects dummy STEP_1 entities and disallows DatabaseObject writing to DatabaseObject', async () => {
    const fakeDoc: ProjectedDocument = {
      documentId: '11111111-1111-4111-8111-111111111111',
      title: 'Settlement Doc',
      chunks: [
        {
          occurrenceId: '22222222-2222-4222-8222-222222222222',
          chunkIndex: 0,
          headingPath: ['Heading'],
          startLine: 1,
          endLine: 5,
          startOffset: 0,
          endOffset: 100,
          rawContent: 'Thủ tục ACC_ENTRY_PKG ghi dữ liệu vào bảng TBL_TRANSACTION.',
          contentHash: 'hash',
          chunkKey: 'key',
        },
      ],
      indexedAt: new Date().toISOString(),
    };

    const snapshot: ProjectionSnapshot = {
      snapshotId: '33333333-3333-4333-8333-333333333333',
      setId: '44444444-4444-4444-8444-444444444444',
      publishedAt: new Date().toISOString(),
      documents: [fakeDoc],
    };

    // Mock LLM returning one dummy step entity, one invalid DB->DB relation, and one valid relation
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  entities: [
                    { name: 'STEP_1', kind: 'ProcessStep', description: 'Dummy step' },
                    { name: 'ACC_ENTRY_PKG', kind: 'SoftwareComponent', description: 'Acc pkg' },
                    { name: 'TBL_TRANSACTION', kind: 'DatabaseObject', description: 'Txn table' },
                    { name: 'TBL_TEMP', kind: 'DatabaseObject', description: 'Temp table' },
                  ],
                  relations: [
                    // Invalid: DatabaseObject writes to DatabaseObject
                    {
                      sourceEntityName: 'TBL_TEMP',
                      sourceKind: 'DatabaseObject',
                      relation: 'WRITES_TO',
                      targetEntityName: 'TBL_TRANSACTION',
                      targetKind: 'DatabaseObject',
                      evidenceQuote: 'dummy quote',
                    },
                    // Valid: SoftwareComponent writes to DatabaseObject
                    {
                      sourceEntityName: 'ACC_ENTRY_PKG',
                      sourceKind: 'SoftwareComponent',
                      relation: 'WRITES_TO',
                      targetEntityName: 'TBL_TRANSACTION',
                      targetKind: 'DatabaseObject',
                      operation: 'INSERT',
                      evidenceQuote: 'ACC_ENTRY_PKG ghi dữ liệu vào bảng TBL_TRANSACTION',
                    },
                  ],
                }),
              },
            },
          ],
        }),
    });

    const progressReports: any[] = [];
    const options: LLMExtractorOptions = {
      endpoint: 'https://api.example.com',
      model: 'test-model',
      apiKey: 'test-key',
      fetchFn: mockFetch as any,
      onProgress: (p) => progressReports.push(p),
    };

    const result = await extractWithLLMPure(snapshot, options);

    // 1. SourceDocument + 3 valid entities (STEP_1 must NOT be in nodes)
    const nodeNames = result.nodes.map((n) => n.canonicalName);
    expect(nodeNames).not.toContain('STEP_1');
    expect(nodeNames).toContain('ACC_ENTRY_PKG');
    expect(nodeNames).toContain('TBL_TRANSACTION');

    // 2. TBL_TEMP -> TBL_TRANSACTION relation must be rejected and quarantined
    expect(result.facts.length).toBe(1);
    expect(result.facts[0]!.relation).toBe('WRITES_TO');
    expect(result.quarantines.some((q) => q.reason.includes('does not allow sourceKind DatabaseObject'))).toBe(true);

    // 3. Progress was called
    expect(progressReports.length).toBeGreaterThan(0);
    expect(progressReports[progressReports.length - 1].processedChunks).toBe(1);
  });

  it('continues processing subsequent chunks when one chunk fails (fault-tolerant loop)', async () => {
    const setId = '55555555-5555-4555-8555-555555555555';
    globalChunkStore.purgeSet(setId);

    const doc1: ProjectedDocument = {
      documentId: 'aaaa1111-1111-4111-8111-111111111111',
      title: 'Doc 1 (Failing)',
      chunks: [
        {
          occurrenceId: 'c1-1111-4111-8111-111111111111',
          chunkIndex: 0,
          headingPath: ['Heading 1'],
          startLine: 1,
          endLine: 5,
          startOffset: 0,
          endOffset: 50,
          rawContent: 'Nội dung chunk 1 bị lỗi mạng.',
          contentHash: 'hash1',
          chunkKey: 'key1',
        },
      ],
      indexedAt: new Date().toISOString(),
    };

    const doc2: ProjectedDocument = {
      documentId: 'bbbb2222-2222-4222-8222-222222222222',
      title: 'Doc 2 (Success)',
      chunks: [
        {
          occurrenceId: 'c2-2222-4222-8222-222222222222',
          chunkIndex: 0,
          headingPath: ['Heading 2'],
          startLine: 1,
          endLine: 5,
          startOffset: 0,
          endOffset: 50,
          rawContent: 'Thủ tục BILLING_SERVICE gọi CARD_AUTH.',
          contentHash: 'hash2',
          chunkKey: 'key2',
        },
      ],
      indexedAt: new Date().toISOString(),
    };

    const snapshot: ProjectionSnapshot = {
      snapshotId: '66666666-6666-4666-8666-666666666666',
      setId,
      publishedAt: new Date().toISOString(),
      documents: [doc1, doc2],
    };

    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        // First chunk fails (e.g. 500 error)
        return {
          ok: false,
          status: 500,
          text: async () => 'Internal Server Error',
        };
      }
      // Second chunk succeeds
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    entities: [
                      { name: 'BILLING_SERVICE', kind: 'SoftwareComponent', description: 'Billing' },
                      { name: 'CARD_AUTH', kind: 'SoftwareComponent', description: 'Auth' },
                    ],
                    relations: [
                      {
                        sourceEntityName: 'BILLING_SERVICE',
                        sourceKind: 'SoftwareComponent',
                        relation: 'CALLS',
                        targetEntityName: 'CARD_AUTH',
                        targetKind: 'SoftwareComponent',
                        evidenceQuote: 'BILLING_SERVICE gọi CARD_AUTH',
                      },
                    ],
                  }),
                },
              },
            ],
          }),
      };
    });

    const options: LLMExtractorOptions = {
      endpoint: 'https://api.example.com',
      model: 'test-model',
      apiKey: 'test-key',
      maxRetries: 1,
      fetchFn: mockFetch as any,
    };

    // Should NOT throw despite chunk 1 failing
    const result = await extractWithLLMPure(snapshot, options);

    // Chunk 2 entities and facts must be present
    const nodeNames = result.nodes.map((n) => n.canonicalName);
    expect(nodeNames).toContain('BILLING_SERVICE');
    expect(nodeNames).toContain('CARD_AUTH');
    expect(result.facts.some((f) => f.relation === 'CALLS')).toBe(true);

    // Check chunk store items
    const chunkItems = globalChunkStore.getChunkItems(setId);
    expect(chunkItems.length).toBe(2);
    const failedItem = chunkItems.find((c) => c.status === 'FAILED');
    const successItem = chunkItems.find((c) => c.status === 'SUCCESS');
    expect(failedItem).toBeDefined();
    expect(failedItem?.documentTitle).toBe('Doc 1 (Failing)');
    expect(successItem).toBeDefined();
    expect(successItem?.documentTitle).toBe('Doc 2 (Success)');
  });
});
