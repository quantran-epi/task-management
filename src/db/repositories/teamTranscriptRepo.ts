import { db as defaultDb, type TaskPlannerDatabase } from '../index';
import type { ChatMessage, ChatRole, ChatThread, ChatTokenUsage } from '../../types/models';
import {
  ASSIGNMENT_HISTORY_CAP,
  RECENT_WINDOW_TURNS,
  type AiTeamAssignmentRunStatus,
  type AiTeamAssignmentStopReason,
} from '../../types/aiOffice';
import type { BM25Document } from '../../utils/bm25';
import { generateId } from '../../utils/uuid';
import { createOrGetThread } from './chatRepo';
import { notifyAIChatSync } from '../../services/ai/aiSyncChannel';

/**
 * Re-exported so the coordinator has ONE import site for the transcript + its
 * post-commit notification (`finalizeAttempt` owns the notify, 37-03).
 */
export { notifyAIChatSync };

/**
 * Team transcript persistence (D-07, D-10, D-11, D-17, D-29, D-31).
 *
 * A thin layer over the existing `chatMessages` table — no duplicate message table, so
 * `ChatMessageList`, the BM25 mapping and backup coverage keep working unchanged.
 */

export interface SaveTeamMessageInput {
  threadId: string;
  role: ChatRole;
  content: string;
  agentId?: string | undefined;
  agentName?: string | undefined;
  agentKind?: 'lead' | 'employee' | undefined;
  messageKind?: 'instruction' | 'report' | 'synthesis' | 'plan' | 'steer' | undefined;
  /** CR-06: the employee an instruction row is assigned to (display attribution stays the lead). */
  targetAgentId?: string | undefined;
  tokenUsage?: ChatTokenUsage | undefined;
  // Phase 37 D-22 links; each is spread only when defined so existing rows stay byte-identical.
  batchId?: string | undefined;
  assignmentId?: string | undefined;
  attemptNo?: number | undefined;
  runStatus?: AiTeamAssignmentRunStatus | undefined;
  stopReason?: AiTeamAssignmentStopReason | undefined;
  incomplete?: boolean | undefined;
  supersededByMessageId?: string | undefined;
  supersededAt?: string | undefined;
}

/**
 * D-17: `buildScopeKey('team', teamId)` yields `team:<teamId>`, so reactivating an idle team
 * resolves the same thread and its transcript accumulates instead of resetting.
 */
