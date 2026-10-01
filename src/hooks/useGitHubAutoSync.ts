import { useEffect, useRef } from 'react';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import { useGitHubAuth } from '../context/GitHubAuthContext';
import {
  executeGitHubBackupPush,
  GitHubSyncConflictError,
} from '../services/github/githubSyncService';
import { flushLocalSqliteNow } from '../services/localSqlitePersistence';
import type { GitHubConfig } from '../services/github/types';

export const BACKOFF_MINUTES = [1, 5, 15, 30, 60] as const;

export function getNextBackoffDelayMinutes(attemptCount: number): number {
  const index = Math.min(Math.max(0, attemptCount), BACKOFF_MINUTES.length - 1);
  return BACKOFF_MINUTES[index] ?? 60;
}

export interface AutoSyncRetryState {
  consecutiveFailures: number;
  nextRetryAt?: string | undefined;
  isPaused: boolean;
  pauseReason?: 'conflict' | 'auth_error' | undefined;
  conflictRemoteSha?: string | undefined;
  lastAttemptAt?: string | undefined;
}

export interface GitHubAutoSyncConfig {
  enabled?: boolean | undefined;
  mode?: ('interval' | 'daily') | undefined;
  intervalMinutes?: number | undefined;
  dailyTime?: string | undefined; // HH:mm local time
  lastRunAt?: string | undefined;
  dirtySince?: string | undefined;
}

export interface AutoSyncDueResult {
  isDue: boolean;
  reason?: 'interval' | 'daily' | 'catchup' | 'retry';
  dueAt?: string;
}

export function computeGitHubAutoSyncDue(
  config: GitHubAutoSyncConfig,
  now: Date = new Date(),
  retryState?: AutoSyncRetryState | null
): AutoSyncDueResult {
  if (!config.enabled || !config.dirtySince) return { isDue: false };

  // Paused due to conflict or auth error
  if (retryState?.isPaused) return { isDue: false };

  // If in exponential backoff retry window
  if (retryState?.nextRetryAt) {
    const nextRetryMs = new Date(retryState.nextRetryAt).getTime();
    if (now.getTime() >= nextRetryMs) {
      return { isDue: true, reason: 'retry', dueAt: retryState.nextRetryAt };
    }
    return { isDue: false };
  }

  const mode = config.mode ?? 'interval';
  if (mode === 'daily') {
    const target = config.dailyTime || '18:00';
    const [targetH, targetM] = target.split(':').map((part) => Number(part) || 0);
    const scheduledToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      targetH ?? 18,
      targetM ?? 0,
      0,
      0
    );

    if (now.getTime() < scheduledToday.getTime()) return { isDue: false };
    if (!config.lastRunAt) {
      return { isDue: true, reason: 'daily', dueAt: scheduledToday.toISOString() };
    }

    const lastRun = new Date(config.lastRunAt);
    const ranToday =
      lastRun.getFullYear() === now.getFullYear() &&
      lastRun.getMonth() === now.getMonth() &&
      lastRun.getDate() === now.getDate() &&
      lastRun.getTime() >= scheduledToday.getTime();

    return ranToday
      ? { isDue: false }
      : { isDue: true, reason: 'daily', dueAt: scheduledToday.toISOString() };
  }

  const intervalMinutes = Math.max(1, config.intervalMinutes ?? 30);
  if (!config.lastRunAt) {
    return { isDue: true, reason: 'interval', dueAt: now.toISOString() };
  }

  const lastRunMs = new Date(config.lastRunAt).getTime();
  const nextDueMs = lastRunMs + intervalMinutes * 60 * 1000;
  if (now.getTime() >= nextDueMs) {
    return { isDue: true, reason: 'interval', dueAt: new Date(nextDueMs).toISOString() };
  }
  return { isDue: false };
}

