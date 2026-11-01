import { db as defaultDb, type TaskPlannerDatabase } from '../index';
import type {
  ChatThread,
  ChatMessage,
  ChatArtifactEvent,
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
import { SdlcArtifactKindSchema } from '../../services/wizard/workflowSchemas';
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
  artifactEvent?: ChatArtifactEvent | undefined;
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
  // Stamp the persisted id into the card so a host can reopen that exact version later (D-06).
  if (input.artifactEvent) {
    input = {
      ...input,
      artifactEvent: { ...input.artifactEvent, eventId: input.artifactEvent.eventId ?? crypto.randomUUID() },
    };
  }
  if (input.grounding !== undefined) {
    const parseResult = ChatMessageGroundingSchema.safeParse(input.grounding);
    if (!parseResult.success) {
      const error = new Error(`Malformed message grounding: ${parseResult.error.message}`);
      (error as Error & { code: string }).code = 'INVALID_GROUNDING';
      throw error;
    }
  }

  // Artifact cards are durable per version but carry metadata only (T-25.3-43):
  // the artifact body stays in the editor, never in a chat row.
  let artifactEvent: ChatArtifactEvent | undefined;
  if (input.artifactEvent !== undefined) {
    const { kind, title, version, hash, status, ctaLabel } = input.artifactEvent;
    if (
      !SdlcArtifactKindSchema.safeParse(kind).success ||
      !title?.trim() ||
      !/^[a-f0-9]{64}$/.test(hash ?? '') ||
      !Number.isInteger(version) ||
      version < 1
    ) {
      const error = new Error('Malformed artifact event: kind, title, hash (sha256) and version >= 1 are required');
      (error as Error & { code: string }).code = 'INVALID_ARTIFACT_EVENT';
      throw error;
    }
    if (status !== 'draft' && status !== 'approved') {
      const error = new Error('Malformed artifact event: status must be draft or approved');
      (error as Error & { code: string }).code = 'INVALID_ARTIFACT_EVENT';
      throw error;
    }
    artifactEvent = {
      ...(input.artifactEvent.eventId ? { eventId: input.artifactEvent.eventId } : {}),
      kind,
      title: title.trim(),
      version,
      hash,
      status,
      ...(ctaLabel ? { ctaLabel } : {}),
    };
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
    ...(artifactEvent ? { artifactEvent } : {}),
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
 * into a thread no tab can display. SDLC workflow settings are scoped by threadId, so they go too.
 * The first tab (and the SDLC tab) is recreated lazily by the normal bootstrap paths.
 */
export async function clearAllChatHistory(
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.transaction('rw', [db.chatThreads, db.chatMessages, db.chatTabs, db.settings], async () => {
    await db.chatMessages.clear();
    await db.chatThreads.clear();
    await db.chatTabs.clear();
    await db.settings.filter((row) => String(row.key).startsWith('sdlc_workflow:')).delete();
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

