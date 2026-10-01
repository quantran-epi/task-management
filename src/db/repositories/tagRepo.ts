import { db as defaultDb, type TaskPlannerDatabase } from '../index';

export async function getDistinctOpsOwners(
  db: TaskPlannerDatabase = defaultDb
): Promise<string[]> {
  try {
    const [projKeys, msKeys, taskKeys] = await Promise.all([
      db.projects.orderBy('opsOwners').uniqueKeys(),
      db.milestones.orderBy('opsOwners').uniqueKeys(),
      db.tasks.orderBy('opsOwners').uniqueKeys(),
    ]);

    const all = [...projKeys, ...msKeys, ...taskKeys] as string[];
    return Array.from(new Set(all)).sort((a, b) => a.localeCompare(b));
  } catch (error) {
    // Fallback for WebKit / Safari bug (WebKit #319640: opening nextunique cursor over empty range throws UnknownError)
    const [projects, milestones, tasks] = await Promise.all([
      db.projects.toArray(),
      db.milestones.toArray(),
      db.tasks.toArray(),
    ]);

    const set = new Set<string>();
    for (const p of projects) {
      p.opsOwners?.forEach((t) => set.add(t));
    }
    for (const m of milestones) {
      m.opsOwners?.forEach((t) => set.add(t));
    }
    for (const task of tasks) {
      task.opsOwners?.forEach((t) => set.add(t));
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }
}

export async function getDistinctBusinessAnalysts(
  db: TaskPlannerDatabase = defaultDb
): Promise<string[]> {
  try {
    const [projKeys, msKeys, taskKeys] = await Promise.all([
      db.projects.orderBy('businessAnalysts').uniqueKeys(),
      db.milestones.orderBy('businessAnalysts').uniqueKeys(),
      db.tasks.orderBy('businessAnalysts').uniqueKeys(),
    ]);

    const all = [...projKeys, ...msKeys, ...taskKeys] as string[];
    return Array.from(new Set(all)).sort((a, b) => a.localeCompare(b));
  } catch (error) {
    // Fallback for WebKit / Safari bug (WebKit #319640: opening nextunique cursor over empty range throws UnknownError)
    const [projects, milestones, tasks] = await Promise.all([
      db.projects.toArray(),
      db.milestones.toArray(),
      db.tasks.toArray(),
    ]);

    const set = new Set<string>();
    for (const p of projects) {
      p.businessAnalysts?.forEach((t) => set.add(t));
    }
    for (const m of milestones) {
      m.businessAnalysts?.forEach((t) => set.add(t));
    }
    for (const task of tasks) {
      task.businessAnalysts?.forEach((t) => set.add(t));
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }
}
