import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db/index';
import {
  getDistinctOpsOwners,
  getDistinctBusinessAnalysts,
} from '../../src/db/repositories/tagRepo';
import { createChangeRequest } from '../../src/db/repositories/changeRequestRepo';
import { createTask } from '../../src/db/repositories/taskRepo';

/**
 * Wave 0 suite for tag aggregation (ENT-NORM-01, D-27/D-50).
 * Aggregation must union over `changeRequests` + `tasks` only — the `projects` and
 * `milestones` stores no longer exist after V16.
 * RED until plan 31.2-04 re-axes `tagRepo`.
 */

describe('Tag Repository — CR axis (ENT-NORM-01)', () => {
  let db: TaskPlannerDatabase;
  let dbName: string;

  beforeEach(async () => {
    dbName = 'TestTagRepoDB_' + Math.random().toString(36).slice(2);
    db = new TaskPlannerDatabase(dbName);
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('returns empty arrays when nothing is tagged', async () => {
    expect(await getDistinctOpsOwners(db)).toEqual([]);
    expect(await getDistinctBusinessAnalysts(db)).toEqual([]);
  }, 30000);

  it('unions ops owners over changeRequests and tasks, sorted alphabetically', async () => {
    const cr = await createChangeRequest(
      {
        name: 'CR',
        code: 'CR-1',
        type: 'ENHANCEMENT',
        opsOwners: ['Ops-Beta', 'Ops-Alpha'],
        businessAnalysts: ['BA-Zoe', 'BA-Alex'],
      },
      db
    );

    await createTask(
      {
        name: 'Task',
        crId: cr.id,
        opsOwners: ['Ops-Delta', 'Ops-Alpha'],
        businessAnalysts: ['BA-Charlie'],
      },
      db
    );

    expect(await getDistinctOpsOwners(db)).toEqual(['Ops-Alpha', 'Ops-Beta', 'Ops-Delta']);
    expect(await getDistinctBusinessAnalysts(db)).toEqual(['BA-Alex', 'BA-Charlie', 'BA-Zoe']);
  }, 30000);

  it('drops a tag once its only changeRequest is gone', async () => {
    const cr = await createChangeRequest(
      { name: 'CR', code: 'CR-2', type: 'ENHANCEMENT', opsOwners: ['Ops-Gone'] },
      db
    );

    expect(await getDistinctOpsOwners(db)).toEqual(['Ops-Gone']);

    await db.changeRequests.delete(cr.id);

    expect(await getDistinctOpsOwners(db)).toEqual([]);
  }, 30000);
});
