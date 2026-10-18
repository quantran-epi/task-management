import { describe, it, expect, vi } from 'vitest';
import {
  collectUncoveredProse,
  extractProseCandidatesOnce,
  ProseSegment,
} from '../src/ai/proseExtraction.js';
import { chunkMarkdownSnapshot } from '../src/parser/sectionChunker.js';
import type { ProjectionSnapshot } from '../indexing/incrementalProjector.js';
import { ResolvedNode, SourceRange } from '../src/types/graphProtocol.js';
import {
  URN_PROCESS_60000006,
  URN_CONTAINER_60000006,
  URN_SUBPROCESS_10000304,
  PILOT_GOLD_NODES,
} from './fixtures/pilotGoldEntities.js';
import {
  GraphBuildService,
  type ProseExtractionConfig,
} from '../src/services/graphBuildService.js';
import { InMemoryGraphRepository } from '../src/graph/graphRepository.js';
import { SnapshotStore } from '../src/indexing/snapshotStore.js';

function createMockSnapshot(docId: string, markdown: string): ProjectionSnapshot {
  const chunks = chunkMarkdownSnapshot(docId, markdown).map((c) => ({
    occurrenceId: c.occurrenceId,
    representationId: c.contentHash,
    contentHash: c.contentHash,
    chunkIndex: c.chunkIndex,
    headingPath: c.headingPath,
    startLine: c.startLine,
    endLine: c.endLine,
    startOffset: c.startOffset,
    endOffset: c.endOffset,
    rawContent: c.rawContent,
  }));

  return {
    snapshotId: 'test-snapshot',
    setId: 'test-set',
    chunkingPolicyVersion: '2026.10.1',
    documents: [
      {
        documentId: docId,
        title: 'test-doc.md',
        contentHash: 'content-hash-test',
        chunks,
      },
    ],
  };
}

