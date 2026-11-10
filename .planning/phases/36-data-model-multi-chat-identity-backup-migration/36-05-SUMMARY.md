---
phase: 36-data-model-multi-chat-identity-backup-migration
plan: 05
subsystem: ai-office-data
tags: [dexie, skill-versions, d-05, d-19, interrupted-turn, backup-round-trip]
dependency-graph:
  requires:
    - 36-01 (aiSkillVersions table at V19, backup export/restore wiring)
    - 36-03 (transcript repo, live-use registry, no-persisted-runtime-state rule)
    - 36-04 (workspace UI surfaces the warning sits above)
  provides:
    - "aiSkillVersionRepo: listSkillVersions, getLatestSkillVersion, createSkillVersion, decideSkillVersion"
    - "listInterruptedAssignments(threadId, db) — pure D-19 inference from persisted rows"
    - "Interrupted-turn warning Alert in the team workspace"
  affects:
    - 39 (pins a run to a monotonic skill version)
    - 37 (owns the mention-turn lifecycle that would extend the inference)
tech-stack:
  added: []
  patterns:
    - "version number computed inside the same rw transaction as the insert"
    - "latest row read through the [skillId+version] compound index, never toArray()"
    - "unfinished turn inferred from a missing report row — no persisted runtime status"
    - "reader is pure; the UI is advisory and never gates the composer"
key-files:
  created:
    - src/db/repositories/aiSkillVersionRepo.ts
    - tests/services/ai/office/aiSkillVersionRepo.test.ts
  modified:
    - src/db/repositories/teamTranscriptRepo.ts
    - src/components/ai/office/TeamWorkspace.tsx
    - tests/services/ai/office/teamTranscriptRepo.test.ts
    - tests/views/TeamsView.test.tsx
decisions:
  - "createSkillVersion takes z.input of the schema so a draft may omit status; pending is the schema default, never derived"
  - "decideSkillVersion is the only status writer and touches status + decidedAt only (T-36-12)"
  - "interrupted-turn agentName resolves from aiEmployees, because the instruction row is attributed to the lead (D-31)"
  - "mention-turn inference deferred to Phase 37 — a mention turn writes no instruction row"
metrics:
  duration: "~18 min"
  completed: "2026-11-10"
---

# Phase 36 Plan 05: Skill-Version Contract and Interrupted-Turn Inference Summary

One-liner: `aiSkillVersionRepo` gives the version store a tested monotonic contract with no approval side effects, and D-19's "unfinished turn" is surfaced by inferring a missing report row — pure read, survives export → restore, persists no runtime state.

## What Was Built

### Task 1 — Skill-version repo contract (`fc4ee1fb`)

`src/db/repositories/aiSkillVersionRepo.ts`:

- `listSkillVersions(skillId, db)` — newest `version` first.
- `getLatestSkillVersion(skillId, db)` — reads through the `[skillId+version]` compound index with `.between([skillId, 0], [skillId, MAX_SAFE_INTEGER]).last()`; never `toArray()`s the table.
- `createSkillVersion(input, db)` — `AiSkillVersionInputSchema.parse(input)` first, then the version number and the insert share one `db.transaction('rw', [db.aiSkillVersions], ...)`. `status` is whatever the schema validated (default `pending`); `evidence` is only assigned when present, so a row created without it has no `evidence` key at all.
- `decideSkillVersion(id, 'approved' | 'rejected', db)` — throws `Không tìm thấy phiên bản kỹ năng: <id>` when missing, otherwise writes `{ status, decidedAt }` inside one `rw` transaction and nothing else.

Input type is `AiSkillVersionDraft = z.input<typeof AiSkillVersionInputSchema>` so callers may omit `status` (the schema supplies `pending`); the repo never invents a status.

Seven tests in `tests/services/ai/office/aiSkillVersionRepo.test.ts`, all passing:

1. empty table → version 1, status `pending`.
2. 1/2/3 per skill, restart at 1 for another skill.
3. `getLatestSkillVersion` returns the highest row (row identity asserted).
4. `decideSkillVersion` writes status + `decidedAt`, `toEqual` proves name/description/body/version unchanged.
5. reject a pending row; missing id throws the exact not-found copy.
6. `'evidence' in row === false` on both the returned row and the stored row.
7. `Promise.all` of two creates → two distinct versions `[1, 2]`.

### Task 2 — D-19 unfinished-turn inference (`1394b3b2`)

`src/db/repositories/teamTranscriptRepo.ts` gains `listInterruptedAssignments(threadId, db)`:

- Reuses `readThreadMessages` (createdAt sort, id tie-break) so ordering matches the transcript render.
- Every `messageKind === 'instruction'` row with a `targetAgentId` is reported unless a `messageKind === 'report'` row with `agentId === targetAgentId` appears at a strictly later index. A report written before the instruction is stale and does not satisfy it.
- `agentName` resolves from `aiEmployees.bulkGet`, because the instruction row is attributed to the lead (D-31) and its `agentName` is the lead's. Falls back to `'Nhân viên'` for a deleted employee.
- Pure read: no writes, no persisted status column. The file comment records the prohibition and the ceiling.

`src/components/ai/office/TeamWorkspace.tsx` adds a `useLiveQuery` over the reader and renders a single closable `<Alert type="warning" showIcon>` above the transcript region, titled `Lượt trước bị gián đoạn`, naming each affected agent plus the task text, plus a line stating the turn did not finish and was not resumed automatically. It never gates the composer and offers no Continue/Discard (that is `InterruptedBanner`'s job for ordinary chat, and D-19 forbids continuing an in-flight request).

Five reader tests + two component tests, all passing:

1. matched instruction+report → `[]`.
2. unmatched instruction → one entry naming the agent and task.
3. report older than the instruction does not satisfy it.
4. real `exportBackupPayload` → `restoreBackupPayload` into a second DB → same entry (the D-19 "after restore" proof).
5. `listInterruptedAssignments` leaves `chatMessages.count()` and `chatTabs.toArray()` unchanged.
6. component: unfinished turn renders the alert with "gián đoạn" and the agent's name.
7. component: matched pairs render no such alert.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Restore case needed a resolvable lead + lead member row**
- **Found during:** Task 2, first run of the export → restore case.
- **Issue:** `restoreBackupPayload` validates before writing. The test fixture seeded `aiTeams.leadId` with a bare `generateId()`, so validation failed twice: first `AiTeam references leadId ... not found in aiLeads`, then `AiTeam leadId ... has no matching lead member row`.
- **Fix:** the restore case now creates a real lead via `createLead` and calls `assignLeader(teamId, lead.id, db)`, which writes both the team's `leadId` and the lead member row.
- **Files modified:** `tests/services/ai/office/teamTranscriptRepo.test.ts`
- **Commit:** `1394b3b2`

### Scope decisions worth recording

- **Mention-turn inference is deferred to Phase 37.** A mention turn writes a user message and a report but no instruction row, so the instruction/report pairing cannot see it. Extending D-19 to mention turns needs the user-message → report pairing that Phase 37's turn lifecycle owns. Recorded in the `listInterruptedAssignments` file comment and here, not silently skipped.
- **`agentName` comes from the roster, not the row.** The plan's behavior text implied the instruction row names the agent; in production the instruction is attributed to the lead (D-31, `targetAgentId` carries the assignee). Reading `row.agentName` would have named the lead. Resolved from `aiEmployees` instead.

## Pre-existing Issues (out of scope)

`tests/views/TeamsView.test.tsx` emits 6 `DatabaseClosedError: Database has been closed` unhandled rejections. Verified identical at HEAD with the plan's changes stashed (30/30 passing then, 32/32 now) — pre-existing, not introduced here, left alone per the scope boundary.

## Threat Surface

No new surface beyond the plan's `<threat_model>`. T-36-12 (only an explicit `decideSkillVersion` call moves a row off `pending`) and T-36-18 (the alert renders roster names and task text only — no ids, prompts or model output) are both covered by tests. T-36-17 accepted as planned.

## Verification

- `npx vitest run tests/services/ai/office/aiSkillVersionRepo.test.ts` → 7/7 pass.
- `npx vitest run tests/services/ai/office/teamTranscriptRepo.test.ts` → 15/15 pass.
- `npx vitest run tests/views/TeamsView.test.tsx` → 32/32 pass (30 baseline + 2 new).
- `npx tsc --noEmit` → exit 0.
- No npm dependency added. Full suite not run.

## Self-Check: PASSED

- `src/db/repositories/aiSkillVersionRepo.ts` — FOUND
- `tests/services/ai/office/aiSkillVersionRepo.test.ts` — FOUND
- `src/db/repositories/teamTranscriptRepo.ts` exports `listInterruptedAssignments` — FOUND
- `src/components/ai/office/TeamWorkspace.tsx` renders the warning — FOUND
- Commits `fc4ee1fb`, `1394b3b2` — FOUND in `git log`
