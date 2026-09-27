---
phase: 08-optional-encrypted-github-backup
plan: 01
subsystem: crypto-auth-settings
tags: [web-crypto, aes-gcm, pbkdf2, base64, github-auth-context, dexie-settings, antd]

# Dependency graph
requires:
  - phase: 06-safe-local-backup-and-restore
    provides: BackupEnvelope format and SettingsView data tab structure
provides:
  - Native Web Crypto AES-GCM-256 authenticated encryption engine with 600,000 PBKDF2 iterations
  - Binary-safe Base64 and UTF-8 buffer converters
  - In-memory transient GitHubAuthContext preventing secret persistence
  - GitHubConfigCard integrated in SettingsView data tab with IndexedDB repository target persistence
affects: [08-optional-encrypted-github-backup]

# Tech tracking
tech-stack:
  added: []
  patterns: [native-web-crypto-pbkdf2-aes-gcm, transient-memory-secrets, indexeddb-settings-persistence]

key-files:
  created:
    - src/services/crypto/types.ts
    - src/services/crypto/base64.ts
    - src/services/crypto/webCrypto.ts
    - src/services/crypto/index.ts
    - src/context/GitHubAuthContext.tsx
    - src/components/settings/GitHubConfigCard.tsx
    - tests/services/crypto/base64.test.ts
    - tests/services/crypto/webCrypto.test.ts
    - tests/context/GitHubAuthContext.test.tsx
    - tests/components/settings/GitHubConfigCard.test.tsx
  modified:
    - src/components/shell/AppShell.tsx
    - src/views/SettingsView.tsx
    - tests/setup.ts

key-decisions:
  - "OWASP-compliant PBKDF2 with 600,000 iterations and HMAC-SHA256 for browser-side AES-GCM-256 key derivation"
  - "Strict transient in-memory secret holder with zero writes to IndexedDB, localStorage, sessionStorage, or logs"
  - "Repository coordinates (owner, repo, branch) persisted in IndexedDB settings while PAT and passphrase remain in memory"
  - "GitHubConfigCard mounted in SettingsView Data tab coexisting cleanly with local backup"

patterns-established:
  - "EncryptedEnvelope schema format encrypted-v1 with 16-byte salt and 96-bit IV"
  - "BufferSource type casting for Web Crypto subtle operations in modern TypeScript"

requirements-completed: [SYNC-01, SYNC-02, SYNC-03]

# Metrics
duration: 10m
completed: 2026-09-27
---

# Phase 08 Plan 01: Crypto Primitives, Auth Context & Settings Card Summary

**Native Web Crypto PBKDF2/AES-GCM-256 encryption engine, binary-safe Base64 utilities, runtime in-memory credential context, and IndexedDB repository settings card.**

## Performance

- **Duration:** 10m
- **Started:** 2026-09-27T13:20:00Z
- **Completed:** 2026-09-27T13:30:00Z
- **Tasks:** 3
- **Files modified:** 13

## Accomplishments

- Implemented pure native Web Crypto PBKDF2 (600,000 iterations, HMAC-SHA256) key derivation and AES-GCM-256 authenticated encryption/decryption with zero third-party crypto packages.
- Created binary-safe Base64 and Unicode UTF-8 converters resilient against whitespace and multi-byte characters.
- Built `GitHubAuthContext` keeping GitHub PAT and encryption passphrase strictly in transient React memory, purgable via `clearSession` or tab reload.
- Built `GitHubConfigCard` persisting non-sensitive repository coordinates (`github_owner`, `github_repo`, `github_branch`) in `db.settings` while routing credentials exclusively through memory context.
- Mounted `GitHubConfigCard` inside `SettingsView` under the 'data' (Sao lưu & Dữ liệu) tab.

## Task Commits

Each task was committed atomically with TDD gates:

1. **Task 1: Web Crypto primitives, envelope format, and binary-safe Base64 conversion**
   - `04175eb` (test: add failing tests for Web Crypto and Base64 services)
   - `ffd1f75` (feat: implement Web Crypto AES-GCM-256 and Base64 services)
2. **Task 2: Runtime Memory GitHub Auth Context & AppShell integration**
   - `313116a` (test: add failing tests for GitHubAuthContext)
   - `b930bf7` (feat: provide GitHubAuthContext for transient session secrets)
3. **Task 3: GitHubConfigCard with IndexedDB repository persistence & SettingsView integration**
   - `fd0464e` (feat: add GitHubConfigCard with repo settings and in-memory auth)

## Files Created/Modified

