import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Avatar, Button, Dropdown, Splitter, Tag, Tooltip, theme } from 'antd';
import { PushpinFilled, SettingOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import type { TaskPlannerDatabase } from '../../../db';
import type {
  AgentRunState,
  AiEmployee,
  AiLead,
  AiSkill,
  AiTeam,
  AiTeamMember,
} from '../../../types/aiOffice';
import { DEFAULT_BUDGET_WARN_THRESHOLD_PCT } from '../../../types/aiOffice';
import {
  addTeamLink,
  addTeamMember,
  applyTeamBudgetSettings,
  assignLeader,
  getTeam,
  listTeamLinks,
  listTeamMembers,
  lockLeader,
  removeTeamLink,
  removeTeamMember,
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
import { getMcpServers, toggleMcpServer, setAllMcpServersEnabled, MCP_SERVERS_SETTINGS_KEY, type McpServerConfig } from '../../../services/ai/mcpClient';
import { McpSettingsModal } from '../McpSettingsModal';
import { getGlobalBudgetWarnThresholdPct } from '../../../services/ai/budgetWarnSettings';
import {
  createTeamRunCoordinator,
  type TeamRunCoordinator,
  type TeamRunSnapshot,
} from '../../../services/ai/office/teamRunCoordinator';
import { getOrCreateRun } from '../../../services/ai/office/teamRunManager';
import { cancelToolCall } from '../../../services/sshService';
import { CODE_EDIT_AGENT_NAME, resolveAgentDeveloperWorktree } from '../../../services/ai/office/teamTools';

/** Bounded prompt-debug log shown in the activity rail (never grows without limit). */
const MAX_DEBUG_LOGS = 100;
import { advanceCursor } from '../../../services/ai/office/teamEventLog';
import { setActiveTeamView } from '../../../services/ai/office/activeTeamView';
import { isNotificationPermissionGranted, requestNotificationPermission } from '../../../utils/desktopNotification';
import { USER_PARTICIPANT_ID, type MessageSeenEntry } from '../../../types/teamChat';
import type { ChatTurnRuntimeDeps } from '../runtime/chatTurnRuntime';
import { AiChatWidget } from '../AiChatWidget';
import { agentColorFor } from './AgentAttributionRow';
import { CodingZoneTrigger } from '../../agents/office/CodingZoneTrigger';
import { hasActiveAgentDeveloperSession } from '../../agents/CodingZoneDiffPanel';
import { deriveRemoteWorktreePath, deriveWorktreeBranch } from '../../../services/sshWorktreeService';
import { getSshConfigById } from '../../../services/sshService';
import {
  ACTIVITY_RAIL_ID,
  AgentActivityPanel,
  type TeamDebugLog,
} from './AgentActivityPanel';
export type { TeamDebugLog } from './AgentActivityPanel';
import { AssignmentPlanCard } from './AssignmentPlanCard';
import { PendingSkillProposals } from './PendingSkillProposals';
import { TeamActivityIndicator } from './TeamActivityIndicator';
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
  /** OS-notification deeplink target: scroll to and highlight this message. */
  targetMessageId?: string | undefined;
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
  budgetWarnThresholdPct: DEFAULT_BUDGET_WARN_THRESHOLD_PCT,
  budgetWarnings: { member: false, team: false },
  memberUsage: [],
};

const NO_MODEL_COPY =
  'Chưa có mô hình AI nào khả dụng. Mở Cài đặt để cấu hình nhà cung cấp mô hình trước khi lưu.';

/** WR-12: one fixed message for every fire-and-forget failure — repo errors can embed ids. */
const ACTION_ERROR_COPY = 'Không lưu được thay đổi. Vui lòng thử lại.';

/** IN-05: fixed copy — a repo error message can embed ids, which must not reach the UI. */
const BOOTSTRAP_ERROR_COPY =
  'Không mở được nhóm. Đóng rồi mở lại nhóm; nếu vẫn lỗi, kiểm tra nhật ký ứng dụng.';

/** WR-02: a refused retry is a normal outcome (busy phase, disposed run), not a dead end. */
const RETRY_ERROR_COPY = 'Chưa thể chạy lại lần này. Hãy chờ lượt hiện tại kết thúc rồi thử lại.';

/** IN-05: fixed copy — a repo error message can embed ids, which must not reach the UI. */
const LEADER_LOCK_FAILED_COPY = 'Không khoá được leader cho nhóm. Vui lòng thử lại.';

/** Hoisted so the transcript list keeps prop identity across a composer keystroke. */
const TEAM_EMPTY_STATE = {
  heading: 'Bắt đầu làm việc với nhóm',
  body: 'Nhập yêu cầu bên dưới để lead phân rã và chia việc. Gõ @ để nói trực tiếp với một nhân viên.',
};

const TERMINAL = new Set(['done', 'stopped', 'error']);

function initialOf(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? '?';
}

/**
 * Content signature for the memoized `agents` array. Exported so the regression is testable:
 * a step result that keeps the same id/status but adds `resultPreview` MUST change this
 * signature, otherwise `useMemo` returns the stale array and every React.memo consumer
 * (Activity panel, transcript widgets) silently keeps the old preview.
 */
export function agentSnapshotSignature(agents: readonly AgentRunState[]): string {
  return JSON.stringify(
    agents.map((agent) => ({
      ...agent,
      steps: agent.steps?.map((s) => ({
        id: s.id,
        label: s.label,
        at: s.at,
        detail: s.detail,
        toolName: s.toolName,
        phase: s.phase,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        durationMs: s.durationMs,
        status: s.status,
        resultPreview: s.resultPreview,
      })),
    }))
  );
}

/** UI-SPEC §5b workspace: splitter, sidebar, transcript region and the shared widget. */
export const TeamWorkspace: React.FC<TeamWorkspaceProps> = ({
  team,
  lead,
  members,
  employees,
  skills,
  db,
  targetMessageId,
  createRuntimeDeps,
}) => {
  const { token } = theme.useToken();
  const [coordinator, setCoordinator] = useState<TeamRunCoordinator | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<TeamRunSnapshot>(EMPTY_SNAPSHOT);
  const [configError, setConfigError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  // Bumped on every valid send so ChatMessageList pins the transcript to bottom after the
  // persisted user row arrives. Team chat passes onMessageRead, so its passive scroll is off.
  const [scrollTrigger, setScrollTrigger] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [planDecision, setPlanDecision] = useState<'approved' | 'rejected' | undefined>(undefined);
  const [mcpSettingsOpen, setMcpSettingsOpen] = useState(false);
  // Phase 39: the toggle is a persisted team setting, so the MCP popover shows the real
  // server list and the coordinator refreshes discovery at every turn start.
  // Read-only on purpose: `getMcpServers` seeds the settings row, and a liveQuery querier
  // must not open a write transaction. Seeding happens once in the effect below.
  const mcpServers = useLiveQuery(
    async () => {
      const rec = await db.settings.get(MCP_SERVERS_SETTINGS_KEY);
      return Array.isArray(rec?.value) ? (rec.value as McpServerConfig[]) : [];
    },
    [db]
  ) ?? [];
  useEffect(() => {
    void getMcpServers(db).catch(() => {});
  }, [db]);
  // Absent means ON (Team chat defaults to all MCP servers); only `false` opts out.
  const mcpEnabled = team.mcpEnabled !== false;
  const [debugLogs, setDebugLogs] = useState<TeamDebugLog[]>([]);
  // D-10: runtime-only rail visibility, default open on the only supported runtime (Tauri desktop).
  const [activityOpen, setActivityOpen] = useState<boolean>(true);
  const [sendError, setSendError] = useState<{ code: string; message: string } | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<boolean | null>(null);
  const [requestingNotification, setRequestingNotification] = useState(false);
  const [notificationRequestFailed, setNotificationRequestFailed] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void isNotificationPermissionGranted()
        .then((granted) => { if (active) setNotificationPermission(granted); })
        .catch(() => { if (active) setNotificationPermission(false); });
    };
    refresh();
    window.addEventListener('focus', refresh);
    return () => { active = false; window.removeEventListener('focus', refresh); };
  }, []);
  const enableNotifications = async () => {
    setRequestingNotification(true);
    try {
      const granted = await requestNotificationPermission();
      setNotificationPermission(granted);
      setNotificationRequestFailed(!granted);
      window.dispatchEvent(new Event('team-notification-permission-change'));
    } catch {
      setNotificationRequestFailed(true);
    } finally {
      setRequestingNotification(false);
    }
  };
  // WR-12: every fire-and-forget repo call in this component reports here instead of
  // escaping as an unhandled rejection.
  const [actionError, setActionError] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const lastUserTextRef = useRef<string>('');

  const links = useLiveQuery(() => listTeamLinks(team.id, db), [db, team.id]) ?? [];
  const liveMembers = useLiveQuery(() => listTeamMembers(team.id, db), [db, team.id]) ?? members;
  // D-04: the drawer shows the inherited value without materializing it.
  const globalThresholdPct = useLiveQuery(() => getGlobalBudgetWarnThresholdPct(db), [db]);
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

      // 261121-qpp: the worktree target comes from the shared resolver — direct system links
      // AND CR targets — the same source the Coding Zone chip reads. Resolved here from `db`,
      // NOT from a live-query array whose identity would become an effect dependency and tear
      // down a running coordinator (WR-06). Absent config means provisioning refuses truthfully.
      const resolution = await resolveAgentDeveloperWorktree(team.id, db);
      const agentDeveloperWorktree = resolution.worktree;

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
        ...(agentDeveloperWorktree ? { agentDeveloperWorktree } : {}),
        ...(resolution.ambiguousSystemNames.length > 0
          ? { worktreeAmbiguousSystems: resolution.ambiguousSystemNames }
          : {}),
        // D-04: the window makes `tokenBudget > 0`, so in-loop compaction can run on a
        // read-heavy turn. `getNineRouterConfig` always returns a positive default.
        contextWindowTokens: config.contextWindowTokens,
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

              // Bounded prompt log: an endless team run must not grow the rail's state.
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
              ].slice(-MAX_DEBUG_LOGS));
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
    })().catch((err: unknown) => {
      // Without this the IIFE's rejection is unhandled and `coordinator` stays null forever,
      // so the gate below paints "Đang chuẩn bị nhóm..." with no way out. Surface it instead.
      if (cancelled) return;
      console.error('[TeamWorkspace] bootstrap failed', err);
      setConfigError(BOOTSTRAP_ERROR_COPY);
    });

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
      mcpEnabled: team.mcpEnabled !== false,
      ...(team.concurrencyLimit !== undefined
        ? { concurrencyLimit: team.concurrencyLimit }
        : {}),
    });
  }, [coordinator, team.autoSplitEnabled, team.autoApproveMutations, team.mcpEnabled, team.concurrencyLimit]);

  // D-04: a global threshold change in Settings must reach a coordinator that is already
  // alive — the manager caches it across navigation, so construction-time read is not enough.
  useEffect(() => {
    if (globalThresholdPct === undefined) return;
    coordinator?.setGlobalThresholdPct(globalThresholdPct);
  }, [coordinator, globalThresholdPct]);

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

  /**
   * 37.1 rework: read receipts. A message is read by a participant when that participant's
   * cursor covers its `seq`; the cursor's `updatedAt` is the "read at" time. This is the
   * single source for the seen indicator — no per-message read field exists.
   */
  const loadedLog = useLiveQuery(
    () => db.teamMessages.where('teamId').equals(team.id).toArray(),
    [db, team.id]
  );
  const teamLog = loadedLog ?? [];
  const loadedCursors = useLiveQuery(
    () => db.teamReadCursors.where('teamId').equals(team.id).toArray(),
    [db, team.id]
  );
  const teamCursors = loadedCursors ?? [];
  /**
   * 37.1 R13: how many messages the user has not read. `headSeq` minus the user's cursor.
   * Read from the same log as the receipts, so the badge and the ✓✓ can never disagree.
   */
  const userCursorSeq = useMemo(() => {
    const mine = teamCursors.find((row) => row.participantId === USER_PARTICIPANT_ID);
    return mine?.lastSeq ?? 0;
  }, [teamCursors]);
  const unreadCount = useMemo(
    () => teamLog.filter((row) => row.seq > userCursorSeq && row.from !== USER_PARTICIPANT_ID).length,
    [teamLog, userCursorSeq]
  );

  const firstUnreadMessageId = useMemo(
    () => loadedCursors === undefined ? undefined : teamLog
      .filter((row) => row.seq > userCursorSeq && row.from !== USER_PARTICIPANT_ID)
      .reduce<(typeof teamLog)[number] | undefined>(
        (first, row) => !first || row.seq < first.seq ? row : first, undefined
      )?.id,
    [teamLog, userCursorSeq, loadedCursors]
  );

  const lastReadMessageId = useMemo(
    () => teamLog.filter((row) => row.seq <= userCursorSeq)
      .reduce<(typeof teamLog)[number] | undefined>(
        (last, row) => !last || row.seq > last.seq ? row : last, undefined
      )?.id ?? null,
    [teamLog, userCursorSeq]
  );
  const handleMessageRead = useCallback((messageId: string) => {
    if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
    const message = teamLog.find((row) => row.id === messageId);
    if (!message || message.seq <= userCursorSeq) return;
    void advanceCursor(team.id, USER_PARTICIPANT_ID, message.seq, db)
      .catch(() => setActionError(ACTION_ERROR_COPY));
  }, [teamLog, userCursorSeq, team.id, db]);

  /**
   * 37.1: who each message is addressed to, so a leader→agent message shows the agent's name.
   * Read from the log's `to[]` — the same field routing uses, so the label cannot drift from
   * who actually acts. The user is never listed: they are the reader, not a recipient to name.
   */
  const addressedTo = useMemo(() => {
    const map = new Map<string, Array<{ id: string; name: string }>>();
    const nameOf = new Map<string, string>();
    for (const agent of roster) nameOf.set(agent.id, agent.name);
    for (const message of teamLog) {
      const named = message.to
        .filter((id) => id !== USER_PARTICIPANT_ID)
        .map((id) => ({ id, name: nameOf.get(id) ?? id }));
      if (named.length > 0) map.set(message.id, named);
    }
    return map;
  }, [teamLog, roster]);

  const seenStates = useMemo(() => {
    const map = new Map<string, MessageSeenEntry[]>();
    if (teamLog.length === 0 || teamCursors.length === 0) return map;
    const nameOf = new Map<string, string>();
    for (const agent of roster) nameOf.set(agent.id, agent.name);
    nameOf.set(USER_PARTICIPANT_ID, 'Bạn');
    for (const message of teamLog) {
      // 37.1: "who has read", not "who was addressed" — mirrors `seenBy` in teamEventLog.
      // Everyone reads the whole log; `to[]` only decides who owes a reply. The author is
      // never a reader of their own message.
      const readers = teamCursors.filter(
        (cursor) => cursor.participantId !== message.from && cursor.lastSeq >= message.seq
      );
      if (readers.length === 0) continue;
      map.set(
        message.id,
        readers.map((cursor) => ({
          participantId: cursor.participantId,
          participantName: nameOf.get(cursor.participantId) ?? cursor.participantId,
          at: cursor.updatedAt,
        }))
      );
    }
    return map;
  }, [teamLog, teamCursors, roster]);

  // User cursor advances only for messages observed inside the focused transcript viewport.
  // 37.1 R13: tell the shell this team is the one on screen, so its messages do not also
  // raise an OS notification. Cleared on unmount — a closed workspace is not focused.
  useEffect(() => {
    setActiveTeamView(team.id);
    return () => setActiveTeamView(null);
  }, [team.id]);

  useEffect(() => {
    if (team.leadId !== undefined) {
      setSendError((error) => error?.code === 'NO_LEAD' ? null : error);
    }
  }, [team.leadId]);

  /** Header chip: a run is in flight whenever the coordinator is past `ready`/`idle`. */
  const busy = snapshot.phase !== 'idle' && snapshot.phase !== 'ready';

  const agentStatuses = useMemo(() => {    const map = new Map<string, 'queued' | 'running' | 'paused' | 'waiting' | 'stopped' | 'error' | 'done'>();
    for (const row of snapshot.agents) map.set(row.agentId, row.status);
    return map;
  }, [snapshot.agents]);

  // Phase 48 D-02/D-18: the trigger is live-state-only. No sample descriptor or fake sync chip.
  const codingZoneActive = hasActiveAgentDeveloperSession(snapshot.agents, [
    ...(lead ? [{ id: lead.id, name: lead.name }] : []),
    ...employees.map((employee) => ({ id: employee.id, name: employee.name })),
  ]);
  // WR-05/IN-01: prefer the stable marker; fall back to the shared constant for legacy rosters.
  const developerId = employees.find((employee) => employee.agentKind === 'developer')?.id
    ?? employees.find((employee) => employee.name === CODE_EDIT_AGENT_NAME)?.id
    ?? '';
  // 261121-qpp: same resolver as the coordinator, so the chip and provisioning target one repo.
  const worktreeResolution = useLiveQuery(
    () => resolveAgentDeveloperWorktree(team.id, db),
    [db, team.id]
  );
  const codingZoneSshConfigId = worktreeResolution?.worktree?.sshConfigId;
  const codingZoneRepoPath = worktreeResolution?.worktree?.remoteRepoPath;
  const codingZoneDescriptor = useMemo(() => {
    if (!codingZoneActive || !codingZoneSshConfigId || !codingZoneRepoPath || !developerId) return undefined;
    return {
      sshConfigId: codingZoneSshConfigId,
      remoteRepoPath: codingZoneRepoPath,
      remoteWorktreePath: deriveRemoteWorktreePath(codingZoneRepoPath, developerId),
      branch: deriveWorktreeBranch(developerId),
    };
  }, [codingZoneActive, codingZoneSshConfigId, codingZoneRepoPath, developerId]);
  const codingZoneConfig = useLiveQuery(
    () => (codingZoneSshConfigId ? getSshConfigById(codingZoneSshConfigId, db) : Promise.resolve(null)),
    [db, codingZoneSshConfigId]
  ) ?? undefined;
  const codingZoneMessages = useMemo(() => teamLog.map((row) => ({
    id: row.id,
    author: row.from === USER_PARTICIPANT_ID ? 'Bạn' : (roster.find((member) => member.id === row.from)?.name ?? row.from),
    time: new Date(row.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    text: row.content,
    kind: row.kind === 'instruction' || row.kind === 'report' ? 'agent' as const
      : row.kind === 'synthesis' ? 'synthesis' as const : 'chat' as const,
  })), [teamLog, roster]);
  const codingZoneTrigger = codingZoneActive ? (
    <CodingZoneTrigger
      active
      descriptor={codingZoneDescriptor}
      sshConfig={codingZoneConfig ?? undefined}
      messages={codingZoneMessages}
      connection={codingZoneConfig ? 'connected' : 'disconnected'}
      onlineCount={Math.max(1, snapshot.agents.length)}
      onSendMessage={(text) => { void runTurn(text); }}
    />
  ) : null;

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

  // Stable identity for the memoized activity rail: an inline `.map()` here made every composer
  // keystroke (which re-renders this host) defeat AgentActivityPanel's React.memo (ai-chat-input-lag).
  const activityRoster = useMemo(
    () => roster.map((member) => ({
      id: member.id,
      name: member.name,
      ...(member.id === team.leadId ? { isLead: true } : {}),
    })),
    [roster, team.leadId]
  );
  const clearDebugLogs = useCallback(() => setDebugLogs([]), []);
  const closeActivity = useCallback(() => setActivityOpen(false), []);
  // Stable callback: AgentActivityPanel is memoized; a new function per render would
  // rebuild the activity rail on every keystroke. Cancel is by call id only.
  const handleCancelToolCall = useCallback((toolCallId: string) => {
    void cancelToolCall(toolCallId).catch((err) => {
      console.error('[TeamWorkspace] cancel_tool_call failed', err);
    });
  }, []);

  /** Memoized so a composer keystroke does not change the transcript list's props. */
  const messageListExtensions = useMemo(
    () => ({
      agentDirectory,
      agentStatuses,
      seenStates,
      addressedTo,
      scrollTrigger,
      ...(firstUnreadMessageId !== undefined ? { firstUnreadMessageId } : {}),
      lastReadMessageId,
      readPositionReady: loadedLog !== undefined && loadedCursors !== undefined,
      ...(targetMessageId ? { targetMessageId } : {}),
      onMessageRead: handleMessageRead,
      ...(coordinator
        ? {
            onStopAgent: (agentId: string) => coordinator.stopAgent(agentId),
            // 37-08 D-13: same extension path as onStopAgent — no new widget API.
            // WR-02: a refusal (busy phase, disposed run) must land somewhere the user can
            // see; forwarding `err.message` is not allowed here, so the fixed copy goes to
            // the one action-error channel.
            onRetryAgent: (assignmentId: string) => {
              setActionError(null);
              void coordinator
                .retryAssignment(assignmentId)
                .catch(() => setActionError(RETRY_ERROR_COPY));
            },
          }
        : {}),
    }),
    [agentDirectory, agentStatuses, seenStates, addressedTo, scrollTrigger, firstUnreadMessageId, lastReadMessageId,
      loadedLog, loadedCursors, targetMessageId, handleMessageRead, coordinator]
  );

  /**
   * D-09: the first run locks the leader. Both the decision and the write read the PERSISTED
   * team row at send time — a leader assigned through the settings drawer after mount is
   * invisible to the `team` prop. A failed lock surfaces an error instead of running silently.
   */
  const sendTurn = useCallback(
    async (text: string): Promise<'started' | 'steered' | 'refused' | 'blocked'> => {
      // 37.1 D-12: every non-starting path states WHY, so the caller can restore the draft
      // instead of dropping the text.
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
      // WR-05: a leadless team has nobody to answer. Say so instead of looking delivered.
      if (outcome === 'refused' && team.leadId === undefined) {
        setSendError({
          code: 'NO_LEAD',
          message: 'Nhóm chưa có trưởng nhóm nên không ai trả lời được. Hãy thêm trưởng nhóm trong cài đặt nhóm.',
        });
      }
      return outcome;
    },
    [coordinator, db, team.id, team.leadId]
  );

  /**
   * D-20: the ONLY dispatcher. It clears `sendError` first (so `InlineApiErrorCard` comes
   * down the moment a retry starts) and gives every outcome a no-loss home: `blocked`
   * restores the draft. Requeueing `blocked` would loop forever — a disposed coordinator's
   * phase never leaves `ready`. 37.1: `'steered'`/`'refused'` are normal outcomes — the row
   * is already in the transcript, so the composer stays empty.
   */
  const runTurn = useCallback(
    async (text: string) => {
      setSendError(null);
      try {
        const outcome = await sendTurn(text);
        if (outcome === 'blocked') {
          setDraft(text);
        }
      } catch {
        // WR-10: a throw is a `blocked` submit with a different cause: keep the text, not the
        // error. IN-05: repo/coordinator messages can embed ids, so only fixed copy reaches
        // the UI (same channel discipline as ACTION_ERROR_COPY / RETRY_ERROR_COPY).
        setSendError({ code: 'TURN_FAILED', message: ACTION_ERROR_COPY });
        setDraft(text);
      }
    },
    [sendTurn]
  );

  /**
   * 37.1 D-01/D-02: one chat box, always usable. A submit during a live run is a steer, not
   * a queued second turn, so the composer no longer gates on the phase.
   */
  const handleSubmit = useCallback(
    (text: string) => {
      // IN-05: a whitespace-only submit must not replace the last real request, or the
      // widget's retry button would resend whitespace.
      if (!text.trim()) return;
      lastUserTextRef.current = text;
      setDraft('');
      setScrollTrigger((prev) => prev + 1);
      void runTurn(text);
    },
    [runTurn]
  );

  /** Stable identity: an inline arrow re-rendered the whole transcript on every keystroke. */
  const handleRetry = useCallback(() => {
    // 37.1: the retry is a dispatch like any other — it goes through `runTurn`, so its text
    // lands in the draft on a `'blocked'` outcome.
    if (lastUserTextRef.current) void runTurn(lastUserTextRef.current);
  }, [runTurn]);

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
    sshFsToolsEnabled: boolean;
    oracleToolsEnabled: boolean;
    /** D-04: absent = leave the stored override alone, `null` = inherit, number = store. */
    budgetWarnThresholdPct?: number | null | undefined;
    /** Phase 45 D-16: team-scoped pinned context note. */
    pinnedContext: string;
  }) => {
    // D-19: ONE absolute two-table write. Composing `updateTeam(total)` with a per-member
    // additive loop is what turned 3000 → 4000 into 5000.
    const result = await applyTeamBudgetSettings(
      team.id,
      {
        budgetTokens: input.budgetTokens,
        budgets: input.budgets,
        budgetWarnThresholdPct: input.budgetWarnThresholdPct,
      },
      db
    );
    // Quick cz2: per-team tool enablement lives on the team row; persist alongside the
    // budget save so one drawer save captures every toggle.
    await updateTeam(
      team.id,
      {
        sshFsToolsEnabled: input.sshFsToolsEnabled,
        oracleToolsEnabled: input.oracleToolsEnabled,
        // Persist the mode settings too. The coordinator mirror below is transient; without
        // writing them to the team row the reopened drawer showed the stale value and the
        // DB→coordinator sync effect reverted the live run on the next render.
        autoSplitEnabled: input.autoSplitEnabled,
        autoApproveMutations: input.autoApproveMutations,
        concurrencyLimit: input.concurrencyLimit,
        // Phase 45 D-16: persist the pin on the same team row; empty string clears it.
        pinnedContext: input.pinnedContext,
      },
      db
    );
    // D-04: the limit applies to the run in flight, not only the next construction.
    coordinator?.setTeamSettings({
      autoSplitEnabled: input.autoSplitEnabled,
      autoApproveMutations: input.autoApproveMutations,
      concurrencyLimit: input.concurrencyLimit,
    });
    // D-19: the coordinator only mirrors the persisted result — it never re-derives a delta.
    coordinator?.applyBudgetSettings(result);
    // CR-04: mirror the STORED override, not the input. An untouched save sends `undefined`,
    // which must leave the live threshold alone — feeding it to the setter would revert to
    // the global default while Dexie still holds the team's override.
    coordinator?.setTeamThresholdPct(result.team.budgetWarnThresholdPct);
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

  // The coordinator emits a fresh `agents` array on every tool event (~50ms). Reuse the
  // previous array when its observable content is unchanged, otherwise React.memo on
  // AgentActivityPanel and the transcript subtree are defeated without any visual change.
  // C: every rendered field MUST be in the signature. A tool result that keeps the same
  // step id/status but adds `resultPreview`, `durationMs`, `endedAt`, `detail` or new
  // `streamingText` otherwise reuses the stale array and the panel never re-renders.
  // One JSON.stringify per agent keeps this O(n) — no per-render deep comparison.
  const agentsSignature = agentSnapshotSignature(snapshot.agents);
  const stableAgents = useMemo(() => snapshot.agents, [agentsSignature]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stable identity: an inline element here changed on every composer keystroke and forced the
  // whole widget subtree (indicator, plan card, proposals) to re-render (ai-chat-input-lag).
  const transcriptExtensions = useMemo(
    () => (
      <>
        <TeamActivityIndicator
          phase={snapshot.phase}
          agents={stableAgents}
          agentDirectory={agentDirectory}
          leadId={team.leadId}
          {...(coordinator ? { onStopAgent: (agentId: string) => coordinator.stopAgent(agentId) } : {})}
        />
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
        <PendingSkillProposals
          members={liveMembers}
          employees={employees}
          skills={skills}
          db={db}
        />
      </>
    ),
    [snapshot.phase, stableAgents, snapshot.pendingPlan, snapshot.lastPlan,
      snapshot.lastPlanDecision, planDecision, coordinator, agentDirectory, team.leadId,
      liveMembers, employees, skills, db]
  );

  return (
    <div
      data-testid="team-workspace"
      style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}
    >
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
            unreadCount={unreadCount}
            snapshot={snapshot}
            budgetWarnThresholdPct={snapshot.budgetWarnThresholdPct}
            liveUsage={snapshot.memberUsage}
            onTopUp={() => {
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
                padding: '10px 16px',
                borderBottom: `1px solid ${token.colorBorderSecondary}`,
              }}
            >
              <span style={{ fontSize: 16, fontWeight: 600 }}>{team.name}</span>
              {lead ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: token.colorTextTertiary }}>›</span>
                  <Avatar
                    size={18}
                    shape="square"
                    style={{ backgroundColor: agentColorFor(lead.id), color: '#ffffff' }}
                  >
                    {initialOf(lead.name)}
                  </Avatar>
                  <span style={{ fontSize: 12, color: token.colorTextSecondary }}>{lead.name}</span>
                </span>
              ) : (
                <span
                  data-testid="team-header-no-lead"
                  style={{ fontSize: 12, color: token.colorTextSecondary }}
                >
                  Chưa chọn lead
                </span>
              )}
              {/* Phase 45 D-18: a compact, focusable display-only badge appears only when the
                  team has a pin. Its tooltip shows the current pinned content verbatim — never
                  a system instruction. Long content is bounded by antd Tooltip behavior. */}
              {team.pinnedContext ? (
                <Tooltip title={team.pinnedContext}>
                  <Tag
                    icon={<PushpinFilled />}
                    color={token.colorPrimary}
                    tabIndex={0}
                    role="img"
                    aria-label={`Ngữ cảnh nhóm đã ghim: ${team.pinnedContext}`}
                    title={team.pinnedContext}
                    data-testid="team-header-pinned-badge"
                    style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    Đã ghim
                  </Tag>
                </Tooltip>
              ) : null}
              {/* One status chip replaces the old always-on header buttons: the run state is
                  the only thing worth knowing at a glance. */}
              <span
                data-testid="team-header-status"
                style={{
                  marginLeft: 'auto',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 11,
                  color: token.colorTextSecondary,
                  background: token.colorFillQuaternary,
                  borderRadius: 999,
                  padding: '2px 9px',
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    background: busy ? token.colorPrimary : token.colorSuccess,
                  }}
                />
                {busy ? 'Đang chạy' : 'Rảnh'}
              </span>
              {codingZoneTrigger}
              <Button
                size="small"
                aria-label="Mở activity"
                aria-expanded={activityOpen}
                aria-controls={ACTIVITY_RAIL_ID}
                data-testid="team-activity-affordance"
                onClick={() => setActivityOpen(true)}
                style={{ marginLeft: 4 }}
              >
                Activity
              </Button>
              <Dropdown
                trigger={['click']}
                placement="bottomRight"
                menu={{
                  items: [
                    {
                      key: 'settings',
                      icon: <SettingOutlined />,
                      label: 'Cài đặt nhóm',
                      onClick: () => setSettingsOpen(true),
                    },
                  ],
                }}
              >
                <Button
                  size="small"
                  type="text"
                  aria-label="Thao tác nhóm"
                  data-testid="team-header-more"
                  style={{ width: 24, height: 24, padding: 0, color: token.colorTextSecondary }}
                >
                  ⋯
                </Button>
              </Dropdown>
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
                  {/* Single line: the transcript is the page, not the notices. The agent
                      list stays in the description so nothing is lost. */}
                  <Alert
                    type="warning"
                    showIcon
                    closable
                    onClose={() => setInterruptedDismissed(true)}
                    message="Lượt trước bị gián đoạn — gửi lại yêu cầu nếu vẫn cần kết quả."
                    description={interruptedVisible
                      .map((entry) => `${entry.agentName}: ${entry.task}`)
                      .join(' · ')}
                  />
                </div>
              )}
              {notificationPermission === false && (
                <div style={{ padding: '8px 16px 0' }}>
                  <Alert
                    type="info"
                    showIcon
                    message={notificationRequestFailed
                      ? 'Chưa cấp được quyền thông báo. Kiểm tra quyền của ứng dụng trong cài đặt hệ điều hành.'
                      : 'Chưa bật thông báo hệ điều hành — bật để nhận tin nhóm khi ở cửa sổ khác.'}
                    action={<Button size="small" loading={requestingNotification} onClick={() => void enableNotifications()}>Bật thông báo</Button>}
                  />
                </div>
              )}
              {sendError?.code === 'NO_LEAD' && (
                <Alert
                  type="warning"
                  showIcon
                  message="Nhóm chưa có trưởng nhóm"
                  description={sendError.message}
                  action={<Button size="small" onClick={() => setSettingsOpen(true)}>Cài đặt nhóm</Button>}
                />
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
                    // Empty: the workspace header above already names the team, so the
                    // widget's own title bar would render the same title twice.
                    label: '',
                  }}
                  messages={messages}
                  turn={{
                    // 37.1 D-19: the team transcript never streams. An assistant bubble appears
                    // only once its turn completes, so the widget's anonymous streaming bubble
                    // is suppressed here and `TeamActivityIndicator` carries the live state.
                    status: 'idle',
                    streamingText: '',
                    streamingStatusLabel: null,
                    pendingApproval: snapshot.pendingApproval,
                  }}
                  onSubmit={handleSubmit}
                  onStop={() => coordinator?.abortAll()}
                  onResolveApproval={(approved) => coordinator?.resolveApproval(approved)}
                  onRetry={handleRetry}
                  error={sendError?.code === 'NO_LEAD' ? null : sendError}
                  toolbox={{
                    // The team orchestrator picks a model per agent, so this chat has no
                    // chat-scoped model and no analysis toggle — both are fixed by design.
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
                    onToggleMcpEnabled: () => {
                      runAction(() => updateTeam(team.id, { mcpEnabled: !mcpEnabled }, db));
                    },
                    mcpServers,
                    onToggleMcpServer: (id, enabled) => {
                      runAction(() => toggleMcpServer(id, enabled, db));
                    },
                    onToggleAllMcpServers: (enabled) => {
                      runAction(() => setAllMcpServersEnabled(enabled, db));
                    },
                    onOpenMcpSettings: () => setMcpSettingsOpen(true),
                  }}
                  quickPrompts={[]}
                  onClearThread={() => {}}
                  draft={draft}
                  onDraftChange={setDraft}
                  placeholder="Nhắn cho lead hoặc @ một nhân viên..."
                  emptyState={TEAM_EMPTY_STATE}
                  messageListExtensions={messageListExtensions}
                  transcriptExtensions={transcriptExtensions}
                  agentMentionOptions={agentMentionOptions}
                />
              )}
            </div>
          </div>
        </Splitter.Panel>

        {activityOpen ? (
          <Splitter.Panel defaultSize="28%" min={280} max="50%">
            <AgentActivityPanel
              agents={stableAgents}
              roster={activityRoster}
              debugLogs={debugLogs}
              onClearLogs={clearDebugLogs}
              onCancelToolCall={handleCancelToolCall}
              onClose={closeActivity}
              open={activityOpen}
              codingZoneSlot={codingZoneTrigger}
            />
          </Splitter.Panel>
        ) : null}
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
        {...(globalThresholdPct !== undefined ? { globalThresholdPct } : {})}
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
        scope={{ kind: 'team', name: team.name }}
        used={liveMembers.reduce((sum, row) => sum + row.usedTokens, 0)}
        budget={team.budgetTokens}
        thresholdPct={snapshot.budgetWarnThresholdPct}
        onCancel={() => setTopUpOpen(false)}
        onConfirm={(amount) => {
          setTopUpOpen(false);
          // WR-13: route through `runAction` so a refusal (e.g. a member removed mid-turn)
          // surfaces in the one action-error channel instead of an unhandled rejection.
          runAction(async () => {
            await coordinator?.topUp({ kind: 'team' }, amount);
          });
        }}
      />

      <McpSettingsModal
        open={mcpSettingsOpen}
        onClose={() => setMcpSettingsOpen(false)}
        db={db}
      />
    </div>
  );
};

export default TeamWorkspace;
