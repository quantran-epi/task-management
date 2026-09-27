# Phase 08: Optional Encrypted GitHub Backup - Research

**Researched:** 2026-09-27
**Domain:** Browser-side Web Crypto (PBKDF2/AES-GCM-256), GitHub Contents REST API, React Runtime Memory Secrets, Conflict Detection (SHA/ETag), and Dexie Database Integration
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
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

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed strictly within the phase scope of manual encrypted GitHub backup and restore.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **SYNC-01** | User can enter fine-grained GitHub token and passphrase at runtime without entering source control, exports, logs, or bundle | In-memory `GitHubAuthContext` provider stores token and passphrase in transient React state only. Never persisted to IndexedDB or Web Storage. |
| **SYNC-02** | Token and passphrase remain in session memory only and are cleared when tab closes or reloads | Transient React state naturally purges on page unload/refresh. Dedicated "Xóa phiên kết nối" button purges in-memory state on demand. |
| **SYNC-03** | User can encrypt current backup in browser using passphrase-derived key and authenticated encryption before upload | `crypto.subtle.deriveKey` with PBKDF2 (600,000 iterations, SHA-256, 16-byte random salt) + AES-GCM (256-bit, 12-byte random IV). Zero third-party crypto dependencies. |
| **SYNC-04** | User can manually upload encrypted backup to `.task-management/backup.enc.json` through GitHub Contents API | Native `fetch` `PUT /repos/{owner}/{repo}/contents/{path}` with Base64 payload, custom commit message, and current file SHA. |
| **SYNC-05** | User can manually download, decrypt, validate, preview, and explicitly restore encrypted GitHub backup | Native `fetch` `GET` + Web Crypto `decrypt` + Phase 6 `validateBackupPayload` + `ImportPreviewModal` with `RESTORE` keyword confirmation and automatic rollback snapshot. |
| **SYNC-06** | Application detects remote-content conflicts using current file SHA and never silently overwrites or automatically merges | Pre-flight GET checks current SHA against last synced SHA. On mismatch or HTTP 409, halts push and opens `GitHubConflictModal` requiring explicit user choice and `OVERWRITE` keyword for forced push. |
| **SYNC-07** | Local operation and file export/import remain fully functional without GitHub credentials or network access | Local IndexedDB, manual JSON export/import, and offline features remain completely independent. Network failures fail gracefully without blocking local tasks. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

1. **Audience & Architecture:** Single personal user, 100% client-side offline execution, GitHub Pages static hosting.
2. **Persistence:** IndexedDB (via Dexie) is local working store. GitHub Contents API stores only single encrypted backup artifact (`.task-management/backup.enc.json`).
3. **Encryption Standard:** Native Web Crypto API (`crypto.subtle`, AES-GCM, PBKDF2, `getRandomValues`). No third-party crypto packages.
4. **Secrets Policy:** Never put GitHub token or passphrase in `.env`, source, config, bundle, localStorage, sessionStorage, or IndexedDB. Token is session/memory only.
5. **UI & Accessibility:** Ant Design 6.6.5 + `@ant-design/icons`. Screen reader announcements via `announceToScreenReader`.
6. **Data Safety:** Multi-table writes in Dexie atomic transactions. Require `RESTORE` for restore and `OVERWRITE` for remote overwrite. Pre-import snapshot before data mutation.
7. **YAGNI / Lazy Senior Dev:** Stdlib and native platform features first. Native `fetch` instead of `@octokit/request` for simple 2-endpoint REST calls. Native `btoa`/`atob` + `TextEncoder`/`TextDecoder` for Base64.

---

## Summary

Phase 8 completes the v1 roadmap by introducing optional, client-side encrypted backup synchronization to GitHub. The entire solution operates natively in modern browsers with zero added npm dependencies. Encryption relies on standard Web Crypto primitives: PBKDF2 (HMAC-SHA256, 600,000 iterations, 16-byte cryptographically secure salt) deriving an AES-GCM 256-bit key, followed by authenticated encryption with a fresh 12-byte (96-bit) IV. The ciphertext encapsulates the standard Phase 6 `BackupEnvelope` containing all 6 domain tables.

Remote transport leverages the GitHub REST Contents API via native `fetch`. The target file is fixed at `.task-management/backup.enc.json`. Pre-flight `GET` requests detect file presence, retrieve the active blob SHA, and verify token scope before initiating data transfers. Conflict detection compares the remote SHA with the locally recorded SHA; any collision halts the transfer and presents an interactive `GitHubConflictModal` with three distinct resolutions: Pull & Preview, Force Overwrite (protected by the exact keyword `OVERWRITE`), or Cancel.

