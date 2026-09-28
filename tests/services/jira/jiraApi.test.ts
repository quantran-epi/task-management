import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildJiraUrl,
  sanitizeErrorMessage,
  callJiraApi,
  testJiraConnection,
} from '../../../src/services/jira/jiraApi';
import type { JiraConfig } from '../../../src/services/jira/types';

describe('Jira API Client (jiraApi.ts)', () => {
  const baseConfig: JiraConfig = {
    domain: 'shb-bank.atlassian.net',
    email: 'dev@shb.com.vn',
    apiToken: 'secret_token_xyz123',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('buildJiraUrl', () => {
    it('normalizes domain without proxy', () => {
      expect(buildJiraUrl(baseConfig, '/rest/api/3/myself')).toBe(
        'https://shb-bank.atlassian.net/rest/api/3/myself'
      );
      expect(
        buildJiraUrl(
          { ...baseConfig, domain: 'https://shb-bank.atlassian.net/' },
          'rest/api/3/myself'
        )
      ).toBe('https://shb-bank.atlassian.net/rest/api/3/myself');
    });

    it('prefixes corsProxy with query param style ending in =', () => {
      const config: JiraConfig = {
        ...baseConfig,
        corsProxy: 'https://cors-proxy.workers.dev/?url=',
      };
      expect(buildJiraUrl(config, '/rest/api/3/myself')).toBe(
        'https://cors-proxy.workers.dev/?url=https%3A%2F%2Fshb-bank.atlassian.net%2Frest%2Fapi%3F3%2Fmyself'
          .replace('3%3Fmyself', '3%2Fmyself') // URL-encoded path check
      );
    });

    it('prefixes corsProxy with trailing slash style', () => {
      const config: JiraConfig = {
        ...baseConfig,
        corsProxy: 'https://cors-proxy.workers.dev/',
      };
      expect(buildJiraUrl(config, '/rest/api/3/myself')).toBe(
        'https://cors-proxy.workers.dev/https://shb-bank.atlassian.net/rest/api/3/myself'
      );
    });

    it('prefixes corsProxy without trailing slash', () => {
      const config: JiraConfig = {
        ...baseConfig,
        corsProxy: 'https://cors-proxy.workers.dev',
      };
      expect(buildJiraUrl(config, '/rest/api/3/myself')).toBe(
        'https://cors-proxy.workers.dev/https://shb-bank.atlassian.net/rest/api/3/myself'
      );
    });
  });

  describe('sanitizeErrorMessage', () => {
    it('redacts sensitive API token from error messages', () => {
      expect(
        sanitizeErrorMessage(
          'Error connecting with token secret_token_xyz123 to server',
          'secret_token_xyz123'
        )
      ).toBe('Error connecting with token [REDACTED] to server');
    });

    it('handles missing token or non-matching message safely', () => {
      expect(sanitizeErrorMessage('Generic 404 Not Found', undefined)).toBe('Generic 404 Not Found');
      expect(sanitizeErrorMessage('Generic 404 Not Found', '')).toBe('Generic 404 Not Found');
      expect(sanitizeErrorMessage('Unrelated message', 'another_token')).toBe('Unrelated message');
    });
  });

  describe('callJiraApi', () => {
    it('sends Basic Auth header with base64 encoded email:apiToken', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ accountId: '123', displayName: 'Dev SHB' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await callJiraApi<{ accountId: string; displayName: string }>(
        baseConfig,
        '/rest/api/3/myself'
      );

      expect(result).toEqual({ accountId: '123', displayName: 'Dev SHB' });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, init] = mockFetch.mock.calls[0];
      const expectedCredentials = btoa(
        unescape(encodeURIComponent(`${baseConfig.email}:${baseConfig.apiToken}`))
      );
      expect(init.headers.Authorization).toBe(`Basic ${expectedCredentials}`);
      expect(init.headers.Accept).toBe('application/json');
    });

    it('handles 204 No Content response gracefully', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await callJiraApi(baseConfig, '/rest/api/3/issue/SHB-1/transitions', {
        method: 'POST',
      });
      expect(result).toEqual({});
    });

    it('throws CORS_BLOCKED on TypeError when corsProxy is not configured', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
      vi.stubGlobal('fetch', mockFetch);

      await expect(callJiraApi(baseConfig, '/rest/api/3/myself')).rejects.toThrow('CORS_BLOCKED');
    });

    it('throws network error message on TypeError when corsProxy is configured', async () => {
      const configWithProxy: JiraConfig = {
        ...baseConfig,
        corsProxy: 'https://proxy.example.com/',
      };
      const mockFetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
      vi.stubGlobal('fetch', mockFetch);

      await expect(callJiraApi(configWithProxy, '/rest/api/3/myself')).rejects.toThrow(
        'Không thể kết nối đến máy chủ Jira hoặc CORS Proxy.'
      );
    });

    it('extracts Jira errorMessages and errors from non-ok responses', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          errorMessages: ['Issue does not exist'],
          errors: { resolution: 'Resolution is required' },
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await expect(callJiraApi(baseConfig, '/rest/api/3/issue/SHB-999')).rejects.toThrow(
        'Issue does not exist, Resolution is required'
      );
    });
  });

  describe('testJiraConnection', () => {
    it('calls GET /rest/api/3/myself and returns JiraMyselfResponse', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          accountId: 'shb-acc-001',
          displayName: 'Nguyen Van A',
          emailAddress: 'vana@shb.com.vn',
          active: true,
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const user = await testJiraConnection(baseConfig);
      expect(user.displayName).toBe('Nguyen Van A');
      expect(user.emailAddress).toBe('vana@shb.com.vn');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://shb-bank.atlassian.net/rest/api/3/myself',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringMatching(/^Basic /),
          }),
        })
      );
    });
  });
});
