import { db as defaultDb, type TaskPlannerDatabase } from '../index';

export async function getDistinctOpsOwners(
  db: TaskPlannerDatabase = defaultDb
): Promise<string[]> {
  const [projKeys, msKeys, taskKeys] = await Promise.all([
    db.projects.orderBy('opsOwners').uniqueKeys(),
    db.milestones.orderBy('opsOwners').uniqueKeys(),
    db.tasks.orderBy('opsOwners').uniqueKeys(),
  ]);

  const all = [...projKeys, ...msKeys, ...taskKeys] as string[];
  return Array.from(new Set(all)).sort((a, b) => a.localeCompare(b));
}

export async function getDistinctBusinessAnalysts(
  db: TaskPlannerDatabase = defaultDb
): Promise<string[]> {
  const [projKeys, msKeys, taskKeys] = await Promise.all([
    db.projects.orderBy('businessAnalysts').uniqueKeys(),
    db.milestones.orderBy('businessAnalysts').uniqueKeys(),
    db.tasks.orderBy('businessAnalysts').uniqueKeys(),
  ]);

  const all = [...projKeys, ...msKeys, ...taskKeys] as string[];
  return Array.from(new Set(all)).sort((a, b) => a.localeCompare(b));
}
