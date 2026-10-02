# Quick Task 261002-vqg: Open Local Folder Link in File Explorer Summary

## Overview

Added system file explorer launch capability for local folder/file links attached to tasks and projects in the desktop Tauri environment, with clipboard fallback in web browsers. Added native folder/file browsing directly inside `TaskDrawer` and `ProjectModal` link forms.

## Key Changes

### Native Tauri Commands (`src-tauri/src/jira_proxy.rs`, `src-tauri/src/lib.rs`)
- `open_local_path(path: String)`: Strips `file://` scheme and handles Windows drive letters, verifies path existence, and invokes `open::that` to open the directory/file in Finder/Explorer without spawning shell subprocesses (T-VQG-01 mitigation).
- `select_local_folder()`: Uses native `rfd::FileDialog` to pick directories.
- `select_local_file()`: Uses native `rfd::FileDialog` to pick files.
- Registered all commands in `tauri::generate_handler!`.

### Frontend Link Utility (`src/utils/documentLinks.ts`)
- `isLocalPath(urlOrPath: string)`: Matches `file://`, `/...`, `[A-Za-z]:/...`, and `\\...`.
- `normalizeLocalPath(urlOrPath: string)`: Cleans `file://` prefix and Windows path prefixes.
- `openDocumentLink(urlOrPath: string)`:
  - In desktop Tauri: invokes `open_local_path` for local paths, `open_external_url` for web URLs.
  - In browser: copies local path to clipboard with informative Ant Design feedback, opens web URLs via `window.open`.
- `browseLocalFolder()` & `browseLocalFile()`: Invokes native file dialogs when running in Tauri.

### Form Fields & Tables
- `src/components/tasks/TaskDrawer.tsx` & `src/components/projects/ProjectModal.tsx`:
  - Added folder browsing icon button (`FolderOpenOutlined`) per link row to select a folder from disk.
  - Added test-open button (`ExportOutlined`) per link row to verify opening directly from the form.
  - Added "Chọn thư mục từ máy" action button next to "Thêm liên kết" to pick and append directories in one click.
- `src/components/tasks/TaskTable.tsx` & `src/components/projects/ProjectTable.tsx`:
  - Document link popovers now differentiate local paths (`FolderOpenOutlined`, "Mở trong File Explorer") from web URLs (`LinkOutlined`, "Mở liên kết web").
  - Clicking document links calls `openDocumentLink` without navigating away.

## Commits

1. `0f3c226` feat(tauri): add open_local_path and directory browsing commands with documentLinks utility
2. `2b866cf` feat(links): add local machine browsing and link testing to TaskDrawer and ProjectModal
3. `39bac40` feat(links): connect openDocumentLink with local folder detection in TaskTable and ProjectTable

## Verification

Targeted tests passed:
- `tests/utils/documentLinks.test.ts` (13 tests)
- `tests/components/TaskTable.test.tsx` (8 tests)
- `tests/components/ProjectMilestoneModalAndTable.test.tsx` (6 tests)
- `cargo check --manifest-path src-tauri/Cargo.toml` passed with 0 errors.

## Self-Check: PASSED
- `src-tauri/src/jira_proxy.rs`: FOUND
- `src-tauri/src/lib.rs`: FOUND
- `src/utils/documentLinks.ts`: FOUND
- `src/components/tasks/TaskDrawer.tsx`: FOUND
- `src/components/projects/ProjectModal.tsx`: FOUND
- `src/components/tasks/TaskTable.tsx`: FOUND
- `src/components/projects/ProjectTable.tsx`: FOUND
- `tests/utils/documentLinks.test.ts`: FOUND
- Commit `0f3c226`: FOUND
- Commit `2b866cf`: FOUND
- Commit `39bac40`: FOUND
