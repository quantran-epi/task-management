import React, { useEffect, useState } from 'react';
import { Button, Empty, Popconfirm, Tag, Tooltip, Typography, theme } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  CloseOutlined,
  CopyOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { AgentLiveStep, AgentRunState } from '../../../types/aiOffice';

/** Stable id shared with the workspace Activity affordance's `aria-controls`. */
export const ACTIVITY_RAIL_ID = 'agent-activity-rail';
/** Previews are capped here as a second line of defence; the coordinator also caps at write time (D-06). */
export const ACTIVITY_PREVIEW_CAP = 8_000;

/**
 * D-14: the prompt-history row shape, moved byte-identically from TeamWorkspace.tsx.
 * One shape is shared by the capture site and the Prompt log tab.
 */
export interface TeamDebugLog {
  timestamp: string;
  agentId: string;
  agentName: string;
  agentKind: string;
  model: string;
  text: string;
  systemMessages: string[];
  toolNames: string[];
}

export interface ActivityRosterEntry {
  id: string;
  name: string;
  isLead?: boolean | undefined;
}

export interface AgentActivityPanelProps {
  /** Runtime agents; only their id-keyed tool-call steps are rendered. */
  agents: AgentRunState[];
  /** Current roster, used for filter pills and agent names. */
  roster: ActivityRosterEntry[];
  debugLogs: TeamDebugLog[];
  onClearLogs: () => void;
  /** Cancel the running Rust task by its model tool-call id (no config/secret re-sent). */
  onCancelToolCall?: ((toolCallId: string) => void) | undefined;
  /** Header close control; the workspace owns the shared open state (D-10). */
  onClose?: (() => void) | undefined;
  /** Mirrors the workspace rail state so both controls keep aria-expanded in sync. */
  open?: boolean | undefined;
}

type ToolStatus = 'running' | 'done' | 'error';
type TabKey = 'timeline' | 'prompts';

interface TimelineRow {
  step: AgentLiveStep;
  agentId: string;
  agentName: string;
  toolName: string;
  status: ToolStatus;
  sortMs: number;
}

const EMPTY_TIMELINE_HEADING = 'Chưa có tool call nào';
const EMPTY_TIMELINE_BODY = 'Các lời gọi công cụ của agent sẽ xuất hiện ở đây khi đội bắt đầu chạy.';
const EMPTY_PROMPTS = 'Chưa có lượt gửi AI nào trong phiên này.';
const ERROR_COPY =
  'Không đọc được kết quả tool. Nội dung hiển thị dạng văn bản; thử mở lại panel hoặc chạy lại lượt này.';
const NO_RESULT_COPY = 'Chưa có kết quả…';
const RUNNING_NOTE = 'Đang chạy · chỉ dừng khi bạn bấm Hủy hoặc tắt ứng dụng.';
const TRUNCATION_MARKER = '… (đã rút gọn)';

/** Untrusted previews are wrapped and scrolled in their own box so the rail never widens the page (D-12). */
const previewStyle: React.CSSProperties = {
  margin: 0,
  padding: 8,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'break-word',
  wordBreak: 'break-word',
  maxHeight: 180,
  overflowY: 'auto',
  overflowX: 'hidden',
  fontSize: 11,
  lineHeight: 1.5,
};

function capPreview(text: string | undefined): { text: string; truncated: boolean } {
  if (!text) return { text: '', truncated: false };
  if (text.length <= ACTIVITY_PREVIEW_CAP) return { text, truncated: false };
  return { text: `${text.slice(0, ACTIVITY_PREVIEW_CAP)}\n\n${TRUNCATION_MARKER}`, truncated: true };
}

function parseArgsObject(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    // Unparseable args are data, never instructions — fall back to an empty object.
  }
  return {};
}

function formatDuration(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms)) return '';
  const rounded = Math.max(0, Math.round(ms));
  if (rounded < 1_000) return `${rounded}ms`;
  if (rounded < 60_000) return `${Math.round(rounded / 1_000)}s`;
  const minutes = Math.floor(rounded / 60_000);
  const seconds = Math.round((rounded % 60_000) / 1_000);
  return `${minutes}m${seconds}s`;
}

