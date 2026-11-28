import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db/index';
import { createChangeRequest } from '../../src/db/repositories/changeRequestRepo';
import { createTask, getTask } from '../../src/db/repositories/taskRepo';
import {
  createCrMilestone,
  deleteCrMilestoneWithCascade,
  getCrMilestone,
  listCrMilestones,
  updateCrMilestone,
} from '../../src/db/repositories/crMilestoneRepo';
import type { Note, NoteEntityType } from '../../src/types/models';

describe('CrMilestone Repository (Phase 52 D-01)', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase('TestCrMilestoneRepoDB_' + Math.random().toString(36).slice(2));
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  async function seedCr(code = 'CR-MS-1') {
    return createChangeRequest(
      { status: 'Open', name: 'CR', code, type: 'ENHANCEMENT', targets: [] },
      db
    );
  }

  it('creates and lists milestones scoped to their CR', async () => {
    const cr = await seedCr();
    const other = await seedCr('CR-MS-2');

    const first = await createCrMilestone(
      { crId: cr.id, name: 'Go live 1', targetDate: '2026-12-01' },
      db
    );
    const second = await createCrMilestone({ crId: cr.id, name: 'Go live 2' }, db);
    await createCrMilestone({ crId: other.id, name: 'Khác CR' }, db);

    const listed = await listCrMilestones(cr.id, db);
    expect(new Set(listed.map((m) => m.id))).toEqual(new Set([first.id, second.id]));
    expect(first.targetDate).toBe('2026-12-01');
    expect(second).not.toHaveProperty('targetDate');
    expect(await getCrMilestone(first.id, db)).toEqual(first);
  });

  it('rejects a milestone whose CR does not exist', async () => {
    await expect(
      createCrMilestone({ crId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'orphan' }, db)
    ).rejects.toThrow('Change Request không tồn tại.');
  });

  it('updates name/targetDate but never moves the milestone to another CR', async () => {
    const cr = await seedCr();
    const milestone = await createCrMilestone({ crId: cr.id, name: 'Old', targetDate: '2026-12-01' }, db);

    const renamed = await updateCrMilestone(
      milestone.id,
      { name: 'New', targetDate: '2026-12-02' },
      db
    );
    expect(renamed.name).toBe('New');
    expect(renamed.targetDate).toBe('2026-12-02');
    expect(renamed.crId).toBe(cr.id);

    const cleared = await updateCrMilestone(milestone.id, { name: 'New', targetDate: undefined }, db);
    expect(cleared).not.toHaveProperty('targetDate');
    expect(cleared.updatedAt >= milestone.updatedAt).toBe(true);
  });

  it('exports a cascade delete that unlinks tasks and notes without deleting them', async () => {
    const cr = await seedCr();
    const milestone = await createCrMilestone({ crId: cr.id, name: 'Go live' }, db);
    const task = await createTask({ name: 'Task', crId: cr.id, milestoneId: milestone.id }, db);
    const note: Note = {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      body: 'note',
      entityType: 'crMilestone' as NoteEntityType,
      entityId: milestone.id,
      isPinned: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.notes.add(note);

    await deleteCrMilestoneWithCascade(milestone.id, db);

    expect(await getCrMilestone(milestone.id, db)).toBeUndefined();
    expect(await getTask(task.id, db)).toBeDefined();
    expect(await getTask(task.id, db)).not.toHaveProperty('milestoneId');
    expect(await db.notes.get(note.id)).toBeDefined();
    expect(await db.notes.get(note.id)).not.toHaveProperty('entityType');
  });
});
