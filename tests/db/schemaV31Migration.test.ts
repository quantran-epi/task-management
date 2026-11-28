import { describe, it, expect, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db/index';
import { LATEST_SCHEMA_VERSION, SCHEMA_V16, SCHEMA_V31 } from '../../src/db/schema';

/**
 * Phase 52 D-01/D-02: V31 adds the empty `crMilestones` store. Legacy `milestones`
 * must stay dropped; existing tasks without milestoneId must load unchanged.
 * tests/setup.ts already installs fake-indexeddb globally.
 */

describe('Dexie SCHEMA_V31 Migration (CR milestones)', () => {
  let db: TaskPlannerDatabase | undefined;

  afterEach(async () => {
    if (db) {
      try {
        await db.delete();
      } catch {
        // already closed/deleted
      }
      db = undefined;
    }
  });

  it('declares crMilestones at V31 and keeps the latest version in sync', () => {
    expect(SCHEMA_V31.crMilestones).toBe('id, crId');
    expect(LATEST_SCHEMA_VERSION).toBe(31);

    // Cumulative schemas keep the V16 drop markers (value null), so only non-null
    // keys are live stores. Legacy tables must not be live again.
    const liveKeys = Object.entries(SCHEMA_V31)
      .filter(([, index]) => index !== null)
      .map(([key]) => key);
    expect(liveKeys).toContain('crMilestones');
    expect(liveKeys).not.toContain('milestones');
    expect(liveKeys).not.toContain('projects');
    // Baseline drop marker stays byte-identical — only historical migration code may name it.
    expect(SCHEMA_V16.milestones).toBeNull();
    expect(SCHEMA_V31.milestones).toBeNull();
  });

  it('opens the store with primaryKey id and a crId index', async () => {
    db = new TaskPlannerDatabase('TestSchemaV31DB_' + Math.random().toString(36).slice(2));
    await db.open();

    const tableNames = db.tables.map((table) => table.name);
    expect(tableNames).toContain('crMilestones');
    expect(tableNames).not.toContain('milestones');
    expect(tableNames).not.toContain('projects');
    expect(db.crMilestones.schema.primKey.name).toBe('id');
    expect(db.crMilestones.schema.indexes.some((idx) => idx.name === 'crId')).toBe(true);
    // tasks index is deliberately unchanged: cascade uses filter, not where('milestoneId').
    expect(db.tasks.schema.indexes.some((idx) => idx.name === 'milestoneId')).toBe(false);
  });

  it('reads old tasks with no milestoneId without backfilling anything', async () => {
    db = new TaskPlannerDatabase('TestSchemaV31OldTaskDB_' + Math.random().toString(36).slice(2));
    await db.open();
    await db.tasks.add({
      id: '11111111-1111-4111-8111-111111111111',
      crId: '22222222-2222-4222-8222-222222222222',
      name: 'Legacy task',
      status: 'Open',
      progress: 0,
      priority: 'Medium',
      estimateMinutes: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const task = await db.tasks.get('11111111-1111-4111-8111-111111111111');
    expect(task?.name).toBe('Legacy task');
    expect(task).not.toHaveProperty('milestoneId');
    expect(await db.crMilestones.count()).toBe(0);
  });
});
