---
phase: 38-hard-token-budget-accurate-measurement
reviewed: 2026-11-13T16:00:00Z
depth: standard
files_reviewed: 27
status: issues_found
findings:
  critical: 5
  warning: 15
  info: 9
  total: 29
---

# Phase 38: Code Review Report

**Depth:** standard. **Files:** 27 source files. **Status:** issues_found.

## Summary

Warning-only budget model, split usage accounting, atomic ledger increments, additive top-up vs absolute save, per-team threshold override, envelope v14, js-tiktoken estimation — all present and structurally coherent. Transaction scopes are right (`applyTopUp`/`applyTeamBudgetSettings` both `rw` over `[aiTeams, aiTeamMembers]`; `finalizeAttempt` hoists the flush before its `rw` because Dexie cannot nest). Notification dedupe `(teamId, level)` is correct. Parking gate is gone from behaviour (stale strings only).

The defects are in the seams: the backup envelope bump invalidates every existing backup, the restore snapshot/clear pair loses the team log, the live threshold mirror clears an override the DB kept, and the lead-row carry is dead code that wipes usage on a real lead change. Several usage-accounting paths return or stamp numbers that were never charged.

## Critical Issues

### CR-01: Envelope bumped 13→14 for optional-only fields, rejecting every existing backup

**File:** `src/validation/backupSchemas.ts:834`, `src/services/backup/validateBackup.ts:97-110`

**Issue:** Phase 38 added only *optional* columns (`AiTeam.budgetWarnThresholdPct`, `AiTeamMember.inputTokens/outputTokens/usageEstimated`, attempt split columns). All are `.optional()` in the strict record schemas, so a v13 payload validates against the v14 schemas unchanged. Bumping `BACKUP_SCHEMA_VERSION` to 14 makes `validateBackup` take the `schemaVersion < CURRENT` branch and reject with `LEGACY_BACKUP_MESSAGE` — every backup a user made before this build becomes unrestorable.

**Fix:** Keep `BACKUP_SCHEMA_VERSION = 13` (the new fields are optional and `strictObject` accepts their absence). If a bump is genuinely required later, add a normalization step for `13 → 14` instead of the outright reject.

### CR-02: `captureSnapshot` omits `teamMessages`/`teamReadCursors` but `replaceTables` clears them → rollback destroys the team log

**File:** `src/services/backup/restoreBackup.ts:191-211` (snapshot) vs `:266` (clear)

**Issue:** The snapshot's `tables` object has all nine AI Office keys but no `teamMessages`/`teamReadCursors`. `replaceTables` clears both unconditionally whenever any AI Office key is present, and `rollbackToSnapshot` replays that snapshot through the same function. A failed import followed by a rollback therefore deletes the team transcript and its read cursors with no copy to restore.

**Fix:** Include `teamMessages` and `teamReadCursors` in the snapshot's `tables` object.

### CR-03: `clearAiOffice` clears the log outside the all-present-or-all-absent guard

**File:** `src/services/backup/restoreBackup.ts:241-268`

**Issue:** The guard at `:241-244` only inspects `AI_OFFICE_TABLE_KEYS` (nine keys). `teamMessages`/`teamReadCursors` are cleared at `:266` regardless of whether the payload carries them, and `exportBackup.ts:312-313` **omits** them when empty. A valid v14 export from a machine with an empty team log, restored onto a machine that has one, silently wipes the local transcript while restoring nothing.

**Fix:** Gate the two clears on the payload actually carrying those keys, or make the export always emit both keys (empty arrays included).

### CR-04: An untouched settings save clears the live threshold override the DB kept

**File:** `src/components/ai/office/TeamWorkspace.tsx:714`

**Issue:** The drawer sends `budgetWarnThresholdPct: thresholdTouched ? thresholdPct : undefined`, and `applyTeamBudgetSettings` correctly leaves the stored override alone for `undefined`. But line 714 then calls `coordinator?.setTeamThresholdPct(input.budgetWarnThresholdPct ?? undefined)` unconditionally, so `undefined` reverts the live threshold to the global default while the persisted override is still, say, 65.

**Fix:** Only call `setTeamThresholdPct` when the input carries a defined threshold (or mirror it from `result.team.budgetWarnThresholdPct`).

### CR-05: Lead re-assignment wipes the outgoing lead's recorded usage and gives the new lead a 0 budget

**File:** `src/db/repositories/aiTeamRepo.ts:230-232`, `:240-270`

