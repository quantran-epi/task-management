import { describe, expect, it, vi } from 'vitest';
import { createTabTurnRegistry } from '../../src/components/ai/runtime/tabRuntimes';
import type { ChatTurnRuntimeDeps, ChatTurnRequest } from '../../src/components/ai/runtime/chatTurnRuntime';

const deps = (overrides: Partial<ChatTurnRuntimeDeps> = {}): ChatTurnRuntimeDeps =>
  ({
    runLoop: vi.fn(),
    saveMessage: vi.fn(),
    describeMutation: vi.fn(),
    db: {} as never,
    ...overrides,
  }) as ChatTurnRuntimeDeps;

const request = (text: string): ChatTurnRequest => ({
  threadId: 'thread-a',
  scopeKey: 'global',
  text,
  analysisMode: true,
  autoApprove: false,
  model: 'model-a',
  endpoint: 'http://localhost',
  apiKey: 'key',
  systemMessages: [],
  history: [],
  tools: [],
});

/** A runLoop whose turn never settles, so `isRunning()` stays true while asserted. */
const hangingDeps = () =>
  deps({
    runLoop: vi.fn(() => new Promise(() => {})) as never,
    saveMessage: vi.fn(async () => ({ id: 'msg-1' })) as never,
  });

describe('createTabTurnRegistry', () => {
  it('Test 1: returns the same runtime instance for repeated get(tabId) calls', () => {
    const registry = createTabTurnRegistry(() => deps());

    const first = registry.get('tab-a', 'thread-a');
    expect(registry.get('tab-a', 'thread-a')).toBe(first);
    expect(registry.peek('tab-a')).toBe(first);
  });

  it('Test 2: discard aborts the runtime and a subsequent get creates a fresh instance', () => {
    const registry = createTabTurnRegistry(hangingDeps);

    const first = registry.get('tab-a', 'thread-a');
    void first.start(request('hello')).catch(() => {});
    expect(first.isRunning()).toBe(true);

    registry.discard('tab-a');
    expect(first.getStatus()).toBe('aborted');
    expect(registry.peek('tab-a')).toBeUndefined();

    const second = registry.get('tab-a', 'thread-a');
    expect(second).not.toBe(first);
  });

  it('Test 3: two tabs hold independent runtimes and a turn in one leaves the other untouched', async () => {
    const registry = createTabTurnRegistry(hangingDeps);
    const tabA = registry.get('tab-a', 'thread-a');
    const tabB = registry.get('tab-b', 'thread-b');

    expect(tabA).not.toBe(tabB);

    void tabB.start(request('tab b turn')).catch(() => {});
    expect(tabB.isRunning()).toBe(true);
    expect(tabB.getStatus()).toBe('preparing');
    expect(tabA.isRunning()).toBe(false);
    expect(tabA.getStatus()).toBe('idle');
  });

  it('Test 4: abortTab aborts only the named tab', () => {
    const registry = createTabTurnRegistry(hangingDeps);
    const tabA = registry.get('tab-a', 'thread-a');
    const tabB = registry.get('tab-b', 'thread-b');

    void tabA.start(request('tab a turn')).catch(() => {});
    void tabB.start(request('tab b turn')).catch(() => {});

    registry.abortTab('tab-a');

    expect(tabA.getStatus()).toBe('aborted');
    expect(tabB.isRunning()).toBe(true);
    expect(tabB.getStatus()).not.toBe('aborted');
  });
});
