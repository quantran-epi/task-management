import React from 'react';
import { Avatar, Button, Tag, theme } from 'antd';
import { CrownOutlined, PauseCircleOutlined, StopOutlined, SyncOutlined } from '@ant-design/icons';
import type { AgentRunStatus, AiTeamAssignmentRunStatus } from '../../../types/aiOffice';

/** UI-SPEC §Avatar & Identity Treatment — fixed six-entry palette. */
const AGENT_PALETTE = ['#5b4fe8', '#22d3ee', '#338555', '#a56906', '#c54e58', '#6c707e'] as const;

/** Swatches where white glyphs fail WCAG AA at avatar size. */
const DARK_GLYPH_SWATCHES: readonly string[] = ['#22d3ee', '#338555'];

export interface AgentAttributionAgent {
  agentId: string;
  name: string;
  role: string;
  isLead: boolean;
  color: string;
}

export function agentColorFor(agentId: string): string {
  let sum = 0;
  for (let i = 0; i < agentId.length; i += 1) sum += agentId.charCodeAt(i);
  return AGENT_PALETTE[sum % AGENT_PALETTE.length]!;
}

export function agentTextColorFor(color: string): string {
  return DARK_GLYPH_SWATCHES.includes(color) ? '#1f2328' : '#ffffff';
}

function initialOf(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? '?';
}

export interface AgentAttributionRowProps {
  agent: AgentAttributionAgent;
}

export const AgentAttributionRow: React.FC<AgentAttributionRowProps> = ({ agent }) => {
  const { token } = theme.useToken();

  return (
    <div
      data-testid={`agent-attribution-${agent.agentId}`}
      style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}
    >
      <Avatar
        size={24}
        shape={agent.isLead ? 'square' : 'circle'}
        style={{ backgroundColor: agent.color, color: agentTextColorFor(agent.color), flexShrink: 0 }}
      >
        {initialOf(agent.name)}
      </Avatar>
      <span style={{ fontSize: 12, fontWeight: 600, color: token.colorText }}>{agent.name}</span>
      <span style={{ fontSize: 12, fontWeight: 400, color: token.colorTextSecondary }}>{agent.role}</span>
      {agent.isLead && <CrownOutlined style={{ fontSize: 11, color: token.colorPrimary }} />}
    </div>
  );
};

export interface AgentStatusRowProps {
  agent: AgentAttributionAgent;
  /** The persisted ledger status (`message.runStatus`) is wider than the UI union. */
  status: AgentRunStatus | AiTeamAssignmentRunStatus;
  /** Keyed by ASSIGNMENT id so two attempts of one agent never collide (37-08). */
  assignmentId?: string | undefined;
  onStop?: (() => void) | undefined;
  /** 37-08: supplied only when the surface can retry; drives the button, never the label. */
  onRetry?: (() => void) | undefined;
}

export const AgentStatusRow: React.FC<AgentStatusRowProps> = ({
  agent,
  status,
  assignmentId,
  onStop,
  onRetry,
}) => {
  if (status === 'done') return null;

  const badge = (() => {
    switch (status) {
      case 'queued':
        // D-10: a queued agent waits on a scheduler slot, so it must be visible and
        // stoppable — the stop settles the assignment without ever invoking its script.
        return <Tag>Đang xếp hàng</Tag>;
      case 'running':
        return (
          <Tag color="processing" icon={<SyncOutlined spin />}>
            Đang làm việc
          </Tag>
        );
      case 'paused':
        return (
          <Tag color="warning" icon={<PauseCircleOutlined />}>
            Tạm dừng — cần cấp thêm token
          </Tag>
        );
      // 37-08 D-13: stopped and error share one honest, retryable framing.
      case 'stopped':
        return <Tag icon={<StopOutlined />}>Chưa hoàn tất</Tag>;
      case 'error':
        return <Tag color="error">Chưa hoàn tất</Tag>;
      default:
        return null;
    }
  })();

  const showStop = status === 'running' || status === 'paused' || status === 'queued';
  // WR-02: `retryAssignment` refuses anything but stopped/error (and a busy phase or a
  // disposed run). Offering the button on every other status produced a click that always
  // refused — with the only call site discarding the rejection.
  const showRetry = status === 'stopped' || status === 'error';

  return (
    <div
      data-testid={`agent-status-${agent.agentId}`}
      style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}
    >
      {badge}
      {onRetry && assignmentId && showRetry && (
        <Button
          type="text"
          size="small"
          style={{ height: 22, padding: '0 6px', fontSize: 12 }}
          data-testid={`agent-retry-${assignmentId}`}
          onClick={onRetry}
        >
          Chạy lại
        </Button>
      )}
      {showStop && (
        <Button
          type="text"
          size="small"
          danger
          icon={<StopOutlined />}
          style={{ width: 22, height: 22, padding: 0 }}
          aria-label={`Dừng ${agent.name}`}
          data-testid={`agent-stop-${agent.agentId}`}
          onClick={onStop}
        />
      )}
    </div>
  );
};

export default AgentAttributionRow;
