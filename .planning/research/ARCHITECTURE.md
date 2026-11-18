# Architecture Research: Unified AI Office (v1.4)

**Domain:** Merging two existing features (SDLC Studio + AI Office) into one chat-first AI workspace inside an offline-first React 19 / TypeScript / Ant Design 6 / Dexie 4 / Tauri app.
**Researched:** 2026-11-09
**Confidence:** HIGH on code facts (every claim below traced to a file), MEDIUM on recommendations.

---

## 1. Current Architecture (verified)

```
Stripe (left)                    Center (EditorArea)                Right
┌──────────────────┐   ┌────────────────────────────────┐   ┌──────────────┐
│ cr_explorer      │   │ tabs: tasks|notes|planner|...  │   │ ai_chat      │
│ docs             │   │       |sdlc|cr_detail|agents|  │   │ notifications│
│ diagrams         │   │       |staff_detail|           │   └──────────────┘
│ systems          │   │       |team_workspace          │
│ ai_office  Alt+7 │   └────────────────────────────────┘
│ ...              │
│ ai_staff   Alt+8 │  ← bottom-left group (DEFAULT_BOTTOM_LEFT_ITEMS)
└──────────────────┘
```

Key facts:

| Concern | Reality |
|---|---|
| Layout store | `src/workbench/store/layoutStore.ts` — zustand + `persist` to `localStorage` key `taskmate_workbench_layout_v2`. `partialize` validates types but **not** `viewType` membership. `EditorArea` `default:` branch renders `<TasksView/>`, so a persisted `sdlc` tab silently becomes Tasks after the view type is removed. |
| Stripe items | `WorkbenchLayout.tsx:47-85`. `ai_office` is a left item (Alt+7); `ai_staff` is a *bottom-left* item (Alt+8). Neither Alt+7 nor Alt+8 exists in `useGlobalKeymap` or `actionRegistry` — those shortcuts are dead today. |
| Editor routing | `EditorArea.tsx:580-690`. `staff_detail` → `StaffDetailView`, `team_workspace` → `TeamWorkspaceView`, `sdlc` → `ChangeRequestSdlcView`. |
| Team = group chat | `AiTeam` is the group. Its transcript is a `ChatThread` with `scopeKey = 'team:<teamId>'` created by `ensureTeamThread` (`teamTranscriptRepo.ts:33`). There is **no** separate container entity. |
| Coordinator | `teamRunCoordinator.ts` — headless, no React import. One `ChatTurnRuntime` per agent via `teamRunRegistry`. Intercepts `delegate_batch` inside `executeToolFn` (`:336-361`). Gates via `beforeToolRound` (`:499-507`). |
| Coordinator host | `components/ai/office/TeamWorkspace.tsx` — module-level `coordinatorRegistry` Map keyed `${db.name}:${teamId}` (`:56-61`). Survives unmount; only disposed on team delete. |
| Budget | `budgetGate.ts` (pure) + `aiTeamRepo` single-row writes. `handleUsage` (`teamRunCoordinator.ts:413-460`) converts cumulative per-turn usage into deltas. `topUp({kind:'agent'})` (`:851-869`) **does not** raise the team total — conflicts with C-12. |
| Caps | `MAX_ACTIVE_TEAMS=3`, `MAX_EMPLOYEES_PER_TEAM=3`, `MAX_BATCH_SIZE=3` in `types/aiOffice.ts:115-120`, enforced in `aiTeamRepo.ts:49,94,116,245` and `teamTools.ts:297`. All three conflict with C-08/C-09/C-10. |
| Dexie | V17 is the head (`db/schema.ts:121-129`). AI Office stores are purely additive, no `.upgrade()` hook. Backup envelope version is 11 (`backupSchemas.ts:690`). |
| Persisted SDLC data | `Note.sdlcArtifact`, `ChatTab.workflowState`, `ChatMessage.wizard`, `ChatMessage.artifactEvent`, `DocumentSet.sdlc`, `settings['sdlc_workflow:*']`, `chatTabs.type='sdlc'`. All are validated by `backupSchemas.ts` and exported by `exportBackup.ts`. |

---

## 2. SDLC Deletion Audit (concrete paths, verdict per file)

Verdict legend: **DELETE** = remove now; **EXTRACT** = move the shared part out first, then delete the rest; **KEEP** = still needed (persisted data, AI Office, or non-SDLC feature).

### 2.1 Entry points and workbench wiring

