# Phase 35: Shared-primitive extraction + SDLC behavior removal - Research

**Researched:** 2026-11-09
**Domain:** Large-feature deletion inside an offline-first Dexie + React + Tauri app; shared-primitive extraction
**Confidence:** HIGH on the tree map (every claim below is a grep/read of the live source); MEDIUM on the rescoped artifact-tool shape (no code exists yet for `{noteId}|{skillId}`)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Governing principle — C-16:** *The app has never run in production. Every row in Dexie, SQLite, and backup is test data. There is no data-preservation requirement.* Delete SDLC data, schemas, types, backup fields, and migration paths along with the feature. Keep only code whose **functionality** AI Office reuses. Any decision to "keep X so an old backup still imports" or "keep a schema so rows aren't lost" is wrong for this milestone.

**KEEP — 6 reusable functional assets:**

| # | Asset | Function AI Office reuses |
|---|---|---|
| 1 | `buildConventionsSegment` → `src/services/ai/conventionsSegment.ts` | Injects org + repo conventions into any prompt. Live consumer: `AIChatDrawer.tsx:51`. |
| 2 | `DiffSyntaxHighlighter` → `src/components/common/` | Renders a diff. Live consumer: `RemoteFileViewer.tsx:17`. |
| 3 | Patch core (`locateSection`, `applyOperation`, `detectEol`, diff wiring) → `src/services/ai/patchProposal.ts` | "Replace section X with this text → produce a diff". Phase 39 reuses it for skill versions. |
| 4 | `ArtifactDiffApprovalCard` → generalized `PatchDiffApprovalCard` | Diff + approve/reject UI. Live consumer: `AiChatWidget.tsx:491`. Phase 39 reuses it. |
| 5 | `get_artifact` + `patch_artifact_section` tools | Read a document / patch a section — rescoped from CR+step to `{ noteId }` or `{ skillId }`. |
| 6 | `createUnifiedLineDiff` (`src/utils/lineDiff.ts:110`), `buildSectionIndex`/`splitLines` (`src/utils/markdownSections.ts`) | Already-generic utilities; no change needed, just keep. |

**DELETE — everything else, including all four schema modules:**

| Asset | Why it goes |
|---|---|
| `src/components/sdlc/**` (26 files), `src/components/ai/wizard/**` (20 files), `src/services/wizard/**` (21 files) | SDLC behavior. |
| `src/views/ChangeRequestSdlcView.tsx` + 5 launch points | SDLC entry points. |
| `src/services/sdlc/groundingBuilder.ts` | SDLC-only; no other consumer. |
| `src/services/changePackPackager.ts`, `src/services/export/wizardDocx.ts`, `src/services/export/pl03bDocx.ts` | SDLC-only consumers. |
| `propose_subsystems`, `propose_research` tools | CR/SDLC-specific. |
| `DocumentPreviewCard`, `SolutionReviewCard`, `GapFillQuestionCard` | Bound to SDLC payloads; not reusable. |
| `InterruptedBanner` | Only message is SDLC-specific; `AIChatDrawer` gets a plain-text equivalent if needed. |
| `ArtifactEventCard` | Typed on `SdlcArtifactKind`; no non-SDLC consumer. |
| `Note.sdlcArtifact` (type, `backupSchemas.ts:154`, `validateBackup.ts:513-540`) | SDLC metadata. |
| `ChatMessage.wizard` (type, `chatRepo.ts:135-137`, `backupSchemas.ts:327`, `validateBackup.ts:480-504`, `ChatMessageBubble.tsx:392-460`) | SDLC history payload. |
| `ChatTab.workflowState` (`backupSchemas.ts:253`) | SDLC workflow state. |
| `ChatTabType = 'chat' \| 'sdlc'` → `'chat'` only (`models.ts:235`, `ChatTabBar.tsx:28`, `backupSchemas.ts:241`) | Narrowed. |
| `DocumentSet.sdlc` (`models.ts:377`, `validation/schemas.ts:428/444`, `knowledgeSchemas.ts:123`, `documentSetRepo.ts:61/80/151/233`, `backupSchemas.ts:447`, `validateBackup.ts:546-565`) | SDLC document-set binding. |
| `src/services/wizard/workflowSchemas.ts` | Every consumer is being deleted or is itself SDLC metadata. |
| `src/services/ai/wizardSchemas.ts` | Same. |
| `src/services/wizard/changePack.ts`, `reconciliation.ts` | Only consumers are SDLC exporters being deleted. |

**No `types/legacySdlc.ts` shim.** C-16 forbids keeping schemas for old-backup compatibility. If a type is still referenced after the deletions above, that reference is a missed deletion — fix the reference, do not resurrect the schema.

**Artifact tools — rescope, don't rebuild**
- **D-01:** Keep `get_artifact` and `patch_artifact_section`. Delete `propose_subsystems` and `propose_research`.
- **D-02:** Extract the patch core into `src/services/ai/patchProposal.ts` — Phase 39 reuses it; it must not be rebuilt.
- **D-03:** Rescope both tools from `{ changeRequestId, stepId }` to `{ noteId }` or `{ skillId }`. No CR, no SDLC step (C-06/C-07).
- **D-04:** `ArtifactDiffApprovalCard` becomes `PatchDiffApprovalCard` — the approval surface for any patch, including skill versions in Phase 39.

**SDLC persisted data — delete**
- **D-05:** Delete SDLC rows: `chatTabs` with `type='sdlc'`, `chatThreads` whose `scopeKey` ends `:sdlc`, `settings` keys matching `sdlc_workflow:*`. No archival, no filter-only approach.
- **D-06:** Narrow the backup tab-type enum to `z.enum(['chat'])`. A legacy backup containing an `sdlc` tab is rejected — acceptable under C-16.
- **D-07:** `restoreBackup` stops creating SDLC tabs and threads. The generator at `restoreBackup.ts:80-140` is removed, not bypassed.

**SDLC history cards — delete**
- **D-08:** Delete `DocumentPreviewCard`, `SolutionReviewCard`, `GapFillQuestionCard`, and the `ChatMessage.wizard` render branch in `ChatMessageBubble.tsx:392-460`. None is reusable.

**Note artifact metadata — delete**
- **D-09:** Remove `Note.sdlcArtifact` entirely — type, `backupSchemas.ts:154`, `validateBackup.ts:513-540`.

**Confirmed by research (carried forward, not re-decided)**
- **D-10:** `buildConventionsSegment` → `src/services/ai/conventionsSegment.ts` — `AIChatDrawer.tsx:51` is a live consumer.
- **D-11:** `DiffSyntaxHighlighter` → `src/components/common/` — `RemoteFileViewer.tsx:17` is a live consumer.
- **D-12:** ~~Coordinator registry → `teamRunManager.ts`~~ — **removed from Phase 35.** `TeamWorkspace.tsx` contains zero SDLC code (verified by grep); relocating its registry is an AI Office improvement belonging to Phase 37 or 40, not a deletion phase.

### Claude's Discretion
- Exact file split inside `patchProposal.ts`.
- Whether `SafeMarkdown` is deleted or relocated — verify by grep during execution.
- Deletion ordering within the phase, provided extraction lands first.
- Whether `LAYOUT_STORAGE_KEY` bumps to `_v3` or `partialize` gains a view-type filter — both satisfy AIO-REMOVE-04.
- Whether `InterruptedBanner` is replaced by a plain-text notice or dropped entirely.

### Deferred Ideas (OUT OF SCOPE)
- Multi-chat thread identity, budget scope, and the `aiSkillVersions` table — Phase 36.
- Skill enrichment UI and version restore — Phase 39.
- Explorer two-section redesign and the single AI Office trigger — Phase 40.
- Peer-to-peer agent chat — explicitly out of scope for the milestone (R-10).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AIO-REMOVE-01 | Shared primitives extracted *before* any SDLC file is deleted (`conventionsSegment.ts`, `components/common/DiffSyntaxHighlighter.tsx`, `patchProposal.ts`, coordinator registry → `teamRunManager.ts`) | Assets 1–4 verified below. **The `teamRunManager.ts` half of this requirement is stale — D-12 removed it. `src/services/ai/office/teamRunRegistry.ts` already exists and is the AI Office registry; `TeamWorkspace.tsx` has zero SDLC references (grep: 0 hits).** |
| AIO-REMOVE-02 | Every SDLC behavior entry point gone; `grep -rn "sdlc\|Sdlc" src` returns only legacy-schema and migration hits; no stubs, no `as any` | Full delete inventory + cross-boundary import map below. Under C-16 the "legacy-schema hits" clause is itself stale: schema modules are deleted, so the acceptable residual set is enumerated in §11. |
| AIO-REMOVE-03 | "Four persisted schema modules survive as type-only legacy (`types/legacySdlc.ts`)… `changePack.ts` and `reconciliation.ts` kept" | **STALE — overridden by C-16.** All four schema modules and both wizard modules are deleted. Only the ordinary-chat / knowledge-publish / backup round-trip clause survives as acceptance. |
| AIO-REMOVE-04 | Persisted `viewType:'sdlc'` layout tab dropped on launch, `activeTabId` re-points; `LAYOUT_STORAGE_KEY` bumped and `partialize` filters unknown view types | `layoutStore.ts:106` (key), `:347` (partialize), `EditorArea.tsx:89,615,687` verified. Two viable mechanisms documented in §5. |
| AIO-REMOVE-05 | `restoreBackup` no longer *creates* SDLC tabs; `validateBackup` no longer enforces SDLC invariants | `restoreBackup.ts:67-173,257-262,297-307`; `validateBackup.ts:392-467,469-509,511-543,545-567` verified line-by-line. |
</phase_requirements>

## 1. Executive Summary

### What the live tree shows

The delete set is real and matches CONTEXT.md's counts exactly: `src/components/sdlc` = **26 files**, `src/components/ai/wizard` = **20 files**, `src/services/wizard` = **21 files**, `src/services/sdlc` = **1 file**, `src/views/ChangeRequestSdlcView.tsx` = 1147 lines. `src/services/export` holds 7 files, of which **3 are SDLC-only** (`wizardDocx.ts`, `pl03bDocx.ts`, and — indirectly — the docx builders they are the only consumers of).

The extraction targets exist at the paths CONTEXT.md names, with the named live consumers intact:
- `buildConventionsSegment` at `src/services/ai/sdlcPromptComposer.ts:337-374`, imported by `src/components/ai/AIChatDrawer.tsx:51`, called at `:1889`.
- `DiffLineCodeRenderer` (the actual export name — **not** `DiffSyntaxHighlighter`) at `src/components/sdlc/diff/DiffSyntaxHighlighter.tsx:106-130`, imported by `src/workbench/editor/RemoteFileViewer.tsx:17`.
- Patch core (`locateSection` :376, `detectEol` :402, `applyOperation` :408, `prepareArtifactPatch` :439) in `src/services/ai/sdlcArtifactTools.ts`, imported by `src/services/ai/aiTools.ts:74` and `src/components/ai/runtime/chatTurnRuntime.ts:13-19`.
- `ArtifactDiffApprovalCard` at `src/components/ai/widget/ArtifactDiffApprovalCard.tsx`, imported by `src/components/ai/AiChatWidget.tsx:15`, rendered at `:491`.
- `createUnifiedLineDiff` at `src/utils/lineDiff.ts:110`; `buildSectionIndex`/`splitLines` at `src/utils/markdownSections.ts:26,30`. Both already generic; both already imported only by `sdlcArtifactTools.ts` (and their own tests).

### Conflicts that must be reported, not silently planned

| # | Source | Claim | Live-tree reality | Resolution |
|---|---|---|---|---|
| **C1** | `.planning/ROADMAP.md` Phase 35 success criterion 1 | "`conventionsSegment.ts`, `components/common/DiffSyntaxHighlighter.tsx`, `patchProposal.ts`, **`types/legacySdlc.ts`**, and **`teamRunManager.ts`** exist" | `src/types/legacySdlc.ts` does **not** exist and must **not** be created (C-16). `src/services/ai/office/teamRunManager.ts` does **not** exist; `src/services/ai/office/teamRunRegistry.ts` **does**, and `TeamWorkspace.tsx` has **0** SDLC references (`grep -ci sdlc` = 0). | ROADMAP criterion 1 is stale on two of five items. Planner must plan 3 artifacts, not 5. Report to user; do not create `legacySdlc.ts` or `teamRunManager.ts`. |
| **C2** | `.planning/REQUIREMENTS.md` AIO-REMOVE-03 | "Four persisted schema modules survive as type-only legacy (`types/legacySdlc.ts`) because backup envelope v11 validates them; `wizard/changePack.ts` and `reconciliation.ts` are kept for the same reason." | C-16 forbids exactly this. CONTEXT.md's DELETE table lists all four schema modules plus `changePack.ts` and `reconciliation.ts`. | AIO-REMOVE-03's first clause is void. Only its last clause ("Ordinary chat, knowledge publish, and backup round-trip still pass after deletion") is acceptance. |
| **C3** | `.planning/REQUIREMENTS.md` AIO-REMOVE-02 | "`grep -rn "sdlc\|Sdlc" src` returns only legacy-schema and migration hits" | Under C-16 there are **no** legacy-schema hits left. The residual set is a specific, enumerable list (§11) of migration history, historical Dexie upgrade hooks, and neutral identifier names. | Restate acceptance as "matches the enumerated residual list in §11 exactly", not "only legacy-schema hits". |
| **C4** | `.planning/research/ARCHITECTURE.md:92-103,282` | "KEEP as type-only legacy"; "Do not delete `settings['sdlc_workflow:*']` rows"; "Do not delete `chatTabs.type='sdlc'` rows" | Overridden by C-16 (D-05). | Delete rows. ARCHITECTURE's §2.4 verdict table is void for this phase. |
| **C5** | `.planning/research/PITFALLS.md:67-73` | "Add a Dexie migration (new `version(18)`) that deletes SDLC tabs/threads/settings; **keeps** `notes` rows that carry `sdlcArtifact`" | C-16 + D-09 delete `Note.sdlcArtifact` outright. Also, Phase 36's ROADMAP criterion 1 reserves `V18` for `aiSkillVersions`. | Phase 35 must take **V18** for the SDLC purge; Phase 36's `aiSkillVersions` becomes V19. This is a real sequencing conflict the planner must resolve explicitly (see §9, L4). |
| **C6** | `.planning/research/SUMMARY.md` "Conflicts" item 1 | "defer the decision to Phase 36 and default to ARCHITECTURE's non-destructive stance" | C-16 + D-05 resolved it: destructive. | Void. |
| **C7** | CONTEXT.md KEEP #2 name | "`DiffSyntaxHighlighter`" | The file is `DiffSyntaxHighlighter.tsx` but its exported component is `DiffLineCodeRenderer`; there is no `DiffSyntaxHighlighter` export. | Planner must move the file and update the one import to the new path, keeping the export name `DiffLineCodeRenderer` (renaming it is optional churn). |
| **C8** | CONTEXT.md KEEP #3 | "Patch core (`locateSection`, `applyOperation`, `detectEol`, diff wiring)" | Those three are **module-private** (`function`, not `export function`) in `sdlcArtifactTools.ts:376,402,408`. Only `prepareArtifactPatch` (:439), `readArtifactSnapshot` (:312), `validateArtifactToolAccess` (:300), `executeSdlcArtifactTool` (:549) are exported. | Extraction must **export** the core functions from `patchProposal.ts` (they are currently unreachable for reuse). |
| **C9** | CONTEXT.md KEEP #4 consumer | "`AiChatWidget.tsx:491`" | Correct. But the same card is also the only renderer for `turn.pendingApproval.patch`, which is produced by `chatTurnRuntime.ts:385-402`; and `ArtifactDiffApprovalCard.tsx:4` imports `ArtifactPatchProposal` **from `sdlcArtifactTools`**. | Renaming the card requires moving `ArtifactPatchProposal` into `patchProposal.ts` first, or the renamed card still imports the deleted module. |
| **C10** | CONTEXT.md `code_context` "Deletion order" step 3 | "Remove SDLC metadata fields from types and Dexie schema" | `ChatTab.workflowState` is typed as `Record<string, unknown>` (`models.ts:267`), **not** `SdlcWorkflowState`. Only `backupSchemas.ts:253` types it as the SDLC schema. | Removing it from `models.ts` is a one-line delete; the real work is `backupSchemas.ts:253` + `exportBackup.ts:158` + `restoreBackup.ts:257-262,297-307` + `validateBackup.ts:420-465`. |
| **C11** | CONTEXT.md `code_context` "Integration Points" | "five SDLC launch points live in TitleBar, CRExplorer, ChangeRequestsView, SystemDetailView, ChangeRequestDetailView" | Verified — but there is a **sixth** indirect launch path: `ChangeRequestTable.tsx:47,99,144-149,412-420` exposes `onOpenSdlcStudio` and `ChangeRequestsView.tsx:195-202` wires it. Deleting `ChangeRequestsView`'s callback leaves the table prop dead. | Delete the table's `onOpenSdlcStudio` prop, its `sdlc-studio` dropdown item, and its inline `SDLC` button together with the view's wiring. |
| **C12** | CONTEXT.md DELETE table | Lists `src/services/export/wizardDocx.ts` and `pl03bDocx.ts` | `wizardDocx.ts` is the **only** consumer of `pl02Docx.ts`, `cabDocx.ts`, `pl07Docx.ts`, `pl07Baseline.ts`, and `pl03bDocx.ts` (grep: no other `src/` importer). `docxShared.ts` is used by all of them. | After deleting `wizardDocx.ts` the whole `src/services/export/` directory becomes dead except `docxShared.ts` (also dead). **The entire directory is deletable** — 7 files. `docx` npm dependency remains needed by `src/utils/dynamicFileSandbox.ts:10`. |
| **C13** | CONTEXT.md DELETE table | Does not mention `src/services/ai/researchService.ts`, `wizardService.ts`, `wizardPrompts.ts`, `src/utils/sdlcSolutionParser.ts` | All four become fully orphaned once the delete set is gone (verified: their only `src/` importers are inside the delete set). | Add to the delete set. `researchService` is 615 lines, `wizardService` 482, `wizardPrompts` 209, `sdlcSolutionParser` 57. |
| **C14** | CONTEXT.md DELETE table | Does not mention `src/services/changePackPackager.ts`'s test or `src/components/ai/artifacts/ArtifactEventCard.tsx`'s backup absence | `ArtifactEventCard` is **not** in `backupSchemas.ts` (grep `artifactEvent` in `src/validation` = 0 hits) — so `ChatMessage.artifactEvent` is not a persisted-backup field. It is only used by `ChangeRequestSdlcView.tsx` and `StepChatPanel.tsx` (both deleted) plus `AiChatWidget`'s prop. | `ChatArtifactEvent` (`models.ts:293-302`) and `ChatMessage.artifactEvent` (`:316`) are deletable alongside the card — they are SDLC-only in practice, and no backup schema references them. CONTEXT.md does not list them; planner should decide explicitly (recommended: delete). |
| **C15** | CONTEXT.md `code_context` | "`EditorArea` renders by `switch (tab.viewType)` with a `default:` branch" | Correct: `EditorArea.tsx:687-688` → `return <TasksView {...dbProp} />`. This is exactly the AIO-REMOVE-04 hazard: a persisted `sdlc` tab silently becomes Tasks. | The `partialize` filter (or key bump) must drop the tab **and** re-point `activeTabId`, not rely on `default:`. |