export function useGitHubAutoSync({
  db = defaultDb,
}: {
  db?: TaskPlannerDatabase;
} = {}): void {
  const { token, passphrase } = useGitHubAuth();
  const inFlightRef = useRef(false);

  useEffect(() => {
    let timer: number | undefined;

    const runSync = async (forceDue: boolean = false) => {
      if (inFlightRef.current || !token || !passphrase) return;

      const [
        ownerRec,
        repoRec,
        branchRec,
        lastShaRec,
        enabledRec,
        modeRec,
        intervalRec,
        dailyTimeRec,
        lastRunRec,
        dirtySinceRec,
        retryStateRec,
      ] = await Promise.all([
        db.settings.get('github_owner'),
        db.settings.get('github_repo'),
        db.settings.get('github_branch'),
        db.settings.get('last_synced_sha'),
        db.settings.get('github_auto_sync_enabled'),
        db.settings.get('github_auto_sync_mode'),
        db.settings.get('github_auto_sync_interval_minutes'),
        db.settings.get('github_auto_sync_daily_time'),
        db.settings.get('github_auto_sync_last_run_at'),
        db.settings.get('github_auto_sync_dirty_since'),
        db.settings.get('github_auto_sync_state'),
      ]);

      const owner = typeof ownerRec?.value === 'string' ? ownerRec.value.trim() : '';
      const repo = typeof repoRec?.value === 'string' ? repoRec.value.trim() : '';
      const branch = typeof branchRec?.value === 'string' ? branchRec.value.trim() : 'main';
      if (!owner || !repo) return;

      const retryState = (retryStateRec?.value as AutoSyncRetryState) || {
        consecutiveFailures: 0,
        isPaused: false,
      };

      const config: GitHubAutoSyncConfig = {
        enabled: enabledRec?.value === true,
        mode: modeRec?.value === 'daily' ? 'daily' : 'interval',
        intervalMinutes: typeof intervalRec?.value === 'number' ? intervalRec.value : 30,
        dailyTime: typeof dailyTimeRec?.value === 'string' ? dailyTimeRec.value : '18:00',
        lastRunAt: typeof lastRunRec?.value === 'string' ? lastRunRec.value : undefined,
        dirtySince: typeof dirtySinceRec?.value === 'string' ? dirtySinceRec.value : undefined,
      };

      if (!forceDue) {
        const due = computeGitHubAutoSyncDue(config, new Date(), retryState);
        if (!due.isDue) return;
      }

      inFlightRef.current = true;
      const attemptAt = new Date().toISOString();
      await db.settings.put({ key: 'github_auto_sync_last_attempt_at', value: attemptAt });

      try {
        await flushLocalSqliteNow(db);
        const ghConfig: GitHubConfig = { owner, repo, branch };
        const lastSha = typeof lastShaRec?.value === 'string' ? lastShaRec.value : undefined;
        await executeGitHubBackupPush(db, ghConfig, token, passphrase, lastSha, false);

        // Success: clear dirty state, reset retry counters, clear error (D-41)
        const nowIso = new Date().toISOString();
        await db.transaction('rw', db.settings, async () => {
          await db.settings.delete('github_auto_sync_dirty_since');
          await db.settings.delete('github_auto_sync_last_error');
          await db.settings.delete('github_auto_sync_missed_due_at');
          await db.settings.put({
            key: 'github_auto_sync_state',
            value: {
              consecutiveFailures: 0,
              isPaused: false,
              lastAttemptAt: nowIso,
            } satisfies AutoSyncRetryState,
          });
        });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const nowIso = new Date().toISOString();

        if (err instanceof GitHubSyncConflictError) {
          // D-42: Remote SHA conflict pauses auto-sync immediately without overwriting remote
          await db.settings.put({
            key: 'github_auto_sync_state',
            value: {
              consecutiveFailures: retryState.consecutiveFailures,
              isPaused: true,
              pauseReason: 'conflict',
              conflictRemoteSha: err.remoteSha,
              lastAttemptAt: nowIso,
            } satisfies AutoSyncRetryState,
          });
          await db.settings.put({
            key: 'github_auto_sync_last_error',
            value: 'Phát hiện xung đột phiên bản trên GitHub (Remote SHA mismatch).',
          });
        } else if (
          errorMsg.includes('401') ||
          errorMsg.includes('403') ||
          errorMsg.toLowerCase().includes('bad credentials')
        ) {
          // D-39: Auth errors pause auto-sync without scheduling retry loops
          await db.settings.put({
            key: 'github_auto_sync_state',
            value: {
              consecutiveFailures: retryState.consecutiveFailures,
              isPaused: true,
              pauseReason: 'auth_error',
              lastAttemptAt: nowIso,
            } satisfies AutoSyncRetryState,
          });
          await db.settings.put({
            key: 'github_auto_sync_last_error',
            value: 'Lỗi xác thực GitHub PAT (401/403). Vui lòng cập nhật token mới.',
          });
        } else {
          // D-38: Network/timeout/5xx triggers exponential backoff
          const failures = (retryState.consecutiveFailures || 0) + 1;
          const delayMin = getNextBackoffDelayMinutes(retryState.consecutiveFailures || 0);
          const nextRetryAt = new Date(Date.now() + delayMin * 60 * 1000).toISOString();

          await db.settings.put({
            key: 'github_auto_sync_state',
            value: {
              consecutiveFailures: failures,
              nextRetryAt,
              isPaused: false,
              lastAttemptAt: nowIso,
            } satisfies AutoSyncRetryState,
          });
          await db.settings.put({
            key: 'github_auto_sync_last_error',
            value: errorMsg,
          });
        }
      } finally {
        inFlightRef.current = false;
      }
    };

    // Online event resets failure count and retries if data is dirty (D-39)
    const handleOnline = async () => {
      try {
        const stateRec = await db.settings.get('github_auto_sync_state');
        const state = (stateRec?.value as AutoSyncRetryState) || {
          consecutiveFailures: 0,
          isPaused: false,
        };

        if (state.pauseReason !== 'auth_error' && state.pauseReason !== 'conflict') {
          await db.settings.put({
            key: 'github_auto_sync_state',
            value: {
              consecutiveFailures: 0,
              isPaused: false,
              lastAttemptAt: state.lastAttemptAt,
            } satisfies AutoSyncRetryState,
          });
          void runSync(false);
        }
      } catch (err) {
        console.warn('Failed to handle online auto-sync reset:', err);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
    }

    void runSync(false);
    timer = window.setInterval(() => {
      void runSync(false);
    }, 60000);

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
      }
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [db, token, passphrase]);
}
