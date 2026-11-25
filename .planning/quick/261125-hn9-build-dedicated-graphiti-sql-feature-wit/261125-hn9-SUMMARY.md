---
phase: quick
plan: 261125-hn9
subsystem: ai
tags: [graphiti, graphiti-sql, mcp, sha256, settings, vitest]
requires:
  - phase: 261125-gyl
    provides: "Bundled rule files, SHA256SUMS and the initial SHA-verified rule apply path that this plan replaces"
provides:
  - "Dedicated Graphiti/SQL service with two independently toggled user-entered MCP servers, intent-based skill selection and SHA-256-verified rule segments"
  - "Dedicated Settings card 'Graphiti / SQL' wired into the AI tab with legacy apply button removed"
  - "Chat panel and AI Chat team prompt wiring through the dedicated segment behind existing master gates"
affects: [ai-chat, ai-office-team, settings, mcp-client]
actuals:
  tokens: 14580
  tasks: 3
  commits: 3
  plan_head_before: f1d444d7afdba435db0143966239d698f3691d34
  plan_head_after: 9a0aa1c34d462a45b958c7d4d989b54fbddbf934
tech-stack:
  added: []
  patterns:
    - "Rule text is sliced from SHA-256-verified bundled files by exported markers; never copied into TypeScript literals"
    - "Server config writes use one getMcpServers -> mutate -> saveMcpServers pass with sanitizeUrl on non-empty URLs"
    - "Master gate (tab/team mcpEnabled) controls tool discovery and prompt segment together"
    - "Coordinator and drawer call getGraphitiSkillSegment(...).catch(() => '') so verification failure never blocks a turn"
key-files:
  created:
    - src/components/settings/GraphitiSqlConfigCard.tsx
    - tests/components/settings/GraphitiSqlConfigCard.test.tsx
  modified:
    - src/services/ai/graphitiRules.ts
    - src/services/ai/__tests__/graphitiRules.test.ts
    - src/services/ai/mcpClient.ts
    - src/components/ai/AIChatDrawer.tsx
    - src/services/ai/office/teamPrompts.ts
    - src/services/ai/office/teamRunCoordinator.ts
    - src/views/SettingsView.tsx
    - src/components/settings/McpConfigCard.tsx
    - tests/services/ai/office/teamPrompts.test.ts
    - tests/services/ai/office/teamRunCoordinator.test.ts
    - tests/ai/AIChatDrawerConventions.test.tsx
    - tests/components/settings/McpConfigCard.test.tsx
key-decisions:
  - "D-01: applyGraphitiRules and instruction-carrier writes removed; dedicated service owns config and prompt segments"
  - "D-02: URLs are user-entered only; no hard-coded endpoint, CLI registration, CLAUDE.md or skills edits"
  - "D-03: two independent switches; master tab/team gate remains the global switch; toggling keeps stored URLs"
  - "D-04: selectGraphitiSkill chooses graphiti-sql for SQL/DDL/migration/join/schema and SVFE_SHB/MAIN1, else graphiti"
  - "D-05: separate Settings card; legacy apply button and service removed from generic MCP card"
  - "D-06: chat panel, lead and employee all use getGraphitiSkillSegment; tool discovery and read-only allowlist untouched"
  - "D-07: verification runs before any prompt use; hash mismatch throws and callers degrade to no segment"
patterns-established:
  - "Verified rule slicing by section markers with fail-closed SHA-256 check"
  - "One-transaction-equivalent read-modify-write for two MCP rows, preserving unrelated fields"
requirements-completed:
  - GRAPHITI-SQL-DEDICATED-01
  - GRAPHITI-SQL-DEDICATED-02
  - GRAPHITI-SQL-DEDICATED-03
coverage:
  - id: D1
    description: "Dedicated service reads/writes two user-configured server rows and slices SHA-verified rules by intent"
    requirement: GRAPHITI-SQL-DEDICATED-01
    verification:
      - kind: unit
        ref: "src/services/ai/__tests__/graphitiRules.test.ts#graphitiRules dedicated service"
        status: pass
      - kind: other
        ref: "cd public/ai-rules && shasum -a 256 -c SHA256SUMS"
        status: pass
    human_judgment: false
  - id: D2
    description: "Chat panel, lead and employee receive the dedicated segment behind existing master gates"
    requirement: GRAPHITI-SQL-DEDICATED-02
    verification:
      - kind: unit
        ref: "tests/services/ai/office/teamPrompts.test.ts#dedicated Graphiti skill segment"
        status: pass
      - kind: unit
        ref: "tests/services/ai/office/teamRunCoordinator.test.ts#teamRunCoordinator"
        status: pass
      - kind: unit
        ref: "tests/ai/AIChatDrawerConventions.test.tsx#dedicated Graphiti skill segment"
        status: pass
    human_judgment: false
  - id: D3
    description: "Settings AI tab has a separate Graphiti/SQL card with two URLs and two switches; generic MCP card has no apply button"
    requirement: GRAPHITI-SQL-DEDICATED-03
    verification:
      - kind: unit
        ref: "tests/components/settings/GraphitiSqlConfigCard.test.tsx#GraphitiSqlConfigCard"
        status: pass
      - kind: unit
        ref: "tests/components/settings/McpConfigCard.test.tsx#does not expose the old Graphiti/SQL apply button"
        status: pass
    human_judgment: false
duration: 28min
started: "2026-11-25T13:29:19Z"
completed: "2026-11-25T13:58:36Z"
status: complete
---

