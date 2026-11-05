import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../src/db';
import {
  getSshConfigs,
  getSshConfigById,
  saveSshConfig,
  deleteSshConfig,
} from '../../src/services/sshService';
import { type SshConfig } from '../../src/types/ssh';

// Mock keyringService and timerPopout
vi.mock('../../src/services/keyringService', () => ({
  storeKeyringCredential: vi.fn().mockResolvedValue(undefined),
  getKeyringCredential: vi.fn().mockResolvedValue('test_secret'),
  deleteKeyringCredential: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/utils/timerPopout', () => ({
  isTauriApp: vi.fn().mockReturnValue(true),
}));

describe('sshService', () => {
  let db: TaskPlannerDatabase;

  beforeEach(async () => {
    db = new TaskPlannerDatabase(`test-ssh-db-${Math.random()}`);
    await db.open();
    vi.clearAllMocks();
  });

  it('returns empty array when no SSH configs configured', async () => {
    const configs = await getSshConfigs(db);
    expect(configs).toEqual([]);
  });

  it('saves new SSH configuration into db.settings and stores secret in keyring', async () => {
    const { storeKeyringCredential } = await import('../../src/services/keyringService');

    const config: SshConfig = {
      id: 'ssh-1',
      name: 'WSL Ubuntu',
      host: '127.0.0.1',
      port: 22,
      username: 'ubuntu',
      authType: 'password',
      defaultRemotePath: '/home/ubuntu/repo',
      createdAt: '',
      updatedAt: '',
    };

    await saveSshConfig(config, 'secret_pass123', db);

    const configs = await getSshConfigs(db);
    expect(configs).toHaveLength(1);
    expect(configs[0]!.name).toBe('WSL Ubuntu');
    expect(configs[0]!.host).toBe('127.0.0.1');
    expect(configs[0]!.port).toBe(22);
    expect(configs[0]!.username).toBe('ubuntu');
    expect(configs[0]!.createdAt).toBeDefined();

    expect(storeKeyringCredential).toHaveBeenCalledWith('ssh_secret_ssh-1', 'secret_pass123');
  });

  it('updates existing SSH configuration correctly', async () => {
    const config: SshConfig = {
      id: 'ssh-1',
      name: 'WSL Ubuntu',
      host: '127.0.0.1',
      port: 22,
      username: 'ubuntu',
      authType: 'password',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    await saveSshConfig(config, undefined, db);

    const updatedConfig: SshConfig = {
      ...config,
      name: 'WSL Ubuntu 24.04 LTS',
      port: 2222,
    };

    await saveSshConfig(updatedConfig, undefined, db);

    const configs = await getSshConfigs(db);
    expect(configs).toHaveLength(1);
    expect(configs[0]!.name).toBe('WSL Ubuntu 24.04 LTS');
    expect(configs[0]!.port).toBe(2222);
    expect(configs[0]!.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('retrieves configuration by ID', async () => {
    const config1: SshConfig = {
      id: 'ssh-1',
      name: 'WSL',
      host: 'localhost',
      port: 22,
      username: 'user',
      authType: 'agent',
      createdAt: '',
      updatedAt: '',
    };
    const config2: SshConfig = {
      id: 'ssh-2',
      name: 'Staging Server',
      host: '10.0.0.5',
      port: 22,
      username: 'root',
      authType: 'key_file',
      keyPath: '/Users/test/.ssh/id_rsa',
      createdAt: '',
      updatedAt: '',
    };

    await saveSshConfig(config1, undefined, db);
    await saveSshConfig(config2, undefined, db);

    const found = await getSshConfigById('ssh-2', db);
    expect(found).not.toBeNull();
    expect(found?.name).toBe('Staging Server');
    expect(found?.authType).toBe('key_file');

    const notFound = await getSshConfigById('ssh-unknown', db);
    expect(notFound).toBeNull();
  });

  it('deletes configuration and removes credential from keyring', async () => {
    const { deleteKeyringCredential } = await import('../../src/services/keyringService');

    const config: SshConfig = {
      id: 'ssh-1',
      name: 'WSL',
      host: 'localhost',
      port: 22,
      username: 'user',
      authType: 'password',
      createdAt: '',
      updatedAt: '',
    };

    await saveSshConfig(config, 'secret', db);
    expect(await getSshConfigs(db)).toHaveLength(1);

    await deleteSshConfig('ssh-1', db);
    expect(await getSshConfigs(db)).toHaveLength(0);
    expect(deleteKeyringCredential).toHaveBeenCalledWith('ssh_secret_ssh-1');
  });
});
