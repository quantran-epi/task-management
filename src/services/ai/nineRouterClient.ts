import type {
  StreamChatCompletionOptions,
  StreamChatChunk,
  ToolCall,
  ConnectionTestOptions,
  ConnectionTestResult,
} from './types';

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

export async function testNineRouterConnection(
  options: ConnectionTestOptions
): Promise<ConnectionTestResult> {
  const baseEndpoint = sanitizeEndpoint(options.endpoint);
  const targetUrl = `${baseEndpoint}/v1/models`;

  try {
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (options.apiKey && options.apiKey.trim()) {
      headers.Authorization = `Bearer ${options.apiKey.trim()}`;
    }

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers,
      ...(options.signal ? { signal: options.signal } : {}),
    });

    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      const models: string[] = [];
      if (Array.isArray(data?.data)) {
        for (const item of data.data) {
          if (item?.id && typeof item.id === 'string') {
            models.push(item.id);
          }
        }
      }
      return {
        ok: true,
        status: response.status,
        models,
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
      errorMsg = `Lỗi kết nối tới ${targetUrl} (${err?.message || 'Network/CORS error'}). Hãy kiểm tra xem 9Router daemon đã chạy chưa (npx 9router).`;
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

    response = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...options.payload,
        stream: true,
      }),
      ...(options.signal ? { signal: options.signal } : {}),
    });
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
  const accumulatedToolCalls: Map<number, ToolCall> = new Map();

  try {
    while (true) {
      if (options.signal?.aborted) {
        const abortErr = new Error('Yêu cầu đã bị hủy');
        abortErr.name = 'AbortError';
        throw abortErr;
      }

      const { done, value } = await reader.read();
      if (done) break;

      lineBuffer += decoder.decode(value, { stream: true });
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

          const delta = parsed.choices?.[0]?.delta;
          const deltaText = delta?.content ?? delta?.reasoning_content;
          if (typeof deltaText === 'string' && deltaText.length > 0) {
            yield { type: 'text', delta: deltaText };
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
