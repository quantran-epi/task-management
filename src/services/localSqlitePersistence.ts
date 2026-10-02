import Dexie, { type Table } from 'dexie';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import type { Setting } from '../types/models';

export const SQLITE_SETTING_KEYS = {
  path: 'tauri_sqlite_path',
  enabled: 'tauri_sqlite_enabled',
  lastFlushAt: 'tauri_sqlite_last_flush_at',
  missingPath: 'tauri_sqlite_missing_path',
  queue: 'tauri_sqlite_queue',
} as const;

export const SQLITE_DOMAIN_TABLES = [
  'projects',
  'milestones',
  'tasks',
  'capacityRules',
  'capacityOverrides',
  'plannedAllocations',
  'workSessions',
] as const;

export const SQLITE_LOCAL_TABLES = ['settings', 'backupMetadata', 'activeTimers'] as const;
export const SQLITE_TABLES = [...SQLITE_DOMAIN_TABLES, ...SQLITE_LOCAL_TABLES] as const;

type SqliteTableName = (typeof SQLITE_TABLES)[number];

export interface QueuedSqliteChange {
  tableName: SqliteTableName;
  rowId: string;
  payloadJson: string | null;
  deleted: boolean;
}

export interface SqliteStoredRow {
  tableName: SqliteTableName;
  rowId: string;
  payloadJson: string;
  updatedAt: string;
}

export interface FlushLocalSqliteResult {
  flushed: number;
  skipped?: boolean;
  missingPath?: boolean;
}

async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const api = await import('@tauri-apps/api/core');
  return args === undefined ? api.invoke<T>(command) : api.invoke<T>(command, args);
}

const memoryQueues = new WeakMap<TaskPlannerDatabase, QueuedSqliteChange[]>();
const flushTimers = new WeakMap<TaskPlannerDatabase, number>();
const suppressedDbs = new WeakSet<TaskPlannerDatabase>();
const INTERNAL_SETTING_KEYS = new Set<string>([
  SQLITE_SETTING_KEYS.queue,
  SQLITE_SETTING_KEYS.lastFlushAt,
  SQLITE_SETTING_KEYS.missingPath,
]);
export const EXCLUDED_SETTING_KEYS = new Set<string>([
  'jira_api_token',
  'github_pat',
  'github_token',
  'github_passphrase',
  'backup_passphrase',
  'tauri_keyring_migrated',
]);

const SECRET_SETTING_KEYS = EXCLUDED_SETTING_KEYS;

function coalesceQueue(queue: QueuedSqliteChange[], change: QueuedSqliteChange): QueuedSqliteChange[] {
  return [...queue.filter((item) => item.tableName !== change.tableName || item.rowId !== change.rowId), change];
}

function normalizeErrorCode(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  return String(err);
}

function isSqliteTableName(value: string): value is SqliteTableName {
  return (SQLITE_TABLES as readonly string[]).includes(value);
}

function getRowId(tableName: SqliteTableName, value: unknown): string {
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const id = tableName === 'settings' ? record.key : tableName === 'activeTimers' ? record.taskId : record.id;
    if (typeof id === 'string' && id.trim()) return id;
  }
  return '';
}

function serializePayload(value: unknown): string {
  return JSON.stringify(value ?? null);
}

async function getQueue(db: TaskPlannerDatabase): Promise<QueuedSqliteChange[]> {
  const rec = await db.settings.get(SQLITE_SETTING_KEYS.queue);
  return Array.isArray(rec?.value) ? (rec.value as QueuedSqliteChange[]) : [];
}

async function setQueue(db: TaskPlannerDatabase, queue: QueuedSqliteChange[]): Promise<void> {
  await db.settings.put({ key: SQLITE_SETTING_KEYS.queue, value: queue });
}

export async function configureSqlitePath(
  db: TaskPlannerDatabase = defaultDb,
  path: string
): Promise<void> {
  await tauriInvoke<void>('sqlite_init', { path });
  const now = new Date().toISOString();
  await db.transaction('rw', db.settings, async () => {
    await db.settings.bulkPut([
      { key: SQLITE_SETTING_KEYS.path, value: path },
      { key: SQLITE_SETTING_KEYS.enabled, value: true },
      { key: SQLITE_SETTING_KEYS.missingPath, value: false },
      { key: SQLITE_SETTING_KEYS.lastFlushAt, value: now },
    ]);
  });
}

export async function selectAndConfigureSqlitePath(
  db: TaskPlannerDatabase = defaultDb
): Promise<string | null> {
  const selected = await tauriInvoke<string | null>('select_sqlite_path');
  if (!selected) return null;
  await configureSqlitePath(db, selected);
  return selected;
}

function triggerDebouncedFlush(db: TaskPlannerDatabase): void {
  if (typeof window === 'undefined') return;
  const existing = flushTimers.get(db);
  if (existing !== undefined) window.clearTimeout(existing);
  const next = window.setTimeout(() => {
    flushTimers.delete(db);
    void flushLocalSqliteNow(db).catch((err) => {
      console.warn('Local SQLite debounced flush failed:', err);
    });
  }, 1000);
  flushTimers.set(db, next);
}

