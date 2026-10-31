import { afterEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import { describeAiError, logAiChatError } from '../../src/components/ai/aiChatDiagnostics';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('describeAiError (D-13 sanitizer)', () => {
  it('1. drops secret-bearing messages and URLs while keeping the error name', () => {
    const error = new Error('sk-secret at https://internal.example/v1');
    const description = describeAiError(error);
    const serialized = JSON.stringify(description);

    expect(description.name).toBe('Error');
    expect(serialized).not.toContain('sk-secret');
    expect(serialized).not.toContain('internal.example');
    expect(serialized).not.toContain(error.message);
  });

  it('2. reduces Zod issues to joined paths without issue messages', () => {
    const error = new ZodError([
      { code: 'invalid_type', path: ['citations', 0, 'citationId'], message: 'Expected string', expected: 'string', input: 'x' } as never,
    ]);
    const description = describeAiError(error);

    expect(description.name).toBe('ZodError');
    expect(description.issuePaths).toEqual(['citations.0.citationId']);
    expect(Object.keys(description).sort()).toEqual(['issuePaths', 'name']);
    expect(JSON.stringify(description)).not.toContain('Expected string');
  });

  it('3. never throws and yields a stable shape for hostile inputs', () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError');
    const cases: Array<[unknown, string]> = [
      [null, 'UnknownError'],
      [undefined, 'UnknownError'],
      ['sk-secret raw string', 'UnknownError'],
      [{ message: 'sk-secret', secret: 'x' }, 'UnknownError'],
      [abortError, 'AbortError'],
    ];

    for (const [input, expectedName] of cases) {
      const description = describeAiError(input);
      expect(description.name).toBe(expectedName);
      expect(JSON.stringify(description)).not.toContain('sk-secret');
    }
  });

  it('4. logAiChatError logs a stable tag plus the sanitized object, never the raw error', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = new Error('sk-secret at https://internal.example/v1');

    logAiChatError('grounded', error);

    expect(warn).toHaveBeenCalledTimes(1);
    const [tag, payload] = warn.mock.calls[0] as [string, unknown];
    expect(tag).toBe('[AIChatDrawer] grounded:');
    expect(payload).toEqual({ name: 'Error' });
    expect(payload).not.toBe(error);
  });
});
