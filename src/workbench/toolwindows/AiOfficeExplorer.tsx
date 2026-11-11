import React, { useMemo, useState } from 'react';
import { Input, Button, Tag, Typography, Tooltip } from 'antd';
import {
  SearchOutlined,
  PlusOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../../db';
import { listEmployees, listLeads } from '../../db/repositories/aiOfficeRepo';
import { listTeams } from '../../db/repositories/aiTeamRepo';
import { useLayoutStore } from '../store/layoutStore';
import { TeamEditorDrawer } from '../../components/ai/office/TeamEditorDrawer';
import type { AiTeam, AiTeamStatus } from '../../types/aiOffice';

export interface AiOfficeExplorerProps {
  db?: TaskPlannerDatabase | undefined;
}

const STATUS_COLOR_MAP: Record<AiTeamStatus, string> = {
  active: 'green',
  idle: 'default',
};

const STATUS_LABEL_MAP: Record<AiTeamStatus, string> = {
  active: 'Hoạt động',
  idle: 'Nhàn rỗi',
};

export const AiOfficeExplorer: React.FC<AiOfficeExplorerProps> = ({ db = defaultDb }) => {
  const [search, setSearch] = useState('');
  const [createTeamOpen, setCreateTeamOpen] = useState(false);

  const openTab = useLayoutStore((s) => s.openTab);

  const teams = useLiveQuery(() => listTeams(db), [db]) ?? [];
  const leads = useLiveQuery(() => listLeads(db), [db]) ?? [];
  const employees = useLiveQuery(() => listEmployees(db), [db]) ?? [];
  const members = useLiveQuery(() => db.aiTeamMembers.toArray(), [db]) ?? [];

  const activeCount = teams.filter((t) => t.status === 'active').length;

  const leadMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const lead of leads) {
      map.set(lead.id, lead.name);
    }
    return map;
  }, [leads]);

  const memberCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const member of members) {
      map.set(member.teamId, (map.get(member.teamId) ?? 0) + 1);
    }
    return map;
  }, [members]);

  const query = search.trim().toLowerCase();
  const filteredTeams = useMemo(() => {
    if (!query) return teams;
    return teams.filter((team) => {
      const leadName = (team.leadId ? leadMap.get(team.leadId) : undefined) ?? '';
      return (
        team.name.toLowerCase().includes(query) ||
        leadName.toLowerCase().includes(query)
      );
    });
  }, [teams, query, leadMap]);

  const handleOpenTeam = (team: AiTeam) => {
    openTab({
      id: `team_workspace:${team.id}`,
      title: team.name,
      viewType: 'team_workspace',
      closable: true,
      params: { teamId: team.id },
    });
  };

  return (
    <div
      data-testid="ai-office-explorer"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        background: 'var(--bg-island, #ffffff)',
      }}
    >
      {/* Search and Action Bar */}
      <div
        style={{
          padding: '8px 10px',
          borderBottom: '1px solid var(--border, #e9eaee)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Input
          size="small"
          prefix={<SearchOutlined style={{ color: 'var(--fg-muted, #6c707e)' }} />}
          placeholder="Tìm nhóm AI..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          style={{ flex: 1, fontSize: 12 }}
        />
        <Tooltip title="Tạo nhóm mới">
          <Button
            size="small"
            type="text"
            icon={<PlusOutlined />}
            onClick={() => setCreateTeamOpen(true)}
            aria-label="Tạo nhóm mới"
            data-testid="ai-office-add-team-btn"
          />
        </Tooltip>
      </div>

      {/* Team List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '6px 8px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 6px',
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            color: 'var(--fg-secondary, #5f6269)',
            letterSpacing: '0.04em',
          }}
        >
          <span>Nhóm AI ({filteredTeams.length})</span>
          <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 10 }}>
            {activeCount} hoạt động
          </span>
        </div>

        {filteredTeams.length === 0 ? (
          <div style={{ padding: '16px 8px', textAlign: 'center', color: 'var(--fg-muted, #8c8f9c)' }}>
            Chưa có nhóm AI nào
          </div>
        ) : (
          filteredTeams.map((team) => {
            const leadName = team.leadId ? leadMap.get(team.leadId) : undefined;
            const count = memberCountMap.get(team.id) ?? 0;
            const statusColor = STATUS_COLOR_MAP[team.status];
            const statusLabel = STATUS_LABEL_MAP[team.status];

            return (
              <div
                key={team.id}
                role="button"
                tabIndex={0}
                data-testid={`ai-office-team-${team.id}`}
                onClick={() => handleOpenTeam(team)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    handleOpenTeam(team);
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '7px 8px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 12,
                  marginBottom: 3,
                  transition: 'background 0.15s ease',
                  border: '1px solid var(--border-subtle, #f0f2f5)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-selected, #f0f2f5)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                  <TeamOutlined style={{ fontSize: 14, color: 'var(--accent, #3871e1)', flexShrink: 0 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <Typography.Text
                      ellipsis
                      style={{ fontSize: 12.5, fontWeight: 600, display: 'block', lineHeight: 1.3 }}
                    >
                      {team.name}
                    </Typography.Text>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <span style={{ fontSize: 11, color: 'var(--fg-secondary, #5f6269)' }}>
                        {leadName ? `Lead: ${leadName}` : 'Chưa chọn lead'}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--fg-muted, #8c8f9c)' }}>
                        • {count} thành viên
                      </span>
                    </div>
                  </div>
                </div>

                <Tag
                  color={statusColor}
                  style={{ fontSize: 10, margin: 0, padding: '0 4px', lineHeight: '16px' }}
                >
                  {statusLabel}
                </Tag>
              </div>
            );
          })
        )}
      </div>

      <TeamEditorDrawer
        open={createTeamOpen}
        leads={leads}
        employees={employees}
        db={db}
        onCancel={() => setCreateTeamOpen(false)}
        onSaved={() => setCreateTeamOpen(false)}
      />
    </div>
  );
};

export default AiOfficeExplorer;