| Path / symbol | Verdict | Why |
|---|---|---|
| `src/views/ChangeRequestSdlcView.tsx` (1147 lines) | **DELETE** | Only mounted by `EditorArea` `case 'sdlc'`. |
| `EditorArea.tsx` `case 'sdlc'` + `import ChangeRequestSdlcView` + `import type { SdlcStepId }` | **DELETE** | Replace with removed view type. |
| `layoutStore.ts` `EditorViewType` member `'sdlc'` | **DELETE** + bump `LAYOUT_STORAGE_KEY` to `..._v3` | Persisted tabs otherwise fall through to `default: <TasksView/>`. |
| `TitleBar.tsx:252-273` SDLC Studio button (`data-testid="titlebar-btn-sdlc"`) | **DELETE** | Entry point #1. |
| `CRExplorer.tsx` `openSdlc` + menu item `open-sdlc` | **DELETE** | Entry point #2. |
| `ChangeRequestsView.tsx:195-204` `onOpenSdlcStudio` | **DELETE** | Entry point #3. |
| `SystemDetailView.tsx:291-299` `handleOpenSdlc` | **DELETE** | Entry point #4. |
| `ChangeRequestDetailView.tsx` `SDLC_PROGRESS_STEPS`, `stepTitle`, `workflowState` query, `openSdlc`, step strip | **DELETE** | Entry point #5 + `sdlc_workflow:` settings read. |
| `chatTabRepo.ts` `getOrCreateSdlcTab`, `getSdlcTabThreadId`, `SDLC_TITLE`, `type==='sdlc'` guards | **DELETE** | No SDLC tab is ever created. |
| `AIChatDrawer.tsx:959-1010` `sdlcTabs` / `sdlcCheckpoints` / `sdlc_workflow:` reads | **DELETE** | Dead once no SDLC tab exists. |
| `ChatTabBar.tsx` `'sdlc'` type, `sdlcStatus` prop | **DELETE** | |
| `AiChatWidget.tsx:18` `AiChatScopeKind = 'chat' \| 'sdlc'` | **DELETE** the `'sdlc'` member | Only `'chat'` is ever constructed. |

### 2.2 SDLC UI components

| Path | Verdict | Why |
|---|---|---|
| `src/components/sdlc/SdlcWorkspace.tsx`, `SdlcSidebar.tsx`, `SubsystemContextBar.tsx`, `SubsystemsReposPanel.tsx` | **DELETE** | Only used by `ChangeRequestSdlcView`. |
| `src/components/sdlc/chat/StepChatPanel.tsx`, `useStepChatToolbox.ts` | **DELETE** | |
| `src/components/sdlc/steps/Step1..Step6*.tsx` | **DELETE** | |
| `src/components/sdlc/pack/MultiPackTable.tsx` | **DELETE** | |
| `src/components/sdlc/diff/RemoteDiffViewer.tsx` | **DELETE** | |
| `src/components/sdlc/diff/DiffSyntaxHighlighter.tsx` | **EXTRACT** → `src/components/common/DiffSyntaxHighlighter.tsx` | `src/workbench/editor/RemoteFileViewer.tsx:17` imports `DiffLineCodeRenderer` from it. Non-SDLC feature. |
| `src/components/sdlc/common/SafeMarkdown.tsx` | **DELETE** | Only `Step2SolutionView` uses it; everything else calls `utils/markdown.renderSafeMarkdown` directly. |
| `src/components/sdlc/common/ConventionsDetailModal.tsx`, `ConventionsSummaryCard.tsx`, `ResearchSummaryCard.tsx`, `SubsystemProposalCard.tsx`, `SdlcStaleBanner.tsx` | **DELETE** | |
| `src/components/ai/wizard/SdlcWorkflowHub.tsx`, `HubStepPanels.tsx`, `RevisionImpactModal.tsx`, `ChangePackConfirmStrip.tsx`, `ChangePackDropzone.tsx`, `DriftMatrixView.tsx`, `HubExportRow.tsx`, `WizardSavedNoteBanner.tsx`, `NoteSourcePickerModal.tsx`, `StepInputDocsModal.tsx`, `revisionView.ts`, `restoreRecovery.ts` | **DELETE** | `SdlcWorkflowHub` has no external mount (only self-reference + tests). `restoreRecovery` is only used by `AIChatDrawer` for `sdlc_workflow:` restore. |
| `src/components/ai/wizard/DocumentPreviewCard.tsx`, `SolutionReviewCard.tsx`, `GapFillQuestionCard.tsx` | **KEEP (move to `src/components/ai/legacy/`)** | `ChatMessageBubble.tsx:52-54,461` renders them for **historical** `ChatMessage.wizard` rows that already exist in users' IndexedDB and backups. Deleting them turns old transcripts into blank bubbles. |

