---
phase: "36"
slug: "data-model-multi-chat-identity-backup-migration"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-10"
---

# Phase 36 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> **Draft.** Seeded from `36-RESEARCH.md` §Validation Architecture. No test has been run for this phase. Task IDs below come from plans 36-01..36-05; `nyquist_compliant` stays `false` until validate-phase certifies the phase.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest `^5.0.2` (+ `@testing-library/react 16.3.3`, `fake-indexeddb 6.2.5`, `jsdom`) |
| **Config file** | `vite.config.ts` (`test:` block, line 65+; `environment: 'jsdom'`, `setupFiles: ['./tests/setup.ts']`, `fileParallelism: false`) |
| **Quick run command** | `npx vitest run tests/services/ai/office/aiTeamRepo.test.ts tests/services/ai/office/aiOfficeRepo.test.ts` |
| **Full suite command** | **Not run.** Project memory + parent directive: the full Vitest suite takes about an hour. Phase gate = the focused set in §Sampling Rate + `npx tsc --noEmit`. |
| **Estimated runtime** | ~20-60s per Dexie suite; `tests/services/ai/office/teamRunCoordinator.test.ts` is the slowest (~60s due to `waitFor`/sleep polls). Focused set ~3-5 min. |

---

## Sampling Rate

- **After every task commit:** the task's own test file + `npx tsc --noEmit`
- **After every plan wave:** the 2-4 test files touched by that wave
- **Before `/gsd-verify-work`:** focused set green + `npx tsc --noEmit` exit 0. **Never** `npm test`.
- **Max feedback latency:** ~90s per focused run

**Focused set (phase gate):**

```
npx vitest run \
  tests/db/schemaV19Migration.test.ts \
  tests/db/tableListParity.test.ts \
  tests/db.test.ts \
  tests/services/ai/office/aiSkillVersionRepo.test.ts \
  tests/services/ai/office/aiOfficeRepo.test.ts \
  tests/services/ai/office/aiTeamRepo.test.ts \
  tests/services/ai/office/teamTranscriptRepo.test.ts \
  tests/services/ai/office/teamRunCoordinator.test.ts \
  tests/services/backup/officeBackup.test.ts \
  tests/services/backup/restoreBackup.test.ts \
  tests/services/backup/validateBackup.test.ts \
  tests/services/backup/v2Compatibility.test.ts \
  tests/services/backup/exportBackup.test.ts \
  tests/backup/tabCheckpointBackup.test.ts \
  tests/services/github/githubPullRestore.test.ts \
  tests/validation/backupSchemas.test.ts \
  tests/validation/backupSchemasTimer.test.ts \
  tests/noteAttachments.test.ts \
  tests/services/localSqlitePersistence.test.ts \
  tests/views/TeamsView.test.tsx \
  tests/views/AiOfficeView.test.tsx \
  tests/views/SettingsView.test.tsx
```

plus `npx tsc --noEmit`.

---

## Per-Task Verification Map

