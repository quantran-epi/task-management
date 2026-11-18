# Phase 35: Shared-primitive extraction + SDLC behavior removal - Context

**Gathered:** 2026-11-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Extract the primitives AI Office reuses, then delete every SDLC Studio behavior entry point — without breaking ordinary chat, knowledge publish, or backup.

**In scope:** extraction of `buildConventionsSegment`, `DiffSyntaxHighlighter`, the artifact patch core, and the coordinator registry; deletion of SDLC views, wizard components, services, launch points, the `sdlc` editor view type, SDLC Dexie rows, SDLC backup schema fields, and the three SDLC history cards.

**Out of scope:** the group-chat data model, multi-chat identity, budget work, skill versioning, explorer redesign. Those are Phases 36–40.

**Governing principle — C-16:** *The app has never run in production. Every row in Dexie, SQLite, and backup is test data. There is no data-preservation requirement.* Delete SDLC data, schemas, types, backup fields, and migration paths along with the feature. Keep only code whose **functionality** AI Office reuses. Any decision to "keep X so an old backup still imports" or "keep a schema so rows aren't lost" is wrong for this milestone.

</domain>

<decisions>
## Implementation Decisions

### The complete keep/delete inventory

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

### Artifact tools — rescope, don't rebuild
- **D-01:** Keep `get_artifact` and `patch_artifact_section`. Delete `propose_subsystems` and `propose_research`.
- **D-02:** Extract the patch core into `src/services/ai/patchProposal.ts` — Phase 39 reuses it; it must not be rebuilt.
- **D-03:** Rescope both tools from `{ changeRequestId, stepId }` to `{ noteId }` or `{ skillId }`. No CR, no SDLC step (C-06/C-07).
- **D-04:** `ArtifactDiffApprovalCard` becomes `PatchDiffApprovalCard` — the approval surface for any patch, including skill versions in Phase 39.

### SDLC persisted data — delete
- **D-05:** Delete SDLC rows: `chatTabs` with `type='sdlc'`, `chatThreads` whose `scopeKey` ends `:sdlc`, `settings` keys matching `sdlc_workflow:*`. No archival, no filter-only approach.
- **D-06:** Narrow the backup tab-type enum to `z.enum(['chat'])`. A legacy backup containing an `sdlc` tab is rejected — acceptable under C-16.
- **D-07:** `restoreBackup` stops creating SDLC tabs and threads. The generator at `restoreBackup.ts:80-140` is removed, not bypassed.

### SDLC history cards — delete
- **D-08:** Delete `DocumentPreviewCard`, `SolutionReviewCard`, `GapFillQuestionCard`, and the `ChatMessage.wizard` render branch in `ChatMessageBubble.tsx:392-460`. None is reusable.

### Note artifact metadata — delete
- **D-09:** Remove `Note.sdlcArtifact` entirely — type, `backupSchemas.ts:154`, `validateBackup.ts:513-540`.

### Confirmed by research (carried forward, not re-decided)
- **D-10:** `buildConventionsSegment` → `src/services/ai/conventionsSegment.ts` — `AIChatDrawer.tsx:51` is a live consumer.
- **D-11:** `DiffSyntaxHighlighter` → `src/components/common/` — `RemoteFileViewer.tsx:17` is a live consumer.
- **D-12:** ~~Coordinator registry → `teamRunManager.ts`~~ — **removed from Phase 35.** `TeamWorkspace.tsx` contains zero SDLC code (verified by grep); relocating its registry is an AI Office improvement belonging to Phase 37 or 40, not a deletion phase.

### Claude's Discretion
- Exact file split inside `patchProposal.ts`.
- Whether `SafeMarkdown` is deleted or relocated — verify by grep during execution.
- Deletion ordering within the phase, provided extraction lands first.
- Whether `LAYOUT_STORAGE_KEY` bumps to `_v3` or `partialize` gains a view-type filter — both satisfy AIO-REMOVE-04.
- Whether `InterruptedBanner` is replaced by a plain-text notice or dropped entirely.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone authority
- `.planning/MILESTONE-CONTEXT.md` — C-01..C-16 are LOCKED user decisions; R-01..R-21 are OPEN. **C-16 is the governing rule for this phase: the app has never run in production, all data is test data, no data preservation.** C-02 (delete SDLC completely, audit shared first) and C-15 (no completion claim without observed verification) also apply.
- `.planning/REQUIREMENTS.md` § SDLC Studio Removal — AIO-REMOVE-01..05 are this phase's acceptance criteria.
- `.planning/ROADMAP.md` § Phase 35 — success criteria and research flag.

### Research — read with C-16 applied
- `.planning/research/ARCHITECTURE.md` — the per-module SDLC audit table. **Its "KEEP as type-only legacy" verdicts for the four schema modules are overridden by C-16 — delete them.** Re-verify the rest against the live tree.
- `.planning/research/PITFALLS.md` — Pitfall 1 (delete-by-file-list) still applies. **Pitfalls 2/3 (persisted rows, backup enum) are downgraded by C-16: delete the rows and reject old backups rather than preserving compatibility.**
- `.planning/research/SUMMARY.md` — § Phase 35. **§ Conflicts Between Research Files items 1 and 2 (SDLC row deletion, backup version bump) are resolved by C-16: delete rows, do not preserve.**

