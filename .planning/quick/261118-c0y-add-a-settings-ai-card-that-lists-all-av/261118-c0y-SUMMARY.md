---
phase: quick-261118-c0y
plan: '01'
subsystem: ui
tags: [ai-tools, tool-catalog, settings, antd, dedupe, usage-map]
requires: []
provides:
  - Pure additive getAllAvailableToolDefinitions(db) aggregating builtin + team + MCP + Graphiti tools with source/isMutationTool/usage annotations
  - AiToolCatalogCard read-only Settings card listing every AI tool with name, description, JSON schema and 'Nơi dùng' labels + file:line references
  - Focused 6-test suite proving inclusion, dedupe, usage mapping, MCP failure degradation, and getToolsForTurn guard
affects: [settings, ai-chat, team-chat, telegram]
tech-stack:
  added: []
  patterns:
    - Curated static usage map with verified file:line dispatch sites (no repo-wide call-site scan)
    - Independent try/catch per async discovery source with graceful [] fallback
    - Name normalization dedupe with first-source-wins and usage-reference merge
key-files:
  created:
    - src/components/settings/AiToolCatalogCard.tsx
    - src/services/ai/__tests__/chatTurnTools.test.ts
  modified:
    - src/services/ai/chatTurnTools.ts
    - src/views/SettingsView.tsx
key-decisions:
  - 'Aggregate is additive: getToolsForTurn and all allowlists byte-identical; no AIChatDrawer/teamRunCoordinator import'
  - 'Usage map is curated from verified dispatch sites (AIChatDrawer.tsx:1802, teamRunCoordinator.ts:1311/1323/1333/1356, Telegram workers) rather than dynamic analysis'
  - 'Corrected planning assumption: ssh_read_file is in AI_DATABASE_TOOLS and advertised in ordinary chat via getToolsForTurn; it is not "manual call only"; git_read is team-only; local read_file available across chat/team/Telegram'
  - 'Duplicate tool names keep the first source but merge usage references so the usage column stays complete'
  - 'Per-source try/catch plus card-level error/Refresh keeps Settings usable when MCP/Graphiti discovery fails'
patterns-established:
  - 'Catalog entries carry { tool, source, isMutationTool, usage: { labels, references } }'
  - 'Mount-time async discovery guards with an active flag to avoid setState after unmount'
requirements-completed: []
actuals:
  tokens: 5791
  tasks: 3
  commits: 4
plan_head_before: 7aed4e5b3b5667b642c45de84dd2d7faaf7e3b95
plan_head_after: 755f6b9f2c172b82d747253bbfdf145cbb7bcdc1
duration: 16min
completed: 2026-11-18
status: complete
---

# Quick 261118-c0y: Settings AI tool catalog card Summary

**Read-only Settings card inventorying every AI tool with source, mutation flag, JSON schema and verified dispatch-site references, via a pure additive aggregate**

## Performance

- **Duration:** 16 min
- **Started:** 2026-11-18T01:48:03Z
- **Completed:** 2026-11-18T02:03:33Z
- **Tasks:** 3 of 3
- **Files modified:** 4

## Accomplishments

- `getAllAvailableToolDefinitions(db)` merges `AI_DATABASE_TOOLS`, `TEAM_TOOL_DEFINITIONS`, MCP discovery and Graphiti tools; dedupes by `normalizeToolName`, tags source + `isMutationTool`, and attaches curated usage labels/references.
- Every discovery source is independently guarded; built-in/team tools always render even when MCP is offline or Graphiti is unavailable outside Tauri.
- New `AiToolCatalogCard` lists every tool with source/mutation tags, description, "Nơi dùng" labels + file:line refs, search, refresh, loading/error/empty states, and a detail modal with scrollable JSON schema + copy button.
- Mounted in Settings > "Trợ lý AI & Ghost Dev" with exactly 2 additive lines; all handlers, state and other tabs unchanged.
- TDD RED evidence machine-validated (`RED_EVIDENCE_OK`): 5 target tests failed on the missing-function assertion, guard test passed.

## Task Commits