> **Task IDs map to the plans on disk.** Rows are keyed by requirement + behavior. Task labels are `36-<plan>-T<n>` in plan order. One row per task: 13 tasks across 5 plans, no duplicates.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 36-01-T1 | 36-01 | 1 | AIO-DATA-01, AIO-DATA-04 | T-36-03, T-36-04, T-36-05, T-36-06, T-36-12 | Restore iterates allowlists only; TS list ⊆ Rust allowlist; new table carries no secret; envelope gate rejects 11/13 before any write | migration + round-trip | `npx vitest run tests/db/schemaV19Migration.test.ts tests/db.test.ts tests/services/backup/officeBackup.test.ts tests/services/backup/exportBackup.test.ts tests/services/backup/validateBackup.test.ts tests/services/backup/restoreBackup.test.ts tests/services/backup/v2Compatibility.test.ts tests/validation/backupSchemas.test.ts tests/validation/backupSchemasTimer.test.ts tests/noteAttachments.test.ts tests/backup/tabCheckpointBackup.test.ts tests/services/github/githubPullRestore.test.ts tests/views/SettingsView.test.tsx tests/services/localSqlitePersistence.test.ts` | ✅ existing (extended) + ❌ new `schemaV19Migration` | ⬜ pending |
| 36-01-T2 | 36-01 | 1 | AIO-DATA-01, AIO-DATA-05 | T-36-03 | Table-name allowlist parity; no SDLC store resurrected; purge asserted against the 17→18 step | static/unit | `npx vitest run tests/db/tableListParity.test.ts tests/db/schemaV19Migration.test.ts` | ❌ new | ⬜ pending |
| 36-02-T1 | 36-02 | 2 | AIO-DATA-02, AIO-DATA-03 | — | Historical attribution survives restore; lock timestamp survives; empty group is valid | round-trip | `npx vitest run tests/services/backup/officeBackup.test.ts` | ✅ existing (add cases; red first) | ⬜ pending |
| 36-02-T2 | 36-02 | 2 | AIO-GROUP-03, AIO-GROUP-05 | T-36-08, T-36-09, T-36-10 | Lock enforced on `assignLeader` and on a generic `updateTeam` patch; idempotent lock; no cap | unit | `npx vitest run tests/services/ai/office/aiTeamRepo.test.ts` | ✅ existing (rewrite 3 cap cases) | ⬜ pending |
| 36-02-T3 | 36-02 | 2 | AIO-GROUP-02, AIO-GROUP-05, AIO-DATA-03 | T-36-07 | Live refs only; historical `targetAgentId` deliberately unvalidated; whole-payload refusal before write | unit | `npx vitest run tests/services/backup/validateBackup.test.ts tests/services/backup/officeBackup.test.ts` | ✅ existing (add cases) | ⬜ pending |
| 36-03-T1 | 36-03 | 3 | AIO-GROUP-05 | T-36-02 | In-flight snapshot counts as live use; registry never persisted | unit | `npx vitest run tests/services/ai/office/aiOfficeRepo.test.ts` | ✅ existing (add cases) | ⬜ pending |
| 36-03-T2 | 36-03 | 3 | AIO-GROUP-05 | T-36-01, T-36-13 | Refusal names teams/agents, never UUIDs; no partial cascade | unit | `npx vitest run tests/services/ai/office/aiOfficeRepo.test.ts` | ✅ existing (rewrite 2 bare-delete cases) | ⬜ pending |
| 36-03-T3 | 36-03 | 3 | AIO-GROUP-02, AIO-DATA-03 | T-36-02 | Per-turn roster snapshot incl. the lead resolved from `listLeads` at turn start; D-17 rename does not rewrite history | unit + component | `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts tests/services/ai/office/teamTranscriptRepo.test.ts tests/views/TeamsView.test.tsx` | ✅ existing (add cases) | ⬜ pending |
| 36-04-T1 | 36-04 | 4 | AIO-GROUP-03 | — | No cap copy or cap enforcement in list/card/drawer; cap constant deleted with its importers | component | `npx vitest run tests/views/TeamsView.test.tsx` | ✅ existing (rewrite cap cases) | ⬜ pending |
| 36-04-T2 | 36-04 | 4 | AIO-GROUP-03 | T-36-16 | `disabled` is UX only; repo refuses a locked-leader change; leader Select options come from `listLeads` in `TeamWorkspace` via the drawer `leads` prop | component | `npx vitest run tests/views/TeamsView.test.tsx` | ✅ existing (add cases) | ⬜ pending |
| 36-04-T3 | 36-04 | 4 | AIO-GROUP-05 | T-36-14, T-36-15 | UI renders the repo refusal; alert names humans only | component | `npx vitest run tests/views/AiOfficeView.test.tsx` | ✅ existing (add cases) | ⬜ pending |
| 36-05-T1 | 36-05 | 5 | AIO-DATA-01 | T-36-12 | Pending stays pending; monotonic version under concurrency; no AI-approved writer | unit | `npx vitest run tests/services/ai/office/aiSkillVersionRepo.test.ts` | ❌ new | ⬜ pending |
| 36-05-T2 | 36-05 | 5 | AIO-DATA-01 | T-36-17, T-36-18 | D-19 unfinished-turn inferred from persisted rows; survives restore; no runtime status persisted | unit + component | `npx vitest run tests/services/ai/office/teamTranscriptRepo.test.ts tests/views/TeamsView.test.tsx` | ✅ existing (add cases) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Intentional-red steps (AIO-VERIFY-02 "reproduce before fix"):** the `targetAgentId` case must be added and observed failing **before** `BackupChatMessageRecordSchema` gains the field. Evidence from research: `BackupChatMessageRecordSchema.parse({...targetAgentId...})` currently returns an object without the key (`has targetAgentId after parse: false`).

