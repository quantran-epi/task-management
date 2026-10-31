import { db as defaultDb, type TaskPlannerDatabase } from '../index';
import type { ChatScopeType, ChatTab, ChatThread } from '../../types/models';
import { generateId } from '../../utils/uuid';

const SDLC_TITLE = '⚙️ SDLC Workflow';
const DEFAULT_CHAT_TITLE = '💬 Cuộc trò chuyện';

type ChatScopeInput = {
  scopeType: ChatScopeType;
  scopeKey: string;
  entityId?: string | undefined;
};

type CreateChatTabInput = ChatScopeInput & {
  title?: string | undefined;
  config?: ChatTab['config'];
};

function ordinaryTabs(tabs: ChatTab[]): ChatTab[] {
  return tabs.filter((tab) => tab.type === 'chat').sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
}

function threadScopeParts(scopeKey: string, fallback?: ChatScopeInput): Pick<ChatThread, 'scopeType' | 'entityId'> {
  const [scopeType, entityId] = scopeKey.split(':', 2);
  if (scopeKey === 'global') return { scopeType: 'global' };
  if (fallback) return { scopeType: fallback.scopeType, ...(fallback.entityId ? { entityId: fallback.entityId } : {}) };
  if (scopeType === 'task' || scopeType === 'project' || scopeType === 'milestone' || scopeType === 'document') {
    return { scopeType, ...(entityId ? { entityId } : {}) };
  }
  return { scopeType: 'global' };
}

async function ensureOrdinaryThread(
  input: CreateChatTabInput,
  db: TaskPlannerDatabase,
  now: string
): Promise<{ thread: ChatThread; tabs: ChatTab[] }> {
  const tabs = await listTabsByScope(input.scopeKey, db);
  const existing = ordinaryTabs(tabs);
  const order = existing.length;
  const id = generateId();
  const title = input.title?.trim() || `${DEFAULT_CHAT_TITLE} #${order + 1}`;
  const thread: ChatThread = {
    id,
    scopeKey: `${input.scopeKey}:chat:${id}`,
    ...threadScopeParts(input.scopeKey, input),
    title,
    createdAt: now,
    updatedAt: now,
  };
  const tab: ChatTab = {
    id,
    threadId: thread.id,
    scopeKey: input.scopeKey,
    type: 'chat',
    title,
    order,
    active: tabs.length === 0,
    ...(input.config ? { config: input.config } : {}),
    createdAt: now,
    updatedAt: now,
  };
  return { thread, tabs: [...tabs, tab] };
}

export async function listTabsByScope(scopeKey: string, db: TaskPlannerDatabase = defaultDb): Promise<ChatTab[]> {
  return db.chatTabs.where('scopeKey').equals(scopeKey).sortBy('order');
}

export async function getActiveTab(scopeKey: string, db: TaskPlannerDatabase = defaultDb): Promise<ChatTab | undefined> {
  return (await listTabsByScope(scopeKey, db)).find((tab) => tab.active) ?? (await listTabsByScope(scopeKey, db))[0];
}

export async function getOrCreateSdlcTab(projectId: string, db: TaskPlannerDatabase = defaultDb): Promise<ChatTab> {
  const scopeKey = `project:${projectId}`;

  return db.transaction('rw', [db.chatThreads, db.chatTabs], async () => {
    const scopeTabs = await db.chatTabs.where('scopeKey').equals(scopeKey).toArray();
    const existing = scopeTabs.find((tab) => tab.type === 'sdlc');
    if (existing) return existing;

    const now = new Date().toISOString();
    const existingProjectThreads = await db.chatThreads.where('entityId').equals(projectId).toArray();
    const claimedThreadIds = new Set((await db.chatTabs.toArray()).map((tab) => tab.threadId));
    const sdlcThread = existingProjectThreads.find((thread) => thread.scopeKey === `${scopeKey}:sdlc`)
      // Pre-tab legacy threads used `project:<id>` for the single project conversation; adopt one only if unclaimed.
      ?? existingProjectThreads.find((thread) => thread.scopeKey === scopeKey && !claimedThreadIds.has(thread.id));
    const thread: ChatThread = sdlcThread ?? {
      id: generateId(),
      scopeKey: `${scopeKey}:sdlc`,
      scopeType: 'project',
      entityId: projectId,
      title: SDLC_TITLE,
      createdAt: now,
      updatedAt: now,
    };
    const tab: ChatTab = {
      id: generateId(),
      threadId: thread.id,
      scopeKey,
      type: 'sdlc',
      title: SDLC_TITLE,
      order: 0,
      active: scopeTabs.length === 0,
      createdAt: thread.createdAt,
      updatedAt: now,
    };
    if (!sdlcThread) await db.chatThreads.add(thread);
    await db.chatTabs.add(tab);
    return tab;
  });
}

