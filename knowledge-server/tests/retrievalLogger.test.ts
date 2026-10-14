import { describe, expect, it, vi } from 'vitest';
import { createRetrievalLogger, redactSensitiveData } from '../src/retrieval/retrievalLogger.js';

describe('retrievalLogger', () => {
  it('emits metadata-only JSON with propagated correlation ID', () => {
    const sink = vi.fn();
    const logger = createRetrievalLogger('[RETRIEVE]', {
      correlationId: '22222222-2222-4222-8222-222222222222',
      sink,
      now: () => new Date('2026-10-14T01:00:00.000Z'),
    });

    const entry = logger.log({
      outcome: 'ok',
      latencyMs: 23,
      safeIds: ['set-a', 'snapshot-b'],
      counts: { chunks: 3, edges: 1, ignored: 'x' },
      metadata: { outcome: 'READY', fastPath: true },
    });

    expect(entry.correlationId).toBe('22222222-2222-4222-8222-222222222222');
    expect(entry.phase).toBe('[RETRIEVE]');
    expect(entry.counts).toEqual({ chunks: 3, edges: 1 });
    expect(JSON.parse(JSON.stringify(entry))).toEqual(entry);
    expect(sink).toHaveBeenCalledWith(entry);
  });

  it('redacts token, password, email, PAN, query, excerpts, and DLP fields', () => {
    const redacted = redactSensitiveData({
      authorization: 'Bearer server-token-secret',
      password: 'secret-password',
      apiKey: 'sk-server-123456789abcdef',
      email: 'operator@example.com',
      card: '5555-5555-5555-4444',
      query: 'MAIN1.FCL_CYCLE_COUNTER raw prompt',
      rawSnippet: 'full source excerpt',
      dlpFindings: ['PAN 5555555555554444'],
      nested: { message: 'token=abc123456789 password:abc123' },
    });
    const json = JSON.stringify(redacted);

    expect(json).not.toContain('server-token-secret');
    expect(json).not.toContain('secret-password');
    expect(json).not.toContain('sk-server-123456789abcdef');
    expect(json).not.toContain('operator@example.com');
    expect(json).not.toContain('5555-5555-5555-4444');
    expect(json).not.toContain('MAIN1.FCL_CYCLE_COUNTER raw prompt');
    expect(json).not.toContain('full source excerpt');
    expect(json).toContain('[REDACTED]');
  });
});
