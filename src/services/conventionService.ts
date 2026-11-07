import { db as defaultDb, type TaskPlannerDatabase } from '../db';

export const GLOBAL_CONVENTIONS_SETTING_KEY = 'global_conventions';

/**
 * Retrieves the global organization convention document from db.settings.
 * Returns an empty string if missing or value not a string (strictly preserving empty state).
 */
export async function getGlobalConventions(db: TaskPlannerDatabase = defaultDb): Promise<string> {
  const row = await db.settings.get(GLOBAL_CONVENTIONS_SETTING_KEY);
  return typeof row?.value === 'string' ? row.value : '';
}

/**
 * Persists the global convention document to db.settings under key 'global_conventions'.
 */
export async function saveGlobalConventions(
  content: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.settings.put({
    key: GLOBAL_CONVENTIONS_SETTING_KEY,
    value: content,
  });
}

/**
 * Removes the global convention document setting key from db.settings.
 */
export async function clearGlobalConventions(
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  await db.settings.delete(GLOBAL_CONVENTIONS_SETTING_KEY);
}
