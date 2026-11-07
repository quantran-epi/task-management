import { useLayoutStore } from '../store/layoutStore';

/** The subset of `System` the 1-click actions need (D-35). */
export interface SystemActionTarget {
  sshConfigId?: string | null | undefined;
  remoteRepoPath?: string | null | undefined;
  defaultBaseBranch?: string | null | undefined;
}

export const SYSTEM_ACTIONS_DISABLED_REASON =
  'Chưa cấu hình SSH/Repo — mở System Catalog';

const CONTROL_CHARS = /[\x00-\x1f\x7f]/;

/**
 * Shared 1-click Git / Terminal actions (D-35, RESEARCH H5).
 *
 * Both consumers (CR Explorer subsystem menu, Systems Explorer subsystem menu) call this one
 * hook. Store reads happen at call time via `getState()` so a click always sees current state.
 * "Open Git Explorer" activates the existing LEFT `remote_explorer` tool window — there is no
 * bottom `remote_git` id and none is created.
 */
export function useSystemActions() {
  const disabledReason = (system: SystemActionTarget): string | undefined =>
    !system.sshConfigId || !system.remoteRepoPath
      ? SYSTEM_ACTIONS_DISABLED_REASON
      : undefined;

  const openGit = (system: SystemActionTarget): void => {
    if (disabledReason(system)) return;
    const store = useLayoutStore.getState();
    store.setActiveRemoteTarget(
      system.sshConfigId ?? null,
      system.remoteRepoPath ?? '',
      system.defaultBaseBranch ?? undefined
    );
    store.setToolWindowActive('left', 'remote_explorer');
  };

  const openTerminal = (system: SystemActionTarget): void => {
    const repoPath = system.remoteRepoPath ?? '';
    if (!repoPath.startsWith('/') || CONTROL_CHARS.test(repoPath)) {
      throw new Error('Đường dẫn repo không hợp lệ.');
    }
    const store = useLayoutStore.getState();
    store.setPendingTerminalTarget({
      sshConfigId: system.sshConfigId ?? null,
      repoPath,
    });
    store.setToolWindowActive('bottom', 'terminal');
  };

  return { openGit, openTerminal, disabledReason };
}
