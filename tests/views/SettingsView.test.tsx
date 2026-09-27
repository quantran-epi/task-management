import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../src/db';
import { GitHubAuthProvider, useGitHubAuth } from '../../src/context/GitHubAuthContext';
import { SettingsView } from '../../src/views/SettingsView';
import * as githubSyncService from '../../src/services/github/githubSyncService';
import * as ariaLive from '../../src/components/common/AriaLiveRegion';
import type { BackupEnvelope } from '../../src/types/backup';

vi.mock('../../src/services/github/githubSyncService', async (importOriginal) => {
  const actual = await importOriginal<typeof githubSyncService>();
  return {
    ...actual,
    executeGitHubBackupPush: vi.fn(),
    executeGitHubBackupPull: vi.fn(),
    downloadRawEncryptedBackup: vi.fn(),
  };
});

function AuthSetter({ token, passphrase }: { token?: string; passphrase?: string }) {
  const { setCredentials } = useGitHubAuth();
  React.useEffect(() => {
    if (token || passphrase) {
      setCredentials(token || '', passphrase || '');
    }
  }, [token, passphrase, setCredentials]);
  return null;
}

describe('SettingsView Integration & Offline Independence (SYNC-07, SYNC-05)', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`test-settings-view-${Date.now()}`);
    await db.open();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('renders capacity tab by default and switches to data tab displaying all local and GitHub cards', async () => {
    render(
      <GitHubAuthProvider>
        <SettingsView db={db} defaultActiveTab="data" />
      </GitHubAuthProvider>
    );

    // Verify local data management cards exist
    expect(screen.getByText('Sao lưu dữ liệu')).toBeInTheDocument();
    expect(screen.getByText('Nhập & Khôi phục dữ liệu')).toBeInTheDocument();
    expect(
      screen.getByText('Bản sao an toàn trước khi nhập (Pre-Import Snapshot)')
    ).toBeInTheDocument();

    // Verify GitHub sync cards exist
    expect(screen.getByText('Cấu hình đồng bộ GitHub (Tùy chọn)')).toBeInTheDocument();
    expect(screen.getByText('Đồng bộ sao lưu GitHub')).toBeInTheDocument();

    // Danger zone
    expect(screen.getByText('Khu vực nguy hiểm (Danger Zone)')).toBeInTheDocument();
  });

  it('operates 100% offline without GitHub token or internet (SYNC-07)', async () => {
    // Zero token, zero repo settings, completely unauthenticated
    render(
      <GitHubAuthProvider>
        <SettingsView db={db} defaultActiveTab="data" />
      </GitHubAuthProvider>
    );

    // Everything renders with zero blocking alerts or unhandled exceptions
    expect(screen.getByText('Chưa có token')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Xuất bản sao lưu \(JSON\)/i })).toBeEnabled();

    // Capacity tab works independently
    fireEvent.click(screen.getByRole('tab', { name: /Công suất làm việc/i }));
    await waitFor(() => {
      expect(screen.getByText('Mẫu công suất cơ bản hàng tuần')).toBeInTheDocument();
      expect(screen.getByText('Ngoại lệ theo ngày cụ thể')).toBeInTheDocument();
    });
  });

  it('coordinates remote pull into ImportPreviewModal and records last_synced_sha upon restore', async () => {
    const announceSpy = vi.spyOn(ariaLive, 'announceToScreenReader');

    await db.settings.put({ key: 'github_owner', value: 'octocat' });
    await db.settings.put({ key: 'github_repo', value: 'my-tasks' });

    const sampleRemotePayload: BackupEnvelope = {
      app: 'personal-task-planner',
      schemaVersion: 1,
      exportedAt: '2026-09-27T10:00:00.000Z',
      tables: {
        projects: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            name: 'Remote Pulled Project',
            status: 'Open',
            createdAt: '2026-09-27T10:00:00.000Z',
            updatedAt: '2026-09-27T10:00:00.000Z',
          },
        ],
        milestones: [],
        tasks: [],
        capacityRules: [],
        capacityOverrides: [],
        plannedAllocations: [],
      },
      counts: {
        projects: 1,
        milestones: 0,
        tasks: 0,
        capacityRules: 0,
        capacityOverrides: 0,
        plannedAllocations: 0,
      },
    };

    vi.mocked(githubSyncService.executeGitHubBackupPull).mockResolvedValueOnce({
      payload: sampleRemotePayload,
      remoteSha: 'remote_blob_sha_9999',
      exportedAt: '2026-09-27T10:00:00.000Z',
      rawEncryptedJson: '{"envelope":"raw"}',
    });

    render(
      <GitHubAuthProvider>
        <AuthSetter token="ghp_sample_token" passphrase="correct_passphrase" />
        <SettingsView db={db} defaultActiveTab="data" />
      </GitHubAuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Đã nạp vào bộ nhớ tạm')).toBeInTheDocument();
    });

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /Tải từ GitHub/i });
      expect(btn).toBeEnabled();
    });

    // 1. Click "Tải từ GitHub"
    fireEvent.click(screen.getByRole('button', { name: /Tải từ GitHub/i }));

    // 2. ImportPreviewModal opens with diff comparison
    await waitFor(() => {
      expect(screen.getByText('Xem trước & Xác nhận Khôi phục')).toBeInTheDocument();
      expect(screen.getByText('github:backup.enc.json')).toBeInTheDocument();
    });

    // 3. Confirm button disabled until RESTORE is typed
    expect(screen.getByRole('button', { name: /Xác nhận khôi phục/i })).toBeDisabled();

    const restoreInput = screen.getByLabelText('Xác nhận từ khóa RESTORE');
    fireEvent.change(restoreInput, { target: { value: 'RESTORE' } });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Xác nhận khôi phục/i })).toBeEnabled();
    });

    // 4. Click restore
    fireEvent.click(screen.getByRole('button', { name: /Xác nhận khôi phục/i }));

    // 5. Verify domain tables updated
    await waitFor(async () => {
      const projects = await db.projects.toArray();
      expect(projects).toHaveLength(1);
      expect(projects[0]?.name).toBe('Remote Pulled Project');
    });

    // 6. Verify last_synced_sha and last_synced_at saved in settings
    await waitFor(async () => {
      const savedSha = await db.settings.get('last_synced_sha');
      const savedAt = await db.settings.get('last_synced_at');
      expect(savedSha?.value).toBe('remote_blob_sha_9999');
      expect(savedAt?.value).toBe('2026-09-27T10:00:00.000Z');
    });

    // 7. Verify PostRestoreBanner is displayed with rollback option
    await waitFor(() => {
      expect(
        screen.getByText(/Toàn bộ dữ liệu từ tệp sao lưu đã được áp dụng vào hệ thống/i)
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Hoàn tác về bản trước đó/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Tải snapshot về máy/i })).toBeInTheDocument();
    });

    expect(announceSpy).toHaveBeenCalled();
  }, 15000);
});
