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

## Open warnings — status after review fixes

Source: `36-REVIEW.md`. Verified against code at `b3e1ee3b`; statuses below updated by
quick `261111-c35` (WR-05, WR-10) and quick `261111-d2p` (the rest).

| ID | Issue | Status |
|---|---|---|
| **WR-05** | Repo writers accept dangling ids → exports the validator rejects. | **Fixed** (quick 261111-c35, `74fc4fee`): `createTeam`, `updateTeam({leadId})`, `addTeamMember`, `assignLeader` and `createSkillVersion` now refuse a missing row inside the transaction. |
| **WR-07** | Interrupted-turn inference fires for a turn that is still running (no report row yet). | **Fixed** (quick 261111-d2p): the render site filters entries whose agent is non-terminal in the snapshot; the reader stays pure for phase 37. |
| **WR-08** | `decideSkillVersion` can overwrite an already-decided row. | **Fixed** (quick 261111-d2p): a non-pending row is refused, and both refusals use UUID-free copy. |
| **WR-09** | `evidence` is unbounded free text that round-trips through backup. | **Fixed** (quick 261111-d2p): capped at 2000 characters in both schemas; the type header documents why the key-matched denylist cannot see it. |
| **WR-10** | `restoreBackup` clears the whole AI Office group when any single AI table key is present. | **Fixed** (quick 261111-c35, `2237dc0c`): a partial AI Office payload is rejected whole before the clear. |
| **WR-11** | Delete guard and delete are not atomic across the live-use check. | **Fixed** (quick 261111-d2p): all three delete guards re-consult the registry after their last await; the comment states the remaining window honestly. |
| **WR-12** | Repo calls fired with `void` and no `.catch()` → unhandled rejections. | **Fixed** (quick 261111-d2p): one action-error Alert in `TeamWorkspace` and a fixed toast in `TeamsView`. |
| **WR-13** | `topUp` cannot top up a member added since the last turn snapshot. | **Recorded** in ROADMAP phase 38 as a follow-up note with file:line anchors. Code untouched — the fix belongs to that phase's roster/budget redesign. |

## Info items — status after review fixes

IN-01, IN-02, IN-03, IN-04, IN-06, IN-07, IN-08 all fixed by quick `261111-d2p`.
IN-04's Rust edit is compile-unverified (no `src-tauri/target/`); its only automated guard is
`tests/db/tableListParity.test.ts` reading the source, and UAT item 5 still needs one real cargo run.
IN-05 was resolved by the WR-06 membership read.

## Known non-defects

- `tests/views/TeamsView.test.tsx` emits `DatabaseClosedError` unhandled rejections (`useLiveQuery` after `db.close()`). Reproduced at HEAD before this phase; all cases pass. Left alone.
- D-19 @mention-turn inference is a documented deferral to Phase 37 — recorded in the `listInterruptedAssignments` file comment and `36-05-SUMMARY.md`.
- `36-01-SUMMARY.md` deferred 3 test failures (`noteAttachments` ×2, `tabCheckpointBackup` ×1). Those were stale phase-35 expectations; fixed in this phase (`15a5c31e`) and green at HEAD.

## Environment notes

- **Never run the full Vitest suite** (project memory: ~1 hour). Use the focused set in `36-VALIDATION.md`.
- Worktrees disabled for this phase (`workflow.use_worktrees: false`): all 5 waves are single-plan, and agent worktrees have no `node_modules`.
- Tauri-only scope. No PWA/Pages work. No new dependencies.