/** MM:SS for both elapsed and deadline (e.g. 01:23 / 05:00), per the UI-SPEC copy. */
function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1_000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function statusFromStep(step: AgentLiveStep): ToolStatus {
  if (step.status === 'error') return 'error';
  if (step.status === 'running') return 'running';
  return 'done';
}

function detailsIdFor(id: string): string {
  return `activity-detail-${id.replace(/[^A-Za-z0-9_-]/g, '-')}`;
}

/** Only id-keyed tool-call rows belong in the Timeline; status steps from pushStep do not. */
function toTimelineRow(step: AgentLiveStep, agentId: string, nameOf: (id: string) => string): TimelineRow | null {
  if (!step.toolName && !step.phase) return null;
  const timestampMs = Date.parse(step.startedAt ?? step.at);
  return {
    step,
    agentId,
    agentName: nameOf(agentId),
    toolName: step.toolName ?? step.label,
    status: statusFromStep(step),
    sortMs: Number.isFinite(timestampMs) ? timestampMs : 0,
  };
}

const TimelineEventRow: React.FC<{ row: TimelineRow; onCancel?: ((id: string) => void) | undefined }> = ({ row, onCancel }) => {
  const { token } = theme.useToken();
  const [expanded, setExpanded] = useState(false);
  const { step, status, toolName, agentName } = row;
  const detailsId = detailsIdFor(step.id);

  const statusMeta = {
    running: { icon: <SyncOutlined spin />, label: 'đang chạy', color: token.colorWarning },
    done: { icon: <CheckCircleOutlined />, label: 'xong', color: token.colorSuccess },
    error: { icon: <CloseCircleOutlined />, label: 'lỗi', color: token.colorError },
  }[status];
  const args = capPreview(step.detail);
  const result = capPreview(step.resultPreview);
  const duration = formatDuration(step.durationMs);

  return (
    <div
      data-testid={`activity-event-${step.id}`}
      data-agent-id={row.agentId}
      style={{
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: 8,
        background: token.colorBgContainer,
        overflow: 'hidden',
        minWidth: 0,
      }}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={() => setExpanded((prev) => !prev)}
        data-testid={`activity-event-toggle-${step.id}`}
        style={{
          display: 'grid',
          gridTemplateColumns: '18px minmax(0, 1fr) auto',
          gap: 8,
          alignItems: 'center',
          width: '100%',
          padding: 8,
          border: 0,
          background: 'transparent',
          textAlign: 'left',
          cursor: 'pointer',
          minWidth: 0,
        }}
      >
        <span aria-hidden="true" style={{ color: statusMeta.color, fontSize: 12 }}>
          {statusMeta.icon}
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <Tooltip title={toolName}>
            <span
              style={{
                display: 'block',
                fontFamily: 'monospace',
                fontSize: 12,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                minWidth: 0,
              }}
            >
              {toolName}
            </span>
          </Tooltip>
          <span
            style={{
              fontSize: 11,
              color: token.colorTextTertiary,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              minWidth: 0,
            }}
          >
            {`${agentName} · ${statusMeta.label} · ${dayjs(step.startedAt ?? step.at).format('HH:mm:ss')}`}
          </span>
        </span>
        <span style={{ fontSize: 11, color: token.colorTextTertiary, whiteSpace: 'nowrap' }}>
          {duration}
        </span>
      </button>

      <div
        id={detailsId}
        hidden={!expanded}
        style={{ borderTop: `1px solid ${token.colorBorderSecondary}`, padding: 8, minWidth: 0 }}
      >
        {args.text && (
          <div style={{ marginBottom: 8, minWidth: 0 }}>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>Tham số</Typography.Text>
            <pre data-testid="activity-preview" className="activity-preview" style={previewStyle}>
              {args.text}
            </pre>
          </div>
        )}
        {result.text ? (
          <div style={{ minWidth: 0 }}>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>Kết quả</Typography.Text>
            <pre data-testid="activity-preview" className="activity-preview" style={previewStyle}>
              {result.text}
            </pre>
          </div>
        ) : status === 'running' ? (
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>{NO_RESULT_COPY}</Typography.Text>
        ) : null}
        {status === 'error' ? (
          <Typography.Text type="danger" style={{ fontSize: 11, display: 'block', marginTop: 4 }} data-testid="activity-error-copy">
            {ERROR_COPY}
          </Typography.Text>
        ) : null}
        {status === 'running' && onCancel ? (
          <Button
            size="small"
            danger
            data-testid={`activity-row-cancel-${step.id}`}
            style={{ marginTop: 8 }}
            onClick={() => onCancel(step.id)}
          >
            Hủy tool này
          </Button>
        ) : null}
      </div>
    </div>
  );
};

