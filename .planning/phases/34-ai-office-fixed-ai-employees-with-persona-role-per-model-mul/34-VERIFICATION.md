---
phase: 34-ai-office-fixed-ai-employees-with-persona-role-per-model-mul
verified: 2026-11-08T18:00:33Z
status: human_needed
score: 35/35 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 33/35
  gaps_closed:
    - "Editing the team budget in settings is silently reverted by the next team top-up, and the pause threshold keeps using the stale total"
    - "The assignment plan card still unmounts the moment a decision is made, so its role=status line is never observable"
  gaps_remaining: []
  regressions: []
deferred: []
human_verification:
  - test: "Walk the team workspace with keyboard only: sidebar → header actions → transcript (one stop) → composer; then start a batch and Tab/Arrow through the per-agent Stop buttons."
    expected: "Focus order matches UI-SPEC §5b, the transcript is a single stop, and Arrow keys rove across agent Stop buttons."
    why_human: "Focus order and screen-reader announcement cannot be verified by grep or jsdom reliably."
  - test: "Run a real team batch with a small agent budget, let one agent pause at 80%, then top up from the banner."
    expected: "The banner names the agent, the modal shows 'Nhân viên: <name>', and the agent resumes exactly where it stopped while its peers keep running."
    why_human: "The wiring is verified and unit-tested, but the real streaming/resume feel and the absence of a perceived hang need a live model."
---

# Phase 34: AI Office Verification Report

**Phase Goal:** A user can staff an AI Office of reusable employees and leads, assign one skill per employee, and run a team where a lead decomposes the request, proposes a confirmed assignment plan, and dispatches parallel read-only employee batches over a shared, offline-searchable transcript — with lead-only mutations parked on the existing approval card and per-team/per-agent token budgets that pause at 80% instead of auto-stopping.
**Verified:** 2026-11-08T18:00:33Z
**Status:** human_needed (all 35 truths verified; two live-model/keyboard checks remain for a human)
**Re-verification:** Yes — after gap-closure commit `22c567bb`

## Re-verification Summary

