---
phase: 35-shared-primitive-extraction-sdlc-behavior-removal
plan: 09
subsystem: domain-types
tags: [sdlc-removal, types, validation, dexie-repositories, chat]
requires:
  - 35-05
provides:
  - "Note, ChatMessage, ChatTab, DocumentSet without SDLC fields"
  - "ChatTabType = 'chat'"
  - "DocumentSetSchema without an sdlc field"
  - "repositories with no SDLC reads/writes/validation"
affects:
  - src/types/models.ts
  - src/validation/schemas.ts
  - src/validation/knowledgeSchemas.ts
  - src/db/repositories/chatRepo.ts
  - src/db/repositories/chatTabRepo.ts
  - src/db/repositories/documentSetRepo.ts
tech-stack:
  added: []
  patterns: []
key-files:
  created: []
  modified:
    - src/types/models.ts
    - src/validation/schemas.ts
    - src/validation/knowledgeSchemas.ts
    - src/db/repositories/chatRepo.ts
    - src/db/repositories/chatTabRepo.ts
    - src/db/repositories/documentSetRepo.ts
    - src/db/repositories/__tests__/chatRepo.test.ts
    - src/db/repositories/__tests__/chatTabRepo.test.ts
    - src/services/ai/__tests__/fileReference.test.ts
decisions:
  - "Drop the defensive sdlc_workflow: settings purge from clearAllChatHistory; the V18 migration owns it once (T-35-23 accept)"
  - "ordinaryTabs keeps its own sort but loses the type filter, now a no-op after ChatTabType narrows"
metrics:
  duration: "~35m"
  completed: 2026-11-10
  commits: 3
  plan_head_before: 7175b5e0ef4f6f924523e724c5e8e2421053b417
  plan_head_after: 519383ff
status: complete
---

# Phase 35 Plan 09: SDLC Fields Removed from Domain Types, Schemas, and Repositories Summary

SDLC metadata stripped from `Note`, `ChatMessage`, `ChatTab`, `DocumentSet`, their zod schemas, and the three Dexie repositories that read or wrote them.

## What Changed

### Types and schemas (commit 85255343)

- `src/types/models.ts`: deleted the `wizardSchemas` / `workflowSchemas` type imports, `Note.sdlcArtifact`, `ChatTab.workflowState`, the whole `ChatArtifactEvent` interface, `ChatMessage.wizard` / `.artifactEvent`, and `DocumentSet.sdlc`. `ChatTabType` narrowed from `'chat' | 'sdlc'` to `'chat'`.
- `src/validation/schemas.ts`: dropped `SdlcArtifactMetadataSchema` import and the `sdlcArtifact` member from both `NoteSchema` and `NoteInputSchema`.
- `src/validation/knowledgeSchemas.ts`: dropped `SdlcDocumentSetMetadataSchema` import and the `sdlc` member from the `.strict()` `DocumentSetSchema` (T-35-21, landmine L2).

### Repositories (commit 215a5714)

- `chatRepo.ts`: `SaveMessageInput` loses `wizard` / `artifactEvent`; `saveMessage` loses both validation blocks, the eventId stamping, and the two conditional spreads. `clearAllChatHistory` no longer deletes `sdlc_workflow:` settings and drops `db.settings` from its transaction tables. `getOrCreateSdlcThread` deleted.
- `chatTabRepo.ts`: `SDLC_TITLE`, `getSdlcTabThreadId`, `getOrCreateSdlcTab` deleted; `ordinaryTabs` sorts without the `type === 'chat'` filter; `updateChatTab` patch `Pick<>` loses `workflowState`; `deleteChatTab` loses the SDLC guard.
- `documentSetRepo.ts`: `sdlc` removed from both input interfaces, `getOrCreateCrSdlcSetInTransaction` deleted, and the two conditional `sdlc` spreads removed from `create` / `update`.

### Tests (commit 519383ff)

- `chatRepo.test.ts`: deleted the `getOrCreateSdlcThread` describe and import; describe renamed `chatRepo - CR Multi-Tab Threads`.
- `chatTabRepo.test.ts`: deleted the three SDLC tab describes (`keeps exactly one non-deletable SDLC tab`, `adopts an unclaimed CR thread for the SDLC tab`, `keeps exactly one active tab per scope ... under an active SDLC tab`) and the `getOrCreateSdlcTab` import.
- `fileReference.test.ts`: `clearAllChatHistory` test now asserts messages/threads/tabs only, no `settings` mock.

## Verification

| Check | Result |
|---|---|
| `grep "sdlc\|Sdlc\|wizard\|Wizard\|artifactEvent\|workflowState"` over the 3 type/schema files | no matches |
| same grep over the 3 repository files | no matches |
| `grep -n "export type ChatTabType"` | one line, `'chat'` |
| `npx vitest run src/db/repositories/__tests__/chatRepo.test.ts src/db/repositories/__tests__/chatTabRepo.test.ts src/services/ai/__tests__/fileReference.test.ts` | 3 files, 20 tests passed |
| `npx vitest run src/db/repositories/__tests__` | 3 files, 12 tests passed |
| `npx vitest run tests/validation tests/knowledge/schemaV10.test.ts` | 5 files, 62 tests passed |
| `npx tsc --noEmit` | 77 errors, none in the 9 files this plan touched |

The plan's `npx tsc --noEmit` exit-0 criterion is unmeetable at this point in the wave: the remaining errors are all in wave-5 sibling files (`AIChatDrawer.tsx`, `ChatMessageBubble.tsx`, `ChatTabBar.tsx`, `StepChatPanel.tsx`, `backup/*`, `services/wizard/artifactRepo.ts`, `views/ChangeRequestSdlcView.tsx`) owned by plans 06, 07, 08, and 10. Zero errors point at the files this plan modified.

## Deviations from Plan

None for content. Two environment/verification notes:

1. **[Rule 3 - Environment] `tests/knowledge` cannot run in this worktree** — the worktree `node_modules` is empty (only `.vite`), and the parent checkout's install is missing declared `zustand` and `@dnd-kit/*`. Every `tests/knowledge` file that reaches `src/workbench/store/layoutStore.ts` fails at import resolution, independent of this plan. Same environment failure recorded by plans 01, 02, 03, and 05. Validation coverage was obtained via `tests/validation` + `tests/knowledge/schemaV10.test.ts` (62 tests green), both of which exercise `DocumentSetSchema` / `NoteSchema`.
2. **Plan 06's deletion remit overlaps this plan's removed exports** — `src/services/wizard/artifactRepo.ts` and `src/views/ChangeRequestSdlcView.tsx` still import `getOrCreateCrSdlcSetInTransaction` / `getOrCreateSdlcTab` and therefore show `TS2305` until plan 06/07 delete them in this same wave.

## Known Stubs

None.

## Self-Check: PASSED
