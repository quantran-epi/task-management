import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Avatar, Button, Modal, Splitter, Tag, Typography, theme } from 'antd';
import { BugOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import type { TaskPlannerDatabase } from '../../../db';
import type { AiEmployee, AiLead, AiSkill, AiTeam, AiTeamMember } from '../../../types/aiOffice';
import {
  addTeamLink,
  addTeamMember,
  assignLeader,
  getTeam,
  listTeamLinks,
  listTeamMembers,
  lockLeader,
  removeTeamLink,
  removeTeamMember,
  setMemberBudget,
  topUpMemberBudget,
  updateTeam,
} from '../../../db/repositories/aiTeamRepo';
import {
  listEmployees,
  listLeads,
  listSkills,
} from '../../../db/repositories/aiOfficeRepo';
import { ensureTeamThread, listInterruptedAssignments } from '../../../db/repositories/teamTranscriptRepo';
import { getMessagesByThreadId } from '../../../db/repositories/chatRepo';
import {
  getNineRouterApiKey,
  getNineRouterConfig,
} from '../../../services/ai/nineRouterTokenService';
import {
  BUSY_PHASES,
  createTeamRunCoordinator,
  type TeamRunCoordinator,
  type TeamRunSnapshot,
} from '../../../services/ai/office/teamRunCoordinator';
import { getOrCreateRun } from '../../../services/ai/office/teamRunManager';
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
  /** IN-08b: the card's settings button lands here so the drawer is already open. */
  initialSettingsOpen?: boolean;
  createRuntimeDeps?: ((agentId: string) => Partial<ChatTurnRuntimeDeps>) | undefined;
}

/**
 * D-18: coordinator ownership lives in `teamRunManager`, so the explorer's delete path —
 * which never mounts this workspace — can tear a run down too.
 */
const EMPTY_SNAPSHOT: TeamRunSnapshot = {
  phase: 'idle',
  agents: [],
  pendingPlan: null,
  pendingApproval: null,
  pausedAgentId: null,
  pausedAgentName: null,
  lastPlan: null,
  lastPlanDecision: null,
};

const NO_MODEL_COPY =
  'Chưa có mô hình AI nào khả dụng. Mở Cài đặt để cấu hình nhà cung cấp mô hình trước khi lưu.';

/** WR-12: one fixed message for every fire-and-forget failure — repo errors can embed ids. */
const ACTION_ERROR_COPY = 'Không lưu được thay đổi. Vui lòng thử lại.';

/** WR-02: a refused retry is a normal outcome (busy phase, disposed run), not a dead end. */
const RETRY_ERROR_COPY = 'Chưa thể chạy lại lần này. Hãy chờ lượt hiện tại kết thúc rồi thử lại.';

/** IN-05: fixed copy — a repo error message can embed ids, which must not reach the UI. */
const LEADER_LOCK_FAILED_COPY = 'Không khoá được leader cho nhóm. Vui lòng thử lại.';

const TERMINAL = new Set(['done', 'stopped', 'error']);

function initialOf(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? '?';
}

/** D-20: the queue is visible above the composer, in dispatch order. */
interface OutboxPanelProps {
  entries: Array<{ id: string; text: string }>;
  onCancel: (id: string) => void;
}

const OutboxPanel: React.FC<OutboxPanelProps> = ({ entries, onCancel }) => {
  const { token } = theme.useToken();
  if (entries.length === 0) return null;
  return (
    <div
      data-testid="team-outbox"
      style={{
        margin: '0 16px 4px',
        padding: '6px 10px',
        borderRadius: 6,
        background: token.colorFillQuaternary,
        fontSize: 12,
      }}
    >
      <div style={{ color: token.colorTextSecondary, marginBottom: 2 }}>
        Đang xếp hàng ({entries.length})
      </div>
      {entries.map((entry, index) => (
        <div
          key={entry.id}
          data-testid="team-outbox-item"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            color: token.colorText,
            minWidth: 0,
          }}
        >
          {index === 0 && (
            <span style={{ color: token.colorTextTertiary, flexShrink: 0 }}>tiếp theo</span>
          )}
          <span
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}
          >
            {entry.text}
          </span>
          <Button
            type="text"
            size="small"
            danger
            style={{ width: 20, height: 20, padding: 0, flexShrink: 0 }}
            aria-label="Huỷ tin nhắn đang xếp hàng"
            data-testid="team-outbox-cancel"
            onClick={() => onCancel(entry.id)}
          >
            ×
          </Button>
        </div>
      ))}
    </div>
  );
};

