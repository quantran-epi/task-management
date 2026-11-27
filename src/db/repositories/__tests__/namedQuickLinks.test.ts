import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../index';
import {
  ChangeRequestInputSchema,
  ChangeRequestUpdateSchema,
  TaskInputSchema,
  TaskUpdateSchema,
} from '../../../validation/schemas';
import {
  BACKUP_SCHEMA_VERSION,
  BackupChangeRequestRecordSchema,
  BackupTaskRecordSchema,
} from '../../../validation/backupSchemas';
import { validateBackupPayload } from '../../../services/backup/validateBackup';
import { createChangeRequest, updateChangeRequest } from '../changeRequestRepo';
import { createTask, updateTask } from '../taskRepo';

function validNamedLink() {
  return { name: 'API spec', url: 'https://example.com/spec' };
}

function validCrRow(overrides: Record<string, unknown> = {}) {
  return {
    ...validTaskRow(),
    code: 'QL-001',
    status: 'Open',
    type: 'ENHANCEMENT',
    targets: [],
    ...overrides,
  };
}

function validTaskRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    crId: '22222222-2222-4222-8222-222222222222',
    name: 'Row',
    status: 'Open',
    progress: 0,
    priority: 'Medium',
    estimateMinutes: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('namedQuickLinks schema validation', () => {
  it('accepts a named link on CR and Task input and update schemas', () => {
    const link = validNamedLink();
    expect(ChangeRequestInputSchema.parse({ name: 'CR', code: 'QL', targets: [], quickLinks: [link] }).quickLinks).toEqual([link]);
    expect(ChangeRequestUpdateSchema.parse({ quickLinks: [link] }).quickLinks).toEqual([link]);
    expect(TaskInputSchema.parse({ crId: validTaskRow().crId, name: 'Task', quickLinks: [link] }).quickLinks).toEqual([link]);
    expect(TaskUpdateSchema.parse({ quickLinks: [link] }).quickLinks).toEqual([link]);
  });

  it('rejects empty/overlong names and unsafe URLs', () => {
    for (const schema of [ChangeRequestInputSchema, TaskInputSchema]) {
      const base = schema === ChangeRequestInputSchema
        ? { name: 'CR', code: 'QL', targets: [] }
        : { crId: validTaskRow().crId, name: 'Task' };
      expect(schema.safeParse({ ...base, quickLinks: [{ name: '', url: 'https://x.test' }] }).success).toBe(false);
      expect(schema.safeParse({ ...base, quickLinks: [{ name: 'x'.repeat(81), url: 'https://x.test' }] }).success).toBe(false);
      expect(schema.safeParse({ ...base, quickLinks: [{ name: 'OK', url: 'javascript:alert(1)' }] }).success).toBe(false);
      expect(schema.safeParse({ ...base, quickLinks: [{ name: 'OK', url: 'data:text/html,x' }] }).success).toBe(false);
      expect(schema.safeParse({ ...base, quickLinks: [{ name: 'OK', url: 'relative/path' }] }).success).toBe(false);
    }
  });

  it('keeps documentLinks as string[] and parses rows with no quickLinks', () => {
    const parsed = TaskInputSchema.parse({
      crId: validTaskRow().crId,
      name: 'Task',
      documentLinks: ['https://x.test/a', '/Users/me/doc'],
    });
    expect(parsed.documentLinks).toEqual(['https://x.test/a', '/Users/me/doc']);
    expect(parsed.quickLinks).toBeUndefined();
  });

  it('backup CR and Task schemas validate new and old rows', () => {
    const link = validNamedLink();
    expect(BackupTaskRecordSchema.parse(validTaskRow({ quickLinks: [link] })).quickLinks).toEqual([link]);
    expect(BackupTaskRecordSchema.parse(validTaskRow()).quickLinks).toBeUndefined();
    expect(BackupChangeRequestRecordSchema.parse(validCrRow({ quickLinks: [link] })).quickLinks).toEqual([link]);
    expect(BackupChangeRequestRecordSchema.parse(validCrRow()).quickLinks).toBeUndefined();
  });

  it('backup envelope round-trips quickLinks without a schema version bump', () => {
    const link = validNamedLink();
    const result = validateBackupPayload({
      app: 'personal-task-planner',
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: '2026-01-01T00:00:00.000Z',
      tables: {
        tasks: [validTaskRow({ quickLinks: [link] }), validTaskRow()],
        changeRequests: [validCrRow({ quickLinks: [link] }), validCrRow()],
      },
      counts: { tasks: 2, changeRequests: 2 },
    });
    expect(result.valid).toBe(true);
    expect(result.tasks?.[0]?.quickLinks).toEqual([link]);
    expect(result.changeRequests?.[0]?.quickLinks).toEqual([link]);
  });
});

describe('namedQuickLinks repo round-trip', () => {
  let db: TaskPlannerDatabase;

  beforeEach(() => {
    db = new TaskPlannerDatabase(`TestDB_c3r_${Math.random()}`);
  });

  afterEach(async () => {
    await db.delete();
  });

  it('create then read preserves name, url and documentLinks shape', async () => {
    const system = await db.systems.add({
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Web',
      code: 'WEB',
      parentId: null,
      type: 'SERVICE',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const cr = await createChangeRequest(
      {
        name: 'CR QL',
        code: 'QL',
        status: 'Open',
        type: 'ENHANCEMENT',
        targets: [{ systemId: system as string }],
        documentLinks: ['https://x.test/doc'],
        quickLinks: [validNamedLink()],
      },
      db
    );
    expect((await db.changeRequests.get(cr.id))?.quickLinks).toEqual([validNamedLink()]);

    const task = await createTask(
      {
        crId: cr.id,
        name: 'Task QL',
        documentLinks: ['/Users/me/doc'],
        quickLinks: [validNamedLink()],
      },
      db
    );
    expect((await db.tasks.get(task.id))?.quickLinks).toEqual([validNamedLink()]);
    expect((await db.tasks.get(task.id))?.documentLinks).toEqual(['/Users/me/doc']);
  });

  it('update changes links and clears them when patch sends undefined', async () => {
    const cr = await createChangeRequest(
      { name: 'CR QL', code: 'QL', status: 'Open', type: 'ENHANCEMENT', targets: [], quickLinks: [validNamedLink()] },
      db
    );
    const renamed = { name: 'Design', url: 'https://example.com/design' };
    await updateChangeRequest(cr.id, { quickLinks: [renamed] }, db);
    expect((await db.changeRequests.get(cr.id))?.quickLinks).toEqual([renamed]);
    await updateChangeRequest(cr.id, { quickLinks: undefined }, db);
    expect((await db.changeRequests.get(cr.id))?.quickLinks).toBeUndefined();

    const task = await createTask({ crId: cr.id, name: 'Task QL', quickLinks: [validNamedLink()] }, db);
    await updateTask(task.id, { quickLinks: [renamed] }, db);
    expect((await db.tasks.get(task.id))?.quickLinks).toEqual([renamed]);
    await updateTask(task.id, { quickLinks: undefined }, db);
    expect((await db.tasks.get(task.id))?.quickLinks).toBeUndefined();
  });
});
