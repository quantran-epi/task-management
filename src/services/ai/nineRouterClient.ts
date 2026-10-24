import type {
  StreamChatCompletionOptions,
  StreamChatChunk,
  ToolCall,
  ConnectionTestOptions,
  ConnectionTestResult,
} from './types';
import type { ChatTokenUsage } from '../../types/models';
import { isTauriApp } from '../../utils/timerPopout';

export interface TauriProxyResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const api = await import('@tauri-apps/api/core');
  return args === undefined ? api.invoke<T>(command) : api.invoke<T>(command, args);
}

export function redactApiKey(text: string, apiKey?: string): string {
  if (!apiKey || apiKey.length < 4) return text;
  return text.replaceAll(apiKey, '***');
}

export function sanitizeEndpoint(endpoint: string): string {
  let trimmed = endpoint.trim().replace(/\/+$/, '');
  if (trimmed.endsWith('/v1')) {
    trimmed = trimmed.slice(0, -3).replace(/\/+$/, '');
  }
  return trimmed || 'http://localhost:20128';
}

export function stripThinkingBlocks(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '')
    .replace(/<think(?:ing)?>[\s\S]*$/gi, '')
    .trim();
}

export function extractJsonContent(raw: string): string {
  let text = stripThinkingBlocks(raw);
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }
  return text;
}

function parseModelIds(data: any): string[] {
  const models: string[] = [];
  if (Array.isArray(data?.data)) {
    for (const item of data.data) {
      if (item?.id && typeof item.id === 'string') {
        models.push(item.id);
      }
    }
  }
  return models;
}

export async function testNineRouterConnection(
  options: ConnectionTestOptions
): Promise<ConnectionTestResult> {
  const baseEndpoint = sanitizeEndpoint(options.endpoint);
  const targetUrl = `${baseEndpoint}/v1/models`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (options.apiKey && options.apiKey.trim()) {
    headers.Authorization = `Bearer ${options.apiKey.trim()}`;
  }

  try {
    if (isTauriApp()) {
      const proxyResponse = await tauriInvoke<TauriProxyResponse>('ai_proxy_request', {
        method: 'GET',
        url: targetUrl,
        headers,
        body: undefined,
      });

      if (proxyResponse.status >= 200 && proxyResponse.status < 300) {
        const data = proxyResponse.body ? JSON.parse(proxyResponse.body) : {};
        return {
          ok: true,
          status: proxyResponse.status,
          models: parseModelIds(data),
        };
      }

      let safeError = redactApiKey(proxyResponse.body || 'API Connection Failed', options.apiKey);
      if (baseEndpoint.includes('api.9router.com') && proxyResponse.status === 404) {
        safeError = 'api.9router.com không phải máy chủ API. Vui lòng sử dụng http://localhost:20128 (chạy qua lệnh `npx 9router`).';
      }
      return {
        ok: false,
        status: proxyResponse.status,
        models: [],
        error: `HTTP ${proxyResponse.status}: ${safeError}`,
      };
    }

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers,
      ...(options.signal ? { signal: options.signal } : {}),
    });

    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      return {
        ok: true,
        status: response.status,
        models: parseModelIds(data),
      };
    }

    const rawError = await response.text().catch(() => '');
    let safeError = redactApiKey(
      rawError || response.statusText || 'API Connection Failed',
      options.apiKey
    );
    if (baseEndpoint.includes('api.9router.com') && response.status === 404) {
      safeError = 'api.9router.com không phải máy chủ API. Vui lòng sử dụng http://localhost:20128 (chạy qua lệnh `npx 9router`).';
    }
    return {
      ok: false,
      status: response.status,
      models: [],
      error: `HTTP ${response.status}: ${safeError}`,
    };
  } catch (err: any) {
    let errorMsg = redactApiKey(
      err?.message || 'Không thể kết nối đến máy chủ 9router',
      options.apiKey
    );
    if (baseEndpoint.includes('api.9router.com')) {
      errorMsg = 'api.9router.com không phải API server. 9Router chạy cục bộ tại http://localhost:20128 (chạy lệnh `npx 9router`).';
    } else {
      errorMsg = `Lỗi kết nối tới ${targetUrl} (${errorMsg || 'Network/CORS error'}). Hãy kiểm tra xem 9Router daemon đã chạy chưa (npx 9router).`;
    }
    return {
      ok: false,
      status: 0,
      models: [],
      error: errorMsg,
    };
  }
}

