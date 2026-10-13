import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  structuredLog,
  createPhaseLogger,
  createCorrelationId,
  LOG_TAGS,
} from '../../src/services/ai/log';

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as { __AI_LOG_LEVEL__?: string }).__AI_LOG_LEVEL__;
});

describe('ai/log structured logging substrate (Bug 5)', () => {
  it('exposes the five pipeline tags', () => {
    expect([...LOG_TAGS]).toEqual(['ROUTE', 'RETRIEVE', 'TOOL', 'SYNTHESIS', 'PUBLISH']);
  });

  it('emits a structured entry with tag, correlation ID and event, prefixed by [TAG]', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const cid = createCorrelationId();
    const entry = structuredLog('ROUTE', 'info', cid, 'intent_decided', { intent: 'query_taskmate' });

    expect(entry).not.toBeNull();
    expect(entry!.tag).toBe('ROUTE');
    expect(entry!.correlationId).toBe(cid);
    expect(entry!.event).toBe('intent_decided');
    expect(entry!.intent).toBe('query_taskmate');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0]![0])).toMatch(/^\[ROUTE\] /);
  });

  it('redacts secret-bearing fields', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const entry = structuredLog('RETRIEVE', 'info', 'cid-1', 'call', {
      apiKey: 'sk-should-not-appear',
      authorization: 'Bearer x',
      setId: 'safe-value',
    });
    expect(entry!.apiKey).toBe('[REDACTED]');
    expect(entry!.authorization).toBe('[REDACTED]');
    expect(entry!.setId).toBe('safe-value');
  });

  it('suppresses entries below the active level (default info drops debug)', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const entry = structuredLog('TOOL', 'debug', 'cid-2', 'noisy');
    expect(entry).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('phase logger routes error level to console.error', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logger = createPhaseLogger('SYNTHESIS', 'cid-3');
    logger.error('synthesis_failed', { phase: 'validate' });
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(String(errSpy.mock.calls[0]![0])).toMatch(/^\[SYNTHESIS\] /);
  });
});
