# Quick Task 261107-0cw Summary: Fix Remote File Explorer State Loss on Toggle

**Task ID:** 261107-0cw
**Date:** 2026-11-06
**Status:** complete

## Summary
Fixed `RemoteGitExplorer` losing folder tree and branch select disabling after collapsing and reopening the file explorer toolwindow.

### Root Cause
1. `RemoteGitExplorer` reloaded branches and root tree via a `useEffect` with dependency `[selectedConfigId, repoPath]`.
2. On remount after toolwindow toggle, `selectedConfigId` and `repoPath` were already restored from `useLayoutStore`, but `sshConfigs` starts empty (`[]`) until `getSshConfigs` resolves asynchronously.
3. On initial render, `selectedConfig` (`sshConfigs.find(...)`) was `undefined`, so `loadBranches` was skipped. When `sshConfigs` loaded, `selectedConfigId` and `repoPath` had not changed, so the effect never re-ran.
4. Consequently, `branches` remained empty (`disabled={branches.length === 0}`), and `treeData` remained empty until the user re-typed or changed `repoPath`.
5. Additionally, the selected branch was not retained across toolwindow unmounts, falling back to default branch.

### Key Changes
- **`src/workbench/store/layoutStore.ts`**:
  - Added `activeRemoteBranch: string` to `LayoutStateValues`, `DEFAULT_LAYOUT_STATE`, and `partialize`.
  - Added `setActiveRemoteBranch` and updated `setActiveRemoteTarget` to persist the selected branch across toolwindow lifecycles.
- **`src/workbench/toolwindows/RemoteGitExplorer.tsx`**:
  - Changed `useEffect` dependencies from `[selectedConfigId, repoPath]` to `[selectedConfig, repoPath]`. When `getSshConfigs` completes and resolves `selectedConfig`, the effect immediately triggers `loadBranches(repoPath.trim())`.
  - Preserved `activeRemoteBranch` as preferred branch during branch discovery and persisted branch changes via `setActiveRemoteBranch`.
- **`src/workbench/__tests__/RemoteGitExplorer.test.tsx`**:
  - Added regression test verifying automatic recovery of branches and folder tree on remount without manual path re-entry.
- **`src/workbench/__tests__/layoutStore.test.ts`**:
  - Added unit test verifying `setActiveRemoteTarget` and `setActiveRemoteBranch`.

## Verification
- `npx vitest run src/workbench/__tests__/RemoteGitExplorer.test.tsx src/workbench/__tests__/layoutStore.test.ts` passed (10/10 tests).
- `npm run build` completed successfully without TypeScript errors.
