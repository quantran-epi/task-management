import type {
  StreamChatCompletionOptions,
  ConnectionTestOptions,
  ConnectionTestResult,
} from './types';

export function redactApiKey(text: string, apiKey?: string): string {
  if (!apiKey || apiKey.length < 4) return text;
  return text.replaceAll(apiKey, '***');
}

export function sanitizeEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, '');
  return trimmed || 'https://api.9router.com';
}

export async function testNineRouterConnection(
  options: ConnectionTestOptions
): Promise<ConnectionTestResult> {
  const baseEndpoint = sanitizeEndpoint(options.endpoint);
  const targetUrl = `${baseEndpoint}/v1/models`;

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${options.apiKey.trim()}`,
        Accept: 'application/json',
      },
      signal: options.signal,
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
    const safeError = redactApiKey(
      rawError || response.statusText || 'API Connection Failed',
      options.apiKey
    );
    return {
      ok: false,
      status: response.status,
      models: [],
      error: safeError,
    };
  } catch (err: any) {
    const errorMsg = redactApiKey(
      err?.message || 'Không thể kết nối đến máy chủ 9router',
      options.apiKey
    );
    return {
      ok: false,
      status: 0,
      models: [],
      error: errorMsg,
    };
  }
}

export async function* streamChatCompletion(
  options: StreamChatCompletionOptions
): AsyncGenerator<string, void, unknown> {
  const baseEndpoint = sanitizeEndpoint(options.endpoint);
  const targetUrl = `${baseEndpoint}/v1/chat/completions`;

  let response: Response;
  try {
    response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.apiKey.trim()}`,
      },
      body: JSON.stringify({
        ...options.payload,
        stream: true,
      }),
      signal: options.signal,
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
            return;
          }

          try {
            const parsed = JSON.parse(dataContent);
            const deltaText = parsed.choices?.[0]?.delta?.content;
            if (typeof deltaText === 'string' && deltaText.length > 0) {
              yield deltaText;
            }
          } catch {
            // Incomplete JSON or non-JSON chunk across SSE segment — safely ignore
          }
        }
      }
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
