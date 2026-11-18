import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  streamChatCompletion,
  streamChatEvents,
  testNineRouterConnection,
  redactApiKey,
  completeJson,
  probeStructuredOutputCapability,
  clearCapabilityProbeCache,
  mapUsage,
} from '../../src/services/ai/nineRouterClient';
import type { StreamChatChunk } from '../../src/services/ai/types';

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

  // WR-02: OpenAI's prompt_tokens already includes the cached portion, Anthropic's
  // input_tokens does not. `splitUsage` adds prompt + cache, so the OpenAI shape must be
  // normalized here or the cached tokens are charged twice.
  it('subtracts cached_tokens from prompt_tokens for the OpenAI shape (WR-02)', () => {
    const usage = mapUsage({
      prompt_tokens: 1000,
      completion_tokens: 200,
      total_tokens: 1200,
      prompt_tokens_details: { cached_tokens: 400 },
    });
    expect(usage.promptTokens).toBe(600);
    expect(usage.cacheReadTokens).toBe(400);
    expect((usage.promptTokens ?? 0) + (usage.cacheReadTokens ?? 0)).toBe(1000);
  });

  it('leaves promptTokens as-is for the Anthropic shape (WR-02)', () => {
    const usage = mapUsage({
      prompt_tokens: 600,
      completion_tokens: 200,
      cache_read_input_tokens: 400,
      cache_creation_input_tokens: 50,
    });
    // Anthropic's input count already excludes cache reads, so no subtraction happens.
    expect(usage.promptTokens).toBe(600);
    expect(usage.cacheReadTokens).toBe(400);
    expect(usage.cacheCreationTokens).toBe(50);
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

  it('streamChatEvents uses Tauri AI proxy and streams chunks in desktop', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    const sseBody = [
      'data: {"choices":[{"delta":{"content":"Tauri"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" streaming"}}]}\n\n',
      'data: [DONE]\n\n',
    ].join('');

    invokeMock.mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      body: sseBody,
    });
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const chunks: any[] = [];
    for await (const chunk of streamChatEvents({
      endpoint: 'http://10.4.97.70:30129',
      apiKey: 'sk-secret-1234',
      payload: {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'test tauri' }],
      },
    })) {
      chunks.push(chunk);
    }

    expect(mockFetch).not.toHaveBeenCalled();
    expect(invokeMock).toHaveBeenCalledWith('ai_proxy_request', {
      method: 'POST',
      url: 'http://10.4.97.70:30129/v1/chat/completions',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer sk-secret-1234',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'test tauri' }],
        stream: true,
        stream_options: { include_usage: true },
      }),
    });
    expect(chunks).toEqual([
      { type: 'text', delta: 'Tauri' },
      { type: 'text', delta: ' streaming' },
    ]);
  });

  it('JSON fallback giữ chính xác body chia nhiều chunk và byte UTF-8', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({
      choices: [{ message: { content: 'Tiếng Việt nguyên vẹn' }, finish_reason: 'stop' }],
    }, null, 2));
    const stream = new ReadableStream({
      start(controller) {
        for (let index = 0; index < bytes.length; index += 3) controller.enqueue(bytes.slice(index, index + 3));
        controller.close();
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream)));
    const chunks: StreamChatChunk[] = [];
    for await (const chunk of streamChatEvents({
      endpoint: 'http://localhost:20128', apiKey: 'test-key',
      payload: { model: 'model', messages: [] },
    })) chunks.push(chunk);
    expect(chunks).toEqual([
      { type: 'text', delta: 'Tiếng Việt nguyên vẹn' },
      { type: 'finish', finish_reason: 'stop' },
    ]);
  });

  it('streamChatEvents supports non-SSE JSON response from Tauri AI proxy', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    const jsonBody = JSON.stringify({
      choices: [
        {
          message: {
            content: 'Direct JSON response',
          },
        },
      ],
    });

    invokeMock.mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: jsonBody,
    });

    const chunks: any[] = [];
    for await (const chunk of streamChatEvents({
      endpoint: 'http://10.4.97.70:30129',
      apiKey: 'sk-secret-1234',
      payload: {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'test' }],
      },
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      { type: 'text', delta: 'Direct JSON response' },
    ]);
  });

  it.each(['stop', 'length', 'tool_calls'])('emits SSE finish %s after content', async (reason) => {
    const body = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'Retained text' }, finish_reason: reason }] })}\n\n`,
      'data: [DONE]\n\n',
    ].join('');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));

    const chunks: StreamChatChunk[] = [];
    for await (const chunk of streamChatEvents({
      endpoint: 'http://localhost:20128',
      apiKey: 'test-key',
      payload: { model: 'gpt-4o', messages: [{ role: 'user', content: 'test' }] },
    })) chunks.push(chunk);

    expect(chunks).toEqual([
      { type: 'text', delta: 'Retained text' },
      { type: 'finish', finish_reason: reason },
    ]);
  });

  it.each(['stop', 'length'])('emits non-stream JSON finish %s after content in desktop', async (reason) => {
    (window as any).__TAURI_INTERNALS__ = {};
    invokeMock.mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ choices: [{ message: { content: 'Retained text' }, finish_reason: reason }] }),
    });

    const chunks: StreamChatChunk[] = [];
    for await (const chunk of streamChatEvents({
      endpoint: 'http://localhost:20128',
      apiKey: 'test-key',
      payload: { model: 'gpt-4o', messages: [{ role: 'user', content: 'test' }] },
    })) chunks.push(chunk);

    expect(chunks).toEqual([
      { type: 'text', delta: 'Retained text' },
      { type: 'finish', finish_reason: reason },
    ]);
  });

  it('emits finish events for every completed choice without inventing reasons', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      `data: ${JSON.stringify({ choices: [
        { delta: { content: 'Text' }, finish_reason: null },
        { delta: {}, finish_reason: 'stop' },
        { delta: {}, finish_reason: 'length' },
      ] })}\n\ndata: [DONE]\n\n`,
    )));
    const chunks: StreamChatChunk[] = [];
    for await (const chunk of streamChatEvents({
      endpoint: 'http://localhost:20128', apiKey: 'test-key',
      payload: { model: 'gpt-4o', messages: [] },
    })) chunks.push(chunk);
    expect(chunks).toEqual([
      { type: 'text', delta: 'Text' },
      { type: 'finish', finish_reason: 'stop' },
      { type: 'finish', finish_reason: 'length' },
    ]);
  });

  it.each(['sse', 'json'])('rejects content_filter for %s without emitting a completion', async (format) => {
    const choice = { delta: {}, message: { content: 'Blocked' }, finish_reason: 'content_filter' };
    const body = format === 'sse'
      ? `data: ${JSON.stringify({ choices: [choice] })}\n\ndata: [DONE]\n\n`
      : JSON.stringify({ choices: [choice] });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
    const chunks: StreamChatChunk[] = [];
    await expect(async () => {
      for await (const chunk of streamChatEvents({
        endpoint: 'http://localhost:20128', apiKey: 'test-key',
        payload: { model: 'gpt-4o', messages: [] },
      })) chunks.push(chunk);
    }).rejects.toThrow('content_filter');
    expect(chunks).toEqual([]);
  });

  it('streamChatEvents redacts sensitive API key on error in desktop', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    invokeMock.mockResolvedValue({
      status: 403,
      headers: {},
      body: 'Forbidden with key sk-secret-1234',
    });

    await expect(async () => {
      for await (const _ of streamChatEvents({
        endpoint: 'http://10.4.97.70:30129',
        apiKey: 'sk-secret-1234',
        payload: {
          model: 'gpt-4o',
          messages: [{ role: 'user', content: 'test' }],
        },
      })) {
        // drain
      }
    }).rejects.toThrowError(/API Error \(403\): Forbidden with key \*\*\*/);
  });

  it('streamChatEvents throws watchdog timeout when chunk stalls beyond limit', async () => {
    // Stream that never produces chunks
    const stream = new ReadableStream({
      start(_controller) {
        // don't enqueue anything, leave open
      },
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: stream,
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(async () => {
      for await (const _ of streamChatEvents({
        endpoint: 'https://api.9router.com',
        apiKey: 'test-key',
        payload: {
          model: 'gpt-4o',
          messages: [{ role: 'user', content: 'test' }],
        },
        watchdogTimeoutMs: 50,
      })) {
        // drain
      }
    }).rejects.toThrowError(/Thời gian chờ phản hồi từ máy chủ AI vượt quá/);
  });

  it('streamChatEvents throws when stream terminates prematurely without data or [DONE]', async () => {
    // Stream that immediately closes with 0 chunks
    const stream = new ReadableStream({
      start(controller) {
        controller.close();
      },
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: stream,
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(async () => {
      for await (const _ of streamChatEvents({
        endpoint: 'https://api.9router.com',
        apiKey: 'test-key',
        payload: {
          model: 'gpt-4o',
          messages: [{ role: 'user', content: 'test' }],
        },
      })) {
        // drain
      }
    }).rejects.toThrowError(/Máy chủ AI đóng kết nối mà không trả về nội dung hoặc công cụ hợp lệ/);
  });

  describe('completeJson and probeStructuredOutputCapability', () => {
    beforeEach(() => {
      clearCapabilityProbeCache();
    });

    it('completeJson POSTs with stream: false, no tools key, correct response_format', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: '{"answer": "ok"}' } }],
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const controller = new AbortController();
      const res = await completeJson({
        endpoint: 'http://localhost:20128',
        apiKey: 'secret-key-1234',
        model: 'gpt-4o',
        temperature: 0,
        maxTokens: 500,
        messages: [{ role: 'user', content: 'Hi' }],
        responseFormat: {
          type: 'json_schema',
          json_schema: {
            name: 'test_schema',
            strict: true,
            schema: { type: 'object' },
          },
        },
        signal: controller.signal,
      });

      expect(res).toEqual({ answer: 'ok' });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const call = mockFetch.mock.calls[0]!;
      expect(call[0]).toBe('http://localhost:20128/v1/chat/completions');
      const body = JSON.parse(call[1]?.body as string);
      expect(body.stream).toBe(false);
      expect(body.tools).toBeUndefined();
      expect(body.tool_choice).toBeUndefined();
      expect(body.response_format).toEqual({
        type: 'json_schema',
        json_schema: {
          name: 'test_schema',
          strict: true,
          schema: { type: 'object' },
        },
      });
    });

    it('completeJson throws TIMEOUT when AbortSignal.timeout fires', async () => {
      const slowFetch = vi.fn().mockImplementation((_url, opts) => {
        if (opts?.signal?.aborted) {
          return Promise.reject(opts.signal.reason);
        }
        return new Promise((_resolve, reject) => {
          opts?.signal?.addEventListener('abort', () => {
            reject(opts.signal.reason);
          });
        });
      });
      vi.stubGlobal('fetch', slowFetch);

      const timeoutError = new DOMException('Timeout', 'TimeoutError');
      const timeoutSignal = AbortSignal.abort(timeoutError);
      const anySpy = vi.spyOn(AbortSignal as any, 'any').mockReturnValue(timeoutSignal);

      const controller = new AbortController();
      await expect(
        completeJson({
          endpoint: 'http://localhost:20128',
          model: 'gpt-4o',
          messages: [{ role: 'user', content: 'Hi' }],
          responseFormat: {
            type: 'json_schema',
            json_schema: { name: 's', strict: true, schema: {} },
          },
          signal: controller.signal,
        })
      ).rejects.toMatchObject({
        code: 'TIMEOUT',
      });

      anySpy.mockRestore();
    });

    it('completeJson throws ABORTED when upstream signal aborts', async () => {
      const slowFetch = vi.fn().mockImplementation((_url, opts) => {
        return new Promise((_resolve, reject) => {
          opts.signal.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      });
      vi.stubGlobal('fetch', slowFetch);

      const controller = new AbortController();
      const promise = completeJson({
        endpoint: 'http://localhost:20128',
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Hi' }],
        responseFormat: {
          type: 'json_schema',
          json_schema: { name: 's', strict: true, schema: {} },
        },
        signal: controller.signal,
      });

      controller.abort();

      await expect(promise).rejects.toMatchObject({
        code: 'ABORTED',
      });
    });

    it('returns parsed JSON when provider responds with valid JSON content', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: '{"hello": 42}' } }],
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const res = await completeJson({
        endpoint: 'http://localhost:20128',
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Hi' }],
        responseFormat: {
          type: 'json_schema',
          json_schema: { name: 's', strict: true, schema: {} },
        },
        signal: new AbortController().signal,
      });

      expect(res).toEqual({ hello: 42 });
    });

    it('throws INVALID_RESPONSE when content is not JSON', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: 'Not valid JSON' } }],
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await expect(
        completeJson({
          endpoint: 'http://localhost:20128',
          model: 'gpt-4o',
          messages: [{ role: 'user', content: 'Hi' }],
          responseFormat: {
            type: 'json_schema',
            json_schema: { name: 's', strict: true, schema: {} },
          },
          signal: new AbortController().signal,
        })
      ).rejects.toMatchObject({
        code: 'INVALID_RESPONSE',
      });
    });

    it('probeStructuredOutputCapability caches second call under same key (one fetch call total)', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: '{"ok": true}' } }],
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const res1 = await probeStructuredOutputCapability(
        'http://localhost:20128/v1',
        'gpt-4o'
      );
      const res2 = await probeStructuredOutputCapability(
        'http://localhost:20128',
        'gpt-4o'
      );

      expect(res1).toEqual({ ok: true, strictJsonSchema: true });
      expect(res2).toEqual({ ok: true, strictJsonSchema: true });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('apiKey never leaks in thrown error messages', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({
          error: { message: 'Failed upstream with sk-leak-99999-secret' },
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await expect(
        completeJson({
          endpoint: 'http://localhost:20128',
          apiKey: 'sk-leak-99999-secret',
          model: 'gpt-4o',
          messages: [{ role: 'user', content: 'Hi' }],
          responseFormat: {
            type: 'json_schema',
            json_schema: { name: 's', strict: true, schema: {} },
          },
          signal: new AbortController().signal,
        })
      ).rejects.toSatisfy((err: any) => {
        expect(err.message).not.toContain('sk-leak-99999-secret');
        expect(err.message).toContain('***');
        return true;
      });
    });
  });
});
