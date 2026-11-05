import { isTauriApp } from '../utils/timerPopout';
import { db as defaultDb, type TaskPlannerDatabase } from '../db';
import {
  storeKeyringCredential,
  getKeyringCredential,
  deleteKeyringCredential,
} from './keyringService';
import {
  type SshConfig,
  type RemoteFileInfo,
  type RemoteFileSliceResult,
  type CommandOutput,
  SSH_CONFIGS_SETTING_KEY,
} from '../types/ssh';

const SSH_SECRET_PREFIX = 'ssh_secret_';

/** Retrieve all saved SSH configurations from IndexedDB */
export async function getSshConfigs(db: TaskPlannerDatabase = defaultDb): Promise<SshConfig[]> {
  const record = await db.settings.get(SSH_CONFIGS_SETTING_KEY);
  if (!record || !Array.isArray(record.value)) {
    return [];
  }
  return record.value as SshConfig[];
}

/** Retrieve a specific SSH configuration by ID */
export async function getSshConfigById(
  id: string,
  db: TaskPlannerDatabase = defaultDb,
): Promise<SshConfig | null> {
  const configs = await getSshConfigs(db);
  return configs.find((c) => c.id === id) ?? null;
}

/** Save (create or update) an SSH configuration and optionally store its secret in OS Keyring */
export async function saveSshConfig(
  config: SshConfig,
  secret?: string,
  db: TaskPlannerDatabase = defaultDb,
): Promise<void> {
  const configs = await getSshConfigs(db);
  const existingIdx = configs.findIndex((c) => c.id === config.id);

  const now = new Date().toISOString();
  const configToSave: SshConfig = {
    ...config,
    createdAt: config.createdAt || now,
    updatedAt: now,
  };

  if (existingIdx >= 0) {
    configs[existingIdx] = configToSave;
  } else {
    configs.push(configToSave);
  }

  await db.settings.put({
    key: SSH_CONFIGS_SETTING_KEY,
    value: configs,
  });

  if (secret !== undefined) {
    if (secret.trim().length > 0) {
      await storeKeyringCredential(`${SSH_SECRET_PREFIX}${config.id}`, secret);
    } else {
      await deleteKeyringCredential(`${SSH_SECRET_PREFIX}${config.id}`);
    }
  }
}

/** Delete an SSH configuration and its stored keyring secret */
export async function deleteSshConfig(
  id: string,
  db: TaskPlannerDatabase = defaultDb,
): Promise<void> {
  const configs = await getSshConfigs(db);
  const filtered = configs.filter((c) => c.id !== id);

  await db.settings.put({
    key: SSH_CONFIGS_SETTING_KEY,
    value: filtered,
  });

  await deleteKeyringCredential(`${SSH_SECRET_PREFIX}${id}`);
}

/** Get the saved secret (password or passphrase) for a configuration from OS Keyring */
export async function getSshSecret(configId: string): Promise<string | null> {
  return getKeyringCredential(`${SSH_SECRET_PREFIX}${configId}`);
}

async function resolveSecret(config: SshConfig, providedSecret?: string): Promise<string | null> {
  if (providedSecret !== undefined) {
    return providedSecret;
  }
  return getSshSecret(config.id);
}

// -------------------------------------------------------------------------------------------------
// Tauri Remote Commands
// -------------------------------------------------------------------------------------------------

export async function testSshConnection(
  config: SshConfig,
  secret?: string,
): Promise<string> {
  if (!isTauriApp()) {
    throw new Error('Tính năng SSH chỉ hoạt động trên môi trường Desktop Tauri.');
  }
  const effectiveSecret = await resolveSecret(config, secret);
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<string>('ssh_test_connection', {
    config,
    secret: effectiveSecret ?? null,
  });
}

export async function listRemoteDir(
  config: SshConfig,
  remotePath?: string,
  secret?: string,
): Promise<RemoteFileInfo[]> {
  if (!isTauriApp()) {
    throw new Error('Tính năng SSH chỉ hoạt động trên môi trường Desktop Tauri.');
  }
  const effectiveSecret = await resolveSecret(config, secret);
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<RemoteFileInfo[]>('ssh_list_dir', {
    config,
    secret: effectiveSecret ?? null,
    remotePath: remotePath ?? null,
  });
}

export async function readRemoteFile(
  config: SshConfig,
  remotePath: string,
  secret?: string,
): Promise<string> {
  if (!isTauriApp()) {
    throw new Error('Tính năng SSH chỉ hoạt động trên môi trường Desktop Tauri.');
  }
  const effectiveSecret = await resolveSecret(config, secret);
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<string>('ssh_read_file', {
    config,
    secret: effectiveSecret ?? null,
    remotePath,
  });
}

export async function readRemoteFileSlice(
  config: SshConfig,
  remotePath: string,
  offset?: number,
  limit?: number,
  secret?: string,
): Promise<RemoteFileSliceResult> {
  if (!isTauriApp()) {
    throw new Error('Tính năng SSH chỉ hoạt động trên môi trường Desktop Tauri.');
  }
  const effectiveSecret = await resolveSecret(config, secret);
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<RemoteFileSliceResult>('ssh_read_file_slice', {
    config,
    secret: effectiveSecret ?? null,
    remotePath,
    offset: offset ?? null,
    limit: limit ?? null,
  });
}

export async function writeRemoteFile(
  config: SshConfig,
  remotePath: string,
  content: string,
  secret?: string,
): Promise<void> {
  if (!isTauriApp()) {
    throw new Error('Tính năng SSH chỉ hoạt động trên môi trường Desktop Tauri.');
  }
  const effectiveSecret = await resolveSecret(config, secret);
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<void>('ssh_write_file', {
    config,
    secret: effectiveSecret ?? null,
    remotePath,
    content,
  });
}

export async function createRemoteDir(
  config: SshConfig,
  remotePath: string,
  secret?: string,
): Promise<void> {
  if (!isTauriApp()) {
    throw new Error('Tính năng SSH chỉ hoạt động trên môi trường Desktop Tauri.');
  }
  const effectiveSecret = await resolveSecret(config, secret);
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<void>('ssh_create_dir', {
    config,
    secret: effectiveSecret ?? null,
    remotePath,
  });
}

export async function deleteRemoteEntry(
  config: SshConfig,
  remotePath: string,
  isDir: boolean,
  secret?: string,
): Promise<void> {
  if (!isTauriApp()) {
    throw new Error('Tính năng SSH chỉ hoạt động trên môi trường Desktop Tauri.');
  }
  const effectiveSecret = await resolveSecret(config, secret);
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<void>('ssh_delete_entry', {
    config,
    secret: effectiveSecret ?? null,
    remotePath,
    isDir,
  });
}

export async function renameRemoteEntry(
  config: SshConfig,
  oldPath: string,
  newPath: string,
  secret?: string,
): Promise<void> {
  if (!isTauriApp()) {
    throw new Error('Tính năng SSH chỉ hoạt động trên môi trường Desktop Tauri.');
  }
  const effectiveSecret = await resolveSecret(config, secret);
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<void>('ssh_rename', {
    config,
    secret: effectiveSecret ?? null,
    oldPath,
    newPath,
  });
}

export async function execRemoteCommand(
  config: SshConfig,
  command: string,
  secret?: string,
): Promise<CommandOutput> {
  if (!isTauriApp()) {
    throw new Error('Tính năng SSH chỉ hoạt động trên môi trường Desktop Tauri.');
  }
  const effectiveSecret = await resolveSecret(config, secret);
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<CommandOutput>('ssh_exec_command', {
    config,
    secret: effectiveSecret ?? null,
    command,
  });
}
