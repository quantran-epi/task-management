import React, { useState } from 'react';
import { Avatar, Button, Progress, Tag, Tooltip, theme } from 'antd';
import type { AiLead, AiTeam } from '../../../types/aiOffice';
import { ACTIVE_TEAM_CAP_MESSAGE } from '../../../db/repositories/aiTeamRepo';
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
  activeCount: number;
  onOpen: () => void;
  onActivate: () => void;
  onPause: () => void;
}

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
  activeCount,
  onOpen,
  onActivate,
  onPause,
}) => {
  const { token } = theme.useToken();
  const [hovered, setHovered] = useState(false);

  const isActive = team.status === 'active';
  const total = team.budgetTokens;
  const ratio = total > 0 ? Math.min(usedTokens / total, 1) : 0;
  const capReached = activeCount >= 3;
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

      {lead && (
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
          strokeColor={ratio >= 0.8 ? token.colorWarning : token.colorSuccess}
        />
        <div style={{ fontSize: 12, color: token.colorTextSecondary }}>
          {`${usedTokens}/${total} token`}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
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
          <Tooltip title={capReached ? ACTIVE_TEAM_CAP_MESSAGE : ''}>
            {/* A disabled antd Button swallows pointer events, so the tooltip needs a live wrapper. */}
            <span style={{ display: 'inline-flex' }}>
              <Button
                size="small"
                type="primary"
                disabled={capReached}
                onClick={onActivate}
                data-testid={`team-activate-${team.id}`}
              >
                Kích hoạt nhóm
              </Button>
            </span>
          </Tooltip>
        )}
      </div>
    </div>
  );
};

export default TeamCard;
