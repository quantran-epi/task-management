import { useEffect, useRef } from 'react';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import { useGitHubAuth } from '../context/GitHubAuthContext';
import { executeGitHubBackupPush } from '../services/github/githubSyncService';
import { flushLocalSqliteNow } from '../services/localSqlitePersistence';
import type { GitHubConfig } from '../services/github/types';

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
  reason?: 'interval' | 'daily' | 'catchup';
  dueAt?: string;
}

export function computeGitHubAutoSyncDue(
  config: GitHubAutoSyncConfig,
  now: Date = new Date()
): AutoSyncDueResult {
  if (!config.enabled || !config.dirtySince) return { isDue: false };

  const mode = config.mode ?? 'interval';
  if (mode === 'daily') {
    const target = config.dailyTime || '18:00';
    const [targetH, targetM] = target.split(':').map((part) => Number(part) || 0);
    const scheduledToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), targetH ?? 18, targetM ?? 0, 0, 0);

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

    return ranToday ? { isDue: false } : { isDue: true, reason: 'daily', dueAt: scheduledToday.toISOString() };
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

    const checkAndRun = async () => {
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
      ]);

      const owner = typeof ownerRec?.value === 'string' ? ownerRec.value.trim() : '';
      const repo = typeof repoRec?.value === 'string' ? repoRec.value.trim() : '';
      const branch = typeof branchRec?.value === 'string' ? branchRec.value.trim() : 'main';
      if (!owner || !repo) return;

      const config: GitHubAutoSyncConfig = {
        enabled: enabledRec?.value === true,
        mode: modeRec?.value === 'daily' ? 'daily' : 'interval',
        intervalMinutes: typeof intervalRec?.value === 'number' ? intervalRec.value : 30,
        dailyTime: typeof dailyTimeRec?.value === 'string' ? dailyTimeRec.value : '18:00',
        lastRunAt: typeof lastRunRec?.value === 'string' ? lastRunRec.value : undefined,
        dirtySince: typeof dirtySinceRec?.value === 'string' ? dirtySinceRec.value : undefined,
      };

      const due = computeGitHubAutoSyncDue(config);
      if (!due.isDue) return;

      inFlightRef.current = true;
      const attemptAt = new Date().toISOString();
      await db.settings.put({ key: 'github_auto_sync_last_attempt_at', value: attemptAt });

      try {
        await flushLocalSqliteNow(db);
        const ghConfig: GitHubConfig = { owner, repo, branch };
        const lastSha = typeof lastShaRec?.value === 'string' ? lastShaRec.value : undefined;
        await executeGitHubBackupPush(db, ghConfig, token, passphrase, lastSha, false);
      } catch (err: any) {
        await db.settings.put({
          key: 'github_auto_sync_last_error',
          value: err?.message || String(err),
        });
        if (due.dueAt) {
          await db.settings.put({ key: 'github_auto_sync_missed_due_at', value: due.dueAt });
        }
      } finally {
        inFlightRef.current = false;
      }
    };

    void checkAndRun();
    timer = window.setInterval(() => {
      void checkAndRun();
    }, 60000);

    return () => {
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [db, token, passphrase]);
}
