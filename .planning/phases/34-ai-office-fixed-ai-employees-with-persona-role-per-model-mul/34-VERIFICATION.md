---
phase: 34-ai-office-fixed-ai-employees-with-persona-role-per-model-mul
verified: 2026-11-08T17:05:47Z
status: gaps_found
score: 30/35 must-haves verified
overrides_applied: 0
gaps:
  - truth: "At 80% of an agent's budget that scope pauses between tool rounds, preserves context, and resumes exactly where it stopped once tokens are granted — nothing is auto-aborted and no pause reads as a hang"
    status: failed
    reason: "The coordinator implements per-agent top-up (topUp({kind:'agent'}) opens the agent gate) and tests cover it, but no UI ever calls it. TeamWorkspace wires only topUp({kind:'team'}), AgentPausedBanner never receives agentName, and BudgetTopUpModal is always team scope. A team-scope top-up opens only the team gate; the agent gate stays closed, so the paused agent never resumes and the batch never settles — a permanent hang, which the requirement explicitly forbids."
    artifacts:
      - path: "src/components/ai/office/TeamWorkspace.tsx"
        issue: "Line 531 is the only topUp call and passes {kind:'team'}; AgentPausedBanner at line 332 gets no agentName; BudgetTopUpModal at line 525 is always {kind:'team'}"
      - path: "src/components/ai/office/TeamSidebar.tsx"
        issue: "Per-agent rows show used/budget but expose no top-up action"
      - path: "src/components/ai/office/TeamWorkspace.tsx"
        issue: "handleSaveSettings calls topUpMemberBudget directly (line 285), which writes the DB but never opens the coordinator's agent gate"
    missing:
      - "A per-agent top-up path that calls coordinator.topUp({ kind: 'agent', agentId })"
      - "Render AgentPausedBanner with the paused agent's name (or a per-agent banner) when only one agent is paused"
      - "Open the agent gate when the settings drawer raises that agent's budget"

  - truth: "The team's 'Tự động chia việc' bypass toggle and 'Tự động duyệt thay đổi' auto-approve toggle take effect"
    status: partial
    reason: "The coordinator captures the `team` object at construction (teamRunCoordinator.ts:536, :620) and the workspace effect deps are [team.id, db, lead, employees, skills, createRuntimeDeps] — team.id never changes, so a toggle changed in the sidebar or settings drawer never reaches the running coordinator. The module registry returns the same coordinator on remount, so the stale value persists for the session."
    artifacts:
      - path: "src/components/ai/office/TeamWorkspace.tsx"
        issue: "Effect at line 139 does not re-run on team field changes"
      - path: "src/services/ai/office/teamRunCoordinator.ts"
        issue: "Reads team.autoSplitEnabled / team.autoApproveMutations from the captured options snapshot"
    missing:
      - "A coordinator setter (or a live team read) so both toggles apply without an app reload"

  - truth: "Each employee sees the results of the other agents in its batch"
    status: partial
    reason: "buildEmployeeTurnRequest accepts batchResults and wraps it in the untrusted segment, but no caller ever passes it. startEmployeeTurn supplies only assignmentHistory and recentTurns. Because all three employee turns start in the same loop, the recent window cannot contain same-batch peers' reports; the explicit mechanism is dead code."
    artifacts:
      - path: "src/services/ai/office/teamRunCoordinator.ts"
        issue: "startEmployeeTurn (line 466) never passes batchResults"
      - path: "src/services/ai/office/teamPrompts.ts"
        issue: "batchResults branch (line 101) is unreachable in production"
    missing:
      - "Pass prior-batch (or settled batch) results into buildEmployeeTurnRequest"

  - truth: "The assignment plan card replaces its buttons with a role=status line after a decision"
    status: partial
    reason: "The component supports the decision state, but TeamWorkspace always renders decision={undefined} and clears pendingPlan immediately after resolvePlan, so the post-decision line never appears in the app."
    artifacts:
      - path: "src/components/ai/office/TeamWorkspace.tsx"
        issue: "AssignmentPlanCard rendered with decision={undefined} (line 326)"
    missing:
      - "Track the decision in workspace state and pass it to the card until the next plan"

  - truth: "The team composer offers only the team's own agents as @ options"
    status: partial
    reason: "TeamWorkspace builds roster and agentMentionOptions from the full employee list passed by TeamsView, not from the team's member rows. @mentioning a non-member employee resolves in parseMentionTarget and starts a turn; that agent has no aiTeamMembers row, so its budget is 0 and bucketOf(used, 0) = 10, pausing it permanently after the first usage."
    artifacts:
      - path: "src/views/TeamsView.tsx"
        issue: "Passes the full employees list to TeamWorkspace instead of the team roster"
      - path: "src/components/ai/office/TeamWorkspace.tsx"
        issue: "roster = [lead, ...employees] and agentMentionOptions derive from it (lines 100, 226)"
    missing:
      - "Filter roster and mention options to the team's aiTeamMembers rows"
      - "Refuse an @mention outside the team roster in the coordinator"