| Previous gap | Claimed fix | Verdict |
|---|---|---|
| 1. Saved team budget lost on next top-up (BLOCKER, AIO-BUDGET-01) | `setTeamBudget(total)` on the coordinator mutates `teamBudget` + `liveTeam.budgetTokens` + `lastTeamBucket`; `TeamWorkspace.handleSaveSettings` calls it before member top-ups; `topUp({kind:'team'})` writes `teamBudget + amount` | ✓ CLOSED — code present at `teamRunCoordinator.ts:767-774` and `TeamWorkspace.tsx:309`; regression test `accumulates a team top-up onto an edited total` passes; independent probe: 3000 → `setTeamBudget(10000)` → top-up 2000 → persisted **12000** |
| 2. Plan card decision line never observable (BLOCKER) | snapshot carries `lastPlan`/`lastPlanDecision`; `runBatch` populates them after `resolvePlan`; workspace renders `snapshot.pendingPlan ?? snapshot.lastPlan` with the matching decision | ✓ CLOSED — `teamRunCoordinator.ts:212-213, 678-679, 853-854`; `TeamWorkspace.tsx:355-360`; regression test `keeps the decided plan in the snapshot` passes; independent workspace probe: after approve the card stays, `Đã chấp thuận — lô việc đang chạy.` is in the DOM, approve/reject buttons are gone |
| Warning: sidebar top-up inherited the last agent scope | `onTopUp` resets `topUpScope` to `{kind:'team'}` | ✓ CLOSED — `TeamWorkspace.tsx:418` |

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Employees and leads are separate global entities; editing an employee persona changes it in every team | ✓ VERIFIED | `aiOfficeRepo.ts` CRUD on `aiEmployees`/`aiLeads`; teams store only `leadId` + `aiTeamMembers.agentId`; `countTeamsUsingEmployee` (`:95-100`) drives the shared-edit alert |
| 2 | Activating a team dispatches the lead, which emits an assignment plan card; approval runs a concurrent batch (cap 3) and the lead synthesizes only after | ✓ VERIFIED | `teamRunCoordinator.ts:652-731` (plan park, `Promise.allSettled` + deferred settle); `MAX_BATCH_SIZE=3` (`types/aiOffice.ts:117`); `TeamWorkspace.tsx:355` renders `AssignmentPlanCard` |
| 3 | Every transcript message is attributed and renders in one channel; `@agent` addresses an employee; a running agent streams into its own bubble with a status badge | ✓ VERIFIED | `chatRepo.ts:173-176`; `ChatMessageList.tsx`; `TeamWorkspace.tsx` live bubbles; `AgentAttributionRow.tsx` |
| 4 | Employee turns are structurally read-only; every lead mutation parks on the existing `MutationApprovalCard` unless auto-approve is on | ✓ VERIFIED | `chatTurnRuntime.ts:374-378` read-only branch precedes artifact/auto-approve; `teamRunCoordinator.ts:563` reads `liveTeam.autoApproveMutations`; `AiChatWidget.tsx` renders `MutationApprovalCard` |
| 5 | With the Knowledge Server stopped and network offline, an agent can recall older work via `search_team_history` and `read_team_turn` | ✓ VERIFIED | `teamTools.ts:1-7` imports only `utils/bm25.ts` + IndexedDB repos; no network call in either handler |
| 6 | At 80% of the team budget **or of one agent's budget**, that scope pauses between tool rounds, preserves context, and resumes exactly where it stopped — nothing auto-aborted, no pause reads as a hang | ✓ VERIFIED | Per-agent scope unchanged (`:408-416`, agent-named banner + agent-scoped top-up). Team scope now adopts a settings edit: `setTeamBudget` (`:767-774`) updates `teamBudget`, `liveTeam.budgetTokens`, `lastTeamBucket`, and reopens the gate; `topUp({kind:'team'})` writes `teamBudget + amount` (`:815`). Probe: team-only gate park → `setTeamBudget(50000)` → agent settles `done`; team top-up then completes the run |
| 7 | A stopped agent reports back marked incomplete, and a global Stop aborts the lead plus every running agent | ✓ VERIFIED | `teamRunCoordinator.ts:281` (`incomplete: true`), `:783-793` (`stopAgent` / `abortAll`) |
| 8 | Team runs continue when the user leaves the tab; returning shows the full result | ✓ VERIFIED | Module-level `coordinatorRegistry` (`TeamWorkspace.tsx:58`), no React import in the coordinator, transcript persisted in `chatMessages` |
| 9 | Dexie opens at version 17 with six new stores and every V16 row readable | ✓ VERIFIED | `db/schema.ts:121` `SCHEMA_V17`; `db/index.ts:492` `this.version(17)`; `tests/db/schemaV17Migration.test.ts` passes |
| 10 | A chat message carries `agentId`/`agentName`/`agentKind`/`messageKind` without changing existing rows | ✓ VERIFIED | `types/models.ts:321`; `chatRepo.ts`; `chatTurnRuntime.ts:487-498`; backup schema `backupSchemas.ts:330-333` |
| 11 | `'team'` is a first-class scope and `team:<id>` rehydrates as `team`, never `global` | ✓ VERIFIED | `models.ts`; `chatTabRepo.ts`; `schemaV17Migration.test.ts` |
| 12 | Employees/leads/skills are global; teams reference by id | ✓ VERIFIED | `aiTeamRepo.ts` stores `leadId` + `agentId`; no embedded copies |
| 13 | A fourth team cannot activate while three are active; a team cannot hold more than three employees | ✓ VERIFIED | `aiTeamRepo.ts:49, 94-95, 116`; `MAX_ACTIVE_TEAMS=3`, `MAX_EMPLOYEES_PER_TEAM=3` (`types/aiOffice.ts:115-116`) |
| 14 | Reactivating an idle team reuses the same chat thread | ✓ VERIFIED | `teamTranscriptRepo.ts:31-37` `ensureTeamThread` → `createOrGetThread` on `team:<id>` |
| 15 | An even split sums exactly to the total, remainder on the lead row | ✓ VERIFIED | `aiTeamRepo.ts:53-65` `splitBudget`/`writeEvenSplit`; `TeamSettingsDrawer.tsx`; test asserts 1668 lead row of 5000 |
| 16 | A team transcript read can never return another team's row | ✓ VERIFIED | `teamTranscriptRepo.ts:108-114` `getTeamTurn` checks `row.threadId !== threadId` |
| 17 | `persistUserMessage: false` writes no `role:'user'` row | ✓ VERIFIED | `chatTurnRuntime.ts:258` guard |
| 18 | `mutationPolicy:'read-only'` refuses every mutation before the artifact and auto-approve branches | ✓ VERIFIED | `chatTurnRuntime.ts:374-378`; test in `chatTurnRuntime.test.ts` |
| 19 | `beforeToolRound` is forwarded with the turn's own signal and awaited each round after the first | ✓ VERIFIED | `chatTurnRuntime.ts:303-304`; `aiOrchestratorLoop.ts:232-235` (`loopCount > 1` + `throwIfAborted`) |
| 20 | The employee payload contains no mutation tool and no `delegate_batch` | ✓ VERIFIED | `teamRunCoordinator.ts:135-137, 306-308`; `EMPLOYEE_READ_ONLY_ALLOWLIST` (`chatTurnTools.ts:15`); coordinator test |
| 21 | The 80% crossing is a pure function of used/budget; a top-up makes the next crossing notify again | ✓ VERIFIED | `budgetGate.ts:68-81`; `budgetGate.test.ts` |
| 22 | Each agent gets its own runtime instance, so three concurrent starts never throw `TURN_IN_PROGRESS` | ✓ VERIFIED | `teamRunRegistry.ts`; `chatTurnRuntime.ts` guard; coordinator test |
| 23 | An employee's system prompt contains the skill description and never the skill body | ✓ VERIFIED | `teamPrompts.ts:88-93`; `teamPrompts.test.ts` |
| 24 | An employee's history contains its own instruction/report pairs capped, plus the recent window, never the whole transcript | ✓ VERIFIED | `teamPrompts.ts:114-131`; `teamTranscriptRepo.ts:78-106` |
| 25 | Retrieved content is wrapped in a delimited untrusted-data segment | ✓ VERIFIED | `teamPrompts.ts:43-54, 99-108` |
| 26 | Six team tools: compact BM25 hits, team-scoped full turn read, skill body, compact links, full linked content, structured `delegate_batch` refusals | ✓ VERIFIED | `teamTools.ts:52-146, 150-335`; `teamTools.test.ts` |
| 27 | Backup export/validate/restore carries the six tables + four attribution fields; v11 stays; absent tables leave local rows untouched | ✓ VERIFIED | `exportBackup.ts:190-223`; `validateBackup.ts` attribution schema; `restoreBackup.ts:47-64, 195-196`; `officeBackup.test.ts` |
| 28 | Coordinator: `@mention` routing, plan park, concurrent terminal settle, incomplete marking, both stops, lead approval exposed/resolvable, no React import, every advertised tool resolves | ✓ VERIFIED | `teamRunCoordinator.ts` (872 lines); `resolveTeamToolName` guard; zero `from 'react'` imports |
| 29 | Attribution row, status badges, `aria-live="polite"`, agent mention pill | ✓ VERIFIED | `AgentAttributionRow.tsx`; `ChatMessageBubble.tsx:1275`; `ChatMessageBubble.tsx:1243`; `ChatMessageListAttribution.test.tsx` |
| 30 | Assignment plan card is not warning-colored, carries a 3px primary left border, and shows a `role="status"` line after a decision | ✓ VERIFIED | `AssignmentPlanCard.tsx:47, 92-97`; snapshot now carries `lastPlan`/`lastPlanDecision` (`teamRunCoordinator.ts:212-213, 678-679, 853-854`); workspace renders `snapshot.pendingPlan ?? snapshot.lastPlan` with the matching decision (`TeamWorkspace.tsx:355-360`). Workspace probe: approve → card remains, status line visible, buttons gone |
| 31 | Employee tab shell defaults to Văn phòng AI, Ghost Dev reachable, second segment filters employees/leads/skills, CRUD persists, shared-edit alert, skill label | ✓ VERIFIED | `AiOfficeView.tsx:174-198`; `EmployeeEditorDrawer.tsx`; `SkillEditorDrawer.tsx` |
| 32 | `'teams'` is in `EditorViewType` and both title maps + tab icon | ✓ VERIFIED | `layoutStore.ts:15`; `EditorArea.tsx:81, 595, 646`; `TitleBar.tsx:315-325` |
| 33 | Teams route renders list and workspace; activate/pause caps; create/settings drawers; sidebar; composer lead-first @; `MutationApprovalCard`; focus order; TitleBar entry | ✓ VERIFIED | `TeamsView.tsx`; `TeamWorkspace.tsx` roster from `liveMembers`; `parseMentionTarget` refuses non-members (`teamRunCoordinator.ts:600-610`) |
| 34 | Each employee sees the results of the other agents in its batch | ✓ VERIFIED | `startEmployeeTurn` forwards `batchResults` (`teamRunCoordinator.ts:471-491`), `runBatch` passes `priorBatchResults` (`:695`), populated from settled reports (`:725-727`); test asserts a later turn's prompt carries the peer report |
| 35 | The bypass and auto-approve toggles take effect on the run | ✓ VERIFIED | `setTeamSettings` (`:756-761`) mutates `liveTeam`; `runBatch` reads `liveTeam.autoSplitEnabled` (`:652`), `startLeadTurn` reads `liveTeam.autoApproveMutations` (`:563`); `TeamWorkspace.tsx:215-220` effect re-pushes both fields; test flips auto-split mid-run |

