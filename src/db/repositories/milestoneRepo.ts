import { db as defaultDb, type TaskPlannerDatabase } from '../index';
import type { Milestone } from '../../types/models';
import { generateId } from '../../utils/uuid';
import {
  MilestoneInputSchema,
  MilestoneUpdateSchema,
  type MilestoneInput,
  type MilestoneUpdate,
} from '../../validation/schemas';

export async function createMilestone(
  input: MilestoneInput,
  db: TaskPlannerDatabase = defaultDb
): Promise<Milestone> {
  const validated = MilestoneInputSchema.parse(input);
  const now = new Date().toISOString();

  const milestone: Milestone = {
    id: generateId(),
    projectId: validated.projectId,
    name: validated.name,
    status: validated.status,
    createdAt: now,
    updatedAt: now,
  };

  if (validated.description !== undefined) milestone.description = validated.description;
  if (validated.deadline !== undefined) milestone.deadline = validated.deadline;
  if (validated.notes !== undefined) milestone.notes = validated.notes;
  if (validated.opsOwners !== undefined) milestone.opsOwners = validated.opsOwners;
  if (validated.businessAnalysts !== undefined) milestone.businessAnalysts = validated.businessAnalysts;
  if (validated.reminderDate !== undefined) milestone.reminderDate = validated.reminderDate;
  if (validated.reminderNote !== undefined) milestone.reminderNote = validated.reminderNote;

  await db.milestones.add(milestone);
  return milestone;
}

export async function updateMilestone(
  id: string,
  patch: MilestoneUpdate,
  db: TaskPlannerDatabase = defaultDb
): Promise<Milestone> {
  const validated = MilestoneUpdateSchema.parse(patch);
  const existing = await db.milestones.get(id);
  if (!existing) {
    throw new Error(`Milestone not found: ${id}`);
  }

  const now = new Date().toISOString();
  const updated: Milestone = {
    ...existing,
    updatedAt: now,
  };

  if (validated.name !== undefined) updated.name = validated.name;
  if (validated.description !== undefined) updated.description = validated.description;
  if (validated.deadline !== undefined) updated.deadline = validated.deadline;
  if (validated.notes !== undefined) updated.notes = validated.notes;
  if (validated.status !== undefined) updated.status = validated.status;
  if (validated.opsOwners !== undefined) updated.opsOwners = validated.opsOwners;
  if (validated.businessAnalysts !== undefined) updated.businessAnalysts = validated.businessAnalysts;
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

  await db.milestones.put(updated);
  return updated;
}

export async function getMilestone(
  id: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<Milestone | undefined> {
  return db.milestones.get(id);
}

export async function getMilestonesByProject(
  projectId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<Milestone[]> {
  return db.milestones.where('projectId').equals(projectId).toArray();
}

export async function getAllMilestones(
  db: TaskPlannerDatabase = defaultDb
): Promise<Milestone[]> {
  return db.milestones.toArray();
}

export async function deleteMilestoneDirect(
  id: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.milestones.delete(id);
}