### 2.3 SDLC services

| Path | Verdict | Why |
|---|---|---|
| `src/services/ai/sdlcPromptComposer.ts` | **EXTRACT then DELETE** | `buildConventionsSegment` + `CONVENTIONS_CONFLICT_POLICY` + `RepoConventionItem` are imported by `AIChatDrawer.tsx:51,1889` (ordinary AI chat). Move to `src/services/ai/conventionsSegment.ts`. Everything else (step contracts, tool policy, few-shots, artifact contracts, `buildExternalResearchSegment`, `buildSubsystemSectionContract`, `composeSdlcTurn`) is SDLC-only → delete. |
| `src/services/sdlc/groundingBuilder.ts` | **DELETE** | Step-scoped marker budget. `teamPrompts.wrapUntrusted` already provides the untrusted-data boundary AI Office needs. Do not extract. |
| `src/services/ai/sdlcArtifactTools.ts` | **EXTRACT then DELETE** | Generic, reusable core: `locateSection`, `applyOperation`, `detectEol`, `countLogicalLines`, `PATCH_LINE_CAP`, `createUnifiedLineDiff` wiring, refusal shape. Move to `src/services/ai/patchProposal.ts` — skill enrichment needs exactly this ("propose a new Markdown version, user approves the diff"). Delete SDLC-only: `KIND_OWNING_STEP`, `KIND_PREREQUISITES`, `loadWorkflowState`, `proposeSubsystems`, `proposeResearch`, `ArtifactToolContext`. |
| `src/services/wizard/artifactRepo.ts` | **DELETE** | Versioned-Note commit for CR artifacts (idempotency key, `documentSets` membership, `chatMessages` event). Skill versions get their own table (§3), so none of this is needed. Keep the *body format* (`{markdown, exportPayload}`) because existing notes carry it — readers already unwrap via `utils/noteBody.readNoteMarkdown`. |
| `src/services/wizard/sdlcWizardRuntime.ts`, `sdlcCrManager.ts`, `workflowCoordinator.ts`, `workflowGuards.ts`, `stalenessDetector.ts`, `sourceMerge.ts`, `hubSolution.ts`, `hubCab.ts`, `hubTechDocs.ts`, `hubCrSummary.ts`, `hubChangePack.ts`, `hubExport.ts` | **DELETE** | All reachable only from deleted SDLC views. `hubExport` is referenced by `utils/noteBody.ts` **in a comment only** — no import. |
| `src/services/ai/wizardService.ts`, `wizardPrompts.ts` | **DELETE** | Only used by `hubCab`/`hubTechDocs`/`groundingBuilder`. |
| `src/services/ai/researchService.ts` | **DELETE** | External research is an SDLC-step concept (SSH repo research via Claude Code headless). Not in v1.4 scope. |
| `src/services/changePackPackager.ts` | **DELETE** | Only `Step4ChangePackView`. |
| `src/services/export/wizardDocx.ts`, `pl03bDocx.ts` | **DELETE** | Only `Step6CabView` / `hubExport`. |
| `src/utils/sdlcSolutionParser.ts` | **DELETE** | Only `StepChatPanel`. |

### 2.4 Must KEEP — persisted-data schemas (cannot delete without a backup-envelope migration)