**Score:** 35/35 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/types/aiOffice.ts` | Entity contracts + capability constants | ✓ VERIFIED | 120 lines, 20 exports |
| `src/validation/aiOfficeSchemas.ts` | Zod input schemas | ✓ VERIFIED | 127 lines, 20 exports |
| `src/db/schema.ts` / `src/db/index.ts` | `SCHEMA_V17` + `version(17)` + six `Table<>` | ✓ VERIFIED | `schema.ts:121`, `index.ts:492` |
| `src/db/repositories/aiOfficeRepo.ts` | Employee/lead/skill CRUD | ✓ VERIFIED | 216 lines, 14 exports |
| `src/db/repositories/aiTeamRepo.ts` | Team/member/link + caps + split | ✓ VERIFIED | 342 lines, 19 exports |
| `src/db/repositories/teamTranscriptRepo.ts` | Team-tagged persistence + BM25 docs | ✓ VERIFIED | 131 lines, 7 exports |
| `src/services/ai/office/budgetGate.ts` | Gate + crossing rule | ✓ VERIFIED | 86 lines, 4 exports |
| `src/services/ai/office/teamRunRegistry.ts` | Per-agent runtime registry | ✓ VERIFIED | 59 lines |
| `src/services/ai/office/teamPrompts.ts` | Lead/employee prompt assembly | ✓ VERIFIED | 193 lines, 3 exports |
| `src/services/ai/office/teamTools.ts` | Six tools + dispatch | ✓ VERIFIED | 335 lines, 4 exports |
| `src/services/ai/office/teamRunCoordinator.ts` | Headless coordinator | ✓ VERIFIED | 872 lines, 11 methods (adds `setTeamBudget`, snapshot `lastPlan`/`lastPlanDecision`) |
| `src/components/ai/office/*.tsx` (15 files) | Attribution, plan card, banner, modal, cards, drawers, workspace, sidebar | ✓ VERIFIED | All present; `TeamWorkspace` 613 lines |
| `src/views/AiOfficeView.tsx` | Employee tab shell | ✓ VERIFIED | 320 lines |
| `src/views/TeamsView.tsx` | Team list + workspace | ✓ VERIFIED | 190 lines |
| `src/components/ai/AiChatWidget.tsx` | agent pass-through props | ✓ VERIFIED | `:119, 285, 570` |
| `src/components/ai/ChatInputBar.tsx` | `agentOptions` lead-first @ | ✓ VERIFIED | `:45, 472-502` |
| Backup five-file contract | Six tables + attribution | ✓ VERIFIED | `types/backup.ts`, `validation/backupSchemas.ts`, `exportBackup.ts`, `validateBackup.ts`, `restoreBackup.ts` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `db/index.ts` | `db/schema.ts` | `this.version(17).stores(SCHEMA_V17)` | ✓ WIRED | `index.ts:492` |
| `aiOfficeRepo.ts` | `aiOfficeSchemas.ts` | `Schema.parse` at create/update | ✓ WIRED | Confirmed |
| `teamTranscriptRepo.ts` | `chatRepo.ts` | `chatMessages.where('threadId')` | ✓ WIRED | `:71` |
| `chatTurnRuntime.ts` | `aiOrchestratorLoop.ts` | `beforeToolRound` with turn signal | ✓ WIRED | `:303-304` → `:232-235` |
| `chatTurnRuntime.ts` | `chatRepo.ts` | attribution into `saveMessage` | ✓ WIRED | `:487-498` |
| `teamRunCoordinator.ts` | `teamRunRegistry.ts` | `registry.get(agentId)` | ✓ WIRED | `:520, 574` |
| `teamRunCoordinator.ts` | `teamTools.ts` | `delegate_batch` interception + team tool dispatch | ✓ WIRED | `:324-332` |
| `teamRunCoordinator.ts` | `chatTurnTools.ts` | `getToolsForTurn` + allowlists | ✓ WIRED | `:299-308` |
| `teamRunCoordinator.ts` | `aiTurnManager.ts` | `team:${teamId}` namespaced turns | ✓ WIRED | `:243-244, 434-444` |
| `teamRunCoordinator.ts` | `teamTranscriptRepo.ts` | `saveTeamMessage` | ✓ WIRED | `:604, 681` |
| `teamTools.ts` | `utils/bm25.ts` | `rankBM25` + `extractRelevantSnippet` | ✓ WIRED | `:4, 158-166` |
| `TeamWorkspace.tsx` | `teamRunCoordinator.ts` | `createTeamRunCoordinator` + subscribe | ✓ WIRED | `:177, 208-212` |
| `TeamWorkspace.tsx` | `teamTranscriptRepo.ts` | `ensureTeamThread` | ✓ WIRED | `:156` |
| `TeamWorkspace.tsx` | `AiChatWidget.tsx` | agent props pass-through | ✓ WIRED | `:482-536` |
| `AiChatWidget.tsx` | `ChatInputBar.tsx` | `agentOptions` | ✓ WIRED | `:570` |
| `EditorArea.tsx` | `TeamsView.tsx` | `case 'teams'` | ✓ WIRED | `:595` |
| `exportBackup.ts` | `db/index.ts` | reads six tables | ✓ WIRED | `:218-223` |
| `restoreBackup.ts` | `validateBackup.ts` | `validateBackupPayload` | ✓ WIRED | `:11` |
| `TeamWorkspace.tsx` | `teamRunCoordinator.ts` | per-agent `topUp` | ✓ WIRED | `:311` (settings drawer), `:590-595` (modal) |
| `TeamWorkspace.tsx` | `teamRunCoordinator.ts` | `setTeamSettings` on toggle change | ✓ WIRED | `:215-220` |
| `TeamWorkspace.tsx` | `teamRunCoordinator.ts` | `pausedAgentId`/`pausedAgentName` → banner + modal scope | ✓ WIRED | `:367-376, 565-597` |
| `TeamWorkspace.tsx` | `teamRunCoordinator.ts` | team-budget edit → live coordinator | ✓ WIRED | `:309` `coordinator?.setTeamBudget(input.budgetTokens)` runs before the member top-up loop; probe confirms 10000 + 2000 persists as 12000 |
| `TeamWorkspace.tsx` | `teamRunCoordinator.ts` | decided plan → card status line | ✓ WIRED | `:355-360` reads `lastPlan`/`lastPlanDecision`; workspace probe sees the status line after approve |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `TeamWorkspace.tsx` transcript | `messages` | `getMessagesByThreadId(threadId, db)` | Yes — real `chatMessages` rows | ✓ FLOWING |
| `TeamWorkspace.tsx` live bubbles | `snapshot.agents[].streamingText` | coordinator `onDelta` | Yes — real stream deltas | ✓ FLOWING |
| `TeamSidebar.tsx` budget | `members[].usedTokens` / `team.budgetTokens` | `aiTeamMembers` + `aiTeams` | Yes | ✓ FLOWING |
| `AiOfficeView.tsx` lists | `employees`/`leads`/`skills` | `useLiveQuery` over repos | Yes | ✓ FLOWING |
| `TeamsView.tsx` cards | `teams`, `allMembers` | `listTeams` + `aiTeamMembers` | Yes | ✓ FLOWING |
| `TeamWorkspace.tsx` agent directory | `roster` | `liveMembers` ∩ `employees` | Yes — team-scoped | ✓ FLOWING |
| `TeamWorkspace.tsx` paused banner | `snapshot.pausedAgentId`/`pausedAgentName` | coordinator `getState()` | Yes — real gate state | ✓ FLOWING |
| `TeamWorkspace.tsx` plan card | `snapshot.pendingPlan ?? snapshot.lastPlan` | coordinator | Yes — decided plan retained with its verdict | ✓ FLOWING |
| `TeamWorkspace.tsx` team budget | `teamBudget` inside coordinator | construction value, then `setTeamBudget` on every settings save | Yes — adopts the saved total | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase 34 unit/UI suites | `npx vitest run tests/services/ai/office tests/db/schemaV17Migration.test.ts tests/services/backup/officeBackup.test.ts tests/views/AiOfficeView.test.tsx tests/views/TeamsView.test.tsx tests/ai/ChatMessageListAttribution.test.tsx tests/ai/office/AgentOfficeComponents.test.tsx tests/ai/ChatInputBarAgentMentions.test.tsx` | 15 files, 177 tests passed (2 pre-existing `DatabaseClosedError` rejections, assertions green) | ✓ PASS |
| Coordinator suite (incl. both new regression tests) | `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts` | 1 file, 31 tests passed | ✓ PASS |
| Regression: `accumulates a team top-up onto an edited total` | `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts -t "accumulates a team top-up"` | 1 passed, 30 skipped | ✓ PASS |
| Regression: `keeps the decided plan in the snapshot` | `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts -t "keeps the decided plan"` | 1 passed, 30 skipped | ✓ PASS |
| Runtime seam suites | `npx vitest run tests/ai/chatTurnRuntime.test.ts tests/ai/chatRepo.test.ts tests/services/ai/aiOrchestratorLoop.test.ts tests/ai/chatTurnTools.test.ts tests/db.test.ts tests/db/repositories/__tests__/chatTabRepo.test.ts tests/ai/ActiveAiTurnIndicator.test.tsx` | 6 files, 114 tests passed | ✓ PASS |
| Typecheck | `npx tsc --noEmit` | Clean, no output | ✓ PASS |
| Team budget edit then top-up (independent probe) | temp node-env probe: team 3000 → `setTeamBudget(10000)` → `topUp({kind:'team'}, 2000)` | persisted total **12000** | ✓ PASS |
| Team-gate park released by a settings raise (independent probe) | temp probe: team-only gate park → `setTeamBudget(50000)` → team top-up | agent settles `done`; run completes | ✓ PASS |
| Plan card status line after approve (independent workspace probe) | temp jsdom probe: render `TeamsView`, send, click `assignment-plan-approve` | card remains, `Đã chấp thuận — lô việc đang chạy.` visible, approve/reject buttons gone | ✓ PASS |

Probe files were temporary and removed after the run.

### Probe Execution

Step 7b: SKIPPED for CLI/API probes (browser/Tauri UI feature). Step 7c: no probe scripts declared in PLAN/SUMMARY and no `scripts/*/tests/probe-*.sh` exist.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| AIO-EMP-01 | 34-01, 34-02, 34-04, 34-09 | Global reusable employees/leads, one skill, shared edits | ✓ SATISFIED | `aiOfficeRepo.ts`, `aiEmployees` store, shared-edit alert |
| AIO-EMP-02 | 34-01, 34-02, 34-10 | One lead + max 3 employees; max 3 active teams; reactivation resumes transcript | ✓ SATISFIED | `aiTeamRepo.ts:49, 94-95, 116`; `ensureTeamThread` |
| AIO-SKILL-01 | 34-01, 34-02, 34-09 | Global name+description+body, assignable to one agent | ✓ SATISFIED | `aiSkills` store; scalar `skillId`; `SkillEditorDrawer` |
| AIO-SKILL-02 | 34-04, 34-05 | Prompt gets description only; body via `read_skill` | ✓ SATISFIED | `teamPrompts.ts:88-93`; `teamTools.ts:readSkill` |
| AIO-TEAM-01 | 34-07, 34-08, 34-10 | Lead emits plan card; batch only after approval unless bypass toggle | ✓ SATISFIED | Plan park + `liveTeam.autoSplitEnabled` read at run time; toggle verified live |
| AIO-TEAM-02 | 34-05, 34-07 | Single `delegate_batch`, cap 3, concurrent, results after whole batch | ✓ SATISFIED | `teamTools.ts:delegateBatch`; `teamRunCoordinator.ts:652-731` |
| AIO-TEAM-03 | 34-04, 34-07 | Own prompt + skill description + instruction + original request + peers' batch results + own history + recent window | ✓ SATISFIED | `teamPrompts.ts:74-131`; `priorBatchResults` wired (`teamRunCoordinator.ts:695, 725-727`) |
| AIO-TEAM-04 | 34-07, 34-10 | `@agent` addresses any agent; no mention → lead | ✓ SATISFIED | Team-scoped roster + `parseMentionTarget` member guard |
| AIO-MEM-01 | 34-01, 34-02, 34-07, 34-08 | One transcript per team, attributed, one channel | ✓ SATISFIED | `teamTranscriptRepo.ts`; `ChatMessageList` attribution |
| AIO-MEM-02 | 34-05 | `search_team_history` compact BM25 + `read_team_turn` full | ✓ SATISFIED | `teamTools.ts:52-84, 150-186` |
| AIO-MEM-03 | 34-05 | Offline, no daemon dependency | ✓ SATISFIED | IndexedDB + `utils/bm25.ts` only |
| AIO-WRITE-01 | 34-03, 34-07 | Employees structurally read-only; lead holds read set + team tools | ✓ SATISFIED | `EMPLOYEE_READ_ONLY_ALLOWLIST`; read-only branch |
| AIO-WRITE-02 | 34-03, 34-07 | Lead mutations park on `MutationApprovalCard`; auto-approve toggle wins | ✓ SATISFIED | Parking works; toggle read from `liveTeam` at run time |
| AIO-BUDGET-01 | 34-02, 34-10 | Team budget, even split editable per row, accumulates, top-up anytime | ✓ SATISFIED | Even split + drawer; `setTeamBudget` adopts a saved total (`teamRunCoordinator.ts:767-774`, `TeamWorkspace.tsx:309`); team top-up accumulates onto it (test + probe: 10000 + 2000 = 12000) |
| AIO-BUDGET-02 | 34-03, 34-04, 34-07, 34-08 | 80% team or agent scope pauses, notifies, resumes where it stopped, no hang | ✓ SATISFIED | Agent scope verified; team scope now uses the saved total and a settings raise releases the park (probe: parked → raise → `done`) |
| AIO-LINK-01 | 34-05, 34-10 | N links of CR/task/system/note/document; full content retrieval | ✓ SATISFIED | `teamTools.ts:list_linked_items/get_linked_context`; `LinkedItemPicker` |
| AIO-BG-01 | 34-07, 34-08, 34-10 | Runs continue across view switch; per-agent + global Stop | ✓ SATISFIED | Module registry; `stopAgent`/`abortAll`; live bubbles |
| AIO-UI-01 | 34-09, 34-10 | Employee tab + `'teams'` page with shared transcript | ✓ SATISFIED | `AiOfficeView.tsx`; `TeamsView.tsx`; workbench maps |
| AIO-BACKUP-01 | 34-01, 34-06 | Six tables + attribution round-trip; v11 envelope; old backup restores | ✓ SATISFIED | `exportBackup.ts`, `validateBackup.ts`, `restoreBackup.ts`; `officeBackup.test.ts` |

No orphaned requirements — all 19 IDs appear in at least one plan's `requirements` field.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/services/ai/office/teamRunCoordinator.ts` | 767-774 | `setTeamBudget` opens the team gate but never moves `phase` off `awaiting-budget` | ⚠️ Warning | Raising the total in the settings drawer while the team gate is parked resumes the run but leaves the paused banner mounted until the next top-up or message. Cosmetic; the run is not hung and the next send/top-up self-heals |
| `src/components/ai/office/TeamWorkspace.tsx` | 224-226 | `planDecision` local state is cleared in an effect keyed on `snapshot.pendingPlan` | ℹ️ Info | A newly arrived plan can render one frame with the previous decision line before the effect resets it; buttons appear on the next render |
| `src/components/ai/office/TeamWorkspace.tsx` | 503-521 | Empty toolbox handlers (`onModelChange`, `onToggleAnalysisMode`, `onToggleMcpEnabled`, `onClearThread`) | ℹ️ Info | Deliberate — team runs fix model/analysis mode |
| `src/services/ai/office/teamTools.ts` | 155 | `ponytail:` cap comment on BM25 candidate set | ℹ️ Info | Documented deliberate simplification, not debt |
| `tests/views/TeamsView.test.tsx` | — | 2 unhandled `DatabaseClosedError` rejections after tests complete | ℹ️ Info | Pre-existing test hygiene (baseline had 3); all assertions pass |

