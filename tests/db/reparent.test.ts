import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db/index';
import { createProject } from '../../src/db/repositories/projectRepo';
import { createMilestone } from '../../src/db/repositories/milestoneRepo';
import { createTask, getTask, reparentTask } from '../../src/db/repositories/taskRepo';

describe('Task Reparenting (WORK-04, D-09, D-10, T-02-02)', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase('TestReparentDB_' + Math.random().toString(36).slice(2));
    await testDb.open();
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('moves standalone task to project-level without changing task.id', async () => {
    const task = await createTask({ name: 'Standalone Task' }, testDb);
    const originalId = task.id;
    const project = await createProject({ name: 'Project A' }, testDb);

    const reparented = await reparentTask(task.id, project.id, undefined, testDb);

    expect(reparented.id).toBe(originalId);
    expect(reparented.projectId).toBe(project.id);
    expect(reparented.milestoneId).toBeUndefined();

    const fetched = await getTask(originalId, testDb);
    expect(fetched?.projectId).toBe(project.id);
  });

  it('moves task to milestone-level under project without changing task.id', async () => {
    const project = await createProject({ name: 'Project A' }, testDb);
    const milestone = await createMilestone({ projectId: project.id, name: 'Milestone 1' }, testDb);
    const task = await createTask({ name: 'Task 1', projectId: project.id }, testDb);
    const originalId = task.id;

    const reparented = await reparentTask(task.id, project.id, milestone.id, testDb);

    expect(reparented.id).toBe(originalId);
    expect(reparented.projectId).toBe(project.id);
    expect(reparented.milestoneId).toBe(milestone.id);
  });

  it('resets milestoneId to undefined when moving task to standalone', async () => {
    const project = await createProject({ name: 'Project A' }, testDb);
    const milestone = await createMilestone({ projectId: project.id, name: 'Milestone 1' }, testDb);
    const task = await createTask(
      {
        name: 'Task with MS',
        projectId: project.id,
        milestoneId: milestone.id,
      },
      testDb
    );

    const standalone = await reparentTask(task.id, undefined, undefined, testDb);

    expect(standalone.id).toBe(task.id);
    expect(standalone.projectId).toBeUndefined();
    expect(standalone.milestoneId).toBeUndefined();
  });

  it('resets milestoneId when moving task to a different project without targetMilestoneId (D-10)', async () => {
    const projectA = await createProject({ name: 'Project A' }, testDb);
    const projectB = await createProject({ name: 'Project B' }, testDb);
    const milestoneA = await createMilestone({ projectId: projectA.id, name: 'Milestone in A' }, testDb);

    const task = await createTask(
      {
        name: 'Task from A',
        projectId: projectA.id,
        milestoneId: milestoneA.id,
      },
      testDb
    );

    // Reparenting to Project B without specifying target milestone must reset milestoneId
    const reparented = await reparentTask(task.id, projectB.id, undefined, testDb);

    expect(reparented.id).toBe(task.id);
    expect(reparented.projectId).toBe(projectB.id);
    expect(reparented.milestoneId).toBeUndefined();
  });

  it('throws error when reparenting non-existent task', async () => {
    await expect(reparentTask('non-existent-uuid', undefined, undefined, testDb)).rejects.toThrow(
      'Task not found'
    );
  });
});