---

# Phase 34: AI Office Verification Report

**Phase Goal:** A user can staff an AI Office of reusable employees and leads, assign one skill per employee, and run a team where a lead decomposes the request, proposes a confirmed assignment plan, and dispatches parallel read-only employee batches over a shared, offline-searchable transcript — with lead-only mutations parked on the existing approval card and per-team/per-agent token budgets that pause at 80% instead of auto-stopping.
**Verified:** 2026-11-08T17:05:47Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Employees and leads are separate global entities; editing an employee persona changes it in every team | ✓ VERIFIED | `aiOfficeRepo.ts` CRUD on `aiEmployees`/`aiLeads`; teams store only `leadId` + `aiTeamMembers.agentId`; `countTeamsUsingEmployee` drives the shared-edit alert |
| 2 | Activating a team dispatches the lead, which emits an assignment plan card; approval runs a concurrent batch (cap 3) and the lead synthesizes only after | ✓ VERIFIED | `teamRunCoordinator.ts:599-702` (plan park, `Promise.allSettled` + deferred settle); `MAX_BATCH_SIZE=3`; `TeamWorkspace.tsx:323` renders `AssignmentPlanCard` |
| 3 | Every transcript message is attributed and renders in one channel; `@agent` addresses an employee; a running agent streams into its own bubble with a status badge | ✓ VERIFIED | `chatRepo.ts:173-176` attribution; `ChatMessageList.tsx:171-188`; `TeamWorkspace.tsx:296-317` live bubbles; `AgentAttributionRow.tsx:74-84` badges |
| 4 | Employee turns are structurally read-only; every lead mutation parks on the existing `MutationApprovalCard` unless auto-approve is on | ✓ VERIFIED | `chatTurnRuntime.ts:374-378` read-only branch precedes artifact/auto-approve; `teamRunCoordinator.ts:536` sets `autoApprove`; `AiChatWidget.tsx:495` renders `MutationApprovalCard` |
| 5 | With the Knowledge Server stopped and network offline, an agent can recall older work via `search_team_history` and `read_team_turn` | ✓ VERIFIED | `teamTools.ts` imports only `src/utils/bm25.ts` + IndexedDB repos; no network call in either handler |
| 6 | At 80% of the team budget **or of one agent's budget**, that scope pauses between tool rounds, preserves context, and resumes exactly where it stopped — nothing auto-aborted, no pause reads as a hang | ✗ FAILED | Team scope works. Per-agent scope pauses but is unrecoverable from the UI — no caller of `topUp({kind:'agent'})`; see gap 1 |
| 7 | A stopped agent reports back marked incomplete, and a global Stop aborts the lead plus every running agent | ✓ VERIFIED | `teamRunCoordinator.ts:694` (`incomplete: true`), `:717-727` (`stopAgent` / `abortAll`) |
| 8 | Team runs continue when the user leaves the tab; returning shows the full result | ✓ VERIFIED | Module-level `coordinatorRegistry` (`TeamWorkspace.tsx:58`), no React import in the coordinator, transcript persisted in `chatMessages` |
| 9 | Dexie opens at version 17 with six new stores and every V16 row readable | ✓ VERIFIED | `db/schema.ts:121` `SCHEMA_V17`; `db/index.ts:492` `this.version(17)`; `tests/db/schemaV17Migration.test.ts` passes |
| 10 | A chat message carries `agentId`/`agentName`/`agentKind`/`messageKind` without changing existing rows | ✓ VERIFIED | `types/models.ts`, `chatRepo.ts:173-176`, `chatTurnRuntime.ts:497-498` |
| 11 | `'team'` is a first-class scope and `team:<id>` rehydrates as `team`, never `global` | ✓ VERIFIED | `models.ts:223`; `chatTabRepo.ts:34`; `schemaV17Migration.test.ts:141-155` |
| 12 | Employees/leads/skills are global; teams reference by id | ✓ VERIFIED | `aiTeamRepo.ts` stores `leadId` + `agentId`; no embedded copies |
| 13 | A fourth team cannot activate while three are active; a team cannot hold more than three employees | ✓ VERIFIED | `aiTeamRepo.ts:43-50` inside `db.transaction('rw', [db.aiTeams])`; `:236-244` employee cap |
| 14 | Reactivating an idle team reuses the same chat thread | ✓ VERIFIED | `teamTranscriptRepo.ts:31-36` `ensureTeamThread` → `createOrGetThread` on `team:<id>` scope key |
| 15 | An even split sums exactly to the total, remainder on the lead row | ✓ VERIFIED | `aiTeamRepo.ts:52-75`; `TeamSettingsDrawer.tsx:37-51` |
| 16 | A team transcript read can never return another team's row | ✓ VERIFIED | `teamTranscriptRepo.ts:108-116` `getTeamTurn` checks `row.threadId !== threadId`; thread id comes from request-bound context |
| 17 | `persistUserMessage: false` writes no `role:'user'` row | ✓ VERIFIED | `chatTurnRuntime.ts:258` guard |
| 18 | `mutationPolicy:'read-only'` refuses every mutation before the artifact and auto-approve branches and never publishes `awaiting-approval` | ✓ VERIFIED | `chatTurnRuntime.ts:374-378`; test in `chatTurnRuntime.test.ts` |
| 19 | `beforeToolRound` is forwarded with the turn's own signal and awaited each round after the first | ✓ VERIFIED | `chatTurnRuntime.ts:303-304`; `aiOrchestratorLoop.ts:232-233` |
| 20 | The employee payload contains no mutation tool and no `delegate_batch` | ✓ VERIFIED | `teamRunCoordinator.ts:126-128, 291-293`; `teamRunCoordinator.test.ts:290-307` |
| 21 | The 80% crossing is a pure function of used/budget; a top-up makes the next crossing notify again | ✓ VERIFIED | `budgetGate.ts:68-81`; `budgetGate.test.ts` |
| 22 | Each agent gets its own runtime instance, so three concurrent starts never throw `TURN_IN_PROGRESS` | ✓ VERIFIED | `teamRunRegistry.ts:29-59`; `chatTurnRuntime.ts:220` guard |
| 23 | An employee's system prompt contains the skill description and never the skill body | ✓ VERIFIED | `teamPrompts.ts:90-97`; `teamPrompts.test.ts` |
| 24 | An employee's history contains its own instruction/report pairs capped, plus the recent window, never the whole transcript | ✓ VERIFIED | `teamPrompts.ts:113-131`; `teamTranscriptRepo.ts:77-106` |
| 25 | Retrieved content is wrapped in a delimited untrusted-data segment | ✓ VERIFIED | `teamPrompts.ts:47-56, 99-108` |
| 26 | Six team tools: compact BM25 hits, team-scoped full turn read, skill body, compact links, full linked content, structured `delegate_batch` refusals | ✓ VERIFIED | `teamTools.ts:48-146, 150-335`; `teamTools.test.ts` |
| 27 | Backup export/validate/restore carries the six tables + four attribution fields; v11 stays; absent tables leave local rows untouched | ✓ VERIFIED | `exportBackup.ts:190-311`; `validateBackup.ts:222-238`; `restoreBackup.ts:47-63, 245-253`; `officeBackup.test.ts` |
| 28 | Coordinator: `@mention` routing, plan park, concurrent terminal settle, incomplete marking, both stops, lead approval exposed/resolvable, no React import, every advertised tool resolves | ✓ VERIFIED | `teamRunCoordinator.ts` (792 lines); `resolveTeamToolName` guard |
| 29 | Attribution row, status badges, `aria-live="polite"`, agent mention pill | ✓ VERIFIED | `AgentAttributionRow.tsx:43-108`; `ChatMessageBubble.tsx:1275`; `ChatMessageBubble.tsx:137` agent alternative |
| 30 | Assignment plan card is not warning-colored, carries a 3px primary left border, and shows a `role="status"` line after a decision | ? UNCERTAIN | Component does all three (`AssignmentPlanCard.tsx:47, 92-97`), but the host always passes `decision={undefined}` — see gap 4 |
| 31 | Employee tab shell defaults to Văn phòng AI, Ghost Dev reachable, second segment filters employees/leads/skills, CRUD persists, shared-edit alert, skill label | ✓ VERIFIED | `AiOfficeView.tsx:63-215`; `EmployeeEditorDrawer.tsx:199-200`; `SkillEditorDrawer.tsx:120` |
| 32 | `'teams'` is in `EditorViewType` and both title maps + tab icon | ✓ VERIFIED | `layoutStore.ts:15`; `EditorArea.tsx:81, 646`; `WorkbenchLayout.tsx:184` |
| 33 | Teams route renders list and workspace; activate/pause caps; create/settings drawers; sidebar; composer lead-first @; `MutationApprovalCard`; focus order; TitleBar entry | ? UNCERTAIN | All present, but mention options include non-team employees — see gap 5 |
| 34 | Each employee sees the results of the other agents in its batch | ? UNCERTAIN | `batchResults` unwired — see gap 3 |
| 35 | The bypass and auto-approve toggles take effect on the run | ? UNCERTAIN | Coordinator captures `team` at construction — see gap 2 |

