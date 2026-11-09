# Phase 35: Shared-primitive extraction + SDLC behavior removal - Context

**Gathered:** 2026-11-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Extract the primitives AI Office reuses, then delete every SDLC Studio behavior entry point — without breaking ordinary chat, knowledge publish, or backup.

**In scope:** extraction of `buildConventionsSegment`, `DiffSyntaxHighlighter`, the artifact patch core, and the coordinator registry; deletion of SDLC views, wizard components, services, launch points, the `sdlc` editor view type, SDLC Dexie rows, SDLC backup schema fields, and the three SDLC history cards.

**Out of scope:** the group-chat data model, multi-chat identity, budget work, skill versioning, explorer redesign. Those are Phases 36–40.

**Governing principle from the user:** *the app has never run in production — every row in Dexie is test data. Do not preserve SDLC data for its own sake. Keep only tooling that is genuinely reusable.*

</domain>

<decisions>
## Implementation Decisions

### Artifact tools — keep the reusable half
- **D-01:** Keep `get_artifact` and `patch_artifact_section`. Delete `propose_subsystems` and `propose_research` — both are CR/SDLC-specific and have no meaning in a free-style AI Office (C-06).
- **D-02:** Extract the patch core (`locateSection`, `applyOperation`, `detectEol`, `createUnifiedLineDiff` wiring) from `src/services/ai/sdlcArtifactTools.ts` into a new `src/services/ai/patchProposal.ts`. Phase 39 skill enrichment reuses this — it must not be rebuilt from scratch.
- **D-03:** The two surviving tools change scope from `{ changeRequestId, stepId }` to `{ noteId }` or `{ skillId }`. No CR, no SDLC step. This satisfies C-06/C-07 and lets Phase 39 reuse the same signature.
- **D-04:** `ArtifactDiffApprovalCard` is kept and generalized as `PatchDiffApprovalCard` — it is the approval surface for any patch, including skill versions in Phase 39.

### SDLC persisted data — delete
- **D-05:** Delete SDLC rows outright: `chatTabs` with `type='sdlc'`, `chatThreads` whose `scopeKey` ends `:sdlc`, and `settings` keys matching `sdlc_workflow:*`. No archival, no filtering-only approach.
- **D-06:** Narrow the backup tab-type enum from `z.enum(['chat','sdlc'])` to `z.enum(['chat'])` in Phase 35. A legacy backup containing an `sdlc` tab is rejected — acceptable because all data is test data.
- **D-07:** `restoreBackup` must stop *creating* SDLC tabs and threads for CRs whose `chatTabs` are absent. The generator at `restoreBackup.ts:80-140` is removed, not merely bypassed.

### SDLC history cards — delete
- **D-08:** Delete `DocumentPreviewCard`, `SolutionReviewCard`, and `GapFillQuestionCard`. None is reusable: they are bound to `ReconciliationResult`, `templateSection`, and `WizardSavedNoteBanner` respectively. Old `ChatMessage.wizard` rows render as ordinary text.

### Note artifact metadata — delete
- **D-09:** Remove `Note.sdlcArtifact` entirely — from the Note type, from `backupSchemas.ts:154`, and from the integrity checks at `validateBackup.ts:513-540`. No neutral replacement field in this phase.

### Confirmed by research (carried forward, not re-decided)
- **D-10:** `buildConventionsSegment` moves to `src/services/ai/conventionsSegment.ts` — `AIChatDrawer.tsx:51` is a live consumer.
- **D-11:** `DiffSyntaxHighlighter` moves to `src/components/common/` — `RemoteFileViewer.tsx:17` is a live consumer.
- **D-12:** The coordinator registry moves out of `TeamWorkspace.tsx` into `src/services/ai/office/teamRunManager.ts`.
- **D-13:** Four persisted schema modules survive as type-only legacy in `src/types/legacySdlc.ts`: `workflowSchemas.ts`, `ai/wizardSchemas.ts`, `wizard/changePack.ts`, `wizard/reconciliation.ts`. Backup envelope v11 validates them; deleting the files breaks import of any existing backup.
- **D-14:** `groundingBuilder.ts` is NOT shared — delete it.

### Claude's Discretion
- Exact file split inside `patchProposal.ts`.
- Whether `SafeMarkdown` is deleted (ARCHITECTURE recommends delete; STACK recommends relocate) — verify by grep during execution.
- Order of deletion within the phase, provided extraction lands first.
- Whether `LAYOUT_STORAGE_KEY` bumps to `_v3` or the existing `partialize` gains a view-type filter — both satisfy AIO-REMOVE-04.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone authority
- `.planning/MILESTONE-CONTEXT.md` — C-01..C-15 are LOCKED user decisions; R-01..R-21 are OPEN. C-02 (delete SDLC completely, audit shared first) and C-15 (no completion claim without observed verification) govern this phase.
- `.planning/REQUIREMENTS.md` § SDLC Studio Removal — AIO-REMOVE-01..05 are this phase's acceptance criteria.
- `.planning/ROADMAP.md` § Phase 35 — success criteria and research flag.

### Research
- `.planning/research/ARCHITECTURE.md` — the per-module SDLC audit table (delete now / extract first / keep) is the authoritative verdict list. Re-verify against the live tree before deleting.
- `.planning/research/PITFALLS.md` — Pitfalls 1 (delete-by-file-list), 2/3 (persisted rows and backup enum), 22 (`targetAgentId`), 23 (five coordinated table lists).
- `.planning/research/SUMMARY.md` — § Phase 35 and § Conflicts Between Research Files (four open conflicts; D-05/D-06/D-08/D-09 resolve three of them).

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
- `renderSafeMarkdown` — the markdown renderer ordinary chat uses; the SDLC wrapper `SafeMarkdown` is redundant.
- `buildSectionIndex` / `splitLines` (`src/utils/markdownSections.ts`) — section addressing for patches; survives extraction.
- `useLiveQuery` — the pattern every workbench view uses to read Dexie.

### Established Patterns
- Tool dispatch is a single `switch` on normalized tool name inside `executeAiTool` (`src/services/ai/aiTools.ts:~2200`); removing a tool means removing its `case` and its definition entry.
- `EditorArea` renders by `switch (tab.viewType)` with a `default:` branch — an unknown persisted view type silently renders the default view. This is why AIO-REMOVE-04 exists.
- Zustand `persist` with an explicit `partialize` allowlist — new persisted fields must be added there or they vanish on reload.
- Backup schemas are validated on import; `FORBIDDEN_BACKUP_KEYS` (`backupSchemas.ts:200-221`) rejects field names matching `prompt|error|stack|diagnostic|secret|token|runtime|partial`.

### Integration Points
- `src/services/ai/aiTools.ts` — tool definitions (~1867-1957) and dispatch (~2203-2208).
- `src/components/ai/runtime/chatTurnRuntime.ts` — imports `executeSdlcArtifactTool`, `prepareArtifactPatch`, and the artifact result types.
- `src/services/ai/aiOrchestratorLoop.ts:14` — imports `ArtifactToolContext` as a type only.
- `src/workbench/toolwindows/` — five SDLC launch points live in TitleBar, CRExplorer, ChangeRequestsView, SystemDetailView, ChangeRequestDetailView.

</code_context>

<specifics>
## Specific Ideas

- The user's framing: *"giữ lại công cụ tái sử dụng được của sdlc, xoá hết"* — keep reusable tooling, delete everything else. Data preservation is explicitly not a goal.
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
