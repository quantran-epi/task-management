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
  };

  await db.transaction('rw', [db.chatMessages, db.chatThreads], async () => {
    await db.chatMessages.add(message);
    await db.chatThreads.update(input.threadId, { updatedAt: now });
  });

  return message;
}

export async function getMessagesByThreadId(
  threadId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<ChatMessage[]> {
  return db.chatMessages.where('threadId').equals(threadId).sortBy('createdAt');
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

export async function clearAllChatHistory(
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.transaction('rw', [db.chatThreads, db.chatMessages], async () => {
    await db.chatMessages.clear();
    await db.chatThreads.clear();
  });
}
