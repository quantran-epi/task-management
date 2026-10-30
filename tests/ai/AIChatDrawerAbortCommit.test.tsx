import { describe, expect, it } from 'vitest';
import { createRequestRegistry } from '../../src/components/ai/runtime/requestRegistry';

describe('AI assistant commit boundary', () => {
  it('invalidates aborted request before any commit can be current', () => {
    const registry = createRequestRegistry();
    const request = registry.begin('tab-a')!;
    registry.abortTab('tab-a');

    expect(registry.isCurrent(request.requestId, 'tab-a', request.controller)).toBe(false);
    expect(registry.get(request.requestId)).toBeDefined();
    registry.finish(request.requestId);
    expect(registry.get(request.requestId)).toBeUndefined();
  });

  it('finishes one request without affecting another tab', () => {
    const registry = createRequestRegistry();
    const first = registry.begin('tab-a')!;
    const second = registry.begin('tab-b')!;

    registry.finish(first.requestId);
    expect(registry.isCurrent(first.requestId, 'tab-a', first.controller)).toBe(false);
    expect(registry.isCurrent(second.requestId, 'tab-b', second.controller)).toBe(true);
  });
});
