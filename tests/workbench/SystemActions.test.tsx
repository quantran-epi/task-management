import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSystemActions } from '../../src/workbench/hooks/useSystemActions';
import { useLayoutStore } from '../../src/workbench/store/layoutStore';

/**
 * Contract for plan 31.2-06 Task 1 (D-35, RESEARCH H5/H6/H7, T-31.2-19).
 *
 * One shared hook drives the 1-click Git / Terminal actions from both the CR Explorer and
 * the Systems Explorer. `openGit` activates the LEFT `remote_explorer` tool window with the
 * subsystem's repo as the active remote target (there is no bottom `remote_git` id);
 * `openTerminal` enqueues a validated repo path for the bottom terminal to `cd` into.
 */
const DISABLED_COPY = 'Chưa cấu hình SSH/Repo — mở System Catalog';

describe('useSystemActions', () => {
  beforeEach(() => {
    localStorage.clear();
    useLayoutStore.getState().resetLayout();
  });

  it('openGit sets the remote target and activates the left Git Explorer', () => {
    const { result } = renderHook(() => useSystemActions());

    result.current.openGit({
      sshConfigId: 'ssh-1',
      remoteRepoPath: '/data/services/smartcard-api',
      defaultBaseBranch: 'develop',
    });

    const state = useLayoutStore.getState();
    expect(state.activeRemoteConfigId).toBe('ssh-1');
    expect(state.activeRemoteRepoPath).toBe('/data/services/smartcard-api');
    expect(state.activeRemoteBranch).toBe('develop');
    expect(state.leftActiveId).toBe('remote_explorer');
  });

  it('openGit switches target on a second call with a different subsystem', () => {
    const { result } = renderHook(() => useSystemActions());

    result.current.openGit({ sshConfigId: 'ssh-1', remoteRepoPath: '/repos/one' });
    result.current.openGit({ sshConfigId: 'ssh-2', remoteRepoPath: '/repos/two' });

    const state = useLayoutStore.getState();
    expect(state.activeRemoteConfigId).toBe('ssh-2');
    expect(state.activeRemoteRepoPath).toBe('/repos/two');
  });

  it('openTerminal enqueues the target and activates the bottom terminal', () => {
    const { result } = renderHook(() => useSystemActions());

    result.current.openTerminal({ sshConfigId: 'ssh-1', remoteRepoPath: '/repos/one' });

    const state = useLayoutStore.getState();
    expect(state.pendingTerminalTarget).toEqual({
      sshConfigId: 'ssh-1',
      repoPath: '/repos/one',
    });
    expect(state.bottomActiveId).toBe('terminal');
  });

  it('disabledReason reports the unconfigured copy only when SSH or repo is missing', () => {
    const { result } = renderHook(() => useSystemActions());

    expect(result.current.disabledReason({ sshConfigId: 'ssh-1' })).toBe(DISABLED_COPY);
    expect(result.current.disabledReason({ remoteRepoPath: '/repos/one' })).toBe(DISABLED_COPY);
    expect(result.current.disabledReason({})).toBe(DISABLED_COPY);
    expect(
      result.current.disabledReason({ sshConfigId: 'ssh-1', remoteRepoPath: '/repos/one' })
    ).toBeUndefined();
  });

  it('openTerminal rejects a non-absolute repo path and enqueues nothing', () => {
    const { result } = renderHook(() => useSystemActions());

    expect(() =>
      result.current.openTerminal({ sshConfigId: 'ssh-1', remoteRepoPath: 'repos/one' })
    ).toThrow('Đường dẫn repo không hợp lệ.');
    expect(useLayoutStore.getState().pendingTerminalTarget).toBeNull();
  });

  it('openTerminal rejects a repo path containing control characters', () => {
    const { result } = renderHook(() => useSystemActions());

    expect(() =>
      result.current.openTerminal({ sshConfigId: 'ssh-1', remoteRepoPath: '/repos/one\nrm -rf /' })
    ).toThrow('Đường dẫn repo không hợp lệ.');
    expect(useLayoutStore.getState().pendingTerminalTarget).toBeNull();
  });
});
