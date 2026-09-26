import { db, TaskPlannerDatabase } from './index';
import { generateId } from '../utils/uuid';
import type { CapacityRule } from '../types/models';

/**
 * Initializes baseline capacity rules if not already present.
 * Sets Mon-Fri (days 1-5) to 480 minutes (8h) and Sat-Sun (days 6, 0) to 0 minutes (D-05).
 */
export async function initializeDatabaseDefaults(targetDb: TaskPlannerDatabase = db): Promise<void> {
  const existingRules = await targetDb.capacityRules.count();
  if (existingRules === 0) {
    const defaultRules: CapacityRule[] = [
      { id: generateId(), dayOfWeek: 1, workMinutes: 480 },
      { id: generateId(), dayOfWeek: 2, workMinutes: 480 },
      { id: generateId(), dayOfWeek: 3, workMinutes: 480 },
      { id: generateId(), dayOfWeek: 4, workMinutes: 480 },
      { id: generateId(), dayOfWeek: 5, workMinutes: 480 },
      { id: generateId(), dayOfWeek: 6, workMinutes: 0 },
      { id: generateId(), dayOfWeek: 0, workMinutes: 0 },
    ];
    await targetDb.capacityRules.bulkAdd(defaultRules);
  }
}

/**
 * Clears all database tables and reseeds baseline capacity defaults inside
 * a single atomic Dexie readwrite transaction (D-07, T-01-02).
 */
export async function resetDatabaseToDefaults(targetDb: TaskPlannerDatabase = db): Promise<void> {
  await targetDb.transaction('rw', targetDb.tables, async () => {
    await Promise.all(targetDb.tables.map((table) => table.clear()));

    const defaultRules: CapacityRule[] = [
      { id: generateId(), dayOfWeek: 1, workMinutes: 480 },
      { id: generateId(), dayOfWeek: 2, workMinutes: 480 },
      { id: generateId(), dayOfWeek: 3, workMinutes: 480 },
      { id: generateId(), dayOfWeek: 4, workMinutes: 480 },
      { id: generateId(), dayOfWeek: 5, workMinutes: 480 },
      { id: generateId(), dayOfWeek: 6, workMinutes: 0 },
      { id: generateId(), dayOfWeek: 0, workMinutes: 0 },
    ];
    await targetDb.capacityRules.bulkAdd(defaultRules);
  });
}
