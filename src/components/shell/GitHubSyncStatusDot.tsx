import React from 'react';
import { Badge, Tooltip } from 'antd';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { useGitHubAuth } from '../../context/GitHubAuthContext';
import { type AutoSyncRetryState } from '../../hooks/useGitHubAutoSync';

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

  if (!hasToken || !syncState?.enabled) {
    return null;
  }

  const { dirtySince, retryState, lastError } = syncState;

  // 1. Error / Conflict state -> Red dot
  if (retryState?.isPaused) {
    const reasonText =
      retryState.pauseReason === 'conflict'
        ? 'Tạm dừng do xung đột dữ liệu trên GitHub'
        : retryState.pauseReason === 'auth_error'
          ? 'Lỗi xác thực GitHub PAT (401/403)'
          : 'Tự động đồng bộ bị tạm dừng';
    return (
      <Tooltip title={`Đồng bộ GitHub: ${reasonText}`}>
        <Badge status="error" style={{ cursor: 'pointer' }} />
      </Tooltip>
    );
  }

  // 2. Retry with consecutive errors -> Red / Warning dot
  if (retryState?.nextRetryAt && retryState.consecutiveFailures > 0) {
    return (
      <Tooltip
        title={`Đồng bộ GitHub: Lỗi kết nối (thử lại sau). ${lastError || ''}`}
      >
        <Badge status="error" style={{ cursor: 'pointer' }} />
      </Tooltip>
    );
  }

  // 3. Dirty pending changes -> Orange dot
  if (dirtySince) {
    return (
      <Tooltip title="Đồng bộ GitHub: Có thay đổi chưa đồng bộ">
        <Badge status="warning" style={{ cursor: 'pointer' }} />
      </Tooltip>
    );
  }

  // 4. All synced -> Green dot
  return (
    <Tooltip title="Đồng bộ GitHub: Dữ liệu đã khớp an toàn">
      <Badge status="success" style={{ cursor: 'pointer' }} />
    </Tooltip>
  );
};
