# Phase 8: Optional Encrypted GitHub Backup - Research & Architecture

**Researched:** 2026-09-27  
**Domain:** Client-Side Web Cryptography (Web Crypto API) & GitHub Contents REST API  
**Integration Point:** PWA Settings View (`SettingsView.tsx`), IndexedDB (`src/data/db.ts`), Backup Service (`src/services/backup/`)

---

## Executive Summary

Phase 8 provides an optional, client-side encrypted backup mechanism synchronized to a personal GitHub repository using the GitHub Contents REST API.

Key architectural realities:
1. **Zero-Server Constraint:** The application runs 100% in the browser (GitHub Pages). No intermediary proxy, backend, or serverless function is used.
2. **Zero-Secret Persistence:** Fine-grained GitHub Personal Access Tokens (PAT) and user passphrases **must never** be stored in IndexedDB, `localStorage`, `sessionStorage`, cookies, service worker caches, or telemetry. All secrets live strictly in volatile React state / closures and are instantly forgotten on tab close, page refresh, or explicit "Xóa phiên kết nối" action.
3. **Native Web Cryptography:** No external crypto libraries (`crypto-js`, `tweetnacl`) are permitted. Encryption uses the native browser `window.crypto.subtle` API with PBKDF2 (SHA-256, 600,000 iterations, 16-byte cryptographically secure random salt) and AES-GCM (256-bit key, 12-byte cryptographically secure unique IV per backup).
4. **Offline First & Decoupled:** Failure or unavailability of GitHub network connectivity has **zero impact** on offline task management, local planning, or offline JSON import/export.

---

## Standard Stack Alignment

| Capability | Standard Choice | Status in Phase 8 |
|------------|-----------------|-------------------|
| Native Encryption | Web Crypto API (`window.crypto.subtle`) | **MANDATORY**. Native, audited, zero bundle weight, memory-safe in secure contexts. |
| GitHub API Client | Native `fetch` with standard headers | **RECOMMENDED**. Octokit is unnecessary overhead (~40KB+) when only two REST endpoints (`GET` / `PUT` `/repos/{owner}/{repo}/contents/{path}`) are called. |
| Encoding / Decoding | Native `TextEncoder`, `TextDecoder`, `btoa`, `atob` with Unicode Uint8Array handling | **MANDATORY**. Handles JSON UTF-8 safely across Base64 boundaries without truncating Vietnamese diacritics. |
| Data Schema Validation | Zod 4.6.5 | **MANDATORY**. Validates decrypted backup payloads before applying them to IndexedDB. |
| Local Config Storage | Dexie `db.settings` table | **MANDATORY**. Stores non-sensitive target config (`github_owner`, `github_repo`, `github_branch`, `github_path`). |

---

## 1. Web Crypto API Architecture & Key Derivation

### Cryptographic Parameters
- **Cipher:** AES-GCM (256-bit key length, 128-bit authentication tag)
- **Key Derivation Function:** PBKDF2
- **Hash Function:** SHA-256
- **Salt:** 16 bytes (128 bits), cryptographically secure random via `crypto.getRandomValues(new Uint8Array(16))`
- **Iteration Count:** 600,000 iterations (conforming to modern OWASP Password Storage guidelines for PBKDF2-HMAC-SHA256)
- **IV (Initialization Vector):** 12 bytes (96 bits) per AES-GCM NIST recommendation, cryptographically secure random via `crypto.getRandomValues(new Uint8Array(12))` for every encryption run. **Never reused.**

### Backup Envelope Specification (`EncryptedBackupPayload`)
The uploaded and exported encrypted file format is a JSON envelope containing:

```typescript
export interface EncryptedBackupEnvelope {
  version: 1;
  format: 'aes-256-gcm-pbkdf2';
  kdf: {
    algorithm: 'PBKDF2';
    hash: 'SHA-256';
    iterations: 600000;
    salt: string; // Base64 encoded 16 bytes
  };
  cipher: {
    algorithm: 'AES-GCM';
    iv: string; // Base64 encoded 12 bytes
    tagLength: 128; // Authentication tag bits
  };
  ciphertext: string; // Base64 encoded ciphertext + auth tag
  createdAt: string; // ISO 8601 UTC timestamp
  appVersion?: string;
}
```

### Encryption Flow
1. Serialize full local database snapshot using existing `exportDatabaseToJson()` (Phase 6).
2. Encode plaintext string to `Uint8Array` via `new TextEncoder().encode(jsonString)`.
3. Generate 16-byte random salt and 12-byte random IV via `crypto.getRandomValues`.
4. Import passphrase string into base raw key:
   ```typescript
   const rawKey = await crypto.subtle.importKey(
     'raw',
     new TextEncoder().encode(passphrase),
     'PBKDF2',
     false,
     ['deriveKey']
   );
   ```
