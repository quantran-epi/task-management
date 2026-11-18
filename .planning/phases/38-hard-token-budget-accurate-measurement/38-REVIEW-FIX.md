---
phase: 38-hard-token-budget-accurate-measurement
fixed_at: 2026-11-13T23:55:00Z
review_path: .planning/phases/38-hard-token-budget-accurate-measurement/38-REVIEW.md
iteration: 1
findings_in_scope: 20
fixed: 20
skipped: 0
status: all_fixed
---

# Phase 38: Code Review Fix Report

**Fixed at:** 2026-11-13T23:55:00Z
**Source review:** `.planning/phases/38-hard-token-budget-accurate-measurement/38-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 20 (5 Critical, 15 Warning)
- Fixed: 20
- Skipped: 0
- Out of scope: IN-01..IN-09 (Info), per the task scope

**Commits:**
- `c131e352` — `fix(38-review): CR-01..CR-05 ...`
- `8bcb9115` — `fix(38-review): WR-01..WR-15 ...`
- `34568657` — `test(38-review): cover CR-04, WR-05..WR-13 at their seams`

## Fixed Issues

### CR-01: Envelope bumped 13→14 for optional-only fields

**Files modified:** `src/validation/backupSchemas.ts`, `tests/services/backup/validateBackup.test.ts`
**Commit:** `c131e352`
**Applied fix:** `BACKUP_SCHEMA_VERSION` is back to `13`. The doc comment now records why: every phase-38 column is `.optional()`, so a v13 payload validates unchanged, and a bump would send every pre-38 backup down the `schemaVersion < CURRENT` reject branch. A new test pins `CURRENT_SCHEMA_VERSION === 13` and proves a v13 envelope validates — the regression this finding describes.

### CR-02: `captureSnapshot` omitted the team log while `replaceTables` cleared it

**Files modified:** `src/services/backup/restoreBackup.ts`, `tests/services/backup/restoreBackup.test.ts`
**Commit:** `c131e352`
**Applied fix:** `captureSnapshot` now reads and emits `teamMessages` and `teamReadCursors`, so a rollback replay restores the transcript it cleared. Test: seed a log + cursor, import, assert the snapshot carries both, roll back, assert both survive.

### CR-03: `clearAiOffice` cleared the log outside the all-present-or-all-absent guard

**Files modified:** `src/services/backup/restoreBackup.ts`, `tests/services/backup/restoreBackup.test.ts`
**Commit:** `c131e352`
**Applied fix:** the two clears moved into a separate `clearTeamLog` list gated on `tables.teamMessages !== undefined || tables.teamReadCursors !== undefined`. A payload that omits an empty log (which `exportBackup` does) no longer wipes the local transcript. Test: local log survives an import whose payload has no log keys.

### CR-04: An untouched settings save cleared the live threshold override

**Files modified:** `src/components/ai/office/TeamWorkspace.tsx`, `tests/components/ai/office/SettingsSaveBudget.test.tsx`
**Commit:** `c131e352` (fix) / `34568657` (test)
**Applied fix:** the mirror reads `result.team.budgetWarnThresholdPct` — the value Dexie now holds — instead of the drawer's `undefined` input. Test: an untouched save over a stored 65 asserts `setTeamThresholdPct(65)` and never `undefined`.

### CR-05: Lead re-assignment wiped the outgoing lead's usage and zeroed the new lead's budget

**Files modified:** `src/db/repositories/aiTeamRepo.ts`, `tests/services/ai/office/aiTeamRepo.test.ts`
**Commit:** `c131e352`
**Applied fix:** chose the smaller correct change — deleted the dead `previous` parameter and its unreachable `previous.agentId === leadId` branch, and rewrote `writeLeadRow` to (a) promote the INCOMING agent's own roster row in place, carrying its budget and usage, and (b) demote an outgoing lead row that carries usage to `employee` instead of deleting it (a usage-free row is still deleted). Tests: A→B→A proves the promoted row keeps 500/400/100 and B's row survives as an employee; a usage-free outgoing row is dropped.

### WR-01: `Math.max(0, Math.round(x))` persisted `NaN`

**Files modified:** `src/db/repositories/aiTeamRepo.ts`, `tests/services/ai/office/aiTeamRepo.test.ts`
**Commit:** `8bcb9115` / `34568657` (test)
**Applied fix:** one `nonNegativeInt()` helper (`Number.isFinite` guard, then clamp+round) replaces all four call sites (`applyTopUp`, `applyTeamBudgetSettings` total, per-member share, `setMemberBudget`). Test: `NaN` / `Infinity` amounts leave every stored budget finite.

### WR-02: Cache tokens double-counted for OpenAI-shaped usage

**Files modified:** `src/services/ai/nineRouterClient.ts`, `tests/ai/nineRouterClient.test.ts`
**Commit:** `8bcb9115`
**Applied fix:** normalized at `mapUsage`. When `prompt_tokens_details.cached_tokens` is present, `promptTokens` becomes `max(0, prompt_tokens - cached_tokens)`; the Anthropic shape (`cache_read_input_tokens`, no `prompt_tokens_details`) is untouched. `splitUsage` keeps adding cache to input. Tests assert prompt+cache equals the provider's `prompt_tokens` for OpenAI and that the Anthropic prompt count is unchanged.

### WR-03: Sidebar masked persisted output while a request was pending

**Files modified:** `src/components/ai/office/TeamSidebar.tsx`, `tests/ai/office/AgentOfficeComponents.test.tsx`
**Commit:** `8bcb9115` / `34568657` (test)
**Applied fix:** `usedOut` uses the `> 0` idiom, matching `usedIn`. Test: a live record with `outputTokens: 0` still renders the persisted 100.

### WR-04: Sidebar team total included the provisional estimate

**Files modified:** `src/components/ai/office/TeamSidebar.tsx`, `tests/ai/office/AgentOfficeComponents.test.tsx`
**Commit:** `8bcb9115` / `34568657` (test)
**Applied fix:** picked ONE owner — the coordinator's charged-only number. `MemberFigures` gained `chargedIn`/`chargedOut` (no provisional), the team aggregate sums those, and the guess renders as its own `~` figure in the budget panel (`team-provisional`). Test: a 900-token provisional with 400 charged renders `400 / 1,000 token · 40%`, a separate `~900`, and no team badge.

### WR-05: Removed members kept a stale budget in the coordinator

**Files modified:** `src/services/ai/office/teamRunCoordinator.ts`, `tests/services/ai/office/teamRunCoordinator.test.ts`
**Commit:** `8bcb9115` / `34568657` (test)
**Applied fix:** `hydrateBudgets` and `mirrorBudgetResult` now drop every live key whose agent is no longer in the returned roster before merging. Test: a member removed between turns no longer keeps the member warning lit.

### WR-06: `flushAccounting` returned numbers it never charged

**Files modified:** `src/services/ai/office/teamRunCoordinator.ts`, `tests/services/ai/office/teamRunCoordinator.test.ts`
**Commit:** `8bcb9115` / `34568657` (test)
**Applied fix:** the member lookup moved ahead of the estimate and the key mark. With no roster row the flush returns zeros and leaves the key UNFLUSHED, so a later flush can still charge it; the attempt row is stamped 0/0 instead of claiming uncharged tokens. Test: an agent the turn's roster does not name gets a 0/0 attempt row.

### WR-07: `reconcileUsage` clobbered live counters of an in-flight agent

**Files modified:** `src/services/ai/office/teamRunCoordinator.ts`, `tests/services/ai/office/teamRunCoordinator.test.ts`
**Commit:** `8bcb9115` / `34568657` (test)
**Applied fix:** the loop skips any agent whose accounting record exists and is not yet flushed, and `teamUsed` is summed from the live map (falling back to the row) so the aggregate does not dip either. Test: while B is held open, A's reconcile leaves B at 200/20.

### WR-08: `stopAgent`/`abortAll` flushed whichever record the agent currently held

**Files modified:** `src/services/ai/office/teamRunCoordinator.ts`, `tests/services/ai/office/teamRunCoordinator.test.ts`
**Commit:** `8bcb9115` / `34568657` (test)
**Applied fix:** `flushAccounting(agentId, expectedAssignmentId?)` bails with zeros when the live record belongs to a different assignment; `finalizeAttempt` passes its own `assignmentId`. Test: attempt 1's terminal seam runs while the retry's record is live — the retry still records 200/20 and the member sums 500/70.

### WR-09: Cache tokens lost from the persisted message usage

**Files modified:** `src/services/ai/aiOrchestratorLoop.ts`, `src/services/ai/types.ts`, `src/components/ai/runtime/chatTurnRuntime.ts`, `tests/services/ai/aiOrchestratorLoop.test.ts`, `tests/ai/chatTurnRuntime.test.ts`
**Commit:** `8bcb9115` / `34568657` (test)
**Applied fix:** all three accumulation branches in the loop now sum `cacheReadTokens`/`cacheCreationTokens` (`TokenUsageStats` gained the fields), and the runtime keeps the accumulated cache values when the loop result omits them. The runtime only materializes a cache key when it is non-zero, so a cache-less turn's persisted shape is unchanged. Tests cover both layers.

### WR-10: Backup `tokenUsage` sub-schemas stripped the cache fields

**Files modified:** `src/validation/backupSchemas.ts`, `tests/services/backup/officeBackup.test.ts`
**Commit:** `8bcb9115` / `34568657` (test)
**Applied fix:** both sub-schemas (chat message and attempt) declare `cacheReadTokens`/`cacheCreationTokens` as optional numbers. Test: a message carrying 40/10 round-trips through export → validate → restore.

### WR-11: A member added while the drawer was open never reached the split table

**Files modified:** `src/components/ai/office/TeamSettingsDrawer.tsx`, `tests/components/ai/office/SettingsSaveBudget.test.tsx`
**Commit:** `8bcb9115` / `34568657` (test)
**Applied fix:** `handleSave` merges every `members` row missing from `rows` using its PERSISTED budget, so the payload is complete and never silently drops a roster row. Test: a member added while the drawer is open appears in the payload at 250.

### WR-12: Unhandled rejections in the global threshold card

**Files modified:** `src/components/settings/BudgetWarnThresholdCard.tsx`, `tests/components/settings/BudgetWarnThresholdCard.test.tsx` (new)
**Commit:** `8bcb9115` / `34568657` (test)
**Applied fix:** the load effect has a rejection handler and `handleSave` has a `catch`; both call `message.error`. New test file asserts a failed read and a failed write each surface exactly one error and the save spinner clears.

### WR-13: Top-up fired and forgot, so a refusal was invisible

**Files modified:** `src/components/ai/office/TeamWorkspace.tsx`, `tests/components/ai/office/SettingsSaveBudget.test.tsx`
**Commit:** `8bcb9115` / `34568657` (test)
**Applied fix:** the confirm routes through `runAction`, so a rejection lands in the existing `team-action-error` channel. Test: a throwing `topUp` renders that alert.

### WR-14: A special-token encode failure degraded the whole text to chars÷4

**Files modified:** `src/services/ai/office/tokenEstimate.ts`, `tests/services/ai/office/tokenEstimate.test.ts`
**Commit:** `8bcb9115` / `34568657` (test)
**Applied fix:** checked the real `js-tiktoken` lite API (`encode(text, allowedSpecial?: string[] | 'all', disallowedSpecial?)`) and retry once with `'all'` before falling back. `LocalEncoder.encode` gained the optional second parameter. Test: a stub that throws unless `'all'` is passed returns the encoder's count, and the call log proves the retry happened.

### WR-15: Restore left stale `teamParticipants` rows

**Files modified:** `src/services/backup/restoreBackup.ts`, `tests/services/backup/restoreBackup.test.ts`
**Commit:** `c131e352` (clear) / `8bcb9115` (transaction scope) / `34568657` (test)
**Applied fix:** `teamParticipants` is cleared alongside the team log inside `replaceTables`, and added to `RESTORE_TABLES` so the clear is inside the transaction scope (without that, Dexie throws `NotFoundError`). Restoring participants is out of scope — the table is never exported, so clearing the orphans is the correctness fix. Test: a stale participant row is gone after an import that carries the log.

## Notes

- **D-01..D-22 unchanged.** No fix re-introduced a budget gate, a pause, or a blocking check. WR-04 moved the provisional guess out of the aggregate, which strengthens D-08 ("estimates are never mixed in") rather than contradicting it.
- **CR-01 vs. 38-06-SUMMARY.** Plan 06 deliberately bumped to 14 under C-16 ("old data is test data"). The review is right that C-16 is about DATA, not about the backup envelope contract, and the bump had a real cost: every user backup from before this build became unrestorable. The revert keeps all of plan 06's schema work — the fields and their validation are untouched.
- **Verification:** `npx tsc --noEmit` exits 0. `bash .planning/scripts/verify-team-chat-architecture.sh` exits 0. Scoped suites: 12 files / 374 tests green, plus 5 files / 138 tests for the touched-but-not-listed suites (`restoreBackup`, `aiOrchestratorLoop`, `chatTurnRuntime`, `nineRouterClient`, `BudgetWarnThresholdCard`).

---

_Fixed: 2026-11-13T23:55:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
