import { Tooltip, Typography } from 'antd';
import {
  DatabaseOutlined,
  CloudSyncOutlined,
  ApiOutlined,
  CheckCircleFilled,
} from '@ant-design/icons';
import { useTimer } from '../hooks/useTimer';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';

export interface StatusBarProps {
  knowledgeStatus?: 'connected' | 'disconnected' | 'disabled';
  syncStatus?: 'synced' | 'pending' | 'offline';
}

export function StatusBar({
  knowledgeStatus = 'connected',
  syncStatus = 'synced',
}: StatusBarProps) {
  const { activeTimers } = useTimer();

  const activeRunningTask = useLiveQuery(
    async () => {
      if (!activeTimers || activeTimers.length === 0) return null;
      const running = activeTimers.find((t) => t.status === 'running') ?? activeTimers[0];
      if (!running) return null;
      const task = await db.tasks.get(running.taskId);
      return task?.name ?? null;
    },
    [activeTimers],
    null
  );

  return (
    <footer
      role="contentinfo"
      aria-label="Workbench Status Bar"
      style={{
        height: 'var(--statusbar-height, 24px)',
        minHeight: 'var(--statusbar-height, 24px)',
        background: 'var(--bg-elev, #f7f8f9)',
        borderTop: '1px solid var(--border, #e9eaee)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 8px',
        fontSize: 11,
        color: 'var(--fg-secondary, #5f6269)',
        userSelect: 'none',
        boxSizing: 'border-box',
        zIndex: 10,
      }}
    >
      {/* Left: Active running task or ready indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <CheckCircleFilled style={{ color: 'var(--success, #338555)', fontSize: 10 }} />
          <Typography.Text
            style={{
              fontSize: 11,
              color: 'var(--fg-secondary, #5f6269)',
              maxWidth: 260,
            }}
            ellipsis
          >
            {activeRunningTask ? `Task: ${activeRunningTask}` : 'Ready'}
          </Typography.Text>
        </div>

        <Tooltip title="Local IndexedDB storage active">
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              color: 'var(--fg-muted, #6c707e)',
              cursor: 'default',
            }}
          >
            <DatabaseOutlined style={{ fontSize: 11 }} />
            <span>IndexedDB</span>
          </span>
        </Tooltip>
      </div>

      {/* Right: Knowledge daemon status & Sync status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* T-25.4-02: Display connection status indicators only, no tokens/secrets */}
        <Tooltip title={`Knowledge daemon: ${knowledgeStatus}`}>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              color:
                knowledgeStatus === 'connected'
                  ? 'var(--success, #338555)'
                  : 'var(--fg-muted, #6c707e)',
              cursor: 'default',
            }}
          >
            <ApiOutlined style={{ fontSize: 11 }} />
            <span>Knowledge</span>
          </span>
        </Tooltip>

        <Tooltip title={`Encrypted backup sync: ${syncStatus}`}>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              color:
                syncStatus === 'synced'
                  ? 'var(--success, #338555)'
                  : syncStatus === 'pending'
                  ? 'var(--warning, #a56906)'
                  : 'var(--fg-muted, #6c707e)',
              cursor: 'default',
            }}
          >
            <CloudSyncOutlined style={{ fontSize: 11 }} />
            <span style={{ textTransform: 'capitalize' }}>{syncStatus}</span>
          </span>
        </Tooltip>
      </div>
    </footer>
  );
}
