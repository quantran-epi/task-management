import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { TaskPlannerDatabase } from '../../index';
import { SCHEMA_V29, LATEST_SCHEMA_VERSION } from '../../schema';
import {
  ChangeRequestInputSchema,
  ChangeRequestUpdateSchema,
  TaskInputSchema,
  TaskUpdateSchema,
  isValidLinkUrl,
} from '../../../validation/schemas';
import {
  BackupChangeRequestRecordSchema,
  BackupTaskRecordSchema,
} from '../../../validation/backupSchemas';
import { validateBackupPayload } from '../../../services/backup/validateBackup';
import { appendChangeRequestLink, createChangeRequest, updateChangeRequest } from '../changeRequestRepo';
import { appendTaskLink, createTask, updateTask } from '../taskRepo';

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
    expect(ChangeRequestInputSchema.parse({ name: 'CR', code: 'QL', targets: [], links: [link] }).links).toEqual([link]);
    expect(ChangeRequestUpdateSchema.parse({ links: [link] }).links).toEqual([link]);
    expect(TaskInputSchema.parse({ crId: validTaskRow().crId, name: 'Task', links: [link] }).links).toEqual([link]);
    expect(TaskUpdateSchema.parse({ links: [link] }).links).toEqual([link]);
  });

  it('accepts document UUID links in input, backup and form validators', () => {
    const docId = '55555555-5555-4555-8555-555555555555';
    expect(TaskInputSchema.parse({ crId: validTaskRow().crId, name: 'Task', links: [{ name: 'Doc', url: docId }] }).links).toEqual([{ name: 'Doc', url: docId }]);
    expect(BackupTaskRecordSchema.parse(validTaskRow({ links: [{ name: '', url: docId }] })).links).toEqual([{ name: '', url: docId }]);
    expect(isValidLinkUrl(docId)).toBe(true);
    expect(isValidLinkUrl('javascript:alert(1)')).toBe(false);
  });

  it('accepts empty names but rejects overlong names and unsafe URLs', () => {
    for (const schema of [ChangeRequestInputSchema, TaskInputSchema]) {
      const base = schema === ChangeRequestInputSchema
        ? { name: 'CR', code: 'QL', targets: [] }
        : { crId: validTaskRow().crId, name: 'Task' };
      expect(schema.safeParse({ ...base, links: [{ name: '', url: 'https://x.test' }] }).success).toBe(true);
      expect(schema.safeParse({ ...base, links: [{ name: 'x'.repeat(81), url: 'https://x.test' }] }).success).toBe(false);
      expect(schema.safeParse({ ...base, links: [{ name: 'OK', url: 'javascript:alert(1)' }] }).success).toBe(false);
      expect(schema.safeParse({ ...base, links: [{ name: 'OK', url: 'data:text/html,x' }] }).success).toBe(false);
      expect(schema.safeParse({ ...base, links: [{ name: 'OK', url: 'relative/path' }] }).success).toBe(false);
    }
  });

  it('rejects the removed documentLinks and quickLinks fields at the trust boundary', () => {
    for (const schema of [ChangeRequestInputSchema, TaskInputSchema]) {
      const base = schema === ChangeRequestInputSchema
        ? { name: 'CR', code: 'QL', targets: [] }
        : { crId: validTaskRow().crId, name: 'Task' };
      const legacy = { ...base, documentLinks: ['https://x.test'], quickLinks: [validNamedLink()] };
      const parsed = schema.parse(legacy);
      expect(parsed).not.toHaveProperty('documentLinks');
      expect(parsed).not.toHaveProperty('quickLinks');
    }
  });

  it('backup CR and Task schemas validate new and old rows', () => {
    const link = validNamedLink();
    expect(BackupTaskRecordSchema.parse(validTaskRow({ links: [link] })).links).toEqual([link]);
    expect(BackupTaskRecordSchema.parse(validTaskRow()).links).toBeUndefined();
    expect(BackupChangeRequestRecordSchema.parse(validCrRow({ links: [link] })).links).toEqual([link]);
    expect(BackupChangeRequestRecordSchema.parse(validCrRow()).links).toBeUndefined();
  });

  it('backup envelope normalizes legacy links and round-trips v14', () => {
    const link = validNamedLink();
    const crId = validTaskRow().crId;
    const secondCrId = '44444444-4444-4444-8444-444444444444';
    const result = validateBackupPayload({
      app: 'personal-task-planner',
      schemaVersion: 13 as never,
      exportedAt: '2026-01-01T00:00:00.000Z',
      tables: {
        tasks: [
          validTaskRow({
            documentLinks: ['/Users/me/specs'],
            quickLinks: [link],
          }),
          validTaskRow({ id: '55555555-5555-4555-8555-555555555555', crId: secondCrId }),
        ],
        changeRequests: [
          validCrRow({ id: crId, documentLinks: ['https://x.test/duplicate'], quickLinks: [{ name: 'First', url: 'https://x.test/duplicate' }] }),
          validCrRow({ id: secondCrId, code: 'QL-002' }),
        ],
      },
      counts: { tasks: 2, changeRequests: 2 },
    });
    expect(result.valid).toBe(true);
    expect(result.envelope?.schemaVersion).toBe(14);
    expect(result.envelope?.tables.tasks[0]?.links).toEqual([{ name: '', url: '/Users/me/specs' }, link]);
    expect(result.envelope?.tables.changeRequests?.[0]?.links).toEqual([{ name: 'First', url: 'https://x.test/duplicate' }]);
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

  it('create then read preserves name and url in links', async () => {
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
        links: [{ name: 'Doc', url: 'https://x.test/doc' }, validNamedLink()],
      },
      db
    );
    expect((await db.changeRequests.get(cr.id))?.links).toEqual([{ name: 'Doc', url: 'https://x.test/doc' }, validNamedLink()]);

    const task = await createTask(
      {
        crId: cr.id,
        name: 'Task QL',
        links: [{ name: 'Local', url: '/Users/me/doc' }, validNamedLink()],
      },
      db
    );
    expect((await db.tasks.get(task.id))?.links).toEqual([{ name: 'Local', url: '/Users/me/doc' }, validNamedLink()]);
    expect((await db.tasks.get(task.id))?.links).toEqual([{ name: 'Local', url: '/Users/me/doc' }, validNamedLink()]);
  });

  it('update changes links and clears them when patch sends undefined', async () => {
    const cr = await createChangeRequest(
      { name: 'CR QL', code: 'QL', status: 'Open', type: 'ENHANCEMENT', targets: [], links: [validNamedLink()] },
      db
    );
    const renamed = { name: 'Design', url: 'https://example.com/design' };
    await updateChangeRequest(cr.id, { links: [renamed] }, db);
    expect((await db.changeRequests.get(cr.id))?.links).toEqual([renamed]);
    await updateChangeRequest(cr.id, { links: undefined }, db);
    expect((await db.changeRequests.get(cr.id))?.links).toBeUndefined();

    const task = await createTask({ crId: cr.id, name: 'Task QL', links: [validNamedLink()] }, db);
    await updateTask(task.id, { links: [renamed] }, db);
    expect((await db.tasks.get(task.id))?.links).toEqual([renamed]);
    await updateTask(task.id, { links: undefined }, db);
    expect((await db.tasks.get(task.id))?.links).toBeUndefined();
  });

  it('append helpers keep links written since the caller last read the row', async () => {
    const cr = await createChangeRequest({ name: 'CR QL', code: 'QL', status: 'Open', type: 'ENHANCEMENT', targets: [] }, db);
    const task = await createTask({ crId: cr.id, name: 'Task QL' }, db);
    const concurrent = { name: '', url: 'https://example.com/from-other-tab' };
    await db.changeRequests.update(cr.id, { links: [concurrent] });
    await db.tasks.update(task.id, { links: [concurrent] });

    const added = { name: 'Quick', url: 'https://example.com/quick' };
    await appendChangeRequestLink(cr.id, added, db);
    await appendTaskLink(task.id, added, db);

    expect((await db.changeRequests.get(cr.id))?.links).toEqual([concurrent, added]);
    expect((await db.tasks.get(task.id))?.links).toEqual([concurrent, added]);
  });

  it('append helpers reject invalid links without writing', async () => {
    const cr = await createChangeRequest({ name: 'CR QL', code: 'QL', status: 'Open', type: 'ENHANCEMENT', targets: [] }, db);
    const task = await createTask({ crId: cr.id, name: 'Task QL' }, db);
    await expect(appendChangeRequestLink(cr.id, { name: 'x'.repeat(81), url: 'https://x.test' }, db)).rejects.toThrow();
    await expect(appendTaskLink(task.id, { name: 'OK', url: 'javascript:alert(1)' }, db)).rejects.toThrow();
    expect((await db.changeRequests.get(cr.id))?.links).toBeUndefined();
    expect((await db.tasks.get(task.id))?.links).toBeUndefined();
  });
});