describe('Bounded Prose Fallback & Range Filtering (GRAPH-03, D-13, D-16)', () => {
  const docId = '11111111-1111-4111-8111-111111111111';
  const markdownText = `# Section Title

Here is a prose paragraph describing the process flow.

| Table Header | Value |
| --- | --- |
| Row 1 | 100 |

Here is another prose paragraph explaining that step 20 executes after step 10.
`;

  it('collectUncoveredProse excludes consumed table and code ranges', () => {
    const snapshot = createMockSnapshot(docId, markdownText);

    // Simulate consumed range covering the table (characters 80 to 150 approx)
    const tableIndex = markdownText.indexOf('| Table Header');
    const tableEnd = markdownText.indexOf('Here is another prose');
    const consumedMap = new Map<string, SourceRange[]>([
      [docId, [{ startOffset: tableIndex, endOffset: tableEnd }]],
    ]);

    const segments = collectUncoveredProse(snapshot, consumedMap);

    expect(segments.length).toBe(2);
    expect(segments[0]!.text).toContain('Here is a prose paragraph describing the process flow.');
    expect(segments[1]!.text).toContain('Here is another prose paragraph explaining that step 20 executes after step 10.');
    // Ensure table content is excluded from all segments
    for (const seg of segments) {
      expect(seg.text).not.toContain('| Table Header |');
    }
  });

  it('extracts candidate with INFERRED classification and LLM_PROSE method when endpoints and quotes match', async () => {
    const segmentText = 'Step 60000006 invokes sub-process 10000304 directly during execution.';
    const mockSegment: ProseSegment = {
      segmentId: 'seg-1',
      documentId: docId,
      documentTitle: 'test-doc.md',
      sectionHeadingPath: ['Section Title'],
      startOffset: 10,
      endOffset: 10 + segmentText.length,
      startLine: 3,
      endLine: 3,
      text: segmentText,
    };

    // Substring quote: "Step 60000006 invokes sub-process 10000304"
    const quote = 'Step 60000006 invokes sub-process 10000304';
    const quoteStart = segmentText.indexOf(quote);
    const quoteEnd = quoteStart + quote.length;

    const mockResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              candidates: [
                {
                  subjectUrn: URN_CONTAINER_60000006,
                  relation: 'INVOKES',
                  objectUrn: URN_SUBPROCESS_10000304,
                  qualifiers: {},
                  evidence: {
                    segmentId: 'seg-1',
                    startOffset: quoteStart,
                    endOffset: quoteEnd,
                    quote,
                  },
                  confidence: 0.85,
                },
              ],
            }),
          },
        },
      ],
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(mockResponse),
    });

    const result = await extractProseCandidatesOnce({
      endpoint: 'http://localhost:20128',
      model: 'test-model',
      segments: [mockSegment],
      resolvedEndpoints: PILOT_GOLD_NODES as ResolvedNode[],
      fetchFn: mockFetch as any,
    });

    expect(result.facts.length).toBe(1);
    expect(result.facts[0]!.classification).toBe('INFERRED');
    expect(result.facts[0]!.subjectUrn).toBe(URN_CONTAINER_60000006);
    expect(result.facts[0]!.relation).toBe('INVOKES');
    expect(result.facts[0]!.objectUrn).toBe(URN_SUBPROCESS_10000304);

    expect(result.evidence.length).toBe(1);
    expect(result.evidence[0]!.classification).toBe('INFERRED');
    expect(result.evidence[0]!.extractionMethod).toBe('LLM_PROSE');
    expect(result.evidence[0]!.rawSnippet).toBe(quote);
    expect(result.quarantines.length).toBe(0);
  });

  it('quarantines candidate referencing nonexistent endpoint URN (D-13, D-16)', async () => {
    const segmentText = 'Unknown step invokes process 10000304.';
    const mockSegment: ProseSegment = {
      segmentId: 'seg-2',
      documentId: docId,
      documentTitle: 'test-doc.md',
      sectionHeadingPath: ['Section Title'],
      startOffset: 0,
      endOffset: segmentText.length,
      startLine: 1,
      endLine: 1,
      text: segmentText,
    };

    const quote = 'Unknown step invokes process 10000304.';
    const mockResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              candidates: [
                {
                  subjectUrn: 'urn:plannermate:smartvista:PRC_CONTAINER:99999999', // Unknown endpoint
                  relation: 'INVOKES',
                  objectUrn: URN_SUBPROCESS_10000304,
                  qualifiers: {},
                  evidence: {
                    segmentId: 'seg-2',
                    startOffset: 0,
                    endOffset: quote.length,
                    quote,
                  },
                  confidence: 0.8,
                },
              ],
            }),
          },
        },
      ],
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(mockResponse),
    });

    const result = await extractProseCandidatesOnce({
      endpoint: 'http://localhost:20128',
      model: 'test-model',
      segments: [mockSegment],
      resolvedEndpoints: PILOT_GOLD_NODES as ResolvedNode[],
      fetchFn: mockFetch as any,
    });

    expect(result.facts.length).toBe(0);
    expect(result.evidence.length).toBe(0);
    expect(result.quarantines.length).toBe(1);
    expect(result.quarantines[0]!.reason).toContain('not in resolved endpoints');
  });

  it('enforces zero retries on malformed JSON and quarantines eligible segments (D-13)', async () => {
    const mockSegment: ProseSegment = {
      segmentId: 'seg-3',
      documentId: docId,
      documentTitle: 'test-doc.md',
      sectionHeadingPath: [],
      startOffset: 0,
      endOffset: 20,
      startLine: 1,
      endLine: 1,
      text: 'Sample prose segment text',
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => 'Internal Server Error / Broken JSON output',
    });

    const result = await extractProseCandidatesOnce({
      endpoint: 'http://localhost:20128',
      model: 'test-model',
      segments: [mockSegment],
      resolvedEndpoints: PILOT_GOLD_NODES as ResolvedNode[],
      fetchFn: mockFetch as any,
    });

    // Zero retries: fetch was called exactly once
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.facts.length).toBe(0);
    expect(result.quarantines.length).toBe(1);
    expect(result.quarantines[0]!.reason).toBe('Malformed JSON from LLM response');
  });

  it('quarantines segments when total characters exceed 12,000 ceiling', async () => {
    const largeText = 'A'.repeat(13_000);
    const mockSegment: ProseSegment = {
      segmentId: 'seg-large',
      documentId: docId,
      documentTitle: 'test-doc.md',
      sectionHeadingPath: [],
      startOffset: 0,
      endOffset: largeText.length,
      startLine: 1,
      endLine: 1,
      text: largeText,
    };

    const mockFetch = vi.fn();

    const result = await extractProseCandidatesOnce({
      endpoint: 'http://localhost:20128',
      model: 'test-model',
      segments: [mockSegment],
      resolvedEndpoints: PILOT_GOLD_NODES as ResolvedNode[],
      fetchFn: mockFetch as any,
    });

    // LLM must NOT be called when all segments exceed input ceiling
    expect(mockFetch).toHaveBeenCalledTimes(0);
    expect(result.quarantines.length).toBe(1);
    expect(result.quarantines[0]!.reason).toContain('Prose input ceiling exceeded');
  });
});

