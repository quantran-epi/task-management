---
phase: 8
slug: optional-encrypted-github-backup
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-27
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 + @testing-library/react 16.3.3 |
| **Config file** | `vite.config.ts` |
| **Quick run command** | `npm test -- tests/services/crypto/webCrypto.test.ts` |
| **Full suite command** | `npm test -- --run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- <test-file-matching-task>`
- **After every plan wave:** Run `npm test -- --run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 0 | SYNC-03 | T-08-03 | Tampered ciphertext fails AES-GCM MAC check | unit | `npm test -- tests/services/crypto/webCrypto.test.ts` | ❌ W0 | ⬜ pending |
| 08-01-02 | 01 | 0 | SYNC-04 | T-08-01 | Auth header format conforms without token leak | unit | `npm test -- tests/services/github/githubApi.test.ts` | ❌ W0 | ⬜ pending |
| 08-01-03 | 01 | 1 | SYNC-01, SYNC-02 | T-08-02 | PAT/passphrase excluded from storage and DB | unit | `npm test -- tests/context/GitHubAuthContext.test.tsx` | ❌ W0 | ⬜ pending |
| 08-02-01 | 02 | 1 | SYNC-04 | T-08-04 | Pre-flight SHA check before upload | integration | `npm test -- tests/services/github/githubSyncService.test.ts` | ❌ W0 | ⬜ pending |
| 08-02-02 | 02 | 2 | SYNC-05, SYNC-06 | T-08-05 | Corrupted payload rejected before restore | integration | `npm test -- tests/services/github/conflictDetection.test.ts` | ❌ W0 | ⬜ pending |
| 08-03-01 | 03 | 2 | SYNC-07 | — | Local backup & app functions without GitHub token | unit | `npm test -- tests/views/SettingsView.test.tsx` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/services/crypto/webCrypto.test.ts` — stubs for PBKDF2 derivation, AES-GCM encrypt/decrypt, bad passphrase failure
- [ ] `tests/services/crypto/base64.test.ts` — stubs for binary buffer / Base64 conversions
- [ ] `tests/services/github/githubApi.test.ts` — stubs for mock GET/PUT requests, 404 detection, 409 conflict, SHA handling
- [ ] `tests/context/GitHubAuthContext.test.tsx` — stubs for in-memory credential storage, clear session, and storage isolation

---
