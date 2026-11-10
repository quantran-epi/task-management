---
phase: 36-data-model-multi-chat-identity-backup-migration
verified: 2026-11-11T00:05:00Z
status: human_needed
score: 5/5 roadmap criteria verified (C-16 replacements applied)
overrides_applied: 0
overrides:
  - must_have: "Export → validate → restore round-trips a pre-v1.4 fixture and a v1.4 fixture with matching counts"
    reason: "Replaced by C-16 / D-23: verified instead as a fresh-data v12 round-trip covering IDs, counts, attribution, pending state and the leader lock. No pre-v1.4 fixture is kept."
    accepted_by: "user (36-CONTEXT.md D-23)"
    accepted_at: "2026-11-10"
  - must_have: "A backup produced by the previous build still imports; a backup produced by this build is read by the previous build without corruption"
    reason: "Replaced by C-16 / D-23: two-way old-build compatibility is explicitly dropped. Older envelopes are rejected at the gate; the current build's own v12 round-trip is verified."
    accepted_by: "user (36-CONTEXT.md D-23)"
    accepted_at: "2026-11-10"
  - must_have: "Persisted SDLC rows are handled non-destructively — filtered from the UI, not silently deleted"
    reason: "Replaced by C-16 / D-24 and the Phase 35 deletion: SDLC rows are purged in the V18 hook and never restored; no archive or filter-only path is kept."
    accepted_by: "user (36-CONTEXT.md D-24)"
    accepted_at: "2026-11-10"
re_verification: false
deferred:
  - truth: "D-19 interrupted-turn inference also covers @mention turns"
    addressed_in: "Phase 37"
    evidence: "Phase 37 goal: 'A run always terminates, a double submit never corrupts state...' — owns the mention-turn lifecycle (user-message → report pairing). Recorded in the listInterruptedAssignments file comment and 36-05-SUMMARY.md."
human_verification:
  - test: "Create a group with only a name, assign a leader in group settings, send one message, then quit and reopen the app"
    expected: "The leader select is disabled after the first send, and the persisted aiTeams row still carries leaderLockedAt after relaunch"
    why_human: "D-09 requires the lock to survive a real process restart; jsdom cannot prove Tauri relaunch durability"
  - test: "Delete the lead of an active group, then delete an agent still on a roster, then a skill assigned to an agent"
    expected: "Each delete is refused with a readable alert naming the groups/agents; no row disappears; no UUID is shown"
    why_human: "AIO-GROUP-05 / C-15 require the refusal to be observable in the real UI, not only asserted in jsdom"
  - test: "Export a backup with a group transcript, a targetAgentId instruction and a pending skill version; restore it into a cleared local DB"
    expected: "Attribution and targetAgentId are intact, the pending version is still pending, and counts match"
    why_human: "AIO-DATA-02/03 need the real filesystem + process path, not the in-memory envelope"
  - test: "Enable a SQLite path in Settings, touch a chat tab, a CR and a skill version, then inspect the log and planner_rows"
    expected: "No SQLITE_INVALID_TABLE for aiSkillVersions/chatTabs/systems/changeRequests; rows land in the .sqlite file"
    why_human: "The Rust allowlist only takes effect in a Tauri build; the parity test is static"
  - test: "Optional: cargo test --manifest-path src-tauri/Cargo.toml sqlite_persistence"
    expected: "Rust allowlist tests pass (the fixture still seeds dropped projects/milestones tables — IN-04)"
    why_human: "src-tauri/target/ does not exist; first build compiles rusqlite bundled + vendored openssl"
---

# Phase 36: Data model, multi-chat identity, backup/migration Verification Report

