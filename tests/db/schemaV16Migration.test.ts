import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Dexie from 'dexie';
import { TaskPlannerDatabase } from '../../src/db/index';
import { SCHEMA_V15 } from '../../src/db/schema';

/**
 * Wave 0 suite for the V15 → V16 upgrade (ENT-NORM-01).
 *
 * RED until plan 31.2-02 lands `this.version(16)`. What must hold now: the file is
 * discoverable (`npx vitest list`) and every behaviour below is encoded as a real
 * assertion against a real V15 fixture database.
 *
 * `tests/setup.ts` already installs the IndexedDB shim globally — never re-import it.
 */

const NOW = '2026-11-07T00:00:00.000Z';

interface Fixture {
  dbName: string;
}

async function seedV15Database(dbName: string): Promise<void> {
  const v15Db = new Dexie(dbName);
  v15Db.version(15).stores(SCHEMA_V15);
  await v15Db.open();

  await v15Db.table('projects').bulkAdd([
    {
      id: 'proj-1',
      name: 'Legacy Project',
      description: 'Becomes a CR',
      status: 'Open',
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]);

  await v15Db.table('milestones').bulkAdd([
    {
      id: 'ms-1',
      projectId: 'proj-1',
      name: 'Legacy Milestone',
      status: 'Open',
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]);

  await v15Db.table('changeRequests').bulkAdd([
    {
      id: 'proj-1',
      name: 'CR sharing the project id',
      status: 'Open',
      type: 'ENHANCEMENT',
      targetSystemIds: ['a', 'b'],
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: 'cr-a',
      name: 'CR A (no code)',
      status: 'Open',
      type: 'BUGFIX',
      targetSystemIds: [],
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: 'cr-b',
      name: 'CR B (no code)',
      status: 'Open',
      type: 'NEW_FEATURE',
      targetSystemIds: [],
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: 'cr-keep',
      name: 'CR with an existing code',
      code: 'CR-KEEP',
      status: 'Open',
      type: 'ENHANCEMENT',
      targetSystemIds: [],
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]);

  await v15Db.table('tasks').bulkAdd([
    {
      id: 'task-linked',
      projectId: 'proj-1',
      name: 'Task linked to the legacy project',
      status: 'Open',
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: 'task-linked-ms',
      projectId: 'proj-1',
      milestoneId: 'ms-1',
      name: 'Task linked to project and milestone',
      status: 'Open',
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: 'task-orphan',
      name: 'Standalone task with no project',
      status: 'Open',
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]);

  await v15Db.table('chatThreads').bulkAdd([
    {
      id: 'th-proj',
      scopeKey: 'project:proj-1',
      scopeType: 'project',
      entityId: 'proj-1',
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: 'th-ms',
      scopeKey: 'milestone:ms-1',
      scopeType: 'milestone',
      entityId: 'ms-1',
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: 'th-task',
      scopeKey: 'task:t1',
      scopeType: 'task',
      entityId: 't1',
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]);

  await v15Db.table('chatMessages').bulkAdd([
    { id: 'msg-proj', threadId: 'th-proj', role: 'user', content: 'legacy', createdAt: NOW },
    { id: 'msg-ms', threadId: 'th-ms', role: 'user', content: 'legacy', createdAt: NOW },
    { id: 'msg-task', threadId: 'th-task', role: 'user', content: 'keep', createdAt: NOW },
  ]);

  await v15Db.table('chatTabs').bulkAdd([
    {
      id: 'tab-proj',
      threadId: 'th-proj',
      scopeKey: 'project:proj-1',
      type: 'chat',
      title: 'legacy',
      order: 0,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: 'tab-ms',
      threadId: 'th-ms',
      scopeKey: 'milestone:ms-1',
      type: 'chat',
      title: 'legacy',
      order: 0,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: 'tab-task',
      threadId: 'th-task',
      scopeKey: 'task:t1',
      type: 'chat',
      title: 'keep',
      order: 0,
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]);

  await v15Db.table('settings').bulkAdd([
    { key: 'project_ssh_repo:x', value: { repo: 'legacy' } },
    { key: 'project_repo_ssh_binding:x', value: { ssh: 'legacy' } },
    { key: 'theme', value: 'dark' },
  ]);

  await v15Db.close();
}

describe('Dexie SCHEMA_V16 Migration (ENT-NORM-01)', () => {
  let fixture: Fixture;
  let upgraded: TaskPlannerDatabase | undefined;

  beforeEach(() => {
    fixture = { dbName: 'TestSchemaV16MigrationDB_' + Math.random().toString(36).slice(2) };
  });

  afterEach(async () => {
    if (upgraded) {
      try {
        await upgraded.delete();
      } catch {
        // already closed/deleted
      }
      upgraded = undefined;
    }
    await Dexie.delete(fixture.dbName);
  });

  async function openAtCurrentVersion(): Promise<TaskPlannerDatabase> {
    await seedV15Database(fixture.dbName);
    upgraded = new TaskPlannerDatabase(fixture.dbName);
    await upgraded.open();
    return upgraded;
  }

  it(
    're-axes project-linked tasks onto crId and deletes standalone tasks',
    async () => {
      const db = await openAtCurrentVersion();

      const linked = await db.tasks.get('task-linked');
      expect(linked).toBeDefined();
      expect((linked as unknown as Record<string, unknown>).crId).toBe('proj-1');

      const linkedWithMilestone = await db.tasks.get('task-linked-ms');
      expect(linkedWithMilestone).toBeDefined();
      expect((linkedWithMilestone as unknown as Record<string, unknown>).crId).toBe('proj-1');

      const orphan = await db.tasks.get('task-orphan');
      expect(orphan).toBeUndefined();
    },
    30000
  );

  it(
    'leaves no projectId or milestoneId property on any task',
    async () => {
      const db = await openAtCurrentVersion();

      const tasks = await db.tasks.toArray();
      expect(tasks.length).toBeGreaterThan(0);
      for (const task of tasks) {
        expect(task).not.toHaveProperty('projectId');
        expect(task).not.toHaveProperty('milestoneId');
      }
    },
    30000
  );

  it(
    'rewrites changeRequests.targetSystemIds into targets',
    async () => {
      const db = await openAtCurrentVersion();

      const cr = await db.changeRequests.get('proj-1');
      expect(cr).toBeDefined();
      expect((cr as unknown as Record<string, unknown>).targets).toEqual([
        { systemId: 'a' },
        { systemId: 'b' },
      ]);
      expect(cr).not.toHaveProperty('targetSystemIds');
    },
    30000
  );

  it(
    'backfills a deterministic CR-LEGACY code where code is missing',
    async () => {
      const db = await openAtCurrentVersion();

      const crA = await db.changeRequests.get('cr-a');
      const crB = await db.changeRequests.get('cr-b');
      const crFromProject = await db.changeRequests.get('proj-1');
      const crKeep = await db.changeRequests.get('cr-keep');

      expect(crA?.code).toMatch(/^CR-LEGACY-\d+$/);
      expect(crB?.code).toMatch(/^CR-LEGACY-\d+$/);
      expect(crFromProject?.code).toMatch(/^CR-LEGACY-\d+$/);

      // Ascending id order: cr-a < cr-b < proj-1
      expect(crA?.code).toBe('CR-LEGACY-1');
      expect(crB?.code).toBe('CR-LEGACY-2');

      // An existing code is never overwritten
      expect(crKeep?.code).toBe('CR-KEEP');
    },
    30000
  );

  it(
    'drops the projects and milestones object stores',
    async () => {
      const db = await openAtCurrentVersion();

      const tableNames = db.tables.map((t) => t.name);
      expect(tableNames).not.toContain('projects');
      expect(tableNames).not.toContain('milestones');
      expect(tableNames).toContain('changeRequests');
      expect(tableNames).toContain('systems');
    },
    30000
  );

  it(
    'purges project:/milestone: chat threads, tabs and messages while keeping task: threads',
    async () => {
      const db = await openAtCurrentVersion();

      expect(await db.chatThreads.get('th-proj')).toBeUndefined();
      expect(await db.chatThreads.get('th-ms')).toBeUndefined();
      expect(await db.chatMessages.get('msg-proj')).toBeUndefined();
      expect(await db.chatMessages.get('msg-ms')).toBeUndefined();
      expect(await db.chatTabs.get('tab-proj')).toBeUndefined();
      expect(await db.chatTabs.get('tab-ms')).toBeUndefined();

      expect(await db.chatThreads.get('th-task')).toBeDefined();
      expect(await db.chatMessages.get('msg-task')).toBeDefined();
      expect(await db.chatTabs.get('tab-task')).toBeDefined();
    },
    30000
  );

  it(
    'purges legacy project SSH/repo settings and keeps unrelated settings',
    async () => {
      const db = await openAtCurrentVersion();

      expect(await db.settings.get('project_ssh_repo:x')).toBeUndefined();
      expect(await db.settings.get('project_repo_ssh_binding:x')).toBeUndefined();

      const theme = await db.settings.get('theme');
      expect(theme).toBeDefined();
      expect(theme?.value).toBe('dark');
    },
    30000
  );
});
