import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Dexie from 'dexie';
import { TaskPlannerDatabase } from '../../src/db/index';
import { SCHEMA_V25, LATEST_SCHEMA_VERSION } from '../../src/db/schema';

/**
 * V25 → V26 upgrade proof (Phase 39, CR-01, D-14).
 *
 * A pre-39 build numbered every skill-version row, including pendings and rejections. The
 * V26 hook strips the key from non-approved rows so `max(approved) + 1` cannot collide with
 * a row that already holds that number — and so the app's own export stays importable.
 *
 * `tests/setup.ts` already installs the IndexedDB shim globally — never re-import it.
 */

const NOW = '2026-11-14T00:00:00.000Z';
const SKILL_ID = '22222222-2222-4222-8222-222222222222';

function row(id: string, status: 'pending' | 'approved' | 'rejected', version: number) {
  return {
    id,
    skillId: SKILL_ID,
    version,
    status,
    name: 'Code review',
    description: 'Reviews diffs for correctness',
    body: '# Code review\n\nCheck tests.',
    createdAt: NOW,
  };
}

async function seedV25Database(dbName: string): Promise<void> {
  const v25Db = new Dexie(dbName);
  v25Db.version(25).stores(SCHEMA_V25);
  await v25Db.open();

  await v25Db.table('aiSkillVersions').bulkAdd([
    row('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'approved', 1),
    row('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'rejected', 2),
    row('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'pending', 3),
  ]);

  await v25Db.close();
}

describe('Dexie SCHEMA_V26 Migration (Phase 39, CR-01)', () => {
  let dbName: string;
  let upgraded: TaskPlannerDatabase | undefined;

  beforeEach(() => {
    dbName = 'TestSchemaV26MigrationDB_' + Math.random().toString(36).slice(2);
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
    await seedV25Database(dbName);
    upgraded = new TaskPlannerDatabase(dbName);
    await upgraded.open();
    return upgraded;
  }

  it('opens at the latest version, which is 26', async () => {
    expect(LATEST_SCHEMA_VERSION).toBe(26);
    const db = await openAtCurrentVersion();
    expect(db.verno).toBe(LATEST_SCHEMA_VERSION);
  });

  it('strips the version key from pending and rejected rows, keeping approved numbers', async () => {
    const db = await openAtCurrentVersion();

    const rows = await db.aiSkillVersions.toArray();
    const byStatus = new Map(rows.map((entry) => [entry.status, entry]));

    expect('version' in byStatus.get('pending')!).toBe(false);
    expect('version' in byStatus.get('rejected')!).toBe(false);
    expect(byStatus.get('approved')?.version).toBe(1);
  });

  it('leaves every row readable with its content intact', async () => {
    const db = await openAtCurrentVersion();

    const rows = await db.aiSkillVersions.toArray();
    expect(rows).toHaveLength(3);
    for (const entry of rows) {
      expect(entry.name).toBe('Code review');
      expect(entry.body).toBe('# Code review\n\nCheck tests.');
      expect(entry.skillId).toBe(SKILL_ID);
    }
  });
});