| Path / symbol | Verdict | Why |
|---|---|---|
| `src/services/wizard/workflowSchemas.ts` — `SdlcArtifactKindSchema`, `SdlcArtifactRefSchema`, `SdlcWorkflowStateSchema`, `SdlcWorkflowMetadataSchema` | **KEEP** (move to `src/types/legacySdlc.ts`) | Validated by `validation/backupSchemas.ts:13,253` and `db/repositories/chatRepo.ts:16`; `SdlcArtifactKind` is a field of `ChatArtifactEvent` (`types/models.ts:7,297`). Deleting breaks restore of every existing backup. |
| `src/services/ai/wizardSchemas.ts` — `SdlcArtifactMetadataSchema`, `SdlcDocumentSetMetadataSchema`, `WizardSnapshotSchema` | **KEEP** (move to legacy) | `Note.sdlcArtifact`, `DocumentSet.sdlc`, `ChatMessage.wizard` are persisted and backup-validated (`backupSchemas.ts:154,327,447`). |
| `src/services/wizard/changePack.ts`, `reconciliation.ts` | **KEEP** | `validateBackup.ts` and persisted change-pack note bodies depend on them. |
| `src/services/ai/office/*` | **KEEP** | The target feature. |
| `src/components/ai/widget/ArtifactDiffApprovalCard.tsx` + `chatTurnRuntime` patch branch | **KEEP + generalize** | Reused for skill-version diff approval. Rename to `PatchDiffApprovalCard`. |
| `src/components/ai/artifacts/ArtifactEventCard.tsx` | **KEEP** | Rendered by `AiChatWidget`; reusable for skill-version events. |

**Deletion blocker summary:** "delete SDLC completely" is achievable for *behavior* (views, services, entry points, state machine) but **not** for the four persisted schema modules. Those become type-only legacy modules. Do not delete `settings['sdlc_workflow:*']` rows or `chatTabs.type='sdlc'` rows in the migration — `exportBackup` filters settings only by secret-key name, and destructive cleanup risks user data. Filter them out of the UI instead.

---

## 3. Data Model: Group Chat ↔ Leader/Agents (additive Dexie V18)

`AiTeam` already is the group chat. Do **not** introduce a new container entity (C-04). The relation today:

```
aiTeams (1) ──leadId──> aiLeads
   │
   ├── aiTeamMembers (N) ──agentId──> aiEmployees ──skillId──> aiSkills
   ├── aiTeamLinks   (N) ──itemType/itemId──> cr | task | system | note | document
   └── chatThreads   (1)  scopeKey = 'team:<teamId>'  ← the transcript
```

Required changes:

| Change | Kind | Detail |
|---|---|---|
| `aiTeams` add `updatedAt` index | additive index | Conversation list must sort by recency. Field already exists (`types/aiOffice.ts:78`); only the index is missing. Spec: `'id, name, leadId, status, createdAt, updatedAt'`. |
| `aiTeamMembers` add `[teamId+agentId]` compound index | additive index, **non-unique** | Needed for per-member lookup and for the budget/roster join. Do **not** make it unique: an upgrade fails if legacy rows already contain duplicates. Enforce uniqueness in `addTeamMember` inside its existing transaction. |
| `aiSkillVersions` new table | additive store | `'id, skillId, version, status, createdAt, [skillId+version]'`. Fields: `id, skillId, version, status: 'proposed'\|'approved'\|'rejected'`, `body` (Markdown), `baseVersion`, `proposedByAgentId?`, `teamId?`, `threadId?`, `note?` (why the lesson was learned), `createdAt`, `approvedAt?`. One table covers both enrichment proposals and the version history. |
| `aiSkills` add `currentVersion: number` | additive field, no index | Optional if derived from `aiSkillVersions` max; deriving avoids a second source of truth. **Recommend derive**, no field. |
| `AiTeam.budgetTokens` | keep authoritative | Do **not** convert to "sum of member budgets" — the backup schema requires the field and top-ups intentionally make the split uneven. Instead: every member top-up writes the member row **and** raises `aiTeams.budgetTokens` in the same transaction. |

Rejected for v1.4 phase 1 (YAGNI): `aiTeamRuns` run ledger, `aiBudgetEvents` audit table. In-memory `TeamRunSnapshot` + persisted `usedTokens` already cover the stated requirements; a run ledger only matters if paused-run state must survive a reload (open item R-18).

Migration shape (`src/db/schema.ts` + `src/db/index.ts`):

```ts
export const SCHEMA_V18 = {
  ...SCHEMA_V17,
  aiTeams: 'id, name, leadId, status, createdAt, updatedAt',
  aiTeamMembers: 'id, teamId, agentId, [teamId+agentId], role',
  aiSkillVersions: 'id, skillId, version, status, createdAt, [skillId+version]',
} as const;

this.version(18).stores(SCHEMA_V18);   // no .upgrade() — pure index add + new store
```

Adding an index to an existing store is additive in Dexie and does not require a data hook. No backup-envelope bump is required for `aiSkillVersions` **only if** `backupSchemas.ts` gains `BackupAiSkillVersionRecordSchema` and `exportBackup`/`restoreBackup`/`validateBackup`/`types/backup.ts` list the table — otherwise skill history silently drops out of backups. That is a required companion edit, not optional.

