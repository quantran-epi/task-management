---
phase: 34-ai-office-fixed-ai-employees-with-persona-role-per-model-mul
verified: 2026-11-08T17:41:17Z
status: gaps_found
score: 33/35 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 30/35
  gaps_closed:
    - "Per-agent budget pause is recoverable from the UI (topUp({kind:'agent'}), agent-named banner, agent-scoped modal, settings-drawer gate open, snapshot pausedAgentId/pausedAgentName)"
    - "The bypass and auto-approve toggles reach the live run without a reload (setTeamSettings + liveTeam read at run time + workspace effect)"
    - "Employees receive prior-batch settled reports through the explicit batchResults mechanism"
    - "The team composer offers only the team's own agents as @ options, and the coordinator refuses a non-member mention"
  gaps_remaining:
    - "Editing the team budget in settings is silently reverted by the next team top-up, and the pause threshold keeps using the stale total"
    - "The assignment plan card still unmounts the moment a decision is made, so its role=status line is never observable"
  regressions: []
gaps:
  - truth: "At 80% of the team budget or of one agent's budget, that scope pauses between tool rounds, preserves context, and resumes exactly where it stopped once tokens are granted — nothing is auto-aborted and no pause reads as a hang"
    status: partial
    reason: "Per-agent recoverability is now fixed and verified (agent-named banner, agent-scoped top-up, snapshot pausedAgentId/pausedAgentName, settings-drawer gate open). A separate defect remains in the team scope: the coordinator captures `teamBudget` at construction and never re-reads it, so a budget edited in the settings drawer is ignored by the pause threshold and is then overwritten by the next team top-up. Probe: create a team at 3000, save 10000 in settings, top up 2000 → persisted total is 5000, not 12000."
    artifacts:
      - path: "src/services/ai/office/teamRunCoordinator.ts"
        issue: "Line 223 `let teamBudget = team.budgetTokens` is never refreshed; line 786 writes `budgetTokens: teamBudget + amount` from that stale value"
      - path: "src/components/ai/office/TeamWorkspace.tsx"
        issue: "handleSaveSettings (line 296) writes the new total with updateTeam but does not inform the live coordinator; the construction effect deps (line 206) exclude budgetTokens and the module registry returns the existing coordinator anyway"
    missing:
      - "A coordinator path that adopts a team-total edit (setter or a live re-read) so the pause threshold uses the saved total"
      - "A team top-up that accumulates onto the persisted total instead of the construction-time snapshot"
      - "A regression test covering edit-then-top-up"

  - truth: "The assignment plan card is not warning-colored, carries a 3px primary left border, and shows a role=\"status\" line after a decision"
    status: partial
    reason: "The decision state is now tracked and passed to the card, but the card is conditionally rendered on `snapshot.pendingPlan`, which the coordinator nulls synchronously inside resolvePlan. Probe: after clicking approve, one microtask flush leaves neither the card nor the status line in the DOM. UI-SPEC §7 requires the card to stay in the transcript with its buttons replaced by the status line. The line is therefore never user-observable."
    artifacts:
      - path: "src/components/ai/office/TeamWorkspace.tsx"
        issue: "Line 350 renders AssignmentPlanCard only while snapshot.pendingPlan is non-null; line 105/353 now pass planDecision but the host unmounts the card first"
      - path: "src/services/ai/office/teamRunCoordinator.ts"
        issue: "Line 663 sets pendingPlan = null immediately after the plan promise resolves; no 'plan' message row is persisted (no messageKind:'plan' writer anywhere in src/)"
    missing:
      - "Keep the decided plan (e.g. a lastPlan state) rendered with its decision until the next plan arrives, or persist a plan message row the transcript can render"
      - "A workspace-level test asserting the status line is visible after a decision"
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
**Verified:** 2026-11-08T17:41:17Z
**Status:** gaps_found
**Re-verification:** Yes — after gap-closure commit `b4ee5b03`

## Re-verification Summary

