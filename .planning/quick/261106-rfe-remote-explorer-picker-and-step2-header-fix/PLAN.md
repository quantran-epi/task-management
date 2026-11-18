---
slug: 261106-rfe-remote-explorer-picker-and-step2-header-fix
title: Remote Explorer Folder Picker & SDLC Step 2 Header Title Wrap Fix
created: 2026-11-06
status: in-progress
---

# Remote Explorer Folder Picker & SDLC Step 2 Header Title Wrap Fix

## Problem
1. `RemoteGitExplorer.tsx` in Workbench left tool window only has a manual text input for remote repository path. Users need a visual picker dialog to browse and choose a folder on the remote SSH server. `RemoteDirectoryBrowserModal` already exists and is used in SDLC Step 3.
2. In `Step2SolutionView.tsx`, the header title `Bước 2: Thiết kế giải pháp kiến trúc (SOLUTION.md)` is in an unconstrained flex row with action buttons (`RobotOutlined`, `Segmented`, `CheckOutlined`), causing the text to wrap awkwardly across multiple lines on narrower widths.

## Plan
1. In `src/workbench/toolwindows/RemoteGitExplorer.tsx`:
   - Import `FolderOpenOutlined` and `RemoteDirectoryBrowserModal`.
   - Add state `browserModalOpen: boolean`.
   - Add a browse button next to the repo path input.
   - When user selects folder in modal: set `repoPath`, close modal, and call `loadBranches` with the chosen path.
2. In `src/components/sdlc/steps/Step2SolutionView.tsx`:
   - Make the header toolbar container flexible with `flexWrap: 'wrap'` and `gap: 12`.
   - Add `whiteSpace: 'nowrap'` or clean flex wrapping on Title and tags so the header title does not break mid-phrase.
3. Update tests or run focused vitest checks.
4. Git commit and push to `feature/intellij-workbench`.