5. Derive 256-bit AES-GCM key:
   ```typescript
   const aesKey = await crypto.subtle.deriveKey(
     {
       name: 'PBKDF2',
       salt: saltUint8,
       iterations: 600000,
       hash: 'SHA-256'
     },
     rawKey,
     { name: 'AES-GCM', length: 256 },
     false, // Non-extractable key
     ['encrypt']
   );
   ```
6. Encrypt payload:
   ```typescript
   const ciphertextBuffer = await crypto.subtle.encrypt(
     { name: 'AES-GCM', iv: ivUint8, tagLength: 128 },
     aesKey,
     plaintextBytes
   );
   ```
7. Package envelope with Base64-encoded salt, IV, and ciphertext.

### Decryption Flow & Authentication Tag Verification
AES-GCM automatically includes message authentication. If:
- The passphrase is wrong, or
- The ciphertext is altered or corrupted, or
- The IV is mismatched,
`crypto.subtle.decrypt` throws an unforgeable `OperationError`.
We catch this error and display a clear Ant Design notification:
`"Mật khẩu giải mã không chính xác hoặc tệp sao lưu đã bị thay đổi/hỏng."`

---

## 2. GitHub Contents REST API Mechanics

### Required Endpoints
All requests go to `https://api.github.com/repos/{owner}/{repo}/contents/{path}`.

#### 1. Fetch File Metadata & Existing Content (`GET`)
- **Headers:**
  - `Accept: application/vnd.github+json`
  - `Authorization: Bearer <TOKEN>`
  - `X-GitHub-Api-Version: 2022-11-28`
- **Query Params:** `?ref={branch}`
- **Responses:**
  - `200 OK`: File exists. Returns `{ sha: string, content: string, encoding: "base64", size: number, ... }`. Note: GitHub returns multiline Base64 with `\n`. Must strip newlines before decoding: `content.replace(/\n/g, '')`.
  - `404 Not Found`: File does not yet exist. Normal for initial backup.
  - `401 Unauthorized`: Invalid or revoked token.
  - `403 Forbidden`: Insufficient permissions (e.g. read-only token or rate limit exceeded).
  - `404 Not Found` (Repo): Private repo when token lacks repo access.

#### 2. Create or Update File (`PUT`)
- **Payload:**
  ```json
  {
    "message": "chore(backup): update encrypted task-management backup [YYYY-MM-DD HH:mm:ss UTC]",
    "content": "<BASE64_ENCODED_ENVELOPE>",
    "branch": "<BRANCH>",
    "sha": "<CURRENT_FILE_SHA>" // Omit if creating new file
  }
  ```
- **Responses:**
  - `200 OK` (Updated) or `201 Created` (Created): Returns commit metadata and new file SHA.
  - `409 Conflict`: Remote SHA mismatch. Another push or modification occurred since our last fetch.

### Content Size Handling (< 1MB)
The GitHub REST Contents API supports direct `GET`/`PUT` with `content` payload for files up to 1 MB.
A typical personal task management database containing thousands of tasks, history, and metrics compresses into ~50KB to 200KB of JSON.
Therefore, direct `GET` / `PUT` via Contents API is completely sufficient and avoids complex Git Data Blobs / Trees API plumbing.

---

## 3. Credential Isolation & Security Architecture

### Strict Memory-Only Lifetime (SYNC-01, SYNC-02)
- GitHub Personal Access Token (PAT) and user encryption passphrase **must never** be written to:
  - `localStorage`
  - `sessionStorage`
  - `IndexedDB`
  - Service worker caches (`CacheStorage`)
  - URL parameters or query strings
- **Implementation:**
  A React Context (`GitHubAuthContext`) holds transient state:
  ```typescript
  interface GitHubAuthState {
    token: string | null;
    passphrase: string | null;
    owner: string;
    repo: string;
    branch: string;
    path: string;
  }
  ```
  Only `owner`, `repo`, `branch`, and `path` are persisted in `db.settings`.
  `token` and `passphrase` are initialized to `null`.
  When user navigates away, reloads the browser, or clicks **"Xóa phiên kết nối"**, state is set to `null` and GC collects the strings.

### Fine-Grained Personal Access Token (PAT) Setup
To guide users safely (D-03):
- Require fine-grained PAT with:
  - Target repository: Selected single repository only (e.g. `task-management-backup`)
  - Permissions: **Repository permissions -> Contents -> Read and write**
  - No account-wide or admin permissions.
- In `GitHubConfigCard`, render an Ant Design `Alert` with direct instructions and link to `https://github.com/settings/personal-access-tokens/new`.

