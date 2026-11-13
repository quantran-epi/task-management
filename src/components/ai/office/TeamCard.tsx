import React, { useState } from 'react';
import { Avatar, Button, Progress, Tag, theme } from 'antd';
import type { AiLead, AiTeam } from '../../../types/aiOffice';
import { DEFAULT_BUDGET_WARN_THRESHOLD_PCT } from '../../../types/aiOffice';
import { isAtThreshold, resolveThresholdPct } from '../../../services/ai/office/budgetGate';
import { agentColorFor, agentTextColorFor } from './AgentAttributionRow';

/** Roster row rendered inside the avatar stack — names only, no domain payload. */
export interface TeamCardMember {
  agentId: string;
  name: string;
}

export interface TeamCardProps {
  team: AiTeam;
  lead: AiLead | undefined;
  members: TeamCardMember[];
  usedTokens: number;
  /** D-04/D-05: the resolved threshold; the production caller always supplies it. */
  budgetWarnThresholdPct?: number | undefined;
  onOpen: () => void;
  onActivate: () => void;
  onPause: () => void;
  onOpenSettings: () => void;
}

/** Avatar-stack overflow display only — not a roster cap (D-06). */
const ROSTER_CAP = 4;

function initialOf(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? '?';
}

/** UI-SPEC §5a team card — same surface geometry as `EmployeeCard`. */
export const TeamCard: React.FC<TeamCardProps> = ({
  team,
  lead,
  members,
  usedTokens,
  budgetWarnThresholdPct,
  onOpen,
  onActivate,
  onPause,
  onOpenSettings,
}) => {
  const { token } = theme.useToken();
  const [hovered, setHovered] = useState(false);

  const isActive = team.status === 'active';
  const total = team.budgetTokens;
  const pct = resolveThresholdPct(team, budgetWarnThresholdPct ?? DEFAULT_BUDGET_WARN_THRESHOLD_PCT);
  const atThreshold = isAtThreshold(usedTokens, total, pct);
  const ratio = total > 0 ? Math.min(usedTokens / total, 1) : 0;
  const visibleRoster = members.slice(0, ROSTER_CAP);
  const overflow = members.length - visibleRoster.length;

  return (
    <div
      data-testid={`team-card-${team.id}`}
      style={{
        background: token.colorBgContainer,
        border: `1px solid ${hovered ? token.colorBorder : token.colorBorderSecondary}`,
        borderRadius: 8,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {team.name}
        </span>
        <Tag color={isActive ? 'success' : 'default'} style={{ marginLeft: 'auto', marginInlineEnd: 0 }}>
          {isActive ? 'Đang hoạt động' : 'Tạm dừng'}
        </Tag>
      </div>

      {lead ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Avatar
            size={20}
            shape="square"
            style={{ backgroundColor: agentColorFor(lead.id), color: agentTextColorFor(agentColorFor(lead.id)), flexShrink: 0 }}
          >
            {initialOf(lead.name)}
          </Avatar>
          <span style={{ fontSize: 12 }}>{lead.name}</span>
          <span style={{ fontSize: 12, color: token.colorTextSecondary }}>{lead.role}</span>
        </div>
      ) : (
        <span style={{ fontSize: 12, color: token.colorTextSecondary }}>Chưa chọn lead</span>
      )}

      <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 0 }}>
        {visibleRoster.map((member, index) => {
          const color = agentColorFor(member.agentId);
          return (
            <Avatar
              key={member.agentId}
              size={24}
              style={{
                backgroundColor: color,
                color: agentTextColorFor(color),
                marginLeft: index === 0 ? 0 : -6,
                border: `1px solid ${token.colorBgContainer}`,
              }}
            >
              {initialOf(member.name)}
            </Avatar>
          );
        })}
        {overflow > 0 && (
          <Avatar
            size={24}
            style={{
              marginLeft: -6,
              backgroundColor: token.colorFillAlter,
              color: token.colorTextSecondary,
              fontSize: 11,
              border: `1px solid ${token.colorBgContainer}`,
            }}
          >
            {`+${overflow}`}
          </Avatar>
        )}
      </div>

      <div>
        <Progress
          size="small"
          showInfo={false}
          percent={ratio * 100}
          strokeColor={atThreshold ? token.colorWarning : token.colorSuccess}
        />
        <div style={{ fontSize: 12, color: token.colorTextSecondary }}>
          {`${usedTokens.toLocaleString()}/${total.toLocaleString()} token`}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button size="small" type="text" onClick={onOpenSettings} data-testid={`team-settings-${team.id}`}>
          Cài đặt nhóm
        </Button>
        {isActive ? (
          <>
            <Button size="small" onClick={onOpen} data-testid={`team-open-${team.id}`}>
              Mở nhóm
            </Button>
            <Button
              size="small"
              type="text"
              onClick={onPause}
              data-testid={`team-pause-${team.id}`}
            >
              Tạm dừng
            </Button>
          </>
        ) : (
          <Button
            size="small"
            type="primary"
            onClick={onActivate}
            data-testid={`team-activate-${team.id}`}
          >
            Kích hoạt nhóm
          </Button>
        )}
      </div>
    </div>
  );
};

export default TeamCard;