### Primary recommendation

Extract in this order — `patchProposal.ts` (with `ArtifactPatchProposal` moved in), `conventionsSegment.ts`, `components/common/DiffSyntaxHighlighter.tsx`, `PatchDiffApprovalCard.tsx` — then rescope the two artifact tools to `{noteId}|{skillId}`, then delete leaves-first (tests → components → services → views → launch points → persisted surface). Never delete a file before its last importer is rewritten; the §4 table is the ordering authority.

---

## 2. KEEP Assets — Verified

### Asset 1 — `buildConventionsSegment`

| Property | Verified value |
|---|---|
| Current path | `src/services/ai/sdlcPromptComposer.ts` (614 lines total) |
| Exact line range | `:323-374` — `CONVENTIONS_CONFLICT_POLICY` (:323-328), `RepoConventionItem` (:330-335), `buildConventionsSegment` (:337-374) |
| Exported symbols | `CONVENTIONS_CONFLICT_POLICY: string[]`, `interface RepoConventionItem { systemCode; systemName?; repoPath?; content }`, `buildConventionsSegment(conventions?: { global?; repo?; repoPath?; repos?: RepoConventionItem[] }): string` |
| Importers (file:line) | `src/components/ai/AIChatDrawer.tsx:51` (value import) — **only** `src/` importer. Tests: `tests/ai/sdlcConventionsExemplar.test.ts:4-6`, `tests/ai/sdlcPromptComposer.test.ts:15-18`, `tests/services/multiSystemConventionService.test.ts:8-9`, `tests/views/ChangeRequestSdlcViewMultiSystem.test.tsx:9` |
| Live call site | `AIChatDrawer.tsx:1889` — `buildConventionsSegment({ global: globalConv, repos: repoConvs.map(...) })` |
| Also SDLC-only in the same file | **Yes, almost the entire file.** `SHARED_EVIDENCE_POLICY` (:11-20), `SDLCS_STEP_CONTRACTS` (:23-58), `SDLC_READ_TOOL_NAMES` (:60-62), `SDLC_STEP_ALLOWED_TOOLS` (:73-80), `normalizeDynamicToolNames` (:83-85), `buildToolPolicy` (:97-149), `SDLC_PATCH_TOOL_POLICY` (:152-160), `SDLC_STEP_TOOL_POLICY` (:162-169), `SDLC_ARTIFACT_CONTRACTS` (:174-198), `SDLC_FEW_SHOT_EXAMPLES` (:201-277), `STEP_LABELS` (:280-287), `STEP_QUICK_PROMPTS` (:290-321), `buildExternalResearchSegment` (:400-435), `SUBSYSTEM_UNAFFECTED_MARKER` (:438), `buildSubsystemSectionContract` (:452-463), `composeSdlcTurn` (:564-614), `SDLC_PATCH_FEW_SHOTS` (:520-541) |
| **Verdict** | **SPLIT, then delete the rest.** Move `CONVENTIONS_CONFLICT_POLICY` + `RepoConventionItem` + `buildConventionsSegment` (:323-374) to new `src/services/ai/conventionsSegment.ts`. Delete `sdlcPromptComposer.ts` entirely. |
| Extraction hazard | `sdlcPromptComposer.ts:1-3` imports `SdlcStepId` from `../wizard/workflowSchemas`, `normalizeToolName` from `./aiTools`, and `ResearchPayload` from `./researchService`. The moved block (:323-374) uses **none** of the three — it is dependency-free. Clean split, no cycle. |
| Test impact | `tests/ai/sdlcConventionsExemplar.test.ts` and `tests/services/multiSystemConventionService.test.ts` test `buildConventionsSegment` **only** — rewrite their import to the new module and keep them. `tests/ai/sdlcPromptComposer.test.ts`, `tests/services/ai/sdlcPromptComposer.test.ts`, `tests/ai/sdlcPromptIsolation.test.ts` test `composeSdlcTurn` — delete. |

### Asset 2 — `DiffSyntaxHighlighter`

| Property | Verified value |
|---|---|
| Current path | `src/components/sdlc/diff/DiffSyntaxHighlighter.tsx` (130 lines) |
| Exported symbols | `interface TokenSpan`, `tokenizeCodeLine(line: string): TokenSpan[]` (:26), `getGithubThemeColors(isDark: boolean)` (:84), `const DiffLineCodeRenderer: React.FC<{content; isDark}>` (:106) |
| Importers (file:line) | `src/workbench/editor/RemoteFileViewer.tsx:17` — `import { DiffLineCodeRenderer } from '../../components/sdlc/diff/DiffSyntaxHighlighter'` — **only** `src/` importer |
| Internal deps | `react` only. Zero SDLC coupling. |
| **Verdict** | **MOVE WHOLESALE** to `src/components/common/DiffSyntaxHighlighter.tsx`; update the single import at `RemoteFileViewer.tsx:17` to `'../../components/common/DiffSyntaxHighlighter'`. |
| Naming note | The file name says "DiffSyntaxHighlighter" but the component is `DiffLineCodeRenderer`. CONTEXT.md uses the file name. Keep both as-is; only the path changes. |
| Test impact | `src/workbench/__tests__/RemoteFileViewer.test.tsx` has 1 `sdlc` hit (the import path is not asserted; verify). No test imports `DiffSyntaxHighlighter` directly. |

### Asset 3 — Patch core

| Property | Verified value |
|---|---|
| Current path | `src/services/ai/sdlcArtifactTools.ts` (677 lines) |
| **Reusable core (move)** | `interface SectionSlice` (:368-374, private), `locateSection` (:376-396, **private**), `detectEol` (:402-406, **private**), `applyOperation` (:408-431, **private**), `countLogicalLines` (:433-437, **private**), `prepareArtifactPatch` (:439-546, exported), `PATCH_LINE_CAP` (:25), `MAX_DIFF_CELLS` re-export (:26), `patchArgsSchema` (:175-182, private), `ArtifactPatchArgs` (:184), `ArtifactPatchProposal` (:73-88), `ArtifactToolRefusal` (:47-61), `ArtifactToolRefusalCode` (:28-45), `refuse` (:163), `isRefusal` (:167) |
| **SDLC-only (delete)** | `ARTIFACT_TOOL_KINDS` (:21), `ArtifactToolKind` (:22), `ArtifactToolSnapshot` (:63-71), `SubsystemProposalItem` (:91-97), `SubsystemProposalResult` (:100-103), `ResearchProposalQuestion` (:106-110), `ResearchProposalResult` (:113-120), `ArtifactToolAccess` (:129-133), `ArtifactToolContext` (:139-147), `ARTIFACT_KEY` (:149-154), `KIND_LABEL` (:156-161), `kindSchema` (:171), `getArtifactArgsSchema` (:173), `GetArtifactArgs` (:185), `KIND_OWNING_STEP` (:188-193), `PrerequisiteGuard` (:195-198), `KIND_PREREQUISITES` (:201-218), `stepOwnershipRefusal` (:220-228), `prerequisiteRefusal` (:231-240), `accessRefusal` (:242-257), `loadWorkflowState` (:259-293), `committedArtifact` (:295-297), `validateArtifactToolAccess` (:300-310), `readArtifactSnapshot` (:312-366), `executeSdlcArtifactTool` (:549-575), `proposalArgsSchema` (:577-584), `proposeSubsystems` (:590-616), `researchArgsSchema` (:618-624), `proposeResearch` (:631-677) |
| Importers (file:line) | `src/services/ai/aiTools.ts:74` (`executeSdlcArtifactTool`, `ArtifactToolContext`), `src/components/ai/runtime/chatTurnRuntime.ts:13-19` (`executeSdlcArtifactTool`, `prepareArtifactPatch`, `ArtifactPatchProposal`, `ArtifactToolContext`, `ArtifactToolRefusal`, `ArtifactToolResult`), `src/services/ai/aiOrchestratorLoop.ts:14` (`ArtifactToolContext` type-only), `src/components/ai/widget/ArtifactDiffApprovalCard.tsx:4` (`ArtifactPatchProposal` type-only). SDLC-side importers (all deleted): `SdlcWorkspace.tsx:9`, `StepChatPanel.tsx:25`, `SubsystemProposalCard.tsx:6`, `ChangeRequestSdlcView.tsx:43`. |
| **Verdict** | **SPLIT.** New `src/services/ai/patchProposal.ts` holds the generic core + `ArtifactPatchProposal` + refusals. `sdlcArtifactTools.ts` is deleted. |
| Extraction hazard 1 | `ArtifactPatchProposal` currently carries `scopeKey`, `changeRequestId`, `crId` — all CR-scoped. Rescoping to `{noteId}|{skillId}` means these three fields change meaning. Phase 39 depends on this shape (D-02/D-03). **Recommend:** `{ proposalId, target: { kind: 'note'|'skill'; id: string }, sectionId, sectionTitle, baseHash, baseMarkdown, diffText, addedLines, removedLines, patchedMarkdown }`. |
| Extraction hazard 2 | `prepareArtifactPatch` signature is `(db, context: ArtifactToolContext, rawArgs)`. `db` is used **only** by `readArtifactSnapshot` → `loadWorkflowState` → `db.settings`/`db.chatTabs`. Once rescoped to `{noteId}|{skillId}` the read becomes `db.notes.get(id)` / `db.aiSkills.get(id)` and the whole `db.settings` + `chatTabs` lookup disappears. **The extracted `preparePatch` should take `(db, target, rawArgs)` and no `ArtifactToolContext`.** |
| Extraction hazard 3 | `refuse()` emits `supplyingStep`/`stepNumber`/`missingArtifact` (`:57-60`) — all `SdlcStepId`-typed. Drop those fields; keep `code`, `message`, `sectionIndex`, `addedLines`, `removedLines`, `cap`, `sectionId`. |
| Extraction hazard 4 | `ArtifactToolRefusalCode` (:28-45) includes `WorkflowGuardCode` (`:45`) — a union of SDLC guard codes. Drop that member. |
| Extraction hazard 5 | `detectEol` uses a lookbehind regex `/(?<!\r)\n/g` (:404). Fine on Node 24 / modern Chromium; already shipped. |
| Extraction hazard 6 | `crypto.randomUUID()` at `:531` — native, already used app-wide. |

### Asset 4 — `ArtifactDiffApprovalCard` → `PatchDiffApprovalCard`

| Property | Verified value |
|---|---|
| Current path | `src/components/ai/widget/ArtifactDiffApprovalCard.tsx` (85 lines) |
| Exported symbols | `interface ArtifactDiffApprovalCardProps` (:6-14), `isDarkBase(colorBgBase?: string): boolean` (:17-24), `const ArtifactDiffApprovalCard: React.FC<...>` (:26-85) |
| Importers (file:line) | `src/components/ai/AiChatWidget.tsx:15` (import), `:491` (render) — **only** `src/` importer. Tests: `tests/ai/ArtifactDiffApprovalCard.test.tsx:6` (`isDarkBase`), `:5` (`prepareArtifactPatch`, `ArtifactPatchProposal` from `sdlcArtifactTools`) |
| SDLC coupling | Exactly one line: `:4` `import type { ArtifactPatchProposal } from '../../../services/ai/sdlcArtifactTools'`. Everything else is antd + the patch shape. |
| **Verdict** | **MOVE + RENAME.** New path `src/components/ai/widget/PatchDiffApprovalCard.tsx`; rename the component and prop interface; change `:4` to import `ArtifactPatchProposal` from `src/services/ai/patchProposal`. Update `AiChatWidget.tsx:15,491`. |
| Rename surface | `AiChatWidget.tsx` also uses `artifactApprovalState` / `artifactDecision` props (`:81-82`, `:489-490`) and `turn.pendingApproval.patch` (`chatTurnRuntime.ts:49`). Renaming only the card leaves those names intact — acceptable (cosmetic). |
| Test impact | `tests/ai/ArtifactDiffApprovalCard.test.tsx` must be rewritten: import `isDarkBase` from the new path, and build the proposal via the new `patchProposal` API instead of `prepareArtifactPatch` + `createSdlcWorkflowCoordinator`. |

### Asset 5 — `get_artifact` + `patch_artifact_section` (rescope)

| Property | Verified value |
|---|---|
| Tool definitions | `src/services/ai/aiTools.ts:1864-1922` — `get_artifact` (:1867-1882), `patch_artifact_section` (:1883-1922) |
| Dispatch | `src/services/ai/aiTools.ts:2203-2209` — one shared `case` block for all four tools |
| Mutation registration | `src/services/ai/aiTools.ts:4802` — `'patch_artifact_section'` in `MUTATION_TOOLS` |
| Payload gating | `src/services/ai/chatTurnTools.ts:66` — `['get_artifact','patch_artifact_section','propose_subsystems','propose_research']` excluded from ordinary chat unless an explicit allowlist is passed |
| Runtime branch | `src/components/ai/runtime/chatTurnRuntime.ts:158` (`PATCH_TOOL_NAME`), `:380-412` (pre-patch approval branch) |
| Context plumbing | `aiTools.ts:2129-2137` (`ExecuteAiToolOptions.artifactContext`), `aiOrchestratorLoop.ts:14-18,35,43,415`, `chatTurnRuntime.ts:74-75,104-105,141,311,320,385-387` |
| **Verdict** | **RESCOPE.** See §6 for the exact touch list. |

