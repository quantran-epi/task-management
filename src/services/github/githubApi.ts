import type { GitHubConfig, RemoteFileMetadata } from './types';

export const BACKUP_FILE_PATH = '.task-management/backup.enc.json';

/**
 * Sanitizes error messages by removing any accidental inclusion of bearer tokens.
 */
function sanitizeErrorMessage(errorMsg: string, token: string): string {
  if (!token) return errorMsg;
  return errorMsg.replaceAll(token, '[REDACTED]');
}

/**
 * Queries the remote backup file metadata on GitHub via GET request.
 * Returns exists: false on 404 per D-09 without throwing an error.
 */
export async function fetchRemoteBackupMetadata(
  config: GitHubConfig,
  token: string
): Promise<RemoteFileMetadata> {
  const url = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${BACKUP_FILE_PATH}?ref=${encodeURIComponent(config.branch)}`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 404) {
      return { exists: false };
    }

    if (!response.ok) {
      const errorBody = (await response.json().catch(() => ({}))) as { message?: string };
      const rawMessage = errorBody.message || `Lỗi GitHub API: HTTP ${response.status}`;
      throw new Error(sanitizeErrorMessage(rawMessage, token));
    }

    const data = (await response.json()) as {
      sha?: string;
      size?: number;
      content?: string;
    };

    const lastModifiedHeader = response.headers.get('last-modified');

    return {
      exists: true,
      sha: data.sha,
      size: data.size,
      contentBase64: data.content ? data.content.replace(/\s+/g, '') : undefined,
      lastModified: lastModifiedHeader ?? undefined,
    };
  } catch (err: unknown) {
    if (err instanceof Error) {
      err.message = sanitizeErrorMessage(err.message, token);
      throw err;
    }
    throw new Error('Không thể kết nối đến GitHub');
  }
}

/**
 * Uploads an encrypted backup payload to GitHub using PUT request.
 * If remoteSha is provided, GitHub verifies the file matches this SHA.
 * If remoteSha is omitted, GitHub creates the file (per D-09).
 * Throws 'CONFLICT_409' on HTTP 409 Conflict.
 */
export async function uploadEncryptedBackup(
  config: GitHubConfig,
  token: string,
  contentBase64: string,
  remoteSha?: string,
  message: string = 'chore: update encrypted task planner backup [skip ci]'
): Promise<{ sha: string; commitSha: string }> {
  const url = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${BACKUP_FILE_PATH}`;

  const body: Record<string, unknown> = {
    message,
    content: contentBase64,
    branch: config.branch,
  };

  if (remoteSha) {
    body.sha = remoteSha;
  }

  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (response.status === 409) {
      throw new Error('CONFLICT_409');
    }

    if (!response.ok) {
      const errorBody = (await response.json().catch(() => ({}))) as { message?: string };
      const rawMessage = errorBody.message || `Tải lên thất bại: HTTP ${response.status}`;
      throw new Error(sanitizeErrorMessage(rawMessage, token));
    }

    const result = (await response.json()) as {
      content: { sha: string };
      commit: { sha: string };
    };

    return {
      sha: result.content.sha,
      commitSha: result.commit.sha,
    };
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'CONFLICT_409') {
        throw err;
      }
      err.message = sanitizeErrorMessage(err.message, token);
      throw err;
    }
    throw new Error('Lỗi không xác định khi tải lên GitHub');
  }
}

/**
 * Pre-flight connection check verifying token validity, branch existence,
 * and remote backup status per D-05.
 */
export async function testGitHubConnection(
  config: GitHubConfig,
  token: string
): Promise<{ ok: boolean; message: string; remoteSha?: string; fileExists: boolean }> {
  try {
    const meta = await fetchRemoteBackupMetadata(config, token);
    if (!meta.exists) {
      return {
        ok: true,
        message: 'Kết nối thành công! Chưa có bản sao lưu trên GitHub (.task-management/backup.enc.json).',
        fileExists: false,
      };
    }

    const shortSha = meta.sha ? meta.sha.slice(0, 7) : 'N/A';
    return {
      ok: true,
      message: `Kết nối thành công! Bản sao lưu tồn tại (SHA: ${shortSha}).`,
      remoteSha: meta.sha,
      fileExists: true,
    };
  } catch (err: unknown) {
    const rawMsg = err instanceof Error ? err.message : 'Không thể kết nối đến GitHub';
    return {
      ok: false,
      message: sanitizeErrorMessage(rawMsg, token),
      fileExists: false,
    };
  }
}