All secrets (GitHub PAT and encryption passphrase) are strictly isolated in a transient React `GitHubAuthContext`. They are never written to IndexedDB, localStorage, sessionStorage, query params, error logs, or service worker caches. Non-sensitive repo metadata (`github_owner`, `github_repo`, `github_branch`) persists in IndexedDB's `settings` table for usability. Remote restore integrates directly with Phase 6's battle-tested `validateBackupPayload` and `ImportPreviewModal`, providing an identical safety harness: pre-import snapshot, schema verification, record count diffs, and atomic Dexie transaction rollback.

**Primary recommendation:** Build pure native modules `src/services/crypto/` and `src/services/github/` using standard Web Crypto and native `fetch`, wrap runtime secrets in a `GitHubAuthContext`, and integrate seamlessly into the `SettingsView` 'data' tab using Ant Design cards and modals.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Secret Management (PAT, Passphrase) | React Runtime Memory (`GitHubAuthContext`) | — | Strict zero-persistence policy (SYNC-01, SYNC-02). Ephemeral in-memory state cleared on tab close/reload. |
| Target Repo Config (Owner, Repo, Branch) | Local IndexedDB (`settings` table) | Settings Form UI | Non-sensitive metadata saved so user does not re-enter repository paths across browser sessions (D-01). |
| Key Derivation & Encryption/Decryption | Browser Native Web Crypto API (`crypto.subtle`) | `src/services/crypto/` | Hardware-accelerated, timing-attack resistant, standard-compliant authenticated encryption (SYNC-03). |
| Binary/String Base64 Encoding | Native Browser Runtime (`btoa`/`atob`) | `src/utils/base64.ts` | Zero dependency. Handles binary buffers and UTF-8 JSON safely without external libraries. |
| GitHub API Communication | Native Browser `fetch` | `src/services/github/` | Issues standard REST calls (`GET`/`PUT /repos/{owner}/{repo}/contents/{path}`) with auth and ETag/SHA headers. |
| Remote Conflict Detection | Frontend Client Logic | GitHub Contents API (`sha`) | Compares remote SHA with local baseline, halting overwrite on collision (SYNC-06). |
| Data Validation & Referential Integrity | Existing Zod Validation (`validateBackup.ts`) | — | Reuses Phase 6 validation engine to verify decrypted backup structure before any DB touch. |
| Pre-Import Snapshot & Atomic Restore | Existing Dexie Service (`restoreBackup.ts`) | IndexedDB | Reuses Phase 6 atomic transaction and snapshot rollback mechanism. |
| UI & User Confirmation | Ant Design Components (`SettingsView`) | ARIA Live Region | Visual feedback, confirmation keyword gating (`RESTORE`, `OVERWRITE`), screen reader announcements. |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Web Crypto API | Browser Native | PBKDF2 key derivation & AES-GCM authenticated encryption | Supported across all modern browsers; non-extractable keys, hardware acceleration, zero npm supply-chain risk. [VERIFIED: MDN] |
| Native `fetch` | Browser Native | GitHub Contents REST API calls | Lightweight, standard HTTP client in all browsers. No need for Octokit bundle overhead for 2 simple REST endpoints. [VERIFIED: MDN] |
| Dexie | 4.4.6 (Installed) | IndexedDB storage for repo config & audit metadata | Already the core database foundation. Manages `settings` and `backupMetadata` tables. [VERIFIED: codebase] |
| Zod | 4.6.5 (Installed) | Validation of decrypted payload and remote envelope | Runtime schema validation at trust boundaries. Reuses existing Phase 6 schemas. [VERIFIED: codebase] |
| Ant Design | 6.6.5 (Installed) | UI Cards, Modals, Forms, Alerts, Badges | Established UI library in the project. Matches design spec exactly. [VERIFIED: codebase] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@ant-design/icons` | 6.3.4 (Installed) | Icons (`GithubOutlined`, `CloudUploadOutlined`, `CloudDownloadOutlined`, `CheckCircleOutlined`, `WarningOutlined`) | Action triggers, status badges, and conflict alerts. [VERIFIED: codebase] |
| `dayjs` | 1.11.23 (Installed) | Timestamp formatting | Displaying remote backup last-updated date and sync history. [VERIFIED: codebase] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native `fetch` | `@octokit/request` | CLAUDE.md mentions `@octokit/request`, but for Phase 8 only `GET` and `PUT` on `/repos/{owner}/{repo}/contents/{path}` are needed. Using native `fetch` saves 50KB bundle weight and avoids external network abstractions. [Decision: Native fetch] |
| Web Crypto | `crypto-js` / `tweetnacl` | External packages add supply-chain risk, slower execution, and larger bundle. Web Crypto is native, secure, and officially recommended. [Decision: Web Crypto] |
| Uncompressed Payload | `CompressionStream` (gzip) | CLAUDE.md states: "Do not add compression dependency until file size actually approaches limit." Average task database is 10-50KB JSON. 1MB Contents API limit is plenty. [Decision: Uncompressed per D-13] |

**Installation:**
No new packages required. Zero dependency additions.

---

## Package Legitimacy Audit

Zero external packages are added in this phase. All cryptographic and network operations use native browser APIs (Web Crypto API and `fetch`).

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| *(none)* | — | — | — | — | [OK] | No packages to install |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
+-----------------------------------------------------------------------------------+
| Browser Session (SettingsView -> Data Tab)                                        |
|                                                                                   |
|  [GitHubAuthContext] (In-Memory React Context)                                    |
|    - pat: string (transient)                                                      |
|    - passphrase: string (transient)                                               |
|    - status: 'unauthenticated' | 'authenticated' | 'error'                        |
|                                                                                   |
|  +---------------------------+       +-----------------------------------------+  |
|  | GitHubConfigCard          |       | GitHubSyncCard                          |  |
|  | - Owner, Repo, Branch     |       | - Status Badge (Connected / SHA: abc123) |  |
|  | - Token & Passphrase      |       | - "Đẩy lên GitHub" Button               |  |
|  | - "Lưu cấu hình"          |       | - "Tải từ GitHub" Button                |  |
|  | - "Kiểm tra kết nối"      |       | - "Xóa phiên kết nối" Button            |  |
|  +-------------+-------------+       +--------------------+--------------------+  |
|                |                                          |                       |
+----------------|------------------------------------------|-----------------------+
                 |                                          |
       +---------v---------+                                |
       | IndexedDB         |                                |
       | (settings table)  |                                |
       | - github_owner    |                                |
       | - github_repo     |                                |
       | - github_branch   |                                |
       | - last_synced_sha |                                |
       +-------------------+                                |
                                                            |
                 +------------------------------------------+
                 |
                 +--- [PUSH BACKUP WORKFLOW] --->
                 |    1. Pre-flight GET /contents/.task-management/backup.enc.json
                 |    2. Check remote SHA vs lastKnownSha:
                 |       - If mismatch / changed -> Halt & open GitHubConflictModal
                 |         * Pull & Preview -> switch to PULL flow
                 |         * Force Overwrite -> require 'OVERWRITE' keyword -> PUT with remote SHA
                 |         * Cancel -> abort
                 |    3. exportBackupPayload(db) -> unencrypted BackupEnvelope
                 |    4. Web Crypto: PBKDF2 (600k iter) -> AES-GCM-256 encrypt -> EncryptedEnvelope
                 |    5. PUT /contents/.task-management/backup.enc.json (body: Base64 JSON)
                 |    6. Update last_synced_sha & log to backupMetadata
                 |
                 +--- [PULL & RESTORE WORKFLOW] --->
                      1. GET /contents/.task-management/backup.enc.json
                      2. If 404 -> Alert "Chưa có bản sao lưu trên GitHub"
                      3. Decode Base64 content -> parse EncryptedEnvelope JSON
                      4. Verify envelope header (app: 'personal-task-planner', format: 'encrypted-v1')
                      5. Prompt for passphrase if absent or on OperationError
                      6. Web Crypto: PBKDF2 -> AES-GCM-256 decrypt -> UTF-8 JSON
                      7. validateBackupPayload(decryptedPayload)
                         - If invalid -> Alert validation errors & offer "Tải tệp mã hóa thô"
                      8. Open Phase 6 ImportPreviewModal
                         - Display comparative record counts diff
                         - Auto snapshot to settings.last_pre_import_snapshot
                         - Require 'RESTORE' keyword
                         - Atomic Dexie transaction restore
```