---

## 4. Where Leader Orchestration Lives

**Keep the existing split.** It is already the right shape and rewriting it is the main way to regress this milestone.

```
Explorer / TeamWorkspaceView (React)
        │ send(text)
        ▼
teamRunManager (module scope, keyed db+teamId)      ← MOVE OUT of TeamWorkspace.tsx
        │
        ▼
teamRunCoordinator (headless, no React)
   ├─ lead turn ──> ChatTurnRuntime ──> runAiOrchestratorLoop
   │                     │ executeToolFn intercept: delegate_batch
   │                     ▼
   │                 runBatch() ──> N × ChatTurnRuntime (one per agent)
   │                                    │ executeToolFn intercept: team tools
   │                                    ▼
   └─ beforeToolRound ──> budgetGate.wait(signal)
```

Required changes, in dependency order:

1. **Relocate the registry.** `coordinatorRegistry` + `registryKey` currently live in `components/ai/office/TeamWorkspace.tsx:56-61`. Move to `src/services/ai/office/teamRunManager.ts` exporting `getOrCreateRun({db, team, lead, employees, skills, threadId, model, endpoint, apiKey})`, `peekRun`, `disposeRun`. Reason: the explorer must show live run status per conversation without mounting the workspace, and services must not import a component module.
2. **Concurrency semaphore in `runBatch`.** Today `:730-758` pushes *every* `startEmployeeTurn` then `Promise.allSettled` — unbounded. Replace with a small `runWithConcurrency(items, limit, fn)` helper (no dependency). Limit source: `AiTeam.concurrencyLimit?: number` (additive field, default 3) or a settings key. Requirement C-10 says configurable; default must be an explicit constant.
3. **Budget pre-flight + `maxTokens` clamp** (see §5).
4. **`MAX_BATCH_SIZE` decoupling.** `delegate_batch` validation (`teamTools.ts:297`) hard-caps a plan at 3. With unbounded rosters the plan size should be a separate cap (e.g. `MAX_PLAN_ASSIGNMENTS`) or the concurrency limit; it must not silently truncate a 6-agent plan.
5. **Remove the roster caps** `MAX_ACTIVE_TEAMS` / `MAX_EMPLOYEES_PER_TEAM` from `aiTeamRepo` and `TeamEditorDrawer.tsx:51`. Keep `MAX_ACTIVE_TEAMS` out of the DB layer entirely — "active" becomes a UI badge, not a gate.

Do **not** move leader logic into `runAiOrchestratorLoop`. The loop is the generic transport (streaming, pruning, compaction, tool dispatch). Orchestration is policy; keeping it in the coordinator preserves the `executeToolFn` seam that makes `delegate_batch` interceptable without touching the loop.

---

## 5. Token Budget Gating — Exact Hook Points

The current gate is a *pause*, not a *hard cap*: it is only awaited at `beforeToolRound` for rounds > 1 (`aiOrchestratorLoop.ts:232`). A single long turn can therefore overshoot arbitrarily. Five hooks are needed:

| # | Hook | Location | Purpose |
|---|---|---|---|
| 1 | Pre-flight refusal | `teamRunCoordinator.send()` → before `startLeadTurn` / `startEmployeeTurn` | If `remaining(agent) <= 0` or `remaining(team) <= 0`, return a structured refusal and do not start a runtime. Prevents a zero-budget turn from streaming at all. |
| 2 | Output clamp | `startLeadTurn` / `startEmployeeTurn` → `ChatTurnRequest.maxTokens` | `maxTokens = min(configuredMax, remainingForAgent)`. This is the only true hard stop for a single request; the loop already forwards `maxTokens` (`chatTurnRuntime.ts:298`, `aiOrchestratorLoop.ts:203`). |
| 3 | Usage accounting | `handleUsage` (`teamRunCoordinator.ts:413`) | Already converts cumulative → delta. **Fix the write:** `aiTeamRepo.addUsedTokens` does `get` → `update` outside a transaction (`:308-319`); three concurrent agents lose updates. Replace with `db.aiTeamMembers.where('id').equals(id).modify(row => { row.usedTokens += delta })` inside `db.transaction('rw', ...)`. |
| 4 | Round-boundary gate | `beforeToolRound` (exists) | Pause (not abort) at the next tool boundary. Keep. |
| 5 | Team-total gate | `handleUsage` team branch (exists) | Keep, but make the threshold configurable instead of the hardcoded bucket 8 in `shouldNotifyPause`. Add `settings['ai_office_budget_warn_ratio']` (default 0.8) read once per run. |

