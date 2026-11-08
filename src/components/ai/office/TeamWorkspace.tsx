import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Avatar, Button, Splitter, Tag, theme } from 'antd';
import { useLiveQuery } from 'dexie-react-hooks';
import type { TaskPlannerDatabase } from '../../../db';
import type { AiEmployee, AiLead, AiSkill, AiTeam, AiTeamMember } from '../../../types/aiOffice';
import {
  addTeamLink,
  listTeamLinks,
  listTeamMembers,
  removeTeamLink,
  topUpMemberBudget,
  updateTeam,
} from '../../../db/repositories/aiTeamRepo';
import { ensureTeamThread } from '../../../db/repositories/teamTranscriptRepo';
import { getMessagesByThreadId } from '../../../db/repositories/chatRepo';
import {
  getNineRouterApiKey,
  getNineRouterConfig,
} from '../../../services/ai/nineRouterTokenService';
import {
  createTeamRunCoordinator,
  type TeamRunCoordinator,
  type TeamRunSnapshot,
} from '../../../services/ai/office/teamRunCoordinator';
import type { ChatTurnRuntimeDeps } from '../runtime/chatTurnRuntime';
import { AiChatWidget } from '../AiChatWidget';
import { ChatMessageBubble } from '../ChatMessageBubble';
import { agentColorFor } from './AgentAttributionRow';
import { AssignmentPlanCard } from './AssignmentPlanCard';
import { AgentPausedBanner } from './AgentPausedBanner';
import { BudgetTopUpModal } from './BudgetTopUpModal';
import { TeamSidebar } from './TeamSidebar';
import { TeamSettingsDrawer } from './TeamSettingsDrawer';
import { LinkedItemPicker, type LinkedItemCandidate } from './LinkedItemPicker';
import type { LinkedItemRow } from './LinkedItemsList';

export interface TeamWorkspaceProps {
  team: AiTeam;
  lead: AiLead | undefined;
  members: AiTeamMember[];
  employees: AiEmployee[];
  skills: AiSkill[];
  db: TaskPlannerDatabase;
  onBack: () => void;
  createRuntimeDeps?: ((agentId: string) => Partial<ChatTurnRuntimeDeps>) | undefined;
}

interface CoordinatorEntry {
  coordinator: TeamRunCoordinator;
  threadId: string;
}

/**
 * D-22: one coordinator per team, held outside component state so a run survives a
 * view switch. Disposed only when the team is deleted (never on unmount).
 * Keyed by database name too, so a test database never inherits another one's run.
 */
const coordinatorRegistry = new Map<string, CoordinatorEntry>();

const registryKey = (db: TaskPlannerDatabase, teamId: string) => `${db.name}:${teamId}`;

const EMPTY_SNAPSHOT: TeamRunSnapshot = {
  phase: 'idle',
  agents: [],
  pendingPlan: null,
  pendingApproval: null,
};

const NO_MODEL_COPY =
  'Chưa có mô hình AI nào khả dụng. Mở Cài đặt để cấu hình nhà cung cấp mô hình trước khi lưu.';

const TERMINAL = new Set(['done', 'stopped', 'error']);

function initialOf(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? '?';
}

