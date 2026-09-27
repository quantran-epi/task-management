# Phase 8: Optional Encrypted GitHub Backup - Context

**Gathered:** 2026-09-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 8 delivers optional, manual, browser-side encrypted backup upload and restore via the GitHub Contents API. It combines native Web Crypto (PBKDF2/AES-GCM-256) authenticated encryption with runtime memory-only secrets, remote SHA conflict detection, and direct integration with existing local backup preview and snapshot rollback mechanisms.

Requirements covered: SYNC-01, SYNC-02, SYNC-03, SYNC-04, SYNC-05, SYNC-06, SYNC-07.

</domain>

<decisions>
## Implementation Decisions

### Credentials & Repo Setup
- **D-01:** Target Repository Metadata in IndexedDB:
  - Repository target information (owner, repo name, branch) is stored in the local `settings` table (IndexedDB) so the user does not need to retype repository paths across sessions.
- **D-02:** Secrets Stored in Runtime Session Memory:
  - GitHub fine-grained Personal Access Token (PAT) and encryption passphrase are held exclusively in runtime memory (via a React Context / in-memory singleton provider).
  - Credentials are automatically purged upon tab refresh or window close, and are strictly prevented from entering IndexedDB, localStorage, sessionStorage, cookies, console logs, or deployed bundles.
- **D-03:** Explicit Clear Session Control:
  - The UI provides a dedicated "Xóa phiên kết nối (Clear Session)" button allowing the user to immediately purge in-memory credentials at any time without reloading the page.
- **D-04:** Settings UI Integration:
  - GitHub backup management is integrated directly into the 'Sao lưu & Dữ liệu' (`data`) tab of `SettingsView`, coexisting smoothly with local JSON export/import cards.
- **D-05:** Pre-flight Connection & Permission Test:
  - A "Kiểm tra kết nối" button issues a pre-flight GET request to the GitHub Contents API to verify token validity, branch existence, and `contents:read` / `contents:write` permissions, and surfaces current remote file metadata (presence, SHA, size, and last modified date).

### Conflict & Overwrite UX
- **D-06:** Pre-flight SHA Check before Upload:
  - Prior to pushing an encrypted backup, the application executes a lightweight pre-flight GET request to retrieve the current remote file SHA and compare it with the last known SHA before generating and transmitting heavy payloads.
- **D-07:** Interactive Conflict Modal on SHA Mismatch:
  - If the remote SHA differs from the expected SHA (or upon receiving an HTTP 409 Conflict), automatic overwrite is halted. The app displays an accessible conflict alert modal offering three explicit choices:
    1. "Tải và xem trước bản remote (Pull & Preview)"
    2. "Ghi đè bản remote bằng dữ liệu máy này (Force Overwrite)"
    3. "Hủy bỏ (Cancel)"
- **D-08:** Protected Force Overwrite with 'OVERWRITE' Keyword:
  - To prevent catastrophic accidental data loss on remote, the "Ghi đè bản remote" action is disabled until the user explicitly types the keyword `OVERWRITE` into a confirmation input (mirroring the `RESTORE` pattern in Phase 6 and `DELETE` in `ResetDbModal`).
- **D-09:** Graceful Initial File Creation:
  - When the remote file `.task-management/backup.enc.json` does not exist (pre-flight GET returns HTTP 404), the application identifies it as a first-time setup, displays "Chưa có bản sao lưu trên GitHub", and issues a PUT request without a `sha` parameter to cleanly initialize the file.

### Encrypted Payload Format
- **D-10:** Semi-Transparent Encrypted Envelope:
  - Remote file `.task-management/backup.enc.json` is formatted as a semi-transparent JSON envelope:
    ```ts
    {
      app: 'personal-task-planner',
      format: 'encrypted-v1',
      schemaVersion: 1,
      exportedAt: string, // ISO 8601 timestamp
      crypto: {
        algorithm: 'AES-GCM',
        keyLength: 256,
        kdf: 'PBKDF2',
        kdfParams: {
          hash: 'SHA-256',
          iterations: 600000,
          salt: string // Base64 (16 bytes)
        },
        iv: string // Base64 (12 bytes / 96-bit)
      },
      ciphertext: string // Base64 AES-GCM ciphertext + 128-bit auth tag
    }
    ```
  - Enables the app to verify file origin, format version, and backup timestamp before prompting for the passphrase.
- **D-11:** OWASP-Standard Key Derivation:
  - PBKDF2 key derivation utilizes 600,000 iterations of HMAC-SHA256 with a 16-byte cryptographically secure random salt (`crypto.getRandomValues`) to derive an AES-GCM 256-bit encryption key.
- **D-12:** Standard Base64 Encoding:
  - All binary cryptographic buffers (salt, 96-bit IV, ciphertext + authentication tag) are encoded as standard Base64 strings, perfectly aligning with GitHub Contents API transport.
- **D-13:** Reusing Phase 6 Backup Payload (Uncompressed):
  - Ciphertext decrypts to the standard `BackupEnvelope` containing all 6 domain tables (`projects`, `milestones`, `tasks`, `capacityRules`, `capacityOverrides`, `plannedAllocations`) exported via `exportBackupPayload`. No compression dependency is added, honoring YAGNI while maintaining typical payload sizes well below the 1MB GitHub Contents API threshold.

