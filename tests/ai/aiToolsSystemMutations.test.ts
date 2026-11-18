import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db/index';
import { executeAiTool } from '../../src/services/ai/aiTools';
import type { ChangeRequest, Task } from '../../src/types/models';

const UUID_CR = '11111111-1111-4111-8111-111111111111';
const UUID_TASK = '22222222-2222-4222-8222-222222222222';

describe('AI system mutation tools', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase('TestAiSystemTools_' + Math.random().toString(36).slice(2));
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  const createGroup = async (code = 'GRP') =>
    JSON.parse(
      await executeAiTool(
        'create_system',
        { name: 'Group', code, type: 'LOGICAL_GROUP' },
        db
      )
    );

  it('creates a LOGICAL_GROUP with no repo fields and a null parent', async () => {
    const res = JSON.parse(
      await executeAiTool(
        'create_system',
        { name: 'Core', code: 'CORE', type: 'LOGICAL_GROUP' },
        db
      )
    );

    expect(res.success).toBe(true);
    expect(res.system.code).toBe('CORE');
    expect(res.system.parentId).toBeNull();

    const row = await db.systems.get(res.system.id);
    expect(row).toBeDefined();
    expect(row?.type).toBe('LOGICAL_GROUP');
    expect(row?.parentId).toBeNull();
    expect(row).not.toHaveProperty('sshConfigId');
    expect(row).not.toHaveProperty('remoteRepoPath');
    expect(row).not.toHaveProperty('defaultBaseBranch');
  });

  it('refuses a subsystem whose parent is a SERVICE', async () => {
    const service = JSON.parse(
      await executeAiTool(
        'create_system',
        { name: 'Service', code: 'SVC', type: 'SERVICE' },
        db
      )
    );
    expect(service.success).toBe(true);

    const before = await db.systems.count();
    const res = JSON.parse(
      await executeAiTool(
        'create_system',
        { name: 'Child', code: 'CHILD', type: 'SERVICE', parentId: service.system.id },
        db
      )
    );

    expect(typeof res.error).toBe('string');
    expect(res.error).toContain('Subsystem phải trỏ tới một Logical Parent');
    expect(await db.systems.count()).toBe(before);
  });

  it('refuses a duplicate code', async () => {
    await createGroup('DUP');

    const res = JSON.parse(
      await executeAiTool(
        'create_system',
        { name: 'Another', code: 'DUP', type: 'LOGICAL_GROUP' },
        db
      )
    );

    expect(typeof res.error).toBe('string');
    expect(res.error).toContain('đã tồn tại');
  });

  it('refuses a LOGICAL_GROUP carrying remoteRepoPath', async () => {
    const res = JSON.parse(
      await executeAiTool(
        'create_system',
        {
          name: 'Bad group',
          code: 'BAD_GRP',
          type: 'LOGICAL_GROUP',
          remoteRepoPath: '/repos/bad',
        },
        db
      )
    );

    expect(typeof res.error).toBe('string');
    expect(res.error).toContain('Hệ thống cha không được có SSH/Repo');
  });

  it('clears remoteRepoPath when null is passed and preserves it otherwise', async () => {
    const group = await createGroup('UPD_GRP');
    const service = JSON.parse(
      await executeAiTool(
        'create_system',
        {
          name: 'Service',
          code: 'UPD_SVC',
          type: 'SERVICE',
          parentId: group.system.id,
          remoteRepoPath: '/repos/upd',
        },
        db
      )
    );
    expect(service.success).toBe(true);

    const renamed = JSON.parse(
      await executeAiTool('update_system', { id: service.system.id, name: 'New name' }, db)
    );
    expect(renamed.success).toBe(true);
    expect((await db.systems.get(service.system.id))?.remoteRepoPath).toBe('/repos/upd');

    const cleared = JSON.parse(
      await executeAiTool('update_system', { id: service.system.id, remoteRepoPath: null }, db)
    );
    expect(cleared.success).toBe(true);
    expect(await db.systems.get(service.system.id)).not.toHaveProperty('remoteRepoPath');
  });

  it('refuses delete while child subsystems exist and succeeds on a leaf', async () => {
    const group = await createGroup('DEL_GRP');
    const service = JSON.parse(
      await executeAiTool(
        'create_system',
        { name: 'Service', code: 'DEL_SVC', type: 'SERVICE', parentId: group.system.id },
        db
      )
    );
    expect(service.success).toBe(true);

    const refused = JSON.parse(await executeAiTool('delete_system', { id: group.system.id }, db));
    expect(typeof refused.error).toBe('string');
    expect(refused.error).toContain('1 subsystem con');

    const cr: ChangeRequest = {
      id: UUID_CR,
      name: 'CR',
      code: 'CR-1',
      status: 'Open',
      type: 'ENHANCEMENT',
      targets: [{ systemId: service.system.id, featureBranch: 'feature/CR-1' }],
      createdAt: '2026-11-07T00:00:00.000Z',
      updatedAt: '2026-11-07T00:00:00.000Z',
    };
    await db.changeRequests.add(cr);

    const task: Task = {
      id: UUID_TASK,
      name: 'Task',
      crId: cr.id,
      systemId: service.system.id,
      status: 'Open',
      progress: 0,
      priority: 'Medium',
      estimateMinutes: 0,
      workType: 'code',
      createdAt: '2026-11-07T00:00:00.000Z',
      updatedAt: '2026-11-07T00:00:00.000Z',
    };
    await db.tasks.add(task);

    const deleted = JSON.parse(await executeAiTool('delete_system', { id: service.system.id }, db));
    expect(deleted.success).toBe(true);

    expect((await db.changeRequests.get(cr.id))?.targets).toEqual([]);
    expect(await db.tasks.get(task.id)).not.toHaveProperty('systemId');
    expect(await db.systems.get(service.system.id)).toBeUndefined();
  });

  it('returns a JSON error for missing required arguments', async () => {
    const missingCode = JSON.parse(await executeAiTool('create_system', { name: 'X' }, db));
    expect(typeof missingCode.error).toBe('string');

    const missingUpdateId = JSON.parse(await executeAiTool('update_system', { name: 'X' }, db));
    expect(typeof missingUpdateId.error).toBe('string');

    const missingDeleteId = JSON.parse(await executeAiTool('delete_system', {}, db));
    expect(typeof missingDeleteId.error).toBe('string');
  });
});