### Asset 6 — `createUnifiedLineDiff`, `buildSectionIndex`, `splitLines`

| Property | Verified value |
|---|---|
| `src/utils/lineDiff.ts` | `MAX_DIFF_CELLS` (:8), `UnifiedLineDiff` (:10-15), `DiffBudgetRefusal` (:16-22), `LineDiffOptions` (:24-29), `createUnifiedLineDiff(from, to, options?): UnifiedLineDiff \| DiffBudgetRefusal` (:110) |
| `src/utils/markdownSections.ts` | `ArtifactSection` (:8-24), `splitLines(markdown): string[]` (:26), `buildSectionIndex(markdown): ArtifactSection[]` (:30) — 81 lines total |
| Importers | `sdlcArtifactTools.ts:12,13-18` only (plus `tests/utils/lineDiff.test.ts:2`, `tests/services/sdlc/markdownSections.test.ts:2`) |
| SDLC coupling | **Comment-only.** `lineDiff.ts:2` mentions "SDLC-ART-02, D-09"; `markdownSections.ts:2` mentions "SDLC artifact Markdown (D-05)". No code coupling. |
| **Verdict** | **KEEP AS-IS.** Do not move, do not rename. Optionally reword the two header comments (cosmetic; not required by any acceptance criterion). |
| Note | `ArtifactSection` is a generic name in a generic util — fine. `sdlcArtifactTools.ts:26` re-exports `MAX_DIFF_CELLS`; that re-export dies with the file, and `patchProposal.ts` should re-export it if Phase 39 needs it (nothing else imports it through `sdlcArtifactTools`). |

---

## 3. DELETE Inventory — Verified

### 3.1 Whole directories (files counted on disk)

| Path | Files | Notes |
|---|---|---|
| `src/components/sdlc/**` | **26** | 20 source + 6 tests (`__tests__/SdlcSidebar.test.tsx`, `steps/__tests__/Step3BranchResolution.test.tsx`, `Step3CodeGuideView.test.tsx`, `Step4ChangePackView.test.tsx`) |
| `src/components/ai/wizard/**` | **20** | 15 source + 5 tests (`documentWizard`, `hubExportRow`, `sdlcWorkflowHub`, `stepInputDocsModal`, `wizardInterviewPack`) |
| `src/services/wizard/**` | **21** | 16 source + 5 tests (`artifactRepo`, `hubCrSummary`, `stalenessDetector`, `workflowCoordinator`, `workflowGuards`) |
| `src/services/sdlc/**` | **1** | `groundingBuilder.ts` |
| `src/services/export/**` | **7** | All dead after `wizardDocx.ts` goes (see C12). `cabDocx.ts`, `docxShared.ts`, `pl02Docx.ts`, `pl03bDocx.ts`, `pl07Baseline.ts`, `pl07Docx.ts`, `wizardDocx.ts` |

### 3.2 Individual files

| Path | Lines | Reason |
|---|---|---|
| `src/views/ChangeRequestSdlcView.tsx` | 1147 | The SDLC view |
| `src/services/ai/sdlcArtifactTools.ts` | 677 | Split → `patchProposal.ts`, then delete |
| `src/services/ai/sdlcPromptComposer.ts` | 614 | Split → `conventionsSegment.ts`, then delete |
| `src/services/ai/wizardSchemas.ts` | 240 | Schema module #1 |
| `src/services/ai/wizardService.ts` | 482 | Orphaned (C13) |
| `src/services/ai/wizardPrompts.ts` | 209 | Orphaned (C13) |
| `src/services/ai/researchService.ts` | 615 | Orphaned (C13) — **note:** `escapeShellArg` is re-exported here (`:89`) but the canonical definition is `gitRemoteService.ts:16`; nothing imports it *through* `researchService` except `researchService.test.ts` |
| `src/services/changePackPackager.ts` | — | SDLC-only |
| `src/utils/sdlcSolutionParser.ts` | 57 | Orphaned (C13) |
| `src/components/ai/InterruptedBanner.tsx` | 41 | SDLC-only message; consumer `AIChatDrawer.tsx:103,2562,2580` |
| `src/components/ai/artifacts/ArtifactEventCard.tsx` | 77 | Typed on `SdlcArtifactKind` |
| `src/components/ai/RestoredSourceNotice.tsx` | 23 | Only consumer is `AIChatDrawer.tsx:65,2451`, fed by `deriveMissingSources` (SDLC workflow state) |
| `src/components/ai/wizard/restoreRecovery.ts` | 30 | Inside `ai/wizard/**` — already counted |
| `src/components/icons/JetBrainsIcons.tsx` — `JetBrainsSdlcIcon` block `:401-432` | 32 | Only used by `TitleBar.tsx:17,258` and `EditorArea.tsx:43,90` (both losing their `sdlc` branch). Delete the export + its test case (`src/components/icons/__tests__/JetBrainsIcons.test.tsx:7,39-48`). |

### 3.3 Deletion waves

- **Wave A — tests.** Every test file that imports the delete set (see §7). Deleting tests first makes the compiler output a clean list of surviving source breakages.
- **Wave B — leaf components/services.** `src/components/sdlc/**`, `src/components/ai/wizard/**`, `src/services/wizard/**`, `src/services/sdlc/**`, `src/services/export/**`, `sdlcSolutionParser.ts`, `changePackPackager.ts`, `researchService.ts`, `wizardService.ts`, `wizardPrompts.ts`, `wizardSchemas.ts`.
- **Wave C — extracted-then-deleted.** `sdlcPromptComposer.ts`, `sdlcArtifactTools.ts` (only after their replacements are wired).
- **Wave D — views & launch points.** `ChangeRequestSdlcView.tsx`, then the 5 launch points + `ChangeRequestTable` prop.
- **Wave E — persisted surface.** `models.ts`, `backupSchemas.ts`, `validateBackup.ts`, `restoreBackup.ts`, `exportBackup.ts`, `chatRepo.ts`, `chatTabRepo.ts`, `documentSetRepo.ts`, `validation/schemas.ts`, `knowledgeSchemas.ts`, `db/index.ts`, `layoutStore.ts`, `EditorArea.tsx`.
- **Wave F — chat UI cleanup.** `ChatMessageBubble.tsx`, `ChatMessageList.tsx`, `ChatTabBar.tsx`, `AiChatWidget.tsx`, `AIChatDrawer.tsx`, `useChatTurn.ts`, `InterruptedBanner.tsx`, `RestoredSourceNotice.tsx`, `ImportPreviewModal.tsx`.

## 4. Cross-Boundary Import Map

This is the deletion-order authority. Every row is a file **outside** the delete set that imports **from** the delete set. `Verdict` says what must happen to that importer before the source can be deleted.

### 4.1 Importers of `src/services/wizard/**` (the largest boundary)

| Importer (file:line) | Imported symbol | Source file | Verdict |
|---|---|---|---|
| `src/components/ai/InterruptedBanner.tsx:3` | `SdlcCheckpoint` (type) | `wizard/workflowSchemas` | **DELETE FILE** (CONTEXT D-08) |
| `src/components/ai/artifacts/ArtifactEventCard.tsx:4` | `SdlcArtifactKind` (type) | `wizard/workflowSchemas` | **DELETE FILE** |
| `src/components/ai/wizard/restoreRecovery.ts:1` | `SdlcWorkflowState` (type) | `wizard/workflowSchemas` | DELETE (inside delete set) |
| `src/db/repositories/chatRepo.ts:16` | `SdlcArtifactKindSchema` | `wizard/workflowSchemas` | **REWRITE** — used at `:109` to validate `artifactEvent.kind`. Deleting `ChatArtifactEvent` (C14) removes the need. |
| `src/types/models.ts:7` | `SdlcArtifactKind` (type) | `wizard/workflowSchemas` | **REWRITE** — used at `:296` (`ChatArtifactEvent.kind`). Delete `ChatArtifactEvent` + `ChatMessage.artifactEvent` (`:293-302`, `:316`). |
| `src/validation/backupSchemas.ts:13` | `SdlcWorkflowStateSchema` | `wizard/workflowSchemas` | **REWRITE** — delete `workflowState` field at `:253` |
| `src/services/ai/sdlcArtifactTools.ts:8` | `SdlcArtifactRef`, `SdlcStepId`, `SdlcWorkflowState`, `SdlcWorkflowStateSchema` | `wizard/workflowSchemas` | DELETE FILE (after split) |
| `src/services/ai/sdlcPromptComposer.ts:1` | `SdlcStepId` (type) | `wizard/workflowSchemas` | DELETE FILE (after split) |
| `src/services/ai/researchService.ts:9` | `defaultSha256` | `wizard/workflowCoordinator` | **REWRITE or DELETE** — `researchService` is orphaned (C13); delete it. `defaultSha256` must move to `patchProposal.ts` (see §6.4). |
| `src/services/ai/researchService.ts:8` | `saveResearchArtifact` | `wizard/artifactRepo` | DELETE FILE |
| `src/services/changePackPackager.ts:12` | `ChangePackManifest` etc. | `wizard/changePack` | DELETE FILE |
| `src/services/export/pl03bDocx.ts:21` | reconciliation types | `wizard/reconciliation` | DELETE FILE |
| `src/services/export/wizardDocx.ts:11` | reconciliation types | `wizard/reconciliation` | DELETE FILE |
| `src/views/ChangeRequestDetailView.tsx:30` | `SDLC_STEPS_CONFIG` | `components/sdlc/SdlcSidebar` | **REWRITE** — delete the whole SDLC progress strip (`:65-77`, `:112-149`, `:169-179`, `:386-388`, `:401-...`) |
| `src/views/ChangeRequestDetailView.tsx:31` | `SdlcStepId` (type) | `wizard/workflowSchemas` | **REWRITE** — same block |
| `src/workbench/EditorArea.tsx:57` | `SdlcStepId` (type) | `wizard/workflowSchemas` | **REWRITE** — used only at `:620` inside the `case 'sdlc'` branch; dies with `:615-626` |
| `src/views/ChangeRequestsView.tsx` | (none directly) | — | **REWRITE** — `:195-202` `onOpenSdlcStudio` wiring |
| `src/views/SystemDetailView.tsx` | (none directly) | — | **REWRITE** — `:91`, `:135-149`, `:212-230`, `:291-299`, `:536-556` |
| `src/workbench/toolwindows/CRExplorer.tsx` | (none directly) | — | **REWRITE** — `:104-110`, `:133-137` |
| `src/workbench/TitleBar.tsx` | (none directly) | — | **REWRITE** — `:17`, `:255-272` |
| `src/workbench/WorkbenchLayout.tsx:201` | (string map only) | — | **REWRITE** — remove `sdlc: 'SDLC Studio'` |
| `src/workbench/store/layoutStore.ts:18` | (union member) | — | **REWRITE** — remove `\| 'sdlc'` |

### 4.2 Importers of `src/components/sdlc/**`

| Importer (file:line) | Imported symbol | Source file | Verdict |
|---|---|---|---|
| `src/views/ChangeRequestDetailView.tsx:30` | `SDLC_STEPS_CONFIG` | `sdlc/SdlcSidebar` | REWRITE (above) |
| `src/workbench/editor/RemoteFileViewer.tsx:17` | `DiffLineCodeRenderer` | `sdlc/diff/DiffSyntaxHighlighter` | **EXTRACT FIRST** → `components/common/DiffSyntaxHighlighter` |
| `src/views/ChangeRequestSdlcView.tsx:7-14,40,49` | 11 imports | various | DELETE FILE |

### 4.3 Importers of `src/components/ai/wizard/**`

| Importer (file:line) | Imported symbol | Source file | Verdict |
|---|---|---|---|
| `src/components/ai/ChatMessageBubble.tsx:52` | `DocumentPreviewCard`, `DocumentPreviewPayload` | `wizard/DocumentPreviewCard` | **REWRITE** — delete the `msg.wizard` branch `:392-468` and the import |
| `src/components/ai/ChatMessageBubble.tsx:53` | `SolutionReviewCard`, `SolutionReviewPayload` | `wizard/SolutionReviewCard` | REWRITE |
| `src/components/ai/ChatMessageBubble.tsx:54` | `GapFillQuestionCard` | `wizard/GapFillQuestionCard` | REWRITE |
| `src/components/ai/ChatMessageBubble.tsx:56-60` | `WizardMessageCallbacks` (locally declared) | — | REWRITE — delete interface + prop `:100` + destructure `:349` |
| `src/components/ai/ChatMessageList.tsx:7,44,73,184` | `WizardMessageCallbacks` | `ChatMessageBubble` | REWRITE — delete prop pass-through |
| `src/components/ai/AIChatDrawer.tsx:66` | `deriveMissingSources` | `wizard/restoreRecovery` | **REWRITE** — delete the whole restored-source block `:956-974`, `:1015`, `:1403-1406`, `:2451` |
| `src/components/sdlc/steps/Step4ChangePackView.tsx:24,26` | `ChangePackDropzone`, `DriftMatrixView` | `ai/wizard/*` | DELETE FILE |

### 4.4 Importers of `src/services/ai/sdlcArtifactTools.ts` (the extraction boundary)

| Importer (file:line) | Imported symbol | Verdict |
|---|---|---|
| `src/services/ai/aiTools.ts:74` | `executeSdlcArtifactTool`, `ArtifactToolContext` | **REWRITE** — replace with `patchProposal` imports; delete `propose_*` cases |
| `src/components/ai/runtime/chatTurnRuntime.ts:13-19` | `executeSdlcArtifactTool`, `prepareArtifactPatch`, `ArtifactPatchProposal`, `ArtifactToolContext`, `ArtifactToolRefusal`, `ArtifactToolResult` | **REWRITE** — import from `patchProposal`; rescope `artifactContext` → `patchTarget` |
| `src/services/ai/aiOrchestratorLoop.ts:14` | `ArtifactToolContext` (type) | **REWRITE** — import from `patchProposal`; rename option |
| `src/components/ai/widget/ArtifactDiffApprovalCard.tsx:4` | `ArtifactPatchProposal` (type) | **REWRITE** — move card, import from `patchProposal` |
| `src/components/sdlc/SdlcWorkspace.tsx:9` | 3 types | DELETE FILE |
| `src/components/sdlc/chat/StepChatPanel.tsx:25` | 5 symbols | DELETE FILE |
| `src/components/sdlc/common/SubsystemProposalCard.tsx:6` | 2 types | DELETE FILE |
| `src/views/ChangeRequestSdlcView.tsx:43` | 4 symbols | DELETE FILE |

### 4.5 Importers of `src/services/ai/sdlcPromptComposer.ts`

| Importer (file:line) | Imported symbol | Verdict |
|---|---|---|
| `src/components/ai/AIChatDrawer.tsx:51` | `buildConventionsSegment` | **REWRITE** → `'../../services/ai/conventionsSegment'` |
| `src/components/sdlc/SdlcWorkspace.tsx:6` | `SdlcArtifactKindForTurn` | DELETE FILE |
| `src/components/sdlc/chat/StepChatPanel.tsx:17` | 5 symbols | DELETE FILE |
| `src/components/sdlc/chat/useStepChatToolbox.ts:20` | `normalizeDynamicToolNames`, `SDLC_STEP_ALLOWED_TOOLS` | DELETE FILE |
| `src/views/ChangeRequestSdlcView.tsx:31` | `SdlcArtifactKindForTurn` | DELETE FILE |

### 4.6 Importers of `src/services/ai/wizardSchemas.ts`

