import { db as defaultDb, type TaskPlannerDatabase } from '../index';
import type {
  ChatThread,
  ChatMessage,
  ChatScopeType,
  ChatRole,
  ChatTokenUsage,
  ChatGeneratedFile,
} from '../../types/models';
import { WizardSnapshotSchema, type WizardSnapshot } from '../../services/ai/wizardSchemas';
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
  wizard?: WizardSnapshot | undefined;
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

  let wizard: WizardSnapshot | undefined;
  if (input.wizard !== undefined) {
    const parsed = WizardSnapshotSchema.safeParse(input.wizard);
    if (!parsed.success) {
      const error = new Error(`Malformed wizard snapshot: ${parsed.error.message}`);
      (error as Error & { code: string }).code = 'INVALID_WIZARD_SNAPSHOT';
      throw error;
    }
    wizard = parsed.data;
    const thread = await db.chatThreads.get(input.threadId);
    if (!thread || thread.id !== wizard.threadId) {
      const error = new Error('Wizard thread does not match persisted chat thread');
      (error as Error & { code: string }).code = 'WIZARD_THREAD_MISMATCH';
      throw error;
    }
    if (thread.scopeType !== 'project' || thread.entityId !== wizard.projectId) {
      const error = new Error('Wizard project does not match persisted chat thread');
      (error as Error & { code: string }).code = 'WIZARD_PROJECT_MISMATCH';
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
    ...(wizard ? { wizard } : {}),
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

/**
 * Lấy hoặc tạo Thread duy nhất cho SDLC Workflow trong phạm vi Project.
 * Đảm bảo mỗi Project chỉ có duy nhất 1 thread cho SDLC.
 */
export async function getOrCreateSdlcThread(
  projectId: string,
  title?: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<ChatThread> {
  const sdlcScopeKey = `project:${projectId}:sdlc`;
  const existingSdlc = await db.chatThreads.where('scopeKey').equals(sdlcScopeKey).first();
  if (existingSdlc) {
    return existingSdlc;
  }

  // Fallback kiểm tra thread project mặc định nếu đã có từ trước
  const legacyScopeKey = `project:${projectId}`;
  const legacyThread = await db.chatThreads.where('scopeKey').equals(legacyScopeKey).first();
  if (legacyThread) {
    return legacyThread;
  }

  const now = new Date().toISOString();
  const thread: ChatThread = {
    id: generateId(),
    scopeKey: sdlcScopeKey,
    scopeType: 'project',
    entityId: projectId,
    title: title?.trim() || '⚙️ SDLC Workflow',
    createdAt: now,
    updatedAt: now,
  };

  await db.chatThreads.add(thread);
  return thread;
}

/**
 * Tạo thêm một Tab Chat thường trong Project (cho phép nhiều tab song song).
 */
export async function createChatTabThread(
  projectId: string,
  title?: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<ChatThread> {
  const id = generateId();
  const scopeKey = `project:${projectId}:chat:${id}`;
  const now = new Date().toISOString();

  const thread: ChatThread = {
    id,
    scopeKey,
    scopeType: 'project',
    entityId: projectId,
    title: title?.trim() || '💬 Cuộc trò chuyện mới',
    createdAt: now,
    updatedAt: now,
  };

  await db.chatThreads.add(thread);
  return thread;
}

/**
 * Lấy tất cả các thread thuộc về 1 project (cả SDLC lẫn chat thường).
 */
export async function getProjectThreads(
  projectId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<ChatThread[]> {
  return db.chatThreads.where('entityId').equals(projectId).toArray();
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

