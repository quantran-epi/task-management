---
phase: 08-optional-encrypted-github-backup
plan: 02
subsystem: sync
tags: [github-api, encrypted-backup, conflict-detection, web-crypto, push-orchestration]
requires: [08-01]
provides: [08-03]
key-files:
  created:
    - src/services/github/types.ts
    - src/services/github/githubApi.ts
    - src/services/github/githubSyncService.ts
    - src/services/github/index.ts
    - src/components/settings/GitHubConflictModal.tsx
    - src/components/settings/GitHubSyncCard.tsx
    - tests/services/github/githubApi.test.ts
    - tests/services/github/githubSyncService.test.ts
    - tests/components/settings/GitHubConflictModal.test.tsx
    - tests/components/settings/GitHubSyncCard.test.tsx
  modified:
    - src/views/SettingsView.tsx
decisions:
  - "[Phase 08]: Native fetch for GitHub Contents API with Bearer token authentication and token redaction from errors (T-08-05)"
  - "[Phase 08]: Pre-flight GET checks current blob SHA against last_synced_sha before payload assembly and upload (D-06, SYNC-06)"
  - "[Phase 08]: Guarded conflict modal requires exact OVERWRITE keyword to prevent destructive accidental remote overwrites (D-08, T-08-08)"
  - "[Phase 08]: Push orchestrator automatically creates .task-management/backup.enc.json on HTTP 404 without prior SHA (D-09)"
  - "[Phase 08]: Record last_synced_sha and last_synced_at into db.settings and log audit trail to db.backupMetadata (D-17)"
metrics:
  duration: 8m
  completed_date: "2026-09-27"
---

# Phase 08 Plan 02: GitHub Contents API Client & Push Orchestration Summary

Native fetch GitHub Contents API client, pre-flight remote SHA collision check, and encrypted backup push orchestration with guarded OVERWRITE keyword modal.

## Overview

Plan 02 delivered the automated push pipeline for uploading encrypted client-side backups to GitHub (`.task-management/backup.enc.json`) and detecting remote collisions before transmitting data:
1. **GitHub Contents API Client (`src/services/github/githubApi.ts`):** Native `fetch` client implementing GET metadata query, PUT file upload, and pre-flight connection testing with strict token redaction across all error surfaces.
2. **Interactive Conflict Resolution Modal (`src/components/settings/GitHubConflictModal.tsx`):** Guarded modal presenting 7-character truncated remote and local SHAs, providing Pull & Preview and Cancel choices, and strictly locking Force Overwrite behind typing the keyword `OVERWRITE`.
3. **Backup Push Orchestrator (`src/services/github/githubSyncService.ts`):** Complete workflow exporting 6 business tables, encrypting with AES-GCM-256 / PBKDF2 (600,000 iterations), validating remote SHA via pre-flight check, pushing to GitHub, updating `last_synced_sha` / `last_synced_at` in `db.settings`, and logging to `db.backupMetadata`.
4. **UI Integration (`src/components/settings/GitHubSyncCard.tsx`):** Ant Design card mounted in SettingsView Data tab displaying connection tag, last sync timestamp, and action triggers for testing connection and pushing backup.

## Key Changes

### 1. GitHub API Client (`src/services/github/githubApi.ts`, `src/services/github/types.ts`)
- Defined `GitHubConfig`, `RemoteFileMetadata`, `UploadBackupResult`, and `SyncStatus`.
- Standardized file path at `.task-management/backup.enc.json`.
- `fetchRemoteBackupMetadata`: Handles HTTP 404 cleanly by returning `{ exists: false }` per D-09, strips whitespace from incoming Base64 payloads, and redacts tokens from error messages.
- `uploadEncryptedBackup`: Sends PUT requests with Base64 content, branch name, and commit message; attaches `sha` parameter only for updates; throws `CONFLICT_409` on HTTP 409.
- `testGitHubConnection`: Validates PAT permissions, branch existence, and surfaces remote SHA truncated to 7 characters per D-05.