Top-up semantics (C-12) — currently wrong:

```ts
// teamRunCoordinator.topUp({kind:'agent'})  ← must also raise the team total
await db.transaction('rw', [db.aiTeamMembers, db.aiTeams], async () => {
  await topUpMemberBudget(memberId, amount, db);
  const team = await getTeam(teamId, db);
  await updateTeam(teamId, { budgetTokens: (team?.budgetTokens ?? 0) + amount }, db);
});
```

Presentation: `TeamSidebar` already renders per-member `Progress` and `BudgetTopUpModal` already shows used/budget/threshold. The only new display requirement is *input + output* visibility — `ChatTokenUsage` already carries `promptTokens` / `completionTokens`, and `ChatTurnRuntime.onUsage` accumulates both (`chatTurnRuntime.ts:340-347`). Show the pair, not just the total.

---

## 6. Explorer Two-Section + Center Tabs → Existing Layout Store

Minimal mapping; no new layout primitives needed.

| Requirement | Mapping |
|---|---|
| One trigger "AI Office" | Keep `DEFAULT_LEFT_ITEMS` entry `{ id: 'ai_office', shortcut: 'Alt+7' }`. Remove `{ id: 'ai_staff' }` from `DEFAULT_BOTTOM_LEFT_ITEMS` (`WorkbenchLayout.tsx:65-85`). |
| Section 1: leaders + agents | Reuse `AiStaffExplorer` body verbatim inside a top pane of `AiOfficeExplorer` (it already lists leads + employees with create drawers). |
| Section 2: conversations | Reuse the existing team list body of `AiOfficeExplorer` as the bottom pane. |
| Click → center detail | Unchanged tab ids: `staff_detail:<id>` → `StaffDetailView`; `team_workspace:<teamId>` → `TeamWorkspaceView`. **Keeping the ids is what preserves already-persisted tabs.** |
| Splitter between sections | Ant Design `Splitter` (already used in `TeamWorkspace.tsx`) with a local `useState` size; do not add it to `layoutStore`. |
| Alt+7 actually works | Add `view.toggle-ai-office` to `actionRegistry.ts` and `case '7'` to `useGlobalKeymap.ts`. Today Alt+7 is documented in the stripe tooltip but unbound. |
| Stale `sdlc` tabs | Bump `LAYOUT_STORAGE_KEY` to `taskmate_workbench_layout_v3` **and** filter `openTabs` in `partialize` against a known `viewType` set. Belt and braces: the key bump drops the old blob; the filter protects against a future removal. |

`EditorViewType` after the change: remove `'sdlc'`. Keep `'agents'` (skills CRUD lives in `AiOfficeView`) and `'teams'` (legacy list view) unless a later phase deletes them; removing them now would break persisted tabs for no benefit.

---

## 7. Integration Points

| Boundary | Communication | Notes |
|---|---|---|
| `AiOfficeExplorer` ↔ `layoutStore` | `openTab` | Same pattern as today; no new action needed. |
| `AiOfficeExplorer` ↔ `teamRunManager` | `peekRun(teamId)` subscription | New; lets the conversation row show a live badge without mounting the workspace. |
| `TeamWorkspaceView` ↔ `teamRunManager` | `getOrCreateRun` | Replaces the component-local registry. |
| `teamRunCoordinator` ↔ `chatTurnRuntime` | `ChatTurnRuntimeDeps` overrides (`runLoop`, `onUsage`, `onCompleted`, `beforeToolRound`) | Existing seam; unchanged. |
| `chatTurnRuntime` ↔ `aiOrchestratorLoop` | `executeToolFn` + `beforeToolRound` | Existing seam; unchanged. |
| `teamRunCoordinator` ↔ `aiTeamRepo` | repository calls | Add atomic `addUsedTokens`; add team-total bump in top-up. |
| `skill enrichment` ↔ `patchProposal` | `preparePatch`-style pure function + `ArtifactDiffApprovalCard` | New reuse of an extracted module. |
| `conventionsSegment` ↔ `AIChatDrawer` | direct import | Post-extraction path change only. |
| `DiffSyntaxHighlighter` ↔ `RemoteFileViewer` | direct import | Path change only. |
| Backup layer ↔ new table | `types/backup.ts`, `exportBackup.ts`, `restoreBackup.ts`, `validateBackup.ts`, `backupSchemas.ts`, `localSqlitePersistence.SQLITE_DOMAIN_TABLES` | All six must list `aiSkillVersions` or the table is silently excluded from backup and from the Tauri SQLite mirror. |

