// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Dexie from 'dexie';
import { TaskPlannerDatabase } from '../../src/db/index';
import {
  deleteTaskWithAllocations,
  deleteMilestoneWithCascade,
  deleteProjectWithCascade,
} from '../../src/db/repositories/cascadeRepo';
import { createWorkSession, putActiveTimer } from '../../src/db/repositories/workSessionRepo';
import type { Task, Project, Milestone } from '../../src/types/models';

describe('cascadeRepo Timer cleanup (D-16, TIMER-01, TIMER-02)', () => {
  let db: TaskPlannerDatabase;
  const dbName = 'TestCascadeTimerDB_' + Math.random().toString(36).slice(2);

  const sampleProjectId = '11111111-1111-4111-8111-111111111111';
  const sampleMilestoneId = '22222222-2222-4222-8222-222222222222';
  const sampleTaskId1 = '33333333-3333-4333-8333-333333333331';
  const sampleTaskId2 = '33333333-3333-4333-8333-333333333332';
  const directTaskId = '33333333-3333-4333-8333-333333333333';

  beforeEach(async () => {
    db = new TaskPlannerDatabase(dbName);
    await db.open();

    const now = new Date().toISOString();
    const project: Project = {
      id: sampleProjectId,
      name: 'Cascade Test Project',
      status: 'In Progress',
      createdAt: now,
      updatedAt: now,
    };
    await db.projects.add(project);

    const milestone: Milestone = {
      id: sampleMilestoneId,
      projectId: sampleProjectId,
      name: 'Cascade Test Milestone',
      status: 'Open',
      createdAt: now,
      updatedAt: now,
    };
    await db.milestones.add(milestone);

    const task1: Task = {
      id: sampleTaskId1,
      projectId: sampleProjectId,
      milestoneId: sampleMilestoneId,
      name: 'Task 1',
      status: 'In Progress',
      progress: 0,
      priority: 'High',
      estimateMinutes: 60,
      createdAt: now,
      updatedAt: now,
    };
    const task2: Task = {
      id: sampleTaskId2,
      projectId: sampleProjectId,
      milestoneId: sampleMilestoneId,
      name: 'Task 2',
      status: 'Open',
      progress: 0,
      priority: 'Medium',
      estimateMinutes: 60,
      createdAt: now,
      updatedAt: now,
    };
    const task3: Task = {
      id: directTaskId,
      projectId: sampleProjectId,
      name: 'Direct Project Task',
      status: 'Open',
      progress: 0,
      priority: 'Low',
      estimateMinutes: 60,
      createdAt: now,
      updatedAt: now,
    };
    await db.tasks.bulkAdd([task1, task2, task3]);

    // Add work sessions
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
        taskId: sampleTaskId2,
        startTime: '2026-09-29T09:00:00.000Z',
        endTime: '2026-09-29T09:40:00.000Z',
        durationMinutes: 40,
      },
      db
    );
    await createWorkSession(
      {
        taskId: directTaskId,
        startTime: '2026-09-29T10:00:00.000Z',
        endTime: '2026-09-29T10:20:00.000Z',
        durationMinutes: 20,
      },
      db
    );

    // Add active timers
    await putActiveTimer(
      {
        taskId: sampleTaskId1,
        status: 'running',
        startedAt: Date.now(),
        accumulatedMs: 1000,
        sessionStartTime: '2026-09-29T08:30:00.000Z',
      },
      db
    );
    await putActiveTimer(
      {
        taskId: sampleTaskId2,
        status: 'paused',
        startedAt: Date.now(),
        accumulatedMs: 2000,
        sessionStartTime: '2026-09-29T09:40:00.000Z',
      },
      db
    );
    await putActiveTimer(
      {
        taskId: directTaskId,
        status: 'running',
        startedAt: Date.now(),
        accumulatedMs: 3000,
        sessionStartTime: '2026-09-29T10:20:00.000Z',
      },
      db
    );
  });

  afterEach(async () => {
    db.close();
    await Dexie.delete(dbName);
  });

  it('deleteTaskWithAllocations removes workSessions and activeTimers for that task', async () => {
    await deleteTaskWithAllocations(sampleTaskId1, db);

    const task = await db.tasks.get(sampleTaskId1);
    expect(task).toBeUndefined();

    const sessions = await db.workSessions.where('taskId').equals(sampleTaskId1).toArray();
    expect(sessions).toHaveLength(0);

    const activeTimer = await db.activeTimers.get(sampleTaskId1);
    expect(activeTimer).toBeUndefined();

    // Verify other tasks still have their data
    const task2Sessions = await db.workSessions.where('taskId').equals(sampleTaskId2).toArray();
    expect(task2Sessions).toHaveLength(1);
    const task2Timer = await db.activeTimers.get(sampleTaskId2);
    expect(task2Timer).toBeDefined();
  });

  it('deleteMilestoneWithCascade in cascade mode deletes all child task sessions and active timers', async () => {
    await deleteMilestoneWithCascade(sampleMilestoneId, 'cascade', db);

    const milestone = await db.milestones.get(sampleMilestoneId);
    expect(milestone).toBeUndefined();

    const task1 = await db.tasks.get(sampleTaskId1);
    const task2 = await db.tasks.get(sampleTaskId2);
    expect(task1).toBeUndefined();
    expect(task2).toBeUndefined();

    const sessions1 = await db.workSessions.where('taskId').equals(sampleTaskId1).toArray();
    const sessions2 = await db.workSessions.where('taskId').equals(sampleTaskId2).toArray();
    expect(sessions1).toHaveLength(0);
    expect(sessions2).toHaveLength(0);

    const timer1 = await db.activeTimers.get(sampleTaskId1);
    const timer2 = await db.activeTimers.get(sampleTaskId2);
    expect(timer1).toBeUndefined();
    expect(timer2).toBeUndefined();

    // Direct task still intact
    const directTask = await db.tasks.get(directTaskId);
    expect(directTask).toBeDefined();
    const directSessions = await db.workSessions.where('taskId').equals(directTaskId).toArray();
    expect(directSessions).toHaveLength(1);
  });

  it('deleteMilestoneWithCascade in orphan mode preserves child task sessions and active timers', async () => {
    await deleteMilestoneWithCascade(sampleMilestoneId, 'orphan', db);

    const milestone = await db.milestones.get(sampleMilestoneId);
    expect(milestone).toBeUndefined();

    const task1 = await db.tasks.get(sampleTaskId1);
    expect(task1).toBeDefined();
    expect(task1?.milestoneId).toBeUndefined();

    const sessions1 = await db.workSessions.where('taskId').equals(sampleTaskId1).toArray();
    expect(sessions1).toHaveLength(1);

    const timer1 = await db.activeTimers.get(sampleTaskId1);
    expect(timer1).toBeDefined();
  });

  it('deleteProjectWithCascade in cascade mode deletes all associated tasks, sessions, and timers', async () => {
    await deleteProjectWithCascade(sampleProjectId, 'cascade', db);

    const allSessions = await db.workSessions.toArray();
    expect(allSessions).toHaveLength(0);

    const allTimers = await db.activeTimers.toArray();
    expect(allTimers).toHaveLength(0);

    const allTasks = await db.tasks.toArray();
    expect(allTasks).toHaveLength(0);
  });
});