### Remote Restore Flow
- **D-14:** Smart Decryption Passphrase Prompt:
  - When fetching a remote backup, the app attempts decryption with the current in-memory passphrase if available. If absent or if decryption fails (`OperationError` indicating incorrect passphrase), a prompt modal requests the passphrase.
- **D-15:** Direct Integration with Phase 6 ImportPreviewModal:
  - Once decrypted and parsed, the payload flows directly into the existing `ImportPreviewModal` from Phase 6, showing comparative record counts, capturing an automatic pre-import safety snapshot (`settings.last_pre_import_snapshot`), requiring the `RESTORE` keyword, and executing an atomic Dexie transaction.
- **D-16:** Tamper & Decrypt Failure Handling with Raw File Download:
  - Any decryption or integrity validation failure (corrupted envelope, invalid MAC tag, schema violation) halts the restore with zero mutation to IndexedDB and provides a "Tải tệp thô về máy" download action for offline diagnostics.
- **D-17:** Sync Status & History Tracking:
  - Displays connection badge, 7-character truncated remote SHA, and last sync timestamp on the GitHub card; logs sync actions into `backupMetadata` to maintain an audit trail in the Settings view.

### Claude's Discretion
- Implementation details of GitHub Contents API caller: use native `fetch` with standard GitHub API headers (`Accept: application/vnd.github.v3+json`, `Authorization: Bearer <token>`) to avoid unnecessary npm dependency overhead.
- UI component decomposition: `GitHubConfigCard`, `GitHubSyncCard`, `GitHubConflictModal`, `GitHubPassphraseModal` cleanly separated and co-located in `src/components/settings/`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Specifications & Constraints
- `CLAUDE.md` — Stack recommendations, Web Crypto API guidelines, GitHub Contents API constraints, and memory-only secret rules
- `.planning/PROJECT.md` — Core constraints, architectural decisions, and key technical stack
- `.planning/REQUIREMENTS.md` — SYNC-01 through SYNC-07 requirements definitions

### Existing Backup & Security Services
- `src/services/backup/exportBackup.ts` — Pure export routine generating standard `BackupEnvelope`
- `src/services/backup/validateBackup.ts` — Zod schema validation and referential integrity checks
- `src/services/backup/restoreBackup.ts` — Pre-import snapshot, atomic Dexie transaction restore, and rollback logic
- `src/types/backup.ts` — Core interfaces for `BackupEnvelope`, `BackupTableData`, `SnapshotData`, and validation models

### Existing Settings & UI Components
- `src/views/SettingsView.tsx` — Settings view structure, active tab management (`capacity` vs `data`), and notification hooks
- `src/components/settings/ImportPreviewModal.tsx` — Comparison preview modal, validation error rendering, and `RESTORE` confirmation input
- `src/components/settings/BackupExportCard.tsx` — Export card pattern and backup metadata display
- `src/components/settings/BackupImportCard.tsx` — File dropzone and validation trigger pattern

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `exportBackupPayload(db)`: Can be called directly to retrieve the unencrypted domain payload prior to AES-GCM encryption.
- `validateBackupPayload(payload)`: Can be called directly on decrypted JSON to guarantee structural and referential integrity before preview.
- `restoreBackupPayload(db, envelope)`: Handles pre-import safety snapshot, clears domain tables, and performs atomic restore in a Dexie transaction.
- `ImportPreviewModal`: Modal component ready to accept any validated `BackupEnvelope` and provide full diff preview and rollback guarantees.
- `announceToScreenReader`: Centralized ARIA live region dispatcher for accessible status announcements on sync/restore.

### Established Patterns
- **Memory-only secret state:** Kept in React state / Context, never synchronized to persistent web storage or database.
- **Confirmation keywords:** Dangerous actions require typing exact keywords (`DELETE` in ResetDbModal, `RESTORE` in ImportPreviewModal, `OVERWRITE` in GitHubConflictModal).
- **Zod validation at trust boundaries:** Runtime schema enforcement before touching application state.
- **Atomic Dexie transactions:** All multi-table write operations executed within `db.transaction('rw', ...)` blocks.

### Integration Points
- `src/views/SettingsView.tsx`: Mount `GitHubConfigCard` and `GitHubSyncCard` inside the `data` tab.
- `src/types/models.ts`: Storage of non-secret repo target in `settings` table (`github_owner`, `github_repo`, `github_branch`).
- `src/services/crypto/`: New native Web Crypto module for PBKDF2 key derivation and AES-GCM encryption/decryption.
- `src/services/github/`: New GitHub Contents API client for reading and writing `.task-management/backup.enc.json`.

</code_context>

<specifics>
## Specific Ideas
- User specifically requested: "discuss in vietnamese, each question has a brief explanation, preserve important technical keyword" — technical terms (PAT, SHA, PBKDF2, AES-GCM, Base64, etc.) are explicitly retained in all specifications.
- Pre-flight GET request before PUT prevents blind collisions and saves bandwidth by inspecting SHA and file existence early.
- Direct reuse of `ImportPreviewModal` gives remote restore identical safety guarantees (comparison table, safety snapshot, undo capability) as local file restore.

</specifics>

<deferred>
## Deferred Ideas
None — discussion stayed strictly within the phase scope of manual encrypted GitHub backup and restore.

</deferred>

---

*Phase: 8-Optional Encrypted GitHub Backup*
*Context gathered: 2026-09-27*