| Importer (file:line) | Imported symbol | Verdict |
|---|---|---|
| `src/db/repositories/chatRepo.ts:11` | `WizardSnapshotSchema`, `WizardSnapshot` | **REWRITE** — delete `input.wizard` validation `:135-155` and `:171`; delete `SaveMessageInput.wizard` `:35` |
| `src/types/models.ts:3-6` | `SdlcArtifactMetadata`, `SdlcDocumentSetMetadata`, `WizardSnapshot` | **REWRITE** — delete `Note.sdlcArtifact` `:205`, `ChatMessage.wizard` `:315`, `DocumentSet.sdlc` `:377` |
| `src/validation/backupSchemas.ts:9-12` | `SdlcArtifactMetadataSchema`, `SdlcDocumentSetMetadataSchema`, `WizardSnapshotSchema` | **REWRITE** — delete `:154`, `:327`, `:447` |
| `src/validation/schemas.ts:11` | `SdlcArtifactMetadataSchema` | **REWRITE** — delete `:428`, `:444` |
| `src/validation/knowledgeSchemas.ts:3` | `SdlcDocumentSetMetadataSchema` | **REWRITE** — delete `:123` |
| `src/services/wizard/artifactRepo.ts:15` | 4 symbols | DELETE FILE |
| `src/services/wizard/hubChangePack.ts:3` | `buildWizardIdempotencyKey` | DELETE FILE |
| `src/services/ai/wizardService.ts:22` | `WizardSkill` (type) | DELETE FILE |

### 4.7 Importers of `src/services/changePackPackager.ts`, `export/*`, `groundingBuilder`, `sdlcSolutionParser`

| Importer (file:line) | Imported symbol | Source | Verdict |
|---|---|---|---|
| `src/components/sdlc/steps/Step4ChangePackView.tsx:46` | packager fns | `changePackPackager` | DELETE FILE |
| `src/components/sdlc/SdlcWorkspace.tsx:7` | `SdlcGroundingResult` (type) | `services/sdlc/groundingBuilder` | DELETE FILE |
| `src/components/sdlc/chat/StepChatPanel.tsx:18` | 3 symbols | `services/sdlc/groundingBuilder` | DELETE FILE |
| `src/views/ChangeRequestSdlcView.tsx:30` | `buildSdlcStepGroundingResult` | `services/sdlc/groundingBuilder` | DELETE FILE |
| `src/components/sdlc/chat/StepChatPanel.tsx:20` | `extractChatSummary`, `extractSolutionMarkdown` | `utils/sdlcSolutionParser` | DELETE FILE |
| `src/services/wizard/hubExport.ts:5,6` | `Pl02DocxPayload`, `buildWizardDocx` | `export/*` | DELETE FILE |
| `src/services/wizard/hubCab.ts:2` | `CabDocxPayload` | `export/cabDocx` | DELETE FILE |
| `src/services/wizard/hubTechDocs.ts:2-4` | `Pl03bDocxPayload`, `Pl07DocxPayload`, `PL07_BASELINE` | `export/*` | DELETE FILE |
| `src/components/sdlc/steps/Step6CabView.tsx:18` | `buildWizardDocx` | `export/wizardDocx` | DELETE FILE |

### 4.8 Importers of `src/components/ai/artifacts/ArtifactEventCard.tsx` and `InterruptedBanner`

| Importer (file:line) | Imported symbol | Verdict |
|---|---|---|
| `src/components/ai/AiChatWidget.tsx:12` | `ArtifactEventCard`, `ArtifactEvent` | **REWRITE** — delete `:12`, `:33-35` (`AiChatArtifactEvent`), `:87-89` (props), `:259-261` (destructure), `:505-517` (render) |
| `src/components/sdlc/SdlcWorkspace.tsx:5` | `AiChatArtifactEvent` | DELETE FILE |
| `src/components/sdlc/chat/StepChatPanel.tsx:11` | `AiChatArtifactEvent` | DELETE FILE |
| `src/views/ChangeRequestSdlcView.tsx:39` | `AiChatArtifactEvent` | DELETE FILE |
| `src/components/ai/AIChatDrawer.tsx:103,2562,2580` | `InterruptedBanner` | **REWRITE** — delete the three usages and the checkpoint machinery `:956-1040` |

### 4.9 Importers of `src/components/ai/RestoredSourceNotice.tsx`

| Importer (file:line) | Imported symbol | Verdict |
|---|---|---|
| `src/components/ai/AIChatDrawer.tsx:65,2451` | `RestoredSourceNotice` | **REWRITE** — delete |

### 4.10 Non-importing but SDLC-coupled survivors (string/behavior level)

| File:line | What | Verdict |
|---|---|---|
| `src/db/index.ts:254-267` | V14 `.upgrade()` creates SDLC tabs for `project:*:sdlc` threads | **KEEP the hook verbatim** — it is migration history for a schema version that already ran. Changing it does not affect any existing DB. Leave it; it is a legitimate residual (§11). |
| `src/db/index.ts:492` | `this.version(17).stores(SCHEMA_V17)` | **APPEND V18** with the SDLC purge `.upgrade()` |
| `src/db/repositories/chatRepo.ts:242-256` | `clearAllChatHistory` deletes `sdlc_workflow:*` settings | **REWRITE** — keep the settings delete? Under C-16 there will be no such keys, but the delete is harmless and defensive. **Recommend: remove the `.filter(...).delete()` line** so no `sdlc_workflow:` literal survives; the V18 migration already purged them. |
| `src/db/repositories/chatRepo.ts:262-281` | `getOrCreateSdlcThread` | **DELETE FUNCTION** (only consumer was `ChangeRequestSdlcView`) |
| `src/db/repositories/chatTabRepo.ts:6` | `SDLC_TITLE` const | **DELETE** |
| `src/db/repositories/chatTabRepo.ts:20-22` | `ordinaryTabs()` filters `type === 'chat'` | **SIMPLIFY** — after `ChatTabType` narrows, the filter is a no-op; keep or inline |
| `src/db/repositories/chatTabRepo.ts:81-88` | `getSdlcTabThreadId` | **DELETE** (zero `src/` consumers) |
| `src/db/repositories/chatTabRepo.ts:90-127` | `getOrCreateSdlcTab` | **DELETE** (consumer was `ChangeRequestSdlcView:421`) |
| `src/db/repositories/chatTabRepo.ts:211` | `updateChatTab` patch type includes `workflowState` | **REWRITE** — drop from the `Pick<>` |
| `src/db/repositories/chatTabRepo.ts:229` | `if (tab.type === 'sdlc') throw` | **DELETE** |
| `src/db/repositories/chatTabRepo.ts:234` | `ordinaryTabs(...)` in `deleteChatTab` | **SIMPLIFY** |
| `src/db/repositories/documentSetRepo.ts:23,36,55-88,151,233` | `sdlc` field + `getOrCreateCrSdlcSetInTransaction` | **REWRITE** — delete field from both input interfaces, delete the whole `getOrCreateCrSdlcSetInTransaction` function (only consumers: `wizard/artifactRepo.ts:207,381` — both deleted), delete `:151` and `:233` |
| `src/components/ai/ChatTabBar.tsx:28,31,46,63,85,110,133,189,253,266,317,342,500-507,517,539,552` | `ChatTabType`, `sdlcStatus`, `isSdlc` | **REWRITE** — narrow type to `'chat'`; delete `sdlcStatus` prop (zero callers pass it — verified), `isSdlc` prop and every branch |
| `src/components/ai/runtime/useChatTurn.ts:96,196` | `scopeKey.startsWith('sdlc:')` title | **REWRITE** — delete the ternary; title becomes `scopeKey` |
| `src/components/ai/AiChatWidget.tsx:18` | `AiChatScopeKind = 'chat' \| 'sdlc'` | **REWRITE** — narrow to `'chat'` |
| `src/services/ai/chatTurnTools.ts:66` | 4-tool exclusion list | **REWRITE** — keep `get_artifact`/`patch_artifact_section` (they survive, rescoped); remove `propose_subsystems`/`propose_research` |
| `src/components/settings/ImportPreviewModal.tsx:134-147,303-310` | `recoveryNotice` + SDLC alert | **REWRITE** — delete both; `BackupValidationResult.recovery` becomes unused (delete from `types/backup.ts:46-49,143` too) |
| `src/components/changeRequests/ChangeRequestTable.tsx:47,99,144-149,412-420` | `onOpenSdlcStudio` | **REWRITE** — delete prop, dropdown item, inline button |
| `src/components/changeRequests/ChangeRequestTable.tsx:466` | Empty-state copy mentions "quy trình SDLC 6 bước" | **REWRITE** — reword |
| `src/components/ai/AIChatDrawer.tsx:1079,1081` | `isSdlcActiveTab = false` + `currentTabAnalysisMode` | **REWRITE** — delete the const and simplify to `Boolean(activeTab?.config?.analysisMode)` |

---

## 5. Persisted-State Surface

### 5.1 `EditorViewType` and every `'sdlc'` literal

| Location | Current text |
|---|---|
| `src/workbench/store/layoutStore.ts:18` | `  \| 'sdlc'` (member of the `EditorViewType` union, lines 5-23) |
| `src/workbench/store/layoutStore.ts:106` | `export const LAYOUT_STORAGE_KEY = 'taskmate_workbench_layout_v2';` |
| `src/workbench/store/layoutStore.ts:347` | `partialize: (state) => ({` — the allowlist starts here; `openTabs` is mapped at `:355-362` and `activeTabId` at `:363` |
| `src/workbench/EditorArea.tsx:89-90` | `case 'sdlc':` / `return <JetBrainsSdlcIcon size={size} />;` (inside `getEditorTabIcon`) |
| `src/workbench/EditorArea.tsx:615-626` | `case 'sdlc':` → `<ChangeRequestSdlcView ... />` (inside `renderViewContent`) |
| `src/workbench/EditorArea.tsx:687-688` | `default:` / `return <TasksView {...dbProp} />;` — **the AIO-REMOVE-04 hazard** |
| `src/workbench/TitleBar.tsx:259,267,268,269` | `onClick={() => onOpenView?.('sdlc')}`, three `activeView === 'sdlc'` ternaries |
| `src/workbench/WorkbenchLayout.tsx:201` | `sdlc: 'SDLC Studio',` in the `titles` map |
| `src/workbench/toolwindows/CRExplorer.tsx:107,109,133` | `` id: `sdlc-${cr.id}` ``, `viewType: 'sdlc'`, `key: 'open-sdlc'` |
| `src/views/ChangeRequestsView.tsx:197,199` | `` id: `sdlc-${crId}` ``, `viewType: 'sdlc'` |
| `src/views/SystemDetailView.tsx:293,295` | `` id: `sdlc-${crId}` ``, `viewType: 'sdlc'` |
| `src/views/ChangeRequestDetailView.tsx:171,173` | `` id: `sdlc-${cr.id}` ``, `viewType: 'sdlc'` |
| `src/types/models.ts:235` | `export type ChatTabType = 'chat' \| 'sdlc';` |
| `src/components/ai/ChatTabBar.tsx:28` | `export type ChatTabType = 'sdlc' \| 'chat';` (a **second, independent** declaration) |
| `src/validation/backupSchemas.ts:241` | `type: z.enum(['chat', 'sdlc']),` |
| `src/db/index.ts:267` | `type: isSdlc ? 'sdlc' : 'chat',` (V14 upgrade) |
| `src/services/backup/restoreBackup.ts:99,131` | `type: ... ? 'sdlc' : 'chat'`, `type: 'sdlc'` |
| `src/services/backup/validateBackup.ts:411` | `... && tab.type === 'sdlc'` |
| `src/db/repositories/chatTabRepo.ts:87,95,117,229` | four `'sdlc'` comparisons/assignments |
| `src/services/ai/sdlcArtifactTools.ts:272` | `tabs.find((tab) => tab.type === 'sdlc')` |
| `src/components/ai/AIChatDrawer.tsx:959,978` | `durableTabs.filter((tab) => tab.type === 'sdlc' && tab.threadId)` |
| `src/components/ai/AiChatWidget.tsx:18` | `export type AiChatScopeKind = 'chat' \| 'sdlc';` |
| `src/components/sdlc/chat/StepChatPanel.tsx:1119` | `kind: 'sdlc',` |

### 5.2 `LAYOUT_STORAGE_KEY` / `partialize` — two viable mechanisms

**Option A — bump the key to `_v3`.** `layoutStore.ts:106` → `'taskmate_workbench_layout_v3'`. Zustand `persist` finds no `_v3` entry, hydrates defaults (`DEFAULT_LAYOUT_STATE`, `:86-101`), and `activeTabId: 'tasks'` is valid by construction. Cost: the user loses all persisted layout (panel sizes, open tabs) — acceptable under C-16. Test `src/workbench/__tests__/layoutStore.test.ts:21` asserts the exact `_v2` string and must be updated.

**Option B — filter in `partialize` + re-point `activeTabId`.** Inside `partialize` (`:347`), after mapping `openTabs`, filter `tab.viewType !== 'sdlc'`; then compute `activeTabId` as `filtered.some(t => t.id === state.activeTabId) ? state.activeTabId : (filtered[0]?.id ?? DEFAULT_LAYOUT_STATE.activeTabId)`. Cost: ~6 lines, keeps the user's layout, and is the only option that literally satisfies "`activeTabId` re-points to a valid tab" for *any* future unknown view type. Zustand 5.0.16 also exposes a `merge` hook (`node_modules/zustand/middleware/persist.d.ts:59`) if a hydration-time filter is preferred over a persist-time one.

**Recommendation:** Option B, because AIO-REMOVE-04's wording ("`activeTabId` re-points to a valid tab") is only literally true if the filter runs. Option A satisfies it vacuously. Doing **both** is also valid and cheapest to verify. Note that `partialize` runs on every write, not on hydration — a stale `_v2` blob is still read on first launch and merged shallowly, so the filter must also be applied at hydration time (`merge`) or the key must be bumped. **This is the one subtle correctness point of AIO-REMOVE-04** — see §9 L3.

### 5.3 `backupSchemas.ts`

| Line | Current text |
|---|---|
| `:9-13` | imports `SdlcArtifactMetadataSchema`, `SdlcDocumentSetMetadataSchema`, `WizardSnapshotSchema`, `SdlcWorkflowStateSchema` |
| `:154` | `sdlcArtifact: SdlcArtifactMetadataSchema.optional(),` (inside `BackupNoteRecordSchema`) |
| `:241` | `type: z.enum(['chat', 'sdlc']),` (inside `BackupChatTabRecordSchema`) |
| `:253` | `workflowState: SdlcWorkflowStateSchema.optional(),` |
| `:327` | `wizard: WizardSnapshotSchema.optional(),` (inside `BackupChatMessageRecordSchema`) |
| `:447` | `sdlc: SdlcDocumentSetMetadataSchema.optional(),` (inside `BackupDocumentSetRecordSchema`) |
| `:200-221` | `FORBIDDEN_BACKUP_KEYS` — **unchanged**; note `'runtime'` is forbidden, and `workflowState` is not in the list |

### 5.4 `validateBackup.ts`

| Line range | What |
|---|---|
| `:250` | `const recovery = { missingSources: [], blockedTabs: [] }` — delete the whole `recovery` object |
| `:392-418` | `chatTabs` block: `sdlcByScope` set (`:394`), `expectedScope` `:sdlc` derivation (`:403-407`), duplicate-SDLC-tab check (`:411-414`) — delete `:394`, simplify `:403-407` to the `:chat:` case, delete `:411-414` |
| `:420-465` | `tab.workflowState` artifact-ref check, `recovery.missingSources.push`, `recovery.blockedTabs.push`, and the `tab.workflowState = {...}` mutation (`:455-463`) — **delete entirely** |
| `:469-509` | `cm.wizard` identity checks (`:480-507`) — delete |
| `:511-543` | `note.sdlcArtifact` checks (`:513-541`) — delete; keep the `if (notes)` wrapper only if something else lives inside (nothing does — delete the block) |
| `:545-567` | `documentSets` `set.sdlc` checks — delete the whole block |
| `:731` | `...(recovery.missingSources.length > 0 ? { recovery } : {})` — delete |

### 5.5 `restoreBackup.ts`

