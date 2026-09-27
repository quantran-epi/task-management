import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { TaskPlannerDatabase } from '../../../src/db';
import { GitHubAuthProvider, useGitHubAuth } from '../../../src/context/GitHubAuthContext';
import { GitHubSyncCard } from '../../../src/components/settings/GitHubSyncCard';
import * as githubApi from '../../../src/services/github/githubApi';
import * as githubSyncService from '../../../src/services/github/githubSyncService';

vi.mock('../../../src/services/github/githubApi', async (importOriginal) => {
  const actual = await importOriginal<typeof githubApi>();
  return {
    ...actual,
    testGitHubConnection: vi.fn(),
  };
});

vi.mock('../../../src/services/github/githubSyncService', async (importOriginal) => {
  const actual = await importOriginal<typeof githubSyncService>();
  return {
    ...actual,
    executeGitHubBackupPush: vi.fn(),
  };
});

function AuthSetter({ token, passphrase }: { token?: string; passphrase?: string }) {
  const { setCredentials } = useGitHubAuth();
  useEffect(() => {
    if (token || passphrase) {
      setCredentials(token || '', passphrase || '');
    }
  }, [token, passphrase, setCredentials]);
  return null;
}

describe('GitHubSyncCard', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`test-sync-card-${Date.now()}`);
    await db.open();
    vi.clearAllMocks();
  });

  it('renders card title, metadata descriptions and action buttons in disabled state when unauthenticated', async () => {
    render(
      <GitHubAuthProvider>
        <GitHubSyncCard db={db} />
      </GitHubAuthProvider>
    );

    expect(screen.getByText('Đồng bộ sao lưu GitHub')).toBeInTheDocument();
    expect(screen.getByText('Chưa có token')).toBeInTheDocument();
    expect(screen.getAllByText('Chưa đồng bộ').length).toBeGreaterThan(0);

    const pushBtn = screen.getByRole('button', { name: /Đẩy lên GitHub/i });
    const testBtn = screen.getByRole('button', { name: /Kiểm tra kết nối/i });

    expect(pushBtn).toBeDisabled();
    expect(testBtn).toBeDisabled();
  });

  it('enables action buttons when repository coordinates and credentials are provided', async () => {
    await db.settings.put({ key: 'github_owner', value: 'alice' });
    await db.settings.put({ key: 'github_repo', value: 'tasks' });

    render(
      <GitHubAuthProvider>
        <AuthSetter token="ghp_mock_token" passphrase="secure_passphrase" />
        <GitHubSyncCard db={db} />
      </GitHubAuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Đã nạp vào bộ nhớ tạm')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Đẩy lên GitHub/i })).toBeEnabled();
      expect(screen.getByRole('button', { name: /Kiểm tra kết nối/i })).toBeEnabled();
    });
  });

  it('handles test connection success and updates status badge to Đã kết nối', async () => {
    await db.settings.put({ key: 'github_owner', value: 'alice' });
    await db.settings.put({ key: 'github_repo', value: 'tasks' });

    vi.mocked(githubApi.testGitHubConnection).mockResolvedValueOnce({
      ok: true,
      message: 'Kết nối thành công! Bản sao lưu tồn tại (SHA: abc1234).',
      remoteSha: 'abc1234567',
      fileExists: true,
    });

    render(
      <GitHubAuthProvider>
        <AuthSetter token="ghp_mock_token" passphrase="secure_passphrase" />
        <GitHubSyncCard db={db} />
      </GitHubAuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Kiểm tra kết nối/i })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /Kiểm tra kết nối/i }));

    await waitFor(() => {
      expect(screen.getByText('Đã kết nối')).toBeInTheDocument();
    });
  });

  it('calls executeGitHubBackupPush when clicking Đẩy lên GitHub', async () => {
    await db.settings.put({ key: 'github_owner', value: 'alice' });
    await db.settings.put({ key: 'github_repo', value: 'tasks' });

    vi.mocked(githubSyncService.executeGitHubBackupPush).mockResolvedValueOnce({
      sha: 'new_sha_1234567',
      commitSha: 'commit_sha_123',
      exportedAt: '2026-09-27T12:00:00.000Z',
    });

    render(
      <GitHubAuthProvider>
        <AuthSetter token="ghp_mock_token" passphrase="secure_passphrase" />
        <GitHubSyncCard db={db} />
      </GitHubAuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Đẩy lên GitHub/i })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /Đẩy lên GitHub/i }));

    await waitFor(() => {
      expect(githubSyncService.executeGitHubBackupPush).toHaveBeenCalledWith(
        db,
        { owner: 'alice', repo: 'tasks', branch: 'main' },
        'ghp_mock_token',
        'secure_passphrase',
        undefined,
        false
      );
    });
  });

  it('opens GitHubConflictModal when executeGitHubBackupPush throws conflict', async () => {
    await db.settings.put({ key: 'github_owner', value: 'alice' });
    await db.settings.put({ key: 'github_repo', value: 'tasks' });

    vi.mocked(githubSyncService.executeGitHubBackupPush).mockRejectedValueOnce(
      new githubSyncService.GitHubSyncConflictError(
        'CONFLICT_SHA_MISMATCH',
        'SHA conflict',
        'remote_conflict_sha_123',
        'local_sha_456'
      )
    );

    render(
      <GitHubAuthProvider>
        <AuthSetter token="ghp_mock_token" passphrase="secure_passphrase" />
        <GitHubSyncCard db={db} />
      </GitHubAuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Đẩy lên GitHub/i })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /Đẩy lên GitHub/i }));

    await waitFor(() => {
      expect(screen.getByText('Xung đột bản sao lưu từ xa')).toBeInTheDocument();
      expect(screen.getByText(/remote_/)).toBeInTheDocument();
    });
  });
});
