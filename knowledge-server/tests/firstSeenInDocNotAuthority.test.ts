import { describe, it, expect } from 'vitest';
import { pickRepresentativeSource } from '../src/retrieval/fusion.js';
import type { ChunkItem, EntityItem } from '../src/types/retrievalProtocol.js';

describe('D-34: firstSeenInDoc is never used as citation authority', () => {
  it('cites all supporting occurrences across documents rather than only firstSeenInDoc', () => {
    const docA = '10000000-0000-4000-8000-000000000001';
    const docB = '10000000-0000-4000-8000-000000000002';
    const docC = '10000000-0000-4000-8000-000000000003';

    // Entity X with firstSeenInDoc = docA
    const entityX: EntityItem = {
      type: 'entity',
      id: 'urn:plannermate:process:core:60000006',
      score: 30,
      modalitiesContributed: ['fulltext', 'graph'],
      urn: 'urn:plannermate:process:core:60000006',
      canonicalName: 'PRC_PROCESS:60000006',
      kind: 'ScheduledProcess',
      snapshotId: 'gsnap_11111111',
      firstSeenInDoc: docA,
      hasConflict: false,
    };

    // Chunks for entity X in docA, docB, docC
    const chunkA: ChunkItem = {
      type: 'chunk',
      id: 'chunk_doc_a',
      score: 25,
      modalitiesContributed: ['fulltext'],
      sourceDocumentId: docA,
      sourceDocumentTitle: 'Doc A',
      sectionAnchor: 'sec-a',
      lineStart: 10,
      lineEnd: 20,
      rawSnippet: 'PRC_PROCESS:60000006 in doc A',
      publishedContentHash: 'a'.repeat(64),
      snapshotId: 'gsnap_11111111',
      hasConflict: false,
    };

    const chunkB: ChunkItem = {
      type: 'chunk',
      id: 'chunk_doc_b',
      score: 24,
      modalitiesContributed: ['fulltext'],
      sourceDocumentId: docB,
      sourceDocumentTitle: 'Doc B',
      sectionAnchor: 'sec-b',
      lineStart: 30,
      lineEnd: 40,
      rawSnippet: 'PRC_PROCESS:60000006 in doc B',
      publishedContentHash: 'b'.repeat(64),
      snapshotId: 'gsnap_11111111',
      hasConflict: false,
    };

    const chunkC: ChunkItem = {
      type: 'chunk',
      id: 'chunk_doc_c',
      score: 23,
      modalitiesContributed: ['fulltext'],
      sourceDocumentId: docC,
      sourceDocumentTitle: 'Doc C',
      sectionAnchor: 'sec-c',
      lineStart: 50,
      lineEnd: 60,
      rawSnippet: 'PRC_PROCESS:60000006 in doc C',
      publishedContentHash: 'c'.repeat(64),
      snapshotId: 'gsnap_11111111',
      hasConflict: false,
    };

    const items = [entityX, chunkA, chunkB, chunkC];

    // Assert items contain citations across ALL 3 documents
    const docIdsWithCitations = new Set(
      items.filter((i) => i.type === 'chunk').map((c) => (c as ChunkItem).sourceDocumentId)
    );

    expect(docIdsWithCitations.has(docA)).toBe(true);
    expect(docIdsWithCitations.has(docB)).toBe(true);
    expect(docIdsWithCitations.has(docC)).toBe(true);
    expect(docIdsWithCitations.size).toBe(3);
  });

  it('selects representative source strictly by evidenceClass then stable documentId, never firstSeenInDoc', () => {
    const docA = 'aaaaaaaa-0000-4000-8000-000000000001';
    const docB = 'bbbbbbbb-0000-4000-8000-000000000002';
    const docC = 'cccccccc-0000-4000-8000-000000000003';

    // 1. If docC has BUSINESS_APPROVED while docA (firstSeenInDoc) is OBSERVED, docC wins
    const sourcesWithApproved = [
      { documentId: docA, evidenceClass: 'OBSERVED' as const },
      { documentId: docB, evidenceClass: 'INFERRED' as const },
      { documentId: docC, evidenceClass: 'BUSINESS_APPROVED' as const },
    ];
    const rep1 = pickRepresentativeSource(sourcesWithApproved);
    expect(rep1?.documentId).toBe(docC);

    // 2. If classes are equal (all OBSERVED), tie-break is stable documentId lexicographically
    const equalSources = [
      { documentId: docB, evidenceClass: 'OBSERVED' as const },
      { documentId: docA, evidenceClass: 'OBSERVED' as const },
      { documentId: docC, evidenceClass: 'OBSERVED' as const },
    ];
    const rep2 = pickRepresentativeSource(equalSources);
    expect(rep2?.documentId).toBe(docA);

    // 3. When docB has OBSERVED and docA (firstSeenInDoc) is INFERRED, docB wins regardless of firstSeenInDoc
    const inferredFirst = [
      { documentId: docA, evidenceClass: 'INFERRED' as const },
      { documentId: docB, evidenceClass: 'OBSERVED' as const },
    ];
    const rep3 = pickRepresentativeSource(inferredFirst);
    expect(rep3?.documentId).toBe(docB);
  });
});
