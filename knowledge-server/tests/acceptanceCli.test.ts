import { describe, expect, it, vi } from 'vitest';
import { main, parseCliArgs, runAcceptanceCli } from '../src/acceptance/cli.js';

const baseResponse = {
  outcome: 'READY',
  snapshotId: 'gsnap_00000001',
  embeddingProvider: {
    provider: 'local-onnx',
    model: 'Xenova/multilingual-e5-small',
    revision: 'local',
    dimensions: 384,
    policyVersion: '2026.10.1',
  },
  items: [
    {
      type: 'chunk',
      id: 'chunk-1',
      score: 1,
      modalitiesContributed: ['fulltext'],
      sourceDocumentId: '11111111-1111-4111-8111-111111111111',
      sectionAnchor: 'safe-section',
      lineStart: 1,
      lineEnd: 2,
      rawSnippet: 'safe schema-required snippet',
      snapshotId: 'gsnap_00000001',
      hasConflict: false,
    },
  ],
  totalCandidates: 1,
  modalitiesUsed: ['fulltext'],
  modalityStatus: {
    fulltext: { status: 'ok', latencyMs: 1, itemCount: 1 },
    vector: { status: 'unavailable', latencyMs: 0, itemCount: 0, reason: 'UNCONFIGURED' },
    graph: { status: 'unavailable', latencyMs: 0, itemCount: 0, reason: 'NO_GRAPH_SEED' },
  },
  diagnostics: { degraded: false },
  planTrace: { fastPath: false, degradedFallback: false, intent: 'LOOKUP' },
};

