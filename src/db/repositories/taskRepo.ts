import { db as defaultDb, type TaskPlannerDatabase } from '../index';
import type { Task, TaskStatus } from '../../types/models';
import { generateId } from '../../utils/uuid';
import {
  TaskInputSchema,
  TaskUpdateSchema,
  type TaskInput,
  type TaskUpdate,
} from '../../validation/schemas';

export async function createTask(
  input: TaskInput,
  db: TaskPlannerDatabase = defaultDb
): Promise<Task> {
  const validated = TaskInputSchema.parse(input);
  const now = new Date().toISOString();

  const task: Task = {
    id: generateId(),
    name: validated.name,
    status: validated.status,
    progress: validated.progress,
    priority: validated.priority,
    estimateMinutes: validated.estimateMinutes,
    workType: validated.workType ?? 'code',
    createdAt: now,
    updatedAt: now,
  };

  if (validated.projectId !== undefined) task.projectId = validated.projectId;
  if (validated.milestoneId !== undefined) task.milestoneId = validated.milestoneId;
  if (validated.description !== undefined) task.description = validated.description;
  if (validated.deadline !== undefined) task.deadline = validated.deadline;
  if (validated.notes !== undefined) task.notes = validated.notes;
  if (validated.actualStartDate !== undefined) task.actualStartDate = validated.actualStartDate;
  if (validated.actualEndDate !== undefined) task.actualEndDate = validated.actualEndDate;
  if (validated.opsOwners !== undefined) task.opsOwners = validated.opsOwners;
  if (validated.businessAnalysts !== undefined) task.businessAnalysts = validated.businessAnalysts;
  if (validated.documentLinks !== undefined) task.documentLinks = validated.documentLinks;

  await db.tasks.add(task);
  return task;
}

export async function updateTask(
  id: string,
  patch: TaskUpdate,
  db: TaskPlannerDatabase = defaultDb
): Promise<Task> {
  const validated = TaskUpdateSchema.parse(patch);
  const existing = await db.tasks.get(id);
  if (!existing) {
    throw new Error(`Task not found: ${id}`);
  }

  const now = new Date().toISOString();
  const updated: Task = {
    ...existing,
    updatedAt: now,
  };

  if (validated.name !== undefined) updated.name = validated.name;
  if (validated.status !== undefined) updated.status = validated.status;
  if (validated.progress !== undefined) updated.progress = validated.progress;
  if (validated.priority !== undefined) updated.priority = validated.priority;
  if (validated.estimateMinutes !== undefined) updated.estimateMinutes = validated.estimateMinutes;
  if (validated.workType !== undefined) updated.workType = validated.workType;
  if (validated.projectId !== undefined) updated.projectId = validated.projectId;
  if (validated.milestoneId !== undefined) updated.milestoneId = validated.milestoneId;
  if (validated.description !== undefined) updated.description = validated.description;
  if (validated.deadline !== undefined) updated.deadline = validated.deadline;
  if (validated.notes !== undefined) updated.notes = validated.notes;
  if (validated.actualStartDate !== undefined) updated.actualStartDate = validated.actualStartDate;
  if (validated.actualEndDate !== undefined) updated.actualEndDate = validated.actualEndDate;
  if (validated.opsOwners !== undefined) updated.opsOwners = validated.opsOwners;
  if (validated.businessAnalysts !== undefined) updated.businessAnalysts = validated.businessAnalysts;
  if (validated.documentLinks !== undefined) updated.documentLinks = validated.documentLinks;

  await db.tasks.put(updated);
  return updated;
}

export async function getTask(
  id: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<Task | undefined> {
  return db.tasks.get(id);
}

export async function getAllTasks(
  db: TaskPlannerDatabase = defaultDb
): Promise<Task[]> {
  return db.tasks.toArray();
}

export async function getTasksByProject(
  projectId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<Task[]> {
  return db.tasks.where('projectId').equals(projectId).toArray();
}

export async function getTasksByMilestone(
  milestoneId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<Task[]> {
  return db.tasks.where('milestoneId').equals(milestoneId).toArray();
}

export async function updateTaskStatus(
  id: string,
  status: TaskStatus,
  db: TaskPlannerDatabase = defaultDb
): Promise<Task> {
  return updateTask(id, { status }, db);
}

export async function updateTaskProgress(
  id: string,
  progress: number,
  db: TaskPlannerDatabase = defaultDb
): Promise<Task> {
  if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
    throw new RangeError('Progress must be an integer between 0 and 100');
  }
  return updateTask(id, { progress }, db);
}

export async function reparentTask(
  taskId: string,
  targetProjectId?: string,
  targetMilestoneId?: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<Task> {
  const existing = await db.tasks.get(taskId);
  if (!existing) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const now = new Date().toISOString();
  const updated: Task = {
    ...existing,
    updatedAt: now,
  };

  // Stable UUID assertion (WORK-04, D-09)
  updated.id = existing.id;

  if (targetProjectId !== undefined) {
    updated.projectId = targetProjectId;
  } else {
    delete updated.projectId;
  }

  // If project changed and no target milestone provided, or if moved to standalone, reset milestone (D-10)
  if (targetProjectId !== undefined && targetMilestoneId !== undefined) {
    updated.milestoneId = targetMilestoneId;
  } else {
    delete updated.milestoneId;
  }

  await db.tasks.put(updated);
  return updated;
}

export async function deleteTaskDirect(
  id: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.tasks.delete(id);
}
