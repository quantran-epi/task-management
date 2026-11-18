---
phase: 35-shared-primitive-extraction-sdlc-behavior-removal
reviewed: 2026-11-10T08:57:54Z
depth: standard
files_reviewed: 45
files_reviewed_list:
  - src/components/ai/AIChatDrawer.tsx
  - src/components/ai/AiChatWidget.tsx
  - src/components/ai/ChatMessageBubble.tsx
  - src/components/ai/ChatMessageList.tsx
  - src/components/ai/ChatTabBar.tsx
  - src/components/ai/ChatTabToolbox.tsx
  - src/components/ai/InterruptedBanner.tsx
  - src/components/ai/runtime/chatTurnRuntime.ts
  - src/components/ai/runtime/useChatTurn.ts
  - src/components/ai/widget/PatchDiffApprovalCard.tsx
  - src/components/changeRequests/ChangeRequestTable.tsx
  - src/components/common/DiffSyntaxHighlighter.tsx
  - src/components/icons/JetBrainsIcons.tsx
  - src/components/settings/ImportPreviewModal.tsx
  - src/db/index.ts
  - src/db/schema.ts
  - src/db/repositories/chatRepo.ts
  - src/db/repositories/chatTabRepo.ts
  - src/db/repositories/documentSetRepo.ts
  - src/services/ai/aiOrchestratorLoop.ts
  - src/services/ai/aiTools.ts
  - src/services/ai/chatTurnTools.ts
  - src/services/ai/conventionsSegment.ts
  - src/services/ai/patchProposal.ts
  - src/services/backup/exportBackup.ts
  - src/services/backup/restoreBackup.ts
  - src/services/backup/validateBackup.ts
  - src/types/backup.ts
  - src/types/models.ts
  - src/utils/lineDiff.ts
  - src/utils/markdownSections.ts
  - src/utils/noteBody.ts
  - src/validation/backupSchemas.ts
  - src/validation/knowledgeSchemas.ts
  - src/validation/schemas.ts
  - src/views/ChangeRequestDetailView.tsx
  - src/views/ChangeRequestsView.tsx
  - src/views/SystemDetailView.tsx
  - src/workbench/EditorArea.tsx
  - src/workbench/TitleBar.tsx
  - src/workbench/WorkbenchLayout.tsx
  - src/workbench/editor/RemoteFileViewer.tsx
  - src/workbench/store/layoutStore.ts
  - src/workbench/toolwindows/CRExplorer.tsx
  - src/workbench/toolwindows/RemoteTerminalPanel.tsx
findings:
  critical: 3
  warning: 6
  info: 6
  total: 15
  necessity: 6
status: issues_found
---

# Phase 35: Code Review Report

**Reviewed:** 2026-11-10T08:57:54Z
**Depth:** standard
**Files Reviewed:** 45 (surviving non-test `src/` files; 117 deleted `src/` files reviewed through diff metadata)
**Status:** issues_found

## Summary

**Scope honesty (resolver degraded).** `gsd-tools.cjs check evaluation-scope --phase 35 --raw` reported `status: resolved` but returned only 6 files from 2 of 12 plan commits (`59849fac`, `9ae8183f`, both 35-02), with `missingOnDisk: 3` and `unreachable: 17f392ae, e7a0e532`. The phase was cherry-picked, so the SUMMARY commit hashes are unreachable. Review scope therefore used the proven phase anchor `d504a18f..HEAD` (233 files, +1484/−43414; 117 deleted, 45 surviving non-test source files). A 6-file "clean" review would have been false; treat the counts above as anchored to `d504a18f..HEAD`.

Phase 35 does the bulk deletion correctly: SDLC views, wizard, prompts, docx exporters, artifact repo, and their tests are gone; `EditorViewType`, `ChatTabType`, `ChatMessage.wizard/artifactEvent`, `Note.sdlcArtifact`, `DocumentSet.sdlc`, and backup envelope `recovery` are all removed from the type layer; call sites in `EditorArea`, `TitleBar`, `WorkbenchLayout`, `CRExplorer`, `ChangeRequestTable`, `SystemDetailView`, `ChangeRequestsView`, `ChangeRequestDetailView` are cleaned without leaving dangling imports. The extracted primitives (`patchProposal.ts`, `conventionsSegment.ts`, `DiffSyntaxHighlighter` move) are faithful ports.

