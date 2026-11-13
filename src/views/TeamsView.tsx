import React, { useMemo, useState } from 'react';
import { Button, Empty, Tag, message, theme } from 'antd';
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
import { DEFAULT_BUDGET_WARN_THRESHOLD_PCT } from '../types/aiOffice';
import { getGlobalBudgetWarnThresholdPct } from '../services/ai/budgetWarnSettings';
import { resolveThresholdPct } from '../services/ai/office/budgetGate';

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
  // IN-08b: the card's settings button must land in the drawer, not just the workspace.
  const [settingsOnOpen, setSettingsOnOpen] = useState(false);

  const teams = useLiveQuery(() => listTeams(db), [db]) ?? [];
  const leads = useLiveQuery(() => listLeads(db), [db]) ?? [];
  const employees = useLiveQuery(() => listEmployees(db), [db]) ?? [];
  const skills = useLiveQuery(() => listSkills(db), [db]) ?? [];
  const allMembers = useLiveQuery(() => db.aiTeamMembers.toArray(), [db]) ?? [];
  // D-04/R3-W1: one live global read for the whole card list, so a Settings change
  // recolours every card without a reload. Each card resolves its own override on top.
  const globalThresholdPct =
    useLiveQuery(() => getGlobalBudgetWarnThresholdPct(db), [db]) ??
    DEFAULT_BUDGET_WARN_THRESHOLD_PCT;

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

  const openTeam = (team: AiTeam, openSettings = false) => {
    setActiveTeamId(team.id);
    setSettingsOnOpen(openSettings);
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
          initialSettingsOpen={settingsOnOpen}
          onBack={() => {
            setMode('list');
            setActiveTeamId(null);
            setSettingsOnOpen(false);
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
        subtitle="Mỗi nhóm bắt đầu rỗng — chọn lead và thêm nhân viên trong Cài đặt nhóm"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditorOpen(true)}>
            Tạo nhóm
          </Button>
        }
      />

      <div>
        <Tag color="default">{`Đang hoạt động ${activeCount}`}</Tag>
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
                  Nhóm bắt đầu rỗng. Tạo nhóm trước, rồi chọn lead và thêm nhân viên trong Cài đặt nhóm.
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
              budgetWarnThresholdPct={resolveThresholdPct(team, globalThresholdPct)}
              onOpen={() => openTeam(team)}
              onOpenSettings={() => openTeam(team, true)}
              onActivate={() => {
                // WR-12: a rejection must reach the user, not escape as an unhandled one.
                void activateTeam(team.id, db).catch(() =>
                  message.error('Không đổi được trạng thái nhóm. Vui lòng thử lại.')
                );
              }}
              onPause={() => {
                void pauseTeam(team.id, db).catch(() =>
                  message.error('Không đổi được trạng thái nhóm. Vui lòng thử lại.')
                );
              }}
            />
          ))}
        </div>
      )}

      <TeamEditorDrawer
        open={editorOpen}
        leads={leads}
        employees={employees}
        db={db}
        onCancel={() => setEditorOpen(false)}
        onSaved={() => setEditorOpen(false)}
      />
    </div>
  );
};

export default TeamsView;