No `TBD`/`FIXME`/`XXX` markers in any phase-modified file.

### Human Verification Required

1. **Keyboard and screen-reader walk-through**
   **Test:** Walk the workspace with keyboard only: sidebar → header actions → transcript (one stop) → composer; then start a batch and Arrow through per-agent Stop buttons.
   **Expected:** Focus order matches UI-SPEC §5b; the transcript is a single stop; Arrow keys rove across agent Stop buttons.
   **Why human:** Focus order and announcements cannot be verified reliably by grep or jsdom.

2. **Live per-agent pause and resume**
   **Test:** Run a real batch with a small agent budget, let one agent pause at 80%, then top up from the banner.
   **Expected:** The banner names the agent, the modal shows `Nhân viên: <name>`, the agent resumes exactly where it stopped, and peers keep running.
   **Why human:** Wiring and unit tests pass, but the real streaming/resume feel and the absence of a perceived hang need a live model.

### Gaps Summary

No gaps. Both blockers from the previous round are closed with real code, not narrative:

1. **Team budget edit is now adopted.** `setTeamBudget(total)` (`teamRunCoordinator.ts:767-774`) mutates `teamBudget`, `liveTeam.budgetTokens`, and `lastTeamBucket`, and reopens the gate when the raise drops usage below 80%. `TeamWorkspace.handleSaveSettings` calls it before the member top-up loop (`:309`), and `topUp({kind:'team'})` writes `teamBudget + amount` (`:815`). Regression test plus an independent probe confirm 10000 → top-up 2000 → persisted 12000, and a settings raise releases a team-gate park.
2. **The decided plan stays observable.** The snapshot now carries `lastPlan`/`lastPlanDecision` (`:212-213, 678-679, 853-854`), and the workspace renders `snapshot.pendingPlan ?? snapshot.lastPlan` with the matching decision (`TeamWorkspace.tsx:355-360`). Regression test plus an independent workspace probe confirm the card remains after approve with its `role="status"` line and no buttons.
3. The sidebar top-up warning is fixed: `onTopUp` resets `topUpScope` to `{kind:'team'}` (`:418`).

