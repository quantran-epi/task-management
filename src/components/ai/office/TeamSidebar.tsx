import React from 'react';
import { Avatar, Button, Progress, Switch, Tag, theme } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { AiEmployee, AiLead, AiTeam, AiTeamMember, AgentRunStatus, TeamRunPhase } from '../../../types/aiOffice';
import { isAtThreshold, resolveThresholdPct } from '../../../services/ai/office/budgetGate';
import { agentColorFor, agentTextColorFor } from './AgentAttributionRow';
import { LinkedItemsList, type LinkedItemRow } from './LinkedItemsList';

/** Phase 38 D-22: the coordinator's live split, passed straight through from the snapshot. */
export interface TeamSidebarLiveUsage {
  agentId: string;
  inputTokens: number;
  outputTokens: number;
  estimated: boolean;
  provisionalInputTokens: number;
  /** UAT 38: the member's cumulative split — persisted row plus unflushed deltas. */
  usedInputTokens: number;
  usedOutputTokens: number;
}

export interface TeamSidebarProps {
  team: AiTeam;
  lead: AiLead | undefined;
  members: AiTeamMember[];
  employees: AiEmployee[];
  links: LinkedItemRow[];
  /** 37.1 R13: messages the user has not read yet. 0 hides the badge. */
  unreadCount?: number | undefined;
  snapshot: { phase: TeamRunPhase; agents: Array<{ agentId: string; status: AgentRunStatus }> };
  /** D-04/D-05: the resolved percentage — the caller resolves the global default. */
  budgetWarnThresholdPct: number;
  /** D-22: live split per agent while a turn runs; absent outside a run. */
  liveUsage?: TeamSidebarLiveUsage[] | undefined;
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

/** D-21: raw tokens with thousands separators. Non-finite never reaches the DOM. */
function fmt(value: number): string {
  return (Number.isFinite(value) ? Math.round(value) : 0).toLocaleString();
}

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  marginBottom: 8,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

interface MemberFigures {
  /** The member's cumulative split — persisted row plus this run's unflushed deltas. */
  usedIn: number;
  usedOut: number;
  used: number;
  /** WR-04: charged-only halves — no provisional guess — for the team aggregate. */
  chargedIn: number;
  chargedOut: number;
  remaining: number;
  estimated: boolean;
  atThreshold: boolean;
}

/** UI-SPEC §5c sidebar: members, team budget, links, mode switches. */
export const TeamSidebar: React.FC<TeamSidebarProps> = ({
  team,
  lead,
  members,
  employees,
  links,
  unreadCount = 0,
  snapshot,
  budgetWarnThresholdPct,
  liveUsage,
  onTopUp,
  onOpenSettings,
  onToggleAutoSplit,
  onToggleAutoApprove,
  onAddLink,
  onRemoveLink,
}) => {
  const { token } = theme.useToken();
  const statusByAgent = new Map(snapshot.agents.map((row) => [row.agentId, row.status]));
  const liveByAgent = new Map((liveUsage ?? []).map((row) => [row.agentId, row]));
  const pct = resolveThresholdPct(team, budgetWarnThresholdPct);

  // UAT 38: the live record carries the member's CUMULATIVE split (`usedInputTokens`), not
  // one request's report. Rendering `inputTokens` here made a member with 152k used read as
  // the current turn's 15k — and made the group total dip back to 23% after a warning.
  const figuresFor = (member: AiTeamMember): MemberFigures => {
    const live = liveByAgent.get(member.agentId);
    const provisionalIn = live?.provisionalInputTokens ?? 0;
    const usedIn = live ? live.usedInputTokens : (member.inputTokens ?? 0);
    const usedOut = live ? live.usedOutputTokens : (member.outputTokens ?? 0);
    const used = usedIn + usedOut;
    return {
      usedIn,
      usedOut,
      used,
      chargedIn: usedIn,
      chargedOut: usedOut,
      remaining: Math.max(0, member.budgetTokens - used),
      // D-24: a provisional measurement is an estimate too — it is not a provider number.
      estimated:
        live?.estimated === true || member.usageEstimated === true || provisionalIn > 0,
      // Matches the coordinator's `memberWarningTotal`: the pre-call guess is a warning input.
      atThreshold: isAtThreshold(used + provisionalIn, member.budgetTokens, pct),
    };
  };

  const figuresByMemberId = new Map(members.map((member) => [member.id, figuresFor(member)]));
  // Summed over EVERY member row, not only the renderable ones, so the group total agrees
  // with the ledger the coordinator reconciles against (T-38-23). WR-04: charged halves only.
  const teamUsedIn = members.reduce((sum, row) => sum + (figuresByMemberId.get(row.id)?.chargedIn ?? 0), 0);
  const teamUsedOut = members.reduce((sum, row) => sum + (figuresByMemberId.get(row.id)?.chargedOut ?? 0), 0);
  const teamUsed = teamUsedIn + teamUsedOut;
  // WR-04: the pre-call guess renders as its own `~` figure, never inside the total.
  const teamProvisionalIn = members.reduce(
    (sum, row) => sum + (liveByAgent.get(row.agentId)?.provisionalInputTokens ?? 0),
    0
  );
  const teamTotal = team.budgetTokens;
  const teamRemaining = Math.max(0, teamTotal - teamUsed);
  const teamPercent = teamTotal > 0 ? Math.round((teamUsed / teamTotal) * 100) : 0;
  const memberAtThreshold = members.some((row) => figuresByMemberId.get(row.id)?.atThreshold === true);
  const teamAtThreshold = isAtThreshold(teamUsed, teamTotal, pct);

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
          {memberAtThreshold && (
            <Tag
              color="warning"
              role="status"
              aria-label="Cảnh báo ngân sách thành viên"
              data-testid="budget-badge-member"
              style={{ marginLeft: 8, textTransform: 'none', letterSpacing: 0 }}
            >
              Có thành viên vượt ngưỡng
            </Tag>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {memberRows.map(({ member, agent, isLead }) => {
            const status = statusByAgent.get(member.agentId);
            const color = agentColorFor(member.agentId);
            const figures = figuresByMemberId.get(member.id);
            const used = figures?.used ?? 0;
            const usedIn = figures?.usedIn ?? 0;
            const usedOut = figures?.usedOut ?? 0;
            const remaining = figures?.remaining ?? Math.max(0, member.budgetTokens);
            const estimated = figures?.estimated === true;
            const granted = member.budgetTokens;
            // The BAR clamps at 100%; the LABEL reports the true figure (51k/50k is 102%).
            const pctUsed = granted > 0 ? (used / granted) * 100 : 0;
            const pctLabel = Math.round(pctUsed);
            // UAT 38: the row is a bar plus one compact figure; the full split (in/out,
            // remaining) lives in the tooltip and the accessible name, not on every row.
            const usageLine = `đã dùng ${estimated ? '~' : ''}${fmt(used)} (${fmt(usedIn)} vào / ${fmt(usedOut)} ra) · còn ${fmt(remaining)}/${fmt(granted)}`;
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
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {agent.name}
                    </span>
                    <span style={{ fontSize: 11, color: token.colorTextTertiary, flexShrink: 0 }}>
                      {agent.role}
                    </span>
                  </div>
                  <Progress
                    size="small"
                    showInfo={false}
                    percent={Math.min(100, pctUsed)}
                    status={figures?.atThreshold ? 'exception' : 'normal'}
                    aria-label={usageLine}
                    style={{ margin: 0 }}
                  />
                  <div
                    data-testid={`member-usage-${member.agentId}`}
                    title={usageLine}
                    style={{ fontSize: 11.5, color: token.colorTextSecondary }}
                  >
                    {estimated ? (
                      <span title="ước lượng" aria-label="ước lượng">
                        {`~${fmt(used)} / ${fmt(granted)} · ${pctLabel}%`}
                      </span>
                    ) : (
                      <span>{`${fmt(used)} / ${fmt(granted)} · ${pctLabel}%`}</span>
                    )}
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
        <div style={{ ...SECTION_LABEL, color: token.colorTextSecondary }}>
          Ngân sách nhóm
          {teamAtThreshold && (
            <Tag
              color="error"
              role="status"
              aria-label="Cảnh báo ngân sách nhóm"
              data-testid="budget-badge-team"
              style={{ marginLeft: 8, textTransform: 'none', letterSpacing: 0 }}
            >
              Nhóm vượt ngưỡng
            </Tag>
          )}
        </div>
        <Progress
          size="small"
          showInfo={false}
          percent={Math.min(100, teamPercent)}
          status={teamAtThreshold ? 'exception' : 'normal'}
          aria-label={`${fmt(teamUsed)} / ${fmt(teamTotal)} token · ${teamPercent}%`}
          style={{ margin: 0 }}
        />
        <div
          data-testid="team-usage-line"
          style={{ fontSize: 11.5, color: token.colorTextSecondary, marginBottom: 8 }}
          title={`${fmt(teamUsedIn)} vào / ${fmt(teamUsedOut)} ra · còn ${fmt(teamRemaining)}`}
        >
          {`${fmt(teamUsed)} / ${fmt(teamTotal)} · ${teamPercent}%`}
          {teamProvisionalIn > 0 && (
            <span data-testid="team-provisional" title="ước lượng" aria-label="ước lượng">
              {` · ~${fmt(teamProvisionalIn)} (ước lượng)`}
            </span>
          )}
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
