---
slug: 261106-rfe-remote-explorer-picker-and-step2-header-fix
title: Remote Explorer Folder Picker & SDLC Step 2 Header Title Wrap Fix
status: complete
completed: 2026-11-06
---

# Remote Explorer Folder Picker & SDLC Step 2 Header Title Wrap Fix Summary

## Changes Made
1. **Remote SSH Git Explorer Folder Picker** (`src/workbench/toolwindows/RemoteGitExplorer.tsx`):
   - Added browse folder button (`FolderOpenOutlined`) next to remote repo path input.
   - Integrated `RemoteDirectoryBrowserModal` to allow browsing directories over SFTP on remote SSH hosts.
   - Updated `loadBranches` to accept path overrides so selecting a folder immediately triggers branch loading.
   - Added unit test in `src/workbench/__tests__/RemoteGitExplorer.test.tsx` verifying the browse button renders and opens the picker modal.
2. **SDLC Step 2 Header Title Line Break Fix** (`src/components/sdlc/steps/Step2SolutionView.tsx`):
   - Prevented title wrapping with `whiteSpace: 'nowrap'` on `Typography.Title`.
   - Added `flexWrap: 'wrap'` and `gap: 12` to the toolbar container so actions wrap gracefully on narrow viewports without breaking the title text mid-phrase.

## Verification
- `npx vitest run src/workbench/__tests__/RemoteGitExplorer.test.tsx`: 3 passed.
- `npx vitest run tests/unit/sdlc/Step2SolutionView.test.tsx src/components/sdlc/steps/__tests__/Step3CodeGuideView.test.tsx`: 15 passed.
- `npx tsc --noEmit`: 0 errors.
