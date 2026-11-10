---
phase: 36-data-model-multi-chat-identity-backup-migration
reviewed: 2026-11-10T12:00:00Z
depth: standard
files_reviewed: 26
files_reviewed_list:
  - src/types/aiOffice.ts
  - src/validation/aiOfficeSchemas.ts
  - src/db/schema.ts
  - src/db/index.ts
  - src/types/backup.ts
  - src/validation/backupSchemas.ts
  - src/services/backup/exportBackup.ts
  - src/services/backup/validateBackup.ts
  - src/services/backup/restoreBackup.ts
  - src/services/localSqlitePersistence.ts
  - src-tauri/src/sqlite_persistence.rs
  - src/db/repositories/aiTeamRepo.ts
  - src/db/repositories/aiOfficeRepo.ts
  - src/db/repositories/aiSkillVersionRepo.ts
  - src/db/repositories/teamTranscriptRepo.ts
  - src/services/ai/office/liveUseRegistry.ts
  - src/services/ai/office/teamRunCoordinator.ts
  - src/components/ai/office/TeamWorkspace.tsx
  - src/components/ai/office/TeamEditorDrawer.tsx
  - src/components/ai/office/TeamSettingsDrawer.tsx
  - src/components/ai/office/TeamCard.tsx
  - src/components/ai/office/EmployeeCard.tsx
  - src/components/ai/office/SkillCard.tsx
  - src/views/TeamsView.tsx
  - src/views/AiOfficeView.tsx
  - src/workbench/toolwindows/AiOfficeExplorer.tsx
findings:
  critical: 3
  warning: 13
  info: 8
  total: 24
status: issues_found
---

# Phase 36: Code Review Report

**Reviewed:** 2026-11-10T12:00:00Z
**Depth:** standard
**Files Reviewed:** 26
**Status:** issues_found

## Summary

The persistence substrate is mostly sound: V19 is genuinely additive (no `.upgrade()` hook, `LATEST_SCHEMA_VERSION` bumped, migration test seeds at V17 so the 17→18→19 chain is exercised), the TS⊆Rust table parity test reads the real sources, envelope v12 round-trips `aiSkillVersions` through export/validate/restore, `targetAgentId` and `leaderLockedAt` survive, and the delete guards return a typed `IN_USE` refusal instead of throwing. D-19 is honoured: nothing persists a runtime status.

Three defects are severe enough to block:

1. A group created through the new name-only path has `budgetTokens: 0`, and `bucketOf(x, 0)` returns `10`, so `hydrateBudgets()` closes the team gate before the first turn starts. The lead's turn then parks on `teamGate.wait()` at its first tool round with `phase` still `lead-thinking` — no banner, no error, just a hung turn. The same code also never refreshes `teamBudget` from the freshly-read `roster.teamRow`.
2. `assignLeader` / `writeLeadRow` recreate the lead member row with `budgetTokens: 0, usedTokens: 0`. Re-assigning the current leader is permitted by `assertLeaderUnlocked`, so a leader's budget and recorded usage are silently wiped.
3. `deleteTeam` deletes members and links but leaves the `team:<id>` chat thread and its messages. A backup taken afterwards contains an orphan team thread that `validateBackupPayload` rejects — the app refuses to restore its own export.

The rest are trust-boundary gaps (repo writers that can produce rows the backup validator rejects), one false-positive in the interrupted-turn inference, and several unhandled-rejection paths.

## Critical Issues

### CR-01: Zero-budget group closes the team gate before the first turn; the turn hangs with no banner

**File:** `src/services/ai/office/teamRunCoordinator.ts:270`, `:453-468`; `src/services/ai/office/budgetGate.ts:66-70`
**Issue:** `teamBudget` is seeded once from the construction-time `team.budgetTokens` and never refreshed from the per-turn `roster.teamRow`. `hydrateBudgets()` then computes `lastTeamBucket = bucketOf(teamUsed, teamBudget)` and closes the gate at `>= 8`. `bucketOf(used, budget)` returns `10` whenever `budget <= 0`, so for a group with `budgetTokens: 0` — now the default of the D-05 name-only create path (`AiTeamInputSchema.budgetTokens.default(0)`, `TeamEditorDrawer` `budget ?? 0`) — the team gate is closed before any token is spent. `beforeToolRoundFor` awaits `teamGate.wait(signal)` at the lead's first tool round, so the turn parks forever. `phase` is never set to `awaiting-budget` on this path, so `AgentPausedBanner` never renders and the user sees a permanently "running" lead. The same stale-`teamBudget` read also ignores a budget changed in another tab or by a restore.
**Fix:**
```ts
// hydrateBudgets(): the persisted row is the authority once loadRoster supplies it
const persistedBudget = roster.teamRow?.budgetTokens;
if (persistedBudget !== undefined) teamBudget = persistedBudget;
teamUsed = rows.reduce((sum, row) => sum + row.usedTokens, 0);
lastTeamBucket = bucketOf(teamUsed, teamBudget);
if (lastTeamBucket >= 8) {
  teamGate.close();
  phase = 'awaiting-budget';   // otherwise the park is invisible
  notify();
}
```
Separately, `bucketOf` returning `10` for a zero budget should be a deliberate "unbudgeted" case, not a silent 100% consumption — either treat `budget === 0` as bucket `0` (gate open, nothing to spend) or surface the pause.