The problems are at the seams the deletion crossed:

1. **Persistence schemas and migration disagree.** `DocumentSetSchema` became `.strict()` while rows still carry `sdlc`, and V18 never purges `documentSets` — editing an existing set throws.
2. **Backup envelope shape changed without a version bump.** `BackupChatTabRecordSchema` now rejects `type: 'sdlc'`, but `CURRENT_SCHEMA_VERSION` stays `11`, so every pre-35 backup (all of which contain auto-created SDLC tabs) fails validation before normalization can strip them.
3. **The approval flow approves nothing.** `patchProposal.preparePatch` never writes, `patchedMarkdown` has no writer anywhere in `src/`, yet the card claims "bản nháp bước này đã được cập nhật" and the Telegram confirm path reports "Đã thực hiện thành công!".

Also lost in the extraction: the trusted `ArtifactToolContext` scope guard (WR-03), the only host that supplied `artifactApprovalState`/`artifactDecision` (WR-02), and the reachability of both artifact tools from the ordinary chat payload (WR-01).

## Critical Issues

### CR-01: `DocumentSetSchema.strict()` rejects surviving `sdlc` rows — every document-set edit fails

**File:** `src/validation/knowledgeSchemas.ts:95-123`, `src/db/repositories/documentSetRepo.ts:202`, `src/db/repositories/documentSetRepo.ts:376`, `src/db/index.ts:497-535`

**Issue:** `DocumentSetSchema` is `.strict()` and no longer declares `sdlc`. Existing databases legitimately contain such rows: the deleted `getOrCreateCrSdlcSetInTransaction` (base `documentSetRepo.ts:55-87`) wrote `sdlc: { changeRequestId, purpose: 'sdlc' }` into `db.documentSets` for every CR. The V18 upgrade hook only purges `chatTabs`, `chatThreads`, `chatMessages` and `sdlc_workflow:*` settings — it never touches `documentSets`. Consequently `updateDocumentSet` (`documentSetRepo.ts:202`) and `updatePresentationOrder` (`documentSetRepo.ts:376`) call `DocumentSetSchema.parse({...existing, ...})` on a row that still has the unknown `sdlc` key and throw `ZodError: Unrecognized key(s) in object: 'sdlc'`. The user-visible path is `NotesView.tsx:447` → `message.error(...)`: the set silently refuses to save, name/description/membership/presentation-order edits included. `deleteDocumentSet` still works, so the only escape is deleting the set — data loss for the SDLC document sets that were the CR's artifact index.

**Fix:** Purge the retired key in the V18 hook before any strict parse can see it (and widen the backup/import path the same way):

```ts
// src/db/index.ts, inside version(18).upgrade
const sets = (await tx.table('documentSets').toCollection().toArray()) as Array<Record<string, unknown>>;
for (const set of sets) {
  if (!('sdlc' in set)) continue;
  const { sdlc: _retired, ...rest } = set;
  await tx.table('documentSets').put(rest);
}
```

Alternatively keep `sdlc: z.unknown().optional()` in the schema. Do not rely on `BackupDocumentSetRecordSchema` (plain `z.object`, `backupSchemas.ts:405`) — it strips the key on import but nothing strips it for users who never restore.

### CR-02: Prior backups are unrecoverable — strict `type: 'sdlc'` rejection with an unbumped `schemaVersion`

**File:** `src/validation/backupSchemas.ts:230-235`, `src/services/backup/exportBackup.ts:7`, `src/services/backup/validateBackup.ts:92-104`, `src/services/backup/restoreBackup.ts:277-285`

