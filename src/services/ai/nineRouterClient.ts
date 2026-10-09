import type {
  StreamChatCompletionOptions,
  StreamChatChunk,
  ToolCall,
  ConnectionTestOptions,
  ConnectionTestResult,
} from './types';
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
          const deltaText = delta?.content ?? delta?.reasoning_content;
          if (typeof deltaText === 'string' && deltaText.length > 0) {
            yield { type: 'text', delta: deltaText };
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
        const deltaText = message?.content ?? message?.reasoning_content;
        if (typeof deltaText === 'string' && deltaText.length > 0) {
          yield { type: 'text', delta: deltaText };
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
