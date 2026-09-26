import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db/index';
import { createTask } from '../../src/db/repositories/taskRepo';
import {
  upsertAllocation,
  updateAllocation,
  deleteAllocation,
  getAllocationsForTask,
  getTotalAllocatedMinutesForTask,
  getAllocationsForDate,
  getWeeklyAllocationsWithTasks,
} from '../../src/db/repositories/allocationRepo';

describe('Planned Allocation Repository (PLAN-01, PLAN-02, PLAN-05, D-12, D-16)', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase('TestAllocationDB_' + Math.random().toString(36).slice(2));
    await testDb.open();
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('upsertAllocation creates a new PlannedAllocation when none exists for (taskId, date)', async () => {
    const task = await createTask({ name: 'Write report', estimateMinutes: 120 }, testDb);

    const allocation = await upsertAllocation(task.id, '2026-10-15', 60, testDb);
    expect(allocation.id).toBeDefined();
    expect(allocation.taskId).toBe(task.id);
    expect(allocation.date).toBe('2026-10-15');
    expect(allocation.allocatedMinutes).toBe(60);

    const stored = await testDb.plannedAllocations.get(allocation.id);
    expect(stored).toEqual(allocation);
  });

  it('upsertAllocation updates existing record when allocation already exists for (taskId, date) maintaining unique constraint D-12', async () => {
    const task = await createTask({ name: 'Write report', estimateMinutes: 120 }, testDb);

    const first = await upsertAllocation(task.id, '2026-10-15', 60, testDb);
    const second = await upsertAllocation(task.id, '2026-10-15', 90, testDb);

    expect(second.id).toBe(first.id);
    expect(second.allocatedMinutes).toBe(90);

    const allForTask = await testDb.plannedAllocations.where('taskId').equals(task.id).toArray();
    expect(allForTask).toHaveLength(1);
    expect(allForTask[0]?.allocatedMinutes).toBe(90);
  });

  it('upsertAllocation throws error if target task does not exist', async () => {
    await expect(
      upsertAllocation('00000000-0000-4000-8000-000000000000', '2026-10-15', 60, testDb)
    ).rejects.toThrow(/Task not found/i);
  });

  it('updateAllocation modifies allocatedMinutes or date with validation per PLAN-02', async () => {
    const task = await createTask({ name: 'Review docs', estimateMinutes: 60 }, testDb);
    const alloc = await upsertAllocation(task.id, '2026-10-15', 30, testDb);

    const updated = await updateAllocation(alloc.id, 45, '2026-10-16', testDb);
    expect(updated.allocatedMinutes).toBe(45);
    expect(updated.date).toBe('2026-10-16');

    // Throws on non-existent allocation
    await expect(
      updateAllocation('00000000-0000-4000-8000-000000000000', 45, undefined, testDb)
    ).rejects.toThrow(/Allocation not found/i);
  });

  it('updateAllocation merges minutes if moving to a date that already has an allocation for the same task', async () => {
    const task = await createTask({ name: 'Review docs', estimateMinutes: 180 }, testDb);
    const alloc1 = await upsertAllocation(task.id, '2026-10-15', 30, testDb);
    await upsertAllocation(task.id, '2026-10-16', 40, testDb);

    // Move alloc1 from 15th to 16th with 50 minutes -> merges into 16th record (or updates with target minutes)
    const merged = await updateAllocation(alloc1.id, 50, '2026-10-16', testDb);
    expect(merged.date).toBe('2026-10-16');
    expect(merged.allocatedMinutes).toBe(50);

    const all = await testDb.plannedAllocations.where('taskId').equals(task.id).toArray();
    expect(all).toHaveLength(1);
  });

  it('deleteAllocation removes the allocation record cleanly per PLAN-02', async () => {
    const task = await createTask({ name: 'Draft RFC', estimateMinutes: 60 }, testDb);
    const alloc = await upsertAllocation(task.id, '2026-10-15', 45, testDb);

    await deleteAllocation(alloc.id, testDb);

    const found = await testDb.plannedAllocations.get(alloc.id);
    expect(found).toBeUndefined();
  });

  it('getAllocationsForTask and getTotalAllocatedMinutesForTask sum minutes accurately across dates', async () => {
    const task = await createTask({ name: 'Feature A', estimateMinutes: 240 }, testDb);
    await upsertAllocation(task.id, '2026-10-15', 60, testDb);
    await upsertAllocation(task.id, '2026-10-16', 90, testDb);
    await upsertAllocation(task.id, '2026-10-18', 30, testDb);

    const list = await getAllocationsForTask(task.id, testDb);
    expect(list).toHaveLength(3);
    expect(list.map((a) => a.date)).toEqual(['2026-10-15', '2026-10-16', '2026-10-18']);

    const total = await getTotalAllocatedMinutesForTask(task.id, testDb);
    expect(total).toBe(180);
  });

  it('getAllocationsForDate joins allocations with Task entities and accurately flags active vs inactive per PLAN-05 and D-16', async () => {
    const taskOpen = await createTask({ name: 'Open Task', status: 'Open' }, testDb);
    const taskProg = await createTask({ name: 'In Progress Task', status: 'In Progress' }, testDb);
    const taskDone = await createTask({ name: 'Done Task', status: 'Done' }, testDb);
    const taskCancel = await createTask({ name: 'Cancelled Task', status: 'Cancelled' }, testDb);

    await upsertAllocation(taskOpen.id, '2026-10-20', 60, testDb);
    await upsertAllocation(taskProg.id, '2026-10-20', 90, testDb);
    await upsertAllocation(taskDone.id, '2026-10-20', 120, testDb);
    await upsertAllocation(taskCancel.id, '2026-10-20', 30, testDb);

    const allocations = await getAllocationsForDate('2026-10-20', testDb);
    expect(allocations).toHaveLength(4);

    const openAlloc = allocations.find((a) => a.taskId === taskOpen.id);
    expect(openAlloc?.isActive).toBe(true);
    expect(openAlloc?.task.name).toBe('Open Task');

    const progAlloc = allocations.find((a) => a.taskId === taskProg.id);
    expect(progAlloc?.isActive).toBe(true);

    const doneAlloc = allocations.find((a) => a.taskId === taskDone.id);
    expect(doneAlloc?.isActive).toBe(false);

    const cancelAlloc = allocations.find((a) => a.taskId === taskCancel.id);
    expect(cancelAlloc?.isActive).toBe(false);
  });

  it('getWeeklyAllocationsWithTasks aggregates active and inactive minutes and counts active tasks per day per PLAN-05', async () => {
    const task1 = await createTask({ name: 'Active 1', status: 'Open' }, testDb);
    const task2 = await createTask({ name: 'Active 2', status: 'In Progress' }, testDb);
    const taskDone = await createTask({ name: 'Done Task', status: 'Done' }, testDb);

    // 2026-10-19 (Mon)
    await upsertAllocation(task1.id, '2026-10-19', 120, testDb);
    await upsertAllocation(task2.id, '2026-10-19', 60, testDb);
    await upsertAllocation(taskDone.id, '2026-10-19', 45, testDb);

    // 2026-10-20 (Tue)
    await upsertAllocation(task1.id, '2026-10-20', 90, testDb);

    const result = await getWeeklyAllocationsWithTasks('2026-10-19', '2026-10-25', testDb);

    // Mon checks
    expect(result.activeTotalsByDate['2026-10-19']).toBe(180);
    expect(result.inactiveTotalsByDate['2026-10-19']).toBe(45);
    expect(result.activeTaskCountsByDate['2026-10-19']).toBe(2);
    expect(result.allocationsByDate['2026-10-19']).toHaveLength(3);

    // Tue checks
    expect(result.activeTotalsByDate['2026-10-20']).toBe(90);
    expect(result.inactiveTotalsByDate['2026-10-20']).toBe(0);
    expect(result.activeTaskCountsByDate['2026-10-20']).toBe(1);
    expect(result.allocationsByDate['2026-10-20']).toHaveLength(1);
  });
});