| Task | Commit | Type |
| ---- | ------ | ---- |
| Task 1 RED (failing test) | `edcd910b` | test |
| Task 1 GREEN (aggregate) | `ee051b09` | feat |
| Task 2 (catalog card) | `892f9cbc` | feat |
| Task 3 (Settings mount) | `755f6b9f` | feat |

**Plan metadata:** pending orchestrator commit (`docs(quick-261118-c0y-01): complete ...`)

## TDD Gate Compliance

- RED: `test(quick-261118-c0y-01): ...` — present, machine-validated (`RED_EVIDENCE_OK`, target failed on planned assertion).
- GREEN: `feat(quick-261118-c0y-01): ...` — present and descends from RED.
- REFACTOR: none needed.

## Files Created/Modified

- `src/services/ai/chatTurnTools.ts` — added aggregate + curated usage map, original 91-line section untouched.
- `src/services/ai/__tests__/chatTurnTools.test.ts` — 6 focused tests (created).
- `src/components/settings/AiToolCatalogCard.tsx` — read-only catalog card (created).
- `src/views/SettingsView.tsx` — 2 added lines (import + mount).

## Decisions Made

- Kept the aggregated catalog entirely read-only; no dispatch path, allowlist, handler or MCP/Graphiti config was modified.
- Used a curated usage map from verified dispatch sites rather than dynamic call-site scanning, per owner requirement.
- Corrected the planner's assumption about `ssh_read_file`: it IS in `AI_DATABASE_TOOLS` and advertised in ordinary chat through `getToolsForTurn` (AIChatDrawer.tsx:1802) with no allowlist; team chat does not include it; Telegram does. `git_read` is team-only. The catalog labels reflect these facts.
- Deduped by normalized name with first-source-wins; later duplicates merge their usage references.
- Fixed a wrong relative db import path (`../db` → `../../db`) found during GREEN verification (Rule 3 blocking fix, same task commit).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Wrong relative import path for db module**
- **Found during:** Task 1 GREEN verification
- **Issue:** `import ... from '../db'` in `chatTurnTools.ts` failed Vite resolution; the correct path from `src/services/ai/` is `../../db`.
- **Fix:** Changed the import to `../../db` (matches `mcpClient.ts` and `graphitiMcpClient.ts`).
- **Files modified:** `src/services/ai/chatTurnTools.ts`
- **Verification:** `npx vitest run ... chatTurnTools.test.ts` → 6 passed; `npx tsc --noEmit` → exit 0.
- **Committed in:** `ee051b09` (Task 1 GREEN)

**2. [Rule 1 - Bug] Ant Design 6 `List.locale` requires an object**
- **Found during:** Task 2 typecheck
- **Issue:** Passing `<Empty />` directly to `List.locale` failed TS2322 (`ListLocale.emptyText` required).
- **Fix:** Wrapped as `locale={{ emptyText: <Empty ... /> }}`.
- **Files modified:** `src/components/settings/AiToolCatalogCard.tsx`
- **Verification:** `npx tsc --noEmit` → exit 0.
- **Committed in:** `892f9cbc` (Task 2)

**Total deviations:** 2 auto-fixed (1 blocking path, 1 type/API mismatch). Both are task-local and necessary for compile/run; no scope creep.

## Issues Encountered

- `tests/views/SettingsView.test.tsx` emits a pre-existing unhandled `DatabaseClosedError` from `McpConfigCard` when the test closes its Dexie DB mid-discovery. Verified at pristine HEAD with the new card removed (reproduces there too); at HEAD one assertion also intermittently fails. With this plan's card mounted, all 9 assertions pass; the unhandled rejection remains baseline behavior. Logged to `.planning/WINDOWS.md` as an out-of-scope pre-existing issue; not fixed here.
- No full vitest suite run (project rule).

## Threat Flags

None. No new network endpoints, auth paths, secret reads, storage keys or schema changes were introduced. The card renders only tool names, descriptions, parameters schemas and static usage strings; no MCP tokens/passphrases are read or displayed.

## Next Phase Readiness

- Settings > AI tab now exposes a complete read-only AI tool inventory with usage references; no behavioral AI changes.
- No blockers for subsequent plans; no push performed (per instruction).

## Self-Check: PASSED

All 5 created/modified files exist on disk and all 4 task commits are ancestors of HEAD.
