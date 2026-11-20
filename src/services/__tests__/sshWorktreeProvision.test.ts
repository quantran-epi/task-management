import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SshConfig } from '../../types/ssh';

const invokeMock = vi.hoisted(() => vi.fn());
const isTauriAppMock = vi.hoisted(() => vi.fn(() => true));

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));
vi.mock('../../utils/timerPopout', () => ({ isTauriApp: isTauriAppMock }));

import {
  deriveRemoteWorktreePath,
  deriveWorktreeBranch,
  provisionWorktree,
  requireProvisionedWorktree,
  worktreeUnavailableRefusal,
} from '../sshWorktreeService';

const REPO = '/home/dev/projects/task-management';
const CONFIG: SshConfig = {
  id: 'ssh-1',
  name: 'dev',
  host: '10.0.0.1',
  port: 22,
  username: 'dev',
  authType: 'password',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('deterministic remote worktree derivation', () => {
  it('derives identical path and branch for safe session keys', () => {
    expect(deriveRemoteWorktreePath(REPO, 'session-42')).toBe(
      `${REPO}/.taskmate-worktrees/agent-developer-session-42`
    );
    expect(deriveWorktreeBranch('session-42')).toBe('taskmate/agent-developer-session-42');
  });

  it('strips trailing slashes and sanitizes unsafe session keys', () => {
    const safe = deriveRemoteWorktreePath(`${REPO}///`, '../a b;rm -rf /');
    expect(safe).toBe(`${REPO}/.taskmate-worktrees/agent-developer----a-b-rm--rf--`);
    expect(deriveWorktreeBranch('../a b;rm -rf /')).toBe('taskmate/agent-developer----a-b-rm--rf--');
  });

  it('caps the sanitized key at 40 characters', () => {
    const long = 'a'.repeat(80);
    expect(deriveRemoteWorktreePath(REPO, long).split('agent-developer-')[1]).toHaveLength(40);
  });
});

describe('provisionWorktree', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    isTauriAppMock.mockReturnValue(true);
  });

  it('invokes only the Rust provisioning command and returns the descriptor', async () => {
    const descriptor = {
      sshConfigId: 'ssh-1',
      remoteRepoPath: REPO,
      remoteWorktreePath: deriveRemoteWorktreePath(REPO, 's1'),
      branch: deriveWorktreeBranch('s1'),
    };
    invokeMock.mockResolvedValue(descriptor);

    const result = await provisionWorktree({
      sshConfigId: 'ssh-1',
      remoteRepoPath: REPO,
      sessionKey: 's1',
      secret: 'pw',
      config: CONFIG,
    });

    expect(result).toEqual(descriptor);
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith('ssh_worktree_provision', {
      config: CONFIG,
      secret: 'pw',
      remoteRepoPath: REPO,
      sessionKey: 's1',
      baseRef: null,
    });
  });

  it('refuses outside Tauri without any SSH invocation', async () => {
    isTauriAppMock.mockReturnValue(false);
    await expect(
      provisionWorktree({
        sshConfigId: 'ssh-1',
        remoteRepoPath: REPO,
        sessionKey: 's2',
        config: CONFIG,
      })
    ).rejects.toThrow(/Desktop Tauri/);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('never calls a raw write primitive', async () => {
    invokeMock.mockResolvedValue({ remoteWorktreePath: 'x' });
    await provisionWorktree({
      sshConfigId: 'ssh-1',
      remoteRepoPath: REPO,
      sessionKey: 's2',
      config: CONFIG,
    });
    expect(invokeMock.mock.calls.map((call) => call[0])).not.toContain('ssh_write_file');
  });
});

describe('session start gating', () => {
  it('exports a truthful WORKTREE_NOT_AVAILABLE refusal', () => {
    expect(worktreeUnavailableRefusal().code).toBe('WORKTREE_NOT_AVAILABLE');
    expect(worktreeUnavailableRefusal().message.toLowerCase()).toContain('worktree');
  });

  it('refuses activation when no provisioned descriptor exists', () => {
    expect(() => requireProvisionedWorktree(undefined)).toThrow(/WORKTREE_NOT_AVAILABLE/);
    expect(() =>
      requireProvisionedWorktree({ sshConfigId: CONFIG.id, remoteRepoPath: REPO, remoteWorktreePath: '', branch: 'b' })
    ).toThrow(/WORKTREE_NOT_AVAILABLE/);
  });
});
