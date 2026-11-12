import React from 'react';
import { Avatar, Button, Progress, Switch, theme } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { AiEmployee, AiLead, AiTeam, AiTeamMember, AgentRunStatus, TeamRunPhase } from '../../../types/aiOffice';
import { agentColorFor, agentTextColorFor } from './AgentAttributionRow';
import { LinkedItemsList, type LinkedItemRow } from './LinkedItemsList';

export interface TeamSidebarProps {
  team: AiTeam;
  lead: AiLead | undefined;
  members: AiTeamMember[];
  employees: AiEmployee[];
  links: LinkedItemRow[];
  /** 37.1 R13: messages the user has not read yet. 0 hides the badge. */
  unreadCount?: number | undefined;
  snapshot: { phase: TeamRunPhase; agents: Array<{ agentId: string; status: AgentRunStatus }> };
  onTopUp: () => void;
  onOpenSettings: () => void;
  onToggleAutoSplit: (next: boolean) => void;
  onToggleAutoApprove: (next: boolean) => void;
  onAddLink: () => void;
  onRemoveLink: (linkId: string) => void;
}

function initialOf(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? '?';
}

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  marginBottom: 8,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

/** UI-SPEC §5c sidebar: members, team budget, links, mode switches. */
export const TeamSidebar: React.FC<TeamSidebarProps> = ({
  team,
  lead,
  members,
  employees,
  links,
  unreadCount = 0,
  snapshot,
  onTopUp,
  onOpenSettings,
  onToggleAutoSplit,
  onToggleAutoApprove,
  onAddLink,
  onRemoveLink,
}) => {
  const { token } = theme.useToken();
  const statusByAgent = new Map(snapshot.agents.map((row) => [row.agentId, row.status]));
  const teamUsed = members.reduce((sum, row) => sum + row.usedTokens, 0);
  const teamTotal = team.budgetTokens;
  const ratio = teamTotal > 0 ? Math.min(teamUsed / teamTotal, 1) : 0;

  const memberRows = members
    .map((member) => {
      const isLead = member.role === 'lead';
      const agent = isLead ? lead : employees.find((row) => row.id === member.agentId);
      return agent ? { member, agent, isLead } : null;
    })
    .filter((row): row is { member: AiTeamMember; agent: AiLead | AiEmployee; isLead: boolean } => row !== null);

  return (
    <div
      data-testid="team-sidebar"
      style={{
        height: '100%',
        overflowY: 'auto',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        borderRight: `1px solid ${token.colorBorderSecondary}`,
      }}
    >
      <div>
        <div style={{ ...SECTION_LABEL, color: token.colorTextSecondary }}>
          Thành viên
          {unreadCount > 0 && (
            <span
              data-testid="team-unread-badge"
              style={{
                marginLeft: 8,
                padding: '0 6px',
                borderRadius: 9,
                background: token.colorError,
                color: '#fff',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: 0,
                textTransform: 'none',
              }}
            >
              {unreadCount} tin mới
            </span>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {memberRows.map(({ member, agent, isLead }) => {
            const status = statusByAgent.get(member.agentId);
            const color = agentColorFor(member.agentId);
            return (
              <div key={member.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Avatar
                  size={24}
                  shape={isLead ? 'square' : 'circle'}
                  style={{ backgroundColor: color, color: agentTextColorFor(color), flexShrink: 0 }}
                >
                  {initialOf(agent.name)}
                </Avatar>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 400 }}>{agent.name}</div>
                  <div style={{ fontSize: 12, color: token.colorTextSecondary }}>{agent.role}</div>
                  <div style={{ fontSize: 12, color: token.colorTextSecondary }}>
                    {`${member.usedTokens}/${member.budgetTokens} token`}
                  </div>
                </div>
                {status === 'running' && (
                  <span
                    aria-label="Đang chạy"
                    style={{ width: 6, height: 6, borderRadius: 3, background: token.colorPrimary }}
                  />
                )}
                {status === 'paused' && (
                  <span
                    aria-label="Tạm dừng"
                    style={{ width: 6, height: 6, borderRadius: 3, background: token.colorWarning }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div data-testid="team-budget-panel">
        <div style={{ ...SECTION_LABEL, color: token.colorTextSecondary }}>Ngân sách nhóm</div>
        <Progress
          size="small"
          showInfo={false}
          percent={ratio * 100}
          strokeColor={ratio >= 0.8 ? token.colorWarning : token.colorSuccess}
        />
        <div style={{ fontSize: 12, color: token.colorTextSecondary, marginBottom: 8 }}>
          {`${teamUsed}/${teamTotal} token`}
        </div>
        <Button size="small" onClick={onTopUp} data-testid="team-topup-button">
          Cấp thêm token
        </Button>
      </div>

      <div data-testid="team-linked-items">
        <div style={{ ...SECTION_LABEL, color: token.colorTextSecondary }}>Liên kết</div>
        <LinkedItemsList items={links} onRemove={onRemoveLink} />
        <Button
          size="small"
          icon={<PlusOutlined />}
          onClick={onAddLink}
          style={{ marginTop: 8 }}
          data-testid="team-add-link"
        >
          Liên kết mục
        </Button>
      </div>

      <div data-testid="team-mode-toggles" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ ...SECTION_LABEL, color: token.colorTextSecondary }}>Chế độ</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12 }}>Tự động chia việc</span>
          <Switch
            size="small"
            checked={team.autoSplitEnabled === true}
            onChange={onToggleAutoSplit}
            aria-label="Tự động chia việc"
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12 }}>Tự động duyệt thay đổi</span>
          <Switch
            size="small"
            checked={team.autoApproveMutations === true}
            onChange={onToggleAutoApprove}
            aria-label="Tự động duyệt thay đổi"
          />
        </div>
        <Button size="small" type="text" onClick={onOpenSettings} data-testid="team-open-settings">
          Cài đặt nhóm
        </Button>
      </div>
    </div>
  );
};

export default TeamSidebar;