| Line range | What |
|---|---|
| `:67` | `const SDLC_TITLE = '⚙️ SDLC Workflow';` — delete |
| `:70-78` | `scopeFromThread` — delete the `:sdlc` branch (`:71-73`), keep the `:chat:` branch |
| `:80-173` | `legacyTabRows` — delete the `hasSdlc`/`sdlcThread` generator (`:111-138`) and the `:sdlc` ternaries at `:96,99`; keep the ordinary-thread generator (`:139-162`) and the order/active normalization (`:165-172`) |
| `:181` | `const backfilled = legacyTabRows(...)` — keep (now SDLC-free) |
| `:257-262` | `incomingSettingKeys` includes `sdlc_workflow:` keys derived from `tab.workflowState` — delete the `...(tables.chatTabs ?? []).filter(...).map(...)` spread |
| `:297-307` | the `workflowState → sdlc_workflow:` mirror loop — delete entirely |

### 5.6 `exportBackup.ts`

| Line | What |
|---|---|
| `:158` | `...(tab.workflowState !== undefined ? { workflowState: projectSafeTabValue(tab.workflowState) as Record<string, unknown> } : {})` — delete. `BackupChatTabRecordSchema` is `z.strictObject`, so an undeclared `workflowState` on export would now fail validation; removing both sides together is mandatory. |

### 5.7 `models.ts`

| Line | Current text |
|---|---|
| `:3-7` | imports `SdlcArtifactMetadata`, `SdlcDocumentSetMetadata`, `WizardSnapshot`, `SdlcArtifactKind` |
| `:205` | `sdlcArtifact?: SdlcArtifactMetadata \| undefined;` (in `Note`) |
| `:235` | `export type ChatTabType = 'chat' \| 'sdlc';` |
| `:267` | `workflowState?: Record<string, unknown> \| undefined;` (in `ChatTab`) — **note: already generic, not SDLC-typed** |
| `:288-302` | `ChatArtifactEvent` interface, `kind: SdlcArtifactKind` at `:296` |
| `:315` | `wizard?: WizardSnapshot \| undefined;` (in `ChatMessage`) |
| `:316` | `artifactEvent?: ChatArtifactEvent \| undefined;` |
| `:377` | `sdlc?: SdlcDocumentSetMetadata \| undefined;` (in `DocumentSet`) |

### 5.8 `validation/schemas.ts`, `knowledgeSchemas.ts`

| Line | Current text |
|---|---|
| `src/validation/schemas.ts:11` | `import { SdlcArtifactMetadataSchema } from '../services/ai/wizardSchemas';` |
| `src/validation/schemas.ts:428` | `sdlcArtifact: SdlcArtifactMetadataSchema.optional(),` (in `NoteSchema`) |
| `src/validation/schemas.ts:444` | `sdlcArtifact: SdlcArtifactMetadataSchema.optional(),` (in `NoteInputSchema`) |
| `src/validation/knowledgeSchemas.ts:3` | `import { SdlcDocumentSetMetadataSchema } from '../services/ai/wizardSchemas';` |
| `src/validation/knowledgeSchemas.ts:123` | `sdlc: SdlcDocumentSetMetadataSchema.optional(),` (inside a `.strict()` object — **must be deleted or every knowledge-publish parse fails**) |

### 5.9 `documentSetRepo.ts`

| Line | Current text |
|---|---|
| `:23` | `sdlc?: DocumentSet['sdlc'];` (in `CreateDocumentSetInput`) |
| `:36` | `sdlc?: DocumentSet['sdlc'];` (in `UpdateDocumentSetInput`) |
| `:55-88` | `getOrCreateCrSdlcSetInTransaction` — delete whole function |
| `:61` | `.filter((set) => set.sdlc?.changeRequestId === changeRequestId && set.sdlc.purpose === 'sdlc')` |
| `:80` | `sdlc: { changeRequestId, purpose: 'sdlc' },` |
| `:151` | `...(input.sdlc ? { sdlc: input.sdlc } : {}),` |
| `:233` | `...(updates.sdlc !== undefined ? { sdlc: updates.sdlc } : {}),` |

### 5.10 `chatRepo.ts`

| Line | Current text |
|---|---|
| `:11` | `import { WizardSnapshotSchema, type WizardSnapshot } from '../../services/ai/wizardSchemas';` |
| `:16` | `import { SdlcArtifactKindSchema } from '../../services/wizard/workflowSchemas';` |
| `:35` | `wizard?: WizardSnapshot \| undefined;` (in `SaveMessageInput`) |
| `:36` | `artifactEvent?: ChatArtifactEvent \| undefined;` |
| `:88-93` | eventId stamping |
| `:105-133` | `artifactEvent` validation block |
| `:135-155` | `wizard` validation block (the `WIZARD_THREAD_MISMATCH` / `WIZARD_PROJECT_MISMATCH` errors) |
| `:171` | `...(wizard ? { wizard } : {}),` |
| `:254` | `await db.settings.filter((row) => String(row.key).startsWith('sdlc_workflow:')).delete();` |
| `:262-281` | `getOrCreateSdlcThread` |

### 5.11 `ChatTabBar.tsx` / `ChatMessageBubble.tsx`

`ChatTabBar.tsx` — `:28` type, `:31` comment, `:46` `sdlcStatus` prop, `:63` `isSdlc` prop, `:85` destructure, `:110` `disabled: isSdlc`, `:133` `if (isSdlc) {...}`, `:189`, `:253` tooltip, `:266` `{!isSdlc && ...}`, `:317` default param, `:342` reorder guard, `:500-507` status resolution, `:517`, `:539`, `:552`.

`ChatMessageBubble.tsx` — `:52-54` imports, `:56-60` `WizardMessageCallbacks`, `:100` prop, `:349` destructure, `:392-468` the entire `msg.wizard` render branch (including `GapFillQuestionCard` at `:398-429`, `SolutionReviewCard` at `:449`, `DocumentPreviewCard` at `:461`, `wizard-bubble` testid at `:466`).

### 5.12 `db/index.ts` — the V18 migration

Current max version is **17** (`:492`, `this.version(17).stores(SCHEMA_V17);`). The purge must be a new `version(18)` with an `.upgrade()`:

```
this.version(18).stores(SCHEMA_V18).upgrade(async (tx) => {
  await tx.table('chatTabs').filter((t) => t.type === 'sdlc').delete();
  await tx.table('chatThreads').filter((t) => typeof t.scopeKey === 'string' && t.scopeKey.endsWith(':sdlc')).delete();
  await tx.table('settings').filter((s) => String(s.key).startsWith('sdlc_workflow:')).delete();
});
```

`SCHEMA_V18` = `{ ...SCHEMA_V17 }` (no index change needed for the purge). Orphaned `chatMessages` of deleted threads: `restoreBackup`/`validateBackup` require `chatMessages.threadId ∈ chatThreads`, so the migration should also delete messages whose `threadId` is no longer present. **Phase 36's `aiSkillVersions` then becomes V19** — ROADMAP Phase 36 criterion 1 says "Dexie V18 adds `aiSkillVersions`" and must be updated (see §9 L4).

## 6. Tool Dispatch Plan

### 6.1 Current dispatch shape

`executeAiTool` (`src/services/ai/aiTools.ts:2166-2181`) normalizes the name (`normalizeToolName`, `:4811`) and enters one `switch` (`:2182`). The four artifact tools share **one** case block:

```
      case 'get_artifact':
      case 'patch_artifact_section':
      case 'propose_subsystems':
      case 'propose_research': {
        const result = await executeSdlcArtifactTool(normalized, args, db, options?.artifactContext);
        return JSON.stringify(result);
      }
```
(`aiTools.ts:2203-2209`)

`executeSdlcArtifactTool` (`sdlcArtifactTools.ts:549-575`) then re-dispatches on name: `propose_subsystems` → `proposeSubsystems`, `propose_research` → `proposeResearch`, `get_artifact` → `readArtifactSnapshot`, **else** → `prepareArtifactPatch` (the fall-through is the patch tool).

### 6.2 Removing `propose_subsystems` / `propose_research`

| File:line | Change |
|---|---|
| `aiTools.ts:1923-1953` | Delete the `propose_subsystems` definition object |
| `aiTools.ts:1954-1983` | Delete the `propose_research` definition object |
| `aiTools.ts:2205-2206` | Delete the two `case` labels |
| `chatTurnTools.ts:66` | Remove both names from the exclusion array (keep `get_artifact`, `patch_artifact_section`) |
| `sdlcArtifactTools.ts:561-566` | Delete both branches from `executeSdlcArtifactTool` |
| `sdlcArtifactTools.ts:577-584,590-616` | Delete `proposalArgsSchema`, `proposeSubsystems`, `SubsystemProposalItem`, `SubsystemProposalResult` |
| `sdlcArtifactTools.ts:618-624,631-677` | Delete `researchArgsSchema`, `proposeResearch`, `ResearchProposalQuestion`, `ResearchProposalResult` |
| `sdlcArtifactTools.ts:122-127` | Narrow `ArtifactToolResult` to `ArtifactToolSnapshot \| ArtifactPatchProposal \| ArtifactToolRefusal` |
| `sdlcPromptComposer.ts:67-71,112-113,130-136` | Delete `PROPOSAL_TOOL_NAME`, `RESEARCH_TOOL_NAME`, `hasProposal`, `hasResearchProposal` and their policy lines — **whole file is deleted anyway** |
| Tests | Delete `tests/services/ai/researchProposal.test.ts`, `tests/services/ai/subsystemProposal.test.ts`, `tests/components/sdlc/SubsystemProposalCard.test.tsx`, `tests/components/sdlc/SubsystemContextBar.test.tsx`, `tests/components/sdlc/SubsystemsReposPanel.test.tsx` |

`isMutationTool('propose_subsystems')` currently returns `false` (not in `MUTATION_TOOLS`, `:4758-4805`) — no mutation-list change needed for the removals.

### 6.3 Rescoping `get_artifact` / `patch_artifact_section` to `{noteId} | {skillId}`

**Schema changes (`aiTools.ts:1864-1922`):**

`get_artifact` today: `{ kind: 'SOLUTION'|'PL03B'|'PL07'|'CAB' }`, required `['kind']`.
Target: `{ target: 'note'|'skill', id: string }`, required `['target','id']`.

`patch_artifact_section` today: `{ kind, sectionId, expectedHeading, baseHash, operation, newContent }`, required all six.
Target: `{ target, id, sectionId, expectedHeading, baseHash, operation, newContent }` — same six plus the target pair.

**Dispatch changes (`aiTools.ts:2203-2209`):** keep the two `case` labels; replace `executeSdlcArtifactTool` with the two new entry points from `patchProposal.ts`:

```
case 'get_artifact': {
  const result = await readPatchTarget(db, args, options?.patchTarget);
  return JSON.stringify(result);
}
case 'patch_artifact_section': {
  const result = await preparePatch(db, args, options?.patchTarget);
  return JSON.stringify(result);
}
```

**Options plumbing:** `ExecuteAiToolOptions.artifactContext` (`aiTools.ts:2129-2137`) → `patchTarget?: PatchTargetContext`. Same rename in `DispatchAiToolCallOptions` (`aiOrchestratorLoop.ts:14-18`), `AiOrchestratorLoopOptions` (`:86-87`), the destructure (`:180`), the dispatch construction (`:415`), `ChatTurnRequest.artifactContext` (`chatTurnRuntime.ts:74-75`), `ChatTurnRuntimeDeps.preparePatch` (`:104-105,141`), the loop options spread (`:311,320`), and the approval branch (`:384-387`).

**Result types:** `ArtifactToolSnapshot` (`sdlcArtifactTools.ts:63-71`) keeps `version`, `approvalState`, `markdown`, `baseHash`, `sectionIndex`; `kind` becomes `target`/`id`; `approvedAt` becomes optional/absent (there is no approval ledger for notes or skills yet). `ArtifactPatchProposal` (`:73-88`) drops `scopeKey`, `changeRequestId`, `crId`, `kind`, `version` and gains `target`, `id`.

**Prompt text:** the two tool `description` strings (`aiTools.ts:1868-1869`, `:1887-1888`) and the `kind` property descriptions (`:1873-1877`, `:1892-1896`) must be rewritten — they currently say "the current SDLC artifact of the open Change Request" and enumerate `SOLUTION/PL03B/PL07/CAB`.

**Approval branch (`chatTurnRuntime.ts:380-412`):** `PATCH_TOOL_NAME` (`:158`) stays `'patch_artifact_section'`. The branch's `request.artifactContext ? preparePatch(...) : executeSdlcArtifactTool(PATCH_TOOL_NAME, args, deps.db, undefined)` (`:385-387`) collapses to a single call — with the rescope there is no "no context" fallback; a missing target is a structured refusal (`PATCH_TARGET_REQUIRED`).

**Mutation registration:** `'patch_artifact_section'` stays in `MUTATION_TOOLS` (`aiTools.ts:4802`) — the approval gate must keep firing.

**Tests touched:** `tests/ai/artifactToolAccess.test.ts` (22 hits), `tests/services/ai/sdlcArtifactTools.test.ts` (54), `tests/services/ai/sdlcArtifactGuards.test.ts` (68), `tests/ai/chatTurnRuntime.test.ts` (26), `tests/ai/ArtifactDiffApprovalCard.test.tsx` (18), `tests/ai/aiTools.test.ts:352-353` (asserts both names exist — keep, they still do). The first four are SDLC-fixture-heavy; **rewrite the two that test the generic core** (`sdlcArtifactTools.test.ts` → `patchProposal.test.ts`; `ArtifactDiffApprovalCard.test.tsx` → `PatchDiffApprovalCard.test.tsx`) and **delete** the two that test CR/step scoping (`artifactToolAccess.test.ts`, `sdlcArtifactGuards.test.ts`).

### 6.4 `defaultSha256` relocation

`defaultSha256` lives at `src/services/wizard/workflowCoordinator.ts:44-48` and is imported by `sdlcArtifactTools.ts:9` and `researchService.ts:9` — both leaving. `patchProposal.ts` needs it for `baseHash`. **Move the 5-line function into `patchProposal.ts`.** Do not import from `workflowCoordinator` (deleted). Equivalent implementations already exist at `src/services/knowledge/changePreview.ts:100` (`sha256Text`) and `src/db/repositories/documentSetRepo.ts:120` (node `createHash`) — reuse is optional; a local copy keeps `patchProposal.ts` dependency-free.

---

## 7. Test Surface

### 7.1 Delete — whole files (SDLC-only)

**`src/` co-located (11):**
`src/components/sdlc/__tests__/SdlcSidebar.test.tsx`, `src/components/sdlc/steps/__tests__/Step3BranchResolution.test.tsx`, `.../Step3CodeGuideView.test.tsx`, `.../Step4ChangePackView.test.tsx`, `src/components/ai/wizard/__tests__/documentWizard.test.tsx`, `.../hubExportRow.test.tsx`, `.../sdlcWorkflowHub.test.tsx`, `.../stepInputDocsModal.test.tsx`, `.../wizardInterviewPack.test.tsx`, `src/services/wizard/__tests__/*.test.ts` (5 files), `src/services/__tests__/changePackPackager.test.ts`.

**`tests/` (46):**

