import { describe, expect, it } from 'vitest';
import { createRequestRegistry } from '../../src/components/ai/runtime/requestRegistry';
import { createTabRuntime } from '../../src/components/ai/runtime/tabTypes';

describe('AI tab runtime ownership gates', () => {
  it('keeps request controllers and transient buffers independent across tabs', () => {
    const registry = createRequestRegistry();
    const first = registry.begin('tab-a');
    const second = registry.begin('tab-b');

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first?.controller).not.toBe(second?.controller);
    expect(registry.begin('tab-a')).toBeNull();

    const runtimeA = createTabRuntime('tab-a', 'thread-a', { partialBuffer: 'A', status: 'processing' });
    const runtimeB = createTabRuntime('tab-b', 'thread-b', { partialBuffer: 'B', status: 'processing' });
    expect(runtimeA.partialBuffer).toBe('A');
    expect(runtimeB.partialBuffer).toBe('B');
    expect(registry.isCurrent(first!.requestId, 'tab-a', first!.controller)).toBe(true);
    expect(registry.isCurrent(second!.requestId, 'tab-b', second!.controller)).toBe(true);
  });

  it('aborts only owning tab and rejects stale completion', () => {
    const registry = createRequestRegistry();
    const first = registry.begin('tab-a')!;
    const second = registry.begin('tab-b')!;

    registry.abortTab('tab-a');
    expect(first.controller.signal.aborted).toBe(true);
    expect(second.controller.signal.aborted).toBe(false);
    expect(registry.isCurrent(first.requestId, 'tab-a', first.controller)).toBe(false);
    expect(registry.isCurrent(second.requestId, 'tab-b', second.controller)).toBe(true);
  });
});
