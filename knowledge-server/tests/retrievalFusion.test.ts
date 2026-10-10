import { describe, expect, it } from 'vitest';
import {
  RRF_K,
  fuseRetrievalCandidates,
  CANDIDATE_INTEGRITY_MISMATCH,
} from '../src/retrieval/fusion.js';
import type {
  ChunkItem,
  EntityItem,
  EdgeItem,
  RetrievalItem,
  ModalityKind,
} from '../src/types/retrievalProtocol.js';

describe('RRF Fusion Suite (Task 18-W0-03A)', () => {
  const snapshotId = 'snap-1';
  const docId = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';

  const makeChunk = (id: string, modalities: ModalityKind[] = ['fulltext']): ChunkItem => ({
    type: 'chunk',
    id,
    score: 1.0,
    modalitiesContributed: modalities,
    sourceDocumentId: docId,
    sectionAnchor: `sec-${id}`,
    lineStart: 1,
    lineEnd: 10,
    rawSnippet: `Snippet for ${id}`,
    snapshotId,
    hasConflict: false,
  });

  const makeEntity = (urn: string, modalities: ModalityKind[] = ['graph']): EntityItem => ({
    type: 'entity',
    id: urn,
    score: 1.0,
    modalitiesContributed: modalities,
    urn,
    canonicalName: urn.split(':').pop() || 'name',
    kind: 'DatabaseObject',
    snapshotId,
    hasConflict: false,
  });

  const makeEdge = (factKey: string, modalities: ModalityKind[] = ['graph']): EdgeItem => ({
    type: 'edge',
    id: factKey,
    score: 1.0,
    modalitiesContributed: modalities,
    factKey,
    sourceUrn: 'urn:plannermate:oracle:DatabaseObject:SRC',
    relationType: 'READS_FROM',
    targetUrn: 'urn:plannermate:oracle:DatabaseObject:TGT',
    evidenceClass: 'OBSERVED',
    supportingChunkIds: [],
    snapshotId,
    hasConflict: false,
  });

  it('verifies RRF_K is exactly 60', () => {
    expect(RRF_K).toBe(60);
  });

  it('calculates exact RRF arithmetic for ranks 1, 2, 60 and multi-modality sum', () => {
    // Rank 1 in one modality -> 1 / (60 + 1) = 1/61
    const c1 = makeChunk('c1');
    const res1 = fuseRetrievalCandidates({ fulltext: [c1] });
    expect(res1.items[0]?.score).toBeCloseTo(1 / 61, 8);

    // Multi-modality: c1 is rank 1 in fulltext, rank 2 in vector
    // Score = 1/61 + 1/62
    const c1Vector = makeChunk('c1', ['vector']);
    const c2Vector = makeChunk('c2', ['vector']);
    const resMulti = fuseRetrievalCandidates({
      fulltext: [c1],
      vector: [c2Vector, c1Vector],
    });

    const itemC1 = resMulti.items.find((i) => i.id === 'c1');
    expect(itemC1?.score).toBeCloseTo(1 / 61 + 1 / 62, 8);
    expect(itemC1?.modalitiesContributed).toEqual(['vector', 'fulltext']); // sorted: vector, fulltext, graph

    // Rank 60 in fulltext (clamped to 50, but item 1..20 is default or 50 max)
    const dummyList: ChunkItem[] = [];
    for (let i = 1; i <= 60; i++) {
      dummyList.push(makeChunk(`chunk-${i}`));
    }
    // With 50 clamped, chunk-60 is outside top 50. Let's test chunk-50 (rank 50 in top 50)
    // or test single item at rank 60
    const listWith60AtTop: ChunkItem[] = [];
    for (let i = 1; i <= 59; i++) {
      listWith60AtTop.push(makeChunk(`other-${i}`));
    }
    listWith60AtTop.push(makeChunk('chunk-60'));
    // If we only take top 50, chunk-60 is at index 59 (rank 60), so it's not in items.
    // But if we fuse with vector having chunk-60 at rank 1, or if we pass 1 item list starting with 59 dummies?
    // Let's pass vector having chunk-60 at rank 1 (so it's in top 50), or check rank 20 vs rank 50.
    // Or better: chunk-60 is rank 60 in fulltext AND rank 1 in vector so it enters top 50!
    const resRank60 = fuseRetrievalCandidates({
      fulltext: listWith60AtTop, // chunk-60 is rank 60 -> 1/(60+60) = 1/120
      vector: [makeChunk('chunk-60', ['vector'])], // chunk-60 is rank 1 -> 1/(60+1) = 1/61
    }, 10);
    const item60 = resRank60.items.find((i) => i.id === 'chunk-60');
    expect(item60?.score).toBeCloseTo(1 / (60 + 60) + 1 / (60 + 1), 8);
  });

  it('deduplicates duplicate IDs within the same modality (contributes once)', () => {
    const c1 = makeChunk('c1');
    const c1Dup = makeChunk('c1');
    const res = fuseRetrievalCandidates({ fulltext: [c1, c1Dup] });
    expect(res.totalCandidates).toBe(1);
    expect(res.items).toHaveLength(1);
    expect(res.items[0]?.score).toBeCloseTo(1 / 61, 8);
  });

  it('keeps chunk, entity, and edge distinct even if sharing identical ID string', () => {
    const sharedId = 'SHARED_ID_123';
    const c = makeChunk(sharedId);
    const ent = makeEntity(sharedId);
    const edg = makeEdge(sharedId);

    const res = fuseRetrievalCandidates({
      fulltext: [c],
      graph: [ent, edg],
    });

    expect(res.totalCandidates).toBe(3);
    expect(res.items).toHaveLength(3);
    const types = res.items.map((i) => i.type).sort();
    expect(types).toEqual(['chunk', 'edge', 'entity']);
  });

  it('breaks ties deterministically by contributor count desc, modality priority (vector > fulltext > graph), then composite ID', () => {
    // 3 items with exact same score: 1/61
    // itemA from vector
    // itemB from fulltext
    // itemC from graph
    const itemA = makeChunk('chunk-A', ['vector']);
    const itemB = makeChunk('chunk-B', ['fulltext']);
    const itemC = makeChunk('chunk-C', ['graph']);

    const res1 = fuseRetrievalCandidates({
      vector: [itemA],
      fulltext: [itemB],
      graph: [itemC],
    });

    // Same score (1/61), same contributor count (1).
    // Modality priority: vector > fulltext > graph
    expect(res1.items[0]?.id).toBe('chunk-A');
    expect(res1.items[1]?.id).toBe('chunk-B');
    expect(res1.items[2]?.id).toBe('chunk-C');

    // Ties with same modality priority break by composite ID lexicographically
    const itemB1 = makeChunk('chunk-B1', ['fulltext']);
    const itemB2 = makeChunk('chunk-B2', ['fulltext']);
    const res2 = fuseRetrievalCandidates({
      fulltext: [itemB2, itemB1], // both rank 1 if we had 2 lists? In 1 list rank 1 & 2 differ.
    });
    // Create tie by having two lists where item1 is rank 1 in fulltext and item2 is rank 1 in fulltext?
    // Wait, within fulltext they have rank 1 and rank 2 so scores differ.
    // To make identical score:
    // item1: rank 1 fulltext (1/61)
    // item2: rank 1 fulltext? No, fulltext only has one rank 1.
    // What if item1 is rank 1 fulltext + rank 2 vector, vs item2 is rank 1 vector + rank 2 fulltext?
    // Both score 1/61 + 1/62. Both have 2 modalities. Both have vector.
    // Then lexicographical tie break!
    const tie1 = makeChunk('chunk-Z', ['vector']);
    const tie2 = makeChunk('chunk-A', ['vector']);
    const tie1FT = makeChunk('chunk-Z', ['fulltext']);
    const tie2FT = makeChunk('chunk-A', ['fulltext']);

    const resTies = fuseRetrievalCandidates({
      vector: [tie1, tie2], // tie1 rank 1 (1/61), tie2 rank 2 (1/62)
      fulltext: [tie2FT, tie1FT], // tie2 rank 1 (1/61), tie1 rank 2 (1/62)
    });
    // Both score 1/61 + 1/62.
    // Both have [vector, fulltext].
    // Lexicographical comparison of ID: 'chunk:chunk-A' < 'chunk:chunk-Z'
    expect(resTies.items[0]?.id).toBe('chunk-A');
    expect(resTies.items[1]?.id).toBe('chunk-Z');
  });

  it('enforces cutoff default 20 and defensive clamping 10-50, reporting pre-cutoff totalCandidates', () => {
    const list: ChunkItem[] = [];
    for (let i = 1; i <= 60; i++) {
      list.push(makeChunk(`c-${i}`));
    }
    // Default limit = 20
    const resDefault = fuseRetrievalCandidates({ fulltext: list });
    expect(resDefault.totalCandidates).toBe(60);
    expect(resDefault.items).toHaveLength(20);

    // Limit override 10
    const res10 = fuseRetrievalCandidates({ fulltext: list }, 10);
    expect(res10.totalCandidates).toBe(60);
    expect(res10.items).toHaveLength(10);

    // Limit override 50
    const res50 = fuseRetrievalCandidates({ fulltext: list }, 50);
    expect(res50.totalCandidates).toBe(60);
    expect(res50.items).toHaveLength(50);

    // Defensive clamp: <10 clamps to 10
    const resClampedMin = fuseRetrievalCandidates({ fulltext: list }, 5);
    expect(resClampedMin.items).toHaveLength(10);

    // Defensive clamp: >50 clamps to 50
    const resClampedMax = fuseRetrievalCandidates({ fulltext: list }, 100);
    expect(resClampedMax.items).toHaveLength(50);
  });

  it('produces byte-equivalent identical ordered output across repeated runs', () => {
    const listA = [makeChunk('c-1'), makeChunk('c-2'), makeChunk('c-3')];
    const listB = [makeChunk('c-3', ['vector']), makeChunk('c-1', ['vector'])];

    const run1 = fuseRetrievalCandidates({ fulltext: listA, vector: listB });
    const run2 = fuseRetrievalCandidates({ fulltext: listA, vector: listB });

    expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
  });

  it('throws CANDIDATE_INTEGRITY_MISMATCH when candidate immutable fields or snapshot disagree', () => {
    const c1 = makeChunk('c1');
    const c1ConflictingSnapshot = {
      ...c1,
      snapshotId: 'snap-DIFFERENT',
    };

    expect(() =>
      fuseRetrievalCandidates({
        fulltext: [c1],
        vector: [c1ConflictingSnapshot as any],
      })
    ).toThrow(CANDIDATE_INTEGRITY_MISMATCH);

    const c1ConflictingDoc = {
      ...c1,
      sourceDocumentId: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a99',
    };

    expect(() =>
      fuseRetrievalCandidates({
        fulltext: [c1],
        vector: [c1ConflictingDoc as any],
      })
    ).toThrow(CANDIDATE_INTEGRITY_MISMATCH);
  });
});
