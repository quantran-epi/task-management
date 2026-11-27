// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { runAiOrchestratorLoop } from '../aiOrchestratorLoop';
import { streamChatEvents } from '../nineRouterClient';

vi.mock('../nineRouterClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../nineRouterClient')>();
  return { ...actual, streamChatEvents: vi.fn() };
});

const mockStream = vi.mocked(streamChatEvents);

describe('runAiOrchestratorLoop tools stream error (quick 261128-09x)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects on round-1 tools stream failure without a silent tools-less retry', async () => {
    mockStream.mockImplementation(() => {
      throw new Error('provider rejected tools payload');
    });

    const promise = runAiOrchestratorLoop({
      endpoint: 'https://example.test/v1',
      apiKey: 'test-key',
      model: 'test-model',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [
        {
          type: 'function',
          function: { name: 'query_tasks', description: 'read', parameters: { type: 'object' } },
        },
      ],
      db: {} as any,
    });

    await expect(promise).rejects.toThrow('provider rejected tools payload');
    expect(mockStream).toHaveBeenCalledTimes(1);
    for (const call of mockStream.mock.calls) {
      expect(call[0].payload).toHaveProperty('tools');
    }
  });
});