| Previous gap | Claimed fix | Verdict |
|---|---|---|
| 1. Per-agent budget pause unrecoverable (BLOCKER) | `topUp({kind:'agent'})`, `agentName` on the banner, agent-scoped modal, settings-drawer gate open, snapshot `pausedAgentId`/`pausedAgentName` | ✓ CLOSED — all five call sites present; dual-gate probe confirms agent top-up alone leaves the turn parked and a team top-up then releases it |
| 2. Toggles stale in-session | `setTeamSettings`, `liveTeam` read at run time, workspace effect | ✓ CLOSED — `liveTeam` read at `runBatch` and `startLeadTurn`; effect deps include both toggle fields |
| 3. `batchResults` dead code | `startEmployeeTurn` forwards it, `runBatch` passes `priorBatchResults`, populated from settled reports | ✓ CLOSED — wired and covered by a new test (prior-batch semantics per D-03) |
| 4. Plan card decision state never rendered | `planDecision` state passed to the card, reset on a new plan | ✗ NOT CLOSED — state is threaded, but the card unmounts the instant the plan resolves, so the status line is never observable |
| 5. Mention options include non-team employees | roster from `liveMembers`; coordinator refuses non-members | ✓ CLOSED — roster filtered, `parseMentionTarget` guards `memberIds`, new test covers the outsider case |

