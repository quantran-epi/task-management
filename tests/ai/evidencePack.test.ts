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
  NodeKind,
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

  it('rejects mixed-source answers that omit one source or hide an absolute conflict', () => {
    const pack: EvidencePack = {
      authority: 'server',
      citations: {
        S1: {
          citationId: 'S1', documentId: DOC_1, documentTitle: 'Published doc', sectionAnchor: null,
          lineStart: 1, lineEnd: 2, authority: 'server', evidenceClass: 'OBSERVED',
          snapshotId: 'gsnap_11111111', publishedContentHash: HASH_A,
          citedExcerpt: 'Package EVT_EVENT_PKG.PROCESS writes EVT_EVENT.', setMemberships: [],
        },
        M1: {
          citationId: 'M1', documentId: 'mcp:catalog:search', documentTitle: '[MCP] Catalog', sectionAnchor: null,
          lineStart: 1, lineEnd: 1, authority: 'server', evidenceClass: 'OBSERVED',
          snapshotId: 'mcp_live', publishedContentHash: null,
          citedExcerpt: 'Trigger EVT_EVENT_TRG writes EVT_EVENT.', setMemberships: [], evidenceKind: 'mcp_tool',
        },
      },
      paths: {}, conflicts: [],
      promptEvidence: [{ id: 'S1', text: 'Package writes table' }, { id: 'M1', text: 'Trigger writes table' }],
      contextTruncated: false, coverageWarnings: [],
    };

    const hiddenConflict: GroundedAnswer = {
      schemaVersion: 2, language: 'vi',
      conclusion: 'Không có package nào; duy nhất trigger ghi bảng [M1].',
      confidence: 'high', confidenceReason: 'MCP trả kết quả.',
      claims: [{ id: 'C1', text: 'Duy nhất trigger ghi bảng.', classification: 'DIRECT', citationIds: ['M1'], pathId: null }],
      hypotheses: [], unsupportedParts: [],
    };
    const invalid = validateGroundedAnswerClosure(hiddenConflict, pack);
    expect(invalid.valid).toBe(false);
    expect(invalid.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'knowledge_source_omitted',
      'cross_source_conflict_not_disclosed',
    ]));

    const disclosedConflict: GroundedAnswer = {
      schemaVersion: 2, language: 'vi',
      conclusion: 'Hai nguồn xung đột: tài liệu nói package ghi bảng [S1], MCP nói trigger ghi bảng [M1]. Chưa đủ căn cứ chọn nguồn đúng.',
      confidence: 'low', confidenceReason: 'Hai nguồn chưa nhất quán.',
      claims: [
        { id: 'C1', text: 'Tài liệu nói package ghi bảng.', classification: 'DIRECT', citationIds: ['S1'], pathId: null },
        { id: 'C2', text: 'MCP nói trigger ghi bảng.', classification: 'DIRECT', citationIds: ['M1'], pathId: null },
      ],
      hypotheses: [], unsupportedParts: [],
    };
    expect(validateGroundedAnswerClosure(disclosedConflict, pack).valid).toBe(true);
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

  it('21. sorts general bucketD candidates by relevance score descending before budget drop', () => {
    const lowScoreChunk = makeMockChunk('c_low', DOC_1, 'Low Doc', 1, 10, 'low score snippet', HASH_A, { score: 0.01 });
    const highScoreChunk = makeMockChunk('c_high', DOC_2, 'High Doc', 1, 10, 'high score snippet', HASH_B, { score: 0.99 });

    const mockResponse: FederatedRetrievalResponse = {
      outcome: 'READY',
      items: [
        { setId: SET_1, snapshotId: 'gsnap_11111111', roleGroup: 'baseline', item: lowScoreChunk },
        { setId: SET_2, snapshotId: 'gsnap_11111111', roleGroup: 'baseline', item: highScoreChunk },
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

    const pack = packEvidence(
      { authority: 'server', serverResponse: mockResponse },
      { maxPromptEvidenceCount: 1 }
    );

    expect(pack.promptEvidence).toHaveLength(1);
    // Highest score chunk should be packed first even though it appeared second in items list
    expect(pack.promptEvidence[0]?.id).toBe('S2');
    expect(pack.promptEvidence[0]?.text).toBe('high score snippet');
  });

  it('22. handles flat chunk items in resp.items and populates documentTitle in promptEvidence', () => {
    const chunkA = makeMockChunk('c_1', DOC_1, '01 — DB wiring on main1', 1, 10, 'main1 debt packages', HASH_A, { score: 0.85 });
    const chunkB = makeMockChunk('c_2', DOC_2, 'Credit payment allocation — FE/BO pay → debts', 1, 10, 'MAIN1.CRD_API_PAYMENT_PKG.CREATE_PAYMENT', HASH_B, { score: 0.95 });

    // Mock response where items are flat ChunkItems (no nested .item)
    const mockFlatResponse: any = {
      outcome: 'DEGRADED',
      snapshotId: 'gsnap_22222222',
      items: [chunkA, chunkB],
      paths: [],
      conflictGroups: [],
      modalityStatus: {
        fulltext: { status: 'ok', latencyMs: 10, itemCount: 2 },
        vector: { status: 'ok', latencyMs: 20, itemCount: 2 },
        graph: { status: 'ok', latencyMs: 15, itemCount: 0 },
      },
      diagnostics: { degraded: true, coverageWarnings: [] },
    };

    const pack = packEvidence({ authority: 'server', serverResponse: mockFlatResponse });

    expect(pack.promptEvidence).toHaveLength(2);
    // Encounter order preserved in citations map (D-39)
    expect(pack.citations['S1']?.documentTitle).toBe('01 — DB wiring on main1');
    expect(pack.citations['S2']?.documentTitle).toBe('Credit payment allocation — FE/BO pay → debts');
    // Score descending order in promptEvidence (chunkB 0.95 > chunkA 0.85)
    expect(pack.promptEvidence[0]?.documentTitle).toBe('Credit payment allocation — FE/BO pay → debts');
    expect(pack.promptEvidence[1]?.documentTitle).toBe('01 — DB wiring on main1');
  });

  it('drops vector-only document noise when MCP evidence exists', () => {
    const vectorOnlyChunk = makeMockChunk(
      'c_noise', DOC_1, 'Unrelated published doc', 1, 5,
      'MAIN1.EVT_EVENT package writes EVT_EVENT', HASH_A
    );
    const response: FederatedRetrievalResponse = {
      outcome: 'DEGRADED',
      items: [{
        setId: SET_1,
        snapshotId: 'gsnap_11111111',
        roleGroup: 'baseline',
        item: vectorOnlyChunk,
      }],
      paths: [], conflictGroups: [],
      modalityStatus: {
        fulltext: { status: 'ok', latencyMs: 5, itemCount: 0 },
        vector: { status: 'ok', latencyMs: 5, itemCount: 1 },
        graph: { status: 'unavailable', latencyMs: 0, itemCount: 0 },
      },
      diagnostics: { degraded: true, coverageWarnings: [] },
    };
    const mcpItems = [{
      serverId: 'graphiti-banking', serverName: 'Graphiti Banking MCP', toolName: 'search_nodes',
      args: { query: 'card issue date' }, rawResult: 'ISS_CARD_INSTANCE.ISS_DATE stores issue date',
      timestamp: '2026-10-26T00:00:00.000Z',
    }];

    const pack = packEvidence({ authority: 'server', serverResponse: response, mcpItems });

    expect(Object.keys(pack.citations)).toEqual(['M1']);
    expect(pack.promptEvidence.map((item) => item.id)).toEqual(['M1']);
  });

  it('keeps direct document evidence alongside MCP evidence', () => {
    const directChunk: ChunkItem = {
      ...makeMockChunk('c_direct', DOC_1, 'Published doc', 1, 5, 'Package writes table', HASH_A),
      modalitiesContributed: ['vector', 'fulltext', 'graph'],
    };
    const response: FederatedRetrievalResponse = {
      outcome: 'READY',
      items: [{ setId: SET_1, snapshotId: 'gsnap_11111111', roleGroup: 'baseline', item: directChunk }],
      paths: [], conflictGroups: [],
      modalityStatus: {
        fulltext: { status: 'ok', latencyMs: 5, itemCount: 1 },
        vector: { status: 'ok', latencyMs: 5, itemCount: 1 },
        graph: { status: 'ok', latencyMs: 5, itemCount: 1 },
      },
      diagnostics: { degraded: false, coverageWarnings: [] },
    };
    const mcpItems = [{
      serverId: 'graphiti-banking', serverName: 'Graphiti Banking MCP', toolName: 'search_nodes',
      args: { query: 'writer' }, rawResult: 'Trigger writes table', timestamp: '2026-10-26T00:00:00.000Z',
    }];

    const pack = packEvidence({ authority: 'server', serverResponse: response, mcpItems });

    expect(Object.keys(pack.citations)).toEqual(['S1', 'M1']);
    expect(pack.promptEvidence.map((item) => item.id)).toEqual(['S1', 'M1']);
  });

  it('23. packs MCP retrieved items into citations with M1, M2... IDs and validates closure', () => {
    const mcpItems = [
      {
        serverId: 'graphiti-banking',
        serverName: 'Graphiti Banking MCP',
        toolName: 'search_nodes',
        args: { query: 'ACCOUNTS' },
        rawResult: JSON.stringify([{ name: 'SVFE_SHB.ACCOUNTS', type: 'Table' }]),
        timestamp: '2026-10-20T00:00:00.000Z',
      },
      {
        serverId: 'oracle-db',
        serverName: 'Oracle Database',
        toolName: 'describe_table',
        args: { table: 'SVFE_SHB.ACCOUNTS' },
        rawResult: 'COLUMNS: ID, ACC_NUM, BALANCE',
        timestamp: '2026-10-20T00:00:00.000Z',
      },
    ];

    const pack = packEvidence({
      authority: 'server',
      mcpItems,
    });

    expect(pack.citations['M1']).toBeDefined();
    expect(pack.citations['M2']).toBeDefined();
    expect(pack.citations['M1']?.authority).toBe('server');
    expect(pack.citations['M1']?.evidenceClass).toBe('OBSERVED');
    expect(pack.citations['M1']?.evidenceKind).toBe('mcp_tool');
    expect(pack.citations['M1']?.documentTitle).toBe('[MCP] Graphiti Banking MCP - search_nodes');
    expect(pack.citations['M2']?.documentTitle).toBe('[MCP] Oracle Database - describe_table');

    expect(pack.promptEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'M1', documentTitle: '[MCP] Graphiti Banking MCP - search_nodes' }),
        expect.objectContaining({ id: 'M2', documentTitle: '[MCP] Oracle Database - describe_table' }),
      ])
    );

    const answerWithMcp: GroundedAnswer = {
      schemaVersion: 1,
      language: 'vi',
      conclusion: 'Thông tin tài khoản từ hệ thống SmartVista.',
      claims: [
        {
          id: 'C1',
          text: 'Bảng SVFE_SHB.ACCOUNTS lưu trữ số tài khoản và số dư.',
          classification: 'DIRECT',
          citationIds: ['M1', 'M2'],
          pathId: null,
        },
      ],
      unsupportedParts: [],
    };

    const closureResult = validateGroundedAnswerClosure(answerWithMcp, pack);
    expect(closureResult.valid).toBe(true);
    expect(closureResult.issues).toHaveLength(0);
  });

  describe('Phase 24 entity-aware packing (SC-6)', () => {
    const ENTITY_URN = 'urn:plannermate:core:process:cytp1002';
    const ENTITY_URN_2 = 'urn:plannermate:core:process:cytp2002';
    const SNAP = 'gsnap_11111111';

    function makeEntityItem(
      urn: string,
      canonicalName: string,
      kind: NodeKind = 'ScheduledProcess',
      score = 5
    ) {
      return {
        type: 'entity' as const,
        id: urn,
        score,
        modalitiesContributed: ['graph' as const],
        urn,
        canonicalName,
        kind,
        snapshotId: SNAP,
        hasConflict: false,
      };
    }

    function makeEntityResponse(
      items: FederatedRetrievalResponse['items'],
      graph: { entityCount?: number; edgeCount?: number; pathCount?: number } = {}
    ): FederatedRetrievalResponse {
      return {
        outcome: 'SEED_ONLY',
        items,
        paths: [],
        conflictGroups: [],
        modalityStatus: {
          fulltext: { status: 'ok', latencyMs: 5, itemCount: 0 },
          vector: { status: 'ok', latencyMs: 5, itemCount: 0 },
          graph: { status: 'ok', latencyMs: 8, itemCount: items.length, ...graph },
        },
        diagnostics: { degraded: false, coverageWarnings: [] },
      };
    }

    it('preserves entity identity fields in EvidencePack.entities', () => {
      const pack = packEvidence({
        authority: 'server',
        serverResponse: makeEntityResponse(
          [
            {
              setId: SET_1,
              snapshotId: SNAP,
              roleGroup: 'baseline',
              item: makeEntityItem(ENTITY_URN, 'CYTP1002'),
            },
          ],
          { entityCount: 1, edgeCount: 0, pathCount: 0 }
        ),
      });

      expect(pack.entities).toHaveLength(1);
      expect(pack.entities?.[0]).toEqual({
        urn: ENTITY_URN,
        canonicalName: 'CYTP1002',
        kind: 'ScheduledProcess',
        snapshotId: SNAP,
        setId: SET_1,
      });
    });

    it('dedupes identical entities within one set but keeps cross-set duplicates', () => {
      const pack = packEvidence({
        authority: 'server',
        serverResponse: makeEntityResponse([
          {
            setId: SET_1,
            snapshotId: SNAP,
            roleGroup: 'baseline',
            item: makeEntityItem(ENTITY_URN, 'CYTP1002'),
          },
          {
            setId: SET_1,
            snapshotId: SNAP,
            roleGroup: 'baseline',
            item: makeEntityItem(ENTITY_URN, 'CYTP1002', 'ScheduledProcess', 7),
          },
          {
            setId: SET_2,
            snapshotId: SNAP,
            roleGroup: 'scope_diff',
            item: makeEntityItem(ENTITY_URN, 'CYTP1002'),
          },
        ]),
      });

      expect(pack.entities).toHaveLength(2);
      expect(pack.entities?.map((e) => e.setId)).toEqual([SET_1, SET_2]);
    });

    it('copies graph counts from modalityStatus.graph', () => {
      const pack = packEvidence({
        authority: 'server',
        serverResponse: makeEntityResponse(
          [
            {
              setId: SET_1,
              snapshotId: SNAP,
              roleGroup: 'baseline',
              item: makeEntityItem(ENTITY_URN, 'CYTP1002'),
            },
          ],
          { entityCount: 3, edgeCount: 2, pathCount: 1 }
        ),
      });

      expect(pack.graphCounts).toEqual({ entity: 3, edge: 2, path: 1 });
    });

    it('defaults absent graph counts to zero instead of guessing from items', () => {
      const pack = packEvidence({
        authority: 'server',
        serverResponse: makeEntityResponse([
          {
            setId: SET_1,
            snapshotId: SNAP,
            roleGroup: 'baseline',
            item: makeEntityItem(ENTITY_URN, 'CYTP1002'),
          },
        ]),
      });

      expect(pack.graphCounts).toEqual({ entity: 0, edge: 0, path: 0 });
    });

    it('never converts entity items into citations', () => {
      const pack = packEvidence({
        authority: 'server',
        serverResponse: makeEntityResponse([
          {
            setId: SET_1,
            snapshotId: SNAP,
            roleGroup: 'baseline',
            item: makeEntityItem(ENTITY_URN, 'CYTP1002'),
          },
        ]),
      });

      expect(Object.keys(pack.citations)).toHaveLength(0);
      expect(pack.promptEvidence).toHaveLength(0);
    });

    it('keeps chunk citation packing unchanged when entities are present', () => {
      const chunk = makeMockChunk('c1', DOC_1, 'Doc 1', 1, 10, 'chunk snippet', HASH_A);
      const pack = packEvidence({
        authority: 'server',
        serverResponse: makeEntityResponse([
          {
            setId: SET_1,
            snapshotId: SNAP,
            roleGroup: 'baseline',
            item: chunk,
          },
          {
            setId: SET_1,
            snapshotId: SNAP,
            roleGroup: 'baseline',
            item: makeEntityItem(ENTITY_URN_2, 'CYTP2002'),
          },
        ]),
      });

      expect(Object.keys(pack.citations)).toEqual(['S1']);
      expect(pack.citations['S1']?.citedExcerpt).toBe('chunk snippet');
      expect(pack.entities).toHaveLength(1);
    });

    it('still drops a path whose hop has no surviving citation', () => {
      const chunk = makeMockChunk('c1', DOC_1, 'Doc 1', 1, 10, 'snippet', HASH_A);
      const pack = packEvidence({
        authority: 'server',
        serverResponse: {
          ...makeEntityResponse([
            {
              setId: SET_1,
              snapshotId: SNAP,
              roleGroup: 'baseline',
              item: chunk,
            },
            {
              setId: SET_1,
              snapshotId: SNAP,
              roleGroup: 'baseline',
              item: makeEntityItem(ENTITY_URN, 'CYTP1002'),
            },
          ]),
          outcome: 'READY',
          paths: [
            {
              setId: SET_1,
              snapshotId: SNAP,
              roleGroup: 'baseline',
              path: {
                pathId: 'P1',
                snapshotId: SNAP,
                nodeUrns: [ENTITY_URN, ENTITY_URN_2],
                edgeFactKeys: ['1'.repeat(64)],
                hopClassifications: ['OBSERVED'],
                hopCitationIds: [['missingChunk']],
                hasConflict: false,
                classification: 'OBSERVED',
              },
            },
          ],
        },
      });

      expect(pack.paths).toEqual({});
      expect(pack.entities).toHaveLength(1);
    });
  });

  it('24. truncates MCP rawResult at 2500 characters to match persistence limits', () => {
    const longRawResult = 'A'.repeat(3000);
    const pack = packEvidence({
      authority: 'server',
      mcpItems: [
        {
          serverId: 'graphiti-banking',
          serverName: 'Graphiti Banking MCP',
          toolName: 'search_nodes',
          args: { query: 'LONG_EXCERPT' },
          rawResult: longRawResult,
          timestamp: '2026-10-20T00:00:00.000Z',
        },
      ],
    });

    expect(pack.citations['M1']?.citedExcerpt.length).toBe(2500);
    expect(pack.citations['M1']?.citedExcerpt).toBe('A'.repeat(2500));
  });
});

