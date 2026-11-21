import React from 'react';
import { Button, Empty, EmptyImageSimple } from '../components/ui';
import { ArrowLeftOutlined } from '../components/ui/icon';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import { listEmployees, listLeads, listSkills } from '../db/repositories/aiOfficeRepo';
import { listTeams } from '../db/repositories/aiTeamRepo';
import { TeamWorkspace } from '../components/ai/office/TeamWorkspace';
import { useLayoutStore } from '../workbench/store/layoutStore';
import type { AiTeam } from '../types/aiOffice';
import type { ChatTurnRuntimeDeps } from '../components/ai/runtime/chatTurnRuntime';

export interface TeamWorkspaceViewProps {
  db?: TaskPlannerDatabase | undefined;
  teamId: string;
  /** OS-notification deeplink target: scroll to and highlight this message on mount. */
  targetMessageId?: string | undefined;
  createRuntimeDeps?: ((agentId: string) => Partial<ChatTurnRuntimeDeps>) | undefined;
}

export const TeamWorkspaceView: React.FC<TeamWorkspaceViewProps> = ({
  db = defaultDb,
  teamId,
  targetMessageId,
  createRuntimeDeps,
}) => {
  const closeTab = useLayoutStore((state) => state.closeTab);
  const teams = useLiveQuery(() => listTeams(db), [db]) ?? [];
  const leads = useLiveQuery(() => listLeads(db), [db]) ?? [];
  const employees = useLiveQuery(() => listEmployees(db), [db]) ?? [];
  const skills = useLiveQuery(() => listSkills(db), [db]) ?? [];
  const allMembers = useLiveQuery(() => db.aiTeamMembers.toArray(), [db]) ?? [];

  const team = teams.find((t) => t.id === teamId);
  const leadFor = (t: AiTeam) => leads.find((lead) => lead.id === t.leadId);
  const activeMembers = team
    ? allMembers.filter((member) => member.teamId === team.id)
    : [];

  if (!team) {
    return (
      <div
        data-testid="team-workspace-missing"
        style={{
          padding: 32,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
        }}
      >
        <Empty
          description="Không tìm thấy nhóm AI này hoặc nhóm đã bị xóa."
          image={EmptyImageSimple}
        >
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => closeTab(`team_workspace:${teamId}`)}
          >
            Đóng tab
          </Button>
        </Empty>
      </div>
    );
  }

  return (
    <div
      data-testid="team-workspace-view"
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <TeamWorkspace
        team={team}
        lead={leadFor(team)}
        members={activeMembers}
        employees={employees}
        skills={skills}
        db={db}
        {...(targetMessageId ? { targetMessageId } : {})}
        {...(createRuntimeDeps ? { createRuntimeDeps } : {})}
      />
    </div>
  );
};

export default TeamWorkspaceView;
