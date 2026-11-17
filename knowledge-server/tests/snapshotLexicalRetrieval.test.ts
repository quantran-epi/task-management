/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { retrieveFromPublishedSnapshot, normalizeVietnamese, tokenize } from '../src/services/snapshotLexicalRetrieval.js';
import type { ProjectionSnapshot, ProjectedChunk, ProjectedDocument } from '../src/indexing/incrementalProjector.js';

const SET_ID = '11111111-1111-4111-8111-111111111111';
const SNAPSHOT_ID = '22222222-2222-4222-8222-222222222222';
const DOC_ID = '33333333-3333-4333-8333-333333333333';
const HASH = 'a'.repeat(64);

function chunk(overrides: Partial<ProjectedChunk> = {}): ProjectedChunk {
  return {
    occurrenceId: 'occ-1',
    representationId: 'rep-1',
    contentHash: 'b'.repeat(64),
    chunkIndex: 0,
    headingPath: ['Tổng quan', 'Rủi ro'],
    startLine: 3,
    endLine: 9,
    startOffset: 20,
    endOffset: 80,
    rawContent: 'Quản trị rủi ro tín dụng được kiểm soát định kỳ.',
    ...overrides,
  };
}

function document(chunks: ProjectedChunk[]): ProjectedDocument {
  return { documentId: DOC_ID, title: 'Báo cáo rủi ro tín dụng', contentHash: HASH, chunks };
}

function snapshot(documents: ProjectedDocument[]): ProjectionSnapshot {
  return {
    snapshotId: SNAPSHOT_ID,
    setId: SET_ID,
    chunkingPolicyVersion: 'v1',
    documents,
  };
}

describe('snapshotLexicalRetrieval (Phase 28 Task 2)', () => {
  it('normalizes Vietnamese diacritics and tokenizes', () => {
    expect(normalizeVietnamese('ĐỘNG TỪ')).toBe('dong tu');
    expect(tokenize('Rủi ro, tín dụng!')).toEqual(['rui', 'ro', 'tin', 'dung']);
    expect(tokenize('a')).toEqual([]);
  });

  it('matches diacritic-insensitive queries and preserves heading/line/offset provenance', () => {
    const snap = snapshot([document([chunk()])]);
    const result = retrieveFromPublishedSnapshot(snap, { query: 'rui ro tin dung', limit: 20 });
    expect(result.outcome).toBe('READY');
    expect(result.items).toHaveLength(1);
    const item = result.items[0]!;
    expect(item.type).toBe('chunk');
    if (item.type !== 'chunk') throw new Error('expected chunk');
    expect(item.sectionAnchor).toBe('Tổng quan > Rủi ro');
    expect(item.lineStart).toBe(3);
    expect(item.lineEnd).toBe(9);
    expect(item.rawSnippet).toContain('rủi ro tín dụng');
    expect(item.sourceDocumentId).toBe(DOC_ID);
    expect(item.publishedContentHash).toBe(HASH);
    expect(item.modalitiesContributed).toEqual(['fulltext']);
    expect(item.hasConflict).toBe(false);
    expect(item.score).toBeGreaterThan(0);
    expect(result.modalityStatus.fulltext.reason).toBe('SNAPSHOT_LEXICAL');
  });

  it('preserves the published snapshot id and emits ready fulltext status', () => {
    const snap = snapshot([document([chunk()])]);
    const result = retrieveFromPublishedSnapshot(snap, { query: 'quan tri', limit: 20 });
    expect(result.snapshotId).toBe(SNAPSHOT_ID);
    expect(result.items[0]?.snapshotId).toBe(SNAPSHOT_ID);
    expect(result.modalitiesUsed).toEqual(['fulltext']);
    expect(result.modalityStatus.fulltext.status).toBe('ok');
    expect(result.modalityStatus.vector).toEqual({
      status: 'unavailable', latencyMs: 0, itemCount: 0, reason: 'NO_RETRIEVAL_GENERATION',
    });
  });

  it('returns NO_EVIDENCE with reason and one refinement for empty tokens', () => {
    const snap = snapshot([document([chunk()])]);
    const result = retrieveFromPublishedSnapshot(snap, { query: '   ', limit: 20 });
    expect(result.outcome).toBe('NO_EVIDENCE');
    expect(result.reason).toBe('NO_MATCHING_CHUNKS');
    expect(result.suggestedRefinements?.length).toBe(1);
    expect(result.items).toEqual([]);
  });

  it('returns NO_EVIDENCE for an empty snapshot', () => {
    const result = retrieveFromPublishedSnapshot(snapshot([]), { query: 'rui ro', limit: 20 });
    expect(result.outcome).toBe('NO_EVIDENCE');
    expect(result.reason).toBe('NO_MATCHING_CHUNKS');
    expect(result.snapshotId).toBe(SNAPSHOT_ID);
  });

  it('ranks higher-scoring chunks first deterministically', () => {
    const strong = chunk({ occurrenceId: 'strong', rawContent: 'rui ro tin dung rui ro tin dung' });
    const weak = chunk({ occurrenceId: 'weak', rawContent: 'rui ro khac' });
    const snap = snapshot([document([weak, strong])]);
    const result = retrieveFromPublishedSnapshot(snap, { query: 'rui ro tin dung', limit: 20 });
    expect(result.items.map((item) => item.id)).toEqual(['strong', 'weak']);
  });

  it('respects the limit and returns an empty result when the signal is already aborted', () => {
    const chunks = Array.from({ length: 4 }, (_, index) =>
      chunk({ occurrenceId: `occ-${index}`, rawContent: 'rui ro tin dung' })
    );
    const snap = snapshot([document(chunks)]);
    const limited = retrieveFromPublishedSnapshot(snap, { query: 'rui ro', limit: 10 });
    expect(limited.items).toHaveLength(4);
    const controller = new AbortController();
    controller.abort();
    const aborted = retrieveFromPublishedSnapshot(snap, { query: 'rui ro', limit: 20 }, { signal: controller.signal });
    expect(aborted.outcome).toBe('NO_EVIDENCE');
    expect(aborted.reason).toBe('ABORTED');
    expect(aborted.items).toEqual([]);
  });
});
