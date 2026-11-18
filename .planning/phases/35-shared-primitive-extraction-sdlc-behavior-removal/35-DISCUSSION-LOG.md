# Phase 35: Shared-primitive extraction + SDLC behavior removal - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-09
**Phase:** 35-Shared-primitive extraction + SDLC behavior removal
**Areas discussed:** Artifact tools, SDLC persisted data, SDLC history cards, Note.sdlcArtifact

---

## Artifact tools

| Option | Description | Selected |
|--------|-------------|----------|
| Keep get/patch, drop propose_* | Extract patch core to `patchProposal.ts`; keep `get_artifact` + `patch_artifact_section` with new scope; delete `propose_subsystems` + `propose_research` | ✓ |
| Delete all four | Remove `sdlcArtifactTools.ts` and `ArtifactDiffApprovalCard` entirely; Phase 39 rebuilds diff from scratch | |
| Keep all four, rename file | Preserve CR/step coupling; contradicts C-06 free-style | |

**User's choice:** A — keep the two reusable tools, drop the two CR-specific ones.
**Notes:** User first asked for a simpler explanation of what the four tools do and why the split matters. After the explanation they chose A.

### Follow-up: new tool scope

| Option | Description | Selected |
|--------|-------------|----------|
| noteId or skillId | Both targets from the start; Phase 39 reuses without a signature change | ✓ |
| noteId only, extend later | Narrower now, requires a signature change in Phase 39 | |
| Union target `{ kind, id }` | Generic from the start | |

**User's choice:** noteId or skillId.
**Notes:** Keeps Phase 39 (skill enrichment) on the same contract, avoiding rework.

---

## SDLC persisted data

| Option | Description | Selected |
|--------|-------------|----------|
| Keep rows, filter UI | Non-destructive; export still carries them | |
| Delete via migration | Remove `chatTabs.type='sdlc'`, `:sdlc` threads, `sdlc_workflow:*` settings | ✓ |
| Filter UI now, decide in Phase 36 | Defer the data decision | |

**User's choice:** Delete outright.
**Notes:** User stated the app has never run in production — all Dexie rows are test data. Data preservation is not a goal. This overrides ARCHITECTURE.md's non-destructive recommendation.

### Follow-up: backup tab-type enum

| Option | Description | Selected |
|--------|-------------|----------|
| Narrow to `['chat']` now | Legacy backups with an `sdlc` tab are rejected | ✓ |
| Keep enum, defer to Phase 36 | Legacy backups still import, sdlc tabs ignored | |

**User's choice:** Narrow now.
**Notes:** Consistent with the test-data rationale — no need to keep importing SDLC tabs.

---

## SDLC history cards

| Option | Description | Selected |
|--------|-------------|----------|
| Delete cards, render plain text | Remove the `ChatMessage.wizard` render branch | ✓ |
| Keep, move to `components/ai/legacy/` | Preserve full history rendering | |
| Merge into one generic card | New card + tests | |

**User's choice:** Delete all.
**Notes:** User asked what "history" meant (SDLC chat history). After clarification they confirmed deleting everything and keeping only reusable tooling. Inspection showed all three cards are bound to SDLC-specific payloads (`ReconciliationResult`, `templateSection`, `WizardSavedNoteBanner`) and are not reusable.

---

## Note.sdlcArtifact

| Option | Description | Selected |
|--------|-------------|----------|
| Delete entirely | Remove from Note type, backup schema, and validateBackup | ✓ |
| Rename to neutral `artifact` | Keep the "document derived from documents" concept for Phase 39 | |
| Keep as-is | Note retains SDLC concepts after the feature is gone | |

**User's choice:** Delete entirely.
**Notes:** No neutral replacement in this phase.

---

## Claude's Discretion

- File split inside `patchProposal.ts`.
- Whether `SafeMarkdown` is deleted or relocated — verify by grep during execution.
- Deletion ordering within the phase, provided extraction lands first.
- `LAYOUT_STORAGE_KEY` bump versus a `partialize` view-type filter.

## Deferred Ideas

- Multi-chat thread identity, budget scope, `aiSkillVersions` table — Phase 36.
- Skill enrichment UI and version restore — Phase 39.
- Explorer two-section redesign, single AI Office trigger — Phase 40.
- Peer-to-peer agent chat — out of scope for the milestone (R-10).
