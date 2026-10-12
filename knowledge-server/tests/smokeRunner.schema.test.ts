import { describe, it, expect } from 'vitest';
import { runSmokeCases, SMOKE_CASES, type SmokeRunConfig } from '../src/acceptance/smokeRunner.js';

describe('smokeRunner', () => {
  it('defines the five canonical smoke cases per D-18', () => {
    expect(SMOKE_CASES).toHaveLength(5);

    const [c1, c2, c3, c4, c5] = SMOKE_CASES;

    expect(c1?.caseId).toBe('SMOKE-01-IDENTIFIER');
    expect(c1?.query).toContain('MAIN1.FCL_CYCLE_COUNTER');
    expect(c1?.expectedFastPath).toBe(true);

    expect(c2?.caseId).toBe('SMOKE-02-NATURAL-LANGUAGE');
    expect(c2?.query).toContain('Chu kỳ Switch cycle nào xử lý tính lãi và phí quá hạn');
    expect(c2?.expectedIntent).toBe('LOOKUP');

    expect(c3?.caseId).toBe('SMOKE-03-FLOW-TRAVERSAL');
    expect(c3?.query).toContain('Quy trình thực thi của container 60000006');
    expect(c3?.expectedIntent).toBe('FLOW_TRAVERSAL');

    expect(c4?.caseId).toBe('SMOKE-04-THREE-HOP-IMPACT');
    expect(c4?.query).toContain('Nếu thay đổi cấu trúc bảng MAIN1.FCL_CYCLE_COUNTER');
    expect(c4?.expectedIntent).toBe('IMPACT_ANALYSIS');

    expect(c5?.caseId).toBe('SMOKE-05-UNREFERENCED-ABSTENTION');
    expect(c5?.query).toContain('SWIFT MT103');
    expect(c5?.expectedOutcome).toBe('NO_EVIDENCE');
  });

  it('runs mock client queries and maps to valid metadata-only SmokeEvidence without excerpts', async () => {
    const mockFetcher = async (_path: string, body: { query: string }) => {
      // Return mock server retrieval response conforming to RetrievalResponseSchema
      const isUnreferenced = body.query.includes('SWIFT');
      return {
        outcome: isUnreferenced ? 'NO_EVIDENCE' : 'READY',
        snapshotId: 'gsnap_1234567890abcdef',
        embeddingProvider: {
          provider: 'local-onnx',
          model: 'bge-small-en-v1.5',
          revision: 'main',
          dimensions: 384,
          policyVersion: '1.0',
        },
        items: isUnreferenced
          ? []
          : [
              {
                type: 'chunk',
                id: 'chunk_1',
                score: 0.95,
                modalitiesContributed: ['fulltext'],
                sourceDocumentId: '00000000-0000-0000-0000-000000000001',
                sourceDocumentTitle: '02-data-objects.md',
                sectionAnchor: 'main1-fcl-cycle-counter',
                lineStart: 10,
                lineEnd: 25,
                rawSnippet: 'CRITICAL SENSITIVE TEXT HERE SHOULD NOT BE IN EVIDENCE',
                publishedContentHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
                snapshotId: 'gsnap_1234567890abcdef',
                hasConflict: false,
              },
            ],
        paths: [],
        conflictGroups: [],
        totalCandidates: isUnreferenced ? 0 : 1,
        modalitiesUsed: ['fulltext'],
        modalityStatus: {
          fulltext: { status: 'ok', latencyMs: 15, itemCount: isUnreferenced ? 0 : 1 },
          vector: { status: 'ok', latencyMs: 30, itemCount: 0 },
          graph: { status: 'ok', latencyMs: 10, itemCount: 0 },
        },
        diagnostics: { degraded: false },
        planTrace: {
          fastPath: body.query.includes('MAIN1.FCL_CYCLE_COUNTER'),
          degradedFallback: false,
        },
        ...(isUnreferenced
          ? {
              reason: 'No evidence found in snapshot',
              suggestedRefinements: ['Check international swift scope'],
            }
          : {}),
      };
    };

    const config: SmokeRunConfig = {
      serverUrl: 'http://localhost:3001',
      token: 'test-token',
      fetcher: mockFetcher,
      environment: 'unit-test',
      snapshotStatus: {
        nodeCount: 50,
        factCount: 100,
        quarantineCount: 1,
        conflictCount: 0,
      },
    };

    const evidence = await runSmokeCases(config);
    expect(evidence.cases).toHaveLength(5);
    expect(evidence.environment).toBe('unit-test');
    expect(evidence.activeSnapshotId).toBe('gsnap_1234567890abcdef');
    expect(evidence.counts.nodeCount).toBe(50);

    // Verify metadata-only: zero raw text or snippet present in output
    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain('CRITICAL SENSITIVE TEXT');
    expect(serialized).not.toContain('rawSnippet');
  });
});