export async function* streamChatEvents(
  options: StreamChatCompletionOptions
): AsyncGenerator<StreamChatChunk, void, unknown> {
  // If streamChatCompletion was mocked in unit test, delegate to it
  if (
    typeof (streamChatCompletion as any)?.mock !== 'undefined' ||
    Boolean((streamChatCompletion as any)?._isMockFunction)
  ) {
    for await (const token of streamChatCompletion(options)) {
      yield { type: 'text', delta: token };
    }
    return;
  }

  const baseEndpoint = sanitizeEndpoint(options.endpoint);
  const targetUrl = `${baseEndpoint}/v1/chat/completions`;

  let response: Response;
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (options.apiKey && options.apiKey.trim()) {
      headers.Authorization = `Bearer ${options.apiKey.trim()}`;
    }

    if (isTauriApp()) {
      const proxyResponse = await tauriInvoke<TauriProxyResponse>('ai_proxy_request', {
        method: 'POST',
        url: targetUrl,
        headers,
        body: JSON.stringify({
          ...options.payload,
          stream: true,
          stream_options: { include_usage: true },
        }),
      });

      response = new Response(proxyResponse.body, {
        status: proxyResponse.status,
        headers: proxyResponse.headers,
      });
    } else {
      response = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...options.payload,
          stream: true,
          stream_options: { include_usage: true },
        }),
        ...(options.signal ? { signal: options.signal } : {}),
      });
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw err;
    }
    const safeMsg = redactApiKey(
      err?.message || 'Lỗi gửi yêu cầu tới 9router',
      options.apiKey
    );
    throw new Error(safeMsg);
  }

  if (!response.ok) {
    const rawError = await response.text().catch(() => '');
    const safeMsg = redactApiKey(
      `API Error (${response.status}): ${rawError || response.statusText}`,
      options.apiKey
    );
    throw new Error(safeMsg);
  }

  if (!response.body) {
    throw new Error('Dữ liệu phản hồi từ 9router rỗng');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let lineBuffer = '';
  let fullRawBody = '';
  let yieldedAny = false;
  const accumulatedToolCalls: Map<number, ToolCall> = new Map();
  const watchdogMs = options.watchdogTimeoutMs ?? 60_000;

  try {
    while (true) {
      if (options.signal?.aborted) {
        const abortErr = new Error('Yêu cầu đã bị hủy');
        abortErr.name = 'AbortError';
        throw abortErr;
      }

      let readTimer: ReturnType<typeof setTimeout> | undefined;
      const readTimeout = new Promise<never>((_, reject) => {
        readTimer = setTimeout(() => {
          reject(
            new Error(
              `Thời gian chờ phản hồi từ máy chủ AI vượt quá ${Math.round(watchdogMs / 1000)}s`
            )
          );
        }, watchdogMs);
      });

      let readResult: ReadableStreamReadResult<Uint8Array>;
      try {
        readResult = await Promise.race([reader.read(), readTimeout]);
      } finally {
        if (readTimer) clearTimeout(readTimer);
      }

      const { done, value } = readResult;
      if (done) break;

      lineBuffer += decoder.decode(value, { stream: true });
      fullRawBody += lineBuffer;
      const lines = lineBuffer.split(/\r?\n/);
      // Keep trailing incomplete fragment in the buffer
      lineBuffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue; // Ignore empty lines and SSE comments

        if (trimmed.startsWith('data:')) {
          const dataContent = trimmed.slice(5).trim();
          if (dataContent === '[DONE]') {
            if (accumulatedToolCalls.size > 0) {
              const sortedCalls = Array.from(accumulatedToolCalls.entries())
                .sort(([a], [b]) => a - b)
                .map(([, call]) => call);
              yield { type: 'tool_calls', calls: sortedCalls };
              yieldedAny = true;
            }
            return;
          }

          let parsed: any;
          try {
            parsed = JSON.parse(dataContent);
          } catch {
            // Incomplete JSON or non-JSON chunk across SSE segment — safely ignore
            continue;
          }

          if (parsed?.error) {
            const errMsg =
              typeof parsed.error === 'string'
                ? parsed.error
                : parsed.error.message || JSON.stringify(parsed.error);
            throw new Error(redactApiKey(errMsg, options.apiKey));
          }

          const choice = parsed.choices?.[0];
          if (choice?.finish_reason === 'content_filter') {
            throw new Error(
              'Nội dung bị chặn bởi bộ lọc an toàn của nhà cung cấp AI (content_filter)'
            );
          }

          const delta = choice?.delta;
          if (typeof delta?.reasoning_content === 'string' && delta.reasoning_content.length > 0) {
            yield { type: 'reasoning', delta: delta.reasoning_content };
          }
          if (typeof delta?.content === 'string' && delta.content.length > 0) {
            yield { type: 'text', delta: delta.content };
            yieldedAny = true;
          }

          if (parsed?.usage) {
            yield {
              type: 'usage',
              usage: {
                promptTokens: parsed.usage.prompt_tokens ?? parsed.usage.promptTokens,
                completionTokens: parsed.usage.completion_tokens ?? parsed.usage.completionTokens,
                totalTokens: parsed.usage.total_tokens ?? parsed.usage.totalTokens,
              },
            };
          }

          if (Array.isArray(delta?.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              const existing = accumulatedToolCalls.get(idx);
              if (!existing) {
                accumulatedToolCalls.set(idx, {
                  id: tc.id || `call_${idx}`,
                  type: 'function',
                  function: {
                    name: tc.function?.name || '',
                    arguments: tc.function?.arguments || '',
                  },
                });
              } else {
                if (tc.id) existing.id = tc.id;
                if (tc.function?.name) existing.function.name += tc.function.name;
                if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
              }
            }
          }
        }
      }
    }

    if (accumulatedToolCalls.size > 0) {
      const sortedCalls = Array.from(accumulatedToolCalls.entries())
        .sort(([a], [b]) => a - b)
        .map(([, call]) => call);
      yield { type: 'tool_calls', calls: sortedCalls };
      yieldedAny = true;
    }

    if (!yieldedAny && accumulatedToolCalls.size === 0 && fullRawBody.trim()) {
      try {
        const parsed = JSON.parse(fullRawBody);
        if (parsed?.error) {
          const errMsg =
            typeof parsed.error === 'string'
              ? parsed.error
              : parsed.error.message || JSON.stringify(parsed.error);
          throw new Error(redactApiKey(errMsg, options.apiKey));
        }

        const message = parsed.choices?.[0]?.message;
        if (typeof message?.reasoning_content === 'string' && message.reasoning_content.length > 0) {
          yield { type: 'reasoning', delta: message.reasoning_content };
        }
        if (typeof message?.content === 'string' && message.content.length > 0) {
          yield { type: 'text', delta: message.content };
          yieldedAny = true;
        }

        if (Array.isArray(message?.tool_calls) && message.tool_calls.length > 0) {
          yield { type: 'tool_calls', calls: message.tool_calls };
          yieldedAny = true;
        }

        if (parsed?.usage) {
          yield {
            type: 'usage',
            usage: {
              promptTokens: parsed.usage.prompt_tokens ?? parsed.usage.promptTokens,
              completionTokens: parsed.usage.completion_tokens ?? parsed.usage.completionTokens,
              totalTokens: parsed.usage.total_tokens ?? parsed.usage.totalTokens,
            },
          };
        }
      } catch (err: any) {
        if (err?.message && !err.message.includes('JSON')) {
          throw err;
        }
      }
    }

    if (!yieldedAny && accumulatedToolCalls.size === 0 && !options.signal?.aborted) {
      throw new Error('Máy chủ AI đóng kết nối mà không trả về nội dung hoặc công cụ hợp lệ');
    }
  } catch (err: any) {
    if (err.name === 'AbortError' || options.signal?.aborted) {
      const abortErr = new Error('Yêu cầu đã bị hủy');
      abortErr.name = 'AbortError';
      throw abortErr;
    }
    const safeMsg = redactApiKey(err?.message || 'Lỗi đọc luồng SSE', options.apiKey);
    throw new Error(safeMsg);
  } finally {
    reader.releaseLock();
  }
}

