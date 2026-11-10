import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Dexie from 'dexie';
import { TaskPlannerDatabase } from '../../src/db/index';
import { SCHEMA_V17 } from '../../src/db/schema';
import type { AiSkillVersion } from '../../src/types/aiOffice';

/**
 * V17 → V18 → V19 upgrade proof (Phase 36, D-16/D-22, AIO-DATA-01/05).
 *
 * Seeding at V17 (not V18) is deliberate: `src/db/index.ts` attaches the SDLC purge hook to
 * `version(18)` only, so a V18 seed would skip it and the purge assertions would prove nothing.
 *
 * `tests/setup.ts` already installs the IndexedDB shim globally — never re-import it.
 */

const NOW = '2026-11-10T00:00:00.000Z';

const TEAM_ID = '11111111-1111-4111-8111-111111111111';
const SKILL_ID = '22222222-2222-4222-8222-222222222222';
const VERSION_ID = '33333333-3333-4333-8333-333333333333';

async function seedV17Database(dbName: string): Promise<void> {
  const v17Db = new Dexie(dbName);
  v17Db.version(17).stores(SCHEMA_V17);
  await v17Db.open();

  await v17Db.table('aiTeams').bulkAdd([
    {
      id: TEAM_ID,
      name: 'Surviving Team',
      leadId: '44444444-4444-4444-8444-444444444444',
      status: 'active',
      budgetTokens: 1000,
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]);

  await v17Db.table('chatThreads').bulkAdd([
    {
      id: 'thread-cr',
      scopeKey: 'cr:cr-1',
      scopeType: 'cr',
      entityId: 'cr-1',
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: 'thread-sdlc',
      scopeKey: 'cr:cr-1:sdlc',
      scopeType: 'cr',
      entityId: 'cr-1',
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]);

  await v17Db.table('chatMessages').bulkAdd([
    { id: 'msg-sdlc', threadId: 'thread-sdlc', role: 'user', content: 'Legacy SDLC', createdAt: NOW },
  ]);

  await v17Db.table('settings').bulkAdd([
    { key: 'theme', value: 'dark' },
    { key: 'sdlc_workflow:cr:cr-1', value: { stage: 'review' } },
  ]);

  await v17Db.close();
}

describe('Dexie SCHEMA_V19 Migration (Phase 36)', () => {
  let dbName: string;
  let upgraded: TaskPlannerDatabase | undefined;

  beforeEach(() => {
    dbName = 'TestSchemaV19MigrationDB_' + Math.random().toString(36).slice(2);
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
    await seedV17Database(dbName);
    upgraded = new TaskPlannerDatabase(dbName);
    await upgraded.open();
    return upgraded;
  }

  it('opens at version 19', async () => {
    const db = await openAtCurrentVersion();
    expect(db.verno).toBe(19);
  });

  it('keeps every non-SDLC seeded V17 row readable with its original content', async () => {
    const db = await openAtCurrentVersion();

    expect((await db.aiTeams.get(TEAM_ID))?.name).toBe('Surviving Team');
    expect((await db.chatThreads.get('thread-cr'))?.scopeType).toBe('cr');
    expect((await db.settings.get('theme'))?.value).toBe('dark');
  });

  it('runs the V18 SDLC purge during the 17→18 step', async () => {
    const db = await openAtCurrentVersion();

    expect(await db.settings.get('sdlc_workflow:cr:cr-1')).toBeUndefined();
    expect(await db.chatThreads.get('thread-sdlc')).toBeUndefined();
    expect(await db.chatMessages.get('msg-sdlc')).toBeUndefined();
    expect(await db.chatThreads.get('thread-cr')).toBeDefined();
  });

  it('adds aiSkillVersions, empty', async () => {
    const db = await openAtCurrentVersion();

    expect(db.tables.map((table) => table.name)).toContain('aiSkillVersions');
    expect(await db.aiSkillVersions.count()).toBe(0);
  });

  it('round-trips a skill version row across close and reopen at 19', async () => {
    const db = await openAtCurrentVersion();

    const row: AiSkillVersion = {
      id: VERSION_ID,
      skillId: SKILL_ID,
      version: 1,
      status: 'pending',
      name: 'Code review',
      description: 'Reviews diffs for correctness',
      body: '# Code review\n\nCheck tests.',
      evidence: 'Turn 3',
      createdAt: NOW,
    };
    await db.aiSkillVersions.add(row);

    db.close();
    const reopened = new TaskPlannerDatabase(dbName);
    await reopened.open();
    upgraded = reopened;

    expect(reopened.verno).toBe(19);
    expect(await reopened.aiSkillVersions.get(VERSION_ID)).toEqual(row);
    expect((await reopened.aiSkillVersions.get(VERSION_ID))?.status).toBe('pending');
  });

  it('does not resurrect any SDLC store after the upgrade', async () => {
    const db = await openAtCurrentVersion();
    const tableNames = db.tables.map((table) => table.name);

    expect(tableNames).not.toContain('projects');
    expect(tableNames).not.toContain('milestones');
    expect(tableNames.filter((name) => /sdlc/i.test(name))).toEqual([]);
  });
});
