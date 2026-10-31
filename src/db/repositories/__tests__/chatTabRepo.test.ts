import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { SCHEMA_V13 } from '../../schema';
import { TaskPlannerDatabase } from '../../index';
import type { ChatThread } from '../../../types/models';

const LEGACY_DB_NAME = `LegacyChatTabs_${Math.random()}`;
import {
  createChatTab,
  deleteChatTab,
  getActiveTab,
  getOrCreateActiveChatTab,
  getOrCreateSdlcTab,
  listTabsByScope,
  setActiveTab,
  updateChatTab,
} from '../chatTabRepo';

const projectId = '11111111-1111-4111-8111-111111111111';
const taskId = '22222222-2222-4222-8222-222222222222';

async function addThread(
  db: TaskPlannerDatabase,
  input: {
    id: string;
    scopeKey: string;
    scopeType: 'global' | 'task' | 'project' | 'milestone' | 'document';
    entityId?: string;
    title?: string;
  }
): Promise<void> {
  const now = new Date().toISOString();
  await db.chatThreads.add({ ...input, createdAt: now, updatedAt: now });
}

describe('chatTabRepo', () => {
  let db: TaskPlannerDatabase;

  beforeEach(() => {
    db = new TaskPlannerDatabase(`TestChatTabs_${Math.random()}`);
  });

  afterEach(async () => {
    await db.delete();
  });

  it('creates one default ordinary tab for every supported scope', async () => {
    const scopes = [
      ['global', 'global'],
      ['task', `task:${taskId}`],
      ['milestone', 'milestone:milestone-1'],
      ['document', 'document:document-1'],
      ['project', `project:${projectId}`],
    ] as const;

    for (const [scopeType, scopeKey] of scopes) {
      const tab = await createChatTab({ scopeType, scopeKey }, db);
      expect(tab.type).toBe('chat');
      expect(tab.active).toBe(true);
      expect(tab.title).toBe('💬 Cuộc trò chuyện #1');
      expect((await listTabsByScope(scopeKey, db)).map((item) => item.id)).toEqual([tab.id]);
    }
  });

  it('keeps exactly one non-deletable SDLC tab per project', async () => {
    const first = await getOrCreateSdlcTab(projectId, db);
    const second = await getOrCreateSdlcTab(projectId, db);

    expect(second.id).toBe(first.id);
    expect(second.type).toBe('sdlc');
    expect((await listTabsByScope(`project:${projectId}`, db)).filter((tab) => tab.type === 'sdlc')).toHaveLength(1);
    await expect(deleteChatTab(first.id, db)).rejects.toThrow(/SDLC/);
  });

  it('adopts the legacy project thread for the SDLC tab instead of orphaning it', async () => {
    await addThread(db, { id: 'legacy-thread', scopeKey: `project:${projectId}`, scopeType: 'project', entityId: projectId });

    const sdlcTab = await getOrCreateSdlcTab(projectId, db);

    expect(sdlcTab.threadId).toBe('legacy-thread');
    expect(await db.chatThreads.count()).toBe(1);
  });

  it('seeds a default chat tab for a legacy project thread already claimed by an ordinary tab', async () => {
    await addThread(db, { id: 'claimed-thread', scopeKey: `project:${projectId}`, scopeType: 'project', entityId: projectId });
    await db.chatTabs.add({ id: 'existing', threadId: 'claimed-thread', scopeKey: `project:${projectId}`, type: 'chat', title: 'Chat', order: 0, active: true, createdAt: 'now', updatedAt: 'now' });

    const sdlcTab = await getOrCreateSdlcTab(projectId, db);

    expect(sdlcTab.threadId).not.toBe('claimed-thread');
  });

  it('replaces final ordinary tab and persists editable title', async () => {
    const first = await createChatTab({ scopeType: 'project', scopeKey: `project:${projectId}` }, db);
    await updateChatTab(first.id, { title: 'Planning chat' }, db);
    expect((await db.chatThreads.get(first.threadId))?.title).toBe('Planning chat');

    await deleteChatTab(first.id, db);
    const replacement = await getActiveTab(`project:${projectId}`, db);
    expect(replacement?.title).toBe('💬 Cuộc trò chuyện #1');
  });

  it('keeps exactly one active tab per scope when the last ordinary tab is closed under an active SDLC tab', async () => {
    const sdlcTab = await getOrCreateSdlcTab(projectId, db);
    const ordinary = await createChatTab({ scopeType: 'project', scopeKey: `project:${projectId}` }, db);
    // The normal post-intake state: the SDLC tab is active, the ordinary tab is not.
    await setActiveTab(`project:${projectId}`, sdlcTab.id, db);

    await deleteChatTab(ordinary.id, db);

    const tabs = await listTabsByScope(`project:${projectId}`, db);
    expect(tabs.filter((tab) => tab.active)).toHaveLength(1);
    expect(tabs.find((tab) => tab.active)?.id).toBe(sdlcTab.id);
  });

  it('does not adopt a legacy scope thread another tab already claims', async () => {
    await addThread(db, { id: 'claimed-thread', scopeKey: `project:${projectId}`, scopeType: 'project', entityId: projectId });
    // The claim lives on a tab in another scope, so this scope's own tab list is still empty.
    await db.chatTabs.add({
      id: 'other-scope-owner',
      threadId: 'claimed-thread',
      scopeKey: 'task:elsewhere',
      type: 'chat',
      title: 'Owner elsewhere',
      order: 0,
      active: true,
      createdAt: 'now',
      updatedAt: 'now',
    });

    const tab = await getOrCreateActiveChatTab(
      { scopeType: 'project', scopeKey: `project:${projectId}` },
      db
    );

    // Adopting the claimed row would raise a ConstraintError on the unique threadId index.
    expect(tab.threadId).not.toBe('claimed-thread');
  });

  it('persists active tab independently by scope', async () => {
    const first = await createChatTab({ scopeType: 'project', scopeKey: `project:${projectId}` }, db);
    const second = await createChatTab({ scopeType: 'project', scopeKey: `project:${projectId}` }, db);
    const taskTab = await createChatTab({ scopeType: 'task', scopeKey: `task:${taskId}` }, db);

    await setActiveTab(`project:${projectId}`, first.id, db);
    await setActiveTab(`task:${taskId}`, taskTab.id, db);

    expect((await getActiveTab(`project:${projectId}`, db))?.id).toBe(first.id);
    expect((await getActiveTab(`task:${taskId}`, db))?.id).toBe(taskTab.id);
    expect((await listTabsByScope(`project:${projectId}`, db)).find((tab) => tab.id === second.id)?.active).toBe(false);
  });

  it('promotes legacy project threads without deleting or reclassifying them', async () => {
    const legacyProjectThreadId = '33333333-3333-4333-8333-333333333333';
    const legacySdlcThreadId = '44444444-4444-4444-8444-444444444444';
    await addThread(db, {
      id: legacyProjectThreadId,
      scopeKey: `project:${projectId}`,
      scopeType: 'project',
      entityId: projectId,
      title: 'Legacy project chat',
    });
    await addThread(db, {
      id: legacySdlcThreadId,
      scopeKey: `project:${projectId}:sdlc`,
      scopeType: 'project',
      entityId: projectId,
      title: 'Legacy SDLC',
    });
    await db.close();
    const legacy = new Dexie(LEGACY_DB_NAME);
    legacy.version(13).stores(SCHEMA_V13);
    await legacy.open();
    await legacy.table<ChatThread>('chatThreads').bulkAdd([
      {
        id: legacyProjectThreadId,
        scopeKey: `project:${projectId}`,
        scopeType: 'project',
        entityId: projectId,
        title: 'Legacy project chat',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: legacySdlcThreadId,
        scopeKey: `project:${projectId}:sdlc`,
        scopeType: 'project',
        entityId: projectId,
        title: 'Legacy SDLC',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
    await legacy.close();

    db = new TaskPlannerDatabase(LEGACY_DB_NAME);
    await db.open();


    const tabs = await listTabsByScope(`project:${projectId}`, db);
    expect(tabs.filter((tab) => tab.type === 'sdlc')).toHaveLength(1);
    expect(tabs.find((tab) => tab.threadId === legacyProjectThreadId)?.type).toBe('chat');
    expect(tabs.find((tab) => tab.threadId === legacySdlcThreadId)?.type).toBe('sdlc');
    expect(await db.chatThreads.get(legacyProjectThreadId)).toBeDefined();
    expect(await db.chatThreads.get(legacySdlcThreadId)).toBeDefined();
  });
});
