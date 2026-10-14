import { describe, expect, it, vi } from 'vitest';
import { createPhaseLogger, redactSensitiveData } from '../../src/services/ai/phaseLogger';

describe('phaseLogger', () => {
  it('emits parseable structured metadata with correlationId and phase', () => {
    const sink = vi.fn();
    const logger = createPhaseLogger('[ROUTE]', {
      correlationId: '11111111-1111-4111-8111-111111111111',
      sink,
      now: () => new Date('2026-10-14T00:00:00.000Z'),
    });

    const entry = logger.log({
      outcome: 'ok',
      latencyMs: 12.8,
      safeIds: ['task-1'],
      counts: { chunks: 2, ignored: 'x' },
      metadata: { intent: 'query_knowledge', queryLength: 20 },
    });

    expect(entry).toEqual({
      timestamp: '2026-10-14T00:00:00.000Z',
      correlationId: '11111111-1111-4111-8111-111111111111',
      phase: '[ROUTE]',
      outcome: 'ok',
      latencyMs: 12,
      safeIds: ['task-1'],
      counts: { chunks: 2 },
      metadata: { intent: 'query_knowledge', queryLength: 20 },
    });
    expect(() => JSON.parse(JSON.stringify(entry))).not.toThrow();
    expect(sink).toHaveBeenCalledWith(entry);
  });

  it('redacts keys, bearer tokens, API keys, emails, PANs, prompts, excerpts, and DLP findings', () => {
    const input = {
      apiKey: 'sk-live-123456789abcdef',
      authorization: 'Bearer very-secret-token',
      password: 'hunter2',
      user: 'user@example.com',
      card: '4111 1111 1111 1111',
      prompt: 'raw user prompt must not log',
      quote: 'full document excerpt must not log',
      dlpFindings: ['PAN 4111111111111111'],
      nested: { message: 'token=abc123456789 password:abc123' },
    };

    const redacted = redactSensitiveData(input);
    const json = JSON.stringify(redacted);

    expect(json).not.toContain('sk-live-123456789abcdef');
    expect(json).not.toContain('very-secret-token');
    expect(json).not.toContain('hunter2');
    expect(json).not.toContain('user@example.com');
    expect(json).not.toContain('4111 1111 1111 1111');
    expect(json).not.toContain('raw user prompt must not log');
    expect(json).not.toContain('full document excerpt must not log');
    expect(json).toContain('[REDACTED]');
  });
});
