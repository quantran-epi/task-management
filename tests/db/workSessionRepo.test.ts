// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Dexie from 'dexie';
import { TaskPlannerDatabase } from '../../src/db/index';
import {
  createWorkSession,
  getWorkSessionsForTask,
  updateWorkSession,
  deleteWorkSession,
  getTaskSpentMinutes,
  getMilestoneSpentMinutes,
  getProjectSpentMinutes,
  getTaskIdsWithWorkSessionsInRange,
} from '../../src/db/repositories/workSessionRepo';
import type { Task, Project, Milestone } from '../../src/types/models';

describe('workSessionRepo (D-06, D-09, D-10, D-11, TIMER-01, TIMER-05)', () => {
  let db: TaskPlannerDatabase;
  const dbName = 'TestWorkSessionRepoDB_' + Math.random().toString(36).slice(2);

  const sampleProjectId = '11111111-1111-4111-8111-111111111111';
  const sampleMilestoneId = '22222222-2222-4222-8222-222222222222';
  const sampleTaskId1 = '33333333-3333-4333-8333-333333333331';
  const sampleTaskId2 = '33333333-3333-4333-8333-333333333332';
  const directProjectTaskId = '33333333-3333-4333-8333-333333333333';

  beforeEach(async () => {
    db = new TaskPlannerDatabase(dbName);
    await db.open();

    const now = new Date().toISOString();
    const project: Project = {
      id: sampleProjectId,
      name: 'Repo Test Project',
      status: 'In Progress',
      createdAt: now,
      updatedAt: now,
    };
    await db.projects.add(project);

    const milestone: Milestone = {
      id: sampleMilestoneId,
      projectId: sampleProjectId,
      name: 'Repo Test Milestone',
      status: 'Open',
      createdAt: now,
      updatedAt: now,
    };
    await db.milestones.add(milestone);

    const task1: Task = {
      id: sampleTaskId1,
      projectId: sampleProjectId,
      milestoneId: sampleMilestoneId,
      name: 'Task 1 in Milestone',
      status: 'In Progress',
      progress: 20,
      priority: 'High',
      estimateMinutes: 120,
      createdAt: now,
      updatedAt: now,
    };
    const task2: Task = {
      id: sampleTaskId2,
      projectId: sampleProjectId,
      milestoneId: sampleMilestoneId,
      name: 'Task 2 in Milestone',
      status: 'Open',
      progress: 0,
      priority: 'Medium',
      estimateMinutes: 60,
      createdAt: now,
      updatedAt: now,
    };
    const directTask: Task = {
      id: directProjectTaskId,
      projectId: sampleProjectId,
      name: 'Direct Project Task',
      status: 'Open',
      progress: 0,
      priority: 'Low',
      estimateMinutes: 90,
      createdAt: now,
      updatedAt: now,
    };
    await db.tasks.bulkAdd([task1, task2, directTask]);
  });

  afterEach(async () => {
    db.close();
    await Dexie.delete(dbName);
  });

  it('creates work session, sets date, durationMinutes, updates task.updatedAt', async () => {
    const session = await createWorkSession(
      {
        taskId: sampleTaskId1,
        startTime: '2026-09-29T08:00:00.000Z',
        endTime: '2026-09-29T08:45:00.000Z',
        durationMinutes: 45,
        note: 'Initial work session',
      },
      db
    );

    expect(session.id).toBeDefined();
    expect(session.taskId).toBe(sampleTaskId1);
    expect(session.durationMinutes).toBe(45);
    expect(session.date).toBe('2026-09-29');
    expect(session.note).toBe('Initial work session');

    const task = await db.tasks.get(sampleTaskId1);
    expect(task?.updatedAt).toBe(session.updatedAt);
  });

  it('retrieves work sessions for task sorted by startTime descending', async () => {
    await createWorkSession(
      {
        taskId: sampleTaskId1,
        startTime: '2026-09-29T08:00:00.000Z',
        endTime: '2026-09-29T08:30:00.000Z',
        durationMinutes: 30,
      },
      db
    );

    await createWorkSession(
      {
        taskId: sampleTaskId1,
        startTime: '2026-09-29T10:00:00.000Z',
        endTime: '2026-09-29T11:00:00.000Z',
        durationMinutes: 60,
      },
      db
    );

    const sessions = await getWorkSessionsForTask(sampleTaskId1, db);
    expect(sessions).toHaveLength(2);
    expect(sessions[0]?.startTime).toBe('2026-09-29T10:00:00.000Z');
    expect(sessions[1]?.startTime).toBe('2026-09-29T08:00:00.000Z');
  });

  it('updates and deletes work session correctly', async () => {
    const session = await createWorkSession(
      {
        taskId: sampleTaskId1,
        startTime: '2026-09-29T08:00:00.000Z',
        endTime: '2026-09-29T08:30:00.000Z',
        durationMinutes: 30,
      },
      db
    );

    const updated = await updateWorkSession(
      session.id,
      {
        durationMinutes: 40,
        note: 'Adjusted duration',
      },
      db
    );

    expect(updated.durationMinutes).toBe(40);
    expect(updated.note).toBe('Adjusted duration');

    await deleteWorkSession(session.id, db);
    const sessions = await getWorkSessionsForTask(sampleTaskId1, db);
    expect(sessions).toHaveLength(0);
  });

  it('calculates rollups accurately across Task, Milestone, and Project levels (D-11)', async () => {
    // Task 1: 30m + 45m = 75m
    await createWorkSession(
      {
        taskId: sampleTaskId1,
        startTime: '2026-09-29T08:00:00.000Z',
        endTime: '2026-09-29T08:30:00.000Z',
        durationMinutes: 30,
      },
      db
    );
    await createWorkSession(
      {
        taskId: sampleTaskId1,
        startTime: '2026-09-29T09:00:00.000Z',
        endTime: '2026-09-29T09:45:00.000Z',
        durationMinutes: 45,
      },
      db
    );

    // Task 2: 25m
    await createWorkSession(
      {
        taskId: sampleTaskId2,
        startTime: '2026-09-29T10:00:00.000Z',
        endTime: '2026-09-29T10:25:00.000Z',
        durationMinutes: 25,
      },
      db
    );

    // Direct Project Task: 50m
    await createWorkSession(
      {
        taskId: directProjectTaskId,
        startTime: '2026-09-29T11:00:00.000Z',
        endTime: '2026-09-29T11:50:00.000Z',
        durationMinutes: 50,
      },
      db
    );

    // Rollup 1: Task 1 spent = 75m
    const task1Spent = await getTaskSpentMinutes(sampleTaskId1, db);
    expect(task1Spent).toBe(75);

    // Rollup 2: Milestone spent = Task 1 (75m) + Task 2 (25m) = 100m
    const milestoneSpent = await getMilestoneSpentMinutes(sampleMilestoneId, db);
    expect(milestoneSpent).toBe(100);

    // Rollup 3: Project spent = Milestone (100m) + Direct Task (50m) = 150m
    const projectSpent = await getProjectSpentMinutes(sampleProjectId, db);
    expect(projectSpent).toBe(150);
  });

  it('getTaskIdsWithWorkSessionsInRange returns unique task IDs for sessions in date range', async () => {
    await createWorkSession(
      {
        taskId: sampleTaskId1,
        startTime: '2026-10-01T10:00:00.000Z',
        durationMinutes: 30,
      },
      db
    );
    await createWorkSession(
      {
        taskId: sampleTaskId2,
        startTime: '2026-10-02T10:00:00.000Z',
        durationMinutes: 45,
      },
      db
    );

    // Both inside Oct 1 - Oct 2
    const taskIdsAll = await getTaskIdsWithWorkSessionsInRange('2026-10-01', '2026-10-02', db);
    expect(taskIdsAll.has(sampleTaskId1)).toBe(true);
    expect(taskIdsAll.has(sampleTaskId2)).toBe(true);
    expect(taskIdsAll.size).toBe(2);

    // Only Oct 1
    const taskIdsOct1 = await getTaskIdsWithWorkSessionsInRange('2026-10-01', '2026-10-01', db);
    expect(taskIdsOct1.has(sampleTaskId1)).toBe(true);
    expect(taskIdsOct1.has(sampleTaskId2)).toBe(false);

    // Invalid range or out of range
    const emptySet = await getTaskIdsWithWorkSessionsInRange('2026-10-05', '2026-10-06', db);
    expect(emptySet.size).toBe(0);

    const invertedRange = await getTaskIdsWithWorkSessionsInRange('2026-10-05', '2026-10-01', db);
    expect(invertedRange.size).toBe(0);
  });
});
