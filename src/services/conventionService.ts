import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import { getProjectRepoSshBinding } from './gitRemoteService';
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
 * Probes and loads repository CONVENTIONS.md over native Tauri SSH.
 * Probes candidates in order: CONVENTIONS.md -> .github/CONVENTIONS.md -> docs/CONVENTIONS.md.
 * Gracefully returns null on browser context, missing binding, absent file, or SSH error.
 */
export async function loadRepoConventions(
  projectId: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<RepoConventionResult | null> {
  if (!isTauriApp()) {
    return null;
  }

  try {
    const binding = await getProjectRepoSshBinding(projectId, db);
    if (!binding || !binding.sshConfigId || !binding.remoteRepoPath) {
      return null;
    }

    const config = await getSshConfigById(binding.sshConfigId, db);
    if (!config) {
      return null;
    }

    const secret = await getSshSecret(config.id);

    // Single-roundtrip probe shell script using test -f across candidates
    const checkCmd = `for p in CONVENTIONS.md .github/CONVENTIONS.md docs/CONVENTIONS.md; do if [ -f "${binding.remoteRepoPath}/$p" ]; then echo "$p"; exit 0; fi; done; exit 1`;
    const probe = await execRemoteCommand(config, checkCmd, secret ?? undefined);

    if (probe.exitStatus !== 0 || !probe.stdout.trim()) {
      return null;
    }

    const foundPath = probe.stdout.trim().split('\n')[0]?.trim();
    if (!foundPath) {
      return null;
    }

    const sanitizedBase = binding.remoteRepoPath.replace(/\/+$/, '');
    const fullPath = `${sanitizedBase}/${foundPath}`;
    const content = await readRemoteFile(config, fullPath, secret ?? undefined);

    return {
      content,
      foundPath,
      loadedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.warn(`[loadRepoConventions] Failed to load remote repo conventions for project ${projectId}:`, err);
    return null;
  }
}

