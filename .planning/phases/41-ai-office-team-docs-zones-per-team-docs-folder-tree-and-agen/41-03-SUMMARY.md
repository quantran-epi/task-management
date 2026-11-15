---
phase: 41-ai-office-team-docs-zones
plan: 03
subsystem: ai-office/team-tools
tags: [team-tools, notes, folder-guard, role-guard, refusal-codes]
requires:
  - "noteRepo.createNote / updateNote / getNotesByFolder"
  - "wrapField / wrapUntrusted (untrusted-data boundary)"
  - "Dexie V27 + docsFolderId fields (plan 41-01)"
provides:
  - "write_doc team tool (list/create/update) — the employee's only write path"
  - "writeDoc handler with folder guard and lead-role guard"
  - "DOC_NOT_IN_YOUR_FOLDER, TEAM_DOCS_NOT_READY, LEAD_USES_DB_TOOLS refusal codes"
  - "TeamToolContext.role / folderId / agentName"
  - "EMPLOYEE_ONLY_TEAM_TOOLS (lead-payload subtraction set)"
affects:
  - "src/services/ai/office/teamRunCoordinator.ts (plan 41-06: toolContext fields, leadTools filter, turn-start backfill)"
  - "src/services/ai/office/teamPrompts.ts (plan 41-05: folder facts in the prompt)"
tech-stack:
  added: []
  patterns:
    - "team tool deliberately absent from MUTATION_TOOLS, so it never reaches onMutationCheck"
    - "folder scope from ctx only; args.parentId never read"
    - "refusals are returned values, never thrown"
key-files:
  created: []
  modified:
    - src/services/ai/office/teamTools.ts
    - tests/services/ai/office/teamTools.test.ts
decisions:
  - "D-01: write_doc is a team tool, not a DB tool — the runtime's read-only gate refuses every employee mutation before the approval card"
  - "D-02b: create prefixes `{agentName} — {title}`; update never re-prefixes; no agent name means the bare title"
  - "D-04: parentId comes from ctx.folderId only, type is the literal 'document', update compares the stored parentId"
  - "D-05: missing folderId refuses TEAM_DOCS_NOT_READY; the handler never creates a folder"
  - "D-06: lead-role calls refuse LEAD_USES_DB_TOOLS before action is read; EMPLOYEE_ONLY_TEAM_TOOLS is the payload half (wired in 41-06)"
metrics:
  duration: "~10 min"
  completed: "2026-11-15T04:49:12Z"
  tasks: 2
  files_changed: 2
---

# Phase 41 Plan 03: `write_doc` team tool Summary

One team tool with three actions is the employee's only write path: `create` ignores a client `parentId` and always writes `type: 'document'` into the caller's own folder, `update` refuses any note whose stored `parentId` is not the caller's folder, `list` is folder-scoped, and a lead-role call is refused before `action` is even read.

## What Was Built

**Task 1 — context fields, refusal codes, definition, handler, dispatch (`23df688d`)**
- `TeamToolContext` gained `role?: 'lead' | 'employee'`, `folderId?: string` and `agentName?: string`, each with a JSDoc naming its decision. All three come from the coordinator's context, never from `args` — the file header's cross-team read-guard rule.
- `TeamToolRefusalCode` gained `DOC_NOT_IN_YOUR_FOLDER`, `TEAM_DOCS_NOT_READY` and `LEAD_USES_DB_TOOLS`. The third is its own code because `INVALID_ARGUMENT` would blame the model's arguments for a role rule.
- `TEAM_TOOL_DEFINITIONS` gained `write_doc` (Vietnamese description, `action` enum `list|create|update`, `title`, `body`, `noteId`, `required: ['action']`).
- `EMPLOYEE_ONLY_TEAM_TOOLS = new Set(['write_doc'])` declared next to `LEAD_ONLY_TEAM_TOOLS`, with a comment stating the two sets are subtracted from opposite payloads and a tool in both would be offered to nobody.
- `writeDoc` guard order: lead-role refusal → missing `folderId` refusal → `action` read → branch. `create` builds `{ type: 'document', parentId: folderId, title: ctx.agentName ? \`${ctx.agentName} — ${title}\` : title, body }` and never reads `args.parentId`. `update` reads the row and refuses unless `parentId === folderId` and `!deletedAt`, then calls `updateNote` with the title only when supplied. `list` calls `getNotesByFolder`, filters `type === 'folder'`, wraps each title with `wrapField('TIÊU ĐỀ TÀI LIỆU', …)`.
- One `case 'write_doc': return writeDoc(input, ctx);` in the `executeTeamTool` switch.
- `EMPLOYEE_READ_ONLY_ALLOWLIST`, `MUTATION_TOOLS`, `chatTurnRuntime.ts` untouched (greps return 0 `write_doc` occurrences in each).