One new defect was found while re-checking the budget path: the team total is captured at coordinator construction and never refreshed, so a settings edit is both ignored by the pause threshold and overwritten by the next top-up.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Employees and leads are separate global entities; editing an employee persona changes it in every team | ✓ VERIFIED | `aiOfficeRepo.ts` CRUD on `aiEmployees`/`aiLeads`; teams store only `leadId` + `aiTeamMembers.agentId`; `countTeamsUsingEmployee` drives the shared-edit alert |
| 2 | Activating a team dispatches the lead, which emits an assignment plan card; approval runs a concurrent batch (cap 3) and the lead synthesizes only after | ✓ VERIFIED | `teamRunCoordinator.ts:621-731` (plan park, `Promise.allSettled` + deferred settle); `MAX_BATCH_SIZE=3`; `TeamWorkspace.tsx:350` renders `AssignmentPlanCard` |
| 3 | Every transcript message is attributed and renders in one channel; `@agent` addresses an employee; a running agent streams into its own bubble with a status badge | ✓ VERIFIED | `chatRepo.ts:173-176`; `ChatMessageList.tsx`; `TeamWorkspace.tsx:325-345` live bubbles; `AgentAttributionRow.tsx` |
| 4 | Employee turns are structurally read-only; every lead mutation parks on the existing `MutationApprovalCard` unless auto-approve is on | ✓ VERIFIED | `chatTurnRuntime.ts:374-378` read-only branch precedes artifact/auto-approve; `teamRunCoordinator.ts:553` reads `liveTeam.autoApproveMutations`; `AiChatWidget.tsx:356` renders `MutationApprovalCard` |
| 5 | With the Knowledge Server stopped and network offline, an agent can recall older work via `search_team_history` and `read_team_turn` | ✓ VERIFIED | `teamTools.ts` imports only `utils/bm25.ts` + IndexedDB repos; no network call in either handler |
| 6 | At 80% of the team budget **or of one agent's budget**, that scope pauses between tool rounds, preserves context, and resumes exactly where it stopped — nothing auto-aborted, no pause reads as a hang | ✗ FAILED | Per-agent scope now fully recoverable (verified). Team scope still uses a construction-time total: `teamRunCoordinator.ts:223` never refreshes `teamBudget`, and `:786` writes `teamBudget + amount`, so a settings edit is ignored and then overwritten (probe: 3000 → save 10000 → top up 2000 → 5000). See gap 1 |
| 7 | A stopped agent reports back marked incomplete, and a global Stop aborts the lead plus every running agent | ✓ VERIFIED | `teamRunCoordinator.ts:271, 718` (`incomplete: true`), `:754-764` (`stopAgent` / `abortAll`) |
| 8 | Team runs continue when the user leaves the tab; returning shows the full result | ✓ VERIFIED | Module-level `coordinatorRegistry` (`TeamWorkspace.tsx:58`), no React import in the coordinator, transcript persisted in `chatMessages` |
| 9 | Dexie opens at version 17 with six new stores and every V16 row readable | ✓ VERIFIED | `db/schema.ts:121` `SCHEMA_V17`; `db/index.ts:492` `this.version(17)`; `tests/db/schemaV17Migration.test.ts` passes |
| 10 | A chat message carries `agentId`/`agentName`/`agentKind`/`messageKind` without changing existing rows | ✓ VERIFIED | `types/models.ts:321`; `chatRepo.ts`; `chatTurnRuntime.ts:497-498`; backup schema `backupSchemas.ts:330-333` |
| 11 | `'team'` is a first-class scope and `team:<id>` rehydrates as `team`, never `global` | ✓ VERIFIED | `models.ts`; `chatTabRepo.ts`; `schemaV17Migration.test.ts` |
| 12 | Employees/leads/skills are global; teams reference by id | ✓ VERIFIED | `aiTeamRepo.ts` stores `leadId` + `agentId`; no embedded copies |
| 13 | A fourth team cannot activate while three are active; a team cannot hold more than three employees | ✓ VERIFIED | `aiTeamRepo.ts:43-50` activation guard; `:236-244` employee cap |
| 14 | Reactivating an idle team reuses the same chat thread | ✓ VERIFIED | `teamTranscriptRepo.ts:31-36` `ensureTeamThread` → `createOrGetThread` on `team:<id>` |
| 15 | An even split sums exactly to the total, remainder on the lead row | ✓ VERIFIED | `aiTeamRepo.ts` `splitBudget`/`writeEvenSplit`; `TeamSettingsDrawer.tsx`; test asserts 1668 lead row of 5000 |
| 16 | A team transcript read can never return another team's row | ✓ VERIFIED | `teamTranscriptRepo.ts:108-116` `getTeamTurn` checks `row.threadId !== threadId` |
| 17 | `persistUserMessage: false` writes no `role:'user'` row | ✓ VERIFIED | `chatTurnRuntime.ts:258` guard |
| 18 | `mutationPolicy:'read-only'` refuses every mutation before the artifact and auto-approve branches | ✓ VERIFIED | `chatTurnRuntime.ts:374-378`; test in `chatTurnRuntime.test.ts` |
| 19 | `beforeToolRound` is forwarded with the turn's own signal and awaited each round after the first | ✓ VERIFIED | `chatTurnRuntime.ts:303-304`; `aiOrchestratorLoop.ts:232-235` (`loopCount > 1` + `throwIfAborted`) |
| 20 | The employee payload contains no mutation tool and no `delegate_batch` | ✓ VERIFIED | `teamRunCoordinator.ts:135-137, 306-308`; `teamRunCoordinator.test.ts:292-307` |
| 21 | The 80% crossing is a pure function of used/budget; a top-up makes the next crossing notify again | ✓ VERIFIED | `budgetGate.ts:68-81`; `budgetGate.test.ts` |
| 22 | Each agent gets its own runtime instance, so three concurrent starts never throw `TURN_IN_PROGRESS` | ✓ VERIFIED | `teamRunRegistry.ts`; `chatTurnRuntime.ts` guard; coordinator test |
| 23 | An employee's system prompt contains the skill description and never the skill body | ✓ VERIFIED | `teamPrompts.ts:88-97`; `teamPrompts.test.ts` |
| 24 | An employee's history contains its own instruction/report pairs capped, plus the recent window, never the whole transcript | ✓ VERIFIED | `teamPrompts.ts:114-131`; `teamTranscriptRepo.ts:78-106` |
| 25 | Retrieved content is wrapped in a delimited untrusted-data segment | ✓ VERIFIED | `teamPrompts.ts:47-54, 99-108` |
| 26 | Six team tools: compact BM25 hits, team-scoped full turn read, skill body, compact links, full linked content, structured `delegate_batch` refusals | ✓ VERIFIED | `teamTools.ts:48-146, 150-335`; `teamTools.test.ts` |
| 27 | Backup export/validate/restore carries the six tables + four attribution fields; v11 stays; absent tables leave local rows untouched | ✓ VERIFIED | `exportBackup.ts:190-223`; `validateBackup.ts` attribution schema; `restoreBackup.ts:47-63`; `officeBackup.test.ts` |
| 28 | Coordinator: `@mention` routing, plan park, concurrent terminal settle, incomplete marking, both stops, lead approval exposed/resolvable, no React import, every advertised tool resolves | ✓ VERIFIED | `teamRunCoordinator.ts` (839 lines); `resolveTeamToolName` guard; no React import |
| 29 | Attribution row, status badges, `aria-live="polite"`, agent mention pill | ✓ VERIFIED | `AgentAttributionRow.tsx`; `ChatMessageBubble.tsx:1275`; `ChatMessageBubble.tsx:137`; `ChatMessageListAttribution.test.tsx` |
| 30 | Assignment plan card is not warning-colored, carries a 3px primary left border, and shows a `role="status"` line after a decision | ✗ FAILED | Component does all three, and `planDecision` is now passed (`TeamWorkspace.tsx:105, 353`), but the card is gated on `snapshot.pendingPlan`, which the coordinator nulls immediately (`teamRunCoordinator.ts:663`); probe shows neither card nor status line after one microtask flush. See gap 2 |
| 31 | Employee tab shell defaults to Văn phòng AI, Ghost Dev reachable, second segment filters employees/leads/skills, CRUD persists, shared-edit alert, skill label | ✓ VERIFIED | `AiOfficeView.tsx:174-198`; `EmployeeEditorDrawer.tsx:109`; `SkillEditorDrawer.tsx` |
| 32 | `'teams'` is in `EditorViewType` and both title maps + tab icon | ✓ VERIFIED | `layoutStore.ts:15`; `EditorArea.tsx:81, 595-596`; `TitleBar.tsx:315` |
| 33 | Teams route renders list and workspace; activate/pause caps; create/settings drawers; sidebar; composer lead-first @; `MutationApprovalCard`; focus order; TitleBar entry | ✓ VERIFIED | `TeamsView.tsx`; `TeamWorkspace.tsx:249-258` mention options from the team roster; `parseMentionTarget` refuses non-members (`teamRunCoordinator.ts:587-597`) |
| 34 | Each employee sees the results of the other agents in its batch | ✓ VERIFIED | `startEmployeeTurn` forwards `batchResults` (`teamRunCoordinator.ts:471-491`), `runBatch` passes `priorBatchResults` (`:695`), populated from settled reports (`:725-727`); new test asserts a later turn's prompt carries the earlier batch's peer report. Same-batch isolation preserved per D-03 |
| 35 | The bypass and auto-approve toggles take effect on the run | ✓ VERIFIED | `setTeamSettings` (`teamRunCoordinator.ts:740-745`) mutates `liveTeam`; `runBatch` reads `liveTeam.autoSplitEnabled` (`:642`), `startLeadTurn` reads `liveTeam.autoApproveMutations` (`:553`); `TeamWorkspace.tsx:215-220` effect re-pushes both fields; new test flips auto-split mid-run |

