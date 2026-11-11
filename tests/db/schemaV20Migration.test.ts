import { describe, it, expect } from 'vitest';
import Dexie from 'dexie';
import { TaskPlannerDatabase } from '../../src/db/index';
import { SCHEMA_V19, SCHEMA_V20, LATEST_SCHEMA_VERSION } from '../../src/db/schema';

/**
 * V19 → V20 repair: a chat thread carrying a retired `scopeType` (`project`/`milestone`)
 * made the app's own backup export unrestorable, because `BackupChatThreadRecordSchema`
 * only accepts the six current values. The hook rewrites the value from the scope key.
 *
 * `tests/setup.ts` installs the IndexedDB shim globally — never re-import it.
 */

const NOW = '2026-11-11T00:00:00.000Z';

async function seedV19Database(dbName: string): Promise<void> {
  const v19Db = new Dexie(dbName);
  v19Db.version(19).stores(SCHEMA_V19);
  await v19Db.open();

  await v19Db.table('chatThreads').bulkAdd([
    // The bug: a legacy project scope with no entityId collapsed to scopeKey 'global'
    // but kept scopeType 'project', so the V16 prefix purge never saw it.
    { id: 't-1', scopeKey: 'global', scopeType: 'project', createdAt: NOW, updatedAt: NOW },
    // `scopeKey` is unique, so the second legacy row carries the per-thread suffix that
    // `chatTabRepo` appends when a scope already owns a thread.
    {
      id: 't-2',
      scopeKey: 'global:chat:t-2',
      scopeType: 'milestone',
      createdAt: NOW,
      updatedAt: NOW,
    },
    // A properly-scoped legacy row: scope key still names the old axis.
    {
      id: 't-3',
      scopeKey: 'milestone:m-1',
      scopeType: 'milestone',
      entityId: 'm-1',
      createdAt: NOW,
      updatedAt: NOW,
    },
    // Current values must survive untouched.
    {
      id: 't-4',
      scopeKey: 'team:team-1',
      scopeType: 'team',
      entityId: 'team-1',
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]);

  v19Db.close();
}

describe('V19 → V20 chatThreads.scopeType repair', () => {
  it('rewrites retired scope types and leaves current ones alone', async () => {
    const dbName = 'TestSchemaV20_' + Math.random().toString(36).slice(2);
    await seedV19Database(dbName);

    const db = new TaskPlannerDatabase(dbName);
    await db.open();
    try {
      expect(db.verno).toBe(LATEST_SCHEMA_VERSION);

      const threads = await db.chatThreads.toArray();
      const byId = new Map(threads.map((thread) => [thread.id, thread]));

      expect(byId.get('t-1')?.scopeType).toBe('global');
      expect(byId.get('t-2')?.scopeType).toBe('global');
      // t-3's scope key still says 'milestone', which is not a current value either —
      // the row degrades to its global bucket rather than exporting an illegal enum.
      expect(byId.get('t-3')?.scopeType).toBe('global');
      expect(byId.get('t-3')?.entityId).toBeUndefined();
      expect(byId.get('t-4')?.scopeType).toBe('team');
      expect(byId.get('t-4')?.entityId).toBe('team-1');
    } finally {
      await db.delete();
    }
  });

  it('keeps a legacy row that names a current axis intact', async () => {
    const dbName = 'TestSchemaV20Ok_' + Math.random().toString(36).slice(2);
    const v19Db = new Dexie(dbName);
    v19Db.version(19).stores(SCHEMA_V19);
    await v19Db.open();
    await v19Db.table('chatThreads').add({
      id: 't-ok',
      scopeKey: 'cr:cr-1',
      scopeType: 'cr',
      entityId: 'cr-1',
      createdAt: NOW,
      updatedAt: NOW,
    });
    v19Db.close();

    const db = new TaskPlannerDatabase(dbName);
    await db.open();
    try {
      const row = await db.chatThreads.get('t-ok');
      expect(row?.scopeType).toBe('cr');
      expect(row?.entityId).toBe('cr-1');
    } finally {
      await db.delete();
    }
  });
});

/**
 * V21 repair, shaped from a real export that failed import with
 * `ChatTab references threadId "…" not found`. Two leaks:
 *  - `sdlc:`-PREFIXED threads (V18 matched only the `:sdlc` suffix),
 *  - tabs whose thread was deleted without them, leaving a `project:` scope.
 */
describe('V20 → V21 SDLC thread and orphan-tab purge', () => {
  it('drops sdlc-prefixed threads with their messages, and orphaned tabs', async () => {
    const dbName = 'TestSchemaV21_' + Math.random().toString(36).slice(2);
    const v20Db = new Dexie(dbName);
    v20Db.version(20).stores(SCHEMA_V20);
    await v20Db.open();

    await v20Db.table('chatThreads').bulkAdd([
      // Leak 1: SDLC thread with the prefix form V18 never matched.
      {
        id: 'sdlc-1',
        scopeKey: 'sdlc:cr-1:cr-1:INTAKE',
        scopeType: 'global',
        createdAt: NOW,
        updatedAt: NOW,
      },
      // The suffix form V18 did remove — must stay gone either way.
      {
        id: 'sdlc-2',
        scopeKey: 'cr:cr-1:sdlc',
        scopeType: 'cr',
        entityId: 'cr-1',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'live-1',
        scopeKey: 'team:team-1',
        scopeType: 'team',
        entityId: 'team-1',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);

    await v20Db.table('chatMessages').bulkAdd([
      { id: 'm-1', threadId: 'sdlc-1', role: 'user', content: 'x', createdAt: NOW },
      { id: 'm-2', threadId: 'live-1', role: 'user', content: 'y', createdAt: NOW },
    ]);

    await v20Db.table('chatTabs').bulkAdd([
      { id: 'tab-sdlc', threadId: 'sdlc-1', scopeKey: 'cr:cr-1', type: 'chat', title: 'a', order: 0, active: false, createdAt: NOW, updatedAt: NOW },
      // Leak 2: the thread is already gone; the tab survived.
      { id: 'tab-orphan', threadId: 'missing-thread', scopeKey: 'project:p-1', type: 'chat', title: 'b', order: 0, active: true, createdAt: NOW, updatedAt: NOW },
      { id: 'tab-live', threadId: 'live-1', scopeKey: 'team:team-1', type: 'chat', title: 'c', order: 0, active: true, createdAt: NOW, updatedAt: NOW },
    ]);
    v20Db.close();

    const db = new TaskPlannerDatabase(dbName);
    await db.open();
    try {
      expect(db.verno).toBe(LATEST_SCHEMA_VERSION);

      expect(await db.chatThreads.get('sdlc-1')).toBeUndefined();
      expect(await db.chatMessages.get('m-1')).toBeUndefined();
      expect(await db.chatTabs.get('tab-sdlc')).toBeUndefined();

      expect(await db.chatTabs.get('tab-orphan')).toBeUndefined();

      // The live team thread, its message and its tab all survive untouched.
      expect((await db.chatThreads.get('live-1'))?.scopeType).toBe('team');
      expect(await db.chatMessages.get('m-2')).toBeDefined();
      expect(await db.chatTabs.get('tab-live')).toBeDefined();

      // The exporter's own invariant: every surviving tab resolves to a surviving thread.
      const threadIds = new Set((await db.chatThreads.toArray()).map((row) => row.id));
      for (const tab of await db.chatTabs.toArray()) {
        expect(threadIds.has(tab.threadId)).toBe(true);
      }
    } finally {
      await db.delete();
    }
  });
});