---

## 8. Data Flow Changes

**Send a request (unchanged shape, new gates):**

```
Explorer/Workspace  send(text)
  → teamRunManager.getOrCreateRun
  → coordinator.send
      → ensureMembers (hydrate budgets/usage)
      → BUDGET PRE-FLIGHT (new)  ──refuse──> structured message, no turn
      → saveTeamMessage(user)
      → mention? → startEmployeeTurn : startLeadTurn
          → build prompt (teamPrompts)
          → maxTokens = min(cfg, remaining)   (new)
          → ChatTurnRuntime.start
              → runAiOrchestratorLoop
                  → onUsage → handleUsage → atomic addUsedTokens + gate check
                  → beforeToolRound → gate.wait
                  → executeToolFn → delegate_batch → runBatch
                        → SEMAPHORE(limit) (new) → N agent runtimes
```

**Skill enrichment (new):**

```
agent turn ends → agent proposes lesson (tool or post-turn step)
  → aiSkillVersions row { status:'proposed', baseVersion, body }
  → UI diff card (extracted patchProposal + ArtifactDiffApprovalCard)
  → user approves → row.status='approved', aiSkills.body updated, version bumped
  → user rejects  → row.status='rejected' (kept for audit)
```

---

## 9. Anti-Patterns for This Milestone

| Anti-pattern | Why it breaks here | Instead |
|---|---|---|
| Adding a `ChatGroup` table wrapping `AiTeam` | Duplicates the group identity, orphans every existing `team:<id>` thread and `aiTeamMembers` row | `AiTeam` **is** the group (C-04) |
| Deleting `workflowSchemas.ts` / `wizardSchemas.ts` with the views | Breaks restore of every existing backup (envelope v11 validates those fields) | Move persisted sub-schemas to `src/types/legacySdlc.ts` |
| Destructive migration deleting `chatTabs.type='sdlc'` rows and `sdlc_workflow:*` settings | Loses user transcripts and workflow state irreversibly | Filter in UI; leave rows in place |
| Enforcing budget only at `beforeToolRound` | One long turn overshoots the "hard" cap | Pre-flight + `maxTokens` clamp + round gate |
| `get`→`update` for `usedTokens` | Lost updates under the 3-agent concurrency this milestone enables | Atomic `Collection.modify` in a transaction |
| Keeping `MAX_ACTIVE_TEAMS`/`MAX_EMPLOYEES_PER_TEAM` | Directly contradicts C-08/C-09 | Delete the enforcement |
| Rebuilding orchestration inside `runAiOrchestratorLoop` | Loses the `executeToolFn` interception seam and the per-agent runtime isolation | Keep policy in the coordinator |
| Renaming tab ids (`team_workspace:` → `chat_group:`) | Every persisted tab breaks on upgrade | Keep ids |

---

## 10. Suggested Build Order (dependency-respecting)

