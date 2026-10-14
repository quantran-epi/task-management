import { describe, it, expect } from 'vitest';
import {
  packEvidence,
  validateGroundedAnswerClosure,
  nextCitationId,
  nextPathId,
  computeWeakestClassification,
  claimAssertsOverride,
  type EvidencePack,
} from '../../src/services/ai/evidencePack';
import type {
  FederatedRetrievalResponse,
  ChunkItem,
} from '../../src/services/knowledge/retrievalProtocol';
import {
  GroundedAnswerSchema,
  GroundedAnswerSchemaV2,
  toGroundedAnswerDisplay,
  type GroundedAnswer,
} from '../../src/services/ai/groundedAnswerSchemas';
import type { LocalGroundedResult } from '../../src/services/search/localGroundedRetrieval';

function makeMockChunk(
  id: string,
  docId: string,
  docTitle: string,
  lineStart: number,
  lineEnd: number,
  snippet: string,
  hash: string,
  options: {
    matchType?: string;
    conflictGroupId?: string;
    evidenceKind?: 'policy_change' | 'release_note' | 'migration_record' | 'other';
    score?: number;
  } = {}
): ChunkItem {
  return {
    type: 'chunk',
    id,
    score: options.score ?? 10,
    modalitiesContributed: ['vector'],
    sourceDocumentId: docId,
    sourceDocumentTitle: docTitle,
    sectionAnchor: 'Section 1',
    lineStart,
    lineEnd,
    rawSnippet: snippet,
    publishedContentHash: hash,
    snapshotId: 'gsnap_11111111',
    conflictGroupId: options.conflictGroupId,
    hasConflict: !!options.conflictGroupId,
    ...(options.matchType ? { matchType: options.matchType } : {}),
    ...(options.evidenceKind ? { evidenceKind: options.evidenceKind } : {}),
  } as unknown as ChunkItem;
}

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const DOC_1 = '00000000-0000-0000-0000-000000000001';
const DOC_2 = '00000000-0000-0000-0000-000000000002';
const SET_1 = '10000000-0000-0000-0000-000000000001';
const SET_2 = '20000000-0000-0000-0000-000000000002';