**Issue:** `BackupChatTabRecordSchema` is `z.strictObject({... type: z.enum(['chat']) ...})`. Every backup produced by a pre-35 build contains at least one `type: 'sdlc'` tab per CR: `legacyTabRows` auto-created one (`base restoreBackup.ts:111-137`), the V14 upgrade hook created one per `project:*:sdlc` thread (`src/db/index.ts:255-274`), and `exportBackup.projectSafeChatTab` emitted `tab.type` verbatim. The version gate cannot catch this: `CURRENT_SCHEMA_VERSION` is still `11` (unchanged in `exportBackup.ts:7`), so the payload passes the envelope stage and dies at Stage 2 with an unknown-enum error. `restoreBackupPayload` normalizes *after* validation (`restoreBackup.ts:285` calls `restoreRows`, which is exactly where `:sdlc` threads are now skipped), so the normalization that would have made the payload loadable is unreachable. Net effect: the user cannot restore their own most recent backup, and the failure message names a tab field rather than telling them the backup is from a retired schema.

**Fix:** Bump the envelope version and let the version gate carry the message, rather than encoding the removal in a strict enum:

```ts
// exportBackup.ts
export const CURRENT_SCHEMA_VERSION = 12 as const;
```

and either accept-and-drop the retired tab type before strict validation, or keep `type: z.enum(['chat', 'sdlc'])` at the schema layer and drop `sdlc` tabs in `restoreRows`. `tests/services/backup/validateBackup.test.ts:140` currently asserts the rejection, which locks the regression in — that test should assert "sdlc tabs are dropped, ordinary tabs and messages survive" instead.

### CR-03: Approving a patch writes nothing, but both surfaces report success

**File:** `src/services/ai/patchProposal.ts:190-290`, `src/components/ai/runtime/chatTurnRuntime.ts:376-409`, `src/components/ai/widget/PatchDiffApprovalCard.tsx:72`, `src/services/telegram/telegramHeadlessWorker.ts:774-790`

**Issue:** `preparePatch` builds `patchedMarkdown` and returns it; nothing in `src/` consumes it (`grep -rn patchedMarkdown src` yields only `patchProposal.ts` and tests). The runtime's approve branch returns `{ proceed: true }`, so the tool call is then dispatched to `executeAiTool('patch_artifact_section', …)` → `preparePatch` again → the proposal JSON is handed back to the model. No `db.notes.update` / `db.aiSkills.update` / `documentSetRepo` write happens on either path. Meanwhile the UI asserts the opposite: `PatchDiffApprovalCard.tsx:72` renders "Đã chấp thuận — bản nháp bước này đã được cập nhật", and the Telegram confirm handler (`telegramHeadlessWorker.ts:778-783`) only checks `parsedResult.error`, so a successful `preparePatch` yields `✅ **Đã thực hiện thành công!**` for an operation that changed nothing. This is a false-success path on a data-mutating user action — the worst failure mode for this app, because the user walks away believing their note/skill was edited.

**Fix:** Either wire a write through the approval resolution (the deleted host did this via `onApplyArtifactPatch`), or make the missing write explicit and truthful. Minimal honest version:

```ts
// chatTurnRuntime.ts, approved branch of the PATCH_TOOL_NAME case
if (approved) {
  return {
    proceed: false,
    cancellationResult: JSON.stringify({
      applied: false,
      reason: 'PATCH_APPLY_UNAVAILABLE',
      message: 'Đề xuất đã được ghi nhận nhưng chưa có đường ghi vào tài liệu trong bản dựng này.',
    }),
  };
}
```

and change the card copy to "Đã chấp thuận đề xuất" without promising an update. Note also that if a writer is added later it must write the *unwrapped* markdown without destroying the `{ markdown, exportPayload }` envelope that `readNoteMarkdown` (`src/utils/noteBody.ts:2-13`) unwraps on read.

## Warnings

### WR-01: Both artifact tools are absent from every production tool payload

**File:** `src/services/ai/chatTurnTools.ts:63-70`, `src/components/ai/AIChatDrawer.tsx:1742`, `src/services/ai/office/teamRunCoordinator.ts:314-330`

**Category:** necessity