/** UI-SPEC §5b workspace: splitter, sidebar, transcript region and the shared widget. */
interface TeamDebugLog {
  timestamp: string;
  agentId: string;
  agentName: string;
  agentKind: string;
  model: string;
  text: string;
  systemMessages: string[];
  toolNames: string[];
}

export const TeamWorkspace: React.FC<TeamWorkspaceProps> = ({
  team,
  lead,
  members,
  employees,
  skills,
  db,
  onBack,
  initialSettingsOpen = false,
  createRuntimeDeps,
}) => {
  const { token } = theme.useToken();
  const [coordinator, setCoordinator] = useState<TeamRunCoordinator | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<TeamRunSnapshot>(EMPTY_SNAPSHOT);
  const [configError, setConfigError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(initialSettingsOpen);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [topUpOpen, setTopUpOpen] = useState(false);
  // D-21: which budget the top-up dialog targets. Defaults to the team; the paused
  // banner switches it to the parked agent so the right gate opens.
  const [topUpScope, setTopUpScope] = useState<{ kind: 'team' } | { kind: 'agent'; agentId: string }>({
    kind: 'team',
  });
  const [planDecision, setPlanDecision] = useState<'approved' | 'rejected' | undefined>(undefined);
  const [analysisMode, setAnalysisMode] = useState<boolean>(true);
  const [mcpEnabled, setMcpEnabled] = useState<boolean>(false);
  const [debugLogs, setDebugLogs] = useState<TeamDebugLog[]>([]);
  const [debugModalOpen, setDebugModalOpen] = useState<boolean>(false);
  const [sendError, setSendError] = useState<{ code: string; message: string } | null>(null);
  // D-20/D-21: a submit while a turn is live or parked waits here, never at the composer.
  const [outbox, setOutbox] = useState<Array<{ id: string; text: string }>>([]);
  const [dispatchInFlight, setDispatchInFlight] = useState(false);
  const releasingRef = useRef(false);
  // WR-12: every fire-and-forget repo call in this component reports here instead of
  // escaping as an unhandled rejection.
  const [actionError, setActionError] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const lastUserTextRef = useRef<string>('');

  const links = useLiveQuery(() => listTeamLinks(team.id, db), [db, team.id]) ?? [];
  const liveMembers = useLiveQuery(() => listTeamMembers(team.id, db), [db, team.id]) ?? members;
  // D-09: the leader Select's option source. `lead` stays the current-selection display.
  const leads = useLiveQuery(() => listLeads(db), [db]) ?? [];

  // AIO-TEAM-04: only this team's own roster is addressable. A non-member has no member
  // row, so its budget is 0 and an @mention would park that turn forever.
  const roster = useMemo(() => {
    const memberIds = new Set(liveMembers.map((member) => member.agentId));
    const members = employees.filter((employee) => memberIds.has(employee.id));
    return lead ? [lead, ...members] : members;
  }, [lead, employees, liveMembers]);
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

  // D-19: an unfinished turn is inferred from persisted rows (no runtime status is stored).
  // The warning is advisory only — it never gates the composer and offers no resume.
  const interrupted = useLiveQuery(
    () => (threadId ? listInterruptedAssignments(threadId, db) : Promise.resolve([])),
    [db, threadId]
  ) ?? [];
  const [interruptedDismissed, setInterruptedDismissed] = useState(false);
  useEffect(() => setInterruptedDismissed(false), [threadId]);

  // WR-07: the inference is persisted-row-only, so an in-flight turn also looks interrupted
  // (instruction saved, report not yet). Filtering happens HERE at the render site, not in
  // the reader: `listInterruptedAssignments` stays pure and phase 37 can extend it.
  const interruptedVisible = useMemo(() => {
    const live = new Set(
      snapshot.agents.filter((row) => !TERMINAL.has(row.status)).map((row) => row.agentId)
    );
    return interrupted.filter((entry) => !live.has(entry.agentId));
  }, [interrupted, snapshot.agents]);

  // Thread first (D-17), then provider config, then the coordinator. A coordinator
  // constructed with an empty endpoint would fail every turn, so it is never built.
  // WR-06: keyed on team.id only. `employees`/`skills` are live-query arrays whose
  // identity changes on every DB write; depending on them tore the effect down mid-run
  // while the registry still returned the old coordinator.
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

      // D-18: the manager owns the entry, so a stale-thread coordinator is disposed before
      // the replacement is handed back — one live coordinator per team at every instant.
      const created = await getOrCreateRun(db, team.id, thread.id, () =>
        createTeamRunCoordinator({
        db,
        team,
        lead: lead ?? {
          id: team.leadId ?? '',
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
        // D-03/D-07: every turn reads a fresh roster from Dexie. The team row is read
        // inside the turn and the lead is matched against ITS `leadId`, so neither the
        // construction-time `lead` prop nor a captured `team.leadId` decides a turn.
        loadRoster: async () => {
          const teamRow = await getTeam(team.id, db);
          const [leads, allEmployees, allSkills, memberRows] = await Promise.all([
            listLeads(db),
            listEmployees(db),
            listSkills(db),
            listTeamMembers(team.id, db),
          ]);
          return {
            teamRow,
            lead: leads.find((row) => row.id === teamRow?.leadId),
            // WR-03: the lead prompt must advertise only this team's roster. Handing it
            // every global employee makes `delegate_batch` refuse the whole batch.
            employees: allEmployees.filter((row) =>
              memberRows.some((member) => member.agentId === row.id)
            ),
            skills: allSkills,
            memberAgentIds: memberRows.map((row) => row.agentId),
          };
        },
        createRuntimeDeps: (agentId: string) => {
          const clientDeps = createRuntimeDeps?.(agentId) ?? {};
          return {
            ...clientDeps,
            runLoop: async (opts) => {
              const agent = agentId === team.leadId ? lead : employees.find((e) => e.id === agentId);
              const agentName = agent?.name ?? (agentId === team.leadId ? 'Lead' : agentId);
              const agentKind = agentId === team.leadId ? 'Lead' : 'Employee';
              const systemMessages = (opts.messages || [])
                .filter((m) => m.role === 'system' && typeof m.content === 'string')
                .map((m) => m.content as string);
              const userMessages = (opts.messages || []).filter((m) => m.role === 'user');
              const lastUserMsg = userMessages[userMessages.length - 1]?.content ?? '';
              const text = typeof lastUserMsg === 'string' ? lastUserMsg : JSON.stringify(lastUserMsg);
              const toolNames = (opts.tools || []).map((t: any) => t.function?.name ?? t.name ?? 'tool');

              setDebugLogs((prev) => [
                ...prev,
                {
                  timestamp: new Date().toLocaleTimeString(),
                  agentId,
                  agentName,
                  agentKind,
                  model: opts.model,
                  text,
                  systemMessages,
                  toolNames,
                },
              ]);
              if (clientDeps.runLoop) {
                return clientDeps.runLoop(opts);
              }
              const defaultDeps = (await import('../runtime/chatTurnRuntime')).createDefaultChatTurnDeps(db);
              return defaultDeps.runLoop(opts);
            },
          };
        },
        })
      );
      // The await is a dispose window: a remount or team switch in between must not set state.
      if (cancelled) return;
      setCoordinator(created);
      setSnapshot(created.getState());
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- WR-06: the roster is read per turn via loadRoster, so it must not be an effect dependency
  }, [team.id, db, createRuntimeDeps]);

  useEffect(() => {
    if (!coordinator) return undefined;
    setSnapshot(coordinator.getState());
    return coordinator.subscribe(() => setSnapshot(coordinator.getState()));
  }, [coordinator]);

  // D-25: a toggle changed in the sidebar or settings drawer must reach the live run.
  useEffect(() => {
    coordinator?.setTeamSettings({
      autoSplitEnabled: team.autoSplitEnabled === true,
      autoApproveMutations: team.autoApproveMutations === true,
      ...(team.concurrencyLimit !== undefined
        ? { concurrencyLimit: team.concurrencyLimit }
        : {}),
    });
  }, [coordinator, team.autoSplitEnabled, team.autoApproveMutations, team.concurrencyLimit]);

  // A fresh plan clears the previous decision so the card shows its buttons again.
  useEffect(() => {
    setPlanDecision(undefined);
  }, [snapshot.pendingPlan]);

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

  /**
   * D-09: the first run locks the leader. Both the decision and the write read the PERSISTED
   * team row at send time — a leader assigned through the settings drawer after mount is
   * invisible to the `team` prop. A failed lock surfaces an error instead of running silently.
   */
  const sendTurn = useCallback(
    async (text: string): Promise<'started' | 'busy' | 'blocked'> => {
      // D-20: every non-starting path states WHY, so the caller can route the text
      // (outbox on `busy`, draft on `blocked`) instead of dropping it.
      if (!coordinator) {
        setSendError({ code: 'NO_COORDINATOR', message: 'Nhóm chưa sẵn sàng để nhận tin nhắn.' });
        return 'blocked';
      }
      try {
        const persisted = await getTeam(team.id, db);
        if (persisted && persisted.leaderLockedAt === undefined && persisted.leadId !== undefined) {
          await lockLeader(team.id, db);
        }
      } catch {
        // IN-05: the repo message can embed ids, so the fixed copy is what reaches the UI.
        setSendError({ code: 'LEADER_LOCK_FAILED', message: LEADER_LOCK_FAILED_COPY });
        return 'blocked';
      }
      const outcome = await coordinator.send(text);
      if (outcome === 'blocked') {
        setSendError({
          code: 'COORDINATOR_DISPOSED',
          message: 'Nhóm này đã bị xoá hoặc dừng. Mở lại nhóm để tiếp tục.',
        });
      }
      return outcome;
    },
    [coordinator, db, team.id]
  );

  /**
   * D-20: the ONLY dispatcher. It clears `sendError` first (so `InlineApiErrorCard` comes
   * down the moment a retry starts) and gives every outcome a no-loss home: `busy` goes to
   * the front of the outbox, `blocked` restores the draft. Requeueing `blocked` would loop
   * forever — a disposed coordinator's phase never leaves `ready`.
   */
  const runTurn = useCallback(
    async (text: string) => {
      setSendError(null);
      setDispatchInFlight(true);
      try {
        const outcome = await sendTurn(text);
        if (outcome === 'busy') {
          setOutbox((queue) => [{ id: crypto.randomUUID(), text }, ...queue]);
        } else if (outcome === 'blocked') {
          setDraft(text);
        }
      } catch (err) {
        // A throw is a `blocked` submit with a different cause: keep the text, not the error.
        setSendError({
          code: 'TURN_FAILED',
          message: err instanceof Error ? err.message : String(err),
        });
        setDraft(text);
      } finally {
        setDispatchInFlight(false);
      }
    },
    [sendTurn]
  );

  /**
   * D-20: one entry rule for the composer. The authoritative gate is the coordinator's
   * phase, never a component-local flag: a turn started by a retry or surviving a remount
   * must still queue the next submit.
   */
  const handleSubmit = useCallback(
    (text: string) => {
      lastUserTextRef.current = text;
      if (!text.trim()) return;
      if (BUSY_PHASES.has(snapshot.phase) || dispatchInFlight || outbox.length > 0) {
        setOutbox((queue) => [...queue, { id: crypto.randomUUID(), text }]);
        setDraft('');
        return;
      }
      setDraft('');
      void runTurn(text);
    },
    [snapshot.phase, dispatchInFlight, outbox.length, runTurn]
  );

  // D-21: exactly one entry is released per settle, and only once the phase is free again.
  useEffect(() => {
    if (!coordinator || dispatchInFlight || outbox.length === 0) return undefined;
    if (BUSY_PHASES.has(snapshot.phase)) return undefined;
    const next = outbox[0];
    if (!next || releasingRef.current) return undefined;
    releasingRef.current = true;
    setOutbox((queue) => (queue[0]?.id === next.id ? queue.slice(1) : queue));
    void runTurn(next.text).finally(() => {
      releasingRef.current = false;
    });
    return undefined;
  }, [coordinator, dispatchInFlight, snapshot.phase, outbox, runTurn]);

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

  /** WR-12: fire-and-forget, but a rejection lands in the one action-error channel. */
  const runAction = useCallback((action: () => Promise<unknown>) => {
    setActionError(null);
    void action().catch(() => setActionError(ACTION_ERROR_COPY));
  }, []);

  const handleSaveSettings = async (input: {
    budgetTokens: number;
    budgets: Record<string, number>;
    autoSplitEnabled: boolean;
    autoApproveMutations: boolean;
    concurrencyLimit: number;
  }) => {
    await updateTeam(
      team.id,
      {
        budgetTokens: input.budgetTokens,
        autoSplitEnabled: input.autoSplitEnabled,
        autoApproveMutations: input.autoApproveMutations,
        concurrencyLimit: input.concurrencyLimit,
      },
      db
    );
    // D-04: the limit applies to the run in flight, not only the next construction.
    coordinator?.setTeamSettings({ concurrencyLimit: input.concurrencyLimit });
    // AIO-BUDGET-01: adopt the edited total before any member top-up, so a later team
    // top-up accumulates onto the saved number instead of the construction snapshot.
    coordinator?.setTeamBudget(input.budgetTokens);
    for (const [memberId, budgetTokens] of Object.entries(input.budgets)) {
      const row = liveMembers.find((member) => member.id === memberId);
      if (!row || row.budgetTokens === budgetTokens) continue;
      const delta = budgetTokens - row.budgetTokens;
      // CR-02: a decrease is a plain budget write — routing it through topUp would add a
      // negative amount and open the gate on a budget that just went down.
      if (delta > 0) {
        await coordinator?.topUp({ kind: 'agent', agentId: row.agentId }, delta);
        if (!coordinator) await topUpMemberBudget(memberId, delta, db);
      } else if (delta < 0) {
        await setMemberBudget(memberId, budgetTokens, db);
      }
    }
    setSettingsOpen(false);
  };

  const handleAddLink = async (item: LinkedItemCandidate) => {
    try {
      await addTeamLink({ teamId: team.id, itemType: item.itemType, itemId: item.id }, db);
    } catch (err) {
      // IN-08c: only a duplicate link is silent — anything else means the write failed.
      if (err instanceof Error && err.message === 'Mục này đã được liên kết với nhóm.') return;
      setActionError(ACTION_ERROR_COPY);
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
      {(snapshot.pendingPlan ?? snapshot.lastPlan) && (
        <AssignmentPlanCard
          plan={(snapshot.pendingPlan ?? snapshot.lastPlan)!}
          decision={
            snapshot.pendingPlan ? planDecision : snapshot.lastPlanDecision ?? undefined
          }
          onApprove={() => {
            setPlanDecision('approved');
            coordinator?.resolvePlan(true);
          }}
          onReject={() => {
            setPlanDecision('rejected');
            coordinator?.resolvePlan(false);
          }}
        />
      )}
      {snapshot.phase === 'awaiting-budget' && (
        <AgentPausedBanner
          teamName={team.name}
          {...(snapshot.pausedAgentName ? { agentName: snapshot.pausedAgentName } : {})}
          onTopUp={() => {
            // D-21: target the parked agent's own budget when one agent's gate is closed.
            setTopUpScope(
              snapshot.pausedAgentId
                ? { kind: 'agent', agentId: snapshot.pausedAgentId }
                : { kind: 'team' }
            );
            setTopUpOpen(true);
          }}
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
        <Splitter.Panel defaultSize={300} min={260} max={380}>
          <TeamSidebar
            team={team}
            lead={lead}
            members={liveMembers}
            employees={employees}
            links={linkRows}
            snapshot={snapshot}
            onTopUp={() => {
              // A sidebar top-up is always team-scoped; never inherit a banner's agent scope.
              setTopUpScope({ kind: 'team' });
              setTopUpOpen(true);
            }}
            onOpenSettings={() => setSettingsOpen(true)}
            onToggleAutoSplit={(next) => {
              runAction(() => updateTeam(team.id, { autoSplitEnabled: next }, db));
            }}
            onToggleAutoApprove={(next) => {
              runAction(() => updateTeam(team.id, { autoApproveMutations: next }, db));
            }}
            onAddLink={() => setPickerOpen(true)}
            onRemoveLink={(linkId) => {
              runAction(() => removeTeamLink(linkId, db));
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
              {lead ? (
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
              ) : (
                <span
                  data-testid="team-header-no-lead"
                  style={{ fontSize: 12, color: token.colorTextSecondary }}
                >
                  Chưa chọn lead
                </span>
              )}
              <Tag color={team.status === 'active' ? 'success' : 'default'}>
                {team.status === 'active' ? 'Đang hoạt động' : 'Tạm dừng'}
              </Tag>
              <Button
                size="small"
                icon={<BugOutlined />}
                style={{ marginLeft: 'auto' }}
                onClick={() => setDebugModalOpen(true)}
                data-testid="team-header-debug"
              >
                Debug Prompt ({debugLogs.length})
              </Button>
              <Button
                size="small"
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
              {interruptedVisible.length > 0 && !interruptedDismissed && (
                <div style={{ padding: '8px 16px 0' }}>
                  <Alert
                    type="warning"
                    showIcon
                    closable
                    onClose={() => setInterruptedDismissed(true)}
                    message="Lượt trước bị gián đoạn"
                    description={
                      <>
                        <div>
                          {interruptedVisible
                            .map((entry) => `${entry.agentName}: ${entry.task}`)
                            .join(' · ')}
                        </div>
                        <div>
                          Lượt này chưa hoàn tất và không được tự động chạy lại. Hãy gửi lại yêu cầu
                          nếu vẫn cần kết quả.
                        </div>
                      </>
                    }
                  />
                </div>
              )}
              {actionError && (
                <div style={{ padding: '8px 16px 0' }} data-testid="team-action-error">
                  <Alert
                    type="error"
                    showIcon
                    closable
                    onClose={() => setActionError(null)}
                    message={actionError}
                  />
                </div>
              )}
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
                    // WR-11: the coordinator renders one attributed bubble per live agent,
                    // so the widget's anonymous streaming bubble is suppressed here.
                    status: 'idle',
                    streamingText: '',
                    streamingStatusLabel: null,
                    pendingApproval: snapshot.pendingApproval,
                  }}
                  onSubmit={handleSubmit}
                  onStop={() => coordinator?.abortAll()}
                  onResolveApproval={(approved) => coordinator?.resolveApproval(approved)}
                  onRetry={() => {
                    // D-20: the retry is a dispatch like any other — it goes through
                    // `runTurn`, so its text lands in the outbox or the draft, never nowhere.
                    if (lastUserTextRef.current) void runTurn(lastUserTextRef.current);
                  }}
                  error={sendError}
                  toolbox={{
                    selectedModel: lead?.model ?? '',
                    availableModels: [],
                    onModelChange: () => {},
                    analysisMode,
                    onToggleAnalysisMode: () => setAnalysisMode((prev) => !prev),
                    autoApproveMutations: team.autoApproveMutations === true,
                    onToggleAutoApproveMutations: () => {
                      runAction(() =>
                        updateTeam(
                          team.id,
                          { autoApproveMutations: team.autoApproveMutations !== true },
                          db
                        )
                      );
                    },
                    mcpEnabled,
                    onToggleMcpEnabled: () => setMcpEnabled((prev) => !prev),
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
                    // 37-08 D-13: same extension path as onStopAgent — no new widget API.
                    // WR-02: a refusal (busy phase, disposed run) must land somewhere the
                    // user can see; forwarding `err.message` is not allowed here, so the
                    // fixed copy goes to the one action-error channel.
                    ...(coordinator
                      ? {
                          onRetryAgent: (assignmentId: string) => {
                            setActionError(null);
                            void coordinator
                              .retryAssignment(assignmentId)
                              .catch(() => setActionError(RETRY_ERROR_COPY));
                          },
                        }
                      : {}),
                  }}
                  transcriptExtensions={transcriptExtensions}
                  statusExtensions={
                    <OutboxPanel
                      entries={outbox}
                      // T-37-19: cancel is the ONLY path that drops text, and it is an
                      // explicit action on a visible chip — no user message was written.
                      onCancel={(id) => setOutbox((queue) => queue.filter((entry) => entry.id !== id))}
                    />
                  }
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
        leads={leads}
        links={linkRows}
        onCancel={() => setSettingsOpen(false)}
        onAssignLeader={async (leadId) => {
          await assignLeader(team.id, leadId, db);
        }}
        onAddMember={async (agentId) => {
          await addTeamMember(
            { teamId: team.id, agentId, role: 'employee', budgetTokens: 0 },
            db
          );
        }}
        onRemoveMember={async (memberId) => {
          await removeTeamMember(memberId, db);
        }}
        onSave={(input) => {
          runAction(() => handleSaveSettings(input));
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
        scope={
          topUpScope.kind === 'agent'
            ? {
                kind: 'agent',
                name:
                  roster.find((agent) => agent.id === topUpScope.agentId)?.name ??
                  topUpScope.agentId,
              }
            : { kind: 'team', name: team.name }
        }
        used={
          topUpScope.kind === 'agent'
            ? liveMembers.find((row) => row.agentId === topUpScope.agentId)?.usedTokens ?? 0
            : liveMembers.reduce((sum, row) => sum + row.usedTokens, 0)
        }
        budget={
          topUpScope.kind === 'agent'
            ? liveMembers.find((row) => row.agentId === topUpScope.agentId)?.budgetTokens ?? 0
            : team.budgetTokens
        }
        onCancel={() => setTopUpOpen(false)}
        onConfirm={(amount) => {
          setTopUpOpen(false);
          void coordinator?.topUp(
            topUpScope.kind === 'agent'
              ? { kind: 'agent', agentId: topUpScope.agentId }
              : { kind: 'team' },
            amount
          );
        }}
      />

      <Modal
        title="Debug: Lịch sử Prompt gửi tới AI trong nhóm"
        open={debugModalOpen}
        onCancel={() => setDebugModalOpen(false)}
        footer={[
          <Button key="clear" danger onClick={() => setDebugLogs([])}>
            Xóa nhật ký debug
          </Button>,
          <Button key="close" type="primary" onClick={() => setDebugModalOpen(false)}>
            Đóng
          </Button>,
        ]}
        width={800}
      >
        {debugLogs.length === 0 ? (
          <Typography.Text type="secondary">Chưa có lượt gửi AI nào trong phiên này.</Typography.Text>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '60vh', overflowY: 'auto' }}>
            {debugLogs.map((log, index) => (
              <div
                key={index}
                style={{
                  padding: 10,
                  border: `1px solid ${token.colorBorderSecondary}`,
                  borderRadius: 6,
                  background: token.colorFillAlter,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Tag color="blue">{log.agentKind.toUpperCase()}: {log.agentName}</Tag>
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>{log.timestamp}</Typography.Text>
                </div>
                <div style={{ fontSize: 12, marginBottom: 4 }}>
                  <strong>Model:</strong> {log.model} | <strong>Tools:</strong> {log.toolNames.join(', ') || 'none'}
                </div>
                <div style={{ fontSize: 12, marginBottom: 4 }}>
                  <strong>User / Instruction Input:</strong>
                  <pre style={{ whiteSpace: 'pre-wrap', background: token.colorBgContainer, padding: 6, borderRadius: 4, margin: '4px 0' }}>
                    {log.text}
                  </pre>
                </div>
                <div style={{ fontSize: 12 }}>
                  <strong>System Prompt:</strong>
                  {log.systemMessages.map((sm, smIdx) => (
                    <pre
                      key={smIdx}
                      style={{
                        whiteSpace: 'pre-wrap',
                        background: token.colorBgContainer,
                        padding: 6,
                        borderRadius: 4,
                        maxHeight: 180,
                        overflowY: 'auto',
                        margin: '4px 0',
                      }}
                    >
                      {sm}
                    </pre>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default TeamWorkspace;
