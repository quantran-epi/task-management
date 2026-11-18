---
phase: 41-ai-office-team-docs-zones
plan: 06
subsystem: ai-office/team-run-coordinator
tags: [coordinator, docs-tree, backfill, tool-context, payload-filter, mutation-classification]
requires:
  - "ensureTeamDocsReady / createTeamDocsTree (plan 41-02)"
  - "write_doc + EMPLOYEE_ONLY_TEAM_TOOLS (plan 41-03)"
  - "docsFolderId on team and member rows (plans 41-01/41-04)"
  - "folderId / docsFolderId / memberFolders prompt inputs (plan 41-05)"
provides:
  - "ensureDocsReady turn-start hook (send + retryAssignment)"
  - "memberFolderIds per-turn state"
  - "role / agentName / folderId on TeamToolContext from the coordinator"
  - "leadTools() filtered by EMPLOYEE_ONLY_TEAM_TOOLS"
  - "folder facts wired into both prompt builders"
affects:
  - "src/services/ai/office/teamRunCoordinator.ts (all later team-turn work reads this state)"
tech-stack:
  added: []
  patterns:
    - "docs failure degrades to an absent folder id, never to a failed turn"
    - "leader folder id withheld by an isLead ternary, not by an absent member row"
    - "payload filter and handler role guard are two independent belts"
key-files:
  created: []
  modified:
    - src/services/ai/office/teamRunCoordinator.ts
    - tests/services/ai/office/teamRunCoordinator.test.ts
decisions:
  - "D-05: the tree is ensured at turn start, before any tool context exists — never lazily in the tool"
  - "D-06/T-41-33: the lead payload omits write_doc; the handler's lead-role guard is the code half"
  - "T-41-26: the leader gets no folderId even though its member row has a live folder"
  - "D-01: write_doc is not mutation-classified, so a read-only employee turn executes it"
  - "T-41-27: a throwing backfill empties the map instead of killing the turn"
metrics:
  duration: "~20 min"
  completed: "2026-11-15T05:05:26Z"
  tasks: 3
  files_changed: 2
---

# Phase 41 Plan 06: Coordinator docs-zone wiring Summary

The coordinator now guarantees the team's docs tree before every turn, hands each employee its own folder id and the leader none at all, keeps `write_doc` out of the lead payload, and feeds both prompt builders the folder facts they were written to accept.

## What Was Built

**Task 1 — turn-start hook, folder state, tool context, payload filter (`cfa82623`)**
- `memberFolderIds: Map<string, string>` declared beside `liveTeam`, rebuilt per turn.
- `ensureDocsReady()` placed after `ensureMembers()`: returns early when `disposed`, calls `ensureTeamDocsReady(teamId, db)`, assigns `liveTeam` and the map, and on any throw resets the map to empty. The bare `catch` carries a comment naming the trade — a docs failure must never block a chat turn, and the cost is that a programming error inside the repo function also lands silently, which is why plans 41-02/41-04 pin that function's store list.
- `send()` calls it after the roster load and before `refreshMcpTools()`, with a fresh `disposed` re-check after the await. `retryAssignment()` calls it as the first statement after `getAssignment`, inside the existing `try`. `dispatchBatch` deliberately untouched — it is only reachable from a lead turn that `send()` already prepared.
- `toolContext()` gained `role`, `agentName` and `folderId`. `role` is `isLead ? 'lead' : 'employee'`; `agentName` comes from the lead row or the employee row; `folderId` is `isLead ? undefined : memberFolderIds.get(agentId)`. All three spread conditionally, so `exactOptionalPropertyTypes` never sees an explicit `undefined`.
- `leadTools()` last spread became `TEAM_TOOL_DEFINITIONS.filter((tool) => !EMPLOYEE_ONLY_TEAM_TOOLS.has(normalizeToolName(tool.function.name)))`. `employeeTools()` untouched — it keeps `write_doc` through `EMPLOYEE_TEAM_TOOLS`.

**Task 2 — folder facts into both prompts (`c580cb4f`)**
- Employee: `const folderId = memberFolderIds.get(employee.id)` read once, spread as `...(folderId ? { folderId } : {})`.
- Lead: `memberFolders` built once from `roster.employees.flatMap`, skipping any member with no map entry (T-41-28); `...(liveTeam.docsFolderId ? { docsFolderId } : {})` and `...(memberFolders.length > 0 ? { memberFolders } : {})`.
- `mutationPolicy: 'read-only'` still appears exactly once, on the employee request; `autoApprove`, `tools` and `analysisMode` unchanged.

