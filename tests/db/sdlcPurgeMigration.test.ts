import { describe, it, expect, afterEach } from 'vitest';
import Dexie from 'dexie';
import { TaskPlannerDatabase } from '../../src/db/index';
import { SCHEMA_V17 } from '../../src/db/schema';

/**
 * Phase 35 (C-16, D-05): the V17 → V18 upgrade purges every SDLC row class.
 *
 * SDLC was deleted from the app in wave 5, so the rows it left behind are dead
 * weight that still fails the app's own backup validation. The contract here is
 * narrow: SDLC tabs, threads, their messages, and `sdlc_workflow:*` settings are
 * gone; ordinary chat data is byte-identical.
 *
 * `tests/setup.ts` already installs the IndexedDB shim globally — never re-import it.
 */

const NOW = '2026-11-10T00:00:00.000Z';

type Row = Record<string, unknown>;

const SDLC_TAB: Row = {
  id: 'tab-sdlc',
  threadId: 'thread-sdlc',
  scopeKey: 'cr:cr-1',
  type: 'sdlc',
  title: 'SDLC Workflow',
  order: 0,
  active: false,
  createdAt: NOW,
  updatedAt: NOW,
};

const SDLC_THREAD: Row = {
  id: 'thread-sdlc',
  scopeKey: 'cr:cr-1:sdlc',
  scopeType: 'cr',
  entityId: 'cr-1',
  createdAt: NOW,
  updatedAt: NOW,
};

const SDLC_MESSAGES: Row[] = [
  { id: 'msg-sdlc-1', threadId: 'thread-sdlc', role: 'user', content: 'Step one', createdAt: NOW },
  { id: 'msg-sdlc-2', threadId: 'thread-sdlc', role: 'assistant', content: 'Step two', createdAt: NOW },
];

const CHAT_TAB: Row = {
  id: 'tab-chat',
  threadId: 'thread-chat',
  scopeKey: 'cr:cr-1',
  type: 'chat',
  title: 'Cuộc trò chuyện #1',
  order: 1,
  active: true,
  createdAt: NOW,
  updatedAt: NOW,
};

const CHAT_THREAD: Row = {
  id: 'thread-chat',
  scopeKey: 'cr:cr-1:chat:1',
  scopeType: 'cr',
  entityId: 'cr-1',
  createdAt: NOW,
  updatedAt: NOW,
};

const CHAT_MESSAGES: Row[] = [
  { id: 'msg-chat-1', threadId: 'thread-chat', role: 'user', content: 'Giữ lại tin nhắn', createdAt: NOW },
  { id: 'msg-chat-2', threadId: 'thread-chat', role: 'assistant', content: 'Vẫn còn đây', createdAt: NOW },
];

/**
 * Extra rows a malformed legacy database might carry. Every field is read through a
 * `typeof` guard in the upgrade hook, so none of these may throw mid-upgrade.
 */
const MALFORMED_ROWS: Array<[string, Row]> = [
  ['chatTabs', { id: 'tab-weird-type', threadId: 'thread-malformed', scopeKey: 'cr:cr-1', type: 42, order: 2, createdAt: NOW, updatedAt: NOW }],
  ['chatThreads', { id: 'thread-malformed', scopeKey: 'cr:cr-1:chat:9', scopeType: 'cr', createdAt: NOW, updatedAt: NOW }],
  ['chatThreads', { id: 'thread-no-scope', scopeType: 'cr', createdAt: NOW, updatedAt: NOW }],
  ['chatThreads', { id: 'thread-numeric-scope', scopeKey: 12345, scopeType: 'cr', createdAt: NOW, updatedAt: NOW }],
  ['settings', { key: 99, value: 'not-a-string-key' }],
  ['settings', { key: 'sdlc_workflow_malformed', value: 'not-a-prefixed-key' }],
];