---

## 4. Conflict Detection & Overwrite Flow (SYNC-06)

To avoid accidental remote data loss:
1. Before every upload, fetch current remote file metadata (`GET`).
2. If remote file exists:
   - Compare remote `sha` with our locally cached `lastKnownRemoteSha`.
   - If mismatch or remote timestamp is newer than our base:
     Trigger a conflict modal (`GitHubConflictModal`).
3. If user chooses to force overwrite:
   - Require typing the keyword `OVERWRITE` or `GHI ĐÈ` in an input field before enabling the button.
   - Send `PUT` with the latest fetched remote `sha`.

---

## 5. Architectural Responsibility Map

| Tier | Component / Module | Responsibility |
|------|--------------------|----------------|
| **Crypto Service** | `src/services/crypto/webCrypto.ts` | Pure functions for PBKDF2 derivation, AES-GCM encryption/decryption, binary/base64 conversions. Zero UI or DB knowledge. |
| **GitHub REST Client** | `src/services/github/githubApi.ts` | Low-level HTTP requests to GitHub Contents API (`getFile`, `putFile`). Handles headers, status codes, and error formatting. |
| **GitHub Sync Orchestrator** | `src/services/github/githubSyncService.ts` | High-level operations: `backupToGitHub()`, `restoreFromGitHub()`, `fetchRemoteMetadata()`. Combines DB export, crypto, and API. |
| **Runtime Auth State** | `src/context/GitHubAuthContext.tsx` | React context providing in-memory PAT/passphrase and config persistence helper. |
| **UI Components** | `src/components/settings/GitHubConfigCard.tsx`, `GitHubSyncCard.tsx`, `GitHubPassphraseModal.tsx`, `GitHubConflictModal.tsx` | User interface, feedback notifications, progress spin, password inputs, safety confirmations. |

---

## Don't Hand-Roll

| What | Don't Hand-Roll | Use Instead | Why |
|------|-----------------|-------------|-----|
| Cryptography | Custom XOR, RC4, or DIY AES in JS | `window.crypto.subtle` | Native browser implementation is constant-time, hardware-accelerated, and protected against timing attacks. |
| Base64 with Unicode | Raw `btoa(unescape(encodeURIComponent(str)))` | Standard `Uint8Array` to binary string chunking or `TextEncoder` | Deprecated functions fail on modern runtimes and can mangle Vietnamese task titles. |
| Password Hashing | Low-iteration PBKDF2 (< 100,000) | 600,000 iterations PBKDF2 | Resistant to GPU brute-forcing of short or medium-length passwords. |
| GitHub API Client | Huge Octokit bundles | Native `fetch` wrapper | 20 lines of typed `fetch` replaces megabytes of unused Octokit submodules. |

---

## Common Pitfalls & How to Avoid Them

### Pitfall 1: Base64 Decoding of GitHub Content
GitHub Contents API returns base64 content with inserted newlines (`\n`) every 60 characters. Passing this directly to `atob` can fail in strict environments.
**Fix:** Always clean with `.replace(/\s/g, '')` before decoding.

### Pitfall 2: Memory Leak of Credentials in Logs
`console.log({ ...config, token, passphrase })` can leak secrets into browser developer tools or memory snapshots.
**Fix:** Sanitize all logger/debug calls. Never log credentials.

### Pitfall 3: Broken UTF-8 Vietnamese Characters
Standard `atob`/`btoa` assumes Latin1 (binary ASCII). Vietnamese task names (`Kế hoạch cá nhân`) will throw `InvalidCharacterError` or produce garbled characters.
**Fix:** Use standard Uint8Array encoding:
```typescript
export function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
```

### Pitfall 4: Decrypting Corrupted Data Crashing the App
If someone edits the GitHub file or pastes garbage, naive JSON parsing crashes.
**Fix:** AES-GCM tag verification catches tampering during decryption. If decryption passes, run `validateBackupPayload(json)` (Zod) before any database transactions.

---

## Alternative Comparison

| Approach | Selected | Rejected | Rationale |
|----------|----------|----------|-----------|
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

## Open Questions (RESOLVED)

1. **How should `github_branch` default when the user enters only repo name?**
   - What we know: Modern GitHub defaults to `main`, but older repositories might use `master`.
   - RESOLVED: Default the input to `main`, allow user to edit freely in `GitHubConfigCard`.
2. **Should the user be able to download the raw encrypted file if GitHub is inaccessible?**
   - What we know: If decryption fails after downloading from GitHub, D-16 requires offering a "Tải tệp mã hóa thô" button.
   - RESOLVED: Expose raw file download in both `GitHubPassphraseModal` and `GitHubSyncCard` when an encrypted envelope has been fetched.

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
