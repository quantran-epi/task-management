---
phase: 08-optional-encrypted-github-backup
plan: 03
subsystem: settings
tags: [github, web-crypto, backup, restore, aes-gcm, dexie, pwa]

# Dependency graph
requires:
  - phase: 08-optional-encrypted-github-backup
    provides: Web Crypto authenticated encryption, GitHub Contents API client, push orchestration, and conflict modal
provides:
  - executeGitHubBackupPull orchestration downloading and verifying encrypted envelopes
  - In-browser AES-GCM-256 decryption with automatic passphrase prompting via GitHubPassphraseModal
  - Two-stage structural and referential integrity validation via Phase 6 validation engine
  - ImportPreviewModal diff inspection, pre-import safety snapshot, RESTORE keyword protection, and atomic Dexie restore
  - Corrupt payload recovery with raw un-decrypted JSON file download fallback
  - Verified 100% offline independence and local data management decoupling without network or GitHub token
affects: [settings, backup, storage, sync]

# Tech tracking
tech-stack:
  added: []
  patterns: [pull-decrypt-validate pipeline, guarded remote restore with snapshot, raw fallback recovery]

key-files:
  created:
    - src/components/settings/GitHubPassphraseModal.tsx
    - tests/services/github/githubPullRestore.test.ts
    - tests/components/settings/GitHubPassphraseModal.test.tsx
    - tests/views/SettingsView.test.tsx
  modified:
    - src/services/github/types.ts
    - src/services/github/githubSyncService.ts
    - src/services/github/index.ts
    - src/components/settings/GitHubSyncCard.tsx
    - src/views/SettingsView.tsx
    - tests/components/settings/GitHubSyncCard.test.tsx
    - tests/views/PlannerView.test.tsx

key-decisions:
  - "Decrypted remote backup must validate structural and referential integrity using Phase 6 validation engine before touching IndexedDB"
  - "Passphrase prompt modal activates only when in-memory passphrase is missing or incorrect, allowing seamless one-click pull when already entered"
  - "Restoring remote backup executes atomically with pre-import safety snapshot in settings.last_pre_import_snapshot, requiring explicit RESTORE confirmation"
  - "Corrupt remote payloads halt restore with zero local database mutation and provide immediate raw un-decrypted file download for offline diagnostics"
  - "Local operations, weekly capacity configuration, and local JSON export/import operate 100% autonomously without network access or GitHub credentials"

patterns-established:
  - "Pattern: Remote pull orchestration validates envelope markers, decrypts via Web Crypto, and passes to Phase 6 ImportPreviewModal"
  - "Pattern: Safe fallback on corrupt payload with raw file download and screen reader accessible alerts"

requirements-completed: [SYNC-05, SYNC-07]

# Metrics
duration: 25min
completed: 2026-09-27
---

# Phase 8 Plan 03: Remote Pull, Decrypt, Preview Restore & Offline Autonomy Summary

**Remote encrypted backup download, in-browser AES-GCM-256 decryption, two-stage schema validation, ImportPreviewModal diff preview, atomic Dexie restore with pre-import snapshot, raw download fallback, and complete offline autonomy.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-09-27T13:40:00Z
- **Completed:** 2026-09-27T14:05:00Z
- **Tasks:** 3 completed
- **Files modified:** 11

## Accomplishments

- Implemented `executeGitHubBackupPull` to fetch `.task-management/backup.enc.json`, verify semi-transparent envelope markers (`app === 'personal-task-planner'`, `format === 'encrypted-v1'`), decrypt with AES-GCM-256 via Web Crypto, and validate structural and referential integrity.
- Created `GitHubPassphraseModal` to prompt for decryption passphrase on demand, render localized error feedback on decryption failures, and offer `downloadRawEncryptedBackup` for corrupt payload recovery without touching local database tables.
- Integrated remote pull into `GitHubSyncCard` with "Tải từ GitHub" button, and wired flow to `ImportPreviewModal` in `SettingsView`, recording `last_synced_sha` and `last_synced_at` in `db.settings` and displaying `PostRestoreBanner` with snapshot rollback.
- Verified 100% offline independence (SYNC-07): application renders and functions completely without GitHub credentials or internet connection, keeping local task management and JSON export/import fully operational.
- Verified entire test suite of 63 test files and 384 tests passing with zero failures.

## Task Commits

Each task was committed atomically:

1. **Task 1: Remote pull, decryption, and validation service with raw download fallback**
   - `5a8c76e` (test: add failing tests for remote pull, decrypt and validation)
   - `c9b918b` (feat: implement pull and decrypt orchestration with raw download fallback)
2. **Task 2: GitHubPassphraseModal and direct integration with Phase 6 ImportPreviewModal**
   - `9c3e9ac` (feat: implement GitHubPassphraseModal with raw download fallback)