### 2. Conflict Detection Modal (`src/components/settings/GitHubConflictModal.tsx`)
- Warning Alert comparing 7-character truncated remote and local SHA hashes per D-07, D-17.
- Three explicit actions: "Hủy bỏ", "Tải và xem trước bản remote", and "Ghi đè bản remote bằng dữ liệu máy này".
- Destructive Force Overwrite button strictly disabled until input exactly matches `OVERWRITE` per D-08.
- Screen reader announcements on conflict alert modal display.

### 3. Push Orchestrator Service (`src/services/github/githubSyncService.ts`)
- Pre-flight check via GET before generating and transmitting heavy payloads per D-06.
- Comparison of remote SHA with expected local SHA; throws `GitHubSyncConflictError` on mismatch unless `forceOverwrite` is true.
- Exports local domain tables via `exportBackupPayload`, encrypts via `encryptPayload`, and encodes to Base64 via `utf8ToBase64`.
- On successful upload, updates `last_synced_sha` and `last_synced_at` in `db.settings` within a Dexie transaction.

### 4. GitHub Sync Card UI (`src/components/settings/GitHubSyncCard.tsx`, `src/views/SettingsView.tsx`)
- Displays authentication status, 7-char truncated SHA, and last synced timestamp.
- Triggers connection test and backup push with loading and error states.
- Surfaces `GitHubConflictModal` on SHA conflict or concurrent 409 conflict.
- Integrated into `SettingsView.tsx` under the Data tab right below `GitHubConfigCard`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated optional property types for exactOptionalPropertyTypes compliance**
- **Found during:** Task 3 build verification (`npm run build`)
- **Issue:** TypeScript compiler with `exactOptionalPropertyTypes: true` flagged `remoteSha: string | undefined` as incompatible with `remoteSha?: string`.
- **Fix:** Explicitly declared `?: string | undefined` on `RemoteFileMetadata`, `GitHubConflictModalProps`, and `GitHubSyncConflictError` properties.
- **Files modified:** `src/services/github/types.ts`, `src/services/github/githubApi.ts`, `src/services/github/githubSyncService.ts`, `src/components/settings/GitHubConflictModal.tsx`
- **Commit:** `5d36732`

## Known Stubs

- `GitHubSyncCard.tsx:258`: `onPullAndPreview` notification callback informs the user that remote restore/pull will be available in the next plan. This is intentional as Plan 03 is dedicated to Pull & Decrypt remote backup restore.

## Threat Flags

None. Threat mitigations from `<threat_model>` fully implemented:
- T-08-05: Redacted token from error messages in `githubApi.ts`.
- T-08-06: Pre-flight GET checks current blob SHA before pushing.
- T-08-07: Logged backup action in `db.backupMetadata` and `db.settings`.
- T-08-08: Protected force overwrite behind `OVERWRITE` keyword.

## Self-Check: PASSED

1. Created files exist:
   - `src/services/github/types.ts`: FOUND
   - `src/services/github/githubApi.ts`: FOUND
   - `src/services/github/githubSyncService.ts`: FOUND
   - `src/services/github/index.ts`: FOUND
   - `src/components/settings/GitHubConflictModal.tsx`: FOUND
   - `src/components/settings/GitHubSyncCard.tsx`: FOUND
   - `tests/services/github/githubApi.test.ts`: FOUND
   - `tests/services/github/githubSyncService.test.ts`: FOUND
   - `tests/components/settings/GitHubConflictModal.test.tsx`: FOUND
   - `tests/components/settings/GitHubSyncCard.test.tsx`: FOUND
2. Commits exist:
   - `4ce4952`: test(08-02): add failing tests for GitHub API client
   - `ed7381b`: feat(08-02): implement GitHub Contents API client with pre-flight check
   - `b45184f`: test(08-02): add failing tests for GitHubConflictModal
   - `3a9051e`: feat(08-02): implement GitHubConflictModal with guarded OVERWRITE keyword
   - `5d36732`: feat(08-02): implement backup push orchestration and GitHubSyncCard UI
