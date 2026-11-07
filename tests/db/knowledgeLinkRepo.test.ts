// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db/index';
import { createTask } from '../../src/db/repositories/taskRepo';
import { createChangeRequest } from '../../src/db/repositories/changeRequestRepo';
import { createSystem } from '../../src/db/repositories/systemRepo';
import {
  deleteChangeRequestWithCascade,
  deleteTaskWithAllocations,
} from '../../src/db/repositories/cascadeRepo';
import {
  createKnowledgeLink,
  getKnowledgeLink,
  getKnowledgeLinksForEntity,
  getKnowledgeLinksForSet,
  deleteKnowledgeLink,
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

  async function seedCr(code = 'CR-LINK-TASK') {
    return createChangeRequest({ name: code, code }, testDb);
  }

  it('creates, retrieves, and deletes KnowledgeLink records', async () => {
    const cr = await seedCr('CR-LINK-1');
    const task = await createTask({ name: 'Link Test Task', crId: cr.id }, testDb);
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
    const cr = await seedCr('CR-LINK-2');
    const task = await createTask({ name: 'Duplicate Key Task', crId: cr.id }, testDb);
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
    const cr = await seedCr('CR-LINK-3');
    const task = await createTask({ name: 'Cascaded Task', crId: cr.id }, testDb);
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

  it('cascades deletion when deleting a Change Request', async () => {
    const parent = await createSystem(
      { name: 'Linked Parent', code: 'LINK_P', type: 'LOGICAL_GROUP' },
      testDb
    );
    const subsystem = await createSystem(
      { name: 'Linked Subsystem', code: 'LINK_S', type: 'SERVICE', parentId: parent.id },
      testDb
    );
    const cr = await createChangeRequest(
      { name: 'Linked CR', code: 'CR-LINK', targets: [{ systemId: subsystem.id }] },
      testDb
    );
    const task = await createTask(
      { name: 'Linked Task', crId: cr.id, systemId: subsystem.id },
      testDb
    );
    const setId = '00000000-0000-4000-8000-000000000001';

    await createKnowledgeLink(
      { taskMateEntityType: 'cr', taskMateEntityId: cr.id, setId, urn: 'urn:node:cr', displayLabel: 'CR Graph' },
      testDb
    );
    await createKnowledgeLink(
      { taskMateEntityType: 'system', taskMateEntityId: subsystem.id, setId, urn: 'urn:node:sys', displayLabel: 'System Graph' },
      testDb
    );
    await createKnowledgeLink(
      { taskMateEntityType: 'task', taskMateEntityId: task.id, setId, urn: 'urn:node:task', displayLabel: 'Task Graph' },
      testDb
    );

    await deleteChangeRequestWithCascade(cr.id, testDb);

    expect(await getKnowledgeLinksForEntity('cr', cr.id, testDb)).toHaveLength(0);
    expect(await getKnowledgeLinksForEntity('task', task.id, testDb)).toHaveLength(0);
    // The subsystem itself survives, so its own link is untouched
    expect(await getKnowledgeLinksForEntity('system', subsystem.id, testDb)).toHaveLength(1);
  });

  it('serializes and validates KnowledgeLinks in backup export/import round-trip', async () => {
    const { exportBackupPayload } = await import('../../src/services/backup/exportBackup');
    const { validateBackupPayload } = await import('../../src/services/backup/validateBackup');
    const { restoreBackupPayload } = await import('../../src/services/backup/restoreBackup');

    const cr = await seedCr('CR-LINK-4');
    const task = await createTask({ name: 'Backup Link Task', crId: cr.id }, testDb);
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
