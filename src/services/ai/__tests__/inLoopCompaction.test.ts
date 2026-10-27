import { describe, it, expect, vi } from 'vitest';
import { compactMessagesInLoop } from '../inLoopCompaction';
import type { ChatCompletionMessage } from '../types';

function baseMessages(count: number): ChatCompletionMessage[] {
  const msgs: ChatCompletionMessage[] = [
    { role: 'system', content: 'system prompt' },
    { role: 'user', content: 'original request' },
  ];
  for (let i = 0; i < count; i++) {
    msgs.push({ role: 'assistant', content: `step ${i}` });
    msgs.push({ role: 'tool', tool_call_id: `call-${i}`, content: `result ${i}` });
  }
  return msgs;
}

const summarizeOk = vi.fn(async () => ({ content: 'SUMMARY-TEXT' }));

describe('compactMessagesInLoop', () => {
  it('does nothing while prompt tokens stay under budget', async () => {
    const messages = baseMessages(6);
    const res = await compactMessagesInLoop({
      messages,
      promptTokens: 500,
      tokenBudget: 3000,
      endpoint: 'http://x',
      model: 'm',
      summarize: summarizeOk as any,
    });
    expect(res.compacted).toBe(false);
    expect(res.messages).toHaveLength(messages.length);
  });

  it('collapses the middle once prompt tokens exceed budget', async () => {
    const messages = baseMessages(10);
    const res = await compactMessagesInLoop({
      messages,
      promptTokens: 9000,
      tokenBudget: 3000,
      endpoint: 'http://x',
      model: 'm',
      keepRecentMessages: 4,
      summarize: summarizeOk as any,
    });

    expect(res.compacted).toBe(true);
    expect(res.summarizedCount).toBeGreaterThan(0);
    // head (system) + summary + tail
    expect(res.messages[0]).toEqual(messages[0]);
    expect(res.messages[1]?.content).toContain('SUMMARY-TEXT');
    expect(res.messages.length).toBeLessThan(messages.length);
    // No orphaned tool message may start the tail.
    expect(res.messages[2]?.role).not.toBe('tool');
  });

  it('never breaks the turn when the summarizer fails', async () => {
    const messages = baseMessages(10);
    const res = await compactMessagesInLoop({
      messages,
      promptTokens: 9000,
      tokenBudget: 3000,
      endpoint: 'http://x',
      model: 'm',
      summarize: vi.fn(async () => {
        throw new Error('LLM down');
      }) as any,
    });
    expect(res.compacted).toBe(false);
    expect(res.messages).toHaveLength(messages.length);
  });

  it('does nothing when the budget is disabled', async () => {
    const messages = baseMessages(10);
    const res = await compactMessagesInLoop({
      messages,
      promptTokens: 999_999,
      tokenBudget: 0,
      endpoint: 'http://x',
      model: 'm',
      summarize: summarizeOk as any,
    });
    expect(res.compacted).toBe(false);
  });

  it('skips the LLM call when tool overhead alone busts the budget', async () => {
    const messages = baseMessages(20);
    const summarize = vi.fn(async () => ({ content: 'never called' }));
    const onBeforeSummarize = vi.fn();
    const res = await compactMessagesInLoop({
      messages,
      promptTokens: 200_000,
      tokenBudget: 12_000,
      fixedOverheadTokens: 187_133,
      endpoint: 'http://x',
      model: 'm',
      summarize: summarize as any,
      onBeforeSummarize,
    });
    expect(res.compacted).toBe(false);
    expect(summarize).not.toHaveBeenCalled();
    expect(onBeforeSummarize).not.toHaveBeenCalled();
    expect(res.messages).toHaveLength(messages.length);
  });

  it('skips when there are too few collapsible messages to be worth a call', async () => {
    const messages = baseMessages(2); // head + request + 2 pairs; tail eats most
    const summarize = vi.fn(async () => ({ content: 'never called' }));
    const res = await compactMessagesInLoop({
      messages,
      promptTokens: 9000,
      tokenBudget: 3000,
      keepRecentMessages: 4,
      endpoint: 'http://x',
      model: 'm',
      summarize: summarize as any,
    });
    expect(res.compacted).toBe(false);
    expect(summarize).not.toHaveBeenCalled();
  });
});