- `src/services/crypto/types.ts` - `EncryptedEnvelope` and cryptographic parameters typing
- `src/services/crypto/base64.ts` - Binary-safe and UTF-8 Base64 conversion helpers
- `src/services/crypto/webCrypto.ts` - Native Web Crypto PBKDF2 key derivation and AES-GCM-256 encryption/decryption
- `src/services/crypto/index.ts` - Public barrel export for crypto module
- `src/context/GitHubAuthContext.tsx` - Transient in-memory secret holder and purge hook
- `src/components/shell/AppShell.tsx` - Root wrapping with `GitHubAuthProvider`
- `src/components/settings/GitHubConfigCard.tsx` - Ant Design repository configuration card and credential inputs
- `src/views/SettingsView.tsx` - Mounting `GitHubConfigCard` into the 'data' tab
- `tests/setup.ts` - Web Crypto subtle shim on window in JSDOM test runner
- `tests/services/crypto/base64.test.ts` - Unit tests for Base64 utilities
- `tests/services/crypto/webCrypto.test.ts` - Unit tests for PBKDF2 and AES-GCM encryption/decryption
- `tests/context/GitHubAuthContext.test.tsx` - Unit tests for session memory isolation and purge
- `tests/components/settings/GitHubConfigCard.test.tsx` - Unit tests for settings card and Dexie persistence

## Decisions Made

- Used native browser `crypto.subtle` without third-party libraries per CLAUDE.md and threat model T-08-SC.
- PBKDF2 configured with 600,000 iterations of HMAC-SHA256 and 16-byte random salt per OWASP recommendations and D-11.
- In-memory credentials strictly stored in React `useState` inside `GitHubAuthProvider` with zero persistence to IndexedDB, Web Storage, or cookies (SYNC-01, SYNC-02, D-02).
- Non-sensitive repository coordinates (`github_owner`, `github_repo`, `github_branch`) persisted in IndexedDB `settings` table to prevent re-entering paths (D-01).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking Issue] Shimmed window.crypto.subtle in tests/setup.ts for JSDOM**
- **Found during:** Task 1 (Web Crypto test suite execution in JSDOM)
- **Issue:** JSDOM exposes `window.crypto.getRandomValues` but omits `window.crypto.subtle`, which caused test runner failures while Node 24 native `globalThis.crypto.subtle` is fully capable.
- **Fix:** Assigned `globalThis.crypto.subtle` to `window.crypto.subtle` in `tests/setup.ts`.
- **Files modified:** `tests/setup.ts`
- **Verification:** All 11 crypto unit tests passed.
- **Committed in:** `04175eb`

**2. [Rule 1 - Bug] TypeScript BufferSource typing compatibility for Uint8Array**
- **Found during:** Task 3 (`npm run build`)
- **Issue:** Modern TypeScript types `new Uint8Array(...)` as `Uint8Array<ArrayBufferLike>`, which TS flags as not directly assignable to Web Crypto `BufferSource`.
- **Fix:** Cast `Uint8Array` to `BufferSource` for subtle operations and `getRandomValues`.
- **Files modified:** `src/services/crypto/webCrypto.ts`
- **Verification:** `npm run build` completed cleanly.
- **Committed in:** `fd0464e`

---

**Total deviations:** 2 auto-fixed (1 test environment blocking issue, 1 type-checking fix)
**Impact on plan:** Both fixes necessary for correctness and testability. No scope creep.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required at this stage.

## Next Phase Readiness

- Cryptographic foundation, Base64 transport, memory credential isolation, and repository settings are complete and fully covered by unit tests.
- Ready for Plan 08-02: GitHub Contents API client (`githubApi.ts`), sync service (`githubSyncService.ts`), conflict modal (`GitHubConflictModal.tsx`), passphrase prompt modal (`GitHubPassphraseModal.tsx`), and `GitHubSyncCard.tsx`.

---
## Self-Check: PASSED
- Created files verified:
  - `src/services/crypto/types.ts`: FOUND
  - `src/services/crypto/base64.ts`: FOUND
  - `src/services/crypto/webCrypto.ts`: FOUND
  - `src/services/crypto/index.ts`: FOUND
  - `src/context/GitHubAuthContext.tsx`: FOUND
  - `src/components/settings/GitHubConfigCard.tsx`: FOUND
- Commits verified:
  - `04175eb`: FOUND
  - `ffd1f75`: FOUND
  - `313116a`: FOUND
  - `b930bf7`: FOUND
  - `fd0464e`: FOUND
- All 56 test files (338 tests) green
- Production build passed