**Issue:** `updateTeam:231` passes no `previous`, so `carried` is always the zero branch. `assignLeader:296` passes the old lead row, but line 291 already returned early when `existing.leadId === leadId`, so `previous.agentId === leadId` can never hold on a real change. The `previous.agentId === leadId` branch at `:252` is therefore unreachable. On a genuine lead change the outgoing lead's member row is deleted (its usage vanishes from every roster sum) and the new lead row is created with `budgetTokens: 0`.

**Fix:** Carry from the roster row for the *incoming* agent, and do not delete usage; pass `previous` from `updateTeam` or delete the dead parameter and its comment.

## Warnings

### WR-01: `Math.max(0, Math.round(x))` persists `NaN`
**File:** `src/db/repositories/aiTeamRepo.ts:520, 610, 621, 652`
**Issue:** `Math.max(0, NaN)` is `NaN`. A non-finite amount writes `NaN` into `budgetTokens`, which `aiTokensSchema` rejects — the app's own next export is unrestorable.
**Fix:** Guard with `Number.isFinite` before rounding.

### WR-02: Cache tokens double-counted for OpenAI-shaped usage
**File:** `src/services/ai/nineRouterClient.ts:40-51`, `src/services/ai/office/budgetGate.ts:47-63`
**Issue:** OpenAI's `prompt_tokens` already includes `cached_tokens`; Anthropic's `input_tokens` excludes cache reads. Both map to `promptTokens` + `cacheReadTokens` and `splitUsage` adds them, so an OpenAI response charges input twice for the cached portion.
**Fix:** Normalize at the mapper — subtract cached from `promptTokens` for the OpenAI shape.

### WR-03: Sidebar masks persisted output while a request is pending
**File:** `src/components/ai/office/TeamSidebar.tsx:94`
**Issue:** `usedOut = live?.outputTokens ?? member.outputTokens ?? 0` — a live record exists from dispatch with `outputTokens: 0`, so persisted output disappears mid-turn. `usedIn` uses the `> 0` idiom and does not have this problem.
**Fix:** Use the `> 0` idiom for output too.

### WR-04: Sidebar team total includes the provisional estimate; the coordinator's does not
**File:** `src/components/ai/office/TeamSidebar.tsx:93, 113-120`
**Issue:** `usedIn` falls back to the provisional pre-call guess, so the team badge can show "at threshold" while no notification was sent, and the two surfaces report different percentages.
**Fix:** Keep provisional out of the team aggregate, or add it to the coordinator's `teamUsed` too. Pick one owner.

### WR-05: Removed members keep a stale budget in the coordinator
**File:** `src/services/ai/office/teamRunCoordinator.ts:1302-1318`, `:3527-3537`
**Issue:** `hydrateBudgets`/`mirrorBudgetResult` only `set` entries; neither deletes agents no longer on the roster, so a stale pair can raise a phantom member warning.
**Fix:** Rebuild the maps from `rows` instead of merging.

### WR-06: `flushAccounting` returns numbers it never charged
**File:** `src/services/ai/office/teamRunCoordinator.ts:1562-1563`
**Issue:** `if (!memberId) return delta;` — the key is already in `flushedAccounting`, so those tokens can never be charged later, yet `finalizeAttempt` stamps them on the attempt row.
**Fix:** Return zeros on the missing-member path, or resolve `memberId` before marking the key flushed.

### WR-07: `reconcileUsage` clobbers live counters of an in-flight agent
**File:** `src/services/ai/office/teamRunCoordinator.ts:1584-1593`
**Issue:** After awaiting `usageWriteChain` it overwrites live counters from the ledger. A different agent mid-flight has deltas not yet in the ledger, so its numbers drop until its next report.
**Fix:** Skip agents with an unflushed accounting record.

### WR-08: `stopAgent`/`abortAll` flush whichever record the agent currently holds
**File:** `src/services/ai/office/teamRunCoordinator.ts:3387-3408`, `:3423-3434`
**Issue:** `flushAccounting(agentId)` flushes the agent's *current* record without checking `assignmentId`. Stopping assignment A while a retry runs flushes the retry's partial record and marks its key flushed, so later reports are dropped.
**Fix:** Pass the expected assignment id into `flushAccounting` and bail on mismatch.

