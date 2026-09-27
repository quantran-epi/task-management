import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TaskPlannerDatabase } from '../../../src/db/index';
import {
  executeGitHubBackupPush,
  GitHubSyncConflictError,
} from '../../../src/services/github/githubSyncService';
import * as githubApi from '../../../src/services/github/githubApi';
import type { GitHubConfig } from '../../../src/services/github/types';

vi.mock('../../../src/services/github/githubApi', async (importOriginal) => {
  const actual = await importOriginal<typeof githubApi>();
  return {
    ...actual,
    fetchRemoteBackupMetadata: vi.fn(),
    uploadEncryptedBackup: vi.fn(),
  };
});

describe('githubSyncService', () => {
  let testDb: TaskPlannerDatabase;

  const config: GitHubConfig = {
    owner: 'user',
    repo: 'my-tasks',
    branch: 'main',
  };
  const token = 'ghp_valid_token';
  const passphrase = 'test-passphrase-secure-123';

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase('TestSyncDb_' + Math.random().toString(36).slice(2));
    await testDb.open();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('throws error if token or passphrase is empty', async () => {
    await expect(
      executeGitHubBackupPush(testDb, config, '', passphrase)
    ).rejects.toThrow('Chưa cung cấp GitHub Personal Access Token');

    await expect(
      executeGitHubBackupPush(testDb, config, token, '')
    ).rejects.toThrow('Chưa cung cấp mật khẩu mã hóa');
  });

  it('performs first-time push when remote does not exist (HTTP 404)', async () => {
    vi.mocked(githubApi.fetchRemoteBackupMetadata).mockResolvedValueOnce({
      exists: false,
    });
    vi.mocked(githubApi.uploadEncryptedBackup).mockResolvedValueOnce({
      sha: 'new_blob_sha_123',
      commitSha: 'new_commit_sha_456',
    });

    const result = await executeGitHubBackupPush(testDb, config, token, passphrase);

    expect(result.sha).toBe('new_blob_sha_123');
    expect(result.commitSha).toBe('new_commit_sha_456');
    expect(result.exportedAt).toBeDefined();

    // Verify upload was called with remoteSha undefined
    expect(githubApi.uploadEncryptedBackup).toHaveBeenCalledWith(
      config,
      token,
      expect.any(String),
      undefined
    );

    // Verify metadata saved to db.settings
    const savedSha = await testDb.settings.get('last_synced_sha');
    const savedAt = await testDb.settings.get('last_synced_at');
    expect(savedSha?.value).toBe('new_blob_sha_123');
    expect(savedAt?.value).toBe(result.exportedAt);

    // Verify export was logged to db.backupMetadata
    const backupLogs = await testDb.backupMetadata.toArray();
    expect(backupLogs.length).toBeGreaterThan(0);
  });

  it('pushes successfully when remote exists and matches expectedRemoteSha', async () => {
    vi.mocked(githubApi.fetchRemoteBackupMetadata).mockResolvedValueOnce({
      exists: true,
      sha: 'known_remote_sha',
      size: 1024,
    });
    vi.mocked(githubApi.uploadEncryptedBackup).mockResolvedValueOnce({
      sha: 'updated_blob_sha_789',
      commitSha: 'updated_commit_sha_101',
    });

    const result = await executeGitHubBackupPush(
      testDb,
      config,
      token,
      passphrase,
      'known_remote_sha'
    );

    expect(result.sha).toBe('updated_blob_sha_789');
    expect(githubApi.uploadEncryptedBackup).toHaveBeenCalledWith(
      config,
      token,
      expect.any(String),
      'known_remote_sha'
    );
  });

  it('throws CONFLICT_SHA_MISMATCH when remote SHA differs from expectedRemoteSha', async () => {
    vi.mocked(githubApi.fetchRemoteBackupMetadata).mockResolvedValueOnce({
      exists: true,
      sha: 'different_remote_sha',
      size: 2048,
    });

    await expect(
      executeGitHubBackupPush(
        testDb,
        config,
        token,
        passphrase,
        'my_old_local_sha',
        false
      )
    ).rejects.toThrow(GitHubSyncConflictError);

    expect(githubApi.uploadEncryptedBackup).not.toHaveBeenCalled();
  });

  it('allows push when forceOverwrite is true even if remote SHA differs', async () => {
    vi.mocked(githubApi.fetchRemoteBackupMetadata).mockResolvedValueOnce({
      exists: true,
      sha: 'remote_newer_sha',
      size: 2048,
    });
    vi.mocked(githubApi.uploadEncryptedBackup).mockResolvedValueOnce({
      sha: 'forced_blob_sha',
      commitSha: 'forced_commit_sha',
    });

    const result = await executeGitHubBackupPush(
      testDb,
      config,
      token,
      passphrase,
      'my_stale_sha',
      true // forceOverwrite
    );

    expect(result.sha).toBe('forced_blob_sha');
    expect(githubApi.uploadEncryptedBackup).toHaveBeenCalledWith(
      config,
      token,
      expect.any(String),
      'remote_newer_sha'
    );
  });

  it('catches CONFLICT_409 and wraps in GitHubSyncConflictError', async () => {
    vi.mocked(githubApi.fetchRemoteBackupMetadata).mockResolvedValueOnce({
      exists: true,
      sha: 'initial_sha',
      size: 1024,
    });
    vi.mocked(githubApi.uploadEncryptedBackup).mockRejectedValueOnce(
      new Error('CONFLICT_409')
    );

    try {
      await executeGitHubBackupPush(
        testDb,
        config,
        token,
        passphrase,
        'initial_sha',
        false
      );
      expect.fail('Should have thrown GitHubSyncConflictError');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(GitHubSyncConflictError);
      expect((err as GitHubSyncConflictError).code).toBe('CONFLICT_409');
    }
  });
});