3. **Task 3: Wire "Tải từ GitHub" in GitHubSyncCard, Offline Independence, and SettingsView integration**
   - `4872096` (feat: wire remote backup pull, preview restore and settings integration)

## Files Created/Modified

- `src/services/github/types.ts` - Added `PullBackupResult` interface
- `src/services/github/githubSyncService.ts` - Added `executeGitHubBackupPull`, `GitHubPullError`, and `downloadRawEncryptedBackup`
- `src/services/github/index.ts` - Re-exported pull and restore methods and types
- `src/components/settings/GitHubPassphraseModal.tsx` - Decryption passphrase prompt modal with raw download fallback
- `src/components/settings/GitHubSyncCard.tsx` - Added "Tải từ GitHub" action, passphrase modal connection, and sync state
- `src/views/SettingsView.tsx` - Integrated remote pull with `ImportPreviewModal` and `PostRestoreBanner`
- `tests/services/github/githubPullRestore.test.ts` - Unit tests for pull, envelope checking, decrypt errors, and validation
- `tests/components/settings/GitHubPassphraseModal.test.tsx` - Component tests for passphrase prompt and raw download
- `tests/components/settings/GitHubSyncCard.test.tsx` - Component tests for pull trigger and passphrase prompting
- `tests/views/SettingsView.test.tsx` - Integration tests verifying remote restore, snapshot recording, and offline independence
- `tests/views/PlannerView.test.tsx` - Fixed async timing in test to prevent suite flakiness

## Decisions Made

- Decrypted remote payload is validated using Phase 6 `validateBackupPayload` before preview or database touch (SYNC-05, D-13, D-15).
- If decryption fails due to invalid password or tampered ciphertext, restore halts with zero local database mutation and user is offered a raw encrypted file download for offline diagnostics (SYNC-03, D-16).
- When remote restore is confirmed with keyword `RESTORE`, an atomic pre-import snapshot is taken into `db.settings` and `last_synced_sha` / `last_synced_at` are persisted (SYNC-05, D-15, D-17).
- Application does not enforce or require GitHub credentials at startup or for any core features: offline task planning and local JSON file import/export remain primary and fully decoupled (SYNC-07).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Ant Design paragraph prop error and unused import in test**
- **Found during:** Task 2 verification (`npm run build`)
- **Issue:** `orientation` prop does not exist on `ParagraphProps`, and unused `React` import in test file failed strict lint/typecheck.
- **Fix:** Removed unsupported prop and cleaned unused import.
- **Files modified:** `src/components/settings/GitHubPassphraseModal.tsx`, `tests/components/settings/GitHubPassphraseModal.test.tsx`
- **Verification:** `npm run build` completed with zero TypeScript errors.
- **Committed in:** `4872096`

**2. [Rule 1 - Bug] Async column wait in PlannerView test**
- **Found during:** Full test suite run (`npm test -- --run`)
- **Issue:** Under heavy parallel test load, `day-column-2026-09-28` element was checked with synchronous `getByTestId` before asynchronous re-render finished.
- **Fix:** Switched to `await findByTestId`.
- **Files modified:** `tests/views/PlannerView.test.tsx`
- **Verification:** `npm test -- --run` passed 63/63 test files and 384 tests.
- **Committed in:** `4872096`

---

**Total deviations:** 2 auto-fixed (both minor test/type adjustments).
**Impact on plan:** Zero scope creep; all planned requirements and acceptance criteria satisfied.

## Issues Encountered

None - implementation proceeded according to architectural patterns and security design specifications.

## User Setup Required

None - optional GitHub encrypted sync requires only a user-provided GitHub fine-grained PAT and passphrase entered at runtime.

## Next Phase Readiness

- Phase 8 is complete: all requirements SYNC-01 through SYNC-07 are delivered with full unit and integration test coverage.
- Application supports complete offline operation, local JSON backup/restore with snapshot rollback, and optional encrypted remote backup sync with GitHub.

---
*Phase: 08-optional-encrypted-github-backup*
*Completed: 2026-09-27*

## Self-Check: PASSED
- Artifact `src/services/github/githubSyncService.ts` exists and has 275 lines (> 140 min).
- Artifact `src/components/settings/GitHubPassphraseModal.tsx` exists and has 131 lines (> 70 min).
- Artifact `src/components/settings/GitHubSyncCard.tsx` exists and has 397 lines (> 100 min).
- Artifact `src/views/SettingsView.tsx` exists and has 268 lines (> 180 min).
- Commits `5a8c76e`, `c9b918b`, `9c3e9ac`, `4872096` exist in git history.
- Full test suite passes: 63 test files, 384 tests passed.
- Production build passes: `npm run build` succeeds.
