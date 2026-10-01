import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../src/db';
import { GitHubAuthProvider, useGitHubAuth } from '../../src/context/GitHubAuthContext';
import { computeGitHubAutoSyncDue, useGitHubAutoSync } from '../../src/hooks/useGitHubAutoSync';
import * as githubSyncService from '../../src/services/github/githubSyncService';

vi.mock('../../src/services/github/githubSyncService', async (importOriginal) => {
  const actual = await importOriginal<typeof githubSyncService>();
  return {
    ...actual,
    executeGitHubBackupPush: vi.fn(),
  };
});

describe('useGitHubAutoSync', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`test-auto-sync-${Date.now()}-${Math.random()}`);
    await db.open();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('computes due in interval mode when elapsed time exceeds interval', () => {
    const due = computeGitHubAutoSyncDue(
      {
        enabled: true,
        mode: 'interval',
        intervalMinutes: 15,
        lastRunAt: '2026-10-01T10:00:00.000Z',
        dirtySince: '2026-10-01T10:05:00.000Z',
      },
      new Date('2026-10-01T10:16:00.000Z')
    );
    expect(due.isDue).toBe(true);
  });

  it('computes due in daily mode when local scheduled time passed without today run', () => {
    const now = new Date('2026-10-01T18:30:00');
    const due = computeGitHubAutoSyncDue(
      {
        enabled: true,
        mode: 'daily',
        dailyTime: '18:00',
        lastRunAt: '2026-09-30T18:00:00.000Z',
        dirtySince: '2026-10-01T08:00:00.000Z',
      },
      now
    );
    expect(due.isDue).toBe(true);
  });

  it('does not push when dirty marker is missing even if schedule is due', async () => {
    await db.settings.bulkPut([
      { key: 'github_owner', value: 'alice' },
      { key: 'github_repo', value: 'tasks' },
      { key: 'github_branch', value: 'main' },
      { key: 'github_auto_sync_enabled', value: true },
      { key: 'github_auto_sync_mode', value: 'interval' },
      { key: 'github_auto_sync_interval_minutes', value: 5 },
      { key: 'github_auto_sync_last_run_at', value: '2026-10-01T00:00:00.000Z' },
    ]);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <GitHubAuthProvider>
        <AuthBridge token="ghp_token" passphrase="pass">
          {children}
        </AuthBridge>
      </GitHubAuthProvider>
    );

    renderHook(() => useGitHubAutoSync({ db }), { wrapper });

    await new Promise((r) => setTimeout(r, 20));
    expect(githubSyncService.executeGitHubBackupPush).not.toHaveBeenCalled();
  });

  it('pushes when dirty data exists and schedule is due', async () => {
    await db.settings.bulkPut([
      { key: 'github_owner', value: 'alice' },
      { key: 'github_repo', value: 'tasks' },
      { key: 'github_branch', value: 'main' },
      { key: 'github_auto_sync_enabled', value: true },
      { key: 'github_auto_sync_mode', value: 'interval' },
      { key: 'github_auto_sync_interval_minutes', value: 5 },
      { key: 'github_auto_sync_last_run_at', value: '2026-10-01T00:00:00.000Z' },
      { key: 'github_auto_sync_dirty_since', value: '2026-10-01T00:01:00.000Z' },
    ]);
    vi.mocked(githubSyncService.executeGitHubBackupPush).mockResolvedValueOnce({
      sha: 'new-sha',
      commitSha: 'commit-sha',
      exportedAt: '2026-10-01T12:00:00.000Z',
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <GitHubAuthProvider>
        <AuthBridge token="ghp_token" passphrase="pass">
          {children}
        </AuthBridge>
      </GitHubAuthProvider>
    );

    renderHook(() => useGitHubAutoSync({ db }), { wrapper });

    await waitFor(() => {
      expect(githubSyncService.executeGitHubBackupPush).toHaveBeenCalled();
    });
  });
});

function AuthBridge({
  children,
  token,
  passphrase,
}: {
  children: React.ReactNode;
  token: string;
  passphrase: string;
}) {
  const { setCredentials } = useGitHubAuth();
  setCredentials(token, passphrase);
  return <>{children}</>;
}
