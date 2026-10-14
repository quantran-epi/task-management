// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import Dexie from 'dexie';
import { SCHEMA_V10 } from '../../src/db/schema';
import { TaskPlannerDatabase } from '../../src/db/index';

describe('Dexie Schema V11 Migration & KnowledgeLink indexes (LINK-01, D-21)', () => {
  const dbName = 'TestMigrationV11DB_' + Math.random().toString(36).slice(2);

  afterEach(async () => {
    await Dexie.delete(dbName);
  });

  it('opens database and has knowledgeLinks table with correct indexes', async () => {
    const db = new TaskPlannerDatabase(dbName);
    await db.open();

    expect(db.verno).toBeGreaterThanOrEqual(11);
    expect(db.table('knowledgeLinks')).toBeDefined();
    const indexes = db.table('knowledgeLinks').schema.indexes;
    expect(indexes.some((idx) => idx.name === 'linkKey' && idx.unique)).toBe(true);
    expect(indexes.some((idx) => idx.name === 'taskMateEntityType')).toBe(true);
    expect(indexes.some((idx) => idx.name === 'taskMateEntityId')).toBe(true);
    expect(indexes.some((idx) => idx.name === 'setId')).toBe(true);
    expect(indexes.some((idx) => idx.name === 'urn')).toBe(true);
    expect(indexes.some((idx) => idx.name === 'docId')).toBe(true);
    expect(indexes.some((idx) => idx.name === 'updatedAt')).toBe(true);

    db.close();
  });

  it('migrates clean from V10 to V11 preserving pre-existing data', async () => {
    // 1. Setup V10 DB
    const v10Db = new Dexie(dbName);
    v10Db.version(10).stores(SCHEMA_V10);
    await v10Db.open();

    const sampleTaskId = '11111111-1111-4111-8111-111111111111';
    await v10Db.table('tasks').add({
      id: sampleTaskId,
      name: 'Existing Task In V10',
      status: 'todo',
      priority: 'medium',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    });

    v10Db.close();

    // 2. Open with TaskPlannerDatabase which upgrades to V11
    const v11Db = new TaskPlannerDatabase(dbName);
    await v11Db.open();

    const task = await v11Db.tasks.get(sampleTaskId);
    expect(task).toBeDefined();
    expect(task?.name).toBe('Existing Task In V10');

    // Add a knowledge link to verify table is functional
    const link = {
      id: '22222222-2222-4222-8222-222222222222',
      linkKey: `task:${sampleTaskId}:33333333-3333-4333-8333-333333333333:urn:node:concept:test`,
      taskMateEntityType: 'task' as const,
      taskMateEntityId: sampleTaskId,
      setId: '33333333-3333-4333-8333-333333333333',
      urn: 'urn:node:concept:test',
      displayLabel: 'Test Concept Node',
      createdAt: '2026-10-14T00:00:00.000Z',
      updatedAt: '2026-10-14T00:00:00.000Z',
    };
    await v11Db.table('knowledgeLinks').add(link);

    const fetchedLink = await v11Db.table('knowledgeLinks').get(link.id);
    expect(fetchedLink).toBeDefined();
    expect(fetchedLink.displayLabel).toBe('Test Concept Node');

    v11Db.close();
  });
});