**Phase Goal:** Establish the group-chat data model, the skill-version store, and a backup path that loses nothing — before any runtime work depends on it.
**Verified:** 2026-11-11T00:05:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP contract, overrides applied)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Dexie V19 adds `aiSkillVersions` and the additive indexes; all coordinated table lists updated in one change, with a TS⊆Rust assertion test (D-22: V19, not V18) | ✓ VERIFIED | `src/db/schema.ts:137-144` (`SCHEMA_V19`, `LATEST_SCHEMA_VERSION = 19`), `src/db/index.ts:552` (`this.version(19).stores(SCHEMA_V19)`), `tests/db/tableListParity.test.ts` reads both real sources; wiring present in `types/backup.ts`, `backupSchemas.ts`, `exportBackup.ts`, `validateBackup.ts`, `restoreBackup.ts` (7 refs), `localSqlitePersistence.ts:33`, `src-tauri/src/sqlite_persistence.rs:27`. Test run: 94 passed across 7 files |
| 2 | `targetAgentId` survives export → restore; assignment history is no longer stripped | ✓ VERIFIED | `src/validation/backupSchemas.ts:328` (`targetAgentId: uuidSchema.optional()` on a `strictObject`), `src/types/models.ts:302`; `tests/services/backup/officeBackup.test.ts:255` asserts the restored value; `validateBackup.test.ts:489` accepts a historical ref to a deleted employee |
| 3+4 | C-16 / D-23 replacement: a fresh-data v12 round-trip preserves IDs, counts, attribution, pending state and the leader lock | ✓ VERIFIED | `officeBackup.test.ts:203` (v12 export + exact counts), `:227` (row-identity round-trip + 4 attribution fields), `:279` (`leaderLockedAt`), `:312` (pending stays pending, no `decidedAt`), `:323` (double restore identical counts); envelope gate rejects `< 12` and `> 12` before table reads (`validateBackup.ts:93-106`) |
| 5 | Deleting a leader, agent, or skill with live references refuses or cascades in one transaction; the user's own next export validates | ✓ VERIFIED | `aiOfficeRepo.ts:113-134, 193-213, 264-282` — guard + write inside one `rw` tx; `deleteSkill` cascades `aiSkillVersions` after the guard; `deleteTeam` now removes the `team:<id>` thread, messages and tabs (`aiTeamRepo.ts:281-300`); tests `aiOfficeRepo.test.ts:101-133, 155-232, 280-323` include "next export valid after delete" both for skill and lead |
| 6 | `MAX_ACTIVE_TEAMS` and `MAX_EMPLOYEES_PER_TEAM` are gone; roster editing after creation works | ✓ VERIFIED | `grep` over `src/` and `tests/` returns zero matches for both constants and `ACTIVE_TEAM_CAP_MESSAGE`; `TeamSettingsDrawer.tsx:215-280` roster + leader block wired to `assignLeader`/`addTeamMember`/`removeTeamMember`; `TeamEditorDrawer.tsx:55` `valid = name.trim().length > 0`; tests `TeamsView.test.tsx:152-251, 475-551` |

**Score:** 5/5 roadmap criteria verified.

Plan-level must-haves (30 truths across 5 plans) all verified against code and tests; the specific ones worth naming:

| Truth | Status | Evidence |
|-------|--------|----------|
| Empty group is a valid stored `AiTeam` with no lead member row (D-05) | ✓ VERIFIED | `createTeam` writes a lead row only when `leadId` is present (`aiTeamRepo.ts:106-118`); `officeBackup.test.ts:290`; `aiTeamRepo.test.ts:122` |
| Leader lock is durable and enforced on every write path (D-09) | ✓ VERIFIED | `assertLeaderUnlocked` called from `updateTeam` and `assignLeader` (`aiTeamRepo.ts:142-147, 159, 229`); `lockLeader` idempotent and refuses a leaderless group; tests `aiTeamRepo.test.ts:146-213` |
| `leadId` and the `role='lead'` member row always agree | ✓ VERIFIED | `writeLeadRow` shared by `updateTeam`/`assignLeader`; `addTeamMember` rejects `role:'lead'` (`aiTeamRepo.ts:347-349`); validator checks both directions (`validateBackup.ts:498-521`) |
| In-flight turn counts as live use (D-13) | ✓ VERIFIED | `liveUseRegistry.ts` + `claimLiveUse`/`releaseLiveUse` around each turn, released in `settleAgent` and in both `start()` catch paths (`teamRunCoordinator.ts:322-356, 656-679, 730-748`); tests `aiOfficeRepo.test.ts:123, 176` and `teamRunCoordinator.test.ts` (44 passed) |
| Per-turn roster snapshot; a persona edit reaches the next turn only (D-03/D-07) | ✓ VERIFIED | `loadRoster` seam, `roster` mutable, `send()` reads once; `TeamWorkspace.tsx:243-262` reads `getTeam` then matches `leadId`; tests `TeamsView.test.tsx:422, 660` |
| Skill version numbering monotonic, status never derived, evidence absent when omitted | ✓ VERIFIED | `aiSkillVersionRepo.ts:43-85`; 7/7 tests pass |
| D-19 unfinished turn inferred from persisted rows, no persisted runtime status | ✓ VERIFIED | `teamTranscriptRepo.ts:128-158` pure read; `grep` finds no `chatTabs.status`/`ai*` writer for an in-flight turn; warning rendered at `TeamWorkspace.tsx:621-643`; tests `teamTranscriptRepo.test.ts` + `TeamsView.test.tsx:562-618` |

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | D-19 inference for @mention turns | Phase 37 | Phase 37 owns the mention-turn lifecycle (user-message → report pairing); documented in the `listInterruptedAssignments` file comment and 36-05-SUMMARY.md |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/db/schema.ts` | `SCHEMA_V19` additive, `LATEST_SCHEMA_VERSION = 19` | ✓ VERIFIED | No `.upgrade()` hook; index spec `id, skillId, [skillId+version], status, createdAt` |
| `src/db/index.ts` | `version(19)`, typed `aiSkillVersions` table | ✓ VERIFIED | Lines 94, 552 |
| `src/types/aiOffice.ts` | `AiSkillVersion`, `AiSkillVersionStatus`, optional `leadId`, `leaderLockedAt` | ✓ VERIFIED | Lines 60-120 |
| `src/validation/aiOfficeSchemas.ts` | Status enum defined once, input schema, optional `leadId` | ✓ VERIFIED | Lines 95-143; `AiTeamInput = z.input<...>` |
| `src/validation/backupSchemas.ts` | `BackupAiSkillVersionRecordSchema`, `targetAgentId`, `leaderLockedAt`, v12 | ✓ VERIFIED | Lines 328, 659, 686-700 |
| `src/services/backup/{export,validate,restore}Backup.ts` | Table wired through all paths | ✓ VERIFIED | export 4 refs, validate 7, restore 7 incl. `captureSnapshot` |
| `src/services/localSqlitePersistence.ts` + `src-tauri/src/sqlite_persistence.rs` | Both lists carry `aiSkillVersions` | ✓ VERIFIED | TS line 33, Rust line 27 |
| `src/db/repositories/aiTeamRepo.ts` | Optional lead, `assignLeader`, `lockLeader`, guarded `updateTeam`, cap-free | ✓ VERIFIED | 482 lines; no cap constants |
| `src/db/repositories/aiOfficeRepo.ts` | Typed `AiOfficeDeleteResult`, guarded deletes | ✓ VERIFIED | Lines 33-47, 113-134, 193-213, 264-282 |
| `src/db/repositories/aiSkillVersionRepo.ts` | list/getLatest/create/decide | ✓ VERIFIED | 85 lines, transactional numbering |
| `src/db/repositories/teamTranscriptRepo.ts` | `listInterruptedAssignments` pure reader | ✓ VERIFIED | Lines 128-158 |
| `src/services/ai/office/liveUseRegistry.ts` | begin/end/isAgentInUse/isSkillInUse/reset | ✓ VERIFIED | In-memory only, no Dexie/React import |
| `src/components/ai/office/TeamSettingsDrawer.tsx` | Roster + leader block | ✓ VERIFIED | Lines 215-285 |
| `src/components/ai/office/TeamEditorDrawer.tsx` | Name-only create | ✓ VERIFIED | Line 55 |
| `src/views/AiOfficeView.tsx` | Refusal alert | ✓ VERIFIED | `refusalMessage` + `ai-office-delete-error` (line 232) |
| `tests/db/schemaV19Migration.test.ts`, `tests/db/tableListParity.test.ts`, `tests/services/ai/office/aiSkillVersionRepo.test.ts` | New test files | ✓ VERIFIED | All pass |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/db/index.ts` | `src/db/schema.ts` | `version(19).stores(SCHEMA_V19)` | ✓ WIRED | Line 552 |
| `exportBackup.ts` | `types/backup.ts` | tables/counts include `aiSkillVersions` | ✓ WIRED | Lines 195, 224, 278, 309 |
| `restoreBackup.ts` | `db/index.ts` | `AI_OFFICE_TABLE_KEYS` + `add(targetDb.aiSkillVersions, …)` | ✓ WIRED | Lines 53, 66, 245, 286 |
| `localSqlitePersistence.ts` | Rust `ALLOWED_TABLES` | name parity | ✓ WIRED | Static test reads both sources |
| `aiOfficeRepo.ts` | `liveUseRegistry.ts` | guard reads registry inside the tx | ✓ WIRED | Lines 19, 119, 202, 270 |
| `teamRunCoordinator.ts` | `liveUseRegistry.ts` | `beginTurn`/`endTurn` around each turn | ✓ WIRED | Lines 34, 346-356 |
| `TeamWorkspace.tsx` | `aiOfficeRepo.ts` / `aiTeamRepo.ts` | `loadRoster` reads team row then catalogue; `lockLeader` before first send | ✓ WIRED | Lines 243-262, 367-386 |
| `TeamSettingsDrawer.tsx` | `aiTeamRepo.ts` | `onAssignLeader`/`onAddMember`/`onRemoveMember` | ✓ WIRED | Drawer props → `TeamWorkspace.tsx:728-740` |
| `AiOfficeView.tsx` | `aiOfficeRepo.ts` | reads `AiOfficeDeleteResult`, renders `IN_USE` | ✓ WIRED | Lines 66-90, 146-153, 232 |
| `TeamWorkspace.tsx` | `teamTranscriptRepo.ts` | `useLiveQuery(listInterruptedAssignments)` | ✓ WIRED | Lines 181-183, 621 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `TeamWorkspace.tsx` roster/lead | `leads`, `liveMembers`, `coordinator.roster` | Dexie `listLeads`/`listTeamMembers`/`getTeam` via `useLiveQuery` + per-turn `loadRoster` | Yes | ✓ FLOWING |
| `TeamSettingsDrawer.tsx` member rows | `members`, `leads` props | `useLiveQuery` over `aiTeamMembers`/`aiLeads` | Yes | ✓ FLOWING |
| `TeamWorkspace.tsx` interrupted alert | `interrupted` | `listInterruptedAssignments` over `chatMessages` + `aiEmployees` | Yes | ✓ FLOWING |
| `AiOfficeView.tsx` delete alert | `deleteError` | repo `AiOfficeDeleteResult.usedBy` (team/agent names) | Yes | ✓ FLOWING |
| `aiSkillVersionRepo` | version rows | `aiSkillVersions` table via compound index | Yes (contract store, no UI yet by D-16) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Typecheck the whole tree | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| V19 migration, parity, skill-version repo, team/office repos, backup round-trip, validator | `npx vitest run tests/db/schemaV19Migration.test.ts tests/db/tableListParity.test.ts tests/services/ai/office/aiSkillVersionRepo.test.ts tests/services/ai/office/aiTeamRepo.test.ts tests/services/ai/office/aiOfficeRepo.test.ts tests/services/backup/officeBackup.test.ts tests/services/backup/validateBackup.test.ts` | 7 files, 94 passed | ✓ PASS |
| Transcript inference + both views | `npx vitest run tests/services/ai/office/teamTranscriptRepo.test.ts tests/views/TeamsView.test.tsx tests/views/AiOfficeView.test.tsx` | 3 files, 66 passed (5 pre-existing `DatabaseClosedError` unhandled rejections) | ✓ PASS |
| DB/backup/sqlite/schema sweep | `npx vitest run tests/db.test.ts tests/services/backup/exportBackup.test.ts tests/services/backup/v2Compatibility.test.ts tests/services/localSqlitePersistence.test.ts tests/validation/backupSchemas.test.ts tests/validation/backupSchemasTimer.test.ts tests/services/backup/restoreBackup.test.ts` | 7 files, 57 passed | ✓ PASS |
| Legacy migration + tab/attachment/github/settings | `npx vitest run tests/backup/tabCheckpointBackup.test.ts tests/services/github/githubPullRestore.test.ts tests/noteAttachments.test.ts tests/views/SettingsView.test.tsx` and `tests/db/schemaV17Migration.test.ts tests/db/sdlcPurgeMigration.test.ts` | 6 files, 37 passed | ✓ PASS |
| Coordinator contract | `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts` | 44 passed | ✓ PASS |
| Cap constants removed | `grep -rn "MAX_ACTIVE_TEAMS\|MAX_EMPLOYEES_PER_TEAM\|ACTIVE_TEAM_CAP_MESSAGE" src/ tests/` | no matches | ✓ PASS |
| No SDLC store resurrected | V19 migration test asserts `projects`/`milestones`/`sdlc*` absent and the V18 purge deleted seeded rows | pass | ✓ PASS |
| Probe discovery | `find scripts -path '*/tests/probe-*.sh'` | no probes exist; plans reference a "probe-edge register" (documentation), not executable probes | ? SKIP |