describe('Hybrid Prose Extraction Fallback & Graph Build Pipeline (21-04)', () => {
  const SET_ID = '00000000-0000-4000-8000-000000000001';
  const SOURCE_SNAPSHOT_ID = '11111111-1111-4000-8000-111111111111';
  const DOC_ID = '22222222-2222-4000-8000-222222222222';

  const SAMPLE_MARKDOWN = `# Quy trình xử lý giao dịch

Mô tả tổng quan về quy trình xử lý giao dịch hệ thống SmartVista.

## Bảng các bước xử lý

| THU_TU | TEN_BUOC | TARGET | WRITES | GHI_CHU |
|---|---|---|---|---|
| 10 | Xác thực thẻ | CardValidator | MAIN1.TB_CARD | Kiểm tra thông tin thẻ |
| 20 | Kiểm tra số dư | BalanceChecker | MAIN1.TB_ACCOUNT | Kiểm tra hạn mức khả dụng |
| 30 | Ghi nhận giao dịch | TxnRecorder | MAIN1.TB_TXN | Lưu vết lịch sử giao dịch |

## Mô tả chi tiết tiến trình

Sau khi bước 10 hoàn thành, CardValidator gửi tín hiệu xác thực đến BalanceChecker để kiểm tra số dư tài khoản.
`;

  function setupBuildFixture(
    fetchFn?: any,
    proseConfig?: Partial<ProseExtractionConfig>
  ) {
    const repo = new InMemoryGraphRepository();
    const store = new SnapshotStore();

    const chunks = chunkMarkdownSnapshot(DOC_ID, SAMPLE_MARKDOWN).map((c) => ({
      occurrenceId: c.occurrenceId,
      representationId: c.contentHash,
      contentHash: c.contentHash,
      chunkIndex: c.chunkIndex,
      headingPath: c.headingPath,
      startLine: c.startLine,
      endLine: c.endLine,
      startOffset: c.startOffset,
      endOffset: c.endOffset,
      rawContent: c.rawContent,
    }));

    store.createCandidate('c-1', 'att-1', SET_ID);
    store.completeCandidate('c-1', {
      snapshotId: SOURCE_SNAPSHOT_ID,
      setId: SET_ID,
      chunkingPolicyVersion: '2026.10.1',
      documents: [
        {
          documentId: DOC_ID,
          title: 'Quy_trinh.md',
          contentHash: 'hash-doc-1',
          chunks,
        },
      ],
    });
    store.promoteCandidate('c-1');

    const service = new GraphBuildService({
      repository: repo,
      snapshotStore: store,
      proseExtraction:
        proseConfig !== undefined || fetchFn !== undefined
          ? {
              endpoint: proseConfig?.endpoint ?? 'http://localhost:20128',
              model: proseConfig?.model ?? 'test-model',
              fetchFn,
              ...proseConfig,
            }
          : undefined,
      productionMode: false,
    });

    return { repo, store, service };
  }

  it('preserves deterministic nodes and facts when LLM prose extraction returns HTTP 504 Gateway Timeout', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 504,
      statusText: 'Gateway Timeout',
      text: async () => 'Gateway Timeout',
    });

    const { repo, service } = setupBuildFixture(mockFetch);
    const candidateId = await service.prepareCandidate(SET_ID);

    expect(candidateId).toBeDefined();

    // Verify candidate status transitioned to READY
    const status = await service.getStatus(SET_ID);
    expect(status.candidateStatus).toBe('READY');
    expect(status.candidateSnapshotId).toBe(candidateId);

    // Verify candidate contains all deterministic nodes
    const candidate = (repo as any).candidates.get(candidateId);
    expect(candidate).toBeDefined();

    const nodeKinds = candidate.nodes.map((n: any) => n.kind);
    expect(nodeKinds).toContain('ProcessStep');
    expect(nodeKinds).toContain('DatabaseObject');
    expect(nodeKinds).toContain('SoftwareComponent');

    // Verify deterministic relations are preserved
    const relationTypes = candidate.relations.map((r: any) => r.relation);
    expect(relationTypes).toContain('PRECEDES');
    expect(relationTypes.some((r: string) => r === 'CALLS' || r === 'INVOKES')).toBe(true);
    expect(relationTypes).toContain('WRITES_TO');

    // Verify quarantines recorded the failure reason
    const quarantines = await repo.getQuarantines(candidateId);
    expect(quarantines.length).toBeGreaterThan(0);
    expect(quarantines.some((q) => q.reason.includes('HTTP_504'))).toBe(true);
  });

  it('preserves deterministic nodes and facts when LLM prose extraction encounters network error / timeout', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('fetch failed: Connection refused'));

    const { repo, service } = setupBuildFixture(mockFetch);
    const candidateId = await service.prepareCandidate(SET_ID);

    expect(candidateId).toBeDefined();

    const status = await service.getStatus(SET_ID);
    expect(status.candidateStatus).toBe('READY');

    const candidate = (repo as any).candidates.get(candidateId);
    expect(candidate).toBeDefined();

    // Deterministic nodes and relations intact
    const nodeKinds = candidate.nodes.map((n: any) => n.kind);
    expect(nodeKinds).toContain('ProcessStep');
    expect(nodeKinds).toContain('DatabaseObject');
    expect(nodeKinds).toContain('SoftwareComponent');

    const relationTypes = candidate.relations.map((r: any) => r.relation);
    expect(relationTypes).toContain('PRECEDES');
    expect(relationTypes.some((r: string) => r === 'CALLS' || r === 'INVOKES')).toBe(true);
    expect(relationTypes).toContain('WRITES_TO');
  });

  it('quarantines invalid candidates when LLM returns malformed JSON without failing snapshot build', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '502 Bad Gateway - Not Valid JSON at all',
    });

    const { repo, service } = setupBuildFixture(mockFetch);
    const candidateId = await service.prepareCandidate(SET_ID);

    const status = await service.getStatus(SET_ID);
    expect(status.candidateStatus).toBe('READY');

    const candidate = (repo as any).candidates.get(candidateId);
    expect(candidate).toBeDefined();

    // Deterministic facts preserved
    const facts = await repo.getFacts(candidateId);
    expect(facts.length).toBeGreaterThan(0);

    // Malformed JSON quarantined
    const quarantines = await repo.getQuarantines(candidateId);
    expect(quarantines.some((q) => q.reason.includes('Malformed JSON'))).toBe(true);
  });

  it('quarantines candidates with unresolvable endpoint URNs without corrupting active snapshot', async () => {
    const quote = 'Sau khi bước 10 hoàn thành, CardValidator gửi tín hiệu xác thực đến BalanceChecker';
    const mockFetch = vi.fn().mockImplementation(async (_url, opts) => {
      const body = JSON.parse(opts.body);
      const userPayload = JSON.parse(body.messages[1].content);
      const targetSeg =
        userPayload.segments.find((s: any) => s.text.includes(quote)) || userPayload.segments[0];
      const quoteStart = targetSeg ? targetSeg.text.indexOf(quote) : -1;
      const actualQuote = quoteStart !== -1 ? quote : targetSeg.text.slice(0, 20);
      const actualStart = quoteStart !== -1 ? quoteStart : 0;

      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    candidates: [
                      {
                        subjectUrn: 'urn:plannermate:smartvista:SW_COMPONENT:NonExistentTarget',
                        relation: 'CALLS',
                        objectUrn: 'urn:plannermate:smartvista:SW_COMPONENT:UnknownComponent',
                        qualifiers: {},
                        evidence: {
                          segmentId: targetSeg.segmentId,
                          startOffset: actualStart,
                          endOffset: actualStart + actualQuote.length,
                          quote: actualQuote,
                        },
                        confidence: 0.9,
                      },
                    ],
                  }),
                },
              },
            ],
          }),
      };
    });

    const { repo, service } = setupBuildFixture(mockFetch);
    const candidateId = await service.prepareCandidate(SET_ID);

    const status = await service.getStatus(SET_ID);
    expect(status.candidateStatus).toBe('READY');

    const quarantines = await repo.getQuarantines(candidateId);
    expect(quarantines.some((q) => q.reason.includes('not in resolved endpoints'))).toBe(true);

    // Candidate nodes still only contain verified deterministic nodes
    const candidate = (repo as any).candidates.get(candidateId);
    const nodeUrns = candidate.nodes.map((n: any) => n.urn);
    expect(nodeUrns).not.toContain('urn:plannermate:smartvista:SW_COMPONENT:NonExistentTarget');
  });

  it('completes snapshot build with deterministic extractions when prose extraction endpoint is unconfigured', async () => {
    // Unconfigured: no proseExtraction config passed
    const { repo, service } = setupBuildFixture(undefined, undefined);
    // Explicitly set proseExtraction to undefined to simulate unconfigured LLM
    (service as any).proseExtraction = undefined;

    const candidateId = await service.prepareCandidate(SET_ID);
    const status = await service.getStatus(SET_ID);
    expect(status.candidateStatus).toBe('READY');

    const candidate = (repo as any).candidates.get(candidateId);
    expect(candidate.nodes.length).toBeGreaterThan(0);
    expect(candidate.relations.length).toBeGreaterThan(0);
  });

  it('merges inferred prose relations with INFERRED classification alongside deterministic facts when LLM succeeds', async () => {
    const { repo, service } = setupBuildFixture();

    const quote = 'CardValidator gửi tín hiệu xác thực đến BalanceChecker';
    const mockFetch = vi.fn().mockImplementation(async (_url, opts) => {
      const body = JSON.parse(opts.body);
      const userPayload = JSON.parse(body.messages[1].content);
      const endpoints = userPayload.allowedEndpoints;
      const targetSeg = userPayload.segments.find((s: any) => s.text.includes(quote));

      if (!targetSeg) {
        return {
          ok: true,
          text: async () => JSON.stringify({ choices: [{ message: { content: '{"candidates":[]}' } }] }),
        };
      }

      const cardValidator = endpoints.find((e: any) => e.name.toLowerCase().includes('cardvalidator'));
      const balanceChecker = endpoints.find((e: any) => e.name.toLowerCase().includes('balancechecker'));

      if (!cardValidator || !balanceChecker) {
        return {
          ok: true,
          text: async () => JSON.stringify({ choices: [{ message: { content: '{"candidates":[]}' } }] }),
        };
      }

      const quoteStart = targetSeg.text.indexOf(quote);
      const quoteEnd = quoteStart + quote.length;

      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    candidates: [
                      {
                        subjectUrn: cardValidator.urn,
                        relation: 'CALLS',
                        objectUrn: balanceChecker.urn,
                        qualifiers: {},
                        evidence: {
                          segmentId: targetSeg.segmentId,
                          startOffset: quoteStart,
                          endOffset: quoteEnd,
                          quote,
                        },
                        confidence: 0.92,
                      },
                    ],
                  }),
                },
              },
            ],
          }),
      };
    });

    (service as any).proseExtraction = {
      endpoint: 'http://localhost:20128',
      model: 'test-model',
      fetchFn: mockFetch,
    };

    const builtCandidateId = await service.prepareCandidate(SET_ID);
    const candidate = (repo as any).candidates.get(builtCandidateId);

    expect(candidate).toBeDefined();

    // Check relations: contains deterministic relations AND inferred relation
    const inferredRelation = candidate.relations.find(
      (r: any) => r.effectiveClassification === 'INFERRED'
    );
    expect(inferredRelation).toBeDefined();
    expect(inferredRelation.relation).toBe('CALLS');

    // Deterministic relations also present with OBSERVED classification
    const deterministicRelations = candidate.relations.filter(
      (r: any) => r.effectiveClassification === 'OBSERVED'
    );
    expect(deterministicRelations.length).toBeGreaterThan(0);
  });
});