const ProgressCard: React.FC<{ row: TimelineRow; onCancel?: ((id: string) => void) | undefined }> = ({ row, onCancel }) => {
  const { token } = theme.useToken();
  // The card is a stopwatch, NOT a deadline: a running task has no time limit. The ticker
  // only advances the elapsed display; it never ends the task.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 1_000);
    return () => clearInterval(timer);
  }, []);
  const args = parseArgsObject(row.step.detail);
  const startedMs = Date.parse(row.step.startedAt ?? row.step.at);
  void tick;
  const elapsedMs = Number.isFinite(startedMs) ? Math.max(0, Date.now() - startedMs) : 0;
  const question = typeof args.question === 'string' ? args.question : '';
  const snippet = question.length > 90 ? `${question.slice(0, 90)}…` : question;

  return (
    <div
      data-testid="activity-progress-card"
      style={{
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: 8,
        padding: 8,
        marginBottom: 8,
        background: token.colorFillAlter,
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, minWidth: 0 }}>
        <strong style={{ fontSize: 12, minWidth: 0 }}>{row.toolName}</strong>
        <span data-testid="activity-progress-clock" style={{ fontSize: 11, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
          {`Đang chạy · đã chạy ${formatClock(elapsedMs)}`}
        </span>
      </div>
      <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', minWidth: 0 }}>
        {`${row.agentName}${snippet ? ` · “${snippet}”` : ''}`}
      </Typography.Text>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
        <Typography.Text type="secondary" style={{ fontSize: 11, minWidth: 0 }}>
          {RUNNING_NOTE}
        </Typography.Text>
        <Button
          size="small"
          danger
          data-testid={`activity-cancel-${row.step.id}`}
          onClick={() => onCancel?.(row.step.id)}
        >
          Hủy
        </Button>
      </div>
    </div>
  );
};

/** D-14: one preserved prompt-history entry. Every field renders as escaped text. */
const PromptLogEntry: React.FC<{ log: TeamDebugLog; index: number }> = ({ log, index }) => {
  const { token } = theme.useToken();
  const [copied, setCopied] = useState(false);
  const text = capPreview(log.text);
  const copy = () => {
    // Best-effort inspection affordance; clipboard may be unavailable in a test DOM.
    try {
      void navigator.clipboard?.writeText(log.text).then(() => setCopied(true)).catch(() => undefined);
    } catch {
      // No clipboard: the escaped <pre> below remains the inspection surface.
    }
  };
  return (
    <div
      data-testid={`activity-prompt-entry-${index}`}
      style={{
        padding: 8,
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: 8,
        background: token.colorFillAlter,
        marginBottom: 8,
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, minWidth: 0 }}>
        <Tag color="blue" data-testid="activity-prompt-kind">
          {`${log.agentKind.toUpperCase()}: ${log.agentName}`}
        </Tag>
        <Typography.Text type="secondary" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
          {log.timestamp}
        </Typography.Text>
      </div>
      <div style={{ fontSize: 12, marginBottom: 4, minWidth: 0 }}>
        <strong>Model:</strong> {log.model} | <strong>Tools:</strong> {log.toolNames.join(', ') || 'none'}
      </div>
      <div style={{ marginBottom: 4, minWidth: 0 }}>
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
          <strong>User / Instruction Input:</strong>
        </Typography.Text>
        <pre data-testid="activity-prompt-text" className="activity-preview" style={previewStyle}>
          {text.text}
        </pre>
      </div>
      <div style={{ minWidth: 0 }}>
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
          <strong>System Prompt:</strong>
        </Typography.Text>
        {log.systemMessages.length === 0 ? null : log.systemMessages.map((sm, smIdx) => (
          <pre
            key={smIdx}
            data-testid="activity-prompt-system"
            className="activity-preview"
            style={previewStyle}
          >
            {sm}
          </pre>
        ))}
      </div>
      <Button
        size="small"
        type="link"
        icon={<CopyOutlined />}
        data-testid="activity-prompt-copy"
        onClick={copy}
        style={{ paddingLeft: 0 }}
      >
        {copied ? 'Đã sao chép' : 'Sao chép'}
      </Button>
    </div>
  );
};

/** D-14/D-15/D-16: the migrated Debug Prompt presentation, now a tab in the rail. */
const PromptLogTab: React.FC<{ logs: TeamDebugLog[]; onClearLogs: () => void }> = ({ logs, onClearLogs }) => (
  <div style={{ minWidth: 0 }}>
    {logs.length === 0 ? (
      <Typography.Text type="secondary" data-testid="activity-prompts-empty">
        {EMPTY_PROMPTS}
      </Typography.Text>
    ) : (
      <div data-testid="activity-prompt-list" style={{ minWidth: 0 }}>
        {logs.map((log, index) => <PromptLogEntry key={`${log.timestamp}-${index}`} log={log} index={index} />)}
      </div>
    )}
    <Popconfirm
      title="Xóa nhật ký debug"
      description="Xóa toàn bộ nhật ký prompt trong phiên này? Không thể hoàn tác."
      okText="Xác nhận"
      cancelText="Hủy"
      onConfirm={onClearLogs}
    >
      <Button size="small" danger data-testid="activity-clear-logs" style={{ marginTop: 12 }}>
        Xóa nhật ký debug
      </Button>
    </Popconfirm>
  </div>
);

/**
 * D-09/D-10/D-11/D-12: the collapsible right rail. Presentational only — the workspace owns
 * the run snapshot, the roster, the prompt capture and the shared open state.
 */
export const AgentActivityPanel: React.FC<AgentActivityPanelProps> = React.memo(({
  agents,
  roster,
  debugLogs,
  onClearLogs,
  onCancelToolCall,
  onClose,
  open = true,
}) => {
  const { token } = theme.useToken();
  const [tab, setTab] = useState<TabKey>('timeline');
  const [filter, setFilter] = useState<string>('all');

  const nameOf = (id: string) => roster.find((member) => member.id === id)?.name ?? id;

  const rows: TimelineRow[] = [];
  for (const agent of agents) {
    for (const step of agent.steps ?? []) {
      const row = toTimelineRow(step, agent.agentId, nameOf);
      if (row) rows.push(row);
    }
  }
  rows.sort((a, b) => b.sortMs - a.sortMs);

  const pillIds = Array.from(new Set([...roster.map((member) => member.id), ...rows.map((row) => row.agentId)]));
  // Count pills once instead of filtering the whole row list inside every pill's render —
  // with up to MAX_LIVE_STEPS rows that O(n²) scan ran on every snapshot update.
  const countByAgent = new Map<string, number>();
  for (const row of rows) countByAgent.set(row.agentId, (countByAgent.get(row.agentId) ?? 0) + 1);
  const visibleRows = filter === 'all' ? rows : rows.filter((row) => row.agentId === filter);
  const runningExplore = visibleRows.find(
    (row) => row.toolName === 'explore_repo' && row.status === 'running'
  );

  const selectTab = (next: TabKey) => setTab(next);
  const onTabKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const next: TabKey = event.key === 'Home' ? 'timeline' : event.key === 'End' ? 'prompts' : tab === 'timeline' ? 'prompts' : 'timeline';
    selectTab(next);
    document.getElementById(`activity-tab-${next}`)?.focus();
  };

  return (
    <aside
      id={ACTIVITY_RAIL_ID}
      aria-label="Agent activity detail"
      data-testid="agent-activity-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        minWidth: 0,
        overflow: 'hidden',
        background: token.colorBgContainer,
      }}
    >
      <div style={{ padding: 12, borderBottom: `1px solid ${token.colorBorderSecondary}`, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, minWidth: 0 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: token.colorPrimary }}>
              Live inspection
            </div>
            <h2 style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.2, margin: 0 }}>Hoạt động agent</h2>
          </div>
          {onClose ? (
            <Button
              size="small"
              type="text"
              aria-label="Đóng activity rail"
              aria-expanded={open}
              aria-controls={ACTIVITY_RAIL_ID}
              icon={<CloseOutlined />}
              onClick={onClose}
            />
          ) : null}
        </div>
        <div
          role="group"
          aria-label="Lọc theo agent"
          style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8, minWidth: 0 }}
        >
          {['all', ...pillIds].map((id) => {
            const active = filter === id;
            const count = id === 'all' ? rows.length : countByAgent.get(id) ?? 0;
            return (
              <Button
                key={id}
                size="small"
                type={active ? 'primary' : 'default'}
                aria-pressed={active}
                data-testid={`activity-filter-${id}`}
                onClick={() => setFilter(id)}
              >
                {id === 'all' ? 'Tất cả' : nameOf(id)} <span style={{ fontFamily: 'monospace' }}>{count}</span>
              </Button>
            );
          })}
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Panel sections"
        onKeyDown={onTabKeyDown}
        style={{ display: 'flex', gap: 16, padding: '0 12px', borderBottom: `1px solid ${token.colorBorderSecondary}`, minWidth: 0 }}
      >
        {(['timeline', 'prompts'] as const).map((key) => {
          const selected = tab === key;
          return (
            <button
              key={key}
              id={`activity-tab-${key}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`activity-panel-${key}`}
              tabIndex={selected ? 0 : -1}
              data-testid={`activity-tab-${key}`}
              onClick={() => selectTab(key)}
              style={{
                border: 0,
                borderBottom: `2px solid ${selected ? token.colorPrimary : 'transparent'}`,
                background: 'none',
                padding: '8px 0',
                fontSize: 12,
                fontWeight: selected ? 600 : 400,
                color: selected ? token.colorText : token.colorTextSecondary,
                cursor: 'pointer',
              }}
            >
              {key === 'timeline' ? 'Timeline' : 'Prompt log'}
            </button>
          );
        })}
      </div>

      <div
        id="activity-panel-timeline"
        role="tabpanel"
        aria-labelledby="activity-tab-timeline"
        hidden={tab !== 'timeline'}
        data-testid="activity-tabpanel-timeline"
        style={{ flex: 1, minHeight: 0, minWidth: 0, overflowY: 'auto', padding: 12 }}
      >
        {runningExplore ? <ProgressCard row={runningExplore} onCancel={onCancelToolCall} /> : null}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 8, fontSize: 11, color: token.colorTextTertiary }}>
          <span>✓ xong</span>
          <span>› đang chạy</span>
          <span>! lỗi</span>
        </div>
        {visibleRows.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <span>
                <strong>{EMPTY_TIMELINE_HEADING}</strong>
                <br />
                {EMPTY_TIMELINE_BODY}
              </span>
            }
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
            {visibleRows.map((row) => <TimelineEventRow key={row.step.id} row={row} onCancel={onCancelToolCall} />)}
          </div>
        )}
      </div>

      <div
        id="activity-panel-prompts"
        role="tabpanel"
        aria-labelledby="activity-tab-prompts"
        hidden={tab !== 'prompts'}
        data-testid="activity-tabpanel-prompts"
        style={{ flex: 1, minHeight: 0, minWidth: 0, overflowY: 'auto', padding: 12 }}
      >
        <PromptLogTab logs={debugLogs} onClearLogs={onClearLogs} />
      </div>
    </aside>
  );
});

export default AgentActivityPanel;