# Quick 261125-hn9: Dedicated Graphiti/SQL feature Summary

**Replaced the shared MCP `instruction` carrier with a dedicated two-server Graphiti/SQL service, an intent-based SHA-256-verified prompt segment, and a separate Settings card wired into both AI chat surfaces.**

## Performance

- **Duration:** 28 min
- **Started:** 2026-11-25T13:29:19Z
- **Completed:** 2026-11-25T13:58:36Z
- **Tasks:** 3 of 3
- **Files modified:** 14

## Accomplishments

- `graphitiRules.ts` rewritten: user-configurable `graphiti-memory` / `svng-source` rows, URL validation, one read-modify-write save, `selectGraphitiSkill` intent routing, marker-based rule slicing, fail-closed SHA-256. `applyGraphitiRules` gone.
- Chat panel, lead and employee prompts now call `getGraphitiSkillSegment` behind the existing tab/team master gate; tool discovery and read-only allowlist unchanged.
- Settings AI tab has a separate "Graphiti / SQL" card with two URL inputs and two independent switches; generic MCP card no longer carries the apply button or rule copy.

## Task Commits

Each task was committed atomically:

1. **Task 1: Dịch vụ Graphiti/SQL chuyên biệt** - `1d7db5fe` (feat)
2. **Task 2: Thay wiring cũ bằng segment chuyên biệt** - `5df0e268` (feat)
3. **Task 3: Thêm mục Settings "Graphiti/SQL" riêng** - `9a0aa1c3` (feat)

**Plan base:** `f1d444d7`; **final HEAD:** `9a0aa1c3`; measured commits: 3.

## Verification Results

- `npx vitest run src/services/ai/__tests__/graphitiRules.test.ts src/services/ai/__tests__/mcpClient.test.ts --bail=1` — 2 files, 16 tests passed.
- `npx vitest run tests/services/ai/office/teamPrompts.test.ts tests/services/ai/office/teamRunCoordinator.test.ts tests/ai/AIChatDrawerConventions.test.tsx --bail=1` — 3 files, 274 tests passed.
- `npx vitest run tests/components/settings/GraphitiSqlConfigCard.test.tsx tests/components/settings/McpConfigCard.test.tsx --bail=1` — 2 files, 8 tests passed.
- `npx tsc --noEmit` — clean.
- `cd public/ai-rules && shasum -a 256 -c SHA256SUMS` — both rule files OK.
- Greps clean: no `applyGraphitiRules`, no `getEnabledMcpInstructions` in the four AI/settings surfaces, no hard-coded endpoint/CLI literal, no legacy apply-button copy.
- `git status --short` — no changes to `CLAUDE.md`, `.claude/skills/`, or `office-claude-code-rules.updated/` from this plan.

## Files Created/Modified

- `src/services/ai/graphitiRules.ts` - dedicated service: config, intent, verified segment builder
- `src/services/ai/__tests__/graphitiRules.test.ts` - rewritten covering config, hash failures, skill segments
- `src/services/ai/mcpClient.ts` - `sanitizeUrl` exported, logic untouched
- `src/components/ai/AIChatDrawer.tsx` - prompt uses dedicated segment
- `src/services/ai/office/teamPrompts.ts` - field renamed to `graphitiSkillSegment`
- `src/services/ai/office/teamRunCoordinator.ts` - lead and employee segment wiring
- `src/views/SettingsView.tsx` - new card placed in AI tab
- `src/components/settings/GraphitiSqlConfigCard.tsx` - new dedicated settings card
- `src/components/settings/McpConfigCard.tsx` - legacy apply button/handler removed
- `tests/services/ai/office/teamPrompts.test.ts`, `tests/services/ai/office/teamRunCoordinator.test.ts`, `tests/ai/AIChatDrawerConventions.test.tsx`, `tests/components/settings/*.test.tsx` - targeted wiring coverage

## Decisions Made

None beyond the locked decisions D-01..D-07 recorded in the plan; all followed as written.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stale conventions assertions in `AIChatDrawerConventions.test.tsx`**
- **Found during:** Task 2
- **Issue:** Two assertions expected the pre-`261123-et1` header text (`DỮ LIỆU KHÔNG TIN CẬY`) and a bracketed repo header, while `conventionsSegment.ts` now emits `CHỈ DẪN ĐƯỢC TIN CẬY` inside an untrusted wrapper.
- **Fix:** Updated the two assertions to match the current trusted-instruction framing without touching production behavior.
- **Files modified:** `tests/ai/AIChatDrawerConventions.test.tsx`
- **Verification:** Task 2 targeted suite green (274 tests).
- **Committed in:** `5df0e268`

---

**Total deviations:** 1 auto-fixed (Rule 1) in test assertions only. No scope creep.

## Issues Encountered

- Task 1 fixture initially regenerated its manifest from a tampered body; fixed by passing the original manifest explicitly.
- Task 3 card test mock omitted the exported `GRAPHITI_SQL_SERVER_IDS`, throwing on save; added the constant to the mock.

## User Setup Required

None - URLs are entered at runtime by the user in the new Settings card; no external service configuration is needed for verification.

## Next Phase Readiness

Ready for review: all three tasks committed, targeted Vitest and typecheck pass, hash/grep proofs clean. Human UAT may confirm the Settings card visually; no code blocker remains.

---
*Plan: 261125-hn9*
*Completed: 2026-11-25*
