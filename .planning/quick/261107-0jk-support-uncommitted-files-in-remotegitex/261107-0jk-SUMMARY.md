# Quick Task 261107-0jk Summary: Support Uncommitted Files & Terminal Tab Rename

## One-liner
Integrated uncommitted/untracked status badges into RemoteGitExplorer with working-copy fallback reading, and added inline terminal tab renaming on double-click in BottomToolWindow.

## Completed Tasks

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Support uncommitted files in RemoteGitExplorer tree with badges and untracked file reader fallback | 9963ccdb | `src/services/gitRemoteTreeService.ts`, `src/types/gitRemote.ts`, `src/workbench/toolwindows/RemoteGitExplorer.tsx`, `src/services/__tests__/gitRemoteTreeService.test.ts`, `src/workbench/__tests__/RemoteGitExplorer.test.tsx` |
| 2 | Add inline rename tab feature to xterm tabs in BottomToolWindow | 70ff2874 | `src/workbench/toolwindows/BottomToolWindow.tsx`, `src/workbench/__tests__/BottomToolWindow.test.tsx` |

## Verification Details

- Focused tests passed:
  `npx vitest run src/workbench/__tests__/RemoteGitExplorer.test.tsx src/workbench/__tests__/BottomToolWindow.test.tsx src/services/__tests__/gitRemoteTreeService.test.ts` (14/14 passed)
- Production build & typecheck passed:
  `npm run build` completed with zero TypeScript errors.

## Threat Mitigations Applied

- **T-quick-01 (Tampering / Injection):** `getRemoteWorkingFileContent` strictly uses `escapeShellArg` for both remote `repoPath` and `filePath` before invoking `cat -- <targetFile>` over SSH.
- **T-quick-02 (Information Disclosure):** Inline terminal tab titles live strictly in React ephemeral state, preventing credential leak into disk persistence.

## Self-Check: PASSED
- [x] Files created and modified exist on disk
- [x] Commits 9963ccdb and 70ff2874 exist in git history
- [x] All automated tests pass
- [x] Zero type errors on `npm run build`