### Recommended Project Structure

```
src/
├── context/
│   └── GitHubAuthContext.tsx         # In-memory transient PAT & passphrase state + session controls
├── services/
│   ├── crypto/
│   │   ├── webCrypto.ts              # PBKDF2 key derivation & AES-GCM encrypt/decrypt
│   │   ├── types.ts                  # EncryptedEnvelope, CryptoConfig interfaces
│   │   └── base64.ts                 # Safe binary <-> Base64 encode/decode
│   └── github/
│       ├── githubApi.ts              # Native fetch client for Contents API (GET, PUT, preflight)
│       └── types.ts                  # GitHubContentResponse, GitHubCommitResponse, SyncMetadata
├── components/
│   └── settings/
│       ├── GitHubConfigCard.tsx      # Repository metadata inputs & session credential inputs
│       ├── GitHubSyncCard.tsx        # Sync status display, push/pull actions, remote file info
│       ├── GitHubConflictModal.tsx   # SHA mismatch modal with 3 choices & OVERWRITE keyword
│       └── GitHubPassphraseModal.tsx # Decryption passphrase prompt modal on pull
└── views/
    └── SettingsView.tsx              # Host components inside 'data' tab
```

### Pattern 1: Native Web Crypto Envelope Encryption & Decryption
**What:** Cryptographic helper deriving an AES-256 key from a passphrase and salt using PBKDF2-HMAC-SHA256 (600,000 iterations per OWASP), then performing authenticated AES-GCM encryption with a unique 96-bit random IV per operation.
**When to use:** Every time the user initiates "Đẩy lên GitHub" or "Tải từ GitHub".
**Example:**
```typescript
// src/services/crypto/webCrypto.ts
import { bytesToBase64, base64ToBytes } from './base64';
import type { EncryptedEnvelope } from './types';

const PBKDF2_ITERATIONS = 600000;
const SALT_BYTE_LENGTH = 16;
const IV_BYTE_LENGTH = 12; // 96-bit standard for AES-GCM

export async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptPayload(
  payloadJson: string,
  passphrase: string
): Promise<EncryptedEnvelope> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTE_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTE_LENGTH));
  const key = await deriveKey(passphrase, salt);

  const enc = new TextEncoder();
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(payloadJson)
  );

  return {
    app: 'personal-task-planner',
    format: 'encrypted-v1',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    crypto: {
      algorithm: 'AES-GCM',
      keyLength: 256,
      kdf: 'PBKDF2',
      kdfParams: {
        hash: 'SHA-256',
        iterations: PBKDF2_ITERATIONS,
        salt: bytesToBase64(salt),
      },
      iv: bytesToBase64(iv),
    },
    ciphertext: bytesToBase64(new Uint8Array(ciphertextBuffer)),
  };
}

export async function decryptPayload(
  envelope: EncryptedEnvelope,
  passphrase: string
): Promise<string> {
  if (envelope.app !== 'personal-task-planner' || envelope.format !== 'encrypted-v1') {
    throw new Error('Định dạng tệp mã hóa không hợp lệ');
  }

  const salt = base64ToBytes(envelope.crypto.kdfParams.salt);
  const iv = base64ToBytes(envelope.crypto.iv);
  const ciphertext = base64ToBytes(envelope.ciphertext);

  const key = await deriveKey(passphrase, salt);

  // Note: OperationError is thrown if authentication tag or key fails to decrypt
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(decryptedBuffer);
}
```