### CR-02: `assignLeader` wipes the lead's budget and recorded usage

**File:** `src/db/repositories/aiTeamRepo.ts:193-235`
**Issue:** `writeLeadRow` deletes every `role='lead'` row and inserts a fresh one with `budgetTokens: 0, usedTokens: 0`. `assertLeaderUnlocked` only refuses when `nextLeadId !== existing.leadId`, so re-assigning the *same* leader is allowed and destroys that row's budget and usage. Reachable through the settings drawer (assign lead A → save an even split → switch to B → switch back to A: A's budget is gone), and through any caller of the public `assignLeader` API. The even-split remainder that `createTeam` puts on the lead row is lost the same way on the first leader change.
**Fix:**
```ts
export async function assignLeader(teamId, leadId, db = defaultDb) {
  return db.transaction('rw', [db.aiTeams, db.aiTeamMembers, db.aiLeads], async () => {
    const existing = await db.aiTeams.get(teamId);
    if (!existing) throw new Error(`Không tìm thấy nhóm: ${teamId}`);
    assertLeaderUnlocked(existing, leadId);
    // Nothing to do — and no row to recreate.
    if (existing.leadId === leadId) return existing;
    ...
  });
}
```
and have `writeLeadRow` accept the previous row's `budgetTokens`/`usedTokens` when the agent is unchanged, or refuse to clobber a non-zero row.

### CR-03: `deleteTeam` leaves the team chat thread, so the next backup cannot be restored

**File:** `src/db/repositories/aiTeamRepo.ts:269-275`; `src/services/backup/validateBackup.ts:545-554`
**Issue:** `deleteTeam` deletes `aiTeamMembers`, `aiTeamLinks` and the `aiTeams` row, but the `chatThreads` row with `scopeKey = 'team:<id>'` and all of its `chatMessages` survive. `validateBackupPayload` treats every `scopeType === 'team'` thread as a **live** reference (`entityId` must exist in `aiTeams`), so an export taken after a team delete is rejected at restore with `Team ChatThread references entityId ... not found in aiTeams`. The user's own backup becomes unrestorable — exactly the D-20 failure mode the phase is supposed to prevent. No UI caller today, but `deleteTeam` is a public repo API and Phase 37 owns runtime teardown on team deletion.
**Fix:** pick one and make the two sides agree.
```ts
// Option A — child rows die with the team (matches the V18 sdlc purge shape)
await db.transaction('rw', [db.aiTeams, db.aiTeamMembers, db.aiTeamLinks, db.chatThreads, db.chatMessages, db.chatTabs], async () => {
  const thread = await db.chatThreads.where('scopeKey').equals(`team:${id}`).first();
  if (thread) {
    await db.chatMessages.where('threadId').equals(thread.id).delete();
    await db.chatTabs.where('threadId').equals(thread.id).delete();
    await db.chatThreads.delete(thread.id);
  }
  ...
});
```
Option B — treat an orphan team thread as historical in `validateBackup.ts` (skip the `aiTeamIds` check when the team row is absent) and make `restoreRows` tolerate a tab whose scope has no team. Option A is smaller and keeps the validator strict.

## Warnings

### WR-01: A live-use claim leaks when `runtime.start()` throws

**File:** `src/services/ai/office/teamRunCoordinator.ts:338-348`, `:638`, `:652`, `:703`, `:713`
**Issue:** `claimLiveUse()` runs before `registry.get(id).start(request)`. `ChatTurnRuntime.start()` throws `TURN_IN_PROGRESS` when the agent already has a running turn, and nothing releases the claim on that path (no `try/finally`, and `settleAgent` is never reached). The agent stays `isAgentInUse() === true` for the rest of the session, so `deleteEmployee`/`deleteLead` refuse forever with "một lượt chạy đang dùng hồ sơ này".
**Fix:**
```ts
claimLiveUse(employee.id, employee.skillId);
try {
  const outcome = await registry.get(employee.id).start(request);
  ...
} catch (err) {
  releaseLiveUse(employee.id);
  settleAgent(employee.id, 'error');
  throw err;
}
```

