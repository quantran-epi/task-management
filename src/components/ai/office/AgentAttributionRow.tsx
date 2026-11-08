import React from 'react';
import { Avatar, Button, Tag, theme } from 'antd';
import { CrownOutlined, PauseCircleOutlined, StopOutlined, SyncOutlined } from '@ant-design/icons';
import type { AgentRunStatus } from '../../../types/aiOffice';

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
  status: AgentRunStatus;
  onStop?: (() => void) | undefined;
}

export const AgentStatusRow: React.FC<AgentStatusRowProps> = ({ agent, status, onStop }) => {
  if (status === 'done' || status === 'queued') return null;

  const badge = (() => {
    switch (status) {
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
      case 'stopped':
        return <Tag icon={<StopOutlined />}>Đã dừng giữa chừng</Tag>;
      case 'error':
        return <Tag color="error">Lỗi</Tag>;
      default:
        return null;
    }
  })();

  const showStop = status === 'running' || status === 'paused';

  return (
    <div
      data-testid={`agent-status-${agent.agentId}`}
      style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}
    >
      {badge}
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
