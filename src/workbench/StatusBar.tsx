import { useEffect, useState } from 'react';
import { Tooltip, Typography } from '../components/ui';
import { DatabaseOutlined, CloudSyncOutlined, ApiOutlined, CheckCircleFilled } from '../components/ui/icon';
import { useTimer } from '../hooks/useTimer';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { ActiveTimerWidget } from '../components/timer/ActiveTimerWidget';
import { ActiveAiTurnIndicator } from '../components/ai/ActiveAiTurnIndicator';
import { useLayoutStore } from './store/layoutStore';
import { useOptionalKnowledgeConfig } from '../services/knowledge/knowledgeConfig';
import { useGitHubAuth } from '../context/GitHubAuthContext';
import { deriveSyncStatus } from '../components/shell/GitHubSyncStatusDot';
import type { AutoSyncRetryState } from '../hooks/useGitHubAutoSync';

export type KnowledgeProbeStatus = 'checking' | 'connected' | 'disconnected' | 'disabled';

export interface KnowledgeProbeInput {
  ready: boolean;
  enabled: boolean;
  baseUrl: string;
}

const KNOWLEDGE_LIVENESS_PATH = '/api/v1/health/liveness';
const LIVENESS_TIMEOUT_MS = 3000;
const RETRY_FAIL_MS = 15000;
const RETRY_OK_MS = 60000;

/** Probe liveness without auth/token; never blocks render (starts at checking). */
export function useKnowledgeProbe({ ready, enabled, baseUrl }: KnowledgeProbeInput): KnowledgeProbeStatus {
  const [status, setStatus] = useState<KnowledgeProbeStatus>('checking');

  useEffect(() => {
    if (!ready) {
      setStatus('checking');
      return;
    }
    if (!enabled || !baseUrl) {
      setStatus('disabled');
      return;
    }

    let active = true;
    let retryId: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;

    const scheduleRetry = (delay: number) => {
      retryId = setTimeout(() => {
        if (active) {
          setStatus('checking');
          void probe();
        }
      }, delay);
    };

    const probe = async () => {
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), LIVENESS_TIMEOUT_MS);
      try {
        const response = await fetch(`${baseUrl}${KNOWLEDGE_LIVENESS_PATH}`, {
          signal: controller.signal,
        });
        if (!active) return;
        if (response.ok) {
          setStatus('connected');
          scheduleRetry(RETRY_OK_MS);
        } else {
          setStatus('disconnected');
          scheduleRetry(RETRY_FAIL_MS);
        }
      } catch {
        if (!active) return;
        setStatus('disconnected');
        scheduleRetry(RETRY_FAIL_MS);
      } finally {
        clearTimeout(timeout);
      }
    };

    void probe();
    return () => {
      active = false;
      controller?.abort();
      if (retryId) clearTimeout(retryId);
    };
  }, [ready, enabled, baseUrl]);

  return status;
}

export interface StatusBarProps {
  knowledgeStatus?: KnowledgeProbeStatus;
}

export function StatusBar({ knowledgeStatus: knowledgeStatusOverride }: StatusBarProps) {
  const { ready, enabled, baseUrl } = useOptionalKnowledgeConfig();
  const probedStatus = useKnowledgeProbe({ ready, enabled, baseUrl });
  const knowledgeStatus = knowledgeStatusOverride ?? probedStatus;
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
  }, []);
  const sync = deriveSyncStatus({
    hasToken,
    enabled: syncState?.enabled ?? false,
    dirtySince: syncState?.dirtySince,
    retryState: syncState?.retryState,
    lastError: syncState?.lastError,
  });

  const knowledgeLabels: Record<KnowledgeProbeStatus, string> = {
    disabled: 'chưa bật',
    checking: 'đang kiểm tra',
    connected: 'đã kết nối',
    disconnected: 'mất kết nối',
  };
  const knowledgeColors: Record<KnowledgeProbeStatus, string> = {
    disabled: 'var(--fg-muted)',
    checking: 'var(--warning)',
    connected: 'var(--success)',
    disconnected: 'var(--danger)',
  };
  const knowledgeLabel = knowledgeLabels[knowledgeStatus];
  const knowledgeColor = knowledgeColors[knowledgeStatus];
  const knowledgeTooltip = knowledgeStatus === 'disabled' || !baseUrl
    ? `Knowledge daemon: ${knowledgeLabel}`
    : `Knowledge daemon: ${knowledgeLabel} (${baseUrl})`;

  const syncColors: Record<typeof sync.kind, string> = {
    off: 'var(--fg-muted)',
    paused: 'var(--danger)',
    error: 'var(--danger)',
    dirty: 'var(--warning)',
    synced: 'var(--success)',
  };

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-14)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-6)' }}>
          <CheckCircleFilled style={{ color: 'var(--success, #338555)', fontSize: 'var(--font-size-xs)' }} />
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

        <Tooltip title="TaskMate Personal Planner • By Quan Tran Duc">
          <span
            style={{
              fontSize: 'var(--font-size-xs, 11px)',
              color: 'var(--fg-muted, #6c707e)',
              borderLeft: '1px solid var(--border-strong, #d1d3d9)',
              paddingLeft: 10,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--gap-4)',
            }}
          >
            <span>TaskMate v1.3</span>
            <span style={{ opacity: 0.85, color: 'var(--fg-secondary, #5f6269)' }}>• By Quan Tran Duc</span>
          </span>
        </Tooltip>

        <Tooltip title="Local IndexedDB storage active & persistent">
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--gap-4)',
              color: 'var(--fg-muted, #6c707e)',
              cursor: 'default',
            }}
          >
            <DatabaseOutlined style={{ fontSize: 'var(--font-size-small)' }} />
            <span>IndexedDB</span>
          </span>
        </Tooltip>

        <Tooltip title={knowledgeTooltip}>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--gap-4)',
              color: knowledgeColor,
              cursor: 'default',
            }}
          >
            <ApiOutlined style={{ fontSize: 'var(--font-size-small)' }} />
            <span>Knowledge{knowledgeLabel ? `: ${knowledgeLabel}` : ''}</span>
          </span>
        </Tooltip>
      </div>

      {/* Right: Active AI Turn Indicator, Active Timer Widget & Sync status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-12)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--gap-8)' }}>
          <ActiveAiTurnIndicator compact />
          <ActiveTimerWidget compact />
        </div>

        <Tooltip title={sync.tooltip}>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--gap-4)',
              color: syncColors[sync.kind],
              cursor: 'default',
              borderLeft: '1px solid var(--border-strong, #d1d3d9)',
              paddingLeft: 10,
            }}
          >
            <CloudSyncOutlined style={{ fontSize: 'var(--font-size-small)' }} />
            <span>{sync.label}</span>
          </span>
        </Tooltip>
      </div>
    </footer>
  );
}