**Score:** 33/35 truths verified

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
| `src/services/ai/office/teamRunCoordinator.ts` | Headless coordinator | ✓ VERIFIED | 839 lines, 10 methods (adds `setTeamSettings`, snapshot pause fields) |
| `src/components/ai/office/*.tsx` (15 files) | Attribution, plan card, banner, modal, cards, drawers, workspace, sidebar | ✓ VERIFIED | All present; `TeamWorkspace` 602 lines |
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
| `teamRunCoordinator.ts` | `aiTurnManager.ts` | `team:${teamId}` namespaced turns | ✓ WIRED | `:243-244, 424-444` |
| `teamRunCoordinator.ts` | `teamTranscriptRepo.ts` | `saveTeamMessage` | ✓ WIRED | `:604, 681` |
| `teamTools.ts` | `utils/bm25.ts` | `rankBM25` + `extractRelevantSnippet` | ✓ WIRED | `:5, 158-166` |
| `TeamWorkspace.tsx` | `teamRunCoordinator.ts` | `createTeamRunCoordinator` + subscribe | ✓ WIRED | `:177, 208-212` |
| `TeamWorkspace.tsx` | `teamTranscriptRepo.ts` | `ensureTeamThread` | ✓ WIRED | `:156` |
| `TeamWorkspace.tsx` | `AiChatWidget.tsx` | agent props pass-through | ✓ WIRED | `:482-536` |
| `AiChatWidget.tsx` | `ChatInputBar.tsx` | `agentOptions` | ✓ WIRED | `:570` |
| `EditorArea.tsx` | `TeamsView.tsx` | `case 'teams'` | ✓ WIRED | `:595-596` |
| `exportBackup.ts` | `db/index.ts` | reads six tables | ✓ WIRED | `:218-223` |
| `restoreBackup.ts` | `validateBackup.ts` | `validateBackupPayload` | ✓ WIRED | `:11` |
| `TeamWorkspace.tsx` | `teamRunCoordinator.ts` | per-agent `topUp` | ✓ WIRED | `:311` (settings drawer), `:590-595` (modal) — previously NOT_WIRED |
| `TeamWorkspace.tsx` | `teamRunCoordinator.ts` | `setTeamSettings` on toggle change | ✓ WIRED | `:215-220` |
| `TeamWorkspace.tsx` | `teamRunCoordinator.ts` | `pausedAgentId`/`pausedAgentName` → banner + modal scope | ✓ WIRED | `:367-376, 565-597` |
| `TeamWorkspace.tsx` | `teamRunCoordinator.ts` | team-budget edit → live coordinator | ✗ NOT_WIRED | Settings save writes `updateTeam` only; coordinator keeps its construction-time `teamBudget` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `TeamWorkspace.tsx` transcript | `messages` | `getMessagesByThreadId(threadId, db)` | Yes — real `chatMessages` rows | ✓ FLOWING |
| `TeamWorkspace.tsx` live bubbles | `snapshot.agents[].streamingText` | coordinator `onDelta` | Yes — real stream deltas | ✓ FLOWING |
| `TeamSidebar.tsx` budget | `members[].usedTokens` / `team.budgetTokens` | `aiTeamMembers` + `aiTeams` | Yes | ✓ FLOWING |
| `AiOfficeView.tsx` lists | `employees`/`leads`/`skills` | `useLiveQuery` over repos | Yes | ✓ FLOWING |
| `TeamsView.tsx` cards | `teams`, `allMembers` | `listTeams` + `aiTeamMembers` | Yes | ✓ FLOWING |
| `TeamWorkspace.tsx` agent directory | `roster` | `liveMembers` ∩ `employees` | Yes — team-scoped (was over-broad) | ✓ FLOWING |
| `TeamWorkspace.tsx` paused banner | `snapshot.pausedAgentId`/`pausedAgentName` | coordinator `getState()` | Yes — real gate state | ✓ FLOWING |
| `TeamWorkspace.tsx` plan card | `snapshot.pendingPlan` | coordinator | Real, but nulled on decision → card unmounts | ⚠️ HOLLOW after decision |
| `TeamWorkspace.tsx` team budget | `teamBudget` inside coordinator | construction-time `team.budgetTokens` | No — stale after a settings edit | ✗ DISCONNECTED |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase 34 unit/UI suites | `npx vitest run tests/services/ai/office tests/db/schemaV17Migration.test.ts tests/services/backup/officeBackup.test.ts tests/views/AiOfficeView.test.tsx tests/views/TeamsView.test.tsx tests/ai/ChatMessageListAttribution.test.tsx tests/ai/office/AgentOfficeComponents.test.tsx tests/ai/ChatInputBarAgentMentions.test.tsx` | 15 files, 175 tests passed (3 pre-existing `DatabaseClosedError` rejections, assertions green) | ✓ PASS |
| Coordinator suite (incl. 4 new gap-closure tests) | `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts` | 1 file, 29 tests passed | ✓ PASS |
| Runtime seam suites | `npx vitest run tests/ai/chatTurnRuntime.test.ts tests/ai/chatRepo.test.ts tests/services/ai/aiOrchestratorLoop.test.ts tests/ai/chatTurnTools.test.ts tests/db.test.ts tests/db/repositories/__tests__/chatTabRepo.test.ts tests/ai/ActiveAiTurnIndicator.test.tsx` | 6 files, 114 tests passed | ✓ PASS |
| Typecheck | `npx tsc --noEmit` | Clean, no output | ✓ PASS |
| Per-agent pause names the agent and clears after top-up | temp node-env probe against a real `TaskPlannerDatabase` | `pausedAgentId` = employee id, `pausedAgentName` = 'An'; after `topUp({kind:'agent'})` both null | ✓ PASS |
| Dual-gate pause (agent + team both closed) | temp probe: agent top-up alone | agent stays `paused`, phase stays `awaiting-budget`; team top-up then releases to `done` | ✓ PASS |
| Team budget edit then top-up | temp probe: team 3000 → save 10000 → `topUp({kind:'team'}, 2000)` | persisted total **5000** (expected 12000) | ✗ FAIL |
| Plan card status line after approve | temp probe: click approve, flush one microtask | card gone, status line absent | ✗ FAIL |