---

## Wave 0 Requirements

- [ ] `tests/db/schemaV19Migration.test.ts` — mirror `tests/db/schemaV17Migration.test.ts` but seed at **V17** (`new Dexie(name).version(17).stores(SCHEMA_V17)`), so the real 17→18 purge hook and the 18→19 additive step both run. Opening `TaskPlannerDatabase` then asserts existing rows survive and `aiSkillVersions` exists empty.
- [ ] `tests/db/tableListParity.test.ts` — `readFileSync` both `src/services/localSqlitePersistence.ts` and `src-tauri/src/sqlite_persistence.rs`, parse the two table lists, assert every TS name appears in Rust and that `aiSkillVersions` is in both.
- [ ] `tests/services/ai/office/aiSkillVersionRepo.test.ts` — create pending, list by skill, decide approved/rejected, `version` monotonic per skill (36-05 T1).
- [ ] New cases inside existing files (no new files): `targetAgentId` round-trip, `leaderLockedAt` round-trip, D-13 in-flight guard, per-turn fresh roster, D-17 rename, D-19 interrupted-turn inference.

*No framework install needed — Vitest, jsdom, testing-library and fake-indexeddb are already configured.*

---

## Manual-Only Verifications

> None of these has been executed. No Tauri runtime check has been performed for this phase.

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Empty group → assign leader → first run locks leader → relaunch keeps lock | D-05, D-09 | Needs Tauri + real DB; the lock must survive process restart, which jsdom cannot prove. | `npm run tauri:dev` → create a group with only a name → open group settings → pick a leader → send one message → leader select is disabled → quit and reopen → still disabled, and the `aiTeams` row has `leaderLockedAt`. |
| Deleting an in-use leader/agent/skill is refused with the team names | AIO-GROUP-05, D-10..D-12 | Needs the real UI; the refusal copy must be readable. | Delete the lead of an active group → an alert names the group(s); no row disappears. |
| Export → restore in the real app keeps `targetAgentId` and the pending skill version | AIO-DATA-02/03 | Needs filesystem + process. | Export backup, clear local DB (or use a fresh profile), restore, open the group transcript → attribution intact; open skill versions → pending still pending. |
| SQLite flush emits no `SQLITE_INVALID_TABLE` for `chatTabs`/`systems`/`changeRequests`/`aiSkillVersions` | Pitfall 8 (Rust allowlist drift) | The Rust allowlist only takes effect in a Tauri build. | Enable a SQLite path in Settings, touch a CR, a chat tab and a skill version, confirm no `SQLITE_INVALID_TABLE` in the log, inspect `planner_rows` in the `.sqlite` file. |
| `cargo test --manifest-path src-tauri/Cargo.toml sqlite_persistence` | Pitfall 8 | `src-tauri/target/` does not exist; the first build compiles `rusqlite` bundled + `ssh2` vendored-openssl and may fail offline. | Optional. If it runs, move the Rust test's `"projects"` rows (lines 201/212) to a table that still exists. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s per focused run
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