**Score:** 30/35 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/types/aiOffice.ts` | Entity contracts + capability constants | ✓ VERIFIED | 120 lines, 20 exports |
| `src/validation/aiOfficeSchemas.ts` | Zod input schemas | ✓ VERIFIED | 127 lines, 20 exports |
| `src/db/schema.ts` / `src/db/index.ts` | `SCHEMA_V17` + `version(17)` + six `Table<>` | ✓ VERIFIED | `schema.ts:121`, `index.ts:85-90, 492` |
| `src/db/repositories/aiOfficeRepo.ts` | Employee/lead/skill CRUD | ✓ VERIFIED | 216 lines, 14 exports |
| `src/db/repositories/aiTeamRepo.ts` | Team/member/link + caps + split | ✓ VERIFIED | 342 lines, 19 exports |
| `src/db/repositories/teamTranscriptRepo.ts` | Team-tagged persistence + BM25 docs | ✓ VERIFIED | 131 lines, 7 exports |
| `src/services/ai/office/budgetGate.ts` | Gate + crossing rule | ✓ VERIFIED | 86 lines, 4 exports |
| `src/services/ai/office/teamRunRegistry.ts` | Per-agent runtime registry | ✓ VERIFIED | 59 lines |
| `src/services/ai/office/teamPrompts.ts` | Lead/employee prompt assembly | ✓ VERIFIED | 193 lines, 3 exports |
| `src/services/ai/office/teamTools.ts` | Six tools + dispatch | ✓ VERIFIED | 335 lines, 4 exports |
| `src/services/ai/office/teamRunCoordinator.ts` | Headless coordinator | ✓ VERIFIED | 792 lines, 9 methods |
| `src/components/ai/office/*.tsx` (15 files) | Attribution, plan card, banner, modal, cards, drawers, workspace, sidebar | ✓ VERIFIED | All present, 47-538 lines each |
| `src/views/AiOfficeView.tsx` | Employee tab shell | ✓ VERIFIED | 320 lines |
| `src/views/TeamsView.tsx` | Team list + workspace | ✓ VERIFIED | 190 lines |
| `src/components/ai/AiChatWidget.tsx` | agent pass-through props | ✓ VERIFIED | `:115-119, 282-285, 414-419, 570` |
| `src/components/ai/ChatInputBar.tsx` | `agentOptions` lead-first @ | ✓ VERIFIED | `:45, 472-502` |
| Backup five-file contract | Six tables + attribution | ✓ VERIFIED | `types/backup.ts`, `validation/backupSchemas.ts`, `exportBackup.ts`, `validateBackup.ts`, `restoreBackup.ts` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `db/index.ts` | `db/schema.ts` | `this.version(17).stores(SCHEMA_V17)` | ✓ WIRED | `index.ts:492` |
| `aiOfficeRepo.ts` | `aiOfficeSchemas.ts` | `Schema.parse` at create/update | ✓ WIRED | Confirmed |
| `teamTranscriptRepo.ts` | `chatRepo.ts` | `chatMessages.where('threadId')` | ✓ WIRED | `:69` |
| `chatTurnRuntime.ts` | `aiOrchestratorLoop.ts` | `beforeToolRound` with turn signal | ✓ WIRED | `:303-304` → `:232-233` |
| `chatTurnRuntime.ts` | `chatRepo.ts` | attribution into `saveMessage` | ✓ WIRED | `:487-498` |
| `teamRunCoordinator.ts` | `teamRunRegistry.ts` | `registry.get(agentId)` | ✓ WIRED | `:503, 557` |
| `teamRunCoordinator.ts` | `teamTools.ts` | `delegate_batch` interception + team tool dispatch | ✓ WIRED | `:309-317` |
| `teamRunCoordinator.ts` | `chatTurnTools.ts` | `getToolsForTurn` + allowlists | ✓ WIRED | `:284-293` |
| `teamRunCoordinator.ts` | `aiTurnManager.ts` | `team:${teamId}` namespaced turns | ✓ WIRED | `:228-229, 409-429` |
| `teamRunCoordinator.ts` | `teamTranscriptRepo.ts` | `saveTeamMessage` | ✓ WIRED | `:582, 659` |
| `teamTools.ts` | `utils/bm25.ts` | `rankBM25` + `extractRelevantSnippet` | ✓ WIRED | `:5, 158-166` |
| `TeamWorkspace.tsx` | `teamRunCoordinator.ts` | `createTeamRunCoordinator` + subscribe | ✓ WIRED | `:167, 198-202` |
| `TeamWorkspace.tsx` | `teamTranscriptRepo.ts` | `ensureTeamThread` | ✓ WIRED | `:146` |
| `TeamWorkspace.tsx` | `AiChatWidget.tsx` | agent props pass-through | ✓ WIRED | `:441-493` |
| `AiChatWidget.tsx` | `ChatInputBar.tsx` | `agentOptions` | ✓ WIRED | `:570` |
| `EditorArea.tsx` | `TeamsView.tsx` | `case 'teams'` | ✓ WIRED | `:595-596` |
| `exportBackup.ts` | `db/index.ts` | reads six tables | ✓ WIRED | `:218-223` |
| `restoreBackup.ts` | `validateBackup.ts` | `validateBackupPayload` | ✓ WIRED | `:11` |
| `TeamWorkspace.tsx` | `teamRunCoordinator.ts` | per-agent `topUp` | ✗ NOT_WIRED | Only `{kind:'team'}` is called |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `TeamWorkspace.tsx` transcript | `messages` | `getMessagesByThreadId(threadId, db)` | Yes — real `chatMessages` rows | ✓ FLOWING |
| `TeamWorkspace.tsx` live bubbles | `snapshot.agents[].streamingText` | coordinator `onDelta` | Yes — real stream deltas | ✓ FLOWING |
| `TeamSidebar.tsx` budget | `members[].usedTokens` / `team.budgetTokens` | `aiTeamMembers` + `aiTeams` | Yes | ✓ FLOWING |
| `AiOfficeView.tsx` lists | `employees`/`leads`/`skills` | `useLiveQuery` over repos | Yes | ✓ FLOWING |
| `TeamsView.tsx` cards | `teams`, `allMembers` | `listTeams` + `aiTeamMembers` | Yes | ✓ FLOWING |
| `TeamWorkspace.tsx` agent directory | `roster` | full `employees` prop, not team members | Real but over-broad | ⚠️ HOLLOW_PROP (non-member agents offered) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase 34 unit/UI suites | `npx vitest run tests/services/ai/office tests/db/schemaV17Migration.test.ts tests/services/backup/officeBackup.test.ts tests/views/AiOfficeView.test.tsx tests/views/TeamsView.test.tsx tests/ai/ChatMessageListAttribution.test.tsx tests/ai/office/AgentOfficeComponents.test.tsx tests/ai/ChatInputBarAgentMentions.test.tsx` | 15 files, 171 tests passed | ✓ PASS |
| Runtime seam suites | `npx vitest run tests/ai/chatTurnRuntime.test.ts tests/ai/chatRepo.test.ts tests/services/ai/aiOrchestratorLoop.test.ts tests/ai/chatTurnTools.test.ts tests/db.test.ts tests/db/repositories/__tests__/chatTabRepo.test.ts tests/ai/ActiveAiTurnIndicator.test.tsx` | 6 files, 114 tests passed | ✓ PASS |
| Typecheck | `npx tsc --noEmit` | Clean, no output | ✓ PASS |

### Probe Execution

Step 7b: SKIPPED (no runnable CLI/API entry points; this is a browser/Tauri UI feature). Step 7c: no probe scripts declared in PLAN/SUMMARY and no `scripts/*/tests/probe-*.sh` exist.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| AIO-EMP-01 | 34-01, 34-02, 34-04, 34-09 | Global reusable employees/leads, one skill, shared edits | ✓ SATISFIED | `aiOfficeRepo.ts`, `aiEmployees` store, shared-edit alert |
| AIO-EMP-02 | 34-01, 34-02, 34-10 | One lead + max 3 employees; max 3 active teams; reactivation resumes transcript | ✓ SATISFIED | `aiTeamRepo.ts:43-50, 236-244`; `ensureTeamThread` |
| AIO-SKILL-01 | 34-01, 34-02, 34-09 | Global name+description+body, assignable to one agent | ✓ SATISFIED | `aiSkills` store; scalar `skillId`; `SkillEditorDrawer` |
| AIO-SKILL-02 | 34-04, 34-05 | Prompt gets description only; body via `read_skill` | ✓ SATISFIED | `teamPrompts.ts:90-97`; `teamTools.ts:readSkill` |
| AIO-TEAM-01 | 34-07, 34-08, 34-10 | Lead emits plan card; batch only after approval unless bypass toggle | ? NEEDS HUMAN | Core works; bypass toggle is stale in-session (gap 2) |
| AIO-TEAM-02 | 34-05, 34-07 | Single `delegate_batch`, cap 3, concurrent, results after whole batch | ✓ SATISFIED | `teamTools.ts:delegateBatch`; `teamRunCoordinator.ts:599-702` |
| AIO-TEAM-03 | 34-04, 34-07 | Own prompt + skill description + instruction + original request + peers' batch results + own history + recent window | ? NEEDS HUMAN | All but peers' batch results (gap 3) |
| AIO-TEAM-04 | 34-07, 34-10 | `@agent` addresses any agent; no mention → lead | ? NEEDS HUMAN | Routing works; mention list includes non-members (gap 5) |
| AIO-MEM-01 | 34-01, 34-02, 34-07, 34-08 | One transcript per team, attributed, one channel | ✓ SATISFIED | `teamTranscriptRepo.ts`; `ChatMessageList` attribution |
| AIO-MEM-02 | 34-05 | `search_team_history` compact BM25 + `read_team_turn` full | ✓ SATISFIED | `teamTools.ts:150-186` |
| AIO-MEM-03 | 34-05 | Offline, no daemon dependency | ✓ SATISFIED | IndexedDB + `utils/bm25.ts` only |
| AIO-WRITE-01 | 34-03, 34-07 | Employees structurally read-only; lead holds read set + team tools | ✓ SATISFIED | `EMPLOYEE_READ_ONLY_ALLOWLIST`; read-only branch |
| AIO-WRITE-02 | 34-03, 34-07 | Lead mutations park on `MutationApprovalCard`; auto-approve toggle wins | ? NEEDS HUMAN | Parking works; toggle stale in-session (gap 2) |
| AIO-BUDGET-01 | 34-02, 34-10 | Team budget, even split editable per row, accumulates, top-up anytime | ✓ SATISFIED | `applyEvenSplit`; `TeamSettingsDrawer`; team top-up |
| AIO-BUDGET-02 | 34-03, 34-04, 34-07, 34-08 | 80% team or agent scope pauses, notifies, resumes where it stopped, no hang | ✗ BLOCKED | Per-agent resume unreachable from UI (gap 1) |
| AIO-LINK-01 | 34-05, 34-10 | N links of CR/task/system/note/document; full content retrieval | ✓ SATISFIED | `teamTools.ts:listLinkedItems/getLinkedContext`; `LinkedItemPicker` |
| AIO-BG-01 | 34-07, 34-08, 34-10 | Runs continue across view switch; per-agent + global Stop | ✓ SATISFIED | Module registry; `stopAgent`/`abortAll`; live bubbles |
| AIO-UI-01 | 34-09, 34-10 | Employee tab + `'teams'` page with shared transcript | ✓ SATISFIED | `AiOfficeView.tsx`; `TeamsView.tsx`; workbench maps |
| AIO-BACKUP-01 | 34-01, 34-06 | Six tables + attribution round-trip; v11 envelope; old backup restores | ✓ SATISFIED | `exportBackup.ts`, `validateBackup.ts`, `restoreBackup.ts`; `officeBackup.test.ts` |

No orphaned requirements — all 19 IDs appear in at least one plan's `requirements` field.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/services/ai/office/teamRunCoordinator.ts` | 466 | `batchResults` never passed to `buildEmployeeTurnRequest` | ⚠️ Warning | Peers' batch results never reach an employee |
| `src/services/ai/office/teamRunCoordinator.ts` | 536, 620 | Captured `team` snapshot read for toggles | ⚠️ Warning | Toggles require an app reload |
| `src/components/ai/office/TeamWorkspace.tsx` | 326 | `decision={undefined}` hardcoded | ⚠️ Warning | Post-decision card state never shown |
| `src/components/ai/office/TeamWorkspace.tsx` | 464-479 | Empty toolbox handlers (`onModelChange`, `onToggleAnalysisMode`, `onToggleMcpEnabled`, `onClearThread`) | ℹ️ Info | Deliberate — team runs fix model/analysis mode; widget controls are inert by design |
| `src/services/ai/office/teamTools.ts` | 155 | `ponytail:` cap comment on BM25 candidate set | ℹ️ Info | Documented deliberate simplification, not debt |
| `tests/views/TeamsView.test.tsx` | — | 3 unhandled `DatabaseClosedError` rejections after tests complete | ℹ️ Info | Test hygiene; all 171 tests pass |