/** UI-SPEC §5b workspace: splitter, sidebar, transcript region and the shared widget. */
export const TeamWorkspace: React.FC<TeamWorkspaceProps> = ({
  team,
  lead,
  members,
  employees,
  skills,
  db,
  onBack,
  createRuntimeDeps,
}) => {
  const { token } = theme.useToken();
  const [coordinator, setCoordinator] = useState<TeamRunCoordinator | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<TeamRunSnapshot>(EMPTY_SNAPSHOT);
  const [configError, setConfigError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const lastUserTextRef = useRef<string>('');

  const roster = useMemo(
    () => (lead ? [lead, ...employees] : employees),
    [lead, employees]
  );

  const links = useLiveQuery(() => listTeamLinks(team.id, db), [db, team.id]) ?? [];
  const liveMembers = useLiveQuery(() => listTeamMembers(team.id, db), [db, team.id]) ?? members;

  // Link rows carry only (itemType, itemId); resolve the display name from the source table.
  const linkRows = useLiveQuery<LinkedItemRow[]>(async () => {
    const rows: LinkedItemRow[] = [];
    for (const link of links) {
      let name = link.itemId;
      if (link.itemType === 'cr') {
        const row = await db.changeRequests.get(link.itemId);
        if (row) name = `${row.code} · ${row.name}`;
      } else if (link.itemType === 'task') {
        const row = await db.tasks.get(link.itemId);
        if (row) name = row.name;
      } else if (link.itemType === 'system') {
        const row = await db.systems.get(link.itemId);
        if (row) name = `${row.code} · ${row.name}`;
      } else {
        const row = await db.notes.get(link.itemId);
        if (row) name = row.title || 'Không tên';
      }
      rows.push({ id: link.id, itemType: link.itemType, name });
    }
    return rows;
  }, [db, links]) ?? [];

  const messages = useLiveQuery(
    () => (threadId ? getMessagesByThreadId(threadId, db) : Promise.resolve([])),
    [db, threadId]
  ) ?? [];

  // Thread first (D-17), then provider config, then the coordinator. A coordinator
  // constructed with an empty endpoint would fail every turn, so it is never built.
  useEffect(() => {
    let cancelled = false;
    setConfigError(null);
    setThreadId(null);
    setCoordinator(null);

    void (async () => {
      const thread = await ensureTeamThread(team.id, db);
      if (cancelled) return;
      setThreadId(thread.id);

      const [apiKey, config] = await Promise.all([
        getNineRouterApiKey(db),
        getNineRouterConfig(db),
      ]);
      if (cancelled) return;
      if (!apiKey || !config.endpoint) {
        setConfigError(NO_MODEL_COPY);
        return;
      }

      const existing = coordinatorRegistry.get(registryKey(db, team.id));
      if (existing && existing.threadId === thread.id) {
        setCoordinator(existing.coordinator);
        setSnapshot(existing.coordinator.getState());
        return;
      }

      const created = createTeamRunCoordinator({
        db,
        team,
        lead: lead ?? {
          id: team.leadId,
          name: 'Lead',
          role: 'Lead',
          capability: '',
          persona: '',
          model: config.defaultModel,
          createdAt: team.createdAt,
          updatedAt: team.updatedAt,
        },
        employees,
        skills,
        threadId: thread.id,
        model: config.defaultModel,
        endpoint: config.endpoint,
        apiKey,
        ...(createRuntimeDeps ? { createRuntimeDeps } : {}),
      });
      coordinatorRegistry.set(registryKey(db, team.id), { coordinator: created, threadId: thread.id });
      setCoordinator(created);
      setSnapshot(created.getState());
    })();

    return () => {
      cancelled = true;
    };
  }, [team.id, db, lead, employees, skills, createRuntimeDeps]);

  useEffect(() => {
    if (!coordinator) return undefined;
    setSnapshot(coordinator.getState());
    return coordinator.subscribe(() => setSnapshot(coordinator.getState()));
  }, [coordinator]);

  const agentDirectory = useMemo(() => {
    const map = new Map<string, { agentId: string; name: string; role: string; isLead: boolean; color: string }>();
    for (const agent of roster) {
      map.set(agent.id, {
        agentId: agent.id,
        name: agent.name,
        role: agent.role,
        isLead: agent.id === team.leadId,
        color: agentColorFor(agent.id),
      });
    }
    return map;
  }, [roster, team.leadId]);

  const agentStatuses = useMemo(() => {
    const map = new Map<string, 'queued' | 'running' | 'paused' | 'stopped' | 'error' | 'done'>();
    for (const row of snapshot.agents) map.set(row.agentId, row.status);
    return map;
  }, [snapshot.agents]);

  const streamingAgent = snapshot.agents.find((row) => row.status === 'running');

  const agentMentionOptions = useMemo(
    () =>
      roster.map((agent) => ({
        id: agent.id,
        name: agent.name,
        role: agent.role,
        isLead: agent.id === team.leadId,
      })),
    [roster, team.leadId]
  );
  const turnStatus =
    snapshot.phase === 'awaiting-mutation-approval'
      ? 'awaiting-approval'
      : snapshot.phase === 'batch-running' || snapshot.phase === 'lead-thinking'
      ? 'streaming'
      : 'idle';

  const handleSubmit = useCallback(
    (text: string) => {
      lastUserTextRef.current = text;
      setDraft('');
      void coordinator?.send(text);
    },
    [coordinator]
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const region = transcriptRef.current;
    if (!region) return;
    const stops = Array.from(
      region.querySelectorAll<HTMLButtonElement>('[data-testid^="agent-stop-"]')
    );
    if (stops.length === 0) return;
    event.preventDefault();
    const current = stops.indexOf(document.activeElement as HTMLButtonElement);
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    const next = stops[(current + delta + stops.length) % stops.length];
    next?.focus();
  };

  const handleSaveSettings = async (input: {
    budgetTokens: number;
    budgets: Record<string, number>;
    autoSplitEnabled: boolean;
    autoApproveMutations: boolean;
  }) => {
    await updateTeam(
      team.id,
      {
        budgetTokens: input.budgetTokens,
        autoSplitEnabled: input.autoSplitEnabled,
        autoApproveMutations: input.autoApproveMutations,
      },
      db
    );
    for (const [memberId, budgetTokens] of Object.entries(input.budgets)) {
      const row = liveMembers.find((member) => member.id === memberId);
      if (!row || row.budgetTokens === budgetTokens) continue;
      await topUpMemberBudget(memberId, budgetTokens - row.budgetTokens, db);
    }
    setSettingsOpen(false);
  };

  const handleAddLink = async (item: LinkedItemCandidate) => {
    try {
      await addTeamLink({ teamId: team.id, itemType: item.itemType, itemId: item.id }, db);
    } catch {
      /* a duplicate link is already linked — nothing to add */
    }
  };

  const liveBubbles = snapshot.agents
    .filter((row) => !TERMINAL.has(row.status))
    .map((row) => {
      const agent = agentDirectory.get(row.agentId);
      return (
        <ChatMessageBubble
          key={`live-${row.agentId}`}
          message={{
            id: `live-${row.agentId}`,
            threadId: threadId ?? '',
            role: 'assistant',
            content: row.streamingText,
            createdAt: new Date().toISOString(),
          }}
          isStreaming={row.status === 'running'}
          {...(agent ? { agent } : {})}
          agentStatus={row.status}
          {...(coordinator ? { onStopAgent: () => coordinator.stopAgent(row.agentId) } : {})}
        />
      );
    });

  const transcriptExtensions = (
    <>
      {liveBubbles}
      {snapshot.pendingPlan && (
        <AssignmentPlanCard
          plan={snapshot.pendingPlan}
          decision={undefined}
          onApprove={() => coordinator?.resolvePlan(true)}
          onReject={() => coordinator?.resolvePlan(false)}
        />
      )}
      {snapshot.phase === 'awaiting-budget' && (
        <AgentPausedBanner
          teamName={team.name}
          onTopUp={() => setTopUpOpen(true)}
        />
      )}
    </>
  );

  return (
    <div
      data-testid="team-workspace"
      style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Button size="small" type="text" onClick={onBack} data-testid="team-workspace-back">
          ← Danh sách nhóm
        </Button>
      </div>

      <Splitter
        style={{
          height: '100%',
          borderRadius: 8,
          overflow: 'hidden',
          background: token.colorBgContainer,
        }}
      >
        <Splitter.Panel defaultSize="300px" min="260px" max="380px">
          <TeamSidebar
            team={team}
            lead={lead}
            members={liveMembers}
            employees={employees}
            links={linkRows}
            snapshot={snapshot}
            onTopUp={() => setTopUpOpen(true)}
            onOpenSettings={() => setSettingsOpen(true)}
            onToggleAutoSplit={(next) => {
              void updateTeam(team.id, { autoSplitEnabled: next }, db);
            }}
            onToggleAutoApprove={(next) => {
              void updateTeam(team.id, { autoApproveMutations: next }, db);
            }}
            onAddLink={() => setPickerOpen(true)}
            onRemoveLink={(linkId) => {
              void removeTeamLink(linkId, db);
            }}
          />
        </Splitter.Panel>

        <Splitter.Panel>
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div
              data-testid="team-workspace-header"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 16px',
                borderBottom: `1px solid ${token.colorBorderSecondary}`,
              }}
            >
              <span style={{ fontSize: 20, fontWeight: 600 }}>{team.name}</span>
              {lead && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Avatar
                    size={20}
                    shape="square"
                    style={{ backgroundColor: agentColorFor(lead.id), color: '#ffffff' }}
                  >
                    {initialOf(lead.name)}
                  </Avatar>
                  <span style={{ fontSize: 12 }}>{lead.name}</span>
                </span>
              )}
              <Tag color={team.status === 'active' ? 'success' : 'default'}>
                {team.status === 'active' ? 'Đang hoạt động' : 'Tạm dừng'}
              </Tag>
              <Button
                size="small"
                style={{ marginLeft: 'auto' }}
                onClick={() => setSettingsOpen(true)}
                data-testid="team-header-settings"
              >
                Cài đặt nhóm
              </Button>
            </div>

            <div
              ref={transcriptRef}
              tabIndex={0}
              role="region"
              aria-label="Hội thoại nhóm"
              data-testid="team-transcript-region"
              onKeyDown={handleKeyDown}
              style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', outline: 'none' }}
            >
              {configError ? (
                <div style={{ padding: 16 }}>
                  <Alert type="warning" showIcon message={configError} />
                </div>
              ) : !coordinator ? (
                // A composer that silently drops input would read as a hang; wait for the
                // coordinator instead of rendering a dead widget.
                <div style={{ padding: 16, fontSize: 12, color: token.colorTextSecondary }}>
                  Đang chuẩn bị nhóm...
                </div>
              ) : (
                <AiChatWidget
                  scope={{
                    kind: 'chat',
                    threadId: threadId ?? '',
                    scopeKey: 'team:' + team.id,
                    label: team.name,
                  }}
                  messages={messages}
                  turn={{
                    status: turnStatus,
                    streamingText: streamingAgent?.streamingText ?? '',
                    streamingStatusLabel: null,
                    pendingApproval: snapshot.pendingApproval,
                  }}
                  onSubmit={handleSubmit}
                  onStop={() => coordinator?.abortAll()}
                  onResolveApproval={(approved) => coordinator?.resolveApproval(approved)}
                  onRetry={() => {
                    if (lastUserTextRef.current) void coordinator?.send(lastUserTextRef.current);
                  }}
                  error={null}
                  toolbox={{
                    selectedModel: lead?.model ?? '',
                    availableModels: [],
                    onModelChange: () => {},
                    analysisMode: true,
                    onToggleAnalysisMode: () => {},
                    autoApproveMutations: team.autoApproveMutations === true,
                    onToggleAutoApproveMutations: () => {
                      void updateTeam(
                        team.id,
                        { autoApproveMutations: team.autoApproveMutations !== true },
                        db
                      );
                    },
                    mcpEnabled: false,
                    onToggleMcpEnabled: () => {},
                  }}
                  quickPrompts={[]}
                  onClearThread={() => {}}
                  draft={draft}
                  onDraftChange={setDraft}
                  placeholder="Nhắn cho lead hoặc @ một nhân viên..."
                  emptyState={{
                    heading: 'Bắt đầu làm việc với nhóm',
                    body: 'Nhập yêu cầu bên dưới để lead phân rã và chia việc. Gõ @ để nói trực tiếp với một nhân viên.',
                  }}
                  messageListExtensions={{
                    agentDirectory,
                    agentStatuses,
                    ...(coordinator ? { onStopAgent: (agentId: string) => coordinator.stopAgent(agentId) } : {}),
                  }}
                  transcriptExtensions={transcriptExtensions}
                  agentMentionOptions={agentMentionOptions}
                />
              )}
            </div>
          </div>
        </Splitter.Panel>
      </Splitter>

      <TeamSettingsDrawer
        open={settingsOpen}
        team={team}
        members={liveMembers}
        lead={lead}
        employees={employees}
        links={linkRows}
        onCancel={() => setSettingsOpen(false)}
        onSave={(input) => {
          void handleSaveSettings(input);
        }}
      />

      <LinkedItemPicker
        open={pickerOpen}
        db={db}
        onCancel={() => setPickerOpen(false)}
        onAdd={(item) => {
          void handleAddLink(item);
        }}
      />

      <BudgetTopUpModal
        open={topUpOpen}
        scope={{ kind: 'team', name: team.name }}
        used={liveMembers.reduce((sum, row) => sum + row.usedTokens, 0)}
        budget={team.budgetTokens}
        onCancel={() => setTopUpOpen(false)}
        onConfirm={(amount) => {
          setTopUpOpen(false);
          void coordinator?.topUp({ kind: 'team' }, amount);
        }}
      />
    </div>
  );
};

export default TeamWorkspace;
