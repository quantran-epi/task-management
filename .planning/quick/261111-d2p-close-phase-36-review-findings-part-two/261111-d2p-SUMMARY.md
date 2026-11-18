---
phase: quick-261111-d2p
plan: 01
subsystem: ai-office / backup / tauri-persistence
tags: [review-findings, data-safety, error-handling, cleanup]
status: complete
key-files:
  created: []
  modified:
    - src/db/repositories/aiOfficeRepo.ts
    - src/db/repositories/aiSkillVersionRepo.ts
    - src/db/repositories/teamTranscriptRepo.ts
    - src/components/ai/office/TeamWorkspace.tsx
    - src/views/TeamsView.tsx
    - src/workbench/toolwindows/AiOfficeExplorer.tsx
    - src/services/ai/office/teamRunCoordinator.ts
    - src/validation/aiOfficeSchemas.ts
    - src/validation/backupSchemas.ts
    - src/types/aiOffice.ts
    - src/types/backup.ts
    - src/db/schema.ts
    - src/services/backup/exportBackup.ts
    - src/services/backup/validateBackup.ts
    - src-tauri/src/sqlite_persistence.rs
    - .planning/ROADMAP.md
    - .planning/phases/36-data-model-multi-chat-identity-backup-migration/36-CHECKPOINT.md
    - .planning/phases/36-data-model-multi-chat-identity-backup-migration/36-UAT.md
decisions:
  - "WR-11: second live-use check placed after the last await in each delete, with a comment that claims only the async window is closed, not full atomicity."
  - "WR-08: decision finality is a hard refusal, not a no-op, so the caller sees that the request was rejected."
  - "WR-07: filtering lives at the render site so listInterruptedAssignments stays pure and phase-37-extensible."
  - "WR-12: one fixed Vietnamese copy for every fire-and-forget failure — repo messages embed ids and must not reach the UI."
  - "IN-01: BACKUP_SCHEMA_VERSION is the single literal; exportBackup re-exports it as CURRENT_SCHEMA_VERSION to avoid touching every importer."
  - "WR-13 is recorded only (ROADMAP phase 38) — its fix belongs to that phase's roster/budget redesign."
metrics:
  duration: "16 min"
  completed: 2026-11-11T02:51:45Z
actuals:
  tokens: 10069
  tasks: 5
  commits: 5
plan_head_before: a549a4238611a9a5b540f194cc5141f3e32e286f
plan_head_after: 8918643336b2cfb1aa1e0aea74e85c2b87460559
---

# Quick 261111-d2p: Close phase-36 review findings, part two

Part one fixed the two data-safety blockers (WR-05, WR-10). This plan closes the remaining
phase-36 findings: a decision that could be overwritten, a delete guard with an async window,
a banner that fired mid-run, unguarded fire-and-forget writes, an unbounded free-text carrier,
five info-level defects, and the WR-13 record under phase 38.

## What changed

**WR-11 + WR-08 — delete window and decision finality** (`4f6ea24f`)
- `deleteEmployee`, `deleteLead`, `deleteSkill` re-consult the live-use registry after their last
  `await`, immediately before the delete. The comment above the first check states the fact
  honestly: Dexie serialises overlapping transactions on the same stores, so only the synchronous
  registry lookup remains as a window — not full atomicity.
- `decideSkillVersion` refuses a non-pending row (`ALREADY_DECIDED_MESSAGE`) and its not-found
  error is now `MISSING_VERSION_MESSAGE`, matching the UUID-free `MISSING_SKILL_MESSAGE` pattern.
- Tests: file-level partial mock of `liveUseRegistry` (delegates to the real implementation by
  default) proves both deletes refuse when the claim appears only at the second check, and that an
  approved row keeps its status and `decidedAt` after a refused re-decision.

**WR-07 — interrupted banner** (`e4623879`)
- `TeamWorkspace` derives `interruptedVisible` from the live-query result minus any agent with a
  non-terminal status in `snapshot.agents`; both the length gate and the description use it.
- Test drives a real `delegate_batch` turn whose employee loop is parked on a deferred, asserts the
  banner is absent while the turn is live and after it settles.

**WR-12 + IN-08c — one error channel** (`d882bdf4`)
- `runAction` wraps settings save, both sidebar toggles, link removal and the toolbox mutation
  toggle; one closable `Alert` (`team-action-error`) renders above the config-error branch.
- `handleAddLink` stays silent only for `'Mục này đã được liên kết với nhóm.'`.
- `TeamsView` activate/pause rejections call `message.error` with fixed copy.
- Tests: partial mock of `aiTeamRepo` makes one write reject; asserts the alert text, that the raw
  repo message never renders, and that the toast fires.

**WR-09 + IN-01..IN-03 + IN-07 — bounds and dead code** (`cff0ae7e`)
- `evidence` capped at 2000 chars in `AiSkillVersionInputSchema` and
  `BackupAiSkillVersionRecordSchema`; the `src/types/aiOffice.ts` header now names it as a third
  free-text carrier and explains why the key-matched denylist cannot cover it.
