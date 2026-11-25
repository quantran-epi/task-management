import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db/index';
import { LATEST_SCHEMA_VERSION } from '../../src/db/schema';
import { seedV28, v28FixtureRows, V28_SCHEMA_VERSION } from '../seed/v28Seed';

describe('V28 workbench seed', () => {
  let db: TaskPlannerDatabase;

  beforeAll(async () => {
    db = new TaskPlannerDatabase(`WorkbenchV28Seed-${crypto.randomUUID()}`);
  });

  afterAll(async () => {
    await db.delete();
  });

  it('is pinned to the app V28 schema', () => {
    expect(V28_SCHEMA_VERSION).toBe(28);
    expect(V28_SCHEMA_VERSION).toBe(LATEST_SCHEMA_VERSION);
  });

  it('creates 7 capacity rules with real weekday minutes', async () => {
    await seedV28(db);
    const rules = await db.capacityRules.orderBy('dayOfWeek').toArray();
    expect(rules).toHaveLength(7);
    expect(rules.map((rule) => rule.dayOfWeek)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(rules.map((rule) => rule.workMinutes)).toEqual([0, 480, 480, 480, 480, 480, 0]);
    expect([...new Set(rules.map((rule) => rule.id))]).toHaveLength(7);
  });

  it('seeds one system, one CR, five tasks with real status/deadline/estimate, one note and one document set', async () => {
    const fresh = new TaskPlannerDatabase(`WorkbenchV28Rows-${crypto.randomUUID()}`);
    try {
      const fixture = await seedV28(fresh);
      expect(await fresh.systems.count()).toBe(1);
      expect(await fresh.changeRequests.count()).toBe(1);
      expect(await fresh.tasks.count()).toBe(5);
      expect(await fresh.notes.count()).toBe(1);
      expect(await fresh.documentSets.count()).toBe(1);

      const tasks = await fresh.tasks.orderBy('id').toArray();
      expect(tasks.map((task) => task.deadline).sort()).toEqual(
        fixture.tasks.map((task) => task.deadline).sort()
      );
      for (const task of tasks) {
        expect(['Open', 'In Progress', 'Done']).toContain(task.status);
        expect(task.estimateMinutes).toBeGreaterThan(0);
        expect(task.crId).toBe(fixture.ids.crId);
        expect(task.deadline).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
      const set = await fresh.documentSets.get(fixture.ids.documentSetId);
      expect(set?.documentIds).toEqual([fixture.ids.noteId]);
    } finally {
      await fresh.delete();
    }
  });

  it('fixture rows are deterministic and use v4 UUIDs', () => {
    const first = v28FixtureRows();
    const second = v28FixtureRows();
    expect(second).toEqual(first);
    expect(first.ids.taskIds).toHaveLength(5);
    for (const id of [...first.ids.taskIds, first.ids.crId, first.ids.systemId]) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });
});