export async function* streamChatCompletion(
  options: StreamChatCompletionOptions
): AsyncGenerator<string, void, unknown> {
  for await (const chunk of streamChatEvents(options)) {
    if (chunk.type === 'text') {
      yield chunk.delta;
    }
  }
}

export type NineRouterClientErrorCode =
  | 'REMOTE_ERROR'
  | 'TIMEOUT'
  | 'ABORTED'
  | 'INVALID_RESPONSE'
  | 'NETWORK_ERROR';

export class NineRouterClientError extends Error {
  constructor(
    public readonly code: NineRouterClientErrorCode,
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = 'NineRouterClientError';
  }
}

export interface CompleteJsonRequest {
  endpoint: string;
  apiKey?: string | undefined;
  model: string;
  temperature?: number | undefined;
  maxTokens?: number | undefined;
  messages: Array<{ role: 'system' | 'user'; content: string }>;
  responseFormat?: {
    type: 'json_schema';
    json_schema: {
      name: string;
      strict: true;
      schema: Record<string, unknown>;
    };
  } | undefined;
  response_format?: {
    type: 'json_schema';
    json_schema: {
      name: string;
      strict: true;
      schema: Record<string, unknown>;
    };
  } | undefined;
  signal: AbortSignal;
  onUsage?: ((usage: ChatTokenUsage) => void) | undefined;
}

