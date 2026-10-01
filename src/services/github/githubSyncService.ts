import type { TaskPlannerDatabase } from '../../db';
import type { BackupEnvelope } from '../../types/backup';
import type { EncryptedEnvelope } from '../crypto/types';
import { exportBackupPayload } from '../backup/exportBackup';
import { validateBackupPayload } from '../backup/validateBackup';
import { encryptPayload, decryptPayload } from '../crypto/webCrypto';
import { utf8ToBase64, base64ToUtf8 } from '../crypto/base64';
import { fetchRemoteBackupMetadata, uploadEncryptedBackup } from './githubApi';
import type { GitHubConfig, UploadBackupResult, PullBackupResult } from './types';

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

export type GitHubPullErrorCode =
  | 'NOT_FOUND'
  | 'INVALID_ENVELOPE'
  | 'PASSPHRASE_REQUIRED'
  | 'DECRYPT_FAILED'
  | 'VALIDATION_FAILED';

export class GitHubPullError extends Error {
  public readonly code: GitHubPullErrorCode;
  public readonly rawEncryptedJson?: string | undefined;
  public readonly remoteSha?: string | undefined;
  public readonly validationErrors?: Array<{ table: string; field: string; message: string }> | undefined;

  constructor(
    code: GitHubPullErrorCode,
    message: string,
    options?: {
      rawEncryptedJson?: string | undefined;
      remoteSha?: string | undefined;
      validationErrors?: Array<{ table: string; field: string; message: string }> | undefined;
    }
  ) {
    super(message);
    this.name = 'GitHubPullError';
    this.code = code;
    this.rawEncryptedJson = options?.rawEncryptedJson;
    this.remoteSha = options?.remoteSha;
    this.validationErrors = options?.validationErrors;
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
    await db.settings.put({ key: 'github_auto_sync_last_run_at', value: encryptedEnvelope.exportedAt });
    await db.settings.delete('github_auto_sync_dirty_since');
    await db.settings.delete('github_auto_sync_missed_due_at');
    await db.settings.delete('github_auto_sync_last_error');
  });

  return {
    sha: uploadResult.sha,
    commitSha: uploadResult.commitSha,
    exportedAt: encryptedEnvelope.exportedAt,
  };
}

/**
 * Orchestrates pull, decryption, and validation of remote encrypted backup from GitHub.
 * 1. Checks existence and downloads Base64 content via GET request (D-09)
 * 2. Decodes Base64 to JSON and verifies EncryptedEnvelope markers (D-10)
 * 3. Requires passphrase; decrypts with AES-GCM-256 via Web Crypto (D-14)
 * 4. Validates structural and referential integrity via Phase 6 validation engine (D-13)
 * 5. Returns parsed BackupEnvelope with remoteSha and raw JSON without modifying local database (D-15, D-16)
 */
export async function executeGitHubBackupPull(
  config: GitHubConfig,
  token: string,
  passphrase?: string
): Promise<PullBackupResult> {
  if (!token) {
    throw new Error('Chưa cung cấp GitHub Personal Access Token');
  }

  // 1. Fetch remote backup file metadata
  const meta = await fetchRemoteBackupMetadata(config, token);
  if (!meta.exists || !meta.contentBase64) {
    throw new GitHubPullError('NOT_FOUND', 'Chưa có bản sao lưu trên GitHub');
  }

  // 2. Decode Base64 to raw UTF-8 JSON
  let rawJson: string;
  try {
    rawJson = base64ToUtf8(meta.contentBase64);
  } catch {
    throw new GitHubPullError(
      'INVALID_ENVELOPE',
      'Không thể giải mã nội dung Base64 từ GitHub',
      { remoteSha: meta.sha }
    );
  }

  // 3. Parse and validate EncryptedEnvelope
  let envelope: EncryptedEnvelope;
  try {
    envelope = JSON.parse(rawJson) as EncryptedEnvelope;
  } catch {
    throw new GitHubPullError(
      'INVALID_ENVELOPE',
      'Định dạng tệp mã hóa không hợp lệ: tệp không phải JSON',
      { rawEncryptedJson: rawJson, remoteSha: meta.sha }
    );
  }

  if (
    !envelope ||
    typeof envelope !== 'object' ||
    envelope.app !== 'personal-task-planner' ||
    envelope.format !== 'encrypted-v1'
  ) {
    throw new GitHubPullError(
      'INVALID_ENVELOPE',
      'Định dạng tệp mã hóa không hợp lệ: app hoặc format không đúng',
      { rawEncryptedJson: rawJson, remoteSha: meta.sha }
    );
  }

  // 4. Check passphrase existence
  if (!passphrase) {
    throw new GitHubPullError(
      'PASSPHRASE_REQUIRED',
      'Cần mật khẩu để giải mã bản sao lưu',
      { rawEncryptedJson: rawJson, remoteSha: meta.sha }
    );
  }

  // 5. Attempt decryption
  let plaintextJson: string;
  try {
    plaintextJson = await decryptPayload(envelope, passphrase);
  } catch {
    throw new GitHubPullError(
      'DECRYPT_FAILED',
      'Mật khẩu giải mã không chính xác hoặc tệp sao lưu đã bị thay đổi.',
      { rawEncryptedJson: rawJson, remoteSha: meta.sha }
    );
  }

  // 6. Parse plaintext into BackupEnvelope
  let payload: BackupEnvelope;
  try {
    payload = JSON.parse(plaintextJson) as BackupEnvelope;
  } catch {
    throw new GitHubPullError(
      'VALIDATION_FAILED',
      'Dữ liệu sau khi giải mã không phải là JSON hợp lệ',
      { rawEncryptedJson: rawJson, remoteSha: meta.sha }
    );
  }

  // 7. Validate schema and referential integrity
  const validation = validateBackupPayload(payload);
  if (!validation.valid || !validation.envelope) {
    throw new GitHubPullError(
      'VALIDATION_FAILED',
      'Tệp sao lưu không vượt qua kiểm tra cấu trúc và tính toàn vẹn',
      {
        rawEncryptedJson: rawJson,
        remoteSha: meta.sha,
        validationErrors: validation.errors,
      }
    );
  }

  return {
    payload: validation.envelope,
    remoteSha: meta.sha || '',
    exportedAt: envelope.exportedAt,
    rawEncryptedJson: rawJson,
  };
}

/**
 * Triggers browser download of raw encrypted JSON envelope for offline diagnostics (D-16).
 */
export function downloadRawEncryptedBackup(
  rawJson: string,
  filename: string = 'backup-corrupted.enc.json'
): void {
  const blob = new Blob([rawJson], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

