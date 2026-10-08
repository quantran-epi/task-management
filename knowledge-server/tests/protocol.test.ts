import { describe, expect, it } from 'vitest';
import {
  CHUNKING_POLICY_VERSION,
  HARD_ATOMIC_BLOCK_LIMIT,
  PUBLISH_PRIMARY_STATES,
  TARGET_CHUNK_SIZE,
  ActiveSnapshotManifestSchema,
  ChangePreviewResultSchema,
  EvidenceChunkSchema,
  OversizedAtomicBlockErrorSchema,
  PublishAttemptRequestSchema,
  PublishAttemptResponseSchema,
  PublishPrimaryStateSchema,
  PublishedDocumentInputSchema,
} from '../src/types/protocol.js';

describe('knowledge-server protocol contract', () => {
  it('locks D-25 and D-26 policy constants', () => {
    expect(CHUNKING_POLICY_VERSION).toBe('2026.10.1');
    expect(TARGET_CHUNK_SIZE).toBe(6000);
    expect(HARD_ATOMIC_BLOCK_LIMIT).toBe(50000);
  });

  it('enforces exact D-27 primary states without connection pseudo-states', () => {
    expect(PUBLISH_PRIMARY_STATES).toEqual([
      'Never published',
      'In sync',
      'Local changes',
      'Publishing',
      'Warning',
      'Failed',
    ]);
    expect(() => PublishPrimaryStateSchema.parse('Disconnected')).toThrow();
  });

  it('validates immutable PublishedDocumentInput and rejects extra fields', () => {
    const valid = {
      documentId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      title: 'Credit Calculation Specs',
      body: '# H1 Title\n\nContent body',
      tags: ['banking', 'calc'],
    };
    expect(PublishedDocumentInputSchema.parse(valid)).toEqual(valid);

    // Rejects invalid UUID
    expect(() =>
      PublishedDocumentInputSchema.parse({ ...valid, documentId: 'invalid-uuid' })
    ).toThrow();

    // Strict: rejects unknown fields
    expect(() =>
      PublishedDocumentInputSchema.parse({ ...valid, extraField: 'bad' })
    ).toThrow();
  });

  it('validates PublishAttemptRequest with documents array', () => {
    const req = {
      setName: 'Core Banking Docset',
      documents: [
        {
          documentId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          title: 'Document 1',
          body: '# Doc 1',
        },
      ],
    };
    expect(PublishAttemptRequestSchema.parse(req)).toEqual(req);
    expect(() => PublishAttemptRequestSchema.parse({ setName: '', documents: [] })).toThrow();
  });

  it('validates EvidenceChunk preserving D-22 to D-24 fields', () => {
    const chunk = {
      occurrenceId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      chunkIndex: 0,
      headingPath: ['Process 60000006', 'Credit Rules'],
      startLine: 1,
      endLine: 45,
      startOffset: 0,
      endOffset: 1250,
      rawContent: '## Credit Rules\n\nRule details...',
      contentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      chunkKey: 'f3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    };
    expect(EvidenceChunkSchema.parse(chunk)).toEqual(chunk);
  });

  it('validates OversizedAtomicBlockError per D-25', () => {
    const err = {
      code: 'OVERSIZED_ATOMIC_BLOCK' as const,
      documentId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      blockType: 'table',
      line: 120,
      column: 1,
      length: 51200,
      limit: 50000,
      message: 'Khối table vượt quá giới hạn an toàn 50,000 ký tự tại dòng 120.',
    };
    expect(OversizedAtomicBlockErrorSchema.parse(err)).toEqual(err);
  });

  it('validates content-free PublishAttemptResponse and ActiveSnapshotManifest', () => {
    const attempt = {
      attemptId: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
      setId: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
      status: 'In sync' as const,
      startedAt: '2026-10-08T10:00:00.000Z',
      completedAt: '2026-10-08T10:00:02.500Z',
      metrics: {
        addedCount: 2,
        changedCount: 0,
        removedCount: 0,
        unchangedCount: 3,
        warningCount: 0,
        durationMs: 2500,
      },
      activeSnapshotId: 'snap-1',
    };
    expect(PublishAttemptResponseSchema.parse(attempt)).toEqual(attempt);

    const manifest = {
      snapshotId: 'snap-1',
      setId: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
      chunkingPolicyVersion: '2026.10.1',
      activatedAt: '2026-10-08T10:00:02.500Z',
      documentCount: 5,
      totalChunkCount: 24,
      documents: [
        {
          documentId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          contentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          chunkCount: 6,
          chunkKeys: [
            'f3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          ],
        },
      ],
    };
    expect(ActiveSnapshotManifestSchema.parse(manifest)).toEqual(manifest);
  });

  it('validates ChangePreviewResult for D-04 zero-fetch preview', () => {
    const preview = {
      setId: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
      documents: [
        {
          documentId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          classification: 'changed' as const,
          title: 'Credit Calc',
          previousHash: '1111111111111111111111111111111111111111111111111111111111111111',
          currentHash: '2222222222222222222222222222222222222222222222222222222222222222',
        },
      ],
      chunks: [
        {
          chunkKey: '3333333333333333333333333333333333333333333333333333333333333333',
          documentId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          classification: 'changed' as const,
          headingPath: ['Section A'],
        },
      ],
      counts: {
        documentsAdded: 0,
        documentsChanged: 1,
        documentsRemoved: 0,
        documentsUnchanged: 0,
        chunksAdded: 0,
        chunksChanged: 1,
        chunksRemoved: 0,
        chunksUnchanged: 0,
      },
      hasRemovals: false,
    };
    expect(ChangePreviewResultSchema.parse(preview)).toEqual(preview);
  });
});
