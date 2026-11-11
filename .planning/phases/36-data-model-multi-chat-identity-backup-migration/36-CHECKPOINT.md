# Phase 36 — Checkpoint (execution complete)

**Written:** 2026-11-11 (session `task-management-intellij`)
**Branch:** `feature/intellij-workbench` @ `b3e1ee3b` — pushed to origin.

---

## Status

| Item | State |
|---|---|
| Plans | 5/5 complete (36-01 … 36-05) |
| ROADMAP criteria | 5/5 verified (C-16 / D-22 / D-23 / D-24 overrides applied) |
| Requirements | 8/8 accounted for (AIO-GROUP-02/03/05, AIO-DATA-01..05) |
| Phase gate | 294 tests pass / 23 files; `npx tsc --noEmit` exit 0 |
| Regression (phase 35) | 43/43 pass |
| Schema drift | none |
| Code review | 3 critical + 6 warning fixed; see below |
| VERIFICATION.md | `human_needed` — 5 manual items |
| UAT | `36-UAT.md` created, all 5 pending |

**Next action:** `/gsd-verify-work 36` to walk the 5 UAT items. Phase is NOT marked complete in ROADMAP/STATE until UAT passes.

## What landed

- **36-01** — Dexie V19 `aiSkillVersions` wired through all nine coordinated lists; backup envelope v12; TS⊆Rust table parity test; `LATEST_SCHEMA_VERSION` exported so migration tests stop hardcoding a literal.
- **36-02** — leader optional; durable `leaderLockedAt` enforced in `updateTeam` and `assignLeader`; caps removed; `targetAgentId`/`leaderLockedAt` round-trip.
- **36-03** — live-use registry; typed `IN_USE` delete refusals; per-turn roster snapshot with `memberAgentIds` refresh (D-08).
- **36-04** — name-only group create; roster/leader editing; delete refusals surfaced as alerts; `ACTIVE_TEAM_CAP_MESSAGE` deleted.
- **36-05** — `aiSkillVersionRepo` monotonic contract; D-19 interrupted-turn inference from persisted rows.

## Fixed after code review

Criticals (`85317b75`):
- `bucketOf(x, 0)` returned 10 → a name-only group closed the team gate before its first turn and hung with no banner. Now returns 0.
- `assignLeader` re-assigning the same leader recreated the member row at `budgetTokens: 0, usedTokens: 0`. Now a no-op, and `writeLeadRow` carries the previous row's budget.
- `deleteTeam` left the `team:<id>` thread + messages → the app's own next export failed validation. Now deletes thread, messages and tabs in the same transaction.

Warnings (`5a305174`):
- Live-use claim leaked when `runtime.start()` threw `TURN_IN_PROGRESS` → profile undeletable for the session.
- `send()` had no re-entrancy guard → duplicate user row + unhandled rejection. Now `LIVE_PHASES` gate.
- Lead prompt advertised every global employee instead of the roster → `delegate_batch` refused whole batches.
- `addTeamMember({ role: 'lead' })` bypassed `assignLeader` and the lock; also now rejects a duplicate `(teamId, agentId)`.
- `deleteLead` ignored lead ids used as plain member rows.

## Open warnings — NOT fixed (none blocks a phase criterion)

Source: `36-REVIEW.md`. Verified against code at `b3e1ee3b`.

| ID | Issue | Owner / notes |
|---|---|---|
| **WR-05** | Repo writers accept dangling ids → exports the validator rejects. **Partially fixed:** `addTeamMember`, `assignLeader`, `updateTeam({leadId})` now check. **Still open:** `createTeam` (`aiTeamRepo.ts:80-133`) accepts `leadId`/`employeeIds` without lookup, and `createSkillVersion` (`aiSkillVersionRepo.ts:43-66`) accepts any `skillId`. | Phase 37 hardening. D-15 wants the check at the repo boundary. |
| **WR-07** | Interrupted-turn inference fires for a turn that is still running (no report row yet). Advisory banner can appear mid-run. | Phase 37 (owns turn lifecycle). |
| **WR-08** | `decideSkillVersion` can overwrite an already-decided row. | Phase 39 (skill versioning + enrichment approval). |
| **WR-09** | `evidence` is unbounded free text that round-trips through backup; not in the forbidden-key scan. | Phase 39. |
| **WR-10** | `restoreBackup` clears the whole AI Office group when any single AI table key is present — a partial payload wipes the group. | Phase 37. |
| **WR-11** | Delete guard and delete are not atomic across the live-use check (awaits between check and delete). | Phase 37 (concurrency). |
| **WR-12** | Repo calls fired with `void` and no `.catch()` → unhandled rejections (`TeamWorkspace.tsx:408-440, 542-547, 683-688`; `TeamsView.tsx:164-166`). | Phase 37. |
| **WR-13** | `topUp` cannot top up a member added since the last turn snapshot. | Phase 38 (token budget). |

## Info items — NOT fixed

IN-01 duplicate envelope version literal; IN-02 dead `schemaVersion === 1` normalization; IN-03 unused `AiSkillVersionInput`; IN-04 Rust `ALLOWED_TABLES` still lists dropped `projects`/`milestones`; IN-05 `deleteLead` tx includes an untouched table; IN-06 sort comparator returns `0` for unequal timestamps; IN-07 formatting/whitespace; IN-08 stale status maps + mislabelled settings button.

## Known non-defects

- `tests/views/TeamsView.test.tsx` emits `DatabaseClosedError` unhandled rejections (`useLiveQuery` after `db.close()`). Reproduced at HEAD before this phase; all cases pass. Left alone.
- D-19 @mention-turn inference is a documented deferral to Phase 37 — recorded in the `listInterruptedAssignments` file comment and `36-05-SUMMARY.md`.
- `36-01-SUMMARY.md` deferred 3 test failures (`noteAttachments` ×2, `tabCheckpointBackup` ×1). Those were stale phase-35 expectations; fixed in this phase (`15a5c31e`) and green at HEAD.

## Environment notes

- **Never run the full Vitest suite** (project memory: ~1 hour). Use the focused set in `36-VALIDATION.md`.
- Worktrees disabled for this phase (`workflow.use_worktrees: false`): all 5 waves are single-plan, and agent worktrees have no `node_modules`.
- Tauri-only scope. No PWA/Pages work. No new dependencies.