- `exportBackup` imports `BACKUP_SCHEMA_VERSION` and aliases it as `CURRENT_SCHEMA_VERSION`.
- Deleted the unreachable v1 backfill and the unused `AiSkillVersionInput` type; split the
  double-export line and collapsed trailing blank-line runs.

**IN-04 + IN-06 + IN-08a/b/d + WR-13 record** (`89186433`)
- Rust `ALLOWED_TABLES` no longer names `projects`/`milestones`; the unit-test fixture seeds
  `notes` instead, so the "only the tasks row survives" assertion is unchanged.
- `readThreadMessages` orders unequal timestamps explicitly.
- `AiOfficeExplorer` status maps are `Record<AiTeamStatus, string>` over exactly `active`/`idle`,
  with no raw-enum fallback; a test asserts an idle team renders "Nhàn rỗi".
- `TeamWorkspace` takes `initialSettingsOpen`; `TeamsView` sets it from the card's settings path,
  so `team-settings-<id>` lands in the open drawer (test added).
- Paused-agent name falls back to `'Nhân viên'`, never a UUID.
- ROADMAP phase 38 carries the WR-13 follow-up note; `36-CHECKPOINT.md` marks WR-05..WR-12 fixed
  and IN-01..IN-08 resolved; `36-UAT.md` item 5 no longer claims the fixture seeds dropped tables.

## Verification

| Command | Result |
|---|---|
| `npx vitest run tests/services/ai/office/aiOfficeRepo.test.ts tests/services/ai/office/aiSkillVersionRepo.test.ts` | 34 passed |
| `npx vitest run tests/views/TeamsView.test.tsx` | 35 passed (after tasks 2, 3, 5) |
| `npx vitest run tests/validation/domainSchemas.test.ts tests/validation/backupSchemas.test.ts tests/services/backup/validateBackup.test.ts tests/services/backup/exportBackup.test.ts` | 67 passed |
| `npx vitest run tests/db/tableListParity.test.ts tests/services/ai/office/teamTranscriptRepo.test.ts tests/workbench/AiExplorers.test.tsx tests/views/TeamsView.test.tsx` | 59 passed |
| `npx tsc --noEmit` | clean |
| `grep CURRENT_SCHEMA_VERSION = 12 src/` | no hits |
| `grep "schemaVersion === 1" src/services/backup` | no hits |

The full Vitest suite was never run (project memory: ~1 hour).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Restored the intended formatting of `handleSaveSettings`'s signature**
- **Found during:** Task 3
- **Issue:** An edit collapsed `async (input: {` and `budgetTokens: number;` onto one line.
- **Fix:** Re-split the signature while adding `runAction` above it.
- **Files modified:** `src/components/ai/office/TeamWorkspace.tsx`
- **Commit:** `d882bdf4`

**2. [Rule 3 - Blocking] Refined the WR-13 ROADMAP anchors**
- **Found during:** Task 5
- **Issue:** The plan's `:470-475`/`:951-958` anchors predate the CR-01 fix; `topUp` now sits at
  `:993-997` and the `ensureMembers` early return at `:488-493`.
- **Fix:** Recorded the current, verifiable anchors instead of stale ones (the finding text is unchanged).
- **Files modified:** `.planning/ROADMAP.md`
- **Commit:** `89186433`

### Notes, not deviations

- Pre-existing `DatabaseClosedError` unhandled rejections in `tests/views/TeamsView.test.tsx`:
  reproduced against a pristine copy of the file at HEAD (32 passed, same 7 errors), so they are
  environmental and untouched. Documented in `36-CHECKPOINT.md` as a known non-defect.
- **The Rust edit is compile-unverified.** `src-tauri/target/` does not exist and the first build
  compiles rusqlite bundled plus vendored openssl; cargo was not run and no cargo step was added.
  Its only automated guard is `tests/db/tableListParity.test.ts`, which reads the real Rust source
  and passes. `36-UAT.md` item 5 still requires one real `cargo test` run.

## Known Stubs

None introduced.

## Threat Flags

None. T-d2p-01 (re-decision tampering) is mitigated by the pending-only guard; T-d2p-02 (id leak in
copy) by fixed Vietnamese messages plus the neutral paused-agent label; T-d2p-03 (evidence DoS) by
the 2000-character cap in both schemas.

## Self-Check: PASSED

- `src/db/repositories/aiOfficeRepo.ts` — FOUND
- `src/db/repositories/aiSkillVersionRepo.ts` — FOUND
- `src/components/ai/office/TeamWorkspace.tsx` — FOUND
- `src/views/TeamsView.tsx` — FOUND
- `src-tauri/src/sqlite_persistence.rs` — FOUND
- commit `4f6ea24f` — FOUND
- commit `e4623879` — FOUND
- commit `d882bdf4` — FOUND
- commit `cff0ae7e` — FOUND
- commit `89186433` — FOUND
