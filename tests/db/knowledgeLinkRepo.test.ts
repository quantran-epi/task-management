// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db/index';
import { createProject } from '../../src/db/repositories/projectRepo';
import { createMilestone } from '../../src/db/repositories/milestoneRepo';
import { createTask } from '../../src/db/repositories/taskRepo';
import {
  deleteProjectWithCascade,
  deleteMilestoneWithCascade,
  deleteTaskWithAllocations,
} from '../../src/db/repositories/cascadeRepo';
import {
  createKnowledgeLink,
  getKnowledgeLink,
  getKnowledgeLinksForEntity,
  getKnowledgeLinksForSet,
  deleteKnowledgeLink,
  deleteLinksForTaskMateEntity,
  buildKnowledgeLinkKey,
} from '../../src/db/repositories/knowledgeLinkRepo';

describe('KnowledgeLink Repository & Cascade Deletions (LINK-01, LINK-02, D-21, D-22)', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase('TestKnowledgeLinkDB_' + Math.random().toString(36).slice(2));
    await testDb.open();
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('creates, retrieves, and deletes KnowledgeLink records', async () => {
    const task = await createTask({ name: 'Link Test Task' }, testDb);
    const setId = '00000000-0000-4000-8000-000000000001';

    const link = await createKnowledgeLink(
      {
        taskMateEntityType: 'task',
        taskMateEntityId: task.id,
        setId,
        urn: 'urn:node:table:customer',
        displayLabel: 'Customer Table',
      },
      testDb
    );

    expect(link.id).toBeDefined();
    expect(link.linkKey).toBe(`task:${task.id}:${setId}:urn:node:table:customer`);

    const fetched = await getKnowledgeLink(link.id, testDb);
    expect(fetched).toBeDefined();
    expect(fetched?.displayLabel).toBe('Customer Table');

    const entityLinks = await getKnowledgeLinksForEntity('task', task.id, testDb);
    expect(entityLinks).toHaveLength(1);
    expect(entityLinks[0]?.id).toBe(link.id);

    const setLinks = await getKnowledgeLinksForSet(setId, testDb);
    expect(setLinks).toHaveLength(1);

    await deleteKnowledgeLink(link.id, testDb);
    expect(await getKnowledgeLink(link.id, testDb)).toBeUndefined();
  });

  it('rejects duplicate linkKey', async () => {
    const task = await createTask({ name: 'Duplicate Key Task' }, testDb);
    const setId = '00000000-0000-4000-8000-000000000001';

    await createKnowledgeLink(
      {
        taskMateEntityType: 'task',
        taskMateEntityId: task.id,
        setId,
        urn: 'urn:node:table:accounts',
        displayLabel: 'Accounts Table',
      },
      testDb
    );

    await expect(
      createKnowledgeLink(
        {
          taskMateEntityType: 'task',
          taskMateEntityId: task.id,
          setId,
          urn: 'urn:node:table:accounts',
          displayLabel: 'Duplicate Accounts',
        },
        testDb
      )
    ).rejects.toThrow();
  });

  it('cascades deletion when deleting a Task with allocations', async () => {
    const task = await createTask({ name: 'Cascaded Task' }, testDb);
    const setId = '00000000-0000-4000-8000-000000000001';

    await createKnowledgeLink(
      {
        taskMateEntityType: 'task',
        taskMateEntityId: task.id,
        setId,
        docId: '00000000-0000-4000-8000-000000000002',
        displayLabel: 'Doc Ref',
      },
      testDb
    );

    const before = await getKnowledgeLinksForEntity('task', task.id, testDb);
    expect(before).toHaveLength(1);

    await deleteTaskWithAllocations(task.id, testDb);

    const after = await getKnowledgeLinksForEntity('task', task.id, testDb);
    expect(after).toHaveLength(0);
  });

  it('cascades deletion when deleting a Project with cascade mode', async () => {
    const project = await createProject({ name: 'Linked Project' }, testDb);
    const milestone = await createMilestone({ projectId: project.id, name: 'Linked Milestone' }, testDb);
    const task = await createTask({ name: 'Linked Task', projectId: project.id, milestoneId: milestone.id }, testDb);
    const setId = '00000000-0000-4000-8000-000000000001';

    await createKnowledgeLink(
      { taskMateEntityType: 'project', taskMateEntityId: project.id, setId, urn: 'urn:node:proj', displayLabel: 'Project Graph' },
      testDb
    );
    await createKnowledgeLink(
      { taskMateEntityType: 'milestone', taskMateEntityId: milestone.id, setId, urn: 'urn:node:ms', displayLabel: 'Milestone Graph' },
      testDb
    );
    await createKnowledgeLink(
      { taskMateEntityType: 'task', taskMateEntityId: task.id, setId, urn: 'urn:node:task', displayLabel: 'Task Graph' },
      testDb
    );

    await deleteProjectWithCascade(project.id, 'cascade', testDb);

    expect(await getKnowledgeLinksForEntity('project', project.id, testDb)).toHaveLength(0);
    expect(await getKnowledgeLinksForEntity('milestone', milestone.id, testDb)).toHaveLength(0);
    expect(await getKnowledgeLinksForEntity('task', task.id, testDb)).toHaveLength(0);
  });

  it('cleans up project and milestone links in orphan mode but retains orphaned task links', async () => {
    const project = await createProject({ name: 'Orphan Project' }, testDb);
    const milestone = await createMilestone({ projectId: project.id, name: 'Orphan Milestone' }, testDb);
    const task = await createTask({ name: 'Preserved Task', projectId: project.id, milestoneId: milestone.id }, testDb);
    const setId = '00000000-0000-4000-8000-000000000001';

    await createKnowledgeLink(
      { taskMateEntityType: 'project', taskMateEntityId: project.id, setId, urn: 'urn:node:proj', displayLabel: 'Project Graph' },
      testDb
    );
    await createKnowledgeLink(
      { taskMateEntityType: 'milestone', taskMateEntityId: milestone.id, setId, urn: 'urn:node:ms', displayLabel: 'Milestone Graph' },
      testDb
    );
    await createKnowledgeLink(
      { taskMateEntityType: 'task', taskMateEntityId: task.id, setId, urn: 'urn:node:task', displayLabel: 'Task Graph' },
      testDb
    );

    await deleteProjectWithCascade(project.id, 'orphan', testDb);

    expect(await getKnowledgeLinksForEntity('project', project.id, testDb)).toHaveLength(0);
    expect(await getKnowledgeLinksForEntity('milestone', milestone.id, testDb)).toHaveLength(0);
    // Task still exists, so its link must be preserved
    expect(await getKnowledgeLinksForEntity('task', task.id, testDb)).toHaveLength(1);
  });

  it('serializes and validates KnowledgeLinks in backup export/import round-trip', async () => {
    const { exportBackupPayload } = await import('../../src/services/backup/exportBackup');
    const { validateBackupPayload } = await import('../../src/services/backup/validateBackup');
    const { restoreBackupPayload } = await import('../../src/services/backup/restoreBackup');

    const task = await createTask({ name: 'Backup Link Task' }, testDb);
    const setId = '00000000-0000-4000-8000-000000000001';
    await createKnowledgeLink(
      {
        taskMateEntityType: 'task',
        taskMateEntityId: task.id,
        setId,
        urn: 'urn:node:schema:v11',
        displayLabel: 'Schema V11 Definition',
      },
      testDb
    );

    const exportPayload = await exportBackupPayload(testDb);
    expect(exportPayload.tables.knowledgeLinks).toHaveLength(1);
    expect(exportPayload.counts.knowledgeLinks).toBe(1);

    const validation = validateBackupPayload(exportPayload);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);

    const restoreDb = new TaskPlannerDatabase('TestRestoreKnowledgeLinkDB_' + Math.random().toString(36).slice(2));
    await restoreDb.open();
    try {
      await restoreBackupPayload(exportPayload, restoreDb);
      const restoredLinks = await getKnowledgeLinksForEntity('task', task.id, restoreDb);
      expect(restoredLinks).toHaveLength(1);
      expect(restoredLinks[0]?.displayLabel).toBe('Schema V11 Definition');
    } finally {
      await restoreDb.delete();
    }
  });
});
