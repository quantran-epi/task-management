import { describe, expect, it } from 'vitest';
import { createRequestRegistry } from '../../src/components/ai/runtime/requestRegistry';

describe('AI retry ownership', () => {
  it('uses new request ID after prior request finishes and blocks double submit', () => {
    const registry = createRequestRegistry();
    const first = registry.begin('tab-a', 'thread-a')!;
    expect(registry.begin('tab-a', 'thread-a')).toBeNull();
    registry.finish(first.requestId);

    const retry = registry.begin('tab-a', 'thread-a')!;
    expect(retry.requestId).not.toBe(first.requestId);
    expect(retry.tabId).toBe(first.tabId);
    expect(retry.threadId).toBe(first.threadId);
  });
});

function retryMessageId(messages: readonly { id: string; role: string; content: string }[], id: string | null): string | undefined {
  return id && messages.some((message) => message.id === id && message.role === 'user') ? id : undefined;
}

describe('AI retry message identity', () => {
  it('reuses immutable original user message ID instead of matching duplicate text', () => {
    const messages = [
      { id: 'user-a', role: 'user', content: 'same prompt' },
      { id: 'assistant-a', role: 'assistant', content: 'error' },
      { id: 'user-b', role: 'user', content: 'same prompt' },
    ];
    expect(retryMessageId(messages, 'user-a')).toBe('user-a');
    expect(retryMessageId(messages, 'missing')).toBeUndefined();
  });
});