### WR-02: `send()` has no re-entrancy guard and the composer is never disabled

**File:** `src/services/ai/office/teamRunCoordinator.ts:738-765`; `src/components/ai/office/TeamWorkspace.tsx:660-667`
**Issue:** `TeamWorkspace` hardcodes `turn={{ status: 'idle', ... }}` (WR-11 suppression of the anonymous bubble), so `ChatInputBar` stays enabled during a team run. A second submit calls `send()` → `saveTeamMessage(user)` → `startLeadTurn` → `registry.get(lead).start()` throws `TURN_IN_PROGRESS`, which propagates out of `void sendTurn(text)` as an unhandled rejection. The user message is already persisted, so the transcript gains a duplicate user row with no turn behind it.
**Fix:**
```ts
async function send(text: string): Promise<void> {
  if (phase !== 'idle' && phase !== 'ready') return;   // or reject with a typed refusal
  ...
}
```
and pass `disabled={snapshot.phase !== 'idle' && snapshot.phase !== 'ready'}` to the widget.

### WR-03: The lead prompt advertises every global employee, not this team's roster

**File:** `src/components/ai/office/TeamWorkspace.tsx:243-258`; `src/services/ai/office/teamRunCoordinator.ts:671-678`
**Issue:** `loadRoster` returns `employees: allEmployees` (the whole `aiEmployees` table), and `buildLeadTurnRequest` renders `roster.map(...)` into `[DANH SÁCH NHÂN VIÊN]`. The lead is therefore told to delegate to agents that are not members; `delegateBatch` validates against `listTeamMembers` and refuses the entire batch with `AGENT_NOT_IN_ROSTER`. The comment at `TeamWorkspace.tsx:144-145` ("only this team's own roster is addressable") is only true for @mentions, not for the prompt.
**Fix:**
```ts
const memberIds = new Set(memberRows.map((row) => row.agentId));
return {
  ...,
  employees: allEmployees.filter((row) => memberIds.has(row.id)),
  memberAgentIds: [...memberIds],
};
```

### WR-04: `addTeamMember({ role: 'lead' })` breaks the two-source invariant and bypasses the leader lock

**File:** `src/db/repositories/aiTeamRepo.ts:314-341`
**Issue:** The only lead-specific guard is "a lead row already exists". On a leadless team, `addTeamMember({ role: 'lead' })` writes a `role='lead'` row without touching `aiTeams.leadId` and without `assertLeaderUnlocked`. The result is a team with a lead member row and no `leadId` — exactly the state `validateBackup.ts:498-504` rejects (`AiTeam has a lead member row but no leadId`). The same call on a locked team adds a second lead row.
**Fix:** route lead assignment through `assignLeader` and reject `role: 'lead'` here:
```ts
if (validated.role === 'lead') {
  throw new Error('Dùng assignLeader để chọn leader.');
}
```
Also reject a duplicate `(teamId, agentId)` employee row in the same transaction — the drawer's `Select` currently relies on the option list to prevent it, and a double click can race.

### WR-05: Repo writers accept dangling ids, producing backups their own validator rejects

**File:** `src/db/repositories/aiTeamRepo.ts:81-133`, `:149-190`; `src/db/repositories/aiSkillVersionRepo.ts:43-66`
**Issue:** `createTeam` writes `leadId` and `employeeIds` without checking `aiLeads`/`aiEmployees`; `updateTeam({ leadId })` writes a lead row for an unvalidated id (unlike `assignLeader`, which does check); `createSkillVersion` accepts any `skillId`. Each produces rows that `validateBackupPayload` rejects (`AiTeam references leadId ... not found`, `AiTeamMember references agentId ... not found`, `AiSkillVersion references skillId ... not found`), i.e. an export that cannot be restored. D-15 requires the check at the repository boundary, not at the UI.
**Fix:** inside the existing transactions, `await db.aiLeads.get(leadId)` / `bulkGet(employeeIds)` / `await db.aiSkills.get(skillId)` and throw a named error when a row is missing.

### WR-06: `deleteLead` ignores lead ids used as employee member rows

