import type { TaskPlannerDatabase } from '../../db';
import { exportBackupPayload } from '../backup/exportBackup';
import { encryptPayload } from '../crypto/webCrypto';
import { utf8ToBase64 } from '../crypto/base64';
import { fetchRemoteBackupMetadata, uploadEncryptedBackup } from './githubApi';
import type { GitHubConfig, UploadBackupResult } from './types';

export class GitHubSyncConflictError extends Error {
  public readonly code: 'CONFLICT_SHA_MISMATCH' | 'CONFLICT_409';
  public readonly remoteSha?: string | undefined;
  public readonly localSha?: string | undefined;

  constructor(
    code: 'CONFLICT_SHA_MISMATCH' | 'CONFLICT_409',
    message: string,
    remoteSha?: string | undefined,
    localSha?: string | undefined
  ) {
    super(message);
    this.name = 'GitHubSyncConflictError';
    this.code = code;
    this.remoteSha = remoteSha;
    this.localSha = localSha;
  }
}

/**
 * Orchestrates manual push of encrypted backup to GitHub.
 * 1. Pre-flight check via GET for existence and active blob SHA (D-06)
 * 2. Compares remote SHA with expectedRemoteSha; halts on mismatch if not forceOverwrite (D-06, D-07)
 * 3. Exports domain tables into uncompressed standard BackupEnvelope (D-13)
 * 4. Encrypts payload with AES-GCM-256 and PBKDF2 (D-10, D-11)
 * 5. Uploads Base64 JSON payload to GitHub via PUT request (D-09)
 * 6. Records last_synced_sha and last_synced_at into db.settings and logs history (D-17)
 */
export async function executeGitHubBackupPush(
  db: TaskPlannerDatabase,
  config: GitHubConfig,
  token: string,
  passphrase: string,
  expectedRemoteSha?: string,
  forceOverwrite: boolean = false
): Promise<UploadBackupResult> {
  if (!token) {
    throw new Error('Chưa cung cấp GitHub Personal Access Token');
  }
  if (!passphrase) {
    throw new Error('Chưa cung cấp mật khẩu mã hóa');
  }

  // 1. Pre-flight check (D-06)
  const meta = await fetchRemoteBackupMetadata(config, token);

  // 2. Conflict check (D-06, D-07)
  if (meta.exists && meta.sha && !forceOverwrite) {
    if (expectedRemoteSha && meta.sha !== expectedRemoteSha) {
      throw new GitHubSyncConflictError(
        'CONFLICT_SHA_MISMATCH',
        'Bản sao lưu trên GitHub đã thay đổi kể từ lần đồng bộ trước (SHA không khớp)',
        meta.sha,
        expectedRemoteSha
      );
    }
  }

  // 3. Export local domain data (D-13)
  const envelope = await exportBackupPayload(db);

  // 4. Encrypt payload (D-10, D-11)
  const encryptedEnvelope = await encryptPayload(JSON.stringify(envelope), passphrase);

  // 5. Encode to Base64 and upload to GitHub (D-09, D-12)
  const jsonString = JSON.stringify(encryptedEnvelope);
  const base64Content = utf8ToBase64(jsonString);

  let uploadResult: { sha: string; commitSha: string };
  try {
    uploadResult = await uploadEncryptedBackup(
      config,
      token,
      base64Content,
      meta.exists ? meta.sha : undefined
    );
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'CONFLICT_409') {
      throw new GitHubSyncConflictError(
        'CONFLICT_409',
        'Xung đột ghi đồng thời trên GitHub (HTTP 409 Conflict)',
        meta.sha,
        expectedRemoteSha
      );
    }
    throw err;
  }

  // 6. Record metadata in IndexedDB settings (D-17)
  await db.transaction('rw', db.settings, async () => {
    await db.settings.put({ key: 'last_synced_sha', value: uploadResult.sha });
    await db.settings.put({ key: 'last_synced_at', value: encryptedEnvelope.exportedAt });
  });

  return {
    sha: uploadResult.sha,
    commitSha: uploadResult.commitSha,
    exportedAt: encryptedEnvelope.exportedAt,
  };
}