### WR-09: Cache tokens lost from the persisted message usage
**File:** `src/components/ai/runtime/chatTurnRuntime.ts:351-363, 452`; `src/services/ai/aiOrchestratorLoop.ts:305-309, 336-340, 508-512`
**Issue:** The loop only accumulates prompt/completion/total, then `tokenUsage = result.tokenUsage || tokenUsage` overwrites the cache-inclusive sums with cache-less ones.
**Fix:** Accumulate cache fields in all three branches, or drop the overwrite when `tokenUsage` is populated.

### WR-10: Backup `tokenUsage` sub-schemas silently strip the cache fields
**File:** `src/validation/backupSchemas.ts:300-306`, `:783-789`
**Issue:** Both sub-schemas are plain `z.object` with only prompt/completion/total; Zod strips unknown keys, so `cacheReadTokens`/`cacheCreationTokens` are removed on restore.
**Fix:** Add both cache fields as optional numbers.

### WR-11: A member added while the drawer is open never reaches the split table
**File:** `src/components/ai/office/TeamSettingsDrawer.tsx:132-164, 177-190`
**Issue:** `rows` is seeded once per `(open, team.id)`; `handleSave` builds `budgets` only from `rows`, so a member added while open is absent from the save and stays at 0.
**Fix:** Merge unseen members at save time from `members`.

### WR-12: Unhandled rejections in the global threshold card
**File:** `src/components/settings/BudgetWarnThresholdCard.tsx:33-41, 43-52`
**Issue:** The load `useEffect` has no `.catch`; `handleSave` has `try/finally` but no `catch`. A failed read or write rejects unhandled and the user sees no error.
**Fix:** Add `.catch` on load and a `catch` with `message.error` in save.

### WR-13: Top-up fires and forgets, so a refusal is invisible
**File:** `src/components/ai/office/TeamWorkspace.tsx:1031-1034`
**Issue:** `void coordinator?.topUp(...)` with no `.catch`; a refusal is an unhandled rejection with the modal already closed.
**Fix:** Route through `runAction`.

### WR-14: A special-token encode failure degrades the whole text to chars÷4
**File:** `src/services/ai/office/tokenEstimate.ts:52-63`
**Issue:** `js-tiktoken` throws on special tokens unless allowed; the `catch` falls through to chars÷4 for the entire payload, discarding a usable encoder for one bad token.
**Fix:** Retry once with special tokens treated as text, then fall back.

### WR-15: Restore leaves stale `teamParticipants` rows
**File:** `src/services/backup/restoreBackup.ts:30-60` (`RESTORE_TABLES`)
**Issue:** `deleteTeam` deletes participants and `localSqlitePersistence` mirrors the table, but `RESTORE_TABLES` neither clears nor restores `teamParticipants`.
**Fix:** Clear `teamParticipants` inside `replaceTables` alongside the AI Office group.

## Info

- **IN-01:** `TeamRunSnapshot.budgetWarnings` has no production reader — wire it or delete it.
- **IN-02:** Dead legacy budget surfaces still render (`awaiting-budget` label, four `paused` branches).
- **IN-03:** `scheduler.ts:9` comment points at the deleted parking gate.
- **IN-04:** `resetAllBudgetWarnings` is a test-only seam exported from production.
- **IN-05:** `recomputeThresholdPct` never deletes a cleared override from `liveTeam`.
- **IN-06:** `topUp` comment claims a `disposed` guard that does not exist.
- **IN-07:** `activateTeam` comment claims a racing-count guard that was never written.
- **IN-08:** Every usage increment marks the DB dirty for auto-sync.
- **IN-09:** `setTeamBudget` is exported and never called.

## Focus-Area Verdicts

- **Parking gate removal:** clean. Only stale strings/comments (IN-02, IN-03).
- **Transaction boundaries:** correct. Both budget writers use one `rw` over `[aiTeams, aiTeamMembers]`; `incrementMemberUsage` is single-table; `finalizeAttempt` correctly hoists the flush before its `rw`.
- **Ledger double-count / lost update:** the cumulative-diff model is sound. Real losses are WR-06, WR-07, WR-08.
- **Three-state threshold:** correct in repo and drawer; broken in the live mirror (CR-04).
- **Notification dedupe:** correct — `(teamId, level)`, marker before await, removed on failure, UUID-prefix reset.
- **tokenEstimate:** lazy chunk + `chars÷4` fallback verified; caveats are WR-14 and the permanent `null` cache after a failed load.
- **Backup round-trip:** new columns ride along in whole rows and are declared in the strict schemas; the failures are CR-01, CR-02, CR-03, WR-10, WR-15.
