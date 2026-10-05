import type {
  ImageGenerationOptions,
  ImageGenerationResult,
  ConnectionTestResult,
} from './types';
import {
  redactApiKey,
  sanitizeEndpoint,
  tauriInvoke,
  type TauriProxyResponse,
} from './nineRouterClient';
import { isTauriApp } from '../../utils/timerPopout';

export interface ImageConnectionTestOptions {
  endpoint: string;
  apiKey: string;
  signal?: AbortSignal;
}

/**
 * Standard OpenAI-compatible client for /v1/images/generations.
 * Sends user prompt and receives either base64 image data or URL.
 */
export async function generateImage(
  options: ImageGenerationOptions
): Promise<ImageGenerationResult> {
  const baseEndpoint = sanitizeEndpoint(options.endpoint || 'http://localhost:20128');
  const targetUrl = `${baseEndpoint}/v1/images/generations`;

  const timeoutMs = 60000; // 60s timeout for image models
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const signal = options.signal
    ? (typeof AbortSignal.any === 'function'
        ? AbortSignal.any([options.signal, controller.signal])
        : options.signal)
    : controller.signal;

  const payload: Record<string, any> = {
    prompt: options.prompt.trim(),
    model: options.model || 'dall-e-3',
    n: options.n || 1,
    size: options.size || '1024x1024',
    response_format: options.responseFormat || 'b64_json',
  };

  if (options.quality) payload.quality = options.quality;
  if (options.style) payload.style = options.style;

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (options.apiKey && options.apiKey.trim()) {
      headers.Authorization = `Bearer ${options.apiKey.trim()}`;
    }

    let response: Response;
    if (isTauriApp()) {
      const proxyResponse = await tauriInvoke<TauriProxyResponse>('ai_proxy_request', {
        method: 'POST',
        url: targetUrl,
        headers,
        body: JSON.stringify(payload),
      });

      response = new Response(proxyResponse.body, {
        status: proxyResponse.status,
        headers: proxyResponse.headers,
      });
    } else {
      response = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal,
      });
    }

    clearTimeout(timeoutId);

    if (!response.ok) {
      const rawError = await response.text().catch(() => '');
      let parsedError = rawError;
      try {
        const jsonErr = JSON.parse(rawError);
        parsedError = jsonErr.error?.message || jsonErr.message || rawError;
      } catch {
        // use raw error string
      }
      const safeMsg = redactApiKey(
        `Lỗi tạo ảnh (${response.status}): ${parsedError || response.statusText}`,
        options.apiKey
      );
      throw new Error(safeMsg);
    }

    const json = await response.json();
    const item = Array.isArray(json?.data) ? json.data[0] : null;

    if (!item) {
      throw new Error('Dịch vụ tạo ảnh không trả về dữ liệu ảnh hợp lệ');
    }

    let b64Json: string | undefined = item.b64_json;
    let url: string | undefined = item.url;
    let dataUrl: string | undefined;

    if (b64Json) {
      dataUrl = `data:image/png;base64,${b64Json}`;
    } else if (url) {
      dataUrl = url;
    }

    return {
      b64Json,
      url,
      dataUrl,
      revisedPrompt: item.revised_prompt || options.prompt,
      model: payload.model,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError' || signal.aborted) {
      throw new Error('Yêu cầu tạo ảnh đã bị hủy hoặc hết thời gian chờ (timeout)');
    }
    const safeMsg = redactApiKey(
      err?.message || 'Lỗi không xác định khi gọi API tạo ảnh',
      options.apiKey
    );
    throw new Error(safeMsg);
  }
}

/**
 * Tests connection to the image generation endpoint.
 */
export async function testImageGenerationConnection(
  options: ImageConnectionTestOptions
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

    let response: Response;
    if (isTauriApp()) {
      const proxyResponse = await tauriInvoke<TauriProxyResponse>('ai_proxy_request', {
        method: 'GET',
        url: targetUrl,
        headers,
        body: undefined,
      });

      response = new Response(proxyResponse.body, {
        status: proxyResponse.status,
        headers: proxyResponse.headers,
      });
    } else {
      response = await fetch(targetUrl, {
        method: 'GET',
        headers,
        ...(options.signal ? { signal: options.signal } : {}),
      });
    }

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
      error: `HTTP ${response.status}: ${safeError}`,
    };
  } catch (err: any) {
    const errorMsg = redactApiKey(
      `Lỗi kết nối tới endpoint ảnh (${err?.message || 'Network error'}). Hãy kiểm tra máy chủ.`,
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