| Directory | Files |
|---|---|
| `tests/unit/sdlc/` | 26 files — `ArtifactPatchApproval`, `ArtifactPatchIntent`, `ChangeRequestSdlcAnalysisLifecycle`, `ChangeRequestSdlcAutoAnalysis`, `ChangeRequestSdlcCrIsolation`, `ChangeRequestSdlcGrounding`, `ChangeRequestSdlcPerformance`, `ChangeRequestSdlcView`, `ChangeRequestSdlcViewAsyncCr`, `DriftMatrixView`, `MultiPackTable`, `ResearchSummaryCard`, `SdlcDraftStaleness`, `SdlcFlowIntegration`, `SdlcWorkspace`, `Step2SolutionSections`, `Step2SolutionView`, `Step5TechDocsView`, `Step6CabView`, `StepChatPanelArtifactBudget`, `StepChatPanelArtifactQueue`, `StepChatPanelResearch`, `StepChatPanelToolPolicy`, `StepViews`, `sdlcCrManager.test.ts`, `sdlcSolutionParser.test.ts` |
| `tests/components/sdlc/` | 3 — `SubsystemContextBar`, `SubsystemProposalCard`, `SubsystemsReposPanel` |
| `tests/services/sdlc/` | 1 of 2 — `groundingBuilder.test.ts` (**keep** `markdownSections.test.ts`, retarget its import path if the util moves — it does not) |
| `tests/services/wizard/` | 1 — `workflowSchemas.test.ts` |
| `tests/export/` | 3 — `cabDocx.test.ts`, `pl03bDocx.test.ts`, `wizardDocx.test.ts` |
| `tests/ai/` | 15 — `sdlcPromptComposer.test.ts`, `sdlcPromptIsolation.test.ts`, `sdlcConventionsExemplar.test.ts` (⚠ see 7.2), `sdlcWizardRuntime.test.ts`, `wizardService.test.ts`, `wizardState.test.ts`, `wizardEvidenceNavigation.test.ts`, `artifactPersistence.test.ts`, `changePack.test.ts`, `hubCab.test.ts`, `hubChangePack.test.ts`, `hubExport.test.ts`, `hubSolution.test.ts`, `hubTechDocs.test.ts`, `reconciliation.test.ts` |
| `tests/ai/` (drawer/widget) | 4 — `AIChatWidgetParity.test.tsx`, `AIChatDrawerSdlcIntake.test.tsx`, `AIChatDrawerSdlcRecovery.test.tsx`, `AIChatDrawerRestoreRecovery.test.tsx` |
| `tests/services/ai/` | 4 — `sdlcArtifactGuards.test.ts`, `sdlcArtifactTools.test.ts` (⚠ rewrite), `researchProposal.test.ts`, `subsystemProposal.test.ts` |
| `tests/backup/` | 2 — `wizardBackup.test.ts`, `tabCheckpointBackup.test.ts` |
| `tests/views/` | 1 — `ChangeRequestSdlcViewMultiSystem.test.tsx` |
| `tests/` root | 1 — `phase25_1SafetyGates.test.ts` (⚠ see 7.3) |
| `tests/fixtures/ai/` | 1 — `wizard-reference.json` (consumers: `tests/ai/reconciliation.test.ts:13`, `tests/ai/wizardService.test.ts:15` — both deleted) |
| `e2e/` | 3 — `sdlcFlowHardening.spec.ts`, `sdlcHubFlow.spec.ts`, `helpers/sdlcFixtures.ts` |

### 7.2 Rewrite — keep the file, change the subject

| File | Change |
|---|---|
| `tests/ai/sdlcConventionsExemplar.test.ts` | Retarget import to `src/services/ai/conventionsSegment`; keep the 6 `CONVENTIONS_CONFLICT_POLICY` assertions (`:97-102`). Rename to `conventionsSegment.test.ts`. |
| `tests/services/multiSystemConventionService.test.ts` | Retarget `:8-10` import to `conventionsSegment`; the `buildConventionsSegment` multi-repo describe (`:208-247`) survives intact. |
| `tests/services/ai/sdlcArtifactTools.test.ts` | Rewrite as `tests/services/ai/patchProposal.test.ts` against `{noteId}` targets. Drop the `workflowStorageKey`/`SdlcWorkflowState` fixtures (`:4,5,7`); keep the diff/section/EOL/cap assertions. |
| `tests/ai/ArtifactDiffApprovalCard.test.tsx` | Rewrite as `PatchDiffApprovalCard.test.tsx`; import `isDarkBase` from the new path; build proposals directly instead of via `prepareArtifactPatch` + `createSdlcWorkflowCoordinator` (`:5,7`). |
| `tests/ai/chatTurnRuntime.test.ts` | 26 hits. Delete the 7 artifact-patch `it` blocks (`:456-700`); keep the rest. If the rescoped patch branch is still wanted, rewrite them against `{noteId}`. |
| `tests/ai/aiTools.test.ts` | `:352-353` still pass (both tool names survive). Add assertions that `propose_subsystems`/`propose_research` are **absent**. |
| `tests/ai/AiChatWidget.test.tsx` | Delete the `artifactEvents` render test (`:395-435`) and the `chatRepo artifactEvent persistence` describe (`:473-535`) — 43 hits total, all in those two blocks. Also `:449` uses `kind: 'sdlc'` in a scope object (narrow `AiChatScopeKind`). |
| `tests/ai/useChatTurn.test.tsx` | 3 hits — all `scopeKey: 'sdlc:...'` strings. Either change the fixture strings to `'chat:...'` or keep them (the `startsWith('sdlc:')` branch is being deleted, so the titles change — update expectations). |
| `tests/ai/ActiveAiTurnIndicator.test.tsx:56` | `scopeKey: 'sdlc:intake'` — cosmetic fixture string; leave or change. |
| `tests/ai/AIChatDrawerTabs.test.tsx:81-83` | Uses `getOrCreateSdlcTab` — delete that `it` block. |
| `tests/ai/AIChatDrawerCheckpoint.test.tsx` | Tests `InterruptedBanner` + `RestoredSourceNotice`, both deleted. **Delete the file** (it is not in the 7.1 list above only because it tests two components, not SDLC files directly). |
| `src/db/repositories/__tests__/chatRepo.test.ts:5,26-33` | Delete the `getOrCreateSdlcThread` describe. |
| `src/db/repositories/__tests__/chatTabRepo.test.ts:10,81-128` | Delete the `getOrCreateSdlcTab` describes; keep the ordinary-tab tests. |
| `src/services/ai/__tests__/fileReference.test.ts:88-104` | Asserts `clearAllChatHistory` deletes `sdlc_workflow:` settings. If §4.10 removes that line, update the test; if kept, leave. |
| `src/components/ai/__tests__/ChatTabBar.test.tsx` | 28 hits — remove the `sdlc` tab fixture (`:9-12`), all `activeTabId="sdlc"` (`:35,50,66,82,98,113,175,203,223`), the `sdlcStatus` test (`:144,160-161`), and the `icons.length === 2` assertion (`:122`). |
| `src/workbench/__tests__/EditorArea.test.tsx:33-35` | Delete the `vi.mock('../../views/ChangeRequestSdlcView')` block. |
| `src/workbench/__tests__/layoutStore.test.ts:21` | If Option A: change the expected key to `_v3`. If Option B: add a test that a persisted `sdlc` tab is filtered and `activeTabId` re-points. |
| `src/components/icons/__tests__/JetBrainsIcons.test.tsx:7,39-48` | Delete the `JetBrainsSdlcIcon` import and its `it` block. |
| `tests/views/ChangeRequestDetailView.test.tsx` | 9 hits: `:104-123` (progress strip + `sdlc` tab open), `:261-...` (step completion from workflow state). Delete those `it` blocks; the CR detail CRUD tests survive. |
| `tests/components/HierarchyView.test.tsx:104-127` | `onOpenSdlcStudio` prop test — delete. |
| `tests/views/Integration.test.tsx:10` | Comment only ("`cr_detail`/`sdlc` tabs") — reword. |
| `tests/workbench/CRExplorer.test.tsx` | 1 hit — check whether it asserts the `open-sdlc` menu item; if so delete that assertion. |
| `tests/services/backup/restoreBackup.test.ts:175-240` | The `mirrors a restored SDLC tab workflow state` test — delete. |
| `tests/services/backup/validateBackup.test.ts`, `tests/services/backup/exportBackup.test.ts` | **0 direct `sdlc` hits** — but both will exercise the narrowed `type: z.enum(['chat'])` and the removed `workflowState`. Verify they still pass; add a case that an `sdlc` tab is now rejected (AIO-REMOVE-05 / D-06). |
| `tests/utils/noteBody.test.ts` | 1 hit — comment. `readNoteMarkdown` survives (used by notes UI), but its *rationale* comment references `services/wizard/artifactRepo.ts`. Reword the comment in `src/utils/noteBody.ts:2-7`; keep the function. |
| `tests/utils/lineDiff.test.ts`, `tests/services/sdlc/markdownSections.test.ts` | **Keep unchanged** — the utils survive. |

### 7.3 `tests/phase25_1SafetyGates.test.ts` — special case

This file is a **structural gate** that reads other files as text. It will break in five places:

- `:5` imports `buildMergedSdlcInput`, `SdlcSourceRef` from `src/services/wizard/sourceMerge` (deleted).
- `:130-148` `phaseTestFiles` lists 8 files that are being deleted (`sdlcPromptIsolation`, `sdlcWorkflowHub`, `stepInputDocsModal`, `workflowCoordinator`, `stalenessDetector`, `wizardService`, `wizardBackup`, and `chatTabRepo` which survives).
- `:238-245` reads `src/services/wizard/sourceMerge.ts` and asserts its content.
- `:265-272` reads `tests/ai/sdlcPromptIsolation.test.ts` and asserts `buildSdlcWrapperPrompt` — **that symbol does not exist in the current tree** (grep: 0 hits in `src/`), so this assertion is already vacuous or the test is already failing/being skipped. Verify before planning.
- `:289-300` the `buildMergedSdlcInput` invariant fixture.

**Verdict:** the file must be **split**. Keep the parts that guard surviving code (the `useEffect` brace-matching gate `:150-235`, the backup-boundary gate `:234-263` minus the `sourceMerge` assertions, the `isSafeBackupSetting` loop). Delete the `sourceMerge` import, the `phaseTestFiles` entries for deleted files, and the `buildSdlcWrapperPrompt` assertion. This is the single most fragile test in the phase — it fails with `ENOENT` on `fs.readFileSync` if a listed file is deleted before the list is updated, so it must be edited in the same commit as the deletions.

### 7.4 Test count summary