**Task 3 — coordinator tests (`3f6b66c9`)**
- The pre-existing lead-payload loop at the old `:423` inverted to the filtered form and renamed "…plus every non-employee-only team tool". The one remaining unfiltered `for (const definition of TEAM_TOOL_DEFINITIONS)` loop is the tool-name resolution test, which stays correct because `write_doc` still resolves to a handler.
- A `vi.mock` wrapper around `executeTeamTool` records `{ agentId, role, folderId }` per call and delegates to the real implementation — the only seam that can observe the coordinator-built context. `vi.hoisted` holds the array so the factory can close over it.
- Eleven new behaviours in `describe('teamRunCoordinator — team docs zones (AIO-DOCS-02..06, D-01..D-16)')`: harness tree shape (6 folders: root + team + 4 member rows); backfill once on first send then no growth on the second (CONTEXT 7); dead team folder recreated with a new id and every member folder parented under it (CONTEXT 8); a rejected `db.notes.add` still returns `'started'` and leaves `docsFolderId` absent; employee payload has `write_doc` and `payloadHasMutationTool === false`; lead payload lacks `write_doc` and keeps `create_note` while the employee payload has it; `isMutationTool('write_doc') === false` / `('create_note') === true`; a direct `onMutationCheck('create_note', …)` under the read-only turn returns `READ_ONLY_REFUSAL`; `resolveTeamToolName('write_doc') === 'teamTools'`; employee prompt contains its own folder id and `write_doc`; lead prompt contains the team folder and every member folder; lead tool contexts all carry `role: 'lead'` and no `folderId` while the lead's member row has a live folder.
- Test count 155 → 167 `it(` blocks (the plan asked for +10).

## Verification

- `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts` — 1 file, 170 tests passed.
- `npx vitest run tests/ai/chatTurnRuntime.test.ts tests/services/ai/office/teamTools.test.ts tests/services/ai/office/teamPrompts.test.ts` — 3 files, 145 tests passed (CONTEXT test 5's runtime half).
- `npx vitest run tests/db/teamDocsRepo.test.ts tests/services/ai/office/aiTeamRepo.test.ts tests/db/tableListParity.test.ts` — 3 files, 93 tests passed.
- `npx tsc --noEmit` — clean.
- Acceptance greps: `await ensureTeamDocsReady(` ×1; `await ensureDocsReady()` ×2 (`send`, `retryAssignment`); `memberFolderIds` ×7; `isLead ? undefined : memberFolderIds.get` ×1; `liveTeam.docsFolderId` ×1 (lead prompt only, never inside `toolContext`); `EMPLOYEE_ONLY_TEAM_TOOLS` ×2 (import + filter); `mutationPolicy` ×2 (unchanged from HEAD); `mutationPolicy: 'read-only'` ×1; `write_doc` in `chatTurnRuntime.ts` ×0.

## Deviations from Plan

**1. [Rule 3 - Blocking] Task 2's edits landed in Task 1's commit and had to be split out**
- **Found during:** Task 2 commit
- **Issue:** The first commit staged the whole file after both tasks' edits were applied, so task 1's commit carried the prompt wiring too — the two tasks would not have been atomic.
- **Fix:** Reverted the two Task 2 hunks, amended the Task 1 commit to the hook/context/filter only (`cfa82623`), then re-applied the prompt wiring and committed it separately (`c580cb4f`). Test suite re-run after the split: still 170 passed.
- **Files modified:** `src/services/ai/office/teamRunCoordinator.ts`
- **Commit:** `cfa82623`, `c580cb4f`

**2. [Rule 2 - Missing critical coverage] Added a direct read-only refusal test instead of citing the runtime suite alone**
- **Found during:** Task 3
- **Issue:** The plan made the runtime half of CONTEXT test 5 optional ("optionally add one `it`"). Citing `tests/ai/chatTurnRuntime.test.ts` compositionally proves the gate but leaves this file unable to fail if the employee turn's policy ever changed.
- **Fix:** The employee script captures `options.onMutationCheck` and the test calls it with `create_note`, asserting `proceed === false` and `cancellationResult === READ_ONLY_REFUSAL`. The cited suite still runs in verification.
- **Files modified:** `tests/services/ai/office/teamRunCoordinator.test.ts`
- **Commit:** `3f6b66c9`

## Requirements

- `AIO-DOCS-02`, `AIO-DOCS-03`, `AIO-DOCS-05`, `AIO-DOCS-06` — all four now satisfied end to end: the tree exists per turn, each agent writes only inside its own folder, the leader's final write stays `create_note` plus the approval card, and a docs failure degrades to a refusal rather than a broken turn. `AIO-DOCS-05` is checked here because this plan is the one that makes the payload and the runtime gate agree.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-41-25 (the backfill's own `rw` transaction serialises concurrent turns — unchanged here, only called), T-41-26 (`isLead ? undefined : memberFolderIds.get`, asserted by the lead-context test), T-41-27 (bare catch with the trade named in the comment, asserted by the rejected-add test), T-41-28 (`flatMap` over live roster members only), T-41-29 (accepted by design, pinned by `isMutationTool('write_doc') === false`) and T-41-33 (payload filter plus the inverted pre-existing loop) are all as planned.

## Self-Check: PASSED

- `src/services/ai/office/teamRunCoordinator.ts` — FOUND (`ensureDocsReady`, `memberFolderIds`, `role`/`agentName`/`folderId` in `toolContext`, filtered `leadTools`, both prompt call sites)
- `tests/services/ai/office/teamRunCoordinator.test.ts` — FOUND (170 tests, 12 new `it(` blocks, one filtered loop)
- commits `cfa82623`, `c580cb4f`, `3f6b66c9` — FOUND in `git log`
