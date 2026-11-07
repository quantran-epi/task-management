import { db as defaultDb, type TaskPlannerDatabase } from '../index';
import type { ChangeRequest, CrTarget, Task } from '../../types/models';
import { generateId } from '../../utils/uuid';
import {
  ChangeRequestInputSchema,
  ChangeRequestUpdateSchema,
  type ChangeRequestInput,
  type ChangeRequestUpdate,
  type CrTargetInput,
} from '../../validation/schemas';
import { isSubsystem } from './systemRepo';
import { deleteChangeRequestWithCascade } from './cascadeRepo';

/** D-25: a CR may only target subsystems that exist. Parents can never enter `targets`. */
async function assertTargetsAreSubsystems(
  targets: readonly CrTargetInput[],
  db: TaskPlannerDatabase
): Promise<void> {
  const seen = new Set<string>();
  for (const target of targets) {
    if (seen.has(target.systemId)) continue;
    seen.add(target.systemId);
    const system = await db.systems.get(target.systemId);
    if (!system) throw new Error('Subsystem không tồn tại.');
    if (!isSubsystem(system)) throw new Error('Chỉ được gắn subsystem vào CR');
  }
}

/** D-25: `featureBranch` defaults to `feature/{cr.code}` when a target omits it. */
function applyFeatureBranchDefaults(
  targets: readonly CrTargetInput[],
  code: string | undefined
): CrTarget[] {
  const fallback = `feature/${code ?? ''}`;
  return targets.map((target) => ({
    systemId: target.systemId,
    featureBranch: target.featureBranch ?? fallback,
  }));
}

export async function createChangeRequest(
  input: ChangeRequestInput,
  db: TaskPlannerDatabase = defaultDb
): Promise<ChangeRequest> {
  const validated = ChangeRequestInputSchema.parse(input);
  const now = new Date().toISOString();

  await assertTargetsAreSubsystems(validated.targets, db);

  const cr: ChangeRequest = {
    id: generateId(),
    name: validated.name,
    code: validated.code,
    status: validated.status,
    type: validated.type,
    targets: applyFeatureBranchDefaults(validated.targets, validated.code),
    createdAt: now,
    updatedAt: now,
  };

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

  if (validated.targets !== undefined) {
    await assertTargetsAreSubsystems(validated.targets, db);
  }

  const now = new Date().toISOString();
  const updated: ChangeRequest = {
    ...existing,
    updatedAt: now,
  };

  if (validated.name !== undefined) updated.name = validated.name;
  if (validated.code !== undefined) updated.code = validated.code;
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
  // D-25: only re-derive branch defaults when targets are replaced. A code rename
  // must not rewrite branches already attached to targets.
  if (validated.targets !== undefined) {
    updated.targets = applyFeatureBranchDefaults(validated.targets, updated.code);
  }
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
  return all.filter((cr) => cr.targets.some((t) => t.systemId === systemId));
}

/**
 * Detaches one subsystem from a CR: drops the target and clears `systemId` on that
 * subsystem's tasks. Single transaction so no task can outlive its target (T-31.2-10).
 */
export async function removeSubsystemFromChangeRequest(
  crId: string,
  systemId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.transaction('rw', [db.changeRequests, db.tasks], async () => {
    const cr = await db.changeRequests.get(crId);
    if (!cr) throw new Error(`ChangeRequest not found: ${crId}`);

    if (cr.targets.some((t) => t.systemId === systemId)) {
      await db.changeRequests.put({
        ...cr,
        targets: cr.targets.filter((t) => t.systemId !== systemId),
        updatedAt: new Date().toISOString(),
      });
    }

    await db.tasks
      .where('crId')
      .equals(crId)
      .filter((task: Task) => task.systemId === systemId)
      .modify((task: Task) => {
        delete task.systemId;
      });
  });
}

export async function deleteChangeRequest(
  id: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await deleteChangeRequestWithCascade(id, db);
}

// Backward-compatible wrappers redirecting legacy project calls if needed
export {
  createChangeRequest as createProjectAsChangeRequest,
  getChangeRequest as getProjectAsChangeRequest,
};
