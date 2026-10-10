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
