import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchRemoteBackupMetadata,
  uploadEncryptedBackup,
  uploadViaGitDataApi,
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

    it('directly uses Git Data API when base64 payload size exceeds 1MB', async () => {
      const largePayload = 'A'.repeat(1024 * 1024 + 10); // > 1MB

      // Mock the 6 Git Data API steps
      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({ sha: 'blob_large_sha' }),
        } as Response) // Step A: blob
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ object: { sha: 'parent_commit_sha' } }),
        } as Response) // Step B: ref
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ tree: { sha: 'base_tree_sha' } }),
        } as Response) // Step C: commit tree
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({ sha: 'new_tree_sha' }),
        } as Response) // Step D: tree
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({ sha: 'new_commit_sha' }),
        } as Response) // Step E: create commit
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ object: { sha: 'new_commit_sha' } }),
        } as Response); // Step F: update ref

      const result = await uploadEncryptedBackup(config, token, largePayload);

      expect(result).toEqual({
        sha: 'blob_large_sha',
        commitSha: 'new_commit_sha',
      });

      // Verify Contents API PUT was NOT called (first call was /git/blobs)
      expect(fetch).toHaveBeenCalledWith(
        `https://api.github.com/repos/test-user/test-repo/git/blobs`,
        expect.anything()
      );
    });

    it('falls back to Git Data API when Contents API PUT fails with HTTP 502 Bad Gateway', async () => {
      const smallPayload = 'smallPayload';

      // Call 1: Contents API PUT returns 502 Bad Gateway
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => ({ message: 'Bad Gateway' }),
      } as Response);

      // Calls 2-7: 6 Git Data API steps
      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({ sha: 'fallback_blob_sha' }),
        } as Response) // Step A: blob
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ object: { sha: 'parent_commit_sha' } }),
        } as Response) // Step B: ref
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ tree: { sha: 'base_tree_sha' } }),
        } as Response) // Step C: commit tree
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({ sha: 'new_tree_sha' }),
        } as Response) // Step D: tree
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({ sha: 'fallback_commit_sha' }),
        } as Response) // Step E: create commit
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ object: { sha: 'fallback_commit_sha' } }),
        } as Response); // Step F: update ref

      const result = await uploadEncryptedBackup(config, token, smallPayload);

      expect(result).toEqual({
        sha: 'fallback_blob_sha',
        commitSha: 'fallback_commit_sha',
      });

      // First call was to Contents API
      expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
        `https://api.github.com/repos/test-user/test-repo/contents/${BACKUP_FILE_PATH}`
      );
      // Second call was to Git Blobs API (fallback)
      expect(vi.mocked(fetch).mock.calls[1]?.[0]).toBe(
        `https://api.github.com/repos/test-user/test-repo/git/blobs`
      );
    });

    it('falls back to Git Data API when Contents API PUT fails with HTTP 504 Gateway Timeout or 500', async () => {
      const smallPayload = 'smallPayload';

      // Call 1: Contents API returns 504
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 504,
        json: async () => ({ message: 'Gateway Timeout' }),
      } as Response);

      // Calls 2-7: 6 Git Data API steps
      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({ sha: 'timeout_blob_sha' }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ object: { sha: 'parent_commit_sha' } }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ tree: { sha: 'base_tree_sha' } }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({ sha: 'new_tree_sha' }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({ sha: 'timeout_commit_sha' }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ object: { sha: 'timeout_commit_sha' } }),
        } as Response);

      const result = await uploadEncryptedBackup(config, token, smallPayload);
      expect(result.sha).toBe('timeout_blob_sha');
      expect(result.commitSha).toBe('timeout_commit_sha');
    });
  });

  describe('uploadViaGitDataApi', () => {
    it('executes full 6-step Git Data API upload flow and updates ref with force: false', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({ sha: 'blob_sha_123' }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ object: { sha: 'parent_commit_456' } }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ tree: { sha: 'base_tree_789' } }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({ sha: 'new_tree_101' }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({ sha: 'new_commit_202' }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ object: { sha: 'new_commit_202' } }),
        } as Response);

      const result = await uploadViaGitDataApi(
        config,
        token,
        'base64data',
        'chore: automated test backup'
      );

      expect(result).toEqual({
        sha: 'blob_sha_123',
        commitSha: 'new_commit_202',
      });

      // Verify Step A: blob creation
      expect(fetch).toHaveBeenNthCalledWith(
        1,
        'https://api.github.com/repos/test-user/test-repo/git/blobs',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ content: 'base64data', encoding: 'base64' }),
        })
      );

      // Verify Step B: query branch ref
      expect(fetch).toHaveBeenNthCalledWith(
        2,
        'https://api.github.com/repos/test-user/test-repo/git/ref/heads/main',
        expect.anything()
      );

      // Verify Step C: query parent commit
      expect(fetch).toHaveBeenNthCalledWith(
        3,
        'https://api.github.com/repos/test-user/test-repo/git/commits/parent_commit_456',
        expect.anything()
      );

      // Verify Step D: create tree with BACKUP_FILE_PATH
      expect(fetch).toHaveBeenNthCalledWith(
        4,
        'https://api.github.com/repos/test-user/test-repo/git/trees',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            base_tree: 'base_tree_789',
            tree: [
              {
                path: BACKUP_FILE_PATH,
                mode: '100644',
                type: 'blob',
                sha: 'blob_sha_123',
              },
            ],
          }),
        })
      );

      // Verify Step E: create commit
      expect(fetch).toHaveBeenNthCalledWith(
        5,
        'https://api.github.com/repos/test-user/test-repo/git/commits',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            message: 'chore: automated test backup',
            tree: 'new_tree_101',
            parents: ['parent_commit_456'],
          }),
        })
      );

      // Verify Step F: update ref with force: false
      expect(fetch).toHaveBeenNthCalledWith(
        6,
        'https://api.github.com/repos/test-user/test-repo/git/refs/heads/main',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            sha: 'new_commit_202',
            force: false,
          }),
        })
      );
    });

    it('throws CONFLICT_409 if ref update returns HTTP 422 or HTTP 409', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({ sha: 'blob_sha_123' }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ object: { sha: 'parent_commit_456' } }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ tree: { sha: 'base_tree_789' } }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({ sha: 'new_tree_101' }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({ sha: 'new_commit_202' }),
        } as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 422,
          json: async () => ({ message: 'Update is not a fast forward' }),
        } as Response);

      await expect(
        uploadViaGitDataApi(config, token, 'data', 'message')
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
