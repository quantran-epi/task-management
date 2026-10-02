import { db as defaultDb, type TaskPlannerDatabase } from '../index';
import type { Task, TaskStatus } from '../../types/models';
import { generateId } from '../../utils/uuid';
import {
  TaskInputSchema,
  TaskUpdateSchema,
  type TaskInput,
  type TaskUpdate,
} from '../../validation/schemas';
import { spawnNextRecurringTask } from '../../utils/recurrence';

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
  if (validated.jiraKey !== undefined) task.jiraKey = validated.jiraKey;
  if (validated.reminderDate !== undefined) task.reminderDate = validated.reminderDate;
  if (validated.reminderNote !== undefined) task.reminderNote = validated.reminderNote;
  if (validated.reminders !== undefined) task.reminders = validated.reminders;
  if (validated.isRecurring !== undefined) task.isRecurring = validated.isRecurring;
  if (validated.recurrenceFrequency !== undefined) task.recurrenceFrequency = validated.recurrenceFrequency;
  if (validated.recurrenceInterval !== undefined) task.recurrenceInterval = validated.recurrenceInterval;
  if (validated.recurrenceDaysOfWeek !== undefined) task.recurrenceDaysOfWeek = validated.recurrenceDaysOfWeek;
  if (validated.recurrenceEndDate !== undefined) task.recurrenceEndDate = validated.recurrenceEndDate;
  if (validated.parentRecurringTaskId !== undefined) task.parentRecurringTaskId = validated.parentRecurringTaskId;

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

  const assignOptional = (key: keyof Pick<
    Task,
    | 'description'
    | 'deadline'
    | 'notes'
    | 'actualStartDate'
    | 'actualEndDate'
    | 'opsOwners'
    | 'businessAnalysts'
    | 'documentLinks'
  >) => {
    if (!(key in patch)) return;
    const value = validated[key];
    if (value !== undefined) {
      Object.assign(updated, { [key]: value });
    } else {
      delete updated[key];
    }
  };

  assignOptional('description');
  assignOptional('deadline');
  assignOptional('notes');
  assignOptional('actualStartDate');
  assignOptional('actualEndDate');
  assignOptional('opsOwners');
  assignOptional('businessAnalysts');
  assignOptional('documentLinks');
  if ('jiraKey' in patch) {
    if (validated.jiraKey !== undefined) {
      updated.jiraKey = validated.jiraKey;
    } else {
      delete updated.jiraKey;
    }
  }
  if ('reminderDate' in patch) {
    if (validated.reminderDate !== undefined) {
      updated.reminderDate = validated.reminderDate;
    } else {
      delete updated.reminderDate;
    }
  }
  if ('reminderNote' in patch) {
    if (validated.reminderNote !== undefined) {
      updated.reminderNote = validated.reminderNote;
    } else {
      delete updated.reminderNote;
    }
  }
  if ('reminders' in patch) {
    if (validated.reminders !== undefined) {
      updated.reminders = validated.reminders;
    } else {
      delete updated.reminders;
    }
  }
  if ('isRecurring' in patch) {
    if (validated.isRecurring !== undefined) {
      updated.isRecurring = validated.isRecurring;
    } else {
      delete updated.isRecurring;
    }
  }
  if ('recurrenceFrequency' in patch) {
    if (validated.recurrenceFrequency !== undefined) {
      updated.recurrenceFrequency = validated.recurrenceFrequency;
    } else {
      delete updated.recurrenceFrequency;
    }
  }
  if ('recurrenceInterval' in patch) {
    if (validated.recurrenceInterval !== undefined) {
      updated.recurrenceInterval = validated.recurrenceInterval;
    } else {
      delete updated.recurrenceInterval;
    }
  }
  if ('recurrenceDaysOfWeek' in patch) {
    if (validated.recurrenceDaysOfWeek !== undefined) {
      updated.recurrenceDaysOfWeek = validated.recurrenceDaysOfWeek;
    } else {
      delete updated.recurrenceDaysOfWeek;
    }
  }
  if ('recurrenceEndDate' in patch) {
    if (validated.recurrenceEndDate !== undefined) {
      updated.recurrenceEndDate = validated.recurrenceEndDate;
    } else {
      delete updated.recurrenceEndDate;
    }
  }
  if ('parentRecurringTaskId' in patch) {
    if (validated.parentRecurringTaskId !== undefined) {
      updated.parentRecurringTaskId = validated.parentRecurringTaskId;
    } else {
      delete updated.parentRecurringTaskId;
    }
  }

  await db.tasks.put(updated);

  // Auto-spawn next recurring task if marked Done
  if (validated.status === 'Done' && existing.status !== 'Done' && updated.isRecurring) {
    try {
      await spawnNextRecurringTask(updated, db);
    } catch (err) {
      console.error('Failed to spawn next recurring task:', err);
    }
  }

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
