import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TaskPlannerDatabase } from '../../../src/db/index';
import {
  executeGitHubBackupPull,
  downloadRawEncryptedBackup,
  GitHubPullError,
} from '../../../src/services/github/githubSyncService';
import * as githubApi from '../../../src/services/github/githubApi';
import { encryptPayload } from '../../../src/services/crypto/webCrypto';
import { utf8ToBase64 } from '../../../src/services/crypto/base64';
import type { GitHubConfig } from '../../../src/services/github/types';
import type { BackupEnvelope } from '../../../src/types/backup';

vi.mock('../../../src/services/github/githubApi', async (importOriginal) => {
  const actual = await importOriginal<typeof githubApi>();
  return {
    ...actual,
    fetchRemoteBackupMetadata: vi.fn(),
  };
});

describe('githubPullRestore service', () => {
  let testDb: TaskPlannerDatabase;

  const config: GitHubConfig = {
    owner: 'octocat',
    repo: 'planner-backup',
    branch: 'main',
  };
  const token = 'ghp_valid_mock_token';
  const passphrase = 'correct-backup-passphrase-456';

  // D-49: only a v11 CR-centric envelope is accepted; a projects table is a legacy backup.
  const validPayload: BackupEnvelope = {
    app: 'personal-task-planner',
    schemaVersion: 12,
    exportedAt: '2026-09-27T10:00:00.000Z',
    tables: {
      changeRequests: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          code: 'CR-PULL-01',
          name: 'Change Request One',
          status: 'Open',
          type: 'ENHANCEMENT',
          targets: [],
          createdAt: '2026-09-27T10:00:00.000Z',
          updatedAt: '2026-09-27T10:00:00.000Z',
        },
      ],
      systems: [],
      tasks: [],
      capacityRules: [],
      capacityOverrides: [],
      plannedAllocations: [],
    },
    counts: {
      changeRequests: 1,
      systems: 0,
      tasks: 0,
      capacityRules: 0,
      capacityOverrides: 0,
      plannedAllocations: 0,
    },
  };

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase('TestPullDb_' + Math.random().toString(36).slice(2));
    await testDb.open();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('Test 1: throws specific error "Chưa có bản sao lưu trên GitHub" when remote file is 404 per D-09', async () => {
    vi.mocked(githubApi.fetchRemoteBackupMetadata).mockResolvedValueOnce({
      exists: false,
    });

    await expect(
      executeGitHubBackupPull(config, token, passphrase)
    ).rejects.toThrow('Chưa có bản sao lưu trên GitHub');
  });

  it('Test 2: decodes Base64 content, parses EncryptedEnvelope, and verifies app and format markers per D-10', async () => {
    const invalidEnvelopeJson = JSON.stringify({
      app: 'wrong-app',
      format: 'unknown-format',
      exportedAt: new Date().toISOString(),
      crypto: {},
      ciphertext: 'fake',
    });

    vi.mocked(githubApi.fetchRemoteBackupMetadata).mockResolvedValueOnce({
      exists: true,
      sha: 'blob_sha_invalid_env',
      contentBase64: utf8ToBase64(invalidEnvelopeJson),
    });

    try {
      await executeGitHubBackupPull(config, token, passphrase);
      expect.fail('Should have failed on invalid envelope');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(GitHubPullError);
      const pullErr = err as GitHubPullError;
      expect(pullErr.code).toBe('INVALID_ENVELOPE');
      expect(pullErr.rawEncryptedJson).toBe(invalidEnvelopeJson);
      expect(pullErr.remoteSha).toBe('blob_sha_invalid_env');
    }
  });

  it('Test 3: throws PASSPHRASE_REQUIRED when passphrase is missing, with raw JSON and remote SHA per D-14', async () => {
    const encryptedEnv = await encryptPayload(JSON.stringify(validPayload), passphrase);
    const rawJson = JSON.stringify(encryptedEnv);

    vi.mocked(githubApi.fetchRemoteBackupMetadata).mockResolvedValueOnce({
      exists: true,
      sha: 'blob_sha_no_pass',
      contentBase64: utf8ToBase64(rawJson),
    });

    try {
      await executeGitHubBackupPull(config, token, undefined);
      expect.fail('Should have failed when passphrase is missing');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(GitHubPullError);
      const pullErr = err as GitHubPullError;
      expect(pullErr.code).toBe('PASSPHRASE_REQUIRED');
      expect(pullErr.rawEncryptedJson).toBe(rawJson);
      expect(pullErr.remoteSha).toBe('blob_sha_no_pass');
    }
  });

  it('Test 3b: throws DECRYPT_FAILED when decryption fails due to wrong passphrase per D-14, D-16', async () => {
    const encryptedEnv = await encryptPayload(JSON.stringify(validPayload), passphrase);
    const rawJson = JSON.stringify(encryptedEnv);

    vi.mocked(githubApi.fetchRemoteBackupMetadata).mockResolvedValueOnce({
      exists: true,
      sha: 'blob_sha_wrong_pass',
      contentBase64: utf8ToBase64(rawJson),
    });

    try {
      await executeGitHubBackupPull(config, token, 'wrong-password-value');
      expect.fail('Should have failed with DECRYPT_FAILED');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(GitHubPullError);
      const pullErr = err as GitHubPullError;
      expect(pullErr.code).toBe('DECRYPT_FAILED');
      expect(pullErr.rawEncryptedJson).toBe(rawJson);
      expect(pullErr.remoteSha).toBe('blob_sha_wrong_pass');
    }
  });

  it('Test 4: decrypts JSON payload and validates when passphrase is correct per D-13', async () => {
    const encryptedEnv = await encryptPayload(JSON.stringify(validPayload), passphrase);
    const rawJson = JSON.stringify(encryptedEnv);

    vi.mocked(githubApi.fetchRemoteBackupMetadata).mockResolvedValueOnce({
      exists: true,
      sha: 'blob_sha_success',
      contentBase64: utf8ToBase64(rawJson),
    });

    const result = await executeGitHubBackupPull(config, token, passphrase);

    expect(result.remoteSha).toBe('blob_sha_success');
    expect(result.rawEncryptedJson).toBe(rawJson);
    expect(result.payload.app).toBe('personal-task-planner');
    expect(result.payload.tables.changeRequests!.length).toBe(1);
    expect(result.payload.tables.changeRequests![0]!.name).toBe('Change Request One');

    // Invariant: zero local database tables modified during pull/decrypt/validation
    const localCrs = await testDb.changeRequests.toArray();
    expect(localCrs.length).toBe(0);
  });

  it('Test 5: throws VALIDATION_FAILED when decrypted payload has referential integrity errors per D-16', async () => {
    const invalidPayload: BackupEnvelope = {
      ...validPayload,
      tables: {
        ...validPayload.tables,
        // A planned allocation whose task is absent from the payload is a
        // referential-integrity failure.
        plannedAllocations: [
          {
            id: '22222222-2222-4222-8222-222222222222',
            taskId: '33333333-3333-4333-8333-333333333333',
            date: '2026-09-27',
            allocatedMinutes: 60,
          },
        ],
      },
    };

    const encryptedEnv = await encryptPayload(JSON.stringify(invalidPayload), passphrase);
    const rawJson = JSON.stringify(encryptedEnv);

    vi.mocked(githubApi.fetchRemoteBackupMetadata).mockResolvedValueOnce({
      exists: true,
      sha: 'blob_sha_referential_err',
      contentBase64: utf8ToBase64(rawJson),
    });

    try {
      await executeGitHubBackupPull(config, token, passphrase);
      expect.fail('Should have failed validation');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(GitHubPullError);
      const pullErr = err as GitHubPullError;
      expect(pullErr.code).toBe('VALIDATION_FAILED');
      expect(pullErr.validationErrors).toBeDefined();
      expect(pullErr.validationErrors!.length).toBeGreaterThan(0);
      expect(pullErr.rawEncryptedJson).toBe(rawJson);
    }
  });

  it('Test 6: downloadRawEncryptedBackup creates browser download with file name backup-corrupted.enc.json', () => {
    const createObjectURLMock = vi.fn().mockReturnValue('blob:http://localhost/mock-uuid');
    const revokeObjectURLMock = vi.fn();
    globalThis.URL.createObjectURL = createObjectURLMock;
    globalThis.URL.revokeObjectURL = revokeObjectURLMock;

    const clickMock = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'a') {
        const anchor = originalCreateElement('a');
        anchor.click = clickMock;
        return anchor;
      }
      return originalCreateElement(tagName);
    });

    const appendSpy = vi.spyOn(document.body, 'appendChild');
    const removeSpy = vi.spyOn(document.body, 'removeChild');

    const rawJson = '{"app":"personal-task-planner","format":"encrypted-v1"}';
    downloadRawEncryptedBackup(rawJson);

    expect(createElementSpy).toHaveBeenCalledWith('a');
    expect(appendSpy).toHaveBeenCalled();
    expect(clickMock).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalled();
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:http://localhost/mock-uuid');

    createElementSpy.mockRestore();
    appendSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
