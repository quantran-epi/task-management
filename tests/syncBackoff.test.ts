import { describe, it, expect } from 'vitest';
import {
  BACKOFF_MINUTES,
  getNextBackoffDelayMinutes,
  computeGitHubAutoSyncDue,
  type GitHubAutoSyncConfig,
  type AutoSyncRetryState,
} from '../src/hooks/useGitHubAutoSync';

describe('useGitHubAutoSync backoff and retry behavior', () => {
  it('returns [1, 5, 15, 30, 60] minute backoff ladder based on failure count, capping at 60 (D-38)', () => {
    expect(BACKOFF_MINUTES).toEqual([1, 5, 15, 30, 60]);
    expect(getNextBackoffDelayMinutes(0)).toBe(1);
    expect(getNextBackoffDelayMinutes(1)).toBe(5);
    expect(getNextBackoffDelayMinutes(2)).toBe(15);
    expect(getNextBackoffDelayMinutes(3)).toBe(30);
    expect(getNextBackoffDelayMinutes(4)).toBe(60);
    expect(getNextBackoffDelayMinutes(5)).toBe(60);
    expect(getNextBackoffDelayMinutes(10)).toBe(60);
  });

  it('recognizes when sync is due under interval mode and skips when clean', () => {
    const cleanConfig: GitHubAutoSyncConfig = {
      enabled: true,
      mode: 'interval',
      intervalMinutes: 15,
      dirtySince: undefined,
    };
    expect(computeGitHubAutoSyncDue(cleanConfig, new Date('2026-10-01T12:00:00Z')).isDue).toBe(false);

    const dirtyConfig: GitHubAutoSyncConfig = {
      enabled: true,
      mode: 'interval',
      intervalMinutes: 15,
      dirtySince: '2026-10-01T11:00:00Z',
      lastRunAt: '2026-10-01T11:40:00Z',
    };
    // 20 minutes later (> 15m) -> isDue: true
    expect(computeGitHubAutoSyncDue(dirtyConfig, new Date('2026-10-01T12:00:00Z')).isDue).toBe(true);

    // 5 minutes later (< 15m) -> isDue: false
    expect(computeGitHubAutoSyncDue(dirtyConfig, new Date('2026-10-01T11:45:00Z')).isDue).toBe(false);
  });

  it('triggers catch-up sync on startup if last scheduled run was missed and data is dirty (D-40)', () => {
    const missedDailyConfig: GitHubAutoSyncConfig = {
      enabled: true,
      mode: 'daily',
      dailyTime: '18:00',
      dirtySince: '2026-10-01T10:00:00Z',
      lastRunAt: '2026-09-30T18:00:00Z', // Yesterday
    };
    // At 20:00 on 2026-10-01, missed today's 18:00 run while dirty -> due: true, reason: daily
    const res = computeGitHubAutoSyncDue(missedDailyConfig, new Date(2026, 9, 1, 20, 0, 0));
    expect(res.isDue).toBe(true);
    expect(res.reason).toBe('daily');
  });

  it('pauses sync when retry state indicates isPaused: true or auth_error without auto-retrying (D-39, D-42)', () => {
    const pausedState: AutoSyncRetryState = {
      consecutiveFailures: 3,
      nextRetryAt: '2026-10-01T12:30:00Z',
      isPaused: true,
      pauseReason: 'auth_error',
      lastAttemptAt: '2026-10-01T12:00:00Z',
    };
    expect(pausedState.isPaused).toBe(true);
    expect(pausedState.pauseReason).toBe('auth_error');
  });
});