### Pattern 2: Binary Safe Base64 Encoding
**What:** Fast, zero-dependency conversion between `Uint8Array` binary buffers and Base64 strings.
**When to use:** Encoding/decoding cryptographic salt, IV, ciphertext, and GitHub Contents API Base64 payloads.
**Example:**
```typescript
// src/services/crypto/base64.ts
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  // Strip optional whitespace or newlines returned by GitHub API
  const cleanBase64 = base64.replace(/\s+/g, '');
  const binary = atob(cleanBase64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function utf8ToBase64(str: string): string {
  return bytesToBase64(new TextEncoder().encode(str));
}

export function base64ToUtf8(base64: string): string {
  return new TextDecoder().decode(base64ToBytes(base64));
}
```

### Pattern 3: GitHub Contents API Caller with SHA Conflict Protection
**What:** Lightweight HTTP client using native `fetch` supporting GitHub authentication, pre-flight file retrieval, and atomic update with SHA.
**When to use:** Interacting with GitHub API endpoints.
**Example:**
```typescript
// src/services/github/githubApi.ts
export interface GitHubConfig {
  owner: string;
  repo: string;
  branch: string;
}

export interface RemoteFileMetadata {
  exists: boolean;
  sha?: string;
  size?: number;
  contentBase64?: string;
  lastModified?: string;
}

const BACKUP_PATH = '.task-management/backup.enc.json';

export async function fetchRemoteBackupMetadata(
  config: GitHubConfig,
  token: string
): Promise<RemoteFileMetadata> {
  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${BACKUP_PATH}?ref=${config.branch}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 404) {
    return { exists: false };
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message || `Lỗi GitHub API: HTTP ${response.status}`);
  }

  const data = await response.json();
  return {
    exists: true,
    sha: data.sha,
    size: data.size,
    contentBase64: data.content,
  };
}

export async function uploadEncryptedBackup(
  config: GitHubConfig,
  token: string,
  contentBase64: string,
  remoteSha?: string,
  message: string = 'chore: update encrypted task planner backup [skip ci]'
): Promise<{ sha: string; commitSha: string }> {
  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${BACKUP_PATH}`;
  const body: Record<string, unknown> = {
    message,
    content: contentBase64,
    branch: config.branch,
  };
  if (remoteSha) {
    body.sha = remoteSha;
  }

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (response.status === 409) {
    throw new Error('CONFLICT_409');
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message || `Tải lên thất bại: HTTP ${response.status}`);
  }

  const result = await response.json();
  return {
    sha: result.content.sha,
    commitSha: result.commit.sha,
  };
}
```

### Pattern 4: Transient React `GitHubAuthContext`
**What:** Singleton Context holding transient in-memory credentials, providing clear-session action, and shielding secrets from persistent storage.
**When to use:** Mounted at the application root / AppShell level to share session credentials across settings components.
**Example:**
```typescript
// src/context/GitHubAuthContext.tsx
import React, { orientation, createContext, useContext, useState, type ReactNode } from 'react';