Probe files were temporary and removed after the run; the two failing probes are the evidence for gaps 1 and 2.

### Probe Execution

Step 7b: SKIPPED for CLI/API probes (browser/Tauri UI feature). Step 7c: no probe scripts declared in PLAN/SUMMARY and no `scripts/*/tests/probe-*.sh` exist.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| AIO-EMP-01 | 34-01, 34-02, 34-04, 34-09 | Global reusable employees/leads, one skill, shared edits | ✓ SATISFIED | `aiOfficeRepo.ts`, `aiEmployees` store, shared-edit alert |
| AIO-EMP-02 | 34-01, 34-02, 34-10 | One lead + max 3 employees; max 3 active teams; reactivation resumes transcript | ✓ SATISFIED | `aiTeamRepo.ts:43-50, 236-244`; `ensureTeamThread` |
| AIO-SKILL-01 | 34-01, 34-02, 34-09 | Global name+description+body, assignable to one agent | ✓ SATISFIED | `aiSkills` store; scalar `skillId`; `SkillEditorDrawer` |
| AIO-SKILL-02 | 34-04, 34-05 | Prompt gets description only; body via `read_skill` | ✓ SATISFIED | `teamPrompts.ts:88-97`; `teamTools.ts:readSkill` |
| AIO-TEAM-01 | 34-07, 34-08, 34-10 | Lead emits plan card; batch only after approval unless bypass toggle | ✓ SATISFIED | Plan park + `liveTeam.autoSplitEnabled` read at run time; toggle verified live |
| AIO-TEAM-02 | 34-05, 34-07 | Single `delegate_batch`, cap 3, concurrent, results after whole batch | ✓ SATISFIED | `teamTools.ts:delegateBatch`; `teamRunCoordinator.ts:621-731` |
| AIO-TEAM-03 | 34-04, 34-07 | Own prompt + skill description + instruction + original request + peers' batch results + own history + recent window | ✓ SATISFIED | `teamPrompts.ts:74-131`; `priorBatchResults` wired (`teamRunCoordinator.ts:695, 725-727`) |
| AIO-TEAM-04 | 34-07, 34-10 | `@agent` addresses any agent; no mention → lead | ✓ SATISFIED | Team-scoped roster + `parseMentionTarget` member guard |
| AIO-MEM-01 | 34-01, 34-02, 34-07, 34-08 | One transcript per team, attributed, one channel | ✓ SATISFIED | `teamTranscriptRepo.ts`; `ChatMessageList` attribution |
| AIO-MEM-02 | 34-05 | `search_team_history` compact BM25 + `read_team_turn` full | ✓ SATISFIED | `teamTools.ts:150-186` |
| AIO-MEM-03 | 34-05 | Offline, no daemon dependency | ✓ SATISFIED | IndexedDB + `utils/bm25.ts` only |
| AIO-WRITE-01 | 34-03, 34-07 | Employees structurally read-only; lead holds read set + team tools | ✓ SATISFIED | `EMPLOYEE_READ_ONLY_ALLOWLIST`; read-only branch |
| AIO-WRITE-02 | 34-03, 34-07 | Lead mutations park on `MutationApprovalCard`; auto-approve toggle wins | ✓ SATISFIED | Parking works; toggle now read from `liveTeam` at run time |
| AIO-BUDGET-01 | 34-02, 34-10 | Team budget, even split editable per row, accumulates, top-up anytime | ✗ BLOCKED | Even split and drawer work, but a saved total is ignored by the pause threshold and overwritten by the next top-up (probe: 10000 → 5000) |
| AIO-BUDGET-02 | 34-03, 34-04, 34-07, 34-08 | 80% team or agent scope pauses, notifies, resumes where it stopped, no hang | ✗ BLOCKED | Agent scope fixed and verified; team scope uses a stale total after a settings edit (gap 1) |
| AIO-LINK-01 | 34-05, 34-10 | N links of CR/task/system/note/document; full content retrieval | ✓ SATISFIED | `teamTools.ts:listLinkedItems/getLinkedContext`; `LinkedItemPicker` |
| AIO-BG-01 | 34-07, 34-08, 34-10 | Runs continue across view switch; per-agent + global Stop | ✓ SATISFIED | Module registry; `stopAgent`/`abortAll`; live bubbles |
| AIO-UI-01 | 34-09, 34-10 | Employee tab + `'teams'` page with shared transcript | ✓ SATISFIED | `AiOfficeView.tsx`; `TeamsView.tsx`; workbench maps |
| AIO-BACKUP-01 | 34-01, 34-06 | Six tables + attribution round-trip; v11 envelope; old backup restores | ✓ SATISFIED | `exportBackup.ts`, `validateBackup.ts`, `restoreBackup.ts`; `officeBackup.test.ts` |

