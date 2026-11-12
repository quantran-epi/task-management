import { db as defaultDb, type TaskPlannerDatabase } from '../index';
import type {
  ChatThread,
  ChatMessage,
  ChatScopeType,
  ChatRole,
  ChatTokenUsage,
  ChatGeneratedFile,
} from '../../types/models';
import {
  ChatMessageGroundingSchema,
  type ChatMessageGrounding,
} from '../../services/ai/groundedAnswerSchemas';
import { generateId } from '../../utils/uuid';
import { notifyAIChatSync } from '../../services/ai/aiSyncChannel';

export interface CreateOrGetThreadInput {
  scopeType: ChatScopeType;
  entityId?: string | undefined;
  title?: string | undefined;
}

export interface SaveMessageInput {
  threadId: string;
  role: ChatRole;
  content: string;
  isContextBoundary?: boolean | undefined;
  durationMs?: number | undefined;
  tokenUsage?: ChatTokenUsage | undefined;
  generatedFiles?: ChatGeneratedFile[] | undefined;
  grounding?: ChatMessageGrounding | undefined;
  /** Phase 34 D-31: AI Office attribution, forwarded into the stored row. */
  agentId?: string | undefined;
  agentName?: string | undefined;
  agentKind?: 'lead' | 'employee' | undefined;
  messageKind?: 'instruction' | 'report' | 'synthesis' | 'plan' | undefined;
}

export function buildScopeKey(scopeType: ChatScopeType, entityId?: string): string {
  if (scopeType === 'global' || !entityId) {
    return 'global';
  }
  return `${scopeType}:${entityId}`;
}

export async function getThreadByScope(
  scopeKey: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<ChatThread | undefined> {
  return db.chatThreads.where('scopeKey').equals(scopeKey).first();
}

export async function createOrGetThread(
  input: CreateOrGetThreadInput,
  db: TaskPlannerDatabase = defaultDb
): Promise<ChatThread> {
  const scopeKey = buildScopeKey(input.scopeType, input.entityId);
  // The read and the insert MUST share one `rw` transaction. `chatThreads.scopeKey` is a
  // unique index, so two callers that both see "no row" would otherwise both insert and the
  // loser throws `ConstraintError` — which is exactly what React StrictMode's double-invoked
  // first mount does. IndexedDB serializes `rw` transactions over the same store, so the
  // second caller's read sees the first caller's row.
  return db.transaction('rw', db.chatThreads, async () => {
    const existing = await db.chatThreads.where('scopeKey').equals(scopeKey).first();
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const thread: ChatThread = {
      id: generateId(),
      scopeKey,
      scopeType: input.scopeType,
      ...(input.entityId ? { entityId: input.entityId } : {}),
      ...(input.title?.trim() ? { title: input.title.trim() } : {}),
      createdAt: now,
      updatedAt: now,
    };

    await db.chatThreads.add(thread);
    return thread;
  });
}

export async function saveMessage(
  input: SaveMessageInput,
  db: TaskPlannerDatabase = defaultDb
): Promise<ChatMessage> {
  if (input.grounding !== undefined) {
    const parseResult = ChatMessageGroundingSchema.safeParse(input.grounding);
    if (!parseResult.success) {
      const error = new Error(`Malformed message grounding: ${parseResult.error.message}`);
      (error as Error & { code: string }).code = 'INVALID_GROUNDING';
      throw error;
    }
  }

  const now = new Date().toISOString();
  const message: ChatMessage = {
    id: generateId(),
    threadId: input.threadId,
    role: input.role,
    content: input.content,
    createdAt: now,
    ...(input.isContextBoundary ? { isContextBoundary: true } : {}),
    ...(typeof input.durationMs === 'number' ? { durationMs: input.durationMs } : {}),
    ...(input.tokenUsage ? { tokenUsage: input.tokenUsage } : {}),
    ...(input.generatedFiles && input.generatedFiles.length > 0
      ? { generatedFiles: input.generatedFiles }
      : {}),
    ...(input.grounding ? { grounding: input.grounding } : {}),
    ...(input.agentId ? { agentId: input.agentId } : {}),
    ...(input.agentName ? { agentName: input.agentName } : {}),
    ...(input.agentKind ? { agentKind: input.agentKind } : {}),
    ...(input.messageKind ? { messageKind: input.messageKind } : {}),
  };

  await db.transaction('rw', [db.chatMessages, db.chatThreads], async () => {
    await db.chatMessages.add(message);
    await db.chatThreads.update(input.threadId, { updatedAt: now });
  });

  notifyAIChatSync({
    type: 'message_saved',
    threadId: input.threadId,
  });

  return message;
}

export async function getMessagesByThreadId(
  threadId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<ChatMessage[]> {
  const rows = await db.chatMessages.where('threadId').equals(threadId).sortBy('createdAt');
  // Two messages can share a millisecond; fall back to the id so order is deterministic.
  return rows.sort((a, b) =>
    a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : 0
  );
}

export async function clearThreadContext(
  threadId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<ChatMessage> {
  return saveMessage(
    {
      threadId,
      role: 'system',
      content: '--- Ngữ cảnh đã được đặt lại ---',
      isContextBoundary: true,
    },
    db
  );
}

export async function deleteThreadByScope(
  scopeKey: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.transaction('rw', [db.chatThreads, db.chatMessages], async () => {
    const thread = await db.chatThreads.where('scopeKey').equals(scopeKey).first();
    if (thread) {
      await db.chatMessages.where('threadId').equals(thread.id).delete();
      await db.chatThreads.delete(thread.id);
    }
  });
}

export async function clearThreadMessages(
  threadId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.transaction('rw', [db.chatMessages], async () => {
    await db.chatMessages.where('threadId').equals(threadId).delete();
  });
}

/**
 * Wipes every conversation and keeps the tab/thread invariant intact.
 * Tabs must die with their threads: a surviving tab with a deleted threadId makes the app's own
 * backup fail validation (`ChatTab references threadId ... not found`), and the next send writes
 * into a thread no tab can display. The first tab is recreated lazily by the normal bootstrap paths.
 */
export async function clearAllChatHistory(
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.transaction('rw', [db.chatThreads, db.chatMessages, db.chatTabs], async () => {
    await db.chatMessages.clear();
    await db.chatThreads.clear();
    await db.chatTabs.clear();
  });
}

/**
 * Tạo thêm một Tab Chat thường trong Change Request (cho phép nhiều tab song song).
 */
export async function createChatTabThread(
  crId: string,
  title?: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<ChatThread> {
  const id = generateId();
  const scopeKey = `cr:${crId}:chat:${id}`;
  const now = new Date().toISOString();

  const thread: ChatThread = {
    id,
    scopeKey,
    scopeType: 'cr',
    entityId: crId,
    title: title?.trim() || '💬 Cuộc trò chuyện mới',
    createdAt: now,
    updatedAt: now,
  };

  await db.chatThreads.add(thread);
  return thread;
}

/**
 * Lấy tất cả các thread thuộc về 1 Change Request (cả SDLC lẫn chat thường).
 */
export async function getCrThreads(
  crId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<ChatThread[]> {
  return db.chatThreads.where('entityId').equals(crId).toArray();
}

/**
 * Xóa một tab chat thường (xóa cả tin nhắn và thread trong Dexie).
 */
export async function deleteChatTabThread(
  threadId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.transaction('rw', [db.chatThreads, db.chatMessages], async () => {
    await db.chatMessages.where('threadId').equals(threadId).delete();
    await db.chatThreads.delete(threadId);
  });
}