Note: the three failures deferred in 36-01-SUMMARY (`noteAttachments` ×2, `tabCheckpointBackup` ×1) now pass at HEAD — that deferral is stale, not an open gap.

### Probe Execution

No executable probes exist in the repository (`find scripts -path '*/tests/probe-*.sh'` returns nothing). The "probe-edge register" mentioned in the plans is a documentation table, not a probe script. Step 7c: SKIPPED.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| AIO-GROUP-02 | 36-02, 36-03 | `AiTeam` is the group chat; transcript stays `ChatThread` with `scopeKey = 'team:<teamId>'` | ✓ SATISFIED | `chatRepo.buildScopeKey` yields `team:<id>`; `ensureTeamThread` uses `scopeType:'team'`; validator rejects a nested `:chat:` suffix (`validateBackup.ts:545-554`) |
| AIO-GROUP-03 | 36-02, 36-04 | Roster editable after creation; both caps removed from repo, teamTools and drawer | ✓ SATISFIED | No cap constants anywhere; `TeamSettingsDrawer` roster block wired; `teamTools.ts` uses only `MAX_BATCH_SIZE` (Phase 37 scope, not a roster cap) |
| AIO-GROUP-05 | 36-02, 36-03, 36-04 | Delete with live refs refuses or cascades in one transaction; next export validates | ✓ SATISFIED | Guarded deletes + cascade tests + "next export valid" tests; refusals surfaced as alerts |
| AIO-DATA-01 | 36-01, 36-05 | `aiSkillVersions` in Dexie (V19 per D-22) and all coordinated lists | ✓ SATISFIED | Nine source lists verified + parity test |
| AIO-DATA-02 | 36-02 | `targetAgentId` survives export → restore | ✓ SATISFIED | Schema field + round-trip test |
| AIO-DATA-03 | 36-01, 36-02, 36-03 | Round-trip with matching counts (D-23: fresh-data v12 only) | ✓ SATISFIED | officeBackup tests incl. double-restore count equality |
| AIO-DATA-04 | 36-01 | Old-build two-way compat (D-23: replaced by C-16) | ✓ SATISFIED (override) | Current-build v12 round-trip verified; older/newer envelopes rejected at the gate |
| AIO-DATA-05 | 36-01 | SDLC rows non-destructive (D-24: replaced by C-16 + Phase 35 deletion) | ✓ SATISFIED (override) | V18 purge proven from a V17 seed; no SDLC store or restore path survives |

