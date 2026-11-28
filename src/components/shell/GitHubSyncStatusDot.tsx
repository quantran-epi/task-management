import React from 'react';
import { Badge, Tooltip, Typography } from '../ui';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { useGitHubAuth } from '../../context/GitHubAuthContext';
import { type AutoSyncRetryState } from '../../hooks/useGitHubAutoSync';

const { Text } = Typography;

export type SyncStatusKind = 'off' | 'paused' | 'error' | 'dirty' | 'synced';

export interface DerivedSyncStatus {
  kind: SyncStatusKind;
  label: string;
  tooltip: string;
}

export interface DeriveSyncStatusInput {
  hasToken: boolean;
  enabled: boolean;
  dirtySince?: string | undefined;
  retryState?: AutoSyncRetryState | undefined;
  lastError?: string | undefined;
}

/** Single source of sync truth — shared by the shell dot and the status bar. */
export function deriveSyncStatus({
  hasToken,
  enabled,
  dirtySince,
  retryState,
  lastError,
}: DeriveSyncStatusInput): DerivedSyncStatus {
  if (!hasToken || !enabled) {
    return { kind: 'off', label: 'Tắt', tooltip: 'Đồng bộ GitHub: chưa bật hoặc chưa có token' };
  }
  if (retryState?.isPaused) {
    const reasonText =
      retryState.pauseReason === 'conflict'
        ? 'Tạm dừng do xung đột dữ liệu trên GitHub'
        : retryState.pauseReason === 'auth_error'
          ? 'Lỗi xác thực GitHub PAT (401/403)'
          : 'Tự động đồng bộ bị tạm dừng';
    return { kind: 'paused', label: 'Tạm dừng', tooltip: `Đồng bộ GitHub: ${reasonText}` };
  }
  if (retryState?.nextRetryAt && retryState.consecutiveFailures > 0) {
    return {
      kind: 'error',
      label: 'Lỗi',
      tooltip: `Đồng bộ GitHub: Lỗi kết nối (thử lại sau). ${lastError || ''}`,
    };
  }
  if (dirtySince) {
    return { kind: 'dirty', label: 'Chưa đồng bộ', tooltip: 'Đồng bộ GitHub: Có thay đổi chưa đồng bộ' };
  }
  return { kind: 'synced', label: 'Đã đồng bộ', tooltip: 'Đồng bộ GitHub: Dữ liệu đã khớp an toàn' };
}

export interface GitHubSyncStatusDotProps {
  db?: TaskPlannerDatabase;
}

export const GitHubSyncStatusDot: React.FC<GitHubSyncStatusDotProps> = ({ db = defaultDb }) => {
  const { hasToken } = useGitHubAuth();

  const syncState = useLiveQuery(async () => {
    const [enabledRec, dirtySinceRec, retryStateRec, lastErrorRec] = await Promise.all([
      db.settings.get('github_auto_sync_enabled'),
      db.settings.get('github_auto_sync_dirty_since'),
      db.settings.get('github_auto_sync_state'),
      db.settings.get('github_auto_sync_last_error'),
    ]);

    return {
      enabled: enabledRec?.value === true,
      dirtySince: (dirtySinceRec?.value as string) || undefined,
      retryState: (retryStateRec?.value as AutoSyncRetryState) || undefined,
      lastError: (lastErrorRec?.value as string) || undefined,
    };
  }, [db]);

  const status = deriveSyncStatus({
    hasToken,
    enabled: syncState?.enabled ?? false,
    dirtySince: syncState?.dirtySince,
    retryState: syncState?.retryState,
    lastError: syncState?.lastError,
  });

  if (status.kind === 'off') {
    return null;
  }

  const renderIndicator = (badge: React.ReactNode, tooltipText: string) => (
    <Tooltip title={tooltipText}>
      <span
        data-testid="github-sync-status"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--gap-6)',
          cursor: 'pointer',
        }}
      >
        {badge}
        <Text data-testid="github-sync-status-label" style={{ fontSize: 'var(--font-size-small)' }}>
          GitHub
        </Text>
      </span>
    </Tooltip>
  );

  const badgeStatus =
    status.kind === 'paused' || status.kind === 'error'
      ? 'danger'
      : status.kind === 'dirty'
        ? 'warning'
        : 'success';
  return renderIndicator(<Badge status={badgeStatus} />, status.tooltip);
};