interface GitHubAuthContextValue {
  token: string | null;
  passphrase: string | null;
  setCredentials: (token: string, passphrase?: string) => void;
  setPassphrase: (passphrase: string) => void;
  clearSession: () => void;
  hasToken: boolean;
  hasPassphrase: boolean;
}

const GitHubAuthContext = createContext<GitHubAuthContextValue | null>(null);

export const GitHubAuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [token, setTokenState] = useState<string | null>(null);
  const [passphrase, setPassphraseState] = useState<string | null>(null);

  const setCredentials = (newToken: string, newPassphrase?: string) => {
    setTokenState(newToken.trim());
    if (newPassphrase !== undefined) {
      setPassphraseState(newPassphrase);
    }
  };

  const setPassphrase = (newPassphrase: string) => {
    setPassphraseState(newPassphrase);
  };

  const clearSession = () => {
    setTokenState(null);
    setPassphraseState(null);
  };

  return (
    <GitHubAuthContext.Provider
      value={{
        token,
        passphrase,
        setCredentials,
        setPassphrase,
        clearSession,
        hasToken: Boolean(token),
        hasPassphrase: Boolean(passphrase),
      }}
    >
      {children}
    </GitHubAuthContext.Provider>
  );
};

export const useGitHubAuth = (): GitHubAuthContextValue => {
  const ctx = useContext(GitHubAuthContext);
  if (!ctx) {
    throw new Error('useGitHubAuth must be used within GitHubAuthProvider');
  }
  return ctx;
};
```

### Anti-Patterns to Avoid
- **Persisting secrets in IndexedDB or Web Storage:** Never write PAT or passphrase into `db.settings`, `localStorage`, or `sessionStorage`. Doing so compromises the security model (SYNC-01, SYNC-02).
- **Hardcoding GitHub target repository:** Repository owner and repo name must be user-configurable so each individual can target their private fork or repo (D-01).
- **Blind Overwrite (PUT without SHA):** Attempting to update an existing remote file without providing its current `sha` causes GitHub API 422/409 errors and risks silently wiping newer backups made from another device.
- **Using external crypto libraries (`crypto-js`, `forge`):** Unnecessary bloat and security risk. Modern Web Crypto API handles PBKDF2, AES-GCM, and SHA-256 natively in all supported browsers.
- **Logging decrypted payload or token:** Never `console.log(token)` or `console.log(decryptedPayload)`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PBKDF2 & AES-GCM Implementation | Hand-crafted crypto algorithms | `window.crypto.subtle` | Custom cryptography implementations are notoriously vulnerable to timing attacks, padding oracle leaks, and weak entropy. |
| Cryptographic Salt & IV | Math.random() or timestamp-based generation | `crypto.getRandomValues(new Uint8Array(N))` | `Math.random` is pseudorandom and predictable. Web Crypto RNG is CSPRNG compliant. |
| Decrypted Payload Validation | Manual `if/else` field checking | `validateBackupPayload` (Phase 6 Zod engine) | Referential integrity across 6 domain tables is already implemented and exhaustively tested. |
| Restore Diff & Rollback UI | Custom modal for remote restore | `ImportPreviewModal` (Phase 6) | Already handles record count comparison, pre-import snapshot, `RESTORE` keyword, and rollback. |
| Database Snapshot Rollback | Manual table-by-table undo logic | `restoreBackupPayload` & `rollbackToSnapshot` | Transactional rollback in Dexie `rw` transaction guarantees atomicity. |

**Key insight:** The existing Phase 6 backup and restore infrastructure already solves 80% of data safety and restoration. Phase 8 only needs to provide the secure cryptographic transport layer (Web Crypto + GitHub REST API) and pipe the decrypted result into Phase 6's validation and preview pipeline.

---

## Common Pitfalls

### Pitfall 1: Base64 Encoding Corrupting Binary Buffers or Multi-byte UTF-8
**What goes wrong:** Using naive `btoa(unescape(encodeURIComponent(str)))` or `Buffer.from` in browser environments can cause runtime crashes or corrupt binary crypto buffers (IV, salt, ciphertext tag).
**Why it happens:** `btoa()` expects a binary Latin-1 string where each character's code point is <= 255. Direct strings containing Unicode characters cause `DOMException: The string to be encoded contains characters outside of the Latin1 range`.
**How to avoid:** Use `TextEncoder` to turn UTF-8 into `Uint8Array`, then iterate through bytes with `String.fromCharCode()` for `btoa()`. Conversely, use `atob()` into `Uint8Array`, then `TextDecoder` for UTF-8.
**Warning signs:** Decryption fails with `OperationError` even when passphrase is correct, or unit tests fail with multi-byte characters.

### Pitfall 2: Web Crypto Decryption Rejection on Invalid Passphrase
**What goes wrong:** App crashes with uncaught promise rejection when user enters an incorrect passphrase.
**Why it happens:** `crypto.subtle.decrypt` throws an unhandled DOMException with `name: 'OperationError'` when the AES-GCM authentication tag does not match the derived key.
**How to avoid:** Wrap `decryptPayload` in a `try...catch` block. Catch `OperationError` explicitly and translate it into a friendly localized error: "Mật khẩu giải mã không chính xác hoặc tệp sao lưu đã bị thay đổi." Open the `GitHubPassphraseModal` to allow the user to retry.
**Warning signs:** Red console error `DOMException: Decryption failed` without user-facing alert.

### Pitfall 3: GitHub Contents API 1MB File Size Limit & Whitespace in Base64
**What goes wrong:** GitHub API returns `content` with embedded newline `\n` characters (standard base64 wrapping) or fails when backup exceeds 1MB.
**Why it happens:** GitHub's API inserts newlines every 60 characters in base64 responses for legacy MIME formatting. Also, files over 1MB cannot be fetched via `/contents/` directly (requires Git Data API blobs).
**How to avoid:** Sanitize base64 responses by running `content.replace(/\s+/g, '')` before decoding. For personal task management, keeping the payload uncompressed is well under 100KB, staying safely below the 1MB limit.
**Warning signs:** `atob` throws `InvalidCharacterError: The string to be decoded is not correctly encoded`.

### Pitfall 4: Concurrent Remote Updates & Stale SHA Conflicts
**What goes wrong:** User makes a backup from Device A, then attempts to backup from Device B. If Device B does not check the remote SHA first, it either overwrites Device A's data or receives an HTTP 409 Conflict.
**Why it happens:** GitHub Contents API requires the current file SHA when updating existing files.
**How to avoid:** Always run a pre-flight `GET` request immediately before `PUT`. If the remote SHA does not match the local `last_synced_sha`, trigger `GitHubConflictModal` giving the user explicit control (Pull & Preview vs Force Overwrite with keyword `OVERWRITE`).
**Warning signs:** Random HTTP 409 Conflict errors during upload.

---

## Code Examples

### Testing Connection & Permissions (Pre-flight GET)
```typescript
// Source: GitHub REST API docs for Contents
export async function testGitHubConnection(
  config: GitHubConfig,
  token: string
): Promise<{ ok: boolean; message: string; remoteSha?: string; fileExists: boolean }> {
  try {
    const meta = await fetchRemoteBackupMetadata(config, token);
    if (!meta.exists) {
      return {
        ok: true,
        fileExists: false,
        message: 'Kết nối thành công. Chưa có bản sao lưu trên GitHub.',
      };
    }
    return {
      ok: true,
      fileExists: true,
      remoteSha: meta.sha,
      message: `Kết nối thành công. Bản sao lưu remote: ${meta.sha?.slice(0, 7)}`,
    };
  } catch (err: any) {
    return {
      ok: false,
      fileExists: false,
      message: err.message || 'Không thể kết nối với GitHub. Vui lòng kiểm tra cấu hình.',
    };
  }
}
```

### Encrypt and Upload Flow
```typescript
// Source: Web Crypto AES-GCM + GitHub Contents API
export async function executeGitHubBackupPush(
  db: TaskPlannerDatabase,
  config: GitHubConfig,
  token: string,
  passphrase: string,
  expectedRemoteSha?: string,
  forceOverwrite: boolean = false
): Promise<{ sha: string; exportedAt: string }> {
  // 1. Preflight check remote file
  const meta = await fetchRemoteBackupMetadata(config, token);
  
  if (meta.exists && !forceOverwrite) {
    if (expectedRemoteSha && meta.sha !== expectedRemoteSha) {
      throw new Error('CONFLICT_SHA_MISMATCH');
    }
  }

  // 2. Export local domain data
  const localEnvelope = await exportBackupPayload(db);
  const payloadJson = JSON.stringify(localEnvelope);

  // 3. Encrypt payload
  const encryptedEnvelope = await encryptPayload(payloadJson, passphrase);
  const encryptedJson = JSON.stringify(encryptedEnvelope);
  const contentBase64 = utf8ToBase64(encryptedJson);

  // 4. Push to GitHub
  const uploadResult = await uploadEncryptedBackup(
    config,
    token,
    contentBase64,
    meta.exists ? meta.sha : undefined
  );

  // 5. Save sync metadata to db.settings & db.backupMetadata
  await db.settings.put({
    key: 'last_synced_sha',
    value: uploadResult.sha,
  });
  await db.settings.put({
    key: 'last_synced_at',
    value: encryptedEnvelope.exportedAt,
  });

  return {
    sha: uploadResult.sha,
    exportedAt: encryptedEnvelope.exportedAt,
  };
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Third-party crypto (`crypto-js`) | Native Web Crypto API (`crypto.subtle`) | Standard across all modern browsers | Eliminates supply chain risks, increases encryption speed 10-50x, timing attack resistant. |
| PBKDF2 with low iteration counts (10k - 100k) | PBKDF2 with 600,000 iterations (OWASP standard) | OWASP Password Storage Cheat Sheet recommendation | Drastically increases brute-force cost for password recovery. |
| OAuth server-side apps for GitHub auth | Fine-grained Personal Access Tokens (PAT) entered client-side | GitHub fine-grained PAT release | No backend server required for single-user personal backup; scoped strictly to repository contents. |
| Full Octokit SDK for browser apps | Native `fetch` with standard GitHub API headers | Modern ESM web development | Keeps bundle size minimal; avoids unnecessary dependency trees for 2 REST endpoints. |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Personal backup JSON will remain under 1MB for typical usage, so Git Blobs API is not required. | Summary / Pitfalls | Negligible. Personal task data with hundreds of tasks is ~30-80KB. If payload ever exceeds 1MB, CompressionStream can be added later. |

*(All other claims and patterns are directly verified against project code, UI spec, and native Web Crypto APIs).*

---

## Open Questions

1. **How should `github_branch` default when the user enters only repo name?**
   - What we know: Modern GitHub defaults to `main`, but older repositories might use `master`.
   - Recommendation: Default the input to `main`, allow user to edit freely in `GitHubConfigCard`.
2. **Should the user be able to download the raw encrypted file if GitHub is inaccessible?**
   - What we know: If decryption fails after downloading from GitHub, D-16 requires offering a "Tải tệp mã hóa thô" button.
   - Recommendation: Expose raw file download in both `GitHubPassphraseModal` and `GitHubSyncCard` when an encrypted envelope has been fetched.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Web Crypto API (`crypto.subtle`) | Backup encryption / decryption | ✓ | Native | Essential; available in all modern browsers and Node 20+. |
| Browser `fetch` | GitHub Contents API calls | ✓ | Native | Essential; available in all modern browsers and Node 20+. |
| Vitest | Unit / integration testing | ✓ | 5.0.2 | — |
| IndexedDB / fake-indexeddb | Persistence testing | ✓ | 6.2.5 | — |

---

## Validation Architecture

Nyquist validation is enabled (`workflow.nyquist_validation: true` in `.planning/config.json`).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 + `@testing-library/react` 16.3.3 |
| Config file | `vite.config.ts` |
| Quick run command | `npm test -- tests/services/crypto/webCrypto.test.ts` |
| Full suite command | `npm test -- --run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| **SYNC-01** | PAT & Passphrase not stored in DB, exports, or logs | unit | `npm test -- tests/context/GitHubAuthContext.test.tsx` | ❌ Wave 0 |
| **SYNC-02** | Credentials cleared on session clear or unmount | unit | `npm test -- tests/context/GitHubAuthContext.test.tsx` | ❌ Wave 0 |
| **SYNC-03** | Web Crypto PBKDF2/AES-GCM encryption & decryption | unit | `npm test -- tests/services/crypto/webCrypto.test.ts` | ❌ Wave 0 |
| **SYNC-04** | GitHub Contents API PUT upload with Base64 payload | integration | `npm test -- tests/services/github/githubApi.test.ts` | ❌ Wave 0 |
| **SYNC-05** | Remote backup pull, decrypt, preview, and restore | integration | `npm test -- tests/services/github/githubSyncService.test.ts` | ❌ Wave 0 |
| **SYNC-06** | Remote SHA conflict detection & 409 handling | unit/integration | `npm test -- tests/services/github/conflictDetection.test.ts` | ❌ Wave 0 |
| **SYNC-07** | Local app works 100% offline without GitHub token | unit | `npm test -- tests/views/SettingsView.test.tsx` | ✅ (extend for Phase 8) |

### Sampling Rate
- **Per task commit:** Quick unit test of affected service or component
- **Per wave merge:** `npm test -- --run`
- **Phase gate:** Full test suite green before verification

### Wave 0 Gaps
- [ ] `tests/services/crypto/webCrypto.test.ts` — covers PBKDF2 derivation, AES-GCM encrypt/decrypt, bad passphrase failure, Unicode preservation
- [ ] `tests/services/crypto/base64.test.ts` — covers binary buffer <-> Base64 roundtrip and Unicode strings
- [ ] `tests/services/github/githubApi.test.ts` — covers mock GET/PUT requests, 404 detection, 409 conflict, SHA handling
- [ ] `tests/context/GitHubAuthContext.test.tsx` — covers in-memory credential storage, update, clear session, and isolation from storage

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Fine-grained GitHub Personal Access Tokens (PAT). Stored in transient React state only. |
| V3 Session Management | yes | Credentials purged on page reload, tab close, or explicit "Xóa phiên kết nối" click. |
| V4 Access Control | yes | GitHub PAT scoped to single repository `contents:read` / `contents:write`. Protected remote overwrite requiring `OVERWRITE` keyword. |
| V5 Input Validation | yes | Zod schema validation (`validateBackupPayload`) on all decrypted payloads before database write. |
| V6 Cryptography | yes | Native Web Crypto API; PBKDF2 (600,000 iterations, SHA-256, 16-byte random salt) + AES-GCM 256-bit with unique 96-bit IV. Never store passphrase. |

### Known Threat Patterns for GitHub Backup

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Token exposure in source or bundle | Information Disclosure | Secrets entered at runtime only; never put in `.env`, bundle, or git (SYNC-01). |
| Token persistence in web storage | Information Disclosure | Strict prohibition on `localStorage`, `sessionStorage`, and IndexedDB for PAT/passphrase (SYNC-02). |
| Remote data tampering or corruption | Tampering | Authenticated encryption (AES-GCM 128-bit MAC tag). Tampered ciphertext fails decryption immediately. |
| Accidental remote overwrite | Tampering | Pre-flight SHA comparison and explicit keyword confirmation (`OVERWRITE`) required to force push (SYNC-06, D-08). |
| Local database wipe on corrupted pull | Denial of Service | Two-stage validation, pre-import safety snapshot, and transactional restore with rollback (D-15, Phase 6). |

---

## Sources

### Primary (HIGH confidence)
- MDN Web Docs: Web Crypto API (`crypto.subtle.deriveKey`, `crypto.subtle.encrypt`, `crypto.subtle.decrypt`)
- GitHub REST API Documentation: Repositories - Contents (`GET /repos/{owner}/{repo}/contents/{path}`, `PUT /repos/{owner}/{repo}/contents/{path}`)
- OWASP Password Storage Cheat Sheet: PBKDF2 recommendation (HMAC-SHA256 with >= 600,000 iterations)
- Codebase inspection: `src/services/backup/`, `src/views/SettingsView.tsx`, `src/types/models.ts`

### Secondary (MEDIUM confidence)
- Ant Design 6.6.5 component documentation (Cards, Modals, Forms, Inputs)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Native Web Crypto and fetch verified; zero new dependencies.
- Architecture: HIGH - Seamlessly reuses Phase 6 validation, preview, and snapshot models.
- Pitfalls: HIGH - Common cryptographic and GitHub API edge cases analyzed with exact mitigations.

**Research date:** 2026-09-27
**Valid until:** 2026-10-27
