import { db as defaultDb, type TaskPlannerDatabase } from '../index';
import type { CrMilestone } from '../../types/models';
import { generateId } from '../../utils/uuid';
import {
  CrMilestoneInputSchema,
  type CrMilestoneInput,
} from '../../validation/schemas';
import { deleteCrMilestoneWithCascade } from './cascadeRepo';

export type CreateCrMilestoneInput = CrMilestoneInput & { crId: string };

export async function createCrMilestone(
  input: CreateCrMilestoneInput,
  db: TaskPlannerDatabase = defaultDb
): Promise<CrMilestone> {
  const validated = CrMilestoneInputSchema.parse(input);
  const { crId } = input;
  const cr = await db.changeRequests.get(crId);
  if (!cr) throw new Error('Change Request không tồn tại.');

  const now = new Date().toISOString();
  const milestone: CrMilestone = {
    id: generateId(),
    crId,
    name: validated.name,
    createdAt: now,
    updatedAt: now,
  };
  if (validated.targetDate !== undefined) milestone.targetDate = validated.targetDate;

  await db.crMilestones.add(milestone);
  return milestone;
}

export async function updateCrMilestone(
  id: string,
  patch: Partial<CrMilestoneInput>,
  db: TaskPlannerDatabase = defaultDb
): Promise<CrMilestone> {
  const validated = CrMilestoneInputSchema.parse(patch);
  const existing = await db.crMilestones.get(id);
  if (!existing) throw new Error(`CrMilestone not found: ${id}`);

  const updated: CrMilestone = { ...existing, name: validated.name, updatedAt: new Date().toISOString() };
  // D-02-ish: CR ownership is immutable — a milestone never moves between CRs via update.
  if ('targetDate' in patch) {
    if (validated.targetDate !== undefined) updated.targetDate = validated.targetDate;
    else delete updated.targetDate;
  }

  await db.crMilestones.put(updated);
  return updated;
}

export async function listCrMilestones(
  crId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<CrMilestone[]> {
  return db.crMilestones.where('crId').equals(crId).toArray();
}

export async function getCrMilestone(
  id: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<CrMilestone | undefined> {
  return db.crMilestones.get(id);
}

export { deleteCrMilestoneWithCascade };
