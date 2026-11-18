import { db as defaultDb, type TaskPlannerDatabase } from '../index';

/**
 * Tag aggregation unions over `changeRequests` + `tasks` only (D-27/D-50). The `projects`
 * and `milestones` stores no longer exist after the V16 upgrade, and `changeRequests` has
 * no multiEntry tag index, so both sides are read with `toArray()`.
 */
async function collectTags(
  db: TaskPlannerDatabase,
  field: 'opsOwners' | 'businessAnalysts'
): Promise<string[]> {
  const [changeRequests, tasks] = await Promise.all([
    db.changeRequests.toArray(),
    db.tasks.toArray(),
  ]);

  const set = new Set<string>();
  for (const cr of changeRequests) {
    cr[field]?.forEach((tag) => set.add(tag));
  }
  for (const task of tasks) {
    task[field]?.forEach((tag) => set.add(tag));
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export async function getDistinctOpsOwners(
  db: TaskPlannerDatabase = defaultDb
): Promise<string[]> {
  return collectTags(db, 'opsOwners');
}

export async function getDistinctBusinessAnalysts(
  db: TaskPlannerDatabase = defaultDb
): Promise<string[]> {
  return collectTags(db, 'businessAnalysts');
}