No orphaned requirements: REQUIREMENTS.md maps exactly these eight IDs to Phase 36, and every one is claimed by at least one plan's `requirements` field.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No `TBD`/`FIXME`/`XXX` in any of the 26 phase files | — | Debt-marker gate clean |
| — | — | No stub returns, placeholder copy or hardcoded-empty props in the phase files | — | No STUB artifacts |
| `src/db/repositories/aiTeamRepo.ts` | 81-133, 183-185 | WR-05 (partially open): `createTeam` and `updateTeam({leadId})` still write an unvalidated lead id; `createSkillVersion` accepts any `skillId` | ⚠️ Warning | Only reachable through the repo API (UI selects real ids). A stale-id race could produce an unrestorable export; D-15 wants the check at the boundary |
| `src/db/repositories/teamTranscriptRepo.ts` | 128-158 | WR-07: inference reports an instruction whose report has not landed yet, so the warning can render during a healthy run | ⚠️ Warning | Advisory false positive; disappears when the report lands. Does not affect the restored-transcript truth |
| `src/db/repositories/aiSkillVersionRepo.ts` | 68-85 | WR-08: `decideSkillVersion` can overwrite an already-decided row | ⚠️ Warning | Phase 39 owns approval; a double decision could rewrite `decidedAt` |
| `src/validation/aiOfficeSchemas.ts` | 129 | WR-09: `evidence` is unbounded free text that round-trips through backup | ⚠️ Warning | No `.max()`, header comment stale; no forbidden-key scan on AI Office records |
| `src/services/backup/restoreBackup.ts` | 241-247 | WR-10: `clearAiOffice` triggers on any single AI table key | ⚠️ Warning | A hand-crafted v12 payload with only `aiSkillVersions` passes validation and wipes AI Office rows. The app's own export always carries all AI tables, so the phase criterion holds |
| `src/db/repositories/aiOfficeRepo.ts` | 117-133, 197-209, 265-278 | WR-11: registry re-check is before the delete await | ⚠️ Warning | Narrow race against a turn starting mid-delete; D-15's atomicity is weaker than stated |
| `src/components/ai/office/TeamWorkspace.tsx` | 547-554, 687-695, 741, 750; `src/views/TeamsView.tsx` 164-166 | WR-12: `void` repo calls without `.catch` | ⚠️ Warning | A throw becomes an unhandled rejection with no UI feedback |
| `src/services/ai/office/teamRunCoordinator.ts` | 470-475, 951-958 | WR-13: `topUp` cannot reach a member added after the last snapshot | ⚠️ Warning | Phase 38 owns top-up accounting; silently does nothing today |
| `src/validation/backupSchemas.ts` | 700 | IN-01/IN-07: two version literals and a missing newline between exports | ℹ️ Info | Cosmetic/drift risk |
| `src/services/backup/validateBackup.ts` | 561-567 | IN-02: dead `schemaVersion === 1` normalization block | ℹ️ Info | Unreachable |
| `src/validation/aiOfficeSchemas.ts` | 143 | IN-03: unused exported `AiSkillVersionInput` | ℹ️ Info | Dead export |
| `src-tauri/src/sqlite_persistence.rs` | 6-31 | IN-04: allowlist still lists dropped `projects`/`milestones` | ℹ️ Info | TS⊆Rust holds; allowlist wider than schema |
| `src/db/repositories/aiOfficeRepo.ts` | 197 | IN-05: `deleteLead` transaction includes `aiTeamMembers` (now read by WR-06) | ℹ️ Info | Resolved by the WR-06 fix |
| `src/db/repositories/teamTranscriptRepo.ts` | 76 | IN-06: comparator returns 0 for unequal timestamps | ℹ️ Info | Correct only because the preceding sort is stable |
| `src/workbench/toolwindows/AiOfficeExplorer.tsx` | 20-30, 149 | IN-08: stale status maps; team card "Cài đặt nhóm" routes to the workspace | ℹ️ Info | UX polish; not a phase criterion |