describe('Dexie V30 link migration', () => {
  it('migrates legacy documentLinks/quickLinks into deduped links with old fields deleted', async () => {
    const dbName = 'TestV30Links_' + Math.random().toString(36).slice(2);
    const legacy = new Dexie(dbName);
    legacy.version(29).stores(SCHEMA_V29);
    await legacy.open();
    const crId = '22222222-2222-4222-8222-222222222222';
    await legacy.table('changeRequests').add({
      ...validCrRow(),
      id: crId,
      documentLinks: ['id1', 'https://x.test'],
      quickLinks: [{ name: 'Docs', url: 'https://y.test' }, { name: 'Dup', url: 'https://x.test' }],
    });
    await legacy.table('tasks').add({
      ...validTaskRow(),
      documentLinks: ['https://task.test'],
      quickLinks: [{ name: 'Task docs', url: 'https://task.test' }],
    });
    await legacy.close();

    const db = new TaskPlannerDatabase(dbName);
    await db.open();
    expect(db.verno).toBe(LATEST_SCHEMA_VERSION);

    const cr = await db.changeRequests.get(crId) as unknown as Record<string, unknown>;
    expect(cr.links).toEqual([
      { name: '', url: 'id1' },
      { name: 'Dup', url: 'https://x.test' },
      { name: 'Docs', url: 'https://y.test' },
    ]);
    expect(cr.documentLinks).toBeUndefined();
    expect(cr.quickLinks).toBeUndefined();

    const task = (await db.tasks.toArray())[0] as unknown as Record<string, unknown>;
    expect(task.links).toEqual([{ name: 'Task docs', url: 'https://task.test' }]);
    expect(task.documentLinks).toBeUndefined();
    expect(task.quickLinks).toBeUndefined();

    await db.delete();
    await Dexie.delete(dbName);
  });
});