- Delete: **~57 files** (11 co-located + 46 under `tests/` + 3 e2e + 1 fixture).
- Rewrite: **~20 files**.
- Untouched: everything else. `tests/services/ai/office/*` (8 files, Phase 34's AI Office suite) has **zero** SDLC imports — verified.

---

## 8. Deletion Order

**Corrected after plan review.** The earlier version of this section claimed step 7 could delete every leaf module because "all importers were re-pointed in 1-6". That contradicted §4.1 and §4.6: `src/types/models.ts`, `src/validation/schemas.ts`, `src/validation/knowledgeSchemas.ts`, `src/validation/backupSchemas.ts`, `src/db/repositories/chatRepo.ts`, `src/workbench/EditorArea.tsx`, `src/views/ChangeRequestDetailView.tsx`, and the three chat-UI components still imported the delete set at that point. The order below is the one the plans implement.

**The governing constraint:** the wholesale deletion and the domain-field removal are *mutually dependent*. Delete-set files read the fields being removed (`services/wizard/artifactRepo.ts:126,156`, `hubExport.ts:123`, `hubSolution.ts:55`, `hubChangePack.ts:153`, `components/ai/wizard/NoteSourcePickerModal.tsx:179`, `components/sdlc/chat/StepChatPanel.tsx:691`), while `models.ts` / `validation/*` / `backupSchemas.ts` import the modules being deleted. Neither can land alone. Therefore **wave 5 is one atomic cut of five file-disjoint plans**, and `npx tsc --noEmit` must exit 0 at every wave boundary from wave 1 onward. There is no "intentionally mid-surgery" allowance.

| Wave | Plan | Step | Why here |
|---|---|---|---|
| 1 | 01 | Create `src/services/ai/patchProposal.ts`: move `ArtifactPatchProposal`, `ArtifactToolRefusal(+Code)`, `PATCH_LINE_CAP`, `locateSection`, `detectEol`, `applyOperation`, `countLogicalLines`, `refuse`, `isRefusal`, `defaultSha256`; **export** the previously-private core functions. Rewrite its test against `{ target, id }`. | Phase 39 depends on this shape (D-02). Must exist before `sdlcArtifactTools.ts` can be deleted. |
| 1 | 02 | Create `src/services/ai/conventionsSegment.ts` (move `sdlcPromptComposer.ts:323-374`); move `components/sdlc/diff/DiffSyntaxHighlighter.tsx` → `components/common/DiffSyntaxHighlighter.tsx`; re-point `AIChatDrawer.tsx:51` and `RemoteFileViewer.tsx:17`. | Both blocks are dependency-free; both consumers are surviving files. |
| 2 | 03 | Move + rename `ArtifactDiffApprovalCard` → `src/components/ai/widget/PatchDiffApprovalCard.tsx`; re-point `AiChatWidget.tsx:15,491` and its `:4` type import to `patchProposal`. | `AiChatWidget` is the ordinary-chat surface; it must not import from the delete set. |
| 3 | 04 | Rescope the two artifact tools (§6.3) — schemas, dispatch, options plumbing, `chatTurnRuntime` approval branch, and the stale `ArtifactToolContext` import in `tests/ai/chatTurnRuntime.test.ts:13`. | Must precede deleting `sdlcArtifactTools.ts`. |
| 4 | 05 | **Delete all tests in §7.1**; rewrite `tests/phase25_1SafetyGates.test.ts`. | Removes the test-side import edges first, so `tsc` reports only real source breakages. Also unblocks the `phaseTestFiles` list (landmine L8). |
| 5 | 06 | Delete `src/components/sdlc/**`, `src/components/ai/wizard/**`, `src/services/wizard/**`, `src/services/sdlc/**`, `src/services/export/**`, `sdlcSolutionParser.ts`, `changePackPackager.ts`, `researchService.ts`, `wizardService.ts`, `wizardPrompts.ts`, `wizardSchemas.ts`, `sdlcPromptComposer.ts`, `sdlcArtifactTools.ts`; de-wizard `ChatMessageBubble`/`ChatMessageList`. | Safe only because plans 07-10 of this same wave remove the last importers. |
| 5 | 07 | Delete `src/views/ChangeRequestSdlcView.tsx`; delete the 5 launch points + `ChangeRequestTable` prop + `WorkbenchLayout.tsx:201`; prune `EditorViewType`, `EditorArea` branches, `JetBrainsSdlcIcon`; apply AIO-REMOVE-04 (`_v3` key + `RETIRED_VIEW_TYPES` filter + `activeTabId` re-point + `merge` guard). | Same wave as 06 — `EditorArea.tsx:56` imports the view being deleted. |
| 5 | 08 | Chat-UI cleanup: `ChatTabBar.tsx`, `AiChatWidget.tsx`, `AIChatDrawer.tsx`, `useChatTurn.ts`, `ImportPreviewModal.tsx`, trim `InterruptedBanner.tsx`, delete `RestoredSourceNotice.tsx` + `ArtifactEventCard.tsx`; recreate `InterruptedBanner` and artifact-tool-allowlist coverage. | Same wave — `ChatTabBar` narrowing needs `ChatTabType` narrowed by 09; `AIChatDrawer` imports `./wizard/restoreRecovery` deleted by 06. |
| 5 | 09 | Persisted-surface removals: `models.ts`, `validation/schemas.ts`, `knowledgeSchemas.ts`, `documentSetRepo.ts`, `chatRepo.ts`, `chatTabRepo.ts`. | Same wave — every delete-set reader of these fields dies in 06. |
| 5 | 10 | Backup surface: `backupSchemas.ts`, `exportBackup.ts`, `validateBackup.ts`, `restoreBackup.ts`, `types/backup.ts`. | Same wave — `backupSchemas.ts` imports both schema modules deleted by 06. |
| 6 | 11 | Add Dexie `version(18)` purge migration (§5.12). | Last data step: it deletes rows whose shape wave 5 stopped producing. Runs after the code can no longer recreate them. |
| 7 | 12 | Rewrite the §7.2 tests; run the scoped suites; run `tsc`; run the acceptance gates. | Verification. |

**Ordering invariants (violating any produces the Pitfall-1 cascade):**
- Never delete `sdlcArtifactTools.ts` before `chatTurnRuntime.ts`, `aiTools.ts`, `aiOrchestratorLoop.ts`, and `ArtifactDiffApprovalCard.tsx` stop importing it (plans 03-04).
- Never delete `wizardSchemas.ts` or `workflowSchemas.ts` before `models.ts`, `validation/schemas.ts`, `knowledgeSchemas.ts`, `backupSchemas.ts`, `chatRepo.ts`, `EditorArea.tsx`, and `ChangeRequestDetailView.tsx` stop importing them — which is why those edits are in the *same wave*, not a later one.
- Never narrow `ChatTabType` before `restoreBackup.ts` and `validateBackup.ts` stop comparing `type === 'sdlc'` (TypeScript rejects the comparison, but the *behavior* — the duplicate-tab invariant — must be removed deliberately). Plans 08-10 are in one wave for this reason.
- Never delete `components/sdlc/**` before `DiffSyntaxHighlighter` is moved out (plan 02).
- Never apply the `partialize` filter with a direct `viewType !== 'sdlc'` comparison after the union narrows — use `RETIRED_VIEW_TYPES` (TS2367).

## 9. Risks / Landmines

### L1 — Pitfall 1 applied to this specific tree

`PITFALLS.md:20-58` names 7 surviving modules that import SDLC on the hot path. Verified against the live tree, the list is **accurate but incomplete** — the real count is **11 surviving files** with a hard import edge into the delete set:

| # | Surviving module | Edge | In PITFALLS? |
|---|---|---|---|
| 1 | `src/services/ai/aiTools.ts:74` | `executeSdlcArtifactTool`, `ArtifactToolContext` | ✅ |
| 2 | `src/components/ai/runtime/chatTurnRuntime.ts:13-19` | 6 symbols | ✅ |
| 3 | `src/services/ai/aiOrchestratorLoop.ts:14` | `ArtifactToolContext` | ❌ |
| 4 | `src/components/ai/widget/ArtifactDiffApprovalCard.tsx:4` | `ArtifactPatchProposal` | ❌ |
| 5 | `src/components/ai/AiChatWidget.tsx:15` | the card itself | ✅ |
| 6 | `src/components/ai/AIChatDrawer.tsx:51,66` | `buildConventionsSegment`, `deriveMissingSources` | ✅ (only the first) |
| 7 | `src/workbench/editor/RemoteFileViewer.tsx:17` | `DiffLineCodeRenderer` | ✅ |
| 8 | `src/validation/backupSchemas.ts:9-13` | 4 schemas | ❌ |
| 9 | `src/validation/knowledgeSchemas.ts:3` | `SdlcDocumentSetMetadataSchema` | ✅ |
| 10 | `src/validation/schemas.ts:11` | `SdlcArtifactMetadataSchema` | ❌ |
| 11 | `src/types/models.ts:3-7` | 4 types | ❌ |
| 12 | `src/db/repositories/chatRepo.ts:11,16` | `WizardSnapshotSchema`, `SdlcArtifactKindSchema` | ❌ |

Plus 5 more with **behavioral** (not import) coupling: `src/db/index.ts:254-267`, `restoreBackup.ts`, `validateBackup.ts`, `exportBackup.ts:158`, `documentSetRepo.ts`. Total blast radius: **17 surviving files**.

The failure mode is exactly as PITFALLS describes: not a crash, but a cascade of stubs and `any` casts. The §4 table exists so no step needs one.

### L2 — `knowledgeSchemas.ts:123` is inside a `.strict()` object

`src/validation/knowledgeSchemas.ts:104-125` builds `DocumentSetSchema` with `.strict()`. If `sdlc` is removed from `models.ts:377` but left in the zod schema, every knowledge-publish parse still requires the field to be absent — which it will be — so it passes. But if it is left in the schema and *present* in a row, `.strict()` accepts it. The real hazard is the reverse: if `knowledgeSchemas.ts:123` is forgotten, the import of `SdlcDocumentSetMetadataSchema` keeps `wizardSchemas.ts` alive and the build fails. **This file is the knowledge-publish path AIO-REMOVE-03/05 protects — verify it explicitly.**

### L3 — `partialize` does not run on hydration

Zustand `persist` calls `partialize` when **writing**, and `merge` (default: shallow) when **reading**. A `_v2` blob containing an `sdlc` tab is merged into state on first launch *before* any `partialize` call. Therefore:
- **Option A (key bump)** works because the `_v2` blob is never read.
- **Option B (partialize filter)** works only if the filter is *also* applied at hydration — either via the `merge` option (`node_modules/zustand/middleware/persist.d.ts:59`) or by filtering `openTabs` in the store's initializer.
- **Safest:** do both (bump to `_v3` **and** filter), which is cheap and makes AIO-REMOVE-04 true regardless of hydration order.

Also: `EditorArea.tsx:687-688`'s `default: return <TasksView/>` means a stale tab renders Tasks *silently* if the filter misses. That is the exact symptom AIO-REMOVE-04 forbids.

### L4 — Dexie version collision with Phase 36

ROADMAP Phase 36 criterion 1: "Dexie **V18** adds `aiSkillVersions`". `src/db/index.ts` currently ends at `version(17)` (`:492`). Phase 35's purge needs a version. If Phase 35 takes V18, Phase 36's criterion is wrong and must become V19. If Phase 35 defers the purge to Phase 36, the purge and `aiSkillVersions` share one version — but then Phase 35 ships a build that still has SDLC rows and no way to clean them, which contradicts D-05. **Recommendation:** Phase 35 takes V18 with the purge; report the ROADMAP Phase 36 criterion as stale. Also note `SCHEMA_V18` must be added to `src/db/schema.ts` alongside `SCHEMA_V17` (`schema.ts:121-129`).

### L5 — Orphaned `chatMessages` after the purge

`validateBackup.ts:469-509` (and a second copy at `:569-...`) rejects any `chatMessage.threadId` not in `chatThreads`. Deleting `cr:*:sdlc` threads without deleting their messages makes the app's own next export fail validation. The V18 migration must delete messages whose `threadId` is gone. PITFALLS.md:67-73 mentions this ("and their `chatMessages`") — do not skip it.

### L6 — `z.strictObject` on `BackupChatTabRecordSchema` makes export/import changes atomic

`backupSchemas.ts:236-265` is `z.strictObject`. Removing `workflowState` from the schema while `exportBackup.ts:158` still emits it → every export fails validation. Removing it from `exportBackup.ts` while the schema still declares it → `workflowState` is silently dropped on restore (acceptable) but the schema still imports `workflowSchemas`. **Both sides must change in the same commit.**

### L7 — `FORBIDDEN_BACKUP_KEYS` includes `'runtime'` and `'error'`

`backupSchemas.ts:200-205`. The `workflowState` object contains `checkpoint.status: 'error'` as a *value*, not a key — safe. But `findForbiddenBackupKey` (`:207-229`) recurses into **all** nested objects and matches `/(^|_)(...|error)(_|$)/i` against **keys**. Any new persisted field named `error*` or `*error` will be rejected. Relevant only if the rescoped patch proposal is ever persisted — it should not be.

### L8 — `tests/phase25_1SafetyGates.test.ts` fails with `ENOENT`, not a type error

It calls `fs.readFileSync` on paths from `phaseTestFiles` (`:130-148`) and on `src/services/wizard/sourceMerge.ts` (`:238`). Deleting a listed file before editing the list throws at runtime. This test is not type-checked against the filesystem. Edit it in the same commit as the deletions.

### L9 — `researchService.ts` re-exports `escapeShellArg`

`researchService.ts:89` — `export { escapeShellArg } from '../gitRemoteService';`. Nothing imports it *through* `researchService` except `researchService.test.ts` (deleted). The canonical definition (`gitRemoteService.ts:16`) has 6 other consumers. Deleting `researchService.ts` is safe; do not accidentally delete `gitRemoteService.escapeShellArg`.

### L10 — `docx` dependency survives

Deleting `src/services/export/**` removes 6 of 7 `from 'docx'` importers. `src/utils/dynamicFileSandbox.ts:10` still imports `* as docx`, and `src/utils/pptxExport.ts:1` imports `pptxgenjs`. **Do not remove `docx`, `exceljs`, or `pptxgenjs` from `package.json`.**

### L11 — `ArtifactEventCard` / `ChatArtifactEvent` are not in the backup schema

Grep `artifactEvent` in `src/validation` = **0 hits**. So `ChatMessage.artifactEvent` is a Dexie-only field. Deleting it needs no backup-schema change — but it *does* need `chatRepo.ts:88-93,105-133` and `models.ts:288-302,316` removed together, plus `AiChatWidget.tsx:12,33-35,87-89,259-261,505-517`. CONTEXT.md does not list this; it is a judgment call the planner must make explicitly. **Recommend delete** (its only producers are `ChangeRequestSdlcView.tsx:273-310` and `StepChatPanel.tsx`, both deleted).

### L12 — `AiChatScopeKind` narrowing is a public-ish prop type

`AiChatWidget.tsx:18` exports `AiChatScopeKind = 'chat' | 'sdlc'`. Narrowing to `'chat'` breaks `StepChatPanel.tsx:1118-1123` (`kind: 'sdlc'`) — which is deleted, so fine. But `tests/ai/AiChatWidget.test.tsx:449` passes `kind: 'sdlc'` and must change. `scope.kind` is **never read** inside `AiChatWidget` (only `scope.scopeKey`, `scope.label` at `:295,322,348,375`) — the field is decorative. Safe to narrow.

### L13 — `ChatTabBar` has its own duplicate `ChatTabType`

`src/components/ai/ChatTabBar.tsx:28` declares `export type ChatTabType = 'sdlc' | 'chat';` independently of `models.ts:235`. Both must be narrowed. `ChatTabBar`'s `sdlcStatus` prop (`:46`) has **zero callers** (grep: only the declaration and its own uses) — delete it outright.

### L14 — `useChatTurn.ts:96,196` `startsWith('sdlc:')`

`AIChatDrawer` never produces an `sdlc:` scope key (it uses `cr:<id>`, `task:<id>`, etc.). `StepChatPanel` produced `sdlc:<project>:<cr>:<STEP>` and is deleted. The branch is dead after deletion — remove it, but check `tests/ai/useChatTurn.test.tsx:12,63,81` which uses those keys as fixtures.

### L15 — `ChangeRequestDetailView.tsx` is 453 lines with deep SDLC coupling

It has a `useLiveQuery` reading `sdlc_workflow:*` (`:112-127`), `isStepCompleted` (`:129-149`), `openSdlc` (`:169-179`), a header button (`:386-388`), and a 6-step progress strip (`:401-...`). Removing all of it is the largest single-file surgery outside `ChangeRequestSdlcView.tsx`. The file's own test (`tests/views/ChangeRequestDetailView.test.tsx`) has 9 SDLC hits and must be trimmed in the same commit.

## 10. Validation Architecture

`workflow.nyquist_validation` is `true` in `.planning/config.json` (key present, value `true`).

### Test Framework

| Property | Value |
|---|---|
| Framework | Vitest 5.0.2 (`node_modules/vitest`), jsdom environment, `globals: true` |
| Config file | `vite.config.ts` — `test:` block (`environment: 'jsdom'`, `setupFiles: ['./tests/setup.ts']`, `fileParallelism: false`, `testTimeout: 15000`, excludes `e2e/**`) |
| Setup | `tests/setup.ts` — `fake-indexeddb/auto`, `@testing-library/jest-dom/vitest`, Node `Blob` shim, `matchMedia` shim |
| Quick run (single file) | `npx vitest run <path>` |
| Scoped run (a directory) | `npx vitest run src/services/ai src/validation src/db` |
| Full suite | `npm test` — **DO NOT RUN** (project memory: >1 hour) |
| Typecheck | `npx tsc --noEmit` (`tsconfig.json` has `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`) |
| Build | `npm run build` (= `tsc && vite build`) |
| E2E | `npx playwright test e2e/aiChat.spec.ts` (`playwright.config.ts` exists) |
| Lint | **No ESLint config present.** `package.json` has no `lint` script and no `eslint.config.*` / `.eslintrc*` file. CLAUDE.md names ESLint 10.11.0 but it is not installed. Do not plan a lint gate. |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| AIO-REMOVE-01 | `conventionsSegment.ts` exists and `AIChatDrawer` imports it | static grep + typecheck | `grep -n "services/ai/conventionsSegment" src/components/ai/AIChatDrawer.tsx` → 1 hit; `npx tsc --noEmit` | ❌ Wave 0 (new file) |
| AIO-REMOVE-01 | `components/common/DiffSyntaxHighlighter.tsx` exists; `RemoteFileViewer` imports it | static grep | `grep -n "components/common/DiffSyntaxHighlighter" src/workbench/editor/RemoteFileViewer.tsx` → 1 hit | ❌ Wave 0 |
| AIO-REMOVE-01 | `patchProposal.ts` exists and exports the core | unit | `npx vitest run tests/services/ai/patchProposal.test.ts` | ❌ Wave 0 (rewritten from `sdlcArtifactTools.test.ts`) |
| AIO-REMOVE-01 | `PatchDiffApprovalCard` renders a diff and approves/rejects | component | `npx vitest run tests/ai/PatchDiffApprovalCard.test.tsx` | ❌ Wave 0 (rewritten from `ArtifactDiffApprovalCard.test.tsx`) |
| AIO-REMOVE-02 | No SDLC launch point remains | static grep | `grep -rn "viewType: 'sdlc'\|onOpenView?.('sdlc')\|open-sdlc\|titlebar-btn-sdlc" src` → **0 hits** | ✅ (grep) |
| AIO-REMOVE-02 | Delete set is gone | static | `ls src/components/sdlc src/components/ai/wizard src/services/wizard src/services/sdlc src/services/export src/views/ChangeRequestSdlcView.tsx 2>&1 \| grep -c "No such file"` → 6 | ✅ (shell) |
| AIO-REMOVE-02 | No stubs / no `as any` introduced | static grep | `git diff --name-only \| xargs grep -n "as any\|@ts-expect-error\|TODO: replace"` → 0 new hits in touched files | ✅ (review) |
| AIO-REMOVE-03 | Ordinary chat still works | integration | `npx vitest run tests/ai/AiChatWidget.test.tsx tests/ai/AIChatDrawerTabs.test.tsx tests/ai/chatTurnRuntime.test.ts tests/ai/chatTurnTools.test.ts` | ✅ (trimmed) |
| AIO-REMOVE-03 | Knowledge publish still works | unit | `npx vitest run tests/knowledge src/validation` | ✅ |
| AIO-REMOVE-03 | Backup round-trip still works | integration | `npx vitest run tests/services/backup tests/backup` | ✅ (trimmed) |
| AIO-REMOVE-04 | Persisted `sdlc` tab dropped, `activeTabId` re-points | unit | `npx vitest run src/workbench/__tests__/layoutStore.test.ts` — new case: hydrate `openTabs: [{id:'sdlc-x',viewType:'sdlc'},{id:'tasks',viewType:'tasks'}]`, `activeTabId:'sdlc-x'` → expect `openTabs` length 1 and `activeTabId === 'tasks'` | ❌ Wave 0 |
| AIO-REMOVE-04 | Editor never silently renders Tasks for `sdlc` | component | `npx vitest run src/workbench/__tests__/EditorArea.test.tsx` | ✅ (mock removed) |
| AIO-REMOVE-05 | `restoreBackup` creates no SDLC tab | integration | `npx vitest run tests/backup/tabCheckpointBackup.test.ts` — **rewritten**: legacy `chatThreads` with `cr:<id>:sdlc` and no `chatTabs` → expect exactly 1 ordinary tab, 0 `type:'sdlc'` | ❌ Wave 0 (rewrite) |
| AIO-REMOVE-05 | `validateBackup` rejects an `sdlc` tab | unit | `npx vitest run tests/services/backup/validateBackup.test.ts` — new case: envelope with `chatTabs[0].type='sdlc'` → `valid === false` | ❌ Wave 0 |
| AIO-REMOVE-05 | No SDLC invariants remain | static grep | `grep -n "sdlcByScope\|Duplicate SDLC tab\|wizard.changeRequestId\|sdlcArtifact" src/services/backup/validateBackup.ts` → 0 hits | ✅ (grep) |
| — | Dexie V18 purge | unit | new `tests/db/sdlcPurgeMigration.test.ts`: seed `chatTabs{type:'sdlc'}`, `chatThreads{scopeKey:'cr:x:sdlc'}`, `settings{sdlc_workflow:...}`, messages; reopen → all gone, ordinary rows intact | ❌ Wave 0 |
| — | `tests/phase25_1SafetyGates.test.ts` | structural | `npx vitest run tests/phase25_1SafetyGates.test.ts` | ✅ (rewritten) |

### Sampling Rate

- **Per task commit:** `npx tsc --noEmit` (fastest signal that an import edge is dangling) plus `npx vitest run <the files that task touched>`.
- **Per wave merge:** `npx vitest run src tests/services tests/ai tests/backup tests/workbench src/workbench` — **never** bare `npm test`.
- **Phase gate:** `npx tsc --noEmit` clean, the §11 grep equal to the enumerated residual list, and the scoped suites green. Then `/gsd-verify-work`.

### Wave 0 Gaps

- [ ] `src/services/ai/patchProposal.ts` + `tests/services/ai/patchProposal.test.ts`
- [ ] `src/services/ai/conventionsSegment.ts` + renamed `tests/ai/conventionsSegment.test.ts`
- [ ] `src/components/common/DiffSyntaxHighlighter.tsx`
- [ ] `src/components/ai/widget/PatchDiffApprovalCard.tsx` + `tests/ai/PatchDiffApprovalCard.test.tsx`
- [ ] `tests/db/sdlcPurgeMigration.test.ts` (new directory `tests/db/` — currently `tests/db.test.ts` is a file, so use `tests/db/` and confirm no name clash)
- [ ] `src/workbench/__tests__/layoutStore.test.ts` — new persisted-`sdlc`-tab case
- [ ] `tests/services/backup/validateBackup.test.ts` — new `sdlc`-tab-rejected case
- [ ] Framework install: none — Vitest, jsdom, fake-indexeddb, Testing Library all present.

---

## 11. Build & Verification Commands

### Exact scoped commands (never the full suite)

```bash
# Typecheck — the primary signal for a dangling import edge
npx tsc --noEmit

# Build (tsc + vite) — only at the phase gate
npm run build

# Extraction targets
npx vitest run tests/services/ai/patchProposal.test.ts tests/ai/PatchDiffApprovalCard.test.tsx \
  tests/ai/conventionsSegment.test.ts tests/services/multiSystemConventionService.test.ts

# Surviving chat stack
npx vitest run tests/ai/AiChatWidget.test.tsx tests/ai/AIChatDrawerTabs.test.tsx \
  tests/ai/chatTurnRuntime.test.ts tests/ai/chatTurnTools.test.ts tests/ai/aiTools.test.ts \
  tests/ai/useChatTurn.test.tsx tests/ai/ActiveAiTurnIndicator.test.tsx \
  src/components/ai/__tests__ tests/components/HierarchyView.test.tsx

# Backup / validation
npx vitest run tests/services/backup tests/backup tests/validation

# Knowledge publish
npx vitest run tests/knowledge src/validation

# Workbench / layout
npx vitest run src/workbench/__tests__ tests/workbench

# Repositories
npx vitest run src/db/repositories/__tests__ tests/db

# Structural gate
npx vitest run tests/phase25_1SafetyGates.test.ts

# Utils that survive
npx vitest run tests/utils/lineDiff.test.ts tests/services/sdlc/markdownSections.test.ts tests/utils/noteBody.test.ts

# E2E (surviving only)
npx playwright test e2e/aiChat.spec.ts
```

### Grep-based acceptance commands

**A — no SDLC launch point (AIO-REMOVE-02):**
```bash
grep -rn "viewType: 'sdlc'\|onOpenView?.('sdlc')\|open-sdlc\|titlebar-btn-sdlc\|onOpenSdlcStudio" src
# expected: 0 lines
```

**B — delete set gone:**
```bash
for p in src/components/sdlc src/components/ai/wizard src/services/wizard src/services/sdlc \
         src/services/export src/views/ChangeRequestSdlcView.tsx \
         src/services/ai/sdlcArtifactTools.ts src/services/ai/sdlcPromptComposer.ts \
         src/services/ai/wizardSchemas.ts src/services/ai/wizardService.ts \
         src/services/ai/wizardPrompts.ts src/services/ai/researchService.ts \
         src/services/changePackPackager.ts src/utils/sdlcSolutionParser.ts \
         src/components/ai/InterruptedBanner.tsx src/components/ai/RestoredSourceNotice.tsx \
         src/components/ai/artifacts/ArtifactEventCard.tsx; do
  [ -e "$p" ] && echo "STILL EXISTS: $p"
done
# expected: no output
```

**C — residual `sdlc|Sdlc` set (replaces AIO-REMOVE-02's stale "legacy-schema hits" clause).** After the phase, `grep -rn "sdlc\|Sdlc" src` must return **only** these classes:

1. **Dexie migration history** — `src/db/index.ts:254-267` (the V14 `.upgrade()` hook; immutable history).
2. **The new V18 purge** — the `type === 'sdlc'` / `:sdlc` / `sdlc_workflow:` comparisons inside `this.version(18).upgrade(...)`.
3. **Neutral identifiers with no SDLC behavior** — `src/utils/lineDiff.ts:2` and `src/utils/markdownSections.ts:2` (comments), `src/utils/noteBody.ts:2-7` (comment, reworded), `src/assets/logo.svg` (arbitrary path data), `src/services/ai/office/*` (zero hits — confirmed).
4. **Nothing else.**

```bash
grep -rn "sdlc\|Sdlc" src | grep -v "src/db/index.ts" | grep -v "src/utils/lineDiff.ts" \
  | grep -v "src/utils/markdownSections.ts" | grep -v "src/utils/noteBody.ts" | grep -v "src/assets/logo.svg"
# expected: 0 lines
```

**D — no SDLC schema survives (C-16):**
```bash
grep -rn "SdlcArtifactMetadata\|SdlcDocumentSetMetadata\|SdlcWorkflowState\|SdlcArtifactKind\|WizardSnapshot\|SdlcStepId\|SdlcCheckpoint" src
# expected: 0 lines
```

**E — no legacy shim was created:**
```bash
[ -e src/types/legacySdlc.ts ] && echo "VIOLATION: legacySdlc.ts exists"
[ -e src/services/ai/office/teamRunManager.ts ] && echo "VIOLATION: teamRunManager.ts exists"
# expected: no output
```

**F — no stubs / no escape hatches:**
```bash
git diff master --name-only -- src | xargs grep -n "as any\|@ts-expect-error\|@ts-ignore\|TODO: replace\|not implemented"
# expected: 0 new hits (pre-existing hits in untouched files are out of scope)
```

**G — `ChatTabType` narrowed:**
```bash
grep -rn "export type ChatTabType" src
# expected: exactly 1 line, src/types/models.ts, value 'chat'
grep -rn "'sdlc'" src/components/ai/ChatTabBar.tsx src/types/models.ts src/validation/backupSchemas.ts
# expected: 0 lines
```

**H — no SDLC rows survive a launch (manual, Tauri):** launch the app against an existing dev DB, then in devtools:
```js
(await db.chatTabs.where('type').equals('sdlc').count())   // 0
(await db.chatThreads.filter(t => t.scopeKey.endsWith(':sdlc')).count())  // 0
(await db.settings.filter(s => String(s.key).startsWith('sdlc_workflow:')).count())  // 0
```

### Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| Node.js | all tooling | ✓ | v24.16.0 | — |
| npm | install/scripts | ✓ | 11.13.0 | — |
| Vitest | scoped tests | ✓ | 5.0.2 | — |
| TypeScript | typecheck | ✓ | `^7.0.2` in `package.json` | — |
| Playwright | e2e | ✓ | `^1.63.0` | skip e2e; jsdom covers the rest |
| fake-indexeddb | Dexie tests | ✓ | `^6.2.5` | — |
| ESLint | (CLAUDE.md names it) | ✗ | — | **no lint gate exists; do not plan one** |
| Prettier | (CLAUDE.md names it) | ✗ | — | no formatting gate exists |
| Tauri CLI | manual H-check | ✓ | `^2.2.0` | run the Vite dev server in a browser (IndexedDB path identical) |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** ESLint/Prettier — not installed, not scripted; verification is `tsc` + scoped Vitest.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | The rescoped `ArtifactPatchProposal` shape (`target`/`id` instead of `scopeKey`/`changeRequestId`/`crId`/`kind`/`version`) is what Phase 39 needs | §2 Asset 3, §6.3 | Phase 39 rework. Mitigated: CONTEXT.md D-03 only fixes the *scope* (`{noteId}|{skillId}`), not the field names; the planner should treat field names as Claude's discretion and keep `sectionId`/`expectedHeading`/`baseHash`/`operation`/`newContent` identical to today. |
| A2 | `ChatMessage.artifactEvent` / `ChatArtifactEvent` should be deleted (CONTEXT.md does not list them) | §1 C14, §9 L11 | Low — no backup schema references them; only SDLC producers write them. If kept, `ArtifactEventCard` must also be kept, contradicting CONTEXT D-08's spirit. |
| A3 | Phase 35 should take Dexie V18 and Phase 36's `aiSkillVersions` becomes V19 | §5.12, §9 L4 | ROADMAP Phase 36 criterion 1 becomes stale. Alternative: share V18 across both phases — but then Phase 35 ships unclean rows. |
| A4 | `partialize` alone does not satisfy AIO-REMOVE-04 because it does not run on hydration | §5.2, §9 L3 | If wrong, Option B works with 6 lines and no key bump. Mitigated by recommending "both". |
| A5 | `tests/phase25_1SafetyGates.test.ts:270` asserting `buildSdlcWrapperPrompt` is already stale (0 hits in `src/`) | §7.3 | If the symbol exists under another name, the assertion is live and must be re-pointed rather than deleted. Verify before planning. |
| A6 | `src/services/export/**` is entirely deletable (7 files) once `wizardDocx.ts` goes | §1 C12, §3.1 | If some export builder has a non-SDLC consumer, that file survives. Verified: no `src/` importer outside `services/export` and `services/wizard`. |
| A7 | No ESLint/Prettier gate exists despite CLAUDE.md naming them | §10, §11 | If a hidden CI lint step exists, deletions may trip unused-import rules. `tsc`'s `noUnusedLocals` already covers the important case. |

---

## Open Questions (RESOLVED)

1. **Does Phase 35 own the Dexie version number, or does Phase 36?** — **(RESOLVED: Phase 35 takes V18.)**
   - What we knew: `src/db/index.ts` ends at `version(17)`. D-05 requires deleting SDLC rows. ROADMAP Phase 36 claims V18 for `aiSkillVersions`.
   - Resolution: Phase 35 takes V18 (the purge); Phase 36's `aiSkillVersions` becomes V19. A build that ships SDLC rows with no cleanup path contradicts D-05 and C-16. Implemented by plan 11; the ROADMAP Phase 36 criterion is recorded as stale.

2. **Should `ChatMessage.artifactEvent` / `ChatArtifactEvent` / `ArtifactEventCard` be deleted?** — **(RESOLVED: delete all three.)**
   - What we knew: CONTEXT.md's DELETE table lists `ArtifactEventCard` but not the two `ChatMessage` fields. No backup schema references them. Their only producers are deleted views.
   - Resolution: delete now. Phase 39 can reintroduce a typed card for skill versions. Keeping it would require keeping `SdlcArtifactKind` alive, which C-16 forbids. Implemented by plans 06, 08, 09.

3. **`interrupted` checkpoint recovery for ordinary chat.** — **(RESOLVED: trim `InterruptedBanner`, do not delete it.)**
   - What we knew: `InterruptedBanner` (`AIChatDrawer.tsx:2580`) also renders for `activeRuntime?.status === 'interrupted'` — a **non-SDLC** path. The banner's default copy is generic. Only its `SdlcCheckpoint` type import (`:3`) and the `activeCheckpoint` branch (`:2562`) are SDLC.
   - Resolution: keep a **trimmed** `InterruptedBanner` with the `SdlcCheckpoint` import and the `checkpoint` prop removed; the `activeRuntime.status === 'interrupted'` path is ordinary-chat behavior that must not regress. Coverage is recreated in `src/components/ai/__tests__/InterruptedBanner.test.tsx` because plan 05 deletes the only existing test. Implemented by plan 08.

4. **`RestoredSourceNotice` / `deriveMissingSources` — delete or keep?** — **(RESOLVED: delete both.)**
   - What we knew: both are fed exclusively by `sdlc_workflow:*` settings (`AIChatDrawer.tsx:956-974`). Under D-05 those rows are purged, so both become permanently dead.
   - Resolution: delete both, plus `BackupRecoveryInfo` (`types/backup.ts:46-49`), the `recovery` field (`:143`), and `ImportPreviewModal.tsx:134-147,303-310`. Implemented by plans 08 and 10.

## Sources

### Primary (HIGH confidence — read directly from the live tree)
- `src/services/ai/sdlcPromptComposer.ts` (614 lines, read in full)
- `src/services/ai/sdlcArtifactTools.ts` (677 lines, read in full)
- `src/components/sdlc/diff/DiffSyntaxHighlighter.tsx` (130 lines, read in full)
- `src/components/ai/widget/ArtifactDiffApprovalCard.tsx` (85 lines, read in full)
- `src/services/backup/restoreBackup.ts:55-205,245-335`
- `src/services/backup/validateBackup.ts:240-260,380-580,720-740`
- `src/validation/backupSchemas.ts:140-175,195-265,270-340,435-460`
- `src/workbench/store/layoutStore.ts:1-140,320-371`
- `src/workbench/EditorArea.tsx:38-115,575-700`
- `src/services/ai/aiTools.ts:99-112,1855-1995,2110-2215,4755-4810,4933-5040`
- `src/components/ai/runtime/chatTurnRuntime.ts:1-60,152-215,270-430`
- `src/services/ai/aiOrchestratorLoop.ts:1-60,170-190,405-425`
- `src/services/ai/chatTurnTools.ts` (full, 74 lines)
- `src/types/models.ts:195-215,225-275,285-320,365-390`
- `src/db/repositories/chatRepo.ts:28-40,80-180,240-281`
- `src/db/repositories/chatTabRepo.ts:1-135,200-240`
- `src/db/repositories/documentSetRepo.ts:15-95,140-240`
- `src/db/index.ts:55-100,230-300,480-495`
- `src/db/schema.ts:95-129`
- `src/components/ai/AiChatWidget.tsx:1-100,470-520`
- `src/components/ai/AIChatDrawer.tsx:1-70,950-1090,2380-2420,2540-2600`
- `src/components/ai/ChatMessageBubble.tsx:50-70,88-110,380-470`
- `src/components/ai/ChatTabBar.tsx:25-70,335-350,495-560`
- `src/views/ChangeRequestDetailView.tsx:1-200,375-425`
- `src/views/SystemDetailView.tsx:120-230,285-300,530-560`
- `src/workbench/TitleBar.tsx:10-22,240-280`
- `src/workbench/toolwindows/CRExplorer.tsx:95-145`
- `src/workbench/WorkbenchLayout.tsx:180-215`
- `src/components/changeRequests/ChangeRequestTable.tsx:138-155,405-425,460-470`
- `src/utils/lineDiff.ts`, `src/utils/markdownSections.ts`, `src/utils/noteBody.ts`, `src/utils/sdlcSolutionParser.ts`
- `src/services/ai/researchService.ts` (exports), `wizardService.ts` (exports), `wizardPrompts.ts` (imports)
- `src/services/wizard/workflowCoordinator.ts:1-70`
- `src/validation/schemas.ts:418-450`, `src/validation/knowledgeSchemas.ts:112-130`
- `package.json`, `vite.config.ts`, `tsconfig.json`, `playwright.config.ts`, `.planning/config.json`
- `node_modules/zustand/middleware/persist.d.ts:9-59` (persist `partialize` vs `merge` semantics)

### Secondary (MEDIUM confidence)
- `.planning/phases/35-.../35-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/MILESTONE-CONTEXT.md`, `.planning/STATE.md`
- `.planning/research/ARCHITECTURE.md` (§2.4 keep verdicts — **overridden by C-16**), `PITFALLS.md` (Pitfall 1/2), `SUMMARY.md` (conflicts)
- `CLAUDE.md` (stack versions; ESLint/Prettier named but absent)

### Tertiary (LOW confidence)
- None. Every claim above is a direct read or grep of the live tree.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; the phase is pure deletion + relocation.
- Architecture (delete/extract boundaries): HIGH — every edge enumerated by grep with file:line.
- Persisted surface: HIGH — every line read directly.
- Rescoped tool shape: MEDIUM — no code exists; the field names are a design choice (A1).
- Pitfalls: HIGH — derived from the live tree, extending PITFALLS.md's list from 7 to 17 files.

**Research date:** 2026-11-09
**Valid until:** ~2026-12-09 (30 days) — but the tree map is only valid until the first Phase 35 commit; re-grep after any extraction lands.