None of the open warnings blocks a roadmap success criterion: every one is either a repo-API-only hardening gap, an advisory UI false positive, or explicitly owned by Phase 37/38/39.

### Human Verification Required

1. **Leader lock survives relaunch**
   **Test:** Create a group with only a name, assign a leader in group settings, send one message, quit and reopen the app.
   **Expected:** The leader control is disabled after the first send, and the persisted `aiTeams` row still carries `leaderLockedAt` after relaunch.
   **Why human:** D-09 requires durability across a real process restart; jsdom cannot prove Tauri relaunch.

2. **Delete refusals are readable in the real UI**
   **Test:** Delete the lead of an active group, an agent still on a roster, and a skill assigned to an agent.
   **Expected:** Each delete is refused with an alert naming the groups/agents; no row disappears; no UUID appears.
   **Why human:** AIO-GROUP-05 / C-15 require the refusal to be observable in a real walkthrough.

3. **Real export → restore keeps attribution and pending state**
   **Test:** Export a backup containing a group transcript, a `targetAgentId` instruction and a pending skill version; restore into a cleared local DB.
   **Expected:** `targetAgentId` and attribution intact, pending still pending, counts match.
   **Why human:** AIO-DATA-02/03 need the real filesystem + process path.

4. **SQLite flush accepts the new and drifted tables**
   **Test:** Enable a SQLite path in Settings, touch a chat tab, a CR and a skill version, inspect the log and `planner_rows`.
   **Expected:** No `SQLITE_INVALID_TABLE` for `aiSkillVersions`/`chatTabs`/`systems`/`changeRequests`.
   **Why human:** The Rust allowlist only takes effect in a Tauri build.