describe('acceptance CLI', () => {
  it('parses required arguments', () => {
    expect(parseCliArgs([
      '--endpoint', 'http://localhost:3001/',
      '--set-id', 'set-1',
      '--token', 'test-token',
      '--origin', 'http://localhost:5173',
      '--strict',
      '--timeout', '5000',
    ])).toEqual({
      endpoint: 'http://localhost:3001',
      setId: 'set-1',
      token: 'test-token',
      origin: 'http://localhost:5173',
      strict: true,
      timeoutMs: 5000,
    });
  });

  it('returns config error code 2 on bad arguments', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(main(['--endpoint', 'http://localhost:3001'])).resolves.toBe(2);
    err.mockRestore();
  });

  it('sends bearer authorization and exact Origin without leaking the token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => baseResponse });
    vi.stubGlobal('fetch', fetchMock);
    const result = await runAcceptanceCli({
      endpoint: 'http://localhost:3001',
      setId: 'set-1',
      token: 'test-secret-token',
      origin: 'http://localhost:5173',
      strict: true,
      timeoutMs: 1000,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/sets/set-1/retrieve',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-secret-token',
          Origin: 'http://localhost:5173',
        }),
      })
    );
    const firstRequest = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(firstRequest.body))).toMatchObject({
      query: 'MAIN1.FCL_CYCLE_COUNTER',
    });
    expect(result.passed).toBe(false);
    expect(result.results).toHaveLength(16);
    expect(result.results.some((r) => r.passed === false)).toBe(true);
    expect(JSON.stringify(result)).not.toContain('safe schema-required snippet');
    expect(JSON.stringify(result)).not.toContain('test-secret-token');
  });

  it('retains safe diagnostics for a degraded T1 failure without leaking snippets', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({
        ...baseResponse,
        outcome: 'DEGRADED',
        planTrace: { fastPath: true, degradedFallback: false, intent: 'LOOKUP' },
        diagnostics: { degraded: true, degradedReasons: ['vector: MODEL_INDEX_MISMATCH'] },
        items: [{
          ...baseResponse.items[0],
          sourceDocumentTitle: '02-data-objects.md',
          publishedContentHash: 'a'.repeat(64),
        }],
      }),
    }));

    const result = await runAcceptanceCli({
      endpoint: 'http://localhost:3001',
      setId: 'set-1',
      token: 'test-token',
      origin: 'http://localhost:5173',
      caseIds: ['T1'],
      strict: true,
      timeoutMs: 1000,
    });

    expect(result.results[0]).toMatchObject({
      id: 'T1',
      passed: false,
      outcome: 'DEGRADED',
      intent: 'LOOKUP',
      fastPath: true,
      itemCount: 1,
      snapshotId: 'gsnap_00000001',
      degradedReasons: ['vector: MODEL_INDEX_MISMATCH'],
      sourceTitles: ['02-data-objects.md'],
      modalityStatus: baseResponse.modalityStatus,
      error: 'Expected outcome READY, got DEGRADED',
    });
    expect(JSON.stringify(result)).not.toContain('safe schema-required snippet');
  });

  it('rejects T1 semantic mismatch even without --strict', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({
        ...baseResponse,
        outcome: 'UNSUPPORTED',
        items: [],
        planTrace: { fastPath: false, degradedFallback: false },
        reason: 'unsupported',
        unsupportedConstructs: ['planner'],
      }),
    }));

    const result = await runAcceptanceCli({
      endpoint: 'http://localhost:3001',
      setId: 'set-1',
      token: 'test-token',
      origin: 'http://localhost:5173',
      caseIds: ['T1'],
      strict: false,
      timeoutMs: 1000,
    });

    expect(result.passed).toBe(false);
    expect(result.results[0]).toMatchObject({
      id: 'T1',
      passed: false,
      error: 'Expected outcome READY, got UNSUPPORTED',
    });
  });

  it('rejects T1 when server plan intent is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({
        ...baseResponse,
        planTrace: { fastPath: true, degradedFallback: false },
        items: [{
          ...baseResponse.items[0],
          sourceDocumentTitle: '02-data-objects.md',
          publishedContentHash: 'a'.repeat(64),
        }],
      }),
    }));

    const result = await runAcceptanceCli({
      endpoint: 'http://localhost:3001',
      setId: 'set-1',
      token: 'test-token',
      origin: 'http://localhost:5173',
      caseIds: ['T1'],
      strict: false,
      timeoutMs: 1000,
    });

    expect(result.passed).toBe(false);
    expect(result.results[0]?.error).toBe('Expected intent LOOKUP, got missing');
  });

  it('accepts the live document title for 02-data-objects.md', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({
        ...baseResponse,
        planTrace: { fastPath: true, degradedFallback: false, intent: 'LOOKUP' },
        modalityStatus: {
          fulltext: { status: 'ok', latencyMs: 1, itemCount: 1 },
          vector: { status: 'ok', latencyMs: 1, itemCount: 1 },
          graph: { status: 'ok', latencyMs: 1, itemCount: 0 },
        },
        items: [{
          ...baseResponse.items[0],
          sourceDocumentTitle: '02 — Data objects',
          publishedContentHash: 'a'.repeat(64),
        }],
      }),
    }));

    const result = await runAcceptanceCli({
      endpoint: 'http://localhost:3001',
      setId: 'set-1',
      token: 'test-token',
      origin: 'http://localhost:5173',
      caseIds: ['T1'],
      strict: true,
      timeoutMs: 1000,
    });

    expect(result.passed).toBe(true);
    expect(result.results[0]?.sourceTitles).toEqual(['02 — Data objects']);
  });

  it('rejects T1 without a citation from the data objects document', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({
        ...baseResponse,
        planTrace: { fastPath: true, degradedFallback: false, intent: 'LOOKUP' },
        items: [{
          ...baseResponse.items[0],
          sourceDocumentTitle: 'wrong-source.md',
          publishedContentHash: 'a'.repeat(64),
        }],
      }),
    }));

    const result = await runAcceptanceCli({
      endpoint: 'http://localhost:3001',
      setId: 'set-1',
      token: 'test-token',
      origin: 'http://localhost:5173',
      caseIds: ['T1'],
      strict: true,
      timeoutMs: 1000,
    });

    expect(result.passed).toBe(false);
    expect(result.results[0]?.error).toBe(
      'Expected citation from 02-data-objects.md or 02 — Data objects'
    );
  });

  it('returns 1 when metadata-only audit detects forbidden output', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ ...baseResponse, snapshotId: 'MAIN1.FCL_CYCLE_COUNTER' }) }));
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await expect(main([
      '--endpoint', 'http://localhost:3001',
      '--set-id', 'set-1',
      '--token', 'test-token',
      '--origin', 'http://localhost:5173',
    ])).resolves.toBe(1);

    err.mockRestore();
    log.mockRestore();
  });
});
