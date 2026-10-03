import { isTauriApp } from '../utils/timerPopout';

const KEYRING_SERVICE = 'task-planner';

export const KEYRING_KEYS = {
  GITHUB_PAT: 'github_pat',
  BACKUP_PASSPHRASE: 'backup_passphrase',
  JIRA_API_TOKEN: 'jira_api_token',
  NINEROUTER_API_KEY: 'ninerouter_api_key',
} as const;

export async function storeKeyringCredential(key: string, secret: string): Promise<void> {
  if (!isTauriApp()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('store_credential', {
    service: KEYRING_SERVICE,
    key,
    secret,
  });
}

export async function getKeyringCredential(key: string): Promise<string | null> {
  if (!isTauriApp()) return null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke<string | null>('get_credential', {
      service: KEYRING_SERVICE,
      key,
    });
    return result ?? null;
  } catch (err) {
    console.warn(`[Keyring] Failed to load credential '${key}':`, err);
    return null;
  }
}

export async function deleteKeyringCredential(key: string): Promise<void> {
  if (!isTauriApp()) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('delete_credential', {
      service: KEYRING_SERVICE,
      key,
    });
  } catch (err) {
    console.warn(`[Keyring] Failed to delete credential '${key}':`, err);
  }
}