5. **Optional Rust allowlist test**
   **Test:** `cargo test --manifest-path src-tauri/Cargo.toml sqlite_persistence`.
   **Expected:** Passes (fixture still seeds dropped `projects`/`milestones` — IN-04).
   **Why human:** `src-tauri/target/` does not exist; first build compiles bundled rusqlite + vendored openssl.

### Gaps Summary

No must-have truth failed. The data model, the V19 additive migration, the skill-version store, the leader lock, the guarded deletes and the v12 backup round-trip are all present, wired and exercised by 298 passing focused tests plus a clean `tsc --noEmit`.

The three critical review findings (zero-budget gate, leader budget wipe, `deleteTeam` orphan thread) are fixed and verified in code (`budgetGate.ts:66-72`, `aiTeamRepo.ts:203-247, 281-300`). Six warnings are also fixed (WR-01..WR-04, WR-06, plus the `addTeamMember` half of WR-05). The remaining warnings are hardening gaps at the repo/import boundary or advisory UI defects, and none blocks a phase success criterion.

Status is `human_needed` because five behaviors are only provable in a real Tauri build: leader-lock durability across relaunch, readable delete refusals, a real export/restore, the SQLite flush, and the optional Rust test.

---

_Verified: 2026-11-11T00:05:00Z_
_Verifier: Claude (gsd-verifier)_
