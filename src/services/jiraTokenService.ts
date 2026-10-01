import { isTauriApp } from '../utils/timerPopout';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import {
  KEYRING_KEYS,
  getKeyringCredential,
  storeKeyringCredential,
  deleteKeyringCredential,
} from './keyringService';

// Module-level in-memory cache for fast read during UI interactions
let memoryJiraToken: string | null = null;
let migrationAttempted = false;

export async function getJiraApiToken(db: TaskPlannerDatabase = defaultDb): Promise<string> {
  if (memoryJiraToken !== null) {
    return memoryJiraToken;
  }

  if (isTauriApp()) {
    // Attempt migration of legacy token if needed
    if (!migrationAttempted) {
      migrationAttempted = true;
      await migrateLegacyJiraTokenIfNeeded(db);
    }
    const token = await getKeyringCredential(KEYRING_KEYS.JIRA_API_TOKEN);
    if (token) {
      memoryJiraToken = token;
      return token;
    }
  }

  // Fallback to IndexedDB (Web/PWA or unmigrated)
  const rec = await db.settings.get('jira_api_token');
  const token = typeof rec?.value === 'string' ? rec.value : '';
  if (token) {
    memoryJiraToken = token;
  }
  return token;
}

export async function setJiraApiToken(
  token: string,
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  const trimmed = token.trim();
  memoryJiraToken = trimmed;

  if (isTauriApp()) {
    if (trimmed) {
      await storeKeyringCredential(KEYRING_KEYS.JIRA_API_TOKEN, trimmed);
    } else {
      await deleteKeyringCredential(KEYRING_KEYS.JIRA_API_TOKEN);
    }
    // Ensure clean purge from IndexedDB so secrets never remain in local store
    await db.settings.delete('jira_api_token');
  } else {
    // On Web/PWA, store in IndexedDB or leave up to browser session
    if (trimmed) {
      await db.settings.put({ key: 'jira_api_token', value: trimmed });
    } else {
      await db.settings.delete('jira_api_token');
    }
  }
}

export async function forgetJiraApiToken(
  db: TaskPlannerDatabase = defaultDb
): Promise<void> {
  memoryJiraToken = '';
  if (isTauriApp()) {
    await deleteKeyringCredential(KEYRING_KEYS.JIRA_API_TOKEN);
  }
  await db.settings.delete('jira_api_token');
}

export async function isJiraApiTokenStored(
  db: TaskPlannerDatabase = defaultDb
): Promise<boolean> {
  if (memoryJiraToken && memoryJiraToken.length > 0) return true;
  if (isTauriApp()) {
    const cred = await getKeyringCredential(KEYRING_KEYS.JIRA_API_TOKEN);
    if (cred) {
      memoryJiraToken = cred;
      return true;
    }
  }
  const rec = await db.settings.get('jira_api_token');
  return typeof rec?.value === 'string' && rec.value.trim().length > 0;
}

/**
 * D-36: Legacy plaintext Jira tokens in IndexedDB on Tauri are migrated to OS Keychain,
 * verified via read-back, and purged from IndexedDB and SQLite queue.
 */
export async function migrateLegacyJiraTokenIfNeeded(
  db: TaskPlannerDatabase = defaultDb
): Promise<boolean> {
  if (!isTauriApp()) return false;

  try {
    const legacyRec = await db.settings.get('jira_api_token');
    if (!legacyRec || typeof legacyRec.value !== 'string' || !legacyRec.value.trim()) {
      return false;
    }

    const legacyToken = legacyRec.value.trim();
    // 1. Store in Keychain
    await storeKeyringCredential(KEYRING_KEYS.JIRA_API_TOKEN, legacyToken);

    // 2. Verify via read-back
    const readBack = await getKeyringCredential(KEYRING_KEYS.JIRA_API_TOKEN);
    if (readBack === legacyToken) {
      // 3. Purge from IndexedDB settings and SQLite queue
      await db.settings.delete('jira_api_token');
      await db.settings.put({ key: 'tauri_keyring_migrated', value: true });

      // Clean from SQLite queue if present
      const queueRec = await db.settings.get('tauri_sqlite_queue');
      if (Array.isArray(queueRec?.value)) {
        const cleanedQueue = (queueRec.value as Array<{ tableName: string; rowId: string }>).filter(
          (q) => !(q.tableName === 'settings' && q.rowId === 'jira_api_token')
        );
        await db.settings.put({ key: 'tauri_sqlite_queue', value: cleanedQueue });
      }

      memoryJiraToken = legacyToken;
      return true;
    } else {
      console.error('[Keyring Migration] Read-back verification failed for Jira API token');
      return false;
    }
  } catch (err) {
    console.warn('[Keyring Migration] Error migrating Jira token:', err);
    return false;
  }
}
