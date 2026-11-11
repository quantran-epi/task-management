---
status: testing
phase: 36-data-model-multi-chat-identity-backup-migration
source: [36-VERIFICATION.md]
started: 2026-11-11T00:10:00Z
updated: 2026-11-11T00:10:00Z
---

## Current Test

number: 1
name: Leader lock survives relaunch
expected: |
  The leader select is disabled after the first send, and the persisted aiTeams row
  still carries leaderLockedAt after relaunch.
awaiting: user response

## Tests

### 1. Leader lock survives relaunch
expected: Create a group with only a name, assign a leader in group settings, send one message, then quit and reopen the app. The leader select is disabled after the first send, and the persisted `aiTeams` row still carries `leaderLockedAt` after relaunch.
why_human: D-09 requires the lock to survive a real process restart; jsdom cannot prove Tauri relaunch durability.
result: [pending]

### 2. Delete refusals are readable in the real UI
expected: Delete the lead of an active group, then delete an agent still on a roster, then a skill assigned to an agent. Each delete is refused with a readable alert naming the groups/agents; no row disappears; no UUID is shown.
why_human: AIO-GROUP-05 / C-15 require the refusal to be observable in the real UI, not only asserted in jsdom.
result: [pending]

### 3. Export → restore keeps attribution and pending state
expected: Export a backup with a group transcript, a `targetAgentId` instruction and a pending skill version; restore it into a cleared local DB. Attribution and `targetAgentId` are intact, the pending version is still pending, and counts match.
why_human: AIO-DATA-02/03 need the real filesystem + process path, not the in-memory envelope.
result: [pending]

### 4. SQLite flush accepts the new tables
expected: Enable a SQLite path in Settings, touch a chat tab, a CR and a skill version, then inspect the log and `planner_rows`. No `SQLITE_INVALID_TABLE` for `aiSkillVersions`/`chatTabs`/`systems`/`changeRequests`; rows land in the `.sqlite` file.
why_human: The Rust allowlist only takes effect in a Tauri build; the parity test is static.
result: [pending]

### 5. Optional: Rust allowlist test
expected: `cargo test --manifest-path src-tauri/Cargo.toml sqlite_persistence` passes. The fixture now seeds `notes` instead of the dropped `projects`/`milestones` stores (IN-04, allowlist trimmed by quick 261111-d2p), but that edit is compile-unverified — it still needs one real cargo run.
why_human: `src-tauri/target/` does not exist; the first build compiles rusqlite bundled + vendored openssl.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
