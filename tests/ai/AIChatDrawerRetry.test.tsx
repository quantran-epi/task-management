import { describe, expect, it } from 'vitest';
import { createRequestRegistry } from '../../src/components/ai/runtime/requestRegistry';

describe('AI retry ownership', () => {
  it('uses new request ID after prior request finishes and blocks double submit', () => {
    const registry = createRequestRegistry();
    const first = registry.begin('tab-a')!;
    expect(registry.begin('tab-a')).toBeNull();
    registry.finish(first.requestId);

    const retry = registry.begin('tab-a')!;
    expect(retry.requestId).not.toBe(first.requestId);
    expect(retry.tabId).toBe(first.tabId);
  });
});
