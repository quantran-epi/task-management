import React, { useMemo, useState } from 'react';
import { Button, Empty, Tag, theme } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import { listEmployees, listLeads, listSkills } from '../db/repositories/aiOfficeRepo';
import { activateTeam, listTeams, pauseTeam } from '../db/repositories/aiTeamRepo';
import type { ChatTurnRuntimeDeps } from '../components/ai/runtime/chatTurnRuntime';
import { PageHeader } from '../components/common/PageHeader';
import { TeamCard, type TeamCardMember } from '../components/ai/office/TeamCard';
import { TeamEditorDrawer } from '../components/ai/office/TeamEditorDrawer';
import { TeamWorkspace } from '../components/ai/office/TeamWorkspace';
import type { AiTeam } from '../types/aiOffice';

export interface TeamsViewProps {
  db?: TaskPlannerDatabase | undefined;
  /** Test seam forwarded to the workspace coordinator; production omits it. */
  createRuntimeDeps?: ((agentId: string) => Partial<ChatTurnRuntimeDeps>) | undefined;
}

type TeamsMode = 'list' | 'workspace';

/**
 * UI-SPEC §5 team page. Two modes in one view, driven by local state rather than
 * routing: the list is the entry surface and the workspace replaces it in place.
 */
export const TeamsView: React.FC<TeamsViewProps> = ({ db = defaultDb, createRuntimeDeps }) => {
  const { token } = theme.useToken();
  const [mode, setMode] = useState<TeamsMode>('list');
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const teams = useLiveQuery(() => listTeams(db), [db]) ?? [];
  const leads = useLiveQuery(() => listLeads(db), [db]) ?? [];
  const employees = useLiveQuery(() => listEmployees(db), [db]) ?? [];
  const skills = useLiveQuery(() => listSkills(db), [db]) ?? [];
  const allMembers = useLiveQuery(() => db.aiTeamMembers.toArray(), [db]) ?? [];

  const activeCount = teams.filter((team) => team.status === 'active').length;

  const rosterByTeam = useMemo(() => {
    const map = new Map<string, TeamCardMember[]>();
    for (const member of allMembers) {
      if (member.role !== 'employee') continue;
      const agent = employees.find((row) => row.id === member.agentId);
      if (!agent) continue;
      const rows = map.get(member.teamId) ?? [];
      rows.push({ agentId: agent.id, name: agent.name });
      map.set(member.teamId, rows);
    }
    return map;
  }, [allMembers, employees]);

  const usedByTeam = useMemo(() => {
    const map = new Map<string, number>();
    for (const member of allMembers) {
      map.set(member.teamId, (map.get(member.teamId) ?? 0) + member.usedTokens);
    }
    return map;
  }, [allMembers]);

  const leadFor = (team: AiTeam) => leads.find((lead) => lead.id === team.leadId);

  const openTeam = (team: AiTeam) => {
    setActiveTeamId(team.id);
    setMode('workspace');
  };

  const activeTeam = activeTeamId ? teams.find((team) => team.id === activeTeamId) : undefined;
  const activeMembers = activeTeam
    ? allMembers.filter((member) => member.teamId === activeTeam.id)
    : [];

  if (mode === 'workspace') {
    if (!activeTeam) {
      // A stale id after a delete must not crash; fall back to the list.
      return (
        <div data-testid="teams-view" style={{ padding: 16 }}>
          <Button onClick={() => setMode('list')}>Quay lại danh sách nhóm</Button>
        </div>
      );
    }
    return (
      <div data-testid="teams-view" style={{ height: '100%', padding: 16 }}>
        <TeamWorkspace
          team={activeTeam}
          lead={leadFor(activeTeam)}
          members={activeMembers}
          employees={employees}
          skills={skills}
          db={db}
          onBack={() => {
            setMode('list');
            setActiveTeamId(null);
          }}
          {...(createRuntimeDeps ? { createRuntimeDeps } : {})}
        />
      </div>
    );
  }

  return (
    <div
      data-testid="teams-view"
      style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 16 }}
    >
      <PageHeader
        title="Nhóm AI"
        subtitle="Mỗi nhóm gồm một lead và tối đa ba nhân viên"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditorOpen(true)}>
            Tạo nhóm
          </Button>
        }
      />

      <div>
        <Tag color={activeCount === 3 ? 'warning' : 'default'}>{`Đang hoạt động ${activeCount}/3`}</Tag>
      </div>

      {teams.length === 0 ? (
        <div
          style={{
            padding: '48px 16px',
            background: token.colorBgContainer,
            borderRadius: 8,
            border: `1px solid ${token.colorBorderSecondary}`,
            textAlign: 'center',
          }}
        >
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <div>
                <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 6 }}>Chưa có nhóm nào</div>
                <div style={{ color: token.colorTextSecondary, maxWidth: 460, margin: '0 auto 16px' }}>
                  Nhóm gồm một lead và tối đa ba nhân viên. Tạo nhóm để lead nhận yêu cầu và chia việc.
                </div>
              </div>
            }
          >
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditorOpen(true)}>
              Tạo nhóm
            </Button>
          </Empty>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 16,
          }}
        >
          {teams.map((team) => (
            <TeamCard
              key={team.id}
              team={team}
              lead={leadFor(team)}
              members={rosterByTeam.get(team.id) ?? []}
              usedTokens={usedByTeam.get(team.id) ?? 0}
              activeCount={activeCount}
              onOpen={() => openTeam(team)}
              onActivate={() => {
                void activateTeam(team.id, db).catch(() => {
                  /* the cap message is surfaced by the disabled button */
                });
              }}
              onPause={() => {
                void pauseTeam(team.id, db);
              }}
            />
          ))}
        </div>
      )}

      <TeamEditorDrawer
        open={editorOpen}
        leads={leads}
        employees={employees}
        activeCount={activeCount}
        db={db}
        onCancel={() => setEditorOpen(false)}
        onSaved={() => setEditorOpen(false)}
      />
    </div>
  );
};

export default TeamsView;