**Issue:** `getToolsForTurn` drops `get_artifact` and `patch_artifact_section` unless an explicit allowlist is passed (`allowed !== undefined || !['get_artifact','patch_artifact_section'].includes(...)`). The drawer calls `getToolsForTurn(turnAnalysisMode, dynamicMcpTools)` with no allowlist (`AIChatDrawer.tsx:1742`). `LEAD_TOOL_ALLOWLIST` and `EMPLOYEE_READ_ONLY_ALLOWLIST` (`chatTurnTools.ts:15-38`) contain neither name; the lead's extra `mutations` set does add `patch_artifact_section`, but `get_artifact` — the only source of the required `baseHash` — is never advertised to any agent, so a patch is always refused before it can park. Evidence that the guarded state cannot occur: no call site in `src/` supplies an allowlist containing either name. The extracted primitive therefore has no instantiation in this build.

**Fix:** Either wire the intended host (pass `['get_artifact', 'patch_artifact_section']` from the surface that owns a note/skill editor and supply `artifactApprovalState`), or delete the tools from `AI_DATABASE_TOOLS` until that host exists. Leaving them defined but unadvertised is the "generality without instantiation" case — code that must be maintained and reviewed but can never run.

### WR-02: `PatchDiffApprovalCard` and its two control props have no producer

**File:** `src/components/ai/AiChatWidget.tsx:75-76, 479-482`, `src/components/ai/AIChatDrawer.tsx:526-527, 2341-2346`

**Category:** necessity

**Issue:** The card renders only when `turn.pendingApproval.patch` is set (`AiChatWidget.tsx:479`). The drawer's `onAwaitingApproval` destructures only `{ toolName, summary }` and stores only those two fields, then rebuilds `pendingApproval` from exactly those two fields (`AIChatDrawer.tsx:2341-2346`) — `patch` can never reach the widget from the main chat. `artifactApprovalState` and `artifactDecision` (`AiChatWidget.tsx:75-76`) have zero suppliers anywhere in `src/`; their only former provider, `StepChatPanel.tsx` (base line 1229), was deleted. `TeamWorkspace` does pass the coordinator's `snapshot.pendingApproval`, which can carry `patch` (`teamRunCoordinator.ts:387`), but that path is blocked by WR-01 (no `get_artifact` for the lead ⇒ always refused). So the component, its `stale`/`applying`/`error`/`decision` states, and the dark-mode `isDarkBase` helper are all unreachable.

**Fix:** If a host is intended, pass the full `info` through in the drawer (`onAwaitingApproval: (info) => patch({ pendingConfirmation: info, ... })` and forward `activeRuntime.pendingConfirmation` wholesale) and supply `artifactApprovalState` from the owning editor. Otherwise delete the widget + card; ~85 lines of unreachable UI is a maintenance tax that will drift from the real approval UX.

### WR-03: CR-scope authorization no longer covers note/skill ids

**File:** `src/services/ai/aiTools.ts:2093-2109`, `src/services/ai/patchProposal.ts:91, 100-120`, `src/services/ai/aiOrchestratorLoop.ts:14-16`

**Issue:** The deleted `executeSdlcArtifactTool` refused outright without a trusted `ArtifactToolContext` (base `sdlcArtifactTools.ts:555-560`, `ARTIFACT_SCOPE_REQUIRED`) and derived the artifact ref from that request-bound context, never from model arguments (T-27-01). The replacement accepts model-supplied `{ target, id }` and `assertCrScope` only inspects `args.crId` plus `TASK_SCOPED_TOOLS` (`update_task`, `delete_task`, `reparent_task`, `update_task_checklist`, `spawn_recurring_task_instance`). A CR-scoped turn (`crScopeId` is set for CR chat, `AIChatDrawer.tsx:1842`) can therefore read — and, once a writer exists, patch — any note or skill id in the database, including notes belonging to a different CR. This breaks the documented WR-19 invariant that a scoped turn cannot touch another CR's data.

**Fix:** Extend the scope check to the artifact tools:

```ts
if (toolName === 'get_artifact' || toolName === 'patch_artifact_section') {
  const id = typeof args.id === 'string' ? args.id : '';
  if (args.target === 'note') {
    const note = await db.notes.get(id);
    if (note?.entityType === 'cr' && note.entityId !== crScopeId) {
      throw new Error('Tài liệu không thuộc Change Request đang mở.');
    }
  }
}
```

(widen as needed for task-scoped notes). Currently unreachable from a CR-scoped turn only because WR-01 keeps the tools out of every CR payload — fix both together or the guard is moot.

### WR-04: Legacy import path orphans messages and is itself unreachable

**File:** `src/services/backup/restoreBackup.ts:78-111, 152-163, 252`, `src/services/backup/validateBackup.ts:92-104, 415-427`

**Category:** necessity

**Issue:** `legacyTabRows` now `continue`s past threads whose `scopeKey` ends `:sdlc`, so those threads are dropped from `tables.chatThreads`, but `tables.chatMessages` is written unchanged (`restoreBackup.ts:252`). Validation runs on the *pre-normalized* envelope (`restoreBackup.ts:277`) and only normalizes afterwards (`:285`), so messages belonging to dropped `:sdlc` threads pass the `threadId ∈ chatThreads` check and land in the DB as orphans. Those orphans then make the *next* export fail that same check on a later restore — a self-invalidating backup. Secondarily, the whole path is effectively dead: `restoreRows` is only used when `tables.chatTabs === undefined`, and pre-11 envelopes are rejected outright at the version gate (`validateBackup.ts:98-104`), so the only way in is a hand-crafted v11 envelope.

**Fix:** Filter messages alongside threads, and make the branch explicit about being a defensive path:

```ts
const keptThreadIds = new Set(backfilled.threads.map((t) => t.id));
const keptMessages = (tables.chatMessages ?? []).filter((m) => keptThreadIds.has(m.threadId));
return { tables: { ...tables, chatThreads: backfilled.threads, chatTabs: backfilled.tabs, chatMessages: keptMessages }, tabs: backfilled.tabs };
```

or delete `legacyTabRows` and make a missing `chatTabs` table a validation error.

### WR-05: `readPatchTarget` returns soft-deleted notes and constant snapshot metadata

**File:** `src/services/ai/patchProposal.ts:100-120`

**Issue:** Two defects in the extracted read path. (a) `db.notes.get(id)` has no `deletedAt` guard, so a binned note is served as a patchable target with a live `baseHash` — the user can be shown a proposal against a document the app treats as deleted (and, with WR-03, one from another CR). (b) `version: 0` and `approvalState: 'unapproved'` are hardcoded for every target, so the snapshot no longer carries any version/approval information; the proposal propagates `version: 0` into `ArtifactPatchProposal.version`, which the card and runtime no longer display, making the field dead weight that reads as real state.

**Fix:** Refuse trashed notes (`if (row?.deletedAt) return refuse('ARTIFACT_NOT_FOUND', …)`) and either drop `version`/`approvalState` from `ArtifactToolSnapshot` or populate them from the skill/note revision that actually exists; a constant `0` is worse than an absent field.

### WR-06: Ten retired refusal codes remain in the union

**File:** `src/services/ai/patchProposal.ts:15-36`

**Category:** necessity

**Issue:** `ArtifactToolRefusalCode` still declares `ARTIFACT_SCOPE_REQUIRED`, `ARTIFACT_SCOPE_INVALID`, `ARTIFACT_STEP_UNSUPPORTED`, `CR_NOT_ACTIVE`, `ARTIFACT_READ_ONLY`, `ARTIFACT_REQUIRED`, `UNSUPPORTED_KIND`, `WORKFLOW_UNAVAILABLE`, `PATCH_TARGET_REQUIRED`, `PATCH_TARGET_INVALID`. Each appears exactly once in the repository — its own declaration (`grep -rn` across `src/`). No `refuse()` call, no consumer switch, and no test constructs them. They are SDLC workflow-guard vocabulary with no reachable producer.

**Fix:** Delete the ten names. Keeping them implies callers handle states that cannot occur and invites new code to return codes nothing understands.

