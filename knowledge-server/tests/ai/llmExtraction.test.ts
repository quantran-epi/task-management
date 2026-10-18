import { describe, it, expect, vi } from 'vitest';
import {
  splitDocumentIntoChunks,
  extractWithLLMPure,
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
});
