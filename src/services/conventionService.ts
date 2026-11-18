import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import { getSshConfigById, getSshSecret, readRemoteFile, execRemoteCommand } from './sshService';
import { isTauriApp } from '../utils/timerPopout';

export const GLOBAL_CONVENTIONS_SETTING_KEY = 'global_conventions';

export const CONVENTION_CANDIDATE_PATHS = [
  'CONVENTIONS.md',
  '.github/CONVENTIONS.md',
  'docs/CONVENTIONS.md',
] as const;

export interface RepoConventionResult {
  content: string;
  foundPath: string;
  loadedAt: string;
  systemCode?: string;
}

export interface MultiRepoConventionResult extends RepoConventionResult {
  systemCode: string;
  systemName: string;
  repoPath?: string;
}

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

/**
 * Probes and loads repository CONVENTIONS.md for a specific enterprise system.
 * Probes candidates in order: CONVENTIONS.md -> .github/CONVENTIONS.md -> docs/CONVENTIONS.md.
 * Gracefully returns null on browser context, missing system/binding, absent file, or SSH error.
 */
export async function loadRepoConventionsForSystem(
  systemId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<RepoConventionResult | null> {
  if (!isTauriApp()) {
    return null;
  }

  try {
    const system = await db.systems.get(systemId);
    if (!system || !system.sshConfigId || !system.remoteRepoPath) {
      return null;
    }

    const config = await getSshConfigById(system.sshConfigId, db);
    if (!config) {
      return null;
    }

    const secret = await getSshSecret(config.id);

    // Single-roundtrip probe shell script using test -f across candidates
    const checkCmd = `for p in CONVENTIONS.md .github/CONVENTIONS.md docs/CONVENTIONS.md; do if [ -f "${system.remoteRepoPath}/$p" ]; then echo "$p"; exit 0; fi; done; exit 1`;
    const probe = await execRemoteCommand(config, checkCmd, secret ?? undefined);

    if (probe.exitStatus !== 0 || !probe.stdout.trim()) {
      return null;
    }

    const foundPath = probe.stdout.trim().split('\n')[0]?.trim();
    if (!foundPath) {
      return null;
    }

    const sanitizedBase = system.remoteRepoPath.replace(/\/+$/, '');
    const fullPath = `${sanitizedBase}/${foundPath}`;
    const content = await readRemoteFile(config, fullPath, secret ?? undefined);

    return {
      content,
      foundPath,
      loadedAt: new Date().toISOString(),
      systemCode: system.code,
    };
  } catch (err) {
    console.warn(`[loadRepoConventionsForSystem] Failed to load remote repo conventions for system ${systemId}:`, err);
    return null;
  }
}

/**
 * Aggregates repository CONVENTIONS.md across multiple system IDs.
 * Queries each system via Promise.allSettled with resilient error handling.
 */
export async function loadMultiRepoConventions(
  systemIds: string[],
  db: TaskPlannerDatabase = defaultDb
): Promise<MultiRepoConventionResult[]> {
  if (!isTauriApp() || !Array.isArray(systemIds) || systemIds.length === 0) {
    return [];
  }

  const results = await Promise.allSettled(
    systemIds.map(async (systemId) => {
      const system = await db.systems.get(systemId);
      if (!system) return null;
      const convention = await loadRepoConventionsForSystem(systemId, db);
      if (!convention) return null;
      return {
        ...convention,
        systemCode: system.code,
        systemName: system.name,
        ...(system.remoteRepoPath ? { repoPath: system.remoteRepoPath } : {}),
      };
    })
  );

  const successful: MultiRepoConventionResult[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      successful.push(r.value);
    }
  }
  return successful;
}