Scoped suites: 177 + 31 + 114 tests passing, `tsc --noEmit` clean. One warning-level nit remains (stale paused banner after a settings-only raise) and does not block the goal; two human-verification items remain (keyboard focus order, live pause/resume feel).

---

_Verified: 2026-11-08T18:00:33Z_
_Verifier: Claude (gsd-verifier)_

## Post-Verification Code Review Round

A standard-depth code review of the 51 phase source files (`34-REVIEW.md`) found
7 critical and 11 warning findings. All 18 were fixed in `5f14ace6` and `e4bc0605`:

| ID | Finding | Fix |
|----|---------|-----|
| CR-01 | Per-agent usage baseline never reset, so a second turn counted as free | baseline cleared at every turn start; two-turn regression test |
| CR-02 | Settings-drawer budget decrease routed through `topUp`, could go negative | decrease uses `setMemberBudget`; `topUpMemberBudget` clamps at 0 |
| CR-03 | Global Stop left the plan park unresolved, hanging the lead turn | `abortAll`/lead `stopAgent` release the park; regression test |
| CR-04 | Lead payload had no mutation tools, making the approval card unreachable | lead payload advertises mutation tools; employees stay read-only |
| CR-05 | `teamUsed` never hydrated, so a reactivated team got a fresh budget | hydrates from persisted usage and starts parked past 80% |
| CR-06 | Instructions attributed to the lead, so assignment history was always empty | `targetAgentId` carries the assignee; regression test |
| CR-07 | Retrieval tools returned raw bodies, bypassing the untrusted-data boundary | every retrieval handler wraps its own body |
| WR-01..11 | deferred release, mention-path park, stale team total, phase flips, `peek` vs `get`, effect churn, empty-state copy, drawer reseed, double split, pause rule, duplicate streaming bubble | all fixed, tests updated |

Post-fix gate: `tsc --noEmit` clean; 218 tests green across `tests/services/ai/office`
and `tests/views`.

The two human-verification items above still stand — they need a live model and a
real keyboard/screen-reader walk-through.