No orphaned requirements — all 19 IDs appear in at least one plan's `requirements` field.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/services/ai/office/teamRunCoordinator.ts` | 223, 786 | `teamBudget` captured at construction; top-up writes `teamBudget + amount` | 🛑 Blocker | Settings edit ignored and overwritten; pause threshold stale |
| `src/components/ai/office/TeamWorkspace.tsx` | 350 | Plan card gated on `snapshot.pendingPlan`, nulled on decision | 🛑 Blocker | `role="status"` decision line never observable |
| `src/components/ai/office/TeamWorkspace.tsx` | 409 | Sidebar `onTopUp` opens the modal without resetting `topUpScope` | ⚠️ Warning | After a banner top-up, the sidebar button can target the last agent instead of the team; the modal names the scope, so it is visible but surprising |
| `src/components/ai/office/TeamWorkspace.tsx` | 503-521 | Empty toolbox handlers (`onModelChange`, `onToggleAnalysisMode`, `onToggleMcpEnabled`, `onClearThread`) | ℹ️ Info | Deliberate — team runs fix model/analysis mode |
| `src/services/ai/office/teamTools.ts` | 155 | `ponytail:` cap comment on BM25 candidate set | ℹ️ Info | Documented deliberate simplification, not debt |
| `tests/views/TeamsView.test.tsx` | — | 3 unhandled `DatabaseClosedError` rejections after tests complete | ℹ️ Info | Pre-existing test hygiene; all assertions pass |

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