export async function createChatTab(input: CreateChatTabInput, db: TaskPlannerDatabase = defaultDb): Promise<ChatTab> {
  const now = new Date().toISOString();
  const { thread, tabs } = await ensureOrdinaryThread(input, db, now);
  const tab = tabs[tabs.length - 1];
  if (!tab) throw new Error('Unable to create chat tab');
  await db.transaction('rw', [db.chatThreads, db.chatTabs], async () => {
    await db.chatThreads.add(thread);
    if (tab.active) {
      await db.chatTabs.where('scopeKey').equals(input.scopeKey).modify({ active: false });
    }
    await db.chatTabs.add(tab);
  });
  return tab;
}

/**
 * Returns the scope's active ordinary tab, creating exactly one when the scope has none (D-01).
 * Callers that can race (drawer bootstrap + a send path) must single-flight this per scope.
 */
export async function getOrCreateActiveChatTab(
  input: CreateChatTabInput,
  db: TaskPlannerDatabase = defaultDb
): Promise<ChatTab> {
  const tabs = await listTabsByScope(input.scopeKey, db);
  const existing = tabs.find((tab) => tab.active) ?? tabs[0];
  if (existing) return existing;

  const now = new Date().toISOString();
  // Adopt a legacy scope thread (the pre-tab conversation) instead of orphaning its history.
  const legacy = await db.chatThreads.where('scopeKey').equals(input.scopeKey).first();
  const thread: ChatThread = legacy ?? {
    id: generateId(),
    scopeKey: input.scopeKey,
    ...threadScopeParts(input.scopeKey, input),
    title: input.title?.trim() || `${DEFAULT_CHAT_TITLE} #1`,
    createdAt: now,
    updatedAt: now,
  };
  if (!legacy) await db.chatThreads.add(thread);

  const tab: ChatTab = {
    id: generateId(),
    threadId: thread.id,
    scopeKey: input.scopeKey,
    type: 'chat',
    title: thread.title || `${DEFAULT_CHAT_TITLE} #1`,
    order: 0,
    active: true,
    createdAt: thread.createdAt,
    updatedAt: now,
  };
  await db.chatTabs.add(tab);
  return tab;
}

export async function setActiveTab(scopeKey: string, tabId: string, db: TaskPlannerDatabase = defaultDb): Promise<ChatTab> {
  const tab = await db.chatTabs.get(tabId);
  if (!tab || tab.scopeKey !== scopeKey) throw new Error('Chat tab does not belong to scope');
  await db.transaction('rw', [db.chatTabs], async () => {
    await db.chatTabs.where('scopeKey').equals(scopeKey).modify({ active: false });
    await db.chatTabs.update(tabId, { active: true, updatedAt: new Date().toISOString() });
  });
  return (await db.chatTabs.get(tabId)) as ChatTab;
}

export async function updateChatTab(
  tabId: string,
  patch: Partial<Pick<ChatTab, 'title' | 'config' | 'checkpoint' | 'status' | 'workflowState'>>,
  db: TaskPlannerDatabase = defaultDb
): Promise<ChatTab> {
  const tab = await db.chatTabs.get(tabId);
  if (!tab) throw new Error('Chat tab not found');
  const now = new Date().toISOString();
  const title = patch.title?.trim() || tab.title;
  await db.transaction('rw', [db.chatTabs, db.chatThreads], async () => {
    await db.chatTabs.update(tabId, { ...patch, title, updatedAt: now });
    await db.chatThreads.update(tab.threadId, { title, updatedAt: now });
  });
  return (await db.chatTabs.get(tabId)) as ChatTab;
}

export async function deleteChatTab(tabId: string, db: TaskPlannerDatabase = defaultDb): Promise<void> {
  const tab = await db.chatTabs.get(tabId);
  if (!tab) return;
  if (tab.type === 'sdlc') throw new Error('SDLC tab cannot be deleted');
  await db.transaction('rw', [db.chatTabs, db.chatThreads, db.chatMessages], async () => {
    await db.chatMessages.where('threadId').equals(tab.threadId).delete();
    await db.chatTabs.delete(tabId);
    await db.chatThreads.delete(tab.threadId);
    const remaining = ordinaryTabs(await listTabsByScope(tab.scopeKey, db));
    if (remaining.length === 0) {
      const now = new Date().toISOString();
      const id = generateId();
      const title = `${DEFAULT_CHAT_TITLE} #1`;
      await db.chatThreads.add({
        id,
        scopeKey: `${tab.scopeKey}:chat:${id}`,
        ...threadScopeParts(tab.scopeKey),
        title,
        createdAt: now,
        updatedAt: now,
      });
      await db.chatTabs.add({
        id,
        threadId: id,
        scopeKey: tab.scopeKey,
        type: 'chat',
        title,
        order: 0,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    } else if (tab.active) {
      const nextTab = remaining[0];
      if (nextTab) await db.chatTabs.update(nextTab.id, { active: true });
    }
  });
}