describe('evidencePack', () => {
  it('Task 1 helper checks', () => {
    expect(nextCitationId('server', 0)).toBe('S1');
    expect(nextCitationId('local', 2)).toBe('L3');
    expect(nextPathId(0)).toBe('P1');
    expect(claimAssertsOverride('This overrides the old rule')).toBe(true);
    expect(claimAssertsOverride('Chính sách mới ghi đè chính sách cũ')).toBe(true);
    expect(claimAssertsOverride('Quy định thay thế hướng dẫn trước')).toBe(true);
    expect(claimAssertsOverride('Normal factual claim')).toBe(false);
  });

  // 1. Server pack happy path: 3 items with 1 path -> citations: {S1, S2, S3}, paths: {P1}, contextTruncated: false
  it('1. Server pack happy path', () => {
    const chunk1 = makeMockChunk('c1', DOC_1, 'Doc 1', 1, 10, 'snippet 1', HASH_A);
    const chunk2 = makeMockChunk('c2', DOC_1, 'Doc 1', 11, 20, 'snippet 2', HASH_A);
    const chunk3 = makeMockChunk('c3', DOC_2, 'Doc 2', 1, 10, 'snippet 3', HASH_B);

    const mockResponse: FederatedRetrievalResponse = {
      outcome: 'READY',
      items: [
        { setId: SET_1, snapshotId: 'gsnap_11111111', roleGroup: 'baseline', item: chunk1 },
        { setId: SET_1, snapshotId: 'gsnap_11111111', roleGroup: 'baseline', item: chunk2 },
        { setId: SET_1, snapshotId: 'gsnap_11111111', roleGroup: 'baseline', item: chunk3 },
      ],
      paths: [
        {
          setId: SET_1,
          snapshotId: 'gsnap_11111111',
          roleGroup: 'baseline',
          path: {
            pathId: 'P1',
            snapshotId: 'gsnap_11111111',
            nodeUrns: ['urn:plannermate:core:process:a', 'urn:plannermate:core:process:b'],
            edgeFactKeys: ['1'.repeat(64)],
            hopClassifications: ['OBSERVED'],
            hopCitationIds: [['c1']],
            hasConflict: false,
            classification: 'OBSERVED',
          },
        },
      ],
      conflictGroups: [],
      modalityStatus: {
        fulltext: { status: 'ok', latencyMs: 10, itemCount: 3 },
        vector: { status: 'ok', latencyMs: 20, itemCount: 3 },
        graph: { status: 'ok', latencyMs: 15, itemCount: 1 },
      },
      diagnostics: { degraded: false, coverageWarnings: [] },
    };

    const pack = packEvidence({ authority: 'server', serverResponse: mockResponse });
    expect(Object.keys(pack.citations)).toEqual(['S1', 'S2', 'S3']);
    expect(Object.keys(pack.paths)).toEqual(['P1']);
    expect(pack.paths['P1']?.hopCitationIds).toEqual([['S1']]);
    expect(pack.contextTruncated).toBe(false);
  });

  // 2. Dedup across sets (D-39): 2 items same (documentId, lineStart, lineEnd) across sets
  it('2. Dedup across sets (D-39)', () => {
    const chunkA = makeMockChunk('c1', DOC_1, 'Doc 1', 1, 10, 'snippet identical', HASH_A);
    const chunkB = makeMockChunk('c2', DOC_1, 'Doc 1', 1, 10, 'snippet identical', HASH_A);

    const mockResponse: FederatedRetrievalResponse = {
      outcome: 'READY',
      items: [
        { setId: SET_1, snapshotId: 'gsnap_11111111', roleGroup: 'baseline', item: chunkA },
        { setId: SET_2, snapshotId: 'gsnap_11111111', roleGroup: 'scope_diff', item: chunkB },
      ],
      paths: [],
      conflictGroups: [],
      modalityStatus: {
        fulltext: { status: 'ok', latencyMs: 10, itemCount: 2 },
        vector: { status: 'ok', latencyMs: 20, itemCount: 2 },
        graph: { status: 'ok', latencyMs: 15, itemCount: 0 },
      },
      diagnostics: { degraded: false, coverageWarnings: [] },
    };

    const pack = packEvidence({ authority: 'server', serverResponse: mockResponse });
    expect(Object.keys(pack.citations)).toHaveLength(1);
    expect(pack.citations['S1']?.setMemberships).toHaveLength(2);
  });

  // 3. Packing order (AI-SPEC §4b)
  it('3. Packing order (AI-SPEC §4b)', () => {
    // 4 items:
    // item 1: plain RRF (remaining)
    // item 2: complete path support
    // item 3: exact identifier hit
    // item 4: conflict branch item
    const chunkPlain = makeMockChunk('cPlain', DOC_1, 'Doc 1', 1, 10, 'plain rrf', HASH_A);
    const chunkPath = makeMockChunk('cPath', DOC_1, 'Doc 1', 11, 20, 'path support', HASH_A);
    const chunkId = makeMockChunk('cId', DOC_2, 'Doc 2', 1, 10, 'id hit', HASH_B, {
      matchType: 'identifier',
    });
    const chunkConflict = makeMockChunk('cConf', DOC_2, 'Doc 2', 11, 20, 'conflict branch', HASH_B, {
      conflictGroupId: 'conf_1',
    });

    const mockResponse: FederatedRetrievalResponse = {
      outcome: 'READY',
      items: [
        { setId: SET_1, snapshotId: 'gsnap_11111111', roleGroup: 'baseline', item: chunkPlain },
        { setId: SET_1, snapshotId: 'gsnap_11111111', roleGroup: 'baseline', item: chunkPath },
        { setId: SET_1, snapshotId: 'gsnap_11111111', roleGroup: 'baseline', item: chunkId },
        { setId: SET_1, snapshotId: 'gsnap_11111111', roleGroup: 'baseline', item: chunkConflict },
      ],
      paths: [
        {
          setId: SET_1,
          snapshotId: 'gsnap_11111111',
          roleGroup: 'baseline',
          path: {
            pathId: 'P1',
            snapshotId: 'gsnap_11111111',
            nodeUrns: ['urn:plannermate:core:process:a', 'urn:plannermate:core:process:b'],
            edgeFactKeys: ['1'.repeat(64)],
            hopClassifications: ['OBSERVED'],
            hopCitationIds: [['cPath']],
            hasConflict: false,
            classification: 'OBSERVED',
          },
        },
      ],
      conflictGroups: [
        {
          setId: SET_1,
          snapshotId: 'gsnap_11111111',
          roleGroup: 'baseline',
          conflictGroup: { conflictGroupId: 'conf_1', dimension: 'Version', scopeProof: null },
        },
      ],
      modalityStatus: {
        fulltext: { status: 'ok', latencyMs: 10, itemCount: 4 },
        vector: { status: 'ok', latencyMs: 20, itemCount: 4 },
        graph: { status: 'ok', latencyMs: 15, itemCount: 1 },
      },
      diagnostics: { degraded: false, coverageWarnings: [] },
    };

    const pack = packEvidence({ authority: 'server', serverResponse: mockResponse });
    // Packing order expected:
    // 0: conflict branch (S4 -> conflict)
    // 1: identifier hit (S3 -> id)
    // 2: path support (S2 -> path)
    // 3: remaining RRF (S1 -> plain)
    expect(pack.promptEvidence[0]?.text).toBe('conflict branch');
    expect(pack.promptEvidence[1]?.text).toBe('id hit');
    expect(pack.promptEvidence[2]?.text).toBe('path support');
    expect(pack.promptEvidence[3]?.text).toBe('plain rrf');
  });

  // 4. Budget drop
  it('4. Budget drop', () => {
    const items = [1, 2, 3, 4, 5].map((i) =>
      makeMockChunk(`c${i}`, DOC_1, `Doc ${i}`, i * 10, i * 10 + 5, 'x'.repeat(100), HASH_A)
    );

    const mockResponse: FederatedRetrievalResponse = {
      outcome: 'READY',
      items: items.map((item) => ({
        setId: SET_1,
        snapshotId: 'gsnap_11111111',
        roleGroup: 'baseline' as const,
        item,
      })),
      paths: [],
      conflictGroups: [],
      modalityStatus: {
        fulltext: { status: 'ok', latencyMs: 10, itemCount: 5 },
        vector: { status: 'ok', latencyMs: 20, itemCount: 5 },
        graph: { status: 'ok', latencyMs: 15, itemCount: 0 },
      },
      diagnostics: { degraded: false, coverageWarnings: [] },
    };

    const pack = packEvidence(
      { authority: 'server', serverResponse: mockResponse },
      { maxEvidenceChars: 300 }
    );
    expect(pack.promptEvidence).toHaveLength(3);
    expect(pack.contextTruncated).toBe(true);
    expect(pack.coverageWarnings.some((w) => w.includes('omitted for budget'))).toBe(true);
  });

  // 5. Path closure drops orphan path
  it('5. Path closure drops orphan path', () => {
    const chunk1 = makeMockChunk('c1', DOC_1, 'Doc 1', 1, 10, 'snippet', HASH_A);
    const mockResponse: FederatedRetrievalResponse = {
      outcome: 'READY',
      items: [
        { setId: SET_1, snapshotId: 'gsnap_11111111', roleGroup: 'baseline', item: chunk1 },
      ],
      paths: [
        {
          setId: SET_1,
          snapshotId: 'gsnap_11111111',
          roleGroup: 'baseline',
          path: {
            pathId: 'P1',
            snapshotId: 'gsnap_11111111',
            nodeUrns: ['urn:plannermate:core:process:a', 'urn:plannermate:core:process:b'],
            edgeFactKeys: ['1'.repeat(64)],
            hopClassifications: ['OBSERVED'],
            hopCitationIds: [['nonExistentChunkId']],
            hasConflict: false,
            classification: 'OBSERVED',
          },
        },
      ],
      conflictGroups: [],
      modalityStatus: {
        fulltext: { status: 'ok', latencyMs: 10, itemCount: 1 },
        vector: { status: 'ok', latencyMs: 20, itemCount: 1 },
        graph: { status: 'ok', latencyMs: 15, itemCount: 0 },
      },
      diagnostics: { degraded: false, coverageWarnings: [] },
    };

    const pack = packEvidence({ authority: 'server', serverResponse: mockResponse });
    expect(Object.keys(pack.paths)).toHaveLength(0);
  });

  // 6. Closure validator rejects unknown citation
  it('6. Closure validator rejects unknown citation', () => {
    const pack: EvidencePack = {
      authority: 'server',
      citations: {
        S1: {
          citationId: 'S1',
          documentId: DOC_1,
          documentTitle: 'Doc 1',
          sectionAnchor: null,
          lineStart: 1,
          lineEnd: 5,
          authority: 'server',
          evidenceClass: 'OBSERVED',
          snapshotId: 'gsnap_11111111',
          publishedContentHash: HASH_A,
          citedExcerpt: 'valid source',
          setMemberships: [{ setId: SET_1, setName: 'Set 1' }],
        },
      },
      paths: {},
      conflicts: [],
      promptEvidence: [{ id: 'S1', text: 'valid source' }],
      contextTruncated: false,
      coverageWarnings: [],
    };

    const answer: GroundedAnswer = {
      schemaVersion: 1,
      language: 'en',
      conclusion: 'Test conclusion',
      claims: [
        {
          id: 'C1',
          text: 'Unknown citation claim',
          classification: 'DIRECT',
          citationIds: ['S9'],
          pathId: null,
        },
      ],
      unsupportedParts: [],
    };

    const result = validateGroundedAnswerClosure(answer, pack);
    expect(result.valid).toBe(false);
    expect(result.issues[0]?.path).toBe('claims[0].citationIds[0]');
    expect(result.issues[0]?.code).toBe('unknown_citation_id');
  });

  // 7. Closure validator enforces INFERRED -> pathId
  it('7. Closure validator enforces INFERRED -> pathId', () => {
    const pack: EvidencePack = {
      authority: 'server',
      citations: {
        S1: {
          citationId: 'S1',
          documentId: DOC_1,
          documentTitle: 'Doc 1',
          sectionAnchor: null,
          lineStart: 1,
          lineEnd: 5,
          authority: 'server',
          evidenceClass: 'OBSERVED',
          snapshotId: 'gsnap_11111111',
          publishedContentHash: HASH_A,
          citedExcerpt: 'valid source',
          setMemberships: [{ setId: SET_1, setName: 'Set 1' }],
        },
      },
      paths: {},
      conflicts: [],
      promptEvidence: [{ id: 'S1', text: 'valid source' }],
      contextTruncated: false,
      coverageWarnings: [],
    };

    const answer: GroundedAnswer = {
      schemaVersion: 1,
      language: 'en',
      conclusion: 'Conclusion',
      claims: [
        {
          id: 'C1',
          text: 'Inferred claim without path',
          classification: 'INFERRED',
          citationIds: ['S1'],
          pathId: null,
        },
      ],
      unsupportedParts: [],
    };

    const result = validateGroundedAnswerClosure(answer, pack);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'inferred_requires_path')).toBe(true);
  });

  // 8. Closure validator rejects DIRECT with pathId
  it('8. Closure validator rejects DIRECT with pathId', () => {
    const pack: EvidencePack = {
      authority: 'server',
      citations: {
        S1: {
          citationId: 'S1',
          documentId: DOC_1,
          documentTitle: 'Doc 1',
          sectionAnchor: null,
          lineStart: 1,
          lineEnd: 5,
          authority: 'server',
          evidenceClass: 'OBSERVED',
          snapshotId: 'gsnap_11111111',
          publishedContentHash: HASH_A,
          citedExcerpt: 'valid source',
          setMemberships: [{ setId: SET_1, setName: 'Set 1' }],
        },
      },
      paths: {
        P1: {
          pathId: 'P1',
          snapshotId: 'gsnap_11111111',
          nodeUrns: ['urn:plannermate:core:process:a', 'urn:plannermate:core:process:b'],
          edgeFactKeys: ['1'.repeat(64)],
          hopClassifications: ['OBSERVED'],
          hopCitationIds: [['S1']],
          classification: 'OBSERVED',
          hasConflict: false,
        },
      },
      conflicts: [],
      promptEvidence: [{ id: 'S1', text: 'valid source' }],
      contextTruncated: false,
      coverageWarnings: [],
    };

    const answer = {
      schemaVersion: 1,
      language: 'en',
      conclusion: 'Conclusion',
      claims: [
        {
          id: 'C1',
          text: 'Direct claim with path',
          classification: 'DIRECT' as const,
          citationIds: ['S1'],
          pathId: 'P1',
        },
      ],
      unsupportedParts: [],
    } as unknown as GroundedAnswer;

    const result = validateGroundedAnswerClosure(answer, pack);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'direct_claim_has_path')).toBe(true);
  });

  // 9. Closure validator rejects claim derived from one conflict branch only
  it('9. Closure validator rejects claim derived from one conflict branch only', () => {
    const pack: EvidencePack = {
      authority: 'server',
      citations: {
        S1: {
          citationId: 'S1',
          documentId: DOC_1,
          documentTitle: 'Doc 1',
          sectionAnchor: null,
          lineStart: 1,
          lineEnd: 5,
          authority: 'server',
          evidenceClass: 'OBSERVED',
          snapshotId: 'gsnap_11111111',
          publishedContentHash: HASH_A,
          citedExcerpt: 'branch 1 fact',
          setMemberships: [{ setId: SET_1, setName: 'Set 1' }],
          conflictGroupId: 'cg_1',
        },
        S2: {
          citationId: 'S2',
          documentId: DOC_2,
          documentTitle: 'Doc 2',
          sectionAnchor: null,
          lineStart: 1,
          lineEnd: 5,
          authority: 'server',
          evidenceClass: 'OBSERVED',
          snapshotId: 'gsnap_11111111',
          publishedContentHash: HASH_B,
          citedExcerpt: 'branch 2 fact',
          setMemberships: [{ setId: SET_1, setName: 'Set 1' }],
          conflictGroupId: 'cg_1',
        },
      },
      paths: {},
      conflicts: [
        {
          conflictGroupId: 'cg_1',
          dimension: 'Behavior',
          scopeProof: null,
        },
      ],
      promptEvidence: [],
      contextTruncated: false,
      coverageWarnings: [],
    };

    const answer: GroundedAnswer = {
      schemaVersion: 1,
      language: 'en',
      conclusion: 'Conclusion',
      claims: [
        {
          id: 'C1',
          text: 'Biased fact citing only branch 1',
          classification: 'DIRECT',
          citationIds: ['S1'],
          pathId: null,
        },
      ],
      unsupportedParts: [],
    };

    const result = validateGroundedAnswerClosure(answer, pack);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'conflict_branch_bias')).toBe(true);
  });

  // 10. Weakest classification (D-30)
  it('10. Weakest classification', () => {
    expect(computeWeakestClassification(['OBSERVED', 'INFERRED'])).toBe('INFERRED');
    expect(computeWeakestClassification(['BUSINESS_APPROVED', 'OBSERVED'])).toBe('OBSERVED');
    expect(computeWeakestClassification(['BUSINESS_APPROVED', 'LOCAL'])).toBe('LOCAL');
  });

  // 11. Local pack
  it('11. Local pack', () => {
    const localResult: LocalGroundedResult = {
      ranges: [
        {
          documentId: DOC_1,
          documentTitle: 'Local Doc 1',
          sectionAnchor: null,
          lineStart: 1,
          lineEnd: 5,
          startOffset: 0,
          endOffset: 50,
          rawSnippet: 'local snippet 1',
          contentHash: HASH_A,
          score: 1.5,
          matchedTerms: ['term1'],
          setMemberships: [{ setId: SET_1, setName: 'Set 1' }],
        },
        {
          documentId: DOC_1,
          documentTitle: 'Local Doc 1',
          sectionAnchor: null,
          lineStart: 10,
          lineEnd: 15,
          startOffset: 60,
          endOffset: 110,
          rawSnippet: 'local snippet 2',
          contentHash: HASH_A,
          score: 1.2,
          matchedTerms: ['term1'],
          setMemberships: [{ setId: SET_1, setName: 'Set 1' }],
        },
        {
          documentId: DOC_2,
          documentTitle: 'Local Doc 2',
          sectionAnchor: null,
          lineStart: 1,
          lineEnd: 5,
          startOffset: 0,
          endOffset: 50,
          rawSnippet: 'local snippet 3',
          contentHash: HASH_B,
          score: 1.0,
          matchedTerms: ['term2'],
          setMemberships: [{ setId: SET_1, setName: 'Set 1' }],
        },
      ],
      strongEvidence: true,
      totalScanned: 2,
    };

    const pack = packEvidence({ authority: 'local', localResult });
    expect(Object.keys(pack.citations)).toEqual(['L1', 'L2', 'L3']);
    expect(pack.paths).toEqual({});
    expect(pack.contextTruncated).toBe(false);
    expect(pack.citations['L1']?.authority).toBe('local');
  });

  // 12. Partial support: coverageWarnings carries over
  it('12. Partial support', () => {
    const chunk1 = makeMockChunk('c1', DOC_1, 'Doc 1', 1, 10, 'snippet', HASH_A);
    const mockResponse: FederatedRetrievalResponse = {
      outcome: 'READY',
      items: [
        { setId: SET_1, snapshotId: 'gsnap_11111111', roleGroup: 'baseline', item: chunk1 },
      ],
      paths: [],
      conflictGroups: [],
      modalityStatus: {
        fulltext: { status: 'ok', latencyMs: 10, itemCount: 1 },
        vector: { status: 'ok', latencyMs: 20, itemCount: 1 },
        graph: { status: 'ok', latencyMs: 15, itemCount: 0 },
      },
      diagnostics: {
        degraded: false,
        coverageWarnings: [
          {
            code: 'TIMEOUT',
            setId: SET_2,
            message: 'Set 2 retrieval timed out; partial results only',
          },
        ],
      },
    };

    const pack = packEvidence({ authority: 'server', serverResponse: mockResponse });
    expect(pack.coverageWarnings).toContain('Set 2 retrieval timed out; partial results only');
  });

  // 13. D-26 override-language rejected without metadata or cited evidence
  it('13. D-26 override-language rejected without metadata or cited evidence', () => {
    const pack: EvidencePack = {
      authority: 'server',
      citations: {
        S1: {
          citationId: 'S1',
          documentId: DOC_1,
          documentTitle: 'Doc 1',
          sectionAnchor: null,
          lineStart: 1,
          lineEnd: 5,
          authority: 'server',
          evidenceClass: 'OBSERVED',
          snapshotId: 'gsnap_11111111',
          publishedContentHash: HASH_A,
          citedExcerpt: 'evidence text',
          setMemberships: [{ setId: SET_1, setName: 'Set 1' }],
          evidenceKind: 'other',
        },
      },
      paths: {},
      conflicts: [],
      promptEvidence: [{ id: 'S1', text: 'evidence text' }],
      contextTruncated: false,
      coverageWarnings: [],
    };

    const answer: GroundedAnswer = {
      schemaVersion: 1,
      language: 'vi',
      conclusion: 'Conclusion',
      claims: [
        {
          id: 'C1',
          text: 'Chính sách mới ghi đè chính sách cũ',
          classification: 'DIRECT',
          citationIds: ['S1'],
          pathId: null,
        },
      ],
      unsupportedParts: [],
    };

    const result = validateGroundedAnswerClosure(answer, pack);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'override_language_without_proof')).toBe(true);
    expect(result.issues[0]?.path).toBe('claims[0].text');
  });

  // 14. D-26 override-language accepted with SUPERSEDES metadata
  it('14. D-26 override-language accepted with SUPERSEDES metadata', () => {
    const pack: EvidencePack = {
      authority: 'server',
      citations: {
        S1: {
          citationId: 'S1',
          documentId: DOC_1,
          documentTitle: 'Doc 1',
          sectionAnchor: null,
          lineStart: 1,
          lineEnd: 5,
          authority: 'server',
          evidenceClass: 'OBSERVED',
          snapshotId: 'gsnap_11111111',
          publishedContentHash: HASH_A,
          citedExcerpt: 'evidence text',
          setMemberships: [{ setId: SET_1, setName: 'Set 1' }],
          evidenceKind: 'other',
          conflictGroupId: 'cg_sup',
        },
      },
      paths: {},
      conflicts: [
        {
          conflictGroupId: 'cg_sup',
          dimension: 'Version',
          scopeProof: {
            dimension: 'Version',
            environment: null,
            version: '2.0',
            overrideRelation: 'SUPERSEDES',
          },
        },
      ],
      promptEvidence: [{ id: 'S1', text: 'evidence text' }],
      contextTruncated: false,
      coverageWarnings: [],
    };

    const answer: GroundedAnswer = {
      schemaVersion: 1,
      language: 'vi',
      conclusion: 'Conclusion',
      claims: [
        {
          id: 'C1',
          text: 'Chính sách mới ghi đè chính sách cũ',
          classification: 'DIRECT',
          citationIds: ['S1'],
          pathId: null,
        },
      ],
      unsupportedParts: [],
    };

    const result = validateGroundedAnswerClosure(answer, pack);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  // 15. D-26 override-language accepted with cited-evidence allowlist
  it('15. D-26 override-language accepted with cited-evidence allowlist', () => {
    const pack: EvidencePack = {
      authority: 'server',
      citations: {
        S1: {
          citationId: 'S1',
          documentId: DOC_1,
          documentTitle: 'Release notes v2',
          sectionAnchor: null,
          lineStart: 1,
          lineEnd: 5,
          authority: 'server',
          evidenceClass: 'OBSERVED',
          snapshotId: 'gsnap_11111111',
          publishedContentHash: HASH_A,
          citedExcerpt: 'Version 2 release details',
          setMemberships: [{ setId: SET_1, setName: 'Set 1' }],
          evidenceKind: 'release_note',
        },
      },
      paths: {},
      conflicts: [],
      promptEvidence: [{ id: 'S1', text: 'Version 2 release details' }],
      contextTruncated: false,
      coverageWarnings: [],
    };

    const answer: GroundedAnswer = {
      schemaVersion: 1,
      language: 'vi',
      conclusion: 'Conclusion',
      claims: [
        {
          id: 'C1',
          text: 'Phiên bản 2 supersedes phiên bản 1',
          classification: 'DIRECT',
          citationIds: ['S1'],
          pathId: null,
        },
      ],
      unsupportedParts: [],
    };

    const result = validateGroundedAnswerClosure(answer, pack);
    expect(result.valid).toBe(true);
  });

  // 16. D-26 Vietnamese tokens covered
  it('16. D-26 Vietnamese tokens covered', () => {
    expect(claimAssertsOverride('Tính năng này thay thế tính năng cũ')).toBe(true);
    expect(claimAssertsOverride('Dữ liệu này ghi đè cấu hình mặc định')).toBe(true);
    expect(claimAssertsOverride('Không có từ khóa liên quan')).toBe(false);
  });

  // 17. Local authority relaxes override language guard
  it('17. Local authority relaxes override language guard', () => {
    const localPack: EvidencePack = {
      authority: 'local',
      citations: {
        L1: {
          citationId: 'L1',
          documentId: DOC_1,
          documentTitle: 'Local Spec',
          sectionAnchor: null,
          lineStart: 1,
          lineEnd: 5,
          authority: 'local',
          evidenceClass: 'LOCAL',
          snapshotId: null,
          publishedContentHash: null,
          citedExcerpt: 'evidence text',
          setMemberships: [{ setId: SET_1, setName: 'Set 1' }],
          evidenceKind: 'other',
        },
      },
      paths: {},
      conflicts: [],
      promptEvidence: [{ id: 'L1', text: 'evidence text' }],
      contextTruncated: false,
      coverageWarnings: [],
    };

    const answer: GroundedAnswer = {
      schemaVersion: 1,
      language: 'vi',
      conclusion: 'Conclusion',
      claims: [
        {
          id: 'C1',
          text: 'Chức năng mới thay thế quy trình cũ',
          classification: 'DIRECT',
          citationIds: ['L1'],
          pathId: null,
        },
      ],
      unsupportedParts: [],
    };

    const result = validateGroundedAnswerClosure(answer, localPack);
    expect(result.valid).toBe(true);
  });

  // 18. Schema V2 parses valid v2 output with confidence and hypotheses
  it('18. Schema V2 parses valid v2 output with confidence and hypotheses', () => {
    const v2Valid = {
      schemaVersion: 2,
      language: 'vi',
      conclusion: 'MAIN1.FCL_CYCLE_COUNTER là bảng lưu trữ chu kỳ.',
      confidence: 'high',
      confidenceReason: 'Trực tiếp trích dẫn đầy đủ.',
      claims: [
        {
          id: 'C1',
          text: 'MAIN1.FCL_CYCLE_COUNTER lưu trữ số đếm chu kỳ.',
          classification: 'DIRECT',
          citationIds: ['S1'],
          pathId: null,
        },
      ],
      hypotheses: [],
      unsupportedParts: [],
    };
    const parsed = GroundedAnswerSchemaV2.safeParse(v2Valid);
    expect(parsed.success).toBe(true);

    const unionParsed = GroundedAnswerSchema.safeParse(v2Valid);
    expect(unionParsed.success).toBe(true);
  });

  // 19. Discriminated union parses legacy v1 and toGroundedAnswerDisplay maps it safely
  it('19. Discriminated union parses legacy v1 and toGroundedAnswerDisplay maps it safely', () => {
    const v1Legacy: GroundedAnswer = {
      schemaVersion: 1,
      language: 'vi',
      conclusion: 'Kết quả v1 cũ',
      claims: [
        {
          id: 'C1',
          text: 'Nội dung v1',
          classification: 'DIRECT',
          citationIds: ['S1'],
          pathId: null,
        },
      ],
      unsupportedParts: [],
    };
    const unionParsed = GroundedAnswerSchema.safeParse(v1Legacy);
    expect(unionParsed.success).toBe(true);

    const display = toGroundedAnswerDisplay(v1Legacy);
    expect(display.schemaVersion).toBe(2);
    expect(display.confidence).toBe('unknown');
    expect(display.confidenceReason).toBe('Bản ghi lịch sử (schema v1)');
    expect(display.hypotheses).toEqual([]);
    expect(display.claims[0]?.id).toBe('C1');
  });

  // 20. HypothesisClaimSchema enforces id ^H[1-9][0-9]*$, justification, and no citations
  it('20. Hypothesis in V2 validated without citation IDs', () => {
    const pack: EvidencePack = {
      authority: 'server',
      citations: {},
      paths: {},
      conflicts: [],
      promptEvidence: [],
      contextTruncated: false,
      coverageWarnings: [],
    };

    const v2WithHypothesis: GroundedAnswer = {
      schemaVersion: 2,
      language: 'vi',
      conclusion: 'Suy đoán về cổng thanh toán',
      confidence: 'low',
      confidenceReason: 'Suy đoán theo yêu cầu người dùng',
      claims: [],
      hypotheses: [
        {
          id: 'H1',
          text: 'Cổng thanh toán trung gian chuyển tiếp điện',
          justification: 'Dựa trên kiến trúc thường gặp',
        },
      ],
      unsupportedParts: [],
    };

    const closureResult = validateGroundedAnswerClosure(v2WithHypothesis, pack);
    expect(closureResult.valid).toBe(true);

    const illegalHypothesis = {
      ...v2WithHypothesis,
      hypotheses: [
        {
          id: 'H1',
          text: 'Cổng thanh toán trung gian',
          justification: 'Dựa trên kiến trúc',
          citationIds: ['S1'],
        },
      ],
    };
    const badClosureResult = validateGroundedAnswerClosure(illegalHypothesis as unknown as GroundedAnswer, pack);
    expect(badClosureResult.valid).toBe(false);
    expect(badClosureResult.issues.some((i) => i.code === 'hypothesis_has_citations')).toBe(true);
  });
});
