import type {
  JiraConfig,
  JiraMyselfResponse,
  JiraCreateIssuePayload,
  JiraIssueResponse,
  JiraTransitionsResponse,
} from './types';

export function buildJiraUrl(config: JiraConfig, path: string): string {
  const cleanDomain = config.domain.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const targetUrl = `https://${cleanDomain}${path.startsWith('/') ? path : `/${path}`}`;

  if (!config.corsProxy || !config.corsProxy.trim()) {
    return targetUrl;
  }

  const proxy = config.corsProxy.trim();
  if (proxy.endsWith('=')) {
    return `${proxy}${encodeURIComponent(targetUrl)}`;
  }
  if (proxy.endsWith('/')) {
    return `${proxy}${targetUrl}`;
  }
  return `${proxy}/${targetUrl}`;
}

export function sanitizeErrorMessage(errorMsg: string, token?: string): string {
  if (!token) return errorMsg;
  return errorMsg.replaceAll(token, '[REDACTED]');
}

export function getJiraBrowseUrl(jiraKey: string, domain?: string): string {
  const rawDomain = (domain || '').replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const domainHost = rawDomain.includes('.')
    ? rawDomain
    : rawDomain
      ? `${rawDomain}.atlassian.net`
      : 'atlassian.net';
  return `https://${domainHost}/browse/${encodeURIComponent(jiraKey)}`;
}

export async function callJiraApi<T>(
  config: JiraConfig,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = buildJiraUrl(config, path);
  const credentials = `${config.email}:${config.apiToken}`;
  const authHeader = `Basic ${btoa(unescape(encodeURIComponent(credentials)))}`;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-Atlassian-Token': 'no-check',
    Authorization: authHeader,
    ...((options.headers as Record<string, string>) || {}),
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      // ponytail: credentials omit prevents browser from sending Atlassian session cookies
      // which cause XSRF check failures (403) on direct cross-origin requests
      credentials: 'omit',
      signal: options.signal ?? AbortSignal.timeout(10000),
    });

    if (response.status === 204) {
      return {} as T;
    }

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as {
        errorMessages?: string[];
        errors?: Record<string, string>;
        message?: string;
      };

      // Detect XSRF check failure — Jira Cloud rejects direct cross-origin browser requests
      if (response.status === 403) {
        const allText = [
          ...(errorData.errorMessages ?? []),
          ...Object.values(errorData.errors ?? {}),
          errorData.message ?? '',
        ].join(' ').toLowerCase();
        if (allText.includes('xsrf') || allText.includes('csrf')) {
          if (!config.corsProxy) {
            throw new Error(
              'Jira Cloud từ chối request trực tiếp từ trình duyệt (XSRF check failed). ' +
              'Jira Cloud không hỗ trợ gọi API trực tiếp từ ứng dụng web khác origin. ' +
              'Vui lòng cấu hình CORS Proxy URL trong Cài đặt > Tích hợp Jira để chuyển tiếp request.'
            );
          }
        }
      }

      const messages: string[] = [];
      if (errorData.errorMessages && errorData.errorMessages.length > 0) {
        messages.push(...errorData.errorMessages);
      }
      if (errorData.errors && Object.keys(errorData.errors).length > 0) {
        messages.push(...Object.values(errorData.errors));
      }
      const rawErrorMsg = messages.length > 0 ? messages.join(', ') : `Lỗi Jira API: HTTP ${response.status}`;
      throw new Error(sanitizeErrorMessage(rawErrorMsg, config.apiToken));
    }

    return (await response.json()) as T;
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.name === 'AbortError' || err.name === 'TimeoutError') {
        throw new Error('Hết thời gian chờ phản hồi từ Jira API (Timeout 10s).');
      }
      if (err.name === 'TypeError') {
        if (!config.corsProxy) {
          throw new Error('CORS_BLOCKED');
        }
        throw new Error('Không thể kết nối đến máy chủ Jira hoặc CORS Proxy.');
      }
      err.message = sanitizeErrorMessage(err.message, config.apiToken);
      throw err;
    }
    throw new Error('Lỗi không xác định khi kết nối với Jira.');
  }
}

export async function testJiraConnection(config: JiraConfig): Promise<JiraMyselfResponse> {
  return callJiraApi<JiraMyselfResponse>(config, '/rest/api/3/myself');
}

export async function createJiraIssue(
  config: JiraConfig,
  payload: JiraCreateIssuePayload
): Promise<JiraIssueResponse> {
  return callJiraApi<JiraIssueResponse>(config, '/rest/api/3/issue', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getJiraTransitions(
  config: JiraConfig,
  issueKey: string
): Promise<JiraTransitionsResponse> {
  return callJiraApi<JiraTransitionsResponse>(
    config,
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`
  );
}

export async function executeJiraTransition(
  config: JiraConfig,
  issueKey: string,
  transitionId: string
): Promise<void> {
  await callJiraApi<Record<string, unknown>>(
    config,
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`,
    {
      method: 'POST',
      body: JSON.stringify({ transition: { id: transitionId } }),
    }
  );
}
