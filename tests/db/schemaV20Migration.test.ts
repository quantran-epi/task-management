import { describe, it, expect } from 'vitest';
import Dexie from 'dexie';
import { TaskPlannerDatabase } from '../../src/db/index';
import { SCHEMA_V19, LATEST_SCHEMA_VERSION } from '../../src/db/schema';

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
