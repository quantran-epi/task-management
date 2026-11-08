import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Dexie from 'dexie';
import { TaskPlannerDatabase } from '../../src/db/index';
import { SCHEMA_V16 } from '../../src/db/schema';

/**
 * Wave 1 suite for the V16 → V17 upgrade (Phase 34, D-18/D-23/D-25/D-32).
 *
 * The V17 step is purely additive, so the contract is: every V16 row survives
 * untouched and the six AI Office stores appear empty.
 *
 * `tests/setup.ts` already installs the IndexedDB shim globally — never re-import it.
 */

const NOW = '2026-11-08T00:00:00.000Z';

const NEW_TABLES = [
  'aiEmployees',
  'aiLeads',
  'aiSkills',
  'aiTeams',
  'aiTeamMembers',
  'aiTeamLinks',
] as const;

async function seedV16Database(dbName: string): Promise<void> {
  const v16Db = new Dexie(dbName);
  v16Db.version(16).stores(SCHEMA_V16);
  await v16Db.open();

  await v16Db.table('changeRequests').bulkAdd([
    {
      id: 'cr-1',
      name: 'Surviving CR',
      code: 'CR-SURVIVE',
      status: 'Open',
      type: 'ENHANCEMENT',
      targets: [],
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]);

  await v16Db.table('systems').bulkAdd([
    {
      id: 'sys-1',
      name: 'Surviving System',
      code: 'SYS-SURVIVE',
      parentId: null,
      type: 'SERVICE',
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]);

  await v16Db.table('notes').bulkAdd([
    {
      id: 'note-1',
      type: 'quick_note',
      body: 'Surviving note body',
      isPinned: false,
      tags: [],
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]);

  await v16Db.table('chatThreads').bulkAdd([
    {
      id: 'thread-1',
      scopeKey: 'cr:cr-1',
      scopeType: 'cr',
      entityId: 'cr-1',
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]);

  await v16Db.table('chatMessages').bulkAdd([
    { id: 'msg-1', threadId: 'thread-1', role: 'user', content: 'Surviving message', createdAt: NOW },
  ]);

  await v16Db.table('settings').bulkAdd([{ key: 'theme', value: 'dark' }]);

  await v16Db.close();
}

describe('Dexie SCHEMA_V17 Migration (Phase 34)', () => {
  let dbName: string;
  let upgraded: TaskPlannerDatabase | undefined;

  beforeEach(() => {
    dbName = 'TestSchemaV17MigrationDB_' + Math.random().toString(36).slice(2);
  });

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

  async function openAtCurrentVersion(): Promise<TaskPlannerDatabase> {
    await seedV16Database(dbName);
    upgraded = new TaskPlannerDatabase(dbName);
    await upgraded.open();
    return upgraded;
  }

  it('opens at version 17', async () => {
    const db = await openAtCurrentVersion();
    expect(db.verno).toBe(17);
  });

  it('keeps every seeded V16 row readable with its original content', async () => {
    const db = await openAtCurrentVersion();

    expect((await db.changeRequests.get('cr-1'))?.name).toBe('Surviving CR');
    expect((await db.systems.get('sys-1'))?.code).toBe('SYS-SURVIVE');
    expect((await db.notes.get('note-1'))?.body).toBe('Surviving note body');
    expect((await db.chatThreads.get('thread-1'))?.scopeType).toBe('cr');
    expect((await db.chatMessages.get('msg-1'))?.content).toBe('Surviving message');
    expect((await db.settings.get('theme'))?.value).toBe('dark');
  });

  it('adds the six AI Office stores, empty', async () => {
    const db = await openAtCurrentVersion();
    const tableNames = db.tables.map((table) => table.name);

    for (const tableName of NEW_TABLES) {
      expect(tableNames).toContain(tableName);
      expect(await db.table(tableName).count()).toBe(0);
    }
  });

  it('round-trips a team-scoped chat thread', async () => {
    const db = await openAtCurrentVersion();

    await db.chatThreads.add({
      id: 'thread-team',
      scopeKey: 'team:team-1',
      scopeType: 'team',
      entityId: 'team-1',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const stored = await db.chatThreads.get('thread-team');
    expect(stored?.scopeType).toBe('team');
    expect(stored?.entityId).toBe('team-1');
  });

  it('round-trips agent attribution on a chat message', async () => {
    const db = await openAtCurrentVersion();

    await db.chatMessages.add({
      id: 'msg-agent',
      threadId: 'thread-1',
      role: 'assistant',
      content: 'Agent report',
      agentId: 'agent-1',
      agentName: 'Reviewer',
      agentKind: 'employee',
      messageKind: 'report',
      createdAt: NOW,
    });

    const stored = await db.chatMessages.get('msg-agent');
    expect(stored?.agentId).toBe('agent-1');
    expect(stored?.messageKind).toBe('report');
  });
});
