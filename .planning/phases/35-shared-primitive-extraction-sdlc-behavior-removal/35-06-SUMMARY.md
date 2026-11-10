---
phase: 35-shared-primitive-extraction-sdlc-behavior-removal
plan: 06
subsystem: ai-chat, sdlc-removal
tags: [deletion, sdlc-removal, chat-ui, wave-5]
status: complete
requires:
  - 35-05 (test deletion, structural safety gate rewrite)
provides:
  - "SDLC component/wizard/export trees removed"
  - "Orphaned AI SDLC services removed"
  - "ChatMessageBubble/ChatMessageList de-wizarded"
affects:
  - src/components/ai
  - src/services/ai
  - src/utils
tech-stack:
  added: []
  patterns:
    - "atomic wave deletion: source module and its importers removed in same wave"
key-files:
  created: []
  modified:
    - src/components/ai/ChatMessageBubble.tsx
    - src/components/ai/ChatMessageList.tsx
    - src/utils/noteBody.ts
    - src/utils/lineDiff.ts
    - src/utils/markdownSections.ts
    - src/components/ai/ChatTabToolbox.tsx
    - src/workbench/toolwindows/RemoteTerminalPanel.tsx
    - src/workbench/editor/RemoteFileViewer.tsx
  deleted:
    - src/components/sdlc/ (26 files)
    - src/components/ai/wizard/ (20 files)
    - src/services/wizard/ (21 files)
    - src/services/sdlc/ (1 file)
    - src/services/export/ (7 files)
    - src/services/ai/sdlcPromptComposer.ts
    - src/services/ai/sdlcArtifactTools.ts
    - src/services/ai/wizardSchemas.ts
    - src/services/ai/wizardService.ts
    - src/services/ai/wizardPrompts.ts
    - src/services/ai/researchService.ts
    - src/services/changePackPackager.ts
    - src/utils/sdlcSolutionParser.ts
decisions:
  - "researchService.ts deleted only after confirming its escapeShellArg re-export has no surviving consumer outside the delete set"
  - "noteBody.ts header rewritten with no SDLC/wizard/artifactRepo/hubExport mentions so plan 12's residual grep is clean"
metrics:
  duration: "~18 min"
  completed: 2026-11-10
  tasks: 3
  files_deleted: 83
commits: 3
plan_head_before: 7175b5e0ef4f6f924523e724c5e8e2421053b417
plan_head_after: 575cf1252c837ff844cb5d7cbc2cf8aced0d0571
requirements: [AIO-REMOVE-02, AIO-REMOVE-03]
actuals:
  tokens: 41000
  tasks: 3
  commits: 3
---

# Phase 35 Plan 06: Leaf SDLC Deletion Summary

Deleted the five leaf SDLC component/service trees plus eight orphaned AI service files (83 files, ~19.5k lines), then removed the wizard-card render branch from the chat bubble and list.

## Tasks

| # | Name | Commit | Result |
|---|------|--------|--------|
| 1 | Delete the five SDLC directories | `ba5c1199` | `src/components/sdlc`, `src/components/ai/wizard`, `src/services/wizard`, `src/services/sdlc`, `src/services/export` gone. No package.json change; `docx` still imported by `src/utils/dynamicFileSandbox.ts`. |
| 2 | Delete eight orphaned files, reword comments | `d619b90f` | `sdlcPromptComposer`, `sdlcArtifactTools`, `wizardSchemas`, `wizardService`, `wizardPrompts`, `researchService`, `changePackPackager`, `sdlcSolutionParser` removed. `noteBody.ts` header rewritten. Four stale comments reworded. `gitRemoteService.escapeShellArg` untouched. |
| 3 | De-wizard chat bubble and list | `575cf125` | `WizardMessageCallbacks`, `wizardCallbacks` prop, and the whole `msg.wizard` render branch removed. Both files grep 0 for `wizard\|Wizard`. |

## Verification

- `grep -c '"docx"' package.json` → 1; `grep -c "from 'docx'" src/utils/dynamicFileSandbox.ts` → 1.
- `grep -c "export function escapeShellArg" src/services/gitRemoteService.ts` → 1.
- `grep -c "artifactRepo\|hubExport\|wizard\|SDLC\|sdlc" src/utils/noteBody.ts` → 0.
- Residual `sdlc` mentions in `noteBody.ts`, `lineDiff.ts`, `markdownSections.ts`, `ChatTabToolbox.tsx`, `RemoteTerminalPanel.tsx`, `RemoteFileViewer.tsx` → 0.
- `npx vitest run src/components/ai/__tests__/ChatMessageList.test.tsx src/components/ai/__tests__/ChatMessageBubbleMermaid.test.ts` → 2 files, 10 tests passed.
- `npx tsc --noEmit` → 0 errors mentioning `ChatMessageBubble` or `ChatMessageList`.

## Deviations from Plan

None. Plan executed as written.

Wave-atomic state (expected, resolved by plans 07-10 in this same wave): `src/views/ChangeRequestSdlcView.tsx` still imports `sdlcPromptComposer`/`sdlcArtifactTools`; `src/types/models.ts`, `src/validation/*`, `src/db/repositories/chatRepo.ts` still import `wizardSchemas`/`wizard` types; `src/workbench/*` still references `'sdlc'` view types. `npx tsc --noEmit` therefore reports errors in those files — plan 07 deletes `ChangeRequestSdlcView.tsx` and plans 09-10 clean the schema/types importers.

## Deferred Issues

- `src/components/ai/__tests__/ChatTabBar.test.tsx` fails to resolve `@dnd-kit/core` in this worktree because `node_modules/@dnd-kit` is absent (declared in `package.json` at `^6.3.1`). Environment/dependency-install gap, not caused by this plan; not fixed here (package installs are out of auto-fix scope).

## Threat Flags

None. No new network, auth, file-access, or schema surface introduced.

## Self-Check: PASSED

- All five SDLC directories absent from the worktree.
- Commits `ba5c1199`, `d619b90f`, `575cf125` present on HEAD.
- `35-06-SUMMARY.md` written.
