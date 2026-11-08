import { db as defaultDb, type TaskPlannerDatabase } from '../index';
import type { System, Task } from '../../types/models';
import { generateId } from '../../utils/uuid';
import {
  SystemInputSchema,
  SystemUpdateSchema,
  type SystemInput,
  type SystemUpdate,
} from '../../validation/schemas';

/** D-24: a parent is a LOGICAL_GROUP, never "anything with no parentId". */
export function isLogicalParent(system: Pick<System, 'type'>): boolean {
  return system.type === 'LOGICAL_GROUP';
}

export function isSubsystem(system: Pick<System, 'type'>): boolean {
  return system.type !== 'LOGICAL_GROUP';
}

type SystemShape = Pick<System, 'type'> & {
  parentId?: string | null | undefined;
  sshConfigId?: string | null | undefined;
  remoteRepoPath?: string | null | undefined;
  defaultBaseBranch?: string | null | undefined;
};

async function assertParentIsLogicalGroup(
  parentId: string | null,
  db: TaskPlannerDatabase
): Promise<void> {
  if (parentId === null) return;
  const parent = await db.systems.get(parentId);
  if (!parent) throw new Error('Hệ thống cha không tồn tại.');
  if (!isLogicalParent(parent)) throw new Error('Subsystem phải trỏ tới một Logical Parent');
}

async function assertNoCycle(
  id: string | null,
  parentId: string | null,
  db: TaskPlannerDatabase
): Promise<void> {
  const seen = new Set<string>();
  let cursor = parentId;
  while (cursor) {
    if (cursor === id || seen.has(cursor)) throw new Error('Không thể tạo vòng lặp phân cấp');
    seen.add(cursor);
    cursor = (await db.systems.get(cursor))?.parentId ?? null;
  }
}

function assertParentHasNoRepoFields(system: SystemShape): void {
  if (!isLogicalParent(system)) return;
  if (
    system.sshConfigId != null ||
    system.remoteRepoPath != null ||
    system.defaultBaseBranch != null
  ) {
    throw new Error('Hệ thống cha không được có SSH/Repo');
  }
}

/** WR-10: `&code` is a unique index; a duplicate surfaces as a raw Dexie ConstraintError. */
async function assertCodeAvailable(
  code: string,
  excludeId: string | undefined,
  db: TaskPlannerDatabase
): Promise<void> {
  const existing = await db.systems.where('code').equals(code).first();
  if (existing && existing.id !== excludeId) {
    throw new Error(`Mã hệ thống "${code}" đã tồn tại.`);
  }
}

export async function createSystem(
  input: SystemInput,
  db: TaskPlannerDatabase = defaultDb
): Promise<System> {
  const validated = SystemInputSchema.parse(input);
  const now = new Date().toISOString();

  assertParentHasNoRepoFields(validated);
  await assertParentIsLogicalGroup(validated.parentId ?? null, db);
  await assertCodeAvailable(validated.code, undefined, db);

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

  if ('parentId' in patch) {
    await assertNoCycle(id, updated.parentId, db);
    await assertParentIsLogicalGroup(updated.parentId, db);
  }

  // Promoting a subsystem to a parent drops its hierarchy and repo binding (D-24).
  if (existing.type !== 'LOGICAL_GROUP' && updated.type === 'LOGICAL_GROUP') {
    updated.parentId = null;
    delete updated.sshConfigId;
    delete updated.remoteRepoPath;
    delete updated.defaultBaseBranch;
  }

  assertParentHasNoRepoFields(updated);

  if (validated.code !== undefined) await assertCodeAvailable(updated.code, id, db);

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
  return all.filter(isLogicalParent);
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
  await db.transaction('rw', [db.systems, db.changeRequests, db.tasks], async () => {
    const children = await db.systems.where('parentId').equals(id).count();
    if (children > 0) {
      throw new Error(`Hệ thống còn ${children} subsystem con. Hãy xóa hoặc chuyển chúng trước.`);
    }

    const affectedCrs = await db.changeRequests.toArray();
    for (const cr of affectedCrs) {
      if (!cr.targets.some((t) => t.systemId === id)) continue;
      await db.changeRequests.put({
        ...cr,
        targets: cr.targets.filter((t) => t.systemId !== id),
        updatedAt: new Date().toISOString(),
      });
    }

    await db.tasks
      .where('systemId')
      .equals(id)
      .modify((task: Task) => {
        delete task.systemId;
      });

    await db.systems.delete(id);
  });
}
