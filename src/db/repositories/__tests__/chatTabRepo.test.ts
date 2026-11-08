import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../index';
import type { ChatThread } from '../../../types/models';
import {
  createChatTab,
  deleteChatTab,
  getActiveTab,
  getOrCreateActiveChatTab,
  getOrCreateSdlcTab,
  listTabsByScope,
  setActiveTab,
  threadScopeParts,
  updateChatTab,
} from '../chatTabRepo';

const crId = '11111111-1111-4111-8111-111111111111';
const taskId = '22222222-2222-4222-8222-222222222222';

async function addThread(
  db: TaskPlannerDatabase,
  input: {
    id: string;
    scopeKey: string;
    scopeType: ChatThread['scopeType'];
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

  it('resolves CR and system scope keys to their own scope type', () => {
    expect(threadScopeParts(`cr:${crId}`)).toEqual({ scopeType: 'cr', entityId: crId });
    expect(threadScopeParts('system:xyz')).toEqual({ scopeType: 'system', entityId: 'xyz' });
    expect(threadScopeParts(`task:${taskId}`)).toEqual({ scopeType: 'task', entityId: taskId });
    expect(threadScopeParts('global')).toEqual({ scopeType: 'global' });
  });

  it('falls back to global for a legacy project scope key', () => {
    expect(threadScopeParts('project:abc')).toEqual({ scopeType: 'global' });
    expect(threadScopeParts('milestone:abc')).toEqual({ scopeType: 'global' });
  });

  it('resolves a team scope key to its own scope type, never to global', () => {
    expect(threadScopeParts(`team:${crId}`)).toEqual({ scopeType: 'team', entityId: crId });
    expect(threadScopeParts('unknown:abc')).toEqual({ scopeType: 'global' });
  });

  it('creates one default ordinary tab for every supported scope', async () => {
    const scopes = [
      ['global', 'global'],
      ['task', `task:${taskId}`],
      ['cr', `cr:${crId}`],
      ['system', 'system:system-1'],
      ['document', 'document:document-1'],
    ] as const;

    for (const [scopeType, scopeKey] of scopes) {
      const tab = await createChatTab({ scopeType, scopeKey }, db);
      expect(tab.type).toBe('chat');
      expect(tab.active).toBe(true);
      expect(tab.title).toBe('💬 Cuộc trò chuyện #1');
      expect((await listTabsByScope(scopeKey, db)).map((item) => item.id)).toEqual([tab.id]);
    }
  });

  it('keeps exactly one non-deletable SDLC tab per CR', async () => {
    const first = await getOrCreateSdlcTab(crId, db);
    const second = await getOrCreateSdlcTab(crId, db);

    expect(second.id).toBe(first.id);
    expect(second.type).toBe('sdlc');
    expect((await listTabsByScope(`cr:${crId}`, db)).filter((tab) => tab.type === 'sdlc')).toHaveLength(1);
    await expect(deleteChatTab(first.id, db)).rejects.toThrow(/SDLC/);
  });

  it('adopts an unclaimed CR thread for the SDLC tab instead of orphaning it', async () => {
    await addThread(db, { id: 'legacy-thread', scopeKey: `cr:${crId}`, scopeType: 'cr', entityId: crId });

    const sdlcTab = await getOrCreateSdlcTab(crId, db);

    expect(sdlcTab.threadId).toBe('legacy-thread');
    expect(await db.chatThreads.count()).toBe(1);
  });

  it('seeds a default chat tab for a CR thread already claimed by an ordinary tab', async () => {
    await addThread(db, { id: 'claimed-thread', scopeKey: `cr:${crId}`, scopeType: 'cr', entityId: crId });
    await db.chatTabs.add({ id: 'existing', threadId: 'claimed-thread', scopeKey: `cr:${crId}`, type: 'chat', title: 'Chat', order: 0, active: true, createdAt: 'now', updatedAt: 'now' });

    const sdlcTab = await getOrCreateSdlcTab(crId, db);

    expect(sdlcTab.threadId).not.toBe('claimed-thread');
  });

  it('replaces final ordinary tab and persists editable title', async () => {
    const first = await createChatTab({ scopeType: 'cr', scopeKey: `cr:${crId}` }, db);
    await updateChatTab(first.id, { title: 'Planning chat' }, db);
    expect((await db.chatThreads.get(first.threadId))?.title).toBe('Planning chat');

    await deleteChatTab(first.id, db);
    const replacement = await getActiveTab(`cr:${crId}`, db);
    expect(replacement?.title).toBe('💬 Cuộc trò chuyện #1');
  });

  it('keeps exactly one active tab per scope when the last ordinary tab is closed under an active SDLC tab', async () => {
    const sdlcTab = await getOrCreateSdlcTab(crId, db);
    const ordinary = await createChatTab({ scopeType: 'cr', scopeKey: `cr:${crId}` }, db);
    // The normal post-intake state: the SDLC tab is active, the ordinary tab is not.
    await setActiveTab(`cr:${crId}`, sdlcTab.id, db);

    await deleteChatTab(ordinary.id, db);

    const tabs = await listTabsByScope(`cr:${crId}`, db);
    expect(tabs.filter((tab) => tab.active)).toHaveLength(1);
    expect(tabs.find((tab) => tab.active)?.id).toBe(sdlcTab.id);
  });

  it('does not adopt a scope thread another tab already claims', async () => {
    await addThread(db, { id: 'claimed-thread', scopeKey: `cr:${crId}`, scopeType: 'cr', entityId: crId });
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
      { scopeType: 'cr', scopeKey: `cr:${crId}` },
      db
    );

    // Adopting the claimed row would raise a ConstraintError on the unique threadId index.
    expect(tab.threadId).not.toBe('claimed-thread');
  });

  it('persists active tab independently by scope', async () => {
    const first = await createChatTab({ scopeType: 'cr', scopeKey: `cr:${crId}` }, db);
    const second = await createChatTab({ scopeType: 'cr', scopeKey: `cr:${crId}` }, db);
    const taskTab = await createChatTab({ scopeType: 'task', scopeKey: `task:${taskId}` }, db);

    await setActiveTab(`cr:${crId}`, first.id, db);
    await setActiveTab(`task:${taskId}`, taskTab.id, db);

    expect((await getActiveTab(`cr:${crId}`, db))?.id).toBe(first.id);
    expect((await getActiveTab(`task:${taskId}`, db))?.id).toBe(taskTab.id);
    expect((await listTabsByScope(`cr:${crId}`, db)).find((tab) => tab.id === second.id)?.active).toBe(false);
  });
});
