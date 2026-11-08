import { db as defaultDb, type TaskPlannerDatabase } from '../index';
import type { ChatMessage, ChatRole, ChatThread, ChatTokenUsage } from '../../types/models';
import { ASSIGNMENT_HISTORY_CAP, RECENT_WINDOW_TURNS } from '../../types/aiOffice';
import type { BM25Document } from '../../utils/bm25';
import { generateId } from '../../utils/uuid';
import { createOrGetThread } from './chatRepo';
import { notifyAIChatSync } from '../../services/ai/aiSyncChannel';

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
  messageKind?: 'instruction' | 'report' | 'synthesis' | 'plan' | undefined;
  /** CR-06: the employee an instruction row is assigned to (display attribution stays the lead). */
  targetAgentId?: string | undefined;
  tokenUsage?: ChatTokenUsage | undefined;
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
  };

  await db.transaction('rw', [db.chatMessages, db.chatThreads], async () => {
    await db.chatMessages.add(message);
    await db.chatThreads.update(input.threadId, { updatedAt: now });
  });

  notifyAIChatSync({ type: 'message_saved', threadId: input.threadId });
  return message;
}

async function readThreadMessages(
  threadId: string,
  db: TaskPlannerDatabase
): Promise<ChatMessage[]> {
  const rows = await db.chatMessages.where('threadId').equals(threadId).sortBy('createdAt');
  // Two messages can share a millisecond; fall back to the id so order is deterministic.
  return rows.sort((a, b) => (a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : 0));
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
