---
status: complete
phase: 08-optional-encrypted-github-backup
source:
  - 08-01-SUMMARY.md
  - 08-02-SUMMARY.md
  - 08-03-SUMMARY.md
started: 2026-09-27T20:00:00Z
updated: 2026-09-27T20:25:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running server/service. Clear ephemeral state (temp DBs, caches, lock files). Start the application from scratch. Server boots without errors, any seed/migration completes, and a primary query (health check, homepage load, or basic API call) returns live data.
result: pass

### 2. GitHub Configuration & Transient Auth Isolation
expected: Go to Settings -> Sao lưu & Dữ liệu tab. "Cấu hình GitHub" card displays Owner, Repository, Branch inputs, plus Personal Access Token and Passphrase fields with transient memory badges. Enter values and save; reload browser tab. Non-sensitive repository coordinates (Owner, Repo, Branch) remain persisted in settings, while PAT and Passphrase fields are completely purged from memory.
result: pass

### 3. Encrypted Remote Backup Push & Conflict Detection
expected: In Settings -> Sao lưu & Dữ liệu -> "Đồng bộ GitHub", provide PAT and Passphrase, then click "Sao lưu lên GitHub". System exports, encrypts with PBKDF2/AES-GCM-256, and pushes to .task-management/backup.enc.json with status updating to success and showing truncated 7-char SHA. If remote file changed externally or SHA mismatches, an interactive Conflict Modal displays showing local vs remote SHA and requires typing 'OVERWRITE' before force pushing.
result: pass

### 4. Remote Encrypted Backup Pull, Passphrase Prompt & Preview Restore
expected: In "Đồng bộ GitHub", click "Tải từ GitHub". If passphrase is not in memory or incorrect, GitHubPassphraseModal prompts for passphrase and offers a raw encrypted file download fallback if corrupt. Upon successful decryption, ImportPreviewModal appears displaying diff inspection across projects, milestones, tasks, and capacity rules. Confirming with 'RESTORE' performs atomic Dexie restore with a pre-import rollback snapshot banner.
result: pass

### 5. Offline Autonomy & Decoupled Local Data Operations
expected: Disconnect network or run offline. All core features (Tasks, Projects, Milestones, Capacity, Dashboard) and local JSON Export/Import operate 100% autonomously without GitHub credentials, errors, or blocking prompts.
result: pass

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