| Phase | Scope | Depends on | Why this order |
|---|---|---|---|
| **35.1 Extract shared primitives** | `conventionsSegment.ts`; `DiffSyntaxHighlighter` → `components/common/`; `patchProposal.ts` from `sdlcArtifactTools`; `teamRunManager.ts` from `TeamWorkspace`; move legacy schema modules to `types/legacySdlc.ts` | — | Pure moves + import rewrites. No behavior change, fully testable, unblocks every later deletion. |
| **35.2 Data layer** | Dexie V18 (`aiTeams` index, `aiTeamMembers` compound index, `aiSkillVersions`); backup/sqlite table lists; remove roster caps; atomic `addUsedTokens`; team-total top-up | 35.1 | Schema before features; backup coverage must land with the table or history is lost. |
| **35.3 Delete SDLC** | All §2 DELETE rows; `EditorViewType` prune; `LAYOUT_STORAGE_KEY` v3 + `partialize` view-type filter; remove 5 entry points; remove SDLC chat tab creation | 35.1, 35.2 | Deletion after extraction; layout bump must ship with the view-type removal in one commit. |
| **35.4 Explorer + navigation** | Two-section `AiOfficeExplorer`; drop `ai_staff` stripe item; bind Alt+7; conversation live badge via `peekRun` | 35.3 | Needs the final `EditorViewType` and the run manager. |
| **35.5 Orchestration hardening** | Concurrency semaphore + `concurrencyLimit`; decouple plan-size cap from `MAX_BATCH_SIZE`; leader free-style prompt review; error paths (no model config, missing lead, deleted member) | 35.4 | Needs the relocated coordinator and the uncapped roster. |
| **35.6 Hard budget** | Pre-flight refusal, `maxTokens` clamp, configurable warn ratio, input+output display, top-up UX | 35.5 | Gates must sit on top of the final dispatch path, otherwise they get bypassed by the concurrency rewrite. |
| **35.7 Skill enrichment** | `aiSkillVersions` repo, proposal flow, diff approval via `patchProposal` + generalized card, version history UI | 35.2, 35.6 | Needs the versions table and the budget-bounded turn path. |
| **35.8 UX/error sweep** | CRUD edge cases, empty states, i18n copy, a11y, dead-code removal | 35.7 | Last; sweeps the whole surface. |

Rationale for putting deletion (35.3) before orchestration (35.5): the SDLC views are the largest source of shared-import pressure. Removing them first shrinks the surface that 35.5–35.8 must reason about, and the extracted primitives already cover everything AI Office needs.

---

## 11. Open Items This Research Could Not Close

- Whether legacy `ChatMessage.wizard` rows should keep rendering (`DocumentPreviewCard` etc.) or be collapsed to a generic "legacy artifact" card. Recommendation: keep rendering, move to `legacy/`.
- Whether paused-run state must survive a reload (R-18). If yes, add `aiTeamRuns` in a later phase — do not pre-build it.
- Whether `AiOfficeView` (the `agents` tab with skills CRUD) survives as a tab or moves fully into the explorer. Skills CRUD currently exists only there.
- Exact default for `concurrencyLimit` (C-10/R-05) and whether it is per-team or global.
- Whether `AiTeam.leadId` + a `role='lead'` member row should be collapsed to one source of truth. Recommendation: keep both (backup schema requires `leadId`), document the invariant, and enforce it in `createTeam`/`addTeamMember`.

---

## Sources

- `src/db/schema.ts`, `src/db/index.ts` (V16/V17 stores, upgrade hooks)
- `src/workbench/store/layoutStore.ts`, `src/workbench/EditorArea.tsx`, `src/workbench/WorkbenchLayout.tsx`, `src/workbench/toolwindows/{LeftToolWindow,AiOfficeExplorer,AiStaffExplorer,CRExplorer,Stripe}.tsx`, `src/workbench/actions/actionRegistry.ts`, `src/workbench/hooks/useGlobalKeymap.ts`, `src/workbench/TitleBar.tsx`
- `src/services/ai/office/{teamRunCoordinator,teamRunRegistry,teamTools,teamPrompts,budgetGate}.ts`, `src/components/ai/office/TeamWorkspace.tsx`, `src/views/{TeamWorkspaceView,AiOfficeView,TeamsView,StaffDetailView}.tsx`
- `src/components/ai/runtime/chatTurnRuntime.ts`, `src/services/ai/aiOrchestratorLoop.ts`, `src/services/ai/aiTools.ts`, `src/services/ai/chatTurnTools.ts`
- `src/services/ai/sdlcPromptComposer.ts`, `src/services/ai/sdlcArtifactTools.ts`, `src/services/sdlc/groundingBuilder.ts`, `src/services/wizard/*`, `src/components/sdlc/**`, `src/components/ai/wizard/**`
- `src/db/repositories/{aiTeamRepo,aiOfficeRepo,teamTranscriptRepo,chatTabRepo,chatRepo,documentSetRepo}.ts`
- `src/validation/{backupSchemas,aiOfficeSchemas,schemas,knowledgeSchemas}.ts`, `src/types/{models,aiOffice,backup}.ts`
- `src/services/backup/{exportBackup,restoreBackup,validateBackup}.ts`, `src/services/localSqlitePersistence.ts`
- `.planning/PROJECT.md`, `.planning/MILESTONE-CONTEXT.md` (git HEAD), `.planning/ROADMAP.md`

---
*Architecture research for: Unified AI Office (v1.4)*
*Researched: 2026-11-09*