**File:** `src/db/repositories/aiOfficeRepo.ts:193-210`
**Issue:** The guard only queries `aiTeams.where('leadId')`. `validateBackup.ts:519-521` deliberately accepts a lead id as an `aiTeamMembers.agentId`, so a lead can be a roster member; deleting it then leaves a member row pointing at nothing, and the next export fails validation. `aiTeamMembers` is already in the transaction scope but never read.
**Fix:**
```ts
const memberships = await db.aiTeamMembers.where('agentId').equals(id).toArray();
if (teams.length > 0 || memberships.length > 0 || isAgentInUse(id)) { ... }
```

### WR-07: Interrupted-turn inference fires for a turn that is still running

**File:** `src/db/repositories/teamTranscriptRepo.ts:128-158`; `src/components/ai/office/TeamWorkspace.tsx:181-186`
**Issue:** An `instruction` row with no *later* `report` is reported as interrupted. While a batch turn is in flight the instruction exists and the report does not, so the "Lượt trước bị gián đoạn" warning renders during a perfectly healthy run and disappears when the report lands. The alert is advisory, but it states the turn "chưa hoàn tất và không được tự động chạy lại" while it is in fact running.
**Fix:** suppress entries whose `agentId` has a non-terminal status in `snapshot.agents` before rendering, or pass a `liveAgentIds` set into the reader.

### WR-08: `decideSkillVersion` can overwrite an already-decided row

**File:** `src/db/repositories/aiSkillVersionRepo.ts:68-85`
**Issue:** Nothing checks `existing.status`. Calling it twice flips `approved` → `rejected` (or back) and rewrites `decidedAt`, so the recorded decision — the thing D-16 says the backup must preserve — is destroyed rather than versioned.
**Fix:**
```ts
if (existing.status !== 'pending') {
  throw new Error('Phiên bản kỹ năng đã được quyết định, không thể đổi trạng thái.');
}
```

### WR-09: `evidence` is a new unbounded free-text carrier that round-trips through backup

**File:** `src/validation/aiOfficeSchemas.ts:123-130`; `src/validation/backupSchemas.ts:686-697`; `src/types/aiOffice.ts:1-10`
**Issue:** `evidence: z.string().optional()` has no `.max()`, and the type header still claims "the only free-text carriers here are `persona` (agents/leads) and `body` (skills)". A skill-version row can therefore carry arbitrary text (including prompt or secret material) into every backup, unbounded, with no documented denylist coverage — the AI Office records use `strictObject` but are not run through `findForbiddenBackupKey`.
**Fix:** cap it (`z.string().max(2000)`), update the header comment, and either add `evidence` to the forbidden-key scan or document why it is exempt.

### WR-10: Restore clears the whole AI Office group when any single AI table key is present

**File:** `src/services/backup/restoreBackup.ts:241-247`
**Issue:** `clearAiOffice` triggers on `AI_OFFICE_TABLE_KEYS.some(key => tables[key] !== undefined)`. A v12 payload that carries `aiSkillVersions: []` but omits `aiEmployees`/`aiLeads`/`aiTeams` passes validation (the validator never requires the tables) and wipes every AI Office row without restoring replacements. Adding `aiSkillVersions` as a seventh trigger key widened this. D-20 says a malformed payload must be rejected whole, not partially applied.
**Fix:** require the AI Office table set to be all-present or all-absent:
```ts
const aiPresent = AI_OFFICE_TABLE_KEYS.filter((key) => tables[key] !== undefined);
if (aiPresent.length > 0 && aiPresent.length !== AI_OFFICE_TABLE_KEYS.length) {
  throw new Error('Backup thiếu bảng AI Office — từ chối nhập để tránh mất dữ liệu.');
}
```

### WR-11: Delete guard and delete are not atomic across the live-use check

**File:** `src/db/repositories/aiOfficeRepo.ts:117-133`, `:197-209`, `:265-278`
**Issue:** `isAgentInUse`/`isSkillInUse` are synchronous, but `await db.aiTeams.bulkGet(...)` / `await db.aiEmployees.where(...).toArray()` sits between the check and the delete. A turn starting in that window (`beginTurn` is synchronous and can run from a microtask) is deleted under, violating D-13/D-15's "guard and write share one transaction".
**Fix:** re-check the registry immediately before the delete, after the last `await`:
```ts
if (isAgentInUse(id)) return refusal;
await db.aiEmployees.delete(id);
```

### WR-12: Repo calls fired with `void` and no catch produce unhandled rejections

**File:** `src/components/ai/office/TeamWorkspace.tsx:408-440`, `:542-547`, `:683-688`; `src/views/TeamsView.tsx:164-166`
**Issue:** `handleSaveSettings` (`void handleSaveSettings(input)`), both toggle handlers, and `activateTeam` are fire-and-forget. Any throw (`Không tìm thấy nhóm` after a concurrent delete, `LEADER_LOCKED_MESSAGE`, a closed DB) becomes an unhandled rejection with no UI feedback. The previous `activateTeam(...).catch(...)` was removed in this phase, so that path is newly unguarded.
**Fix:** wrap each in `void fn().catch((err) => setError(...))`, or reuse the `runRosterAction` pattern already present in `TeamSettingsDrawer`.

