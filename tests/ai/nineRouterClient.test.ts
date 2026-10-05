import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  streamChatCompletion,
  streamChatEvents,
  testNineRouterConnection,
  redactApiKey,
} from '../../src/services/ai/nineRouterClient';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

describe('nineRouterClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    invokeMock.mockReset();
    delete (window as any).__TAURI_INTERNALS__;
  });

  afterEach(() => {
    delete (window as any).__TAURI_INTERNALS__;
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

  it('testNineRouterConnection uses Tauri AI proxy and parses models in desktop', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    invokeMock.mockResolvedValue({
      status: 200,
      headers: {},
      body: JSON.stringify({ data: [{ id: 'gpt-4o' }, { id: 'claude-3-5-sonnet' }] }),
    });
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const result = await testNineRouterConnection({
      endpoint: 'http://localhost:20128',
      apiKey: 'test-key',
    });

    expect(result.ok).toBe(true);
    expect(result.models).toEqual(['gpt-4o', 'claude-3-5-sonnet']);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(invokeMock).toHaveBeenCalledWith('ai_proxy_request', {
      method: 'GET',
      url: 'http://localhost:20128/v1/models',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer test-key',
      },
      body: undefined,
    });
  });

  it('testNineRouterConnection redacts Tauri proxy non-2xx errors', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    invokeMock.mockResolvedValue({
      status: 401,
      headers: {},
      body: 'Invalid API key test-key',
    });

    const result = await testNineRouterConnection({
      endpoint: 'http://localhost:20128',
      apiKey: 'test-key',
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    expect(result.models).toEqual([]);
    expect(result.error).not.toContain('test-key');
    expect(result.error).toContain('***');
  });

  it('testNineRouterConnection redacts Tauri invoke errors', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    invokeMock.mockRejectedValue(new Error('native failure with test-key'));

    const result = await testNineRouterConnection({
      endpoint: 'http://localhost:20128',
      apiKey: 'test-key',
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(0);
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

  it('streamChatEvents parses tool_calls delta chunks and yields aggregated tool calls', async () => {
    const ssePayloadChunks = [
      'data: {"choices":[{"delta":{"role":"assistant","content":null,"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"query_tasks","arguments":""}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"project"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"Id\\":\\"p1\\"}"}}]}}]}\n\n',
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

    const chunks: any[] = [];
    for await (const chunk of streamChatEvents({
      endpoint: 'http://localhost:20128',
      apiKey: 'test-key',
      payload: {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Có bao nhiêu task?' }],
      },
    })) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBe(1);
    expect(chunks[0].type).toBe('tool_calls');
    expect(chunks[0].calls[0].function.name).toBe('query_tasks');
    expect(chunks[0].calls[0].function.arguments).toBe('{"projectId":"p1"}');
  });
});