export function enqueueLocalSqliteChange(
  db: TaskPlannerDatabase,
  tableName: string,
  rowId: string,
  payload: unknown,
  deleted: boolean
): void {
  if (!isSqliteTableName(tableName) || !rowId || suppressedDbs.has(db)) return;
  if (tableName === 'settings' && (INTERNAL_SETTING_KEYS.has(rowId) || SECRET_SETTING_KEYS.has(rowId))) return;

  const change: QueuedSqliteChange = {
    tableName,
    rowId,
    payloadJson: deleted ? null : serializePayload(payload),
    deleted,
  };
  memoryQueues.set(db, coalesceQueue(memoryQueues.get(db) ?? [], change));
  triggerDebouncedFlush(db);

  void Dexie.ignoreTransaction(async () => {
    const next = coalesceQueue(await getQueue(db), change);
    const writes: Setting[] = [{ key: SQLITE_SETTING_KEYS.queue, value: next }];
    if ((SQLITE_DOMAIN_TABLES as readonly string[]).includes(tableName)) {
      writes.push({ key: 'github_auto_sync_dirty_since', value: new Date().toISOString() });
    }
    suppressedDbs.add(db);
    try {
      await db.settings.bulkPut(writes);
    } finally {
      suppressedDbs.delete(db);
    }
  });
}

export async function flushLocalSqliteNow(
  db: TaskPlannerDatabase = defaultDb
): Promise<FlushLocalSqliteResult> {
  const [enabledRec, pathRec, missingRec, persistedQueue] = await Promise.all([
    db.settings.get(SQLITE_SETTING_KEYS.enabled),
    db.settings.get(SQLITE_SETTING_KEYS.path),
    db.settings.get(SQLITE_SETTING_KEYS.missingPath),
    getQueue(db),
  ]);
  const queue = (memoryQueues.get(db) ?? persistedQueue).reduce<QueuedSqliteChange[]>(
    (next, change) => coalesceQueue(next, change),
    []
  );
  if (queue.length > persistedQueue.length) await setQueue(db, queue);

  if (enabledRec?.value !== true || typeof pathRec?.value !== 'string' || !pathRec.value) {
    return { flushed: 0, skipped: true };
  }
  if (missingRec?.value === true) return { flushed: 0, skipped: true, missingPath: true };
  if (queue.length === 0) return { flushed: 0 };

  try {
    await tauriInvoke<void>('sqlite_apply_changes', { path: pathRec.value, changes: queue });
  } catch (err) {
    if (normalizeErrorCode(err).includes('SQLITE_PATH_MISSING')) {
      await db.settings.put({ key: SQLITE_SETTING_KEYS.missingPath, value: true });
      return { flushed: 0, missingPath: true };
    }
    throw err;
  }

  const flushed = queue.length;
  memoryQueues.set(db, []);
  suppressedDbs.add(db);
  try {
    await db.transaction('rw', db.settings, async () => {
      await setQueue(db, []);
      await db.settings.put({ key: SQLITE_SETTING_KEYS.lastFlushAt, value: new Date().toISOString() });
      await db.settings.put({ key: SQLITE_SETTING_KEYS.missingPath, value: false });
    });
  } finally {
    suppressedDbs.delete(db);
  }
  return { flushed };
}

export async function hydrateDexieFromSqlite(db: TaskPlannerDatabase = defaultDb): Promise<number> {
  const pathRec = await db.settings.get(SQLITE_SETTING_KEYS.path);
  if (typeof pathRec?.value !== 'string' || !pathRec.value) return 0;

  let rows: SqliteStoredRow[];
  try {
    rows = await tauriInvoke<SqliteStoredRow[]>('sqlite_read_rows', { path: pathRec.value });
  } catch (err) {
    if (normalizeErrorCode(err).includes('SQLITE_PATH_MISSING')) {
      await db.settings.put({ key: SQLITE_SETTING_KEYS.missingPath, value: true });
      return 0;
    }
    throw err;
  }

  for (const row of rows) {
    if (!isSqliteTableName(row.tableName)) continue;
    await db.table(row.tableName).put(JSON.parse(row.payloadJson));
  }
  return rows.length;
}

export function attachSqliteTableHooks(db: TaskPlannerDatabase = defaultDb): () => void {
  const unsubscribe: Array<() => void> = [];

  for (const tableName of SQLITE_TABLES) {
    const table = db.table(tableName) as Table<unknown, string>;
    const creating = (_primaryKey: unknown, value: unknown) => {
      const rowId = getRowId(tableName, value);
      enqueueLocalSqliteChange(db, tableName, rowId, value, false);
    };
    const updating = (_mods: unknown, primaryKey: unknown, value: unknown) => {
      const rowId = typeof primaryKey === 'string' ? primaryKey : getRowId(tableName, value);
      enqueueLocalSqliteChange(db, tableName, rowId, value, false);
    };
    const deleting = (primaryKey: unknown, value: unknown) => {
      const rowId = typeof primaryKey === 'string' ? primaryKey : getRowId(tableName, value);
      enqueueLocalSqliteChange(db, tableName, rowId, null, true);
    };

    table.hook('creating', creating);
    table.hook('updating', updating);
    table.hook('deleting', deleting);
    unsubscribe.push(() => {
      table.hook('creating').unsubscribe(creating);
      table.hook('updating').unsubscribe(updating);
      table.hook('deleting').unsubscribe(deleting);
    });
  }

  return () => unsubscribe.forEach((fn) => fn());
}