export async function ensureTeamThread(
  teamId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<ChatThread> {
  const team = await db.aiTeams.get(teamId);
  if (!team) throw new Error(`Không tìm thấy nhóm: ${teamId}`);
  return createOrGetThread({ scopeType: 'team', entityId: teamId, title: team.name }, db);
}

/** Phase 37 D-22: spread only the link fields that are present, matching the attribution idiom. */
function linkFields(
  input: Partial<
    Pick<
      ChatMessage,
      | 'batchId'
      | 'assignmentId'
      | 'attemptNo'
      | 'runStatus'
      | 'stopReason'
      | 'incomplete'
      | 'supersededByMessageId'
      | 'supersededAt'
    >
  >
): Pick<
  ChatMessage,
  | 'batchId'
  | 'assignmentId'
  | 'attemptNo'
  | 'runStatus'
  | 'stopReason'
  | 'incomplete'
  | 'supersededByMessageId'
  | 'supersededAt'
> {
  return {
    ...(input.batchId ? { batchId: input.batchId } : {}),
    ...(input.assignmentId ? { assignmentId: input.assignmentId } : {}),
    ...(input.attemptNo !== undefined ? { attemptNo: input.attemptNo } : {}),
    ...(input.runStatus ? { runStatus: input.runStatus } : {}),
    ...(input.stopReason ? { stopReason: input.stopReason } : {}),
    ...(input.incomplete !== undefined ? { incomplete: input.incomplete } : {}),
    ...(input.supersededByMessageId
      ? { supersededByMessageId: input.supersededByMessageId }
      : {}),
    ...(input.supersededAt ? { supersededAt: input.supersededAt } : {}),
  };
}

export async function saveTeamMessage(
  input: SaveTeamMessageInput,
  db: TaskPlannerDatabase = defaultDb
): Promise<ChatMessage> {
  const now = new Date().toISOString();
  const message: ChatMessage = {
    id: generateId(),
    threadId: input.threadId,
    role: input.role,
    content: input.content,
    createdAt: now,
    ...(input.agentId ? { agentId: input.agentId } : {}),
    ...(input.agentName ? { agentName: input.agentName } : {}),
    ...(input.agentKind ? { agentKind: input.agentKind } : {}),
    ...(input.messageKind ? { messageKind: input.messageKind } : {}),
    ...(input.targetAgentId ? { targetAgentId: input.targetAgentId } : {}),
    ...(input.tokenUsage ? { tokenUsage: input.tokenUsage } : {}),
    ...linkFields(input),
  };

  await db.transaction('rw', [db.chatMessages, db.chatThreads], async () => {
    await db.chatMessages.add(message);
    await db.chatThreads.update(input.threadId, { updatedAt: now });
  });

  notifyAIChatSync({ type: 'message_saved', threadId: input.threadId });
  return message;
}

export interface InsertReportMessageInput
  extends Pick<
    ChatMessage,
    | 'id'
    | 'threadId'
    | 'content'
    | 'createdAt'
    | 'batchId'
    | 'assignmentId'
    | 'attemptNo'
    | 'runStatus'
    | 'stopReason'
    | 'incomplete'
  > {
  agentId: string;
  agentName: string;
}

/**
 * Phase 37 D-22: the one write a terminal attempt needs when the runtime wrote no row.
 *
 * Explicit input, NO transaction of its own and NO notification: `finalizeAttempt` calls it
 * inside its own `rw` scope, so the row commits atomically with the assignment transition and
 * `notifyAIChatSync` fires exactly once, after that transaction resolves.
 */
export async function insertReportMessage(
  input: InsertReportMessageInput,
  db: TaskPlannerDatabase = defaultDb
): Promise<ChatMessage> {
  const message: ChatMessage = {
    id: input.id,
    threadId: input.threadId,
    role: 'assistant',
    content: input.content,
    createdAt: input.createdAt,
    agentId: input.agentId,
    agentName: input.agentName,
    agentKind: 'employee',
    messageKind: 'report',
    ...linkFields(input),
  };
  await db.chatMessages.add(message);
  return message;
}

/**
 * Phase 37 D-12/D-23: the ONLY writer of `supersededByMessageId` / `supersededAt`.
 *
 * 37-03's `finalizeAttempt` deliberately never touches these two fields, so a superseded
 * report has exactly one writer. The row is patched, never deleted: the transcript keeps
 * every report and the ledger keeps every attempt; supersession is a link to what is current.
 * The FIRST supersession wins — re-superseding cannot repoint an already-stale row.
 */
export async function supersedeTeamMessage(
  messageId: string,
  supersededByMessageId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<ChatMessage | null> {
  if (messageId === supersededByMessageId) return null;
  const row = await db.chatMessages.get(messageId);
  if (!row) return null;
  if (row.supersededByMessageId !== undefined) return row;

  const updated: ChatMessage = {
    ...row,
    supersededByMessageId,
    supersededAt: new Date().toISOString(),
  };
  await db.chatMessages.put(updated);
  notifyAIChatSync({ type: 'message_saved', threadId: row.threadId });
  return updated;
}

async function readThreadMessages(
  threadId: string,
  db: TaskPlannerDatabase
): Promise<ChatMessage[]> {
  const rows = await db.chatMessages.where('threadId').equals(threadId).sortBy('createdAt');
  // Two messages can share a millisecond; fall back to the id so order is deterministic.
  // IN-06: unequal timestamps must order explicitly rather than lean on sort stability.
  return rows.sort((a, b) =>
    a.createdAt === b.createdAt
      ? a.id.localeCompare(b.id)
      : a.createdAt < b.createdAt
        ? -1
        : 1
  );
}

/**
 * WR-05/D-12: the newest synthesis row that is still current (not superseded).
 *
 * Re-synthesis supersession cannot depend on coordinator memory: a retry after a remount or
 * relaunch constructs a fresh coordinator, so the previous synthesis id must come from the
 * transcript. The caller keeps its in-memory id only as a fast path.
 */
export async function findCurrentSynthesisMessageId(
  threadId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<string | undefined> {
  const rows = await readThreadMessages(threadId, db);
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index]!;
    if (row.messageKind === 'synthesis' && row.supersededByMessageId === undefined) return row.id;
  }
  return undefined;
}

/** D-10: the bounded recent window fed to `sanitizeHistoryTurns`. */
export async function listRecentTurns(
  threadId: string,
  n: number = RECENT_WINDOW_TURNS,
  db: TaskPlannerDatabase = defaultDb
): Promise<ChatMessage[]> {
  const rows = await readThreadMessages(threadId, db);
  return rows.slice(-n);
}

/** D-29: bounded answer to "every instruction ever given", newest first. */
export async function listAssignmentHistory(
  threadId: string,
  agentId: string,
  cap: number = ASSIGNMENT_HISTORY_CAP,
  db: TaskPlannerDatabase = defaultDb
): Promise<ChatMessage[]> {
  const rows = await readThreadMessages(threadId, db);
  return rows
    .filter(
      (row) =>
        // CR-06: an instruction row is displayed as the lead's but targets this employee.
        (row.targetAgentId ? row.targetAgentId === agentId : row.agentId === agentId) &&
        (row.messageKind === 'instruction' || row.messageKind === 'report')
    )
    .reverse()
    .slice(0, cap);
}

export interface InterruptedAssignment {
  agentId: string;
  agentName: string;
  task: string;
  createdAt: string;
}

/**
 * D-19: an unfinished turn is *inferred*, never persisted.
 *
 * A `report` row is only written after a complete turn (`chatTurnRuntime` saves only
 * validated complete turns), so an `instruction` row with no later report from its
 * `targetAgentId` is exactly a turn that never finished — including one interrupted by a
 * relaunch or a restore. Nothing here writes, and no `chatTabs.status`/`ai*` column is
 * written to represent an in-flight turn (36-03 prohibition).
 *
 * Scope ceiling: this covers instruction/report turn pairs (the batch path). A mention
 * turn writes no instruction row, so it cannot be inferred this way; extending to mention
 * turns needs the user-message → report pairing that Phase 37's turn lifecycle owns.
 */
export async function listInterruptedAssignments(
  threadId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<InterruptedAssignment[]> {
  const rows = await readThreadMessages(threadId, db);
  const pending: Array<{ agentId: string; task: string; createdAt: string }> = [];

  rows.forEach((row, index) => {
    if (row.messageKind !== 'instruction' || !row.targetAgentId) return;
    // Index comparison mirrors `readThreadMessages` ordering, so a same-millisecond tie
    // is resolved the same way the transcript renders it. A report written earlier is stale.
    const answered = rows.some(
      (later, laterIndex) =>
        laterIndex > index &&
        later.messageKind === 'report' &&
        later.agentId === row.targetAgentId
    );
    if (answered) return;
    pending.push({ agentId: row.targetAgentId, task: row.content, createdAt: row.createdAt });
  });

  if (pending.length === 0) return [];

  // The instruction row is attributed to the lead (D-31), so the affected agent's name
  // comes from the roster, not from the row. T-36-18: only names leave this function.
  const employees = await db.aiEmployees.bulkGet(pending.map((entry) => entry.agentId));
  return pending.map((entry, index) => ({
    ...entry,
    agentName: employees[index]?.name ?? 'Nhân viên',
  }));
}

/**
 * Cross-team read guard (T-34-07): the thread id comes from the caller's request-bound
 * context, never from model arguments, so a foreign turn id can never leak another team's data.
 */
export async function getTeamTurn(
  threadId: string,
  turnId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<ChatMessage | undefined> {
  const row = await db.chatMessages.get(turnId);
  if (!row || row.threadId !== threadId) return undefined;
  return row;
}

/** D-11: BM25 source data for the team's own transcript. */
export async function buildTeamBm25Docs(
  threadId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<BM25Document[]> {
  const rows = await readThreadMessages(threadId, db);
  return rows.map((row) => ({
    id: row.id,
    title: row.agentName ?? (row.role === 'user' ? 'Người dùng' : 'Trợ lý'),
    tags: [row.messageKind ?? row.role],
    body: row.content,
    updatedAt: row.createdAt,
  }));
}
