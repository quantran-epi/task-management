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
import { ActiveTimerWidget } from '../components/timer/ActiveTimerWidget';
import { useLayoutStore } from './store/layoutStore';

export interface StatusBarProps {
  knowledgeStatus?: 'connected' | 'disconnected' | 'disabled';
  syncStatus?: 'synced' | 'pending' | 'offline';
}

export function StatusBar({
  knowledgeStatus = 'connected',
  syncStatus = 'synced',
}: StatusBarProps) {
  const activeTabId = useLayoutStore((s) => s.activeTabId);
  const openTabs = useLayoutStore((s) => s.openTabs);
  const activeTab = openTabs.find((t) => t.id === activeTabId);

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
        height: 'var(--statusbar-height, 26px)',
        minHeight: 'var(--statusbar-height, 26px)',
        background: 'transparent',
        borderTop: '1px solid var(--border, #e9eaee)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        fontSize: 'var(--font-size-small, 12px)',
        color: 'var(--fg-secondary, #5f6269)',
        userSelect: 'none',
        boxSizing: 'border-box',
        zIndex: 10,
      }}
    >
      {/* Left: Active Center Item Focus & Storage Indicators */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <CheckCircleFilled style={{ color: 'var(--success, #338555)', fontSize: 11 }} />
          <Tooltip title={activeTab?.title ? `Active Item: ${activeTab.title}` : (activeRunningTask ? `Task: ${activeRunningTask}` : 'Ready')}>
            <Typography.Text
              style={{
                fontSize: 'var(--font-size-small, 12px)',
                color: 'var(--fg-secondary, #5f6269)',
                maxWidth: 260,
                display: 'inline-block',
              }}
              ellipsis
            >
              {activeTab?.title || (activeRunningTask ? `Task: ${activeRunningTask}` : 'Ready')}
            </Typography.Text>
          </Tooltip>
        </div>

        <Tooltip title="TaskMate Personal Planner Engine">
          <span
            style={{
              fontSize: 'var(--font-size-xs, 11px)',
              color: 'var(--fg-muted, #6c707e)',
              borderLeft: '1px solid var(--border-strong, #d1d3d9)',
              paddingLeft: 10,
            }}
          >
            TaskMate v1.3
          </span>
        </Tooltip>

        <Tooltip title="Local IndexedDB storage active & persistent">
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              color: 'var(--fg-muted, #6c707e)',
              cursor: 'default',
            }}
          >
            <DatabaseOutlined style={{ fontSize: 12 }} />
            <span>IndexedDB</span>
          </span>
        </Tooltip>

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
            <ApiOutlined style={{ fontSize: 12 }} />
            <span>Knowledge</span>
          </span>
        </Tooltip>
      </div>

      {/* Right: Active Timer Widget & Sync status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <ActiveTimerWidget compact />
        </div>

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
              borderLeft: '1px solid var(--border-strong, #d1d3d9)',
              paddingLeft: 10,
            }}
          >
            <CloudSyncOutlined style={{ fontSize: 12 }} />
            <span style={{ textTransform: 'capitalize' }}>{syncStatus}</span>
          </span>
        </Tooltip>
      </div>
    </footer>
  );
}