async function seedV17Database(dbName: string, extraRows: Array<[string, Row]> = []): Promise<void> {
  const v17Db = new Dexie(dbName);
  v17Db.version(17).stores(SCHEMA_V17);
  await v17Db.open();

  await v17Db.table('chatTabs').bulkAdd([SDLC_TAB, CHAT_TAB]);
  await v17Db.table('chatThreads').bulkAdd([SDLC_THREAD, CHAT_THREAD]);
  await v17Db.table('chatMessages').bulkAdd([...SDLC_MESSAGES, ...CHAT_MESSAGES]);
  await v17Db.table('settings').bulkAdd([
    { key: 'sdlc_workflow:cr-1:t1', value: { step: 'research' } },
    { key: 'theme', value: 'dark' },
  ]);

  for (const [table, row] of extraRows) {
    await v17Db.table(table).add(row);
  }

  await v17Db.close();
}

describe('Dexie SCHEMA_V18 SDLC purge migration (Phase 35)', () => {
  let dbName: string;
  let upgraded: TaskPlannerDatabase | undefined;

  afterEach(async () => {
    if (upgraded) {
      try {
        await upgraded.delete();
      } catch {
        // already closed/deleted
      }
      upgraded = undefined;
    }
    await Dexie.delete(dbName);
  });

  async function openUpgraded(extraRows: Array<[string, Row]> = []): Promise<TaskPlannerDatabase> {
    dbName = 'TestSdlcPurgeMigrationDB_' + Math.random().toString(36).slice(2);
    await seedV17Database(dbName, extraRows);
    upgraded = new TaskPlannerDatabase(dbName);
    await upgraded.open();
    return upgraded;
  }

  it('1. deletes every chatTab of type sdlc', async () => {
    const db = await openUpgraded();
    const tabs = await db.chatTabs.toArray();
    const sdlcTabs = tabs.filter((tab) => (tab as unknown as { type: string }).type === 'sdlc');

    expect(sdlcTabs).toHaveLength(0);
  });

  it('2. deletes every chatThread whose scopeKey ends with :sdlc', async () => {
    const db = await openUpgraded();
    const threads = await db.chatThreads.toArray();
    const sdlcThreads = threads.filter(
      (thread) => typeof thread.scopeKey === 'string' && thread.scopeKey.endsWith(':sdlc')
    );

    expect(sdlcThreads).toHaveLength(0);
  });

  it('3. deletes every settings key starting with sdlc_workflow:', async () => {
    const db = await openUpgraded();
    const settings = await db.settings.toArray();
    const workflowSettings = settings.filter((setting) => setting.key.startsWith('sdlc_workflow:'));

    expect(workflowSettings).toHaveLength(0);
  });

  it('4. leaves no chatMessage pointing at a thread that no longer exists', async () => {
    const db = await openUpgraded();
    const threadIds = new Set((await db.chatThreads.toArray()).map((thread) => thread.id));
    const messages = await db.chatMessages.toArray();
    const orphans = messages.filter((message) => !threadIds.has(message.threadId));
    const messageIds = messages.map((message) => message.id);

    expect(orphans).toHaveLength(0);
    expect(messageIds).not.toContain('msg-sdlc-1');
    expect(messageIds).not.toContain('msg-sdlc-2');
  });

  it('5. leaves ordinary chat tabs, threads, messages and settings untouched', async () => {
    const db = await openUpgraded();

    expect(await db.chatTabs.get('tab-chat')).toMatchObject({ type: 'chat', threadId: 'thread-chat' });
    expect(await db.chatThreads.get('thread-chat')).toMatchObject({ scopeKey: 'cr:cr-1:chat:1' });
    expect(await db.chatMessages.get('msg-chat-1')).toMatchObject({ content: 'Giữ lại tin nhắn' });
    expect(await db.chatMessages.get('msg-chat-2')).toMatchObject({ content: 'Vẫn còn đây' });
    expect(await db.settings.get('theme')).toMatchObject({ value: 'dark' });
    expect(await db.chatTabs.count()).toBe(1);
    expect(await db.chatThreads.count()).toBe(1);
    expect(await db.chatMessages.count()).toBe(2);
  });

  it('6. survives malformed legacy rows without throwing', async () => {
    const db = await openUpgraded(MALFORMED_ROWS);

    expect(db.verno).toBe(18);
    expect(await db.settings.get('theme')).toMatchObject({ value: 'dark' });
    expect(await db.chatThreads.get('thread-chat')).toBeDefined();
  });
});
