import { describe, expect, it, vi } from 'vitest';
import { main, parseCliArgs, runAcceptanceCli } from '../src/acceptance/cli.js';

const baseResponse = {
  outcome: 'READY',
  snapshotId: 'snap-1',
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
      snapshotId: 'snap-1',
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
    expect(parseCliArgs(['--endpoint', 'http://localhost:3001/', '--set-id', 'set-1', '--strict', '--timeout', '5000'])).toEqual({
      endpoint: 'http://localhost:3001',
      setId: 'set-1',
      strict: true,
      timeoutMs: 5000,
    });
  });

  it('returns config error code 2 on bad arguments', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(main(['--endpoint', 'http://localhost:3001'])).resolves.toBe(2);
    err.mockRestore();
  });

  it('runs smoke cases and returns assertion failures as failed results', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => baseResponse }));
    const result = await runAcceptanceCli({ endpoint: 'http://localhost:3001', setId: 'set-1', strict: true, timeoutMs: 1000 });

    expect(result.passed).toBe(false);
    expect(result.results).toHaveLength(16);
    expect(result.results.some((r) => r.passed === false)).toBe(true);
    expect(JSON.stringify(result)).not.toContain('safe schema-required snippet');
  });

  it('returns 1 when metadata-only audit detects forbidden output', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ ...baseResponse, snapshotId: 'MAIN1.FCL_CYCLE_COUNTER' }) }));
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await expect(main(['--endpoint', 'http://localhost:3001', '--set-id', 'set-1'])).resolves.toBe(1);

    err.mockRestore();
    log.mockRestore();
  });
});
