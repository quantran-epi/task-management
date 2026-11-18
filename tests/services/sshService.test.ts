import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../src/db';
import {
  getSshConfigs,
  getSshConfigById,
  saveSshConfig,
  deleteSshConfig,
  execRemoteCommand,
  cancelToolCall,
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

// Real @tauri-apps/api/core invoke is a no-op outside Tauri; mock it to observe payloads.
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
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

describe('sshService - cancellable exec transport', () => {
  const config: SshConfig = {
    id: 'ssh-1', name: 'Bastion', host: '127.0.0.1', port: 22,
    username: 'ubuntu', authType: 'password', createdAt: '', updatedAt: '',
  };

  beforeEach(() => vi.clearAllMocks());

  it('passes exactly one callId to ssh_exec_command and no timeout field', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    vi.mocked(invoke).mockResolvedValueOnce({
      stdout: 'ok', stderr: '', exitStatus: 0, finishReason: 'complete',
    });

    await execRemoteCommand(config, 'echo $$ && sql', 'secret-pass', 'call-A');

    expect(invoke).toHaveBeenCalledWith('ssh_exec_command', expect.objectContaining({
      callId: 'call-A',
    }));
    const payload = vi.mocked(invoke).mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('timeoutSeconds');
    expect(payload).not.toHaveProperty('idleTimeoutSeconds');
  });

  it('cancels only the given call id and is idempotent (no config/secret re-sent)', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    vi.mocked(invoke)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);

    expect(await cancelToolCall('call-A')).toBe(true);
    expect(await cancelToolCall('call-A')).toBe(false); // second call: not live → no-op
    expect(await cancelToolCall('never-started')).toBe(false);

    expect(invoke).toHaveBeenNthCalledWith(1, 'cancel_tool_call', { callId: 'call-A' });
    expect(invoke).toHaveBeenNthCalledWith(2, 'cancel_tool_call', { callId: 'call-A' });
    expect(invoke).toHaveBeenNthCalledWith(3, 'cancel_tool_call', { callId: 'never-started' });
    for (const [, payload] of vi.mocked(invoke).mock.calls) {
      expect(Object.keys(payload as object)).toEqual(['callId']);
    }
  });
});