The gap-closure commit is real work, not a narrative: four of the five previous gaps are genuinely closed, with new tests and correct wiring (per-agent top-up, live toggles, `batchResults`, team-scoped mentions). Re-running the scoped suites gives 175 + 29 + 114 passing tests and a clean `tsc --noEmit`.

Two gaps remain, both blocking:

1. **A saved team budget is lost on the next top-up (BLOCKER).** `teamRunCoordinator.ts:223` captures `teamBudget` once and `:786` writes `teamBudget + amount`. Saving a new total in the settings drawer is ignored by the pause threshold and overwritten by the next team top-up — a probe shows 3000 → save 10000 → top up 2000 → 5000. This breaks AIO-BUDGET-01 and the team half of AIO-BUDGET-02.
2. **The plan card's decision line is never observable (BLOCKER).** `planDecision` is now threaded, but the card is rendered only while `snapshot.pendingPlan` is non-null and the coordinator clears it synchronously in `resolvePlan`. A probe shows neither the card nor its `role="status"` line after one microtask flush. UI-SPEC §7 requires the card to stay in the transcript with the status line.

A warning-level nit: the sidebar top-up button does not reset `topUpScope`, so it can inherit the last agent scope.

---

_Verified: 2026-11-08T17:41:17Z_
_Verifier: Claude (gsd-verifier)_
