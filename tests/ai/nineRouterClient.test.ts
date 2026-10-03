import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  streamChatCompletion,
  testNineRouterConnection,
  redactApiKey,
} from '../../src/services/ai/nineRouterClient';

describe('nineRouterClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('redacts sensitive API key from strings and error messages', () => {
    const errorMsg = 'Failed to fetch from https://api.9router.com with sk-abc123456789xyz';
    const redacted = redactApiKey(errorMsg, 'sk-abc123456789xyz');
    expect(redacted).toBe('Failed to fetch from https://api.9router.com with ***');
  });

  it('testNineRouterConnection returns models list on 200 OK', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [{ id: 'gpt-4o' }, { id: 'claude-3-5-sonnet' }],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await testNineRouterConnection({
      endpoint: 'https://api.9router.com',
      apiKey: 'test-key',
    });

    expect(result.ok).toBe(true);
    expect(result.models).toEqual(['gpt-4o', 'claude-3-5-sonnet']);
  });

  it('testNineRouterConnection handles 401 Unauthorized with sanitized error', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'Invalid API key test-key',
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await testNineRouterConnection({
      endpoint: 'https://api.9router.com',
      apiKey: 'test-key',
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    expect(result.error).not.toContain('test-key');
    expect(result.error).toContain('***');
  });

  it('streamChatCompletion correctly parses SSE chunks across fragmented buffers', async () => {
    const ssePayloadChunks = [
      'data: {"choices":[{"delta":{"content":"Xin',
      ' chào"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" các bạn"}}]}\n\n',
      'data: [DONE]\n\n',
    ];

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        for (const chunk of ssePayloadChunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: stream,
    });
    vi.stubGlobal('fetch', mockFetch);

    const tokens: string[] = [];
    for await (const token of streamChatCompletion({
      endpoint: 'https://api.9router.com',
      apiKey: 'test-key',
      payload: {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Chào bạn' }],
      },
    })) {
      tokens.push(token);
    }

    expect(tokens.join('')).toBe('Xin chào các bạn');
  });

  it('streamChatCompletion respects AbortSignal and aborts cleanly', async () => {
    const abortController = new AbortController();
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Part 1"}}]}\n\n'));
      },
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: stream,
    });
    vi.stubGlobal('fetch', mockFetch);

    const tokens: string[] = [];
    try {
      for await (const token of streamChatCompletion({
        endpoint: 'https://api.9router.com',
        apiKey: 'test-key',
        payload: {
          model: 'gpt-4o',
          messages: [{ role: 'user', content: 'test' }],
        },
        signal: abortController.signal,
      })) {
        tokens.push(token);
        abortController.abort();
      }
    } catch (err: any) {
      expect(err.name).toBe('AbortError');
    }

    expect(tokens).toEqual(['Part 1']);
  });
});
