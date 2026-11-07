import { db as defaultDb, type TaskPlannerDatabase } from '../index';
import type { ChangeRequest } from '../../types/models';
import { generateId } from '../../utils/uuid';
import {
  ChangeRequestInputSchema,
  ChangeRequestUpdateSchema,
  type ChangeRequestInput,
  type ChangeRequestUpdate,
} from '../../validation/schemas';
import { deleteProjectWithCascade } from './cascadeRepo';

export async function createChangeRequest(
  input: ChangeRequestInput,
  db: TaskPlannerDatabase = defaultDb
): Promise<ChangeRequest> {
  const validated = ChangeRequestInputSchema.parse(input);
  const now = new Date().toISOString();

  const cr: ChangeRequest = {
    id: generateId(),
    name: validated.name,
    status: validated.status,
    type: validated.type,
    targetSystemIds: validated.targetSystemIds ?? [],
    createdAt: now,
    updatedAt: now,
  };

  if (validated.code !== undefined) cr.code = validated.code;
  if (validated.description !== undefined) cr.description = validated.description;
  if (validated.deadline !== undefined) cr.deadline = validated.deadline;
  if (validated.jiraEpicKey !== undefined) cr.jiraEpicKey = validated.jiraEpicKey;
  if (validated.opsOwners !== undefined) cr.opsOwners = validated.opsOwners;
  if (validated.businessAnalysts !== undefined) cr.businessAnalysts = validated.businessAnalysts;
  if (validated.documentLinks !== undefined) cr.documentLinks = validated.documentLinks;
  if (validated.reminderDate !== undefined) cr.reminderDate = validated.reminderDate;
  if (validated.reminderNote !== undefined) cr.reminderNote = validated.reminderNote;
  if (validated.reminders !== undefined) cr.reminders = validated.reminders;

  await db.changeRequests.add(cr);
  return cr;
}

export async function updateChangeRequest(
  id: string,
  patch: ChangeRequestUpdate,
  db: TaskPlannerDatabase = defaultDb
): Promise<ChangeRequest> {
  const validated = ChangeRequestUpdateSchema.parse(patch);
  const existing = await db.changeRequests.get(id);
  if (!existing) {
    throw new Error(`ChangeRequest not found: ${id}`);
  }

  const now = new Date().toISOString();
  const updated: ChangeRequest = {
    ...existing,
    updatedAt: now,
  };

  if (validated.name !== undefined) updated.name = validated.name;
  if ('code' in patch) {
    if (validated.code !== undefined) updated.code = validated.code;
    else delete updated.code;
  }
  if ('description' in patch) {
    if (validated.description !== undefined) updated.description = validated.description;
    else delete updated.description;
  }
  if ('deadline' in patch) {
    if (validated.deadline !== undefined) updated.deadline = validated.deadline;
    else delete updated.deadline;
  }
  if (validated.status !== undefined) updated.status = validated.status;
  if (validated.type !== undefined) updated.type = validated.type;
  if (validated.targetSystemIds !== undefined) updated.targetSystemIds = validated.targetSystemIds;
  if ('jiraEpicKey' in patch) {
    if (validated.jiraEpicKey !== undefined) updated.jiraEpicKey = validated.jiraEpicKey;
    else delete updated.jiraEpicKey;
  }
  if (validated.opsOwners !== undefined) updated.opsOwners = validated.opsOwners;
  if (validated.businessAnalysts !== undefined) updated.businessAnalysts = validated.businessAnalysts;
  if (validated.documentLinks !== undefined) updated.documentLinks = validated.documentLinks;
  if ('reminderDate' in patch) {
    if (validated.reminderDate !== undefined) updated.reminderDate = validated.reminderDate;
    else delete updated.reminderDate;
  }
  if ('reminderNote' in patch) {
    if (validated.reminderNote !== undefined) updated.reminderNote = validated.reminderNote;
    else delete updated.reminderNote;
  }
  if ('reminders' in patch) {
    if (validated.reminders !== undefined) updated.reminders = validated.reminders;
    else delete updated.reminders;
  }

  await db.changeRequests.put(updated);
  return updated;
}

export async function getChangeRequest(
  id: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<ChangeRequest | undefined> {
  return db.changeRequests.get(id);
}

export async function getAllChangeRequests(
  db: TaskPlannerDatabase = defaultDb
): Promise<ChangeRequest[]> {
  return db.changeRequests.toArray();
}

export async function getChangeRequestsBySystem(
  systemId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<ChangeRequest[]> {
  const all = await db.changeRequests.toArray();
  return all.filter((cr) => Array.isArray(cr.targetSystemIds) && cr.targetSystemIds.includes(systemId));
}

export async function deleteChangeRequest(
  id: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  // Cascades to tasks/milestones/allocations if matching projectId exists
  const projectExists = await db.projects.get(id);
  if (projectExists) {
    await deleteProjectWithCascade(id, 'cascade', db);
  }
  await db.changeRequests.delete(id);
}

// Backward-compatible wrappers redirecting legacy project calls if needed
export {
  createChangeRequest as createProjectAsChangeRequest,
  getChangeRequest as getProjectAsChangeRequest,
};