### Code — extraction targets
- `src/services/ai/sdlcPromptComposer.ts` — source of `buildConventionsSegment`; consumer at `src/components/ai/AIChatDrawer.tsx:51`.
- `src/components/sdlc/diff/DiffSyntaxHighlighter.tsx` — consumer at `src/workbench/editor/RemoteFileViewer.tsx:17`.
- `src/services/ai/sdlcArtifactTools.ts` — source of the patch core; consumers at `src/services/ai/aiTools.ts:74,2203-2208` and `src/components/ai/runtime/chatTurnRuntime.ts:19`.
- `src/components/ai/widget/ArtifactDiffApprovalCard.tsx` — consumer at `src/components/ai/AiChatWidget.tsx:15,491`.

### Code — deletion surface
- `src/workbench/store/layoutStore.ts` — `EditorViewType` includes `'sdlc'`; `LAYOUT_STORAGE_KEY` at line 106; `partialize` at line 347.
- `src/workbench/EditorArea.tsx` — `'sdlc'` branches at lines 89 and 615.
- `src/validation/backupSchemas.ts` — line 154 (`sdlcArtifact`), line 241 (`type` enum), line 447 (`sdlc` document-set metadata).
- `src/services/backup/restoreBackup.ts` — `legacyTabRows` at 80-140 creates SDLC tabs; `sdlc_workflow:*` keys at 261 and 302.
- `src/services/backup/validateBackup.ts` — SDLC invariants at 394-413 and 513-560.
- `src/views/ChangeRequestSdlcView.tsx`, `src/components/sdlc/**`, `src/components/ai/wizard/**`, `src/services/wizard/**` (except the four legacy schemas).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `createUnifiedLineDiff` (`src/utils/lineDiff.ts:110`) — already the diff engine for patch proposals; no new diff dependency.
- `buildSectionIndex` / `splitLines` (`src/utils/markdownSections.ts`) — section addressing for patches; survives extraction.
- `renderSafeMarkdown` — the markdown renderer ordinary chat uses; the SDLC wrapper `SafeMarkdown` is redundant.
- `useLiveQuery` — the pattern every workbench view uses to read Dexie.

### Established Patterns
- Tool dispatch is a single `switch` on normalized tool name inside `executeAiTool` (`src/services/ai/aiTools.ts:~2200`); removing a tool means removing its `case` and its definition entry.
- `EditorArea` renders by `switch (tab.viewType)` with a `default:` branch — an unknown persisted view type silently renders the default view. This is why AIO-REMOVE-04 exists.
- Zustand `persist` with an explicit `partialize` allowlist — new persisted fields must be added there or they vanish on reload.
- Backup schemas are validated on import; `FORBIDDEN_BACKUP_KEYS` (`backupSchemas.ts:200-221`) rejects field names matching `prompt|error|stack|diagnostic|secret|token|runtime|partial`.

### Deletion order (extraction must land first)
1. Extract assets 1–4 from the KEEP table.
2. Rescope `get_artifact` / `patch_artifact_section` to `{ noteId } | { skillId }` (D-03).
3. Remove SDLC metadata fields from types and Dexie schema: `Note.sdlcArtifact`, `ChatMessage.wizard`, `ChatTab.workflowState`, `DocumentSet.sdlc`, `ChatTabType`.
4. Delete the four schema modules and every remaining SDLC file.
5. Delete the SDLC rows and the `restoreBackup` generator.
6. Prune `EditorViewType`, `EditorArea` branches, and persisted-tab handling.

### Integration Points
- `src/services/ai/aiTools.ts` — tool definitions (~1867-1957) and dispatch (~2203-2208).
- `src/components/ai/runtime/chatTurnRuntime.ts` — imports `executeSdlcArtifactTool`, `prepareArtifactPatch`, and the artifact result types.
- `src/services/ai/aiOrchestratorLoop.ts:14` — imports `ArtifactToolContext` as a type only.
- `src/workbench/toolwindows/` — five SDLC launch points live in TitleBar, CRExplorer, ChangeRequestsView, SystemDetailView, ChangeRequestDetailView.

</code_context>

<specifics>
## Specific Ideas

- The user's framing: *"giữ lại công cụ tái sử dụng được của sdlc, xoá hết"* — keep reusable tooling, delete everything else.
- The user's rule, verbatim: *"app toàn dữ liệu test, app đang xây dựng, data không cần giữ gì hết, chỉ cần giữ functionality"* — this is C-16 and it overrides every research recommendation about compatibility.
- Phase 39 depends on D-02 and D-03: skill enrichment approval uses the same patch core and the same `{ skillId }` scope. Getting the extraction shape right here avoids rework there.

</specifics>

<deferred>
## Deferred Ideas

- Multi-chat thread identity, budget scope, and the `aiSkillVersions` table — Phase 36.
- Skill enrichment UI and version restore — Phase 39.
- Explorer two-section redesign and the single AI Office trigger — Phase 40.
- Peer-to-peer agent chat — explicitly out of scope for the milestone (R-10).

</deferred>

---

*Phase: 35-Shared-primitive extraction + SDLC behavior removal*
*Context gathered: 2026-11-09*
