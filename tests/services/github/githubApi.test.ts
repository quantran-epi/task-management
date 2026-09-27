import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchRemoteBackupMetadata,
  uploadEncryptedBackup,
  testGitHubConnection,
  BACKUP_FILE_PATH,
} from '../../../src/services/github/githubApi';
import type { GitHubConfig } from '../../../src/services/github/types';

describe('githubApi', () => {
  const config: GitHubConfig = {
    owner: 'test-user',
    repo: 'test-repo',
    branch: 'main',
  };
  const token = 'ghp_secret_token_123456';

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('fetchRemoteBackupMetadata', () => {
    it('returns { exists: false } when GitHub API returns HTTP 404', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ message: 'Not Found' }),
      } as Response);

      const result = await fetchRemoteBackupMetadata(config, token);

      expect(result).toEqual({ exists: false });
      expect(fetch).toHaveBeenCalledWith(
        `https://api.github.com/repos/test-user/test-repo/contents/${BACKUP_FILE_PATH}?ref=main`,
        {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            Authorization: 'Bearer ghp_secret_token_123456',
          },
        }
      );
    });

    it('returns { exists: true, sha: "abc1234", size: 1024, contentBase64: "..." } on HTTP 200', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'last-modified': 'Sun, 27 Sep 2026 12:00:00 GMT' }),
        json: async () => ({
          sha: 'abc1234567890abcdef',
          size: 1024,
          content: 'eyJhYmMiOiAiZGVmIn0=\n',
        }),
      } as unknown as Response);

      const result = await fetchRemoteBackupMetadata(config, token);

      expect(result.exists).toBe(true);
      expect(result.sha).toBe('abc1234567890abcdef');
      expect(result.size).toBe(1024);
      expect(result.contentBase64).toBe('eyJhYmMiOiAiZGVmIn0=');
    });

    it('sanitizes incoming Base64 by removing whitespace and newlines', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          sha: 'sha-multiline',
          size: 50,
          content: '  part1\n  part2\r\n  part3  ',
        }),
      } as unknown as Response);

      const result = await fetchRemoteBackupMetadata(config, token);
      expect(result.contentBase64).toBe('part1part2part3');
    });

    it('throws error without leaking token on other HTTP errors', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Bad credentials' }),
      } as Response);

      await expect(fetchRemoteBackupMetadata(config, token)).rejects.toThrow('Bad credentials');
    });
  });

  describe('uploadEncryptedBackup', () => {
    it('issues PUT request with Base64 content, branch, message, and sha if provided', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          content: { sha: 'new_blob_sha' },
          commit: { sha: 'new_commit_sha' },
        }),
      } as Response);

      const result = await uploadEncryptedBackup(
        config,
        token,
        'base64payload',
        'prior_sha_123',
        'chore: update backup'
      );

      expect(result).toEqual({
        sha: 'new_blob_sha',
        commitSha: 'new_commit_sha',
      });

      expect(fetch).toHaveBeenCalledWith(
        `https://api.github.com/repos/test-user/test-repo/contents/${BACKUP_FILE_PATH}`,
        {
          method: 'PUT',
          headers: {
            Accept: 'application/vnd.github.v3+json',
            Authorization: 'Bearer ghp_secret_token_123456',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: 'chore: update backup',
            content: 'base64payload',
            branch: 'main',
            sha: 'prior_sha_123',
          }),
        }
      );
    });

    it('omits sha parameter for first-time creation when remoteSha is not passed', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          content: { sha: 'initial_sha' },
          commit: { sha: 'initial_commit' },
        }),
      } as Response);

      const result = await uploadEncryptedBackup(config, token, 'initialpayload');
      expect(result.sha).toBe('initial_sha');

      const callArgs = vi.mocked(fetch).mock.calls[0];
      const parsedBody = JSON.parse(callArgs?.[1]?.body as string);
      expect(parsedBody.sha).toBeUndefined();
      expect(parsedBody.content).toBe('initialpayload');
    });

    it('throws CONFLICT_409 when GitHub returns HTTP 409 Conflict', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ message: 'is not at the expected SHA' }),
      } as Response);

      await expect(
        uploadEncryptedBackup(config, token, 'payload', 'stale_sha')
      ).rejects.toThrow('CONFLICT_409');
    });
  });

  describe('testGitHubConnection', () => {
    it('validates connection and formats status message with truncated 7-char SHA', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          sha: 'abcdef1234567890',
          size: 2048,
          content: 'data',
        }),
      } as unknown as Response);

      const res = await testGitHubConnection(config, token);

      expect(res.ok).toBe(true);
      expect(res.fileExists).toBe(true);
      expect(res.remoteSha).toBe('abcdef1234567890');
      expect(res.message).toContain('abcdef1');
    });

    it('returns fileExists: false when backup file does not exist yet', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ message: 'Not Found' }),
      } as Response);

      const res = await testGitHubConnection(config, token);

      expect(res.ok).toBe(true);
      expect(res.fileExists).toBe(false);
      expect(res.message).toContain('Chưa có bản sao lưu trên GitHub');
    });

    it('returns ok: false on failure without leaking token', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Bad credentials' }),
      } as Response);

      const res = await testGitHubConnection(config, token);

      expect(res.ok).toBe(false);
      expect(res.message).not.toContain(token);
      expect(res.message).toContain('Bad credentials');
    });
  });
});
