import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../src/db/index';
import { initializeDatabaseDefaults, resetDatabaseToDefaults } from '../src/db/seeds';
import { generateId } from '../src/utils/uuid';
import type { Project, Task } from '../src/types/models';

describe('Dexie Database Persistence & Seed Layer (DATA-02, D-05, D-07)', () => {
  let testDb: TaskPlannerDatabase;
  const testDbName = 'TestTaskPlannerDB';

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase(testDbName);
    await testDb.open();
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('registers all 8 core tables with version 1 schema', () => {
    expect(testDb.tables.map((t) => t.name).sort()).toEqual([
      'backupMetadata',
      'capacityOverrides',
      'capacityRules',
      'milestones',
      'plannedAllocations',
      'projects',
      'settings',
      'tasks',
    ].sort());
  });

  it('seeds baseline weekly capacity rules (Mon-Fri 480 mins, Sat-Sun 0 mins)', async () => {
    await initializeDatabaseDefaults(testDb);

    const rules = await testDb.capacityRules.toArray();
    expect(rules).toHaveLength(7);

    const ruleByDay = new Map(rules.map((r) => [r.dayOfWeek, r.workMinutes]));

    // Mon through Fri (1-5) must be 480 minutes (8h)
    for (let day = 1; day <= 5; day++) {
      expect(ruleByDay.get(day)).toBe(480);
    }

    // Sat and Sun (6, 0) must be 0 minutes
    expect(ruleByDay.get(6)).toBe(0);
    expect(ruleByDay.get(0)).toBe(0);
  });

  it('does not duplicate capacity rules when initializeDatabaseDefaults is called multiple times', async () => {
    await initializeDatabaseDefaults(testDb);
    await initializeDatabaseDefaults(testDb);

    const count = await testDb.capacityRules.count();
    expect(count).toBe(7);
  });

  it('handles concurrent initializeDatabaseDefaults calls atomically without duplicates (CR-02)', async () => {
    await Promise.all([
      initializeDatabaseDefaults(testDb),
      initializeDatabaseDefaults(testDb),
      initializeDatabaseDefaults(testDb),
    ]);

    const count = await testDb.capacityRules.count();
    expect(count).toBe(7);
  });

  it('persists records across database close and reopen (DATA-02)', async () => {
    const projectId = generateId();
    const taskId = generateId();
    const now = new Date().toISOString();

    const sampleProject: Project = {
      id: projectId,
      name: 'Launch PWA',
      status: 'In Progress',
      createdAt: now,
      updatedAt: now,
    };

    const sampleTask: Task = {
      id: taskId,
      projectId,
      name: 'Write Unit Tests',
      status: 'Open',
      progress: 0,
      priority: 'High',
      estimateMinutes: 120,
      createdAt: now,
      updatedAt: now,
    };

    await testDb.projects.add(sampleProject);
    await testDb.tasks.add(sampleTask);

    // Simulate browser reload / db reconnect
    testDb.close();

    const reopenedDb = new TaskPlannerDatabase(testDbName);
    await reopenedDb.open();

    const persistedProject = await reopenedDb.projects.get(projectId);
    const persistedTask = await reopenedDb.tasks.get(taskId);

    expect(persistedProject).toBeDefined();
    expect(persistedProject?.name).toBe('Launch PWA');
    expect(persistedTask).toBeDefined();
    expect(persistedTask?.estimateMinutes).toBe(120);

    await reopenedDb.delete();
  });

  it('purges all user data and re-establishes baseline defaults on resetDatabaseToDefaults (D-07, T-01-02)', async () => {
    await initializeDatabaseDefaults(testDb);

    const now = new Date().toISOString();
    await testDb.projects.add({
      id: generateId(),
      name: 'Temporary Project',
      status: 'Open',
      createdAt: now,
      updatedAt: now,
    });

    await testDb.tasks.add({
      id: generateId(),
      name: 'Temporary Task',
      status: 'Open',
      progress: 0,
      priority: 'Low',
      estimateMinutes: 60,
      createdAt: now,
      updatedAt: now,
    });

    expect(await testDb.projects.count()).toBe(1);
    expect(await testDb.tasks.count()).toBe(1);

    await resetDatabaseToDefaults(testDb);

    // All custom entities cleared
    expect(await testDb.projects.count()).toBe(0);
    expect(await testDb.tasks.count()).toBe(0);

    // Baseline capacity rules restored
    const rules = await testDb.capacityRules.toArray();
    expect(rules).toHaveLength(7);
  });
});