### WR-13: `topUp` cannot top up a member added since the last turn snapshot

**File:** `src/services/ai/office/teamRunCoordinator.ts:470-475`, `:951-958`
**Issue:** `topUp` calls `ensureMembers()`, which early-returns once `membersLoaded` is true. With the `loadRoster` seam, `membersLoaded` is set by `applyRosterMembership` from the *turn's* snapshot, so a member added after the last turn has no `memberIds` entry and `topUp({ kind: 'agent' })` silently does nothing (no error, no budget change).
**Fix:** in the agent branch, fall back to reading the member row:
```ts
const memberId = memberIds.get(scope.agentId)
  ?? (await listTeamMembers(teamId, db)).find((row) => row.agentId === scope.agentId)?.id;
```

## Info

### IN-01: Two independent sources for the envelope version literal
**File:** `src/services/backup/exportBackup.ts:7`, `src/validation/backupSchemas.ts:700`
**Issue:** `CURRENT_SCHEMA_VERSION = 12` and `BACKUP_SCHEMA_VERSION = 12` are separate literals; a bump in one place silently desynchronises `BackupEnvelopeSchema` from the export path.
**Fix:** export one constant and import it in the other module.

### IN-02: Dead `schemaVersion === 1` normalization block
**File:** `src/services/backup/validateBackup.ts:560-567`
**Issue:** Every version `< 12` is rejected at line 99-106, so the v1 backfill can never run.
**Fix:** delete the block.

### IN-03: Unused exported type `AiSkillVersionInput`
**File:** `src/validation/aiOfficeSchemas.ts:143`
**Issue:** `aiSkillVersionRepo` uses `z.input<...>` (`AiSkillVersionDraft`); nothing imports `AiSkillVersionInput`.
**Fix:** remove the export.

### IN-04: Rust `ALLOWED_TABLES` still lists dropped stores
**File:** `src-tauri/src/sqlite_persistence.rs:6-31`
**Issue:** `projects` and `milestones` were dropped in Dexie V16 but remain writable through `sqlite_apply_changes`. TS⊆Rust holds, so the parity test passes, but the allowlist is wider than the schema.
**Fix:** drop both names (the Rust unit test at `:204-221` seeds `projects` and would need updating).

### IN-05: `deleteLead` transaction includes a table it never touches
**File:** `src/db/repositories/aiOfficeRepo.ts:197`
**Issue:** `aiTeamMembers` is in the scope list but only read once WR-06 is fixed; today it is dead scope.
**Fix:** add the membership read (WR-06) or remove the table from the list.

### IN-06: Sort comparator returns `0` for unequal timestamps
**File:** `src/db/repositories/teamTranscriptRepo.ts:76`
**Issue:** `rows.sort((a, b) => a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : 0)` relies on the preceding `sortBy('createdAt')` being stable to preserve order. Correct today, fragile if the source changes.
**Fix:** `a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt)`.

### IN-07: Formatting/whitespace defects
**File:** `src/validation/backupSchemas.ts:700`, `src/db/schema.ts:145-154`, `src/types/backup.ts:106-107`
**Issue:** Two exports on one line (`BACKUP_SCHEMA_VERSION = 12 as const;export const BackupEnvelopeSchema`), and trailing blank-line runs in the other two files.
**Fix:** run prettier over the three files.

### IN-08: Stale status maps and a mislabelled settings button
**File:** `src/workbench/toolwindows/AiOfficeExplorer.tsx:20-30`; `src/views/TeamsView.tsx:163`; `src/components/ai/office/TeamWorkspace.tsx:442-448`, `:1013-1018`
**Issue:** `STATUS_COLOR_MAP`/`STATUS_LABEL_MAP` carry `paused`/`archived`, which are not `AiTeamStatus` values; `TeamCard`'s "Cài đặt nhóm" calls `openTeam` (the workspace) rather than opening the settings drawer; `handleAddLink` swallows every error in an empty `catch` (a closed DB is indistinguishable from a duplicate link); `pausedAgentName` falls back to the raw agent UUID.
**Fix:** trim the maps to `active`/`idle`, pass an `onOpenSettings` that opens the drawer, narrow the catch to the duplicate-link error, and fall back to a neutral label instead of the id.

---

_Reviewed: 2026-11-10T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
