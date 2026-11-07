import { db as defaultDb, type TaskPlannerDatabase } from '../index';
import type { System } from '../../types/models';
import { generateId } from '../../utils/uuid';
import {
  SystemInputSchema,
  SystemUpdateSchema,
  type SystemInput,
  type SystemUpdate,
} from '../../validation/schemas';

export async function createSystem(
  input: SystemInput,
  db: TaskPlannerDatabase = defaultDb
): Promise<System> {
  const validated = SystemInputSchema.parse(input);
  const now = new Date().toISOString();

  const system: System = {
    id: generateId(),
    name: validated.name,
    code: validated.code,
    parentId: validated.parentId ?? null,
    type: validated.type,
    createdAt: now,
    updatedAt: now,
  };

  if (validated.description !== undefined) system.description = validated.description;
  if (validated.sshConfigId !== undefined) system.sshConfigId = validated.sshConfigId;
  if (validated.remoteRepoPath !== undefined) system.remoteRepoPath = validated.remoteRepoPath;
  if (validated.defaultBaseBranch !== undefined) system.defaultBaseBranch = validated.defaultBaseBranch;

  await db.systems.add(system);
  return system;
}

export async function updateSystem(
  id: string,
  patch: SystemUpdate,
  db: TaskPlannerDatabase = defaultDb
): Promise<System> {
  const validated = SystemUpdateSchema.parse(patch);
  const existing = await db.systems.get(id);
  if (!existing) {
    throw new Error(`System not found: ${id}`);
  }

  const now = new Date().toISOString();
  const updated: System = {
    ...existing,
    updatedAt: now,
  };

  if (validated.name !== undefined) updated.name = validated.name;
  if (validated.code !== undefined) updated.code = validated.code;
  if ('parentId' in patch) updated.parentId = validated.parentId ?? null;
  if (validated.type !== undefined) updated.type = validated.type;
  if ('description' in patch) {
    if (validated.description !== undefined) updated.description = validated.description;
    else delete updated.description;
  }
  if ('sshConfigId' in patch) {
    if (validated.sshConfigId) updated.sshConfigId = validated.sshConfigId;
    else delete updated.sshConfigId;
  }
  if ('remoteRepoPath' in patch) {
    if (validated.remoteRepoPath) updated.remoteRepoPath = validated.remoteRepoPath;
    else delete updated.remoteRepoPath;
  }
  if ('defaultBaseBranch' in patch) {
    if (validated.defaultBaseBranch) updated.defaultBaseBranch = validated.defaultBaseBranch;
    else delete updated.defaultBaseBranch;
  }

  await db.systems.put(updated);
  return updated;
}

export async function getSystem(
  id: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<System | undefined> {
  return db.systems.get(id);
}

export async function getAllSystems(
  db: TaskPlannerDatabase = defaultDb
): Promise<System[]> {
  return db.systems.toArray();
}

export async function getParentSystems(
  db: TaskPlannerDatabase = defaultDb
): Promise<System[]> {
  const all = await db.systems.toArray();
  return all.filter((s) => s.parentId === null || s.type === 'LOGICAL_GROUP');
}

export async function getSubsystems(
  parentId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<System[]> {
  return db.systems.where('parentId').equals(parentId).toArray();
}

export async function deleteSystem(
  id: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  const children = await db.systems.where('parentId').equals(id).count();
  if (children > 0) {
    throw new Error(`Cannot delete system ${id}: child subsystems exist. Reparent or delete them first.`);
  }
  await db.systems.delete(id);
}