## Info

### IN-01: Duplicated, self-referential comment in `getToolsForTurn`

**File:** `src/services/ai/chatTurnTools.ts:49-52`

**Issue:** The doc comment reads "An explicit allowlist (an explicit allowlist) keeps its read-only payload" — the deleted parenthetical ("SDLC step chat") was replaced with a copy of the following phrase. Readers cannot tell what the allowlist is for.

**Fix:** "An explicit allowlist keeps its read-only payload; Studio artifact tools require one."

### IN-02: Test evades the phase's own residual-string gate

**File:** `src/workbench/__tests__/layoutStore.test.ts:10-11`

**Category:** necessity

**Issue:** `const RETIRED_VIEW = ['sdl', 'c'].join('')` exists only to keep the literal `sdlc` out of the file while still testing the retired view type. `layoutStore.ts:109` itself contains the literal, so the gate this evasion targets has already been satisfied there; all the indirection buys is an unreadable test. No guarded state requires the split string.

**Fix:** Use `'sdlc'` directly; if a repo-wide grep gate must not see the word in tests, encode the expectation as "any unknown viewType is filtered" and test with `'retired-view'`.

### IN-03: Comment overclaims the retirement filter's scope

**File:** `src/workbench/store/layoutStore.ts:349`

**Issue:** "RETIRED_VIEW_TYPES plus the filter below also guard any future unknown view type at write time" is false: both `merge` (line 353) and `partialize` (lines 371, 381) filter by Set membership in `RETIRED_VIEW_TYPES`, which is `{'sdlc'}`. A future retired type is not filtered until someone edits the Set, and `merge` casts persisted state to `Partial<LayoutStateValues>` without validating `viewType` against `EditorViewType`.

**Fix:** Trim to what the code does ("`_v3` drops persisted `sdlc` tabs on hydrate and persist") or make the claim true by validating against the live `EditorViewType` set.

### IN-04: `SCHEMA_V18` is an empty alias with trailing blank lines

**File:** `src/db/schema.ts:131-143`

**Issue:** `SCHEMA_V18 = { ...SCHEMA_V17 }` is required by Dexie's cumulative `stores()` merge, so the alias is legitimate, but seven trailing empty lines at EOF are pure noise, and the comment says "SDLC rows are purged in the V18 upgrade hook" without noting that `documentSets` (CR-01) is *not* purged — the comment reads as broader coverage than the hook delivers.

**Fix:** Trim EOF lines; extend the comment to name exactly the three purged tables and the deliberate exclusion of `documentSets`/`notes`.

### IN-05: `buildConventionsSegment`'s single-repo branch has no production caller

**File:** `src/services/ai/conventionsSegment.ts:18-55`, `src/components/ai/AIChatDrawer.tsx:1752-1762`

**Category:** necessity

**Issue:** The drawer calls `buildConventionsSegment({ global, repos })` only. The `repo` + `repoPath` parameters and the `else if (repoText)` branch are exercised exclusively by `tests/ai/conventionsSegment.test.ts` — no code path in `src/` passes `repo`. Two input shapes for the same concept, one of them uninstantiated.

**Fix:** Drop `repo`/`repoPath` and keep the multi-repo `repos` shape (which is what the app uses), or document the single-repo shape as the public API and have the drawer use it.

### IN-06: Dead `isArtifactToolName` branch in the widget

**File:** `src/components/ai/AiChatWidget.tsx:155, 220`

**Issue:** The result-truncation cap special-cases `get_artifact` / `patch_artifact_section`. Since neither tool is advertised to the drawer (WR-01), the branch never matches a real tool event; it survives as a reminder of a feature that no longer has a host, and it will silently apply the wrong truncation policy if the names are ever reused.

**Fix:** Remove alongside WR-01/WR-02, or reintroduce with the host wiring.

---

_Reviewed: 2026-11-10T08:57:54Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
_Scope anchor: d504a18f..HEAD (evaluation-scope resolver degraded: 6 files from 2 of 12 plan commits; cherry-picks made SUMMARY hashes unreachable)_
