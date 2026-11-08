---
phase: 34-ai-office-fixed-ai-employees-with-persona-role-per-model-mul
plan: 05
subsystem: ai
tags: [bm25, indexeddb, dexie, ai-office, team-tools, refusal-contract, prompt-injection]

requires:
  - phase: 34-ai-office-fixed-ai-employees-with-persona-role-per-model-mul
    provides: AI Office types, employee/lead/skill/team/member/link repositories, team transcript over chatMessages, employee read-only and lead tool allowlists
provides:
  - Six team tool definitions (search_team_history, read_team_turn, read_skill, list_linked_items, get_linked_context, delegate_batch)
  - executeTeamTool dispatcher with request-bound TeamToolContext
  - Structured TeamToolRefusal contract with six refusal codes
affects: [34-07, 34-09, 34-10]

tech-stack:
  added: []
  patterns:
    - "Request-bound tool context: team/thread/agent identity never read from model args"
    - "Returned-value refusal objects instead of thrown errors for tool-level policy failures"
    - "Compact BM25 hit projection with excerpt cap; full body only via a dedicated read tool"
    - "Delegation to the existing get_item_details resolver instead of a parallel implementation"

key-files:
  created:
    - src/services/ai/office/teamTools.ts
    - tests/services/ai/office/teamTools.test.ts
  modified: []

key-decisions:
  - "search_team_history returns exactly turnId/agent/timestamp/kind/excerpt; excerpt capped at 400 chars and limit clamped to 8 default / 20 max"
  - "read_skill is the only path a skill body reaches a model (D-24); refuses with SKILL_NOT_ASSIGNED when ctx.skillId is absent or the row is gone"
  - "get_linked_context returns note/document bodies whole with no truncation; task/cr/system delegate to executeAiTool('get_item_details') to prevent resolver drift"
  - "delegate_batch is a validator only — the coordinator intercepts it in the lead executeToolFn, so it stays out of AI_DATABASE_TOOLS"
  - "skillId is passed through untouched in delegate_batch; the agent's assigned skill remains authoritative (D-33)"

patterns-established:
  - "Team tool context: { db, teamId, threadId, agentId, skillId? } supplied by the coordinator, never derived from args"
  - "TeamToolRefusal mirrors ArtifactToolRefusal: { refused: true, code, message } as a returned value"

requirements-completed: [AIO-MEM-02, AIO-MEM-03, AIO-LINK-01, AIO-SKILL-02, AIO-TEAM-02]

duration: 9min
completed: 2026-11-08
---

# Phase 34 Plan 05: Team Tools Summary

**Six offline team tools with request-bound team scoping, compact BM25 transcript hits, untruncated linked-item bodies and structured refusals for delegation**

## Performance

- **Duration:** 9 min
- **Started:** 2026-11-08T22:08:50+07:00
- **Completed:** 2026-11-08T22:16:42+07:00
- **Tasks:** 3
- **Files modified:** 2 (1 created source, 1 created test)

## Accomplishments

- `search_team_history` ranks the team's own transcript with the existing `rankBM25` and projects each hit to exactly `turnId, agent, timestamp, kind, excerpt`, with the excerpt produced by `extractRelevantSnippet` at 400 chars and `limit` clamped to 8 default / 20 max.
- `read_team_turn` returns one turn's full content and refuses any turnId outside the request-bound thread; `read_skill` returns the assigned skill body verbatim or refuses with `SKILL_NOT_ASSIGNED`.
- `list_linked_items` returns compact `itemId/itemType/name/code` entries with no bodies; `get_linked_context` returns note and document bodies whole (strict equality asserted against the seed) and resolves task/CR/system through the existing `get_item_details`.
- `delegate_batch` validates batch size and roster membership with `EMPTY_BATCH`, `BATCH_TOO_LARGE` and `AGENT_NOT_IN_ROSTER` refusals, never throwing, and stays out of `EMPLOYEE_READ_ONLY_ALLOWLIST` and `AI_DATABASE_TOOLS`.
- No network path exists in the module (`grep -c "fetch(\|http"` returns 0) and no package files changed.

## Task Commits

Each task was committed atomically with its TDD pair:

1. **Task 1: Offline transcript search tools and the skill reader** - `0366a978` (test), `6fa1fcfd` (feat)
2. **Task 2: Linked-item retrieval with full content** - `3ddb4035` (test), `267f53a0` (feat)
3. **Task 3: delegate_batch validation with structured refusals** - `a3a8bee1` (test), `8861aa98` (feat)

**Plan metadata:** committed with this SUMMARY.

## Files Created/Modified

- `src/services/ai/office/teamTools.ts` - six `TEAM_TOOL_DEFINITIONS`, `executeTeamTool`, `TeamToolContext`, `TeamToolRefusal`, `TeamToolRefusalCode`
- `tests/services/ai/office/teamTools.test.ts` - 19 tests covering compact hit shape, limit clamping, team-scoped turn reads, skill body verbatim, untruncated linked-item bodies, out-of-team refusals, and delegate_batch validation

## Decisions Made

- Team identity is request-bound: `TeamToolContext` carries `teamId`, `threadId` and `agentId`; no handler reads them from `args`. Documented in the file-level comment as the cross-team read guard (T-34-21).
- `get_linked_context` reuses `executeAiTool('get_item_details', …)` rather than reimplementing task/CR/system resolution, so notes, worklogs and allocations cannot drift (T-34-22 mitigation plus drift avoidance).
- `delegate_batch` is a validator, not a dispatcher — the coordinator intercepts it before `dispatchAiToolCall`. Stated in a comment so a later reader does not wire it into `AI_DATABASE_TOOLS`.
- `EMPTY_BATCH` was added to `TeamToolRefusalCode` per the plan's Task 3 instruction, keeping the union exhaustive and documented.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The Task 1-only intermediate build left the Task 2 helper section in place, producing `noUnusedLocals` and a missing-import type error. Removed the unused section before the Task 1 GREEN commit; no behavior change and no extra commit.
- A test seed used `as const` on a `[string, 'lead' | 'employee']` tuple array, which widened to `string` and failed `tsc`. Replaced with an explicit `Array<[string, 'lead' | 'employee']>` annotation in the Task 3 test commit.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The coordinator plan (34-07) can now append `TEAM_TOOL_DEFINITIONS` to the lead and employee payloads and route `executeTeamTool` calls with its request-bound context.
- `delegate_batch` interception must happen in the lead's `executeToolFn` before `dispatchAiToolCall`; the handler only validates.

## Known Stubs

None.

## TDD Gate Compliance

Each task produced a `test(34-05)` commit followed by a `feat(34-05)` commit, and every RED run failed for the expected reason before implementation.

## Self-Check: PASSED

- `src/services/ai/office/teamTools.ts` — FOUND
- `tests/services/ai/office/teamTools.test.ts` — FOUND
- Commits `0366a978`, `6fa1fcfd`, `3ddb4035`, `267f53a0`, `a3a8bee1`, `8861aa98` — FOUND
- `npx vitest run tests/services/ai/office/teamTools.test.ts` — 19 passed
- `npx tsc --noEmit` — clean

---
*Phase: 34-ai-office-fixed-ai-employees-with-persona-role-per-model-mul*
*Completed: 2026-11-08*