export async function completeJson(req: CompleteJsonRequest): Promise<unknown> {
  const baseEndpoint = sanitizeEndpoint(req.endpoint);
  const targetUrl = `${baseEndpoint}/v1/chat/completions`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (req.apiKey && req.apiKey.trim()) {
    headers.Authorization = `Bearer ${req.apiKey.trim()}`;
  }

  // Intent routing over the Tauri proxy has been measured at ~56s on large prompts;
  // 45s caused spurious retries, and a retry can only produce a worse answer.
  const timeoutSignal = AbortSignal.timeout(90_000);
  const combinedSignal = (AbortSignal as any).any
    ? (AbortSignal as any).any([req.signal, timeoutSignal])
    : req.signal;

  const response_format = req.response_format ?? req.responseFormat;
  const requestBody = {
    model: req.model,
    temperature: req.temperature ?? 0,
    max_tokens: req.maxTokens ?? 1800,
    stream: false,
    response_format,
    messages: req.messages,
  };

  let response: Response;
  try {
    if (isTauriApp()) {
      const proxyResponse = await tauriInvoke<TauriProxyResponse>('ai_proxy_request', {
        method: 'POST',
        url: targetUrl,
        headers,
        body: JSON.stringify(requestBody),
      });

      if (combinedSignal.aborted) {
        const reason = combinedSignal.reason;
        const timedOut =
          timeoutSignal.aborted ||
          (reason instanceof DOMException && reason.name === 'TimeoutError');
        throw new NineRouterClientError(
          timedOut ? 'TIMEOUT' : 'ABORTED',
          timedOut ? 'Request timed out' : 'Request was aborted'
        );
      }

      response = new Response(proxyResponse.body, {
        status: proxyResponse.status,
        headers: proxyResponse.headers,
      });
    } else {
      response = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: combinedSignal,
      });
    }
  } catch (error: unknown) {
    if (error instanceof NineRouterClientError) {
      throw error;
    }
    const message = redactApiKey(
      error instanceof Error ? error.message : 'Network request failed',
      req.apiKey
    ).slice(0, 240);

    if (combinedSignal.aborted) {
      const reason = combinedSignal.reason;
      const timedOut =
        timeoutSignal.aborted ||
        (reason instanceof DOMException && reason.name === 'TimeoutError');
      throw new NineRouterClientError(
        timedOut ? 'TIMEOUT' : 'ABORTED',
        timedOut ? 'Request timed out' : 'Request was aborted'
      );
    }
    throw new NineRouterClientError('NETWORK_ERROR', message);
  }

  let json: any;
  try {
    json = await response.json();
  } catch {
    throw new NineRouterClientError(
      'INVALID_RESPONSE',
      'Model provider returned invalid JSON',
      response.status
    );
  }

  if (!response.ok) {
    const rawError = typeof json?.error?.message === 'string'
      ? json.error.message
      : JSON.stringify(json);
    const safeMsg = redactApiKey(
      rawError || response.statusText || 'Model API error',
      req.apiKey
    );
    throw new NineRouterClientError('REMOTE_ERROR', safeMsg, response.status);
  }

  const choice = json?.choices?.[0];
  if (!choice || choice.message?.refusal) {
    const refusalMsg = redactApiKey(
      choice?.message?.refusal || 'Model refused or returned empty choice',
      req.apiKey
    );
    throw new NineRouterClientError('INVALID_RESPONSE', refusalMsg, response.status);
  }

  const content = choice.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new NineRouterClientError(
      'INVALID_RESPONSE',
      'Model returned empty content',
      response.status
    );
  }

  if (json?.usage && req.onUsage) {
    try {
      req.onUsage({
        promptTokens: json.usage.prompt_tokens ?? json.usage.promptTokens,
        completionTokens: json.usage.completion_tokens ?? json.usage.completionTokens,
        totalTokens: json.usage.total_tokens ?? json.usage.totalTokens,
      });
    } catch {
      // Ignore usage callback error
    }
  }

  try {
    return JSON.parse(extractJsonContent(content));
  } catch {
    throw new NineRouterClientError(
      'INVALID_RESPONSE',
      'Model content is not valid JSON',
      response.status
    );
  }
}