No `TBD`/`FIXME`/`XXX` markers in any phase-modified file.

### Human Verification Required

1. **Per-agent budget pause and resume**
   **Test:** Create a team with a small per-agent budget, run a batch that pushes one employee past 80%, then try to grant that employee more tokens.
   **Expected:** The agent pauses with a visible "needs more tokens" state and resumes exactly where it stopped.
   **Why human:** The automated path exists in the coordinator but no UI calls it — this is the failing gap. Confirm the actual user experience is a permanent hang.

2. **Bypass and auto-approve toggles**
   **Test:** Open a team, toggle "Tự động chia việc" (or "Tự động duyệt thay đổi"), then send a request that would normally show the plan card (or approval card).
   **Expected:** The toggle takes effect immediately.
   **Why human:** The coordinator captures the team object at construction; verify whether a reload is required.

3. **Visual and focus behavior**
   **Test:** Walk the workspace with keyboard only; confirm sidebar → header → transcript (one stop) → composer, roving focus across per-agent Stop buttons, and the `aria-live` streaming announcement.
   **Why human:** Focus order and screen-reader announcement cannot be verified by grep.

### Gaps Summary

The phase delivers the core AI Office: typed v17 schema, global employees/leads/skills, team caps and thread reuse, a headless coordinator with plan-card approval, three-way concurrent read-only batches, terminal-only settle, offline BM25 transcript search, lead-only mutations on the existing approval card, backup round-trip, and both workbench surfaces. Tests (285 across the scoped suites) and `tsc --noEmit` are green.

Five gaps remain, one of them blocking:

1. **Per-agent budget pause is unrecoverable (BLOCKER).** The coordinator and its tests support `topUp({kind:'agent'})`, but no UI calls it. A per-agent 80% pause closes the agent gate permanently; a team-scope top-up opens only the team gate. The requirement explicitly forbids a pause reading as a hang.
2. **Toggles are stale in-session.** The coordinator captures `team` at construction and the workspace effect never re-runs on team field changes.
3. **`batchResults` is dead code.** Employees never receive peers' batch results through the dedicated mechanism.
4. **Plan card decision state never renders.** The host always passes `decision={undefined}`.
5. **Mention options include non-team employees.** `@mentioning` a non-member starts a turn with a zero budget and pauses it permanently.

---

_Verified: 2026-11-08T17:05:47Z_
_Verifier: Claude (gsd-verifier)_
