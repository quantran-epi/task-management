import type { GitHubConfig, RemoteFileMetadata } from './types';

export const BACKUP_FILE_PATH = '.task-management/backup.enc.json';
export const GIT_DATA_API_THRESHOLD_BYTES = 1024 * 1024; // 1MB threshold for Git Data API upload

/**
 * Sanitizes error messages by removing any accidental inclusion of bearer tokens.
 */
function sanitizeErrorMessage(errorMsg: string, token: string): string {
  if (!token) return errorMsg;
  return errorMsg.replaceAll(token, '[REDACTED]');
}

/**
 * Uploads large backup files via GitHub Git Data API (blob -> ref -> commit -> tree -> commit -> ref).
 * Used when payload exceeds 1MB or when Contents API encounters 502/504 gateway errors.
 */
export async function uploadViaGitDataApi(
  config: GitHubConfig,
  token: string,
  contentBase64: string,
  message: string
): Promise<{ sha: string; commitSha: string }> {
  const baseUrl = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`;
  const jsonHeaders = {
    Accept: 'application/vnd.github.v3+json',
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  const getHeaders = {
    Accept: 'application/vnd.github.v3+json',
    Authorization: `Bearer ${token}`,
  };

  try {
    // Step A: POST /repos/{owner}/{repo}/git/blobs
    const blobRes = await fetch(`${baseUrl}/git/blobs`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({
        content: contentBase64,
        encoding: 'base64',
      }),
    });

    if (!blobRes.ok) {
      const errBody = (await blobRes.json().catch(() => ({}))) as { message?: string };
      throw new Error(errBody.message || `Git Blobs API failed: HTTP ${blobRes.status}`);
    }
    const blobData = (await blobRes.json()) as { sha: string };
    const blobSha = blobData.sha;

    // Step B: GET /repos/{owner}/{repo}/git/ref/heads/{branch}
    const refRes = await fetch(`${baseUrl}/git/ref/heads/${config.branch}`, {
      headers: getHeaders,
    });

    if (!refRes.ok) {
      const errBody = (await refRes.json().catch(() => ({}))) as { message?: string };
      throw new Error(errBody.message || `Git Ref API failed: HTTP ${refRes.status}`);
    }
    const refData = (await refRes.json()) as { object: { sha: string } };
    const parentCommitSha = refData.object.sha;

    // Step C: GET /repos/{owner}/{repo}/git/commits/{parentCommitSha}
    const commitRes = await fetch(`${baseUrl}/git/commits/${parentCommitSha}`, {
      headers: getHeaders,
    });

    if (!commitRes.ok) {
      const errBody = (await commitRes.json().catch(() => ({}))) as { message?: string };
      throw new Error(errBody.message || `Git Commit API failed: HTTP ${commitRes.status}`);
    }
    const commitData = (await commitRes.json()) as { tree: { sha: string } };
    const baseTreeSha = commitData.tree.sha;

    // Step D: POST /repos/{owner}/{repo}/git/trees
    const treeRes = await fetch(`${baseUrl}/git/trees`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: [
          {
            path: BACKUP_FILE_PATH,
            mode: '100644',
            type: 'blob',
            sha: blobSha,
          },
        ],
      }),
    });

    if (!treeRes.ok) {
      const errBody = (await treeRes.json().catch(() => ({}))) as { message?: string };
      throw new Error(errBody.message || `Git Trees API failed: HTTP ${treeRes.status}`);
    }
    const treeData = (await treeRes.json()) as { sha: string };
    const newTreeSha = treeData.sha;

    // Step E: POST /repos/{owner}/{repo}/git/commits
    const newCommitRes = await fetch(`${baseUrl}/git/commits`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({
        message,
        tree: newTreeSha,
        parents: [parentCommitSha],
      }),
    });

    if (!newCommitRes.ok) {
      const errBody = (await newCommitRes.json().catch(() => ({}))) as { message?: string };
      throw new Error(errBody.message || `Git Create Commit API failed: HTTP ${newCommitRes.status}`);
    }
    const newCommitData = (await newCommitRes.json()) as { sha: string };
    const newCommitSha = newCommitData.sha;

    // Step F: PATCH /repos/{owner}/{repo}/git/refs/heads/{branch}
    const patchRefRes = await fetch(`${baseUrl}/git/refs/heads/${config.branch}`, {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify({
        sha: newCommitSha,
        force: false,
      }),
    });

    if (patchRefRes.status === 409 || patchRefRes.status === 422) {
      throw new Error('CONFLICT_409');
    }

    if (!patchRefRes.ok) {
      const errBody = (await patchRefRes.json().catch(() => ({}))) as { message?: string };
      throw new Error(errBody.message || `Git Update Ref failed: HTTP ${patchRefRes.status}`);
    }

    return {
      sha: blobSha,
      commitSha: newCommitSha,
    };
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'CONFLICT_409') {
        throw err;
      }
      err.message = sanitizeErrorMessage(err.message, token);
      throw err;
    }
    throw new Error('Lỗi không xác định khi tải lên qua Git Data API');
  }
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
      // Diagnostic check: verify if the repository itself or branch is accessible
      try {
        const repoUrl = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`;
        const repoRes = await fetch(repoUrl, {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            Authorization: `Bearer ${token}`,
          },
        });
        if (repoRes && repoRes.status === 404) {
          throw new Error(
            `Không tìm thấy kho lưu trữ "${config.owner}/${config.repo}" hoặc Token không có quyền truy cập kho này. Vui lòng kiểm tra lại quyền PAT.`
          );
        }
        if (repoRes && repoRes.ok) {
          const branchUrl = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/branches/${encodeURIComponent(config.branch)}`;
          const branchRes = await fetch(branchUrl, {
            headers: {
              Accept: 'application/vnd.github.v3+json',
              Authorization: `Bearer ${token}`,
            },
          });
          if (branchRes && branchRes.status === 404) {
            throw new Error(
              `Kho lưu trữ "${config.owner}/${config.repo}" không tồn tại nhánh "${config.branch}". Vui lòng kiểm tra lại cấu hình nhánh.`
            );
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && (err.message.includes('kho lưu trữ') || err.message.includes('nhánh'))) {
          throw err;
        }
      }

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

    let contentBase64 = data.content ? data.content.replace(/\s+/g, '') : undefined;

    // GitHub Contents API omits `content` if file is > 1MB. Fall back to Git Blobs API (supports up to 100MB).
    if (!contentBase64 && data.sha) {
      try {
        const blobUrl = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/git/blobs/${data.sha}`;
        const blobRes = await fetch(blobUrl, {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            Authorization: `Bearer ${token}`,
          },
        });
        if (blobRes && blobRes.ok) {
          const blobData = (await blobRes.json()) as { content?: string };
          if (blobData.content) {
            contentBase64 = blobData.content.replace(/\s+/g, '');
          }
        }
      } catch {
        // Fall back to undefined if blob retrieval fails
      }
    }

    const lastModifiedHeader = response.headers.get('last-modified');

    return {
      exists: true,
      sha: data.sha,
      size: data.size,
      contentBase64,
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
  // Payloads exceeding 1MB threshold bypass Contents API to prevent gateway timeouts (BACKUP-GITDATA-03)
  if (contentBase64.length > GIT_DATA_API_THRESHOLD_BYTES) {
    return uploadViaGitDataApi(config, token, contentBase64, message);
  }

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

    // Fallback to Git Data API on 500 Internal Server Error, 502 Bad Gateway, or 504 Gateway Timeout
    if (response.status === 500 || response.status === 502 || response.status === 504) {
      return await uploadViaGitDataApi(config, token, contentBase64, message);
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
): Promise<{ ok: boolean; message: string; remoteSha?: string | undefined; fileExists: boolean }> {
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