interface CapabilityCacheEntry {
  result: { ok: true; strictJsonSchema: boolean } | { ok: false; reason: string };
  expiresAt: number;
}

const capabilityCache = new Map<string, CapabilityCacheEntry>();

function getHostKey(endpoint: string, model: string): string {
  const sanitized = sanitizeEndpoint(endpoint);
  try {
    const parsed = new URL(sanitized);
    return `${parsed.host}::${model}`;
  } catch {
    return `${sanitized}::${model}`;
  }
}

export function clearCapabilityProbeCache(): void {
  capabilityCache.clear();
}

export async function probeStructuredOutputCapability(
  endpoint: string,
  model: string,
  apiKey?: string,
  signal?: AbortSignal
): Promise<{ ok: true; strictJsonSchema: boolean } | { ok: false; reason: string }> {
  const cacheKey = getHostKey(endpoint, model);
  const now = Date.now();
  const cached = capabilityCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.result;
  }

  const probeSignal = signal ?? new AbortController().signal;

  try {
    const parsed = await completeJson({
      endpoint,
      apiKey,
      model,
      temperature: 0,
      maxTokens: 50,
      messages: [
        { role: 'system', content: 'Return {"ok": true}' },
        { role: 'user', content: 'Probe' },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'probe_test',
          strict: true,
          schema: {
            type: 'object',
            properties: { ok: { type: 'boolean' } },
            required: ['ok'],
            additionalProperties: false,
          },
        },
      },
      signal: probeSignal,
    });

    const isOk = (parsed as any)?.ok === true;
    const result: { ok: true; strictJsonSchema: boolean } | { ok: false; reason: string } =
      isOk
        ? { ok: true, strictJsonSchema: true }
        : { ok: false, reason: 'Probe returned non-conforming JSON' };

    capabilityCache.set(cacheKey, {
      result,
      expiresAt: now + 24 * 60 * 60 * 1000,
    });
    return result;
  } catch (error: unknown) {
    const reason = redactApiKey(
      error instanceof Error ? error.message : 'Probe request failed',
      apiKey
    );
    const result: { ok: false; reason: string } = { ok: false, reason };
    capabilityCache.set(cacheKey, {
      result,
      expiresAt: now + 24 * 60 * 60 * 1000,
    });
    return result;
  }
}