**Task 2 — handler tests (`d3d2dd60`)**
- Tool-count test 9 → 10 with `write_doc` in the `arrayContaining` list; `not.toContain('deliver_steer')` kept.
- New describe block seeds `AI Teams` root → team folder → `folderA`/`folderB` → one document in `folderB`, via `createNote` so ids are real UUIDs.
- 16 behaviours: employee payload membership; `create` ignores client `parentId` and writes `type: 'document'`; agent-name prefix; `update` does not re-prefix; cross-folder update refuses with the row's `body`/`title`/`updatedAt` unchanged; soft-deleted note in the caller's folder refuses and is not resurrected; `list` folder-scoped; `list` excludes folders; `list` wraps titles (`KHÔNG ĐÁNG TIN` present, title still readable); `TEAM_DOCS_NOT_READY` with `db.notes.count()` unchanged; unknown action; empty title; allowlist excludes `create_note`/`update_note`/`delete_note`/`write_doc` while `AI_DATABASE_TOOLS` still has `create_note`; lead-role refusal for `create`, `update` and `list` with count and target row unchanged; employee-role call still writes; no agent name yields the bare title.

## Verification

- `npx vitest run tests/services/ai/office/teamTools.test.ts` — 1 file, 61 tests passed.
- `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts` — 1 file, 158 tests passed (the payload and tool-name-resolution tests iterate `TEAM_TOOL_DEFINITIONS`, so the tenth entry is covered there too).
- `npx tsc --noEmit` — clean.
- Acceptance greps: `name: 'write_doc'` ×1, `case 'write_doc'` ×1, `DOC_NOT_IN_YOUR_FOLDER|TEAM_DOCS_NOT_READY` ×4, `args.parentId` 0, `agentName ?? ''` 0, `ctx.role === 'lead'` ×1, `LEAD_USES_DB_TOOLS` ×3, `write_doc` in `aiTools.ts`/`chatTurnTools.ts`/`chatTurnRuntime.ts` 0 each, `LEAD_ONLY_TEAM_TOOLS` still only `delegate_batch` + `amend_assignments`.

## Deviations from Plan

**1. [Rule 1 - Bug] The handler's JSDoc mentioned `args.parentId`, failing the plan's own grep**
- **Found during:** Task 1 acceptance greps
- **Issue:** The doc comment said "`args.parentId` is never read", which made `grep -c 'args.parentId'` return 1 against an expected 0. The grep is the T-41-10 pin, so a comment matching it would make the assertion meaningless.
- **Fix:** Reworded to "a client-supplied `parentId` in the arguments is never read". Same meaning, no literal match.
- **Files modified:** `src/services/ai/office/teamTools.ts`
- **Commit:** `23df688d`

**2. [Rule 2 - Missing critical coverage] Lead-role refusal asserted for `list` too**
- **Found during:** Task 2
- **Issue:** The plan asked for lead refusal on `create` and `update`. `list` reads another folder's titles, and the guard sits before the branch, so a regression that moved the guard below the `list` branch would leak titles while both planned assertions still passed.
- **Fix:** The lead-refusal test also calls `list` and asserts `LEAD_USES_DB_TOOLS`.
- **Files modified:** `tests/services/ai/office/teamTools.test.ts`
- **Commit:** `d3d2dd60`

## Known Stubs

None. `EMPLOYEE_ONLY_TEAM_TOOLS` is exported but not yet consumed — plan 41-06 owns the `leadTools()` filter (T-41-30's payload half). The handler-side guard already refuses lead calls, so the tool is safe in the interim.

## Threat Flags

None beyond the plan's register. T-41-10 (ctx-only `parentId`, literal `type`), T-41-11 (stored `parentId` comparison), T-41-12 (`list` folder filter + `wrapField` on titles), T-41-13 (allowlist untouched, pinned by test), T-41-30 (handler half landed; payload half in 41-06), T-41-14 (`write_doc` absent from `MUTATION_TOOLS`, grep-pinned) and T-41-15 (repo schemas own the size ceiling; no pre-validation duplicated) are all as planned.

## Self-Check: PASSED

- `src/services/ai/office/teamTools.ts` — FOUND (`write_doc` definition, `writeDoc`, three codes, `EMPLOYEE_ONLY_TEAM_TOOLS`)
- `tests/services/ai/office/teamTools.test.ts` — FOUND (61 tests, 16 new behaviours)
- commits `23df688d`, `d3d2dd60` — FOUND in `git log`
