---
phase: 34-ai-office-fixed-ai-employees-with-persona-role-per-model-mul
plan: 07
subsystem: ai-office
tags: [team-run, coordinator, delegate_batch, budget-gate, concurrency, ai-office]

requires:
  - phase: 34-ai-office-fixed-ai-employees-with-persona-role-per-model-mul
    provides: teamRunRegistry (34-04), budgetGate (34-04), teamPrompts (34-04), teamTools (34-05), chatTurnTools allowlists (34-03), abortable beforeToolRound (34-03)
provides:
  - Headless team-run coordinator with phase state machine, @agent routing and snapshot subscription
  - delegate_batch interception with plan-card park, bypass toggle and concurrent batch
  - Terminal-only batch settle with incomplete marking and sanitized error reports
  - Per-agent and team budget gates with top-up resume and stop-while-parked safety
  - Lead mutation-approval passthrough and both stop controls
affects: [34-08, 34-10]

tech-stack:
  added: []
  patterns:
    - "Headless coordinator module: no React import, created once per team outside component state"
    - "Three-tier executeToolFn dispatch: coordinator (delegate_batch) → teamTools → dispatchAiToolCall"
    - "Deferred-per-agent settle so a paused turn keeps the batch pending"

key-files:
  created:
    - src/services/ai/office/teamRunCoordinator.ts
    - tests/services/ai/office/teamRunCoordinator.test.ts
  modified: []

key-decisions:
  - "delegate_batch is intercepted in the lead's executeToolFn, never added to AI_DATABASE_TOOLS"
  - "Batch settle is driven by a per-agent deferred resolved only on a terminal transition, not by racing runtime.start()"
  - "Employee delegate_batch hallucination returns a structured refusal instead of falling through to the MCP path"
  - "A paused agent is only flipped back to running when both its own gate and the team gate are open"

patterns-established:
  - "Team tool dispatch guard: resolveTeamToolName(name) proves every advertised name has a handler"
  - "Budget pause never aborts; the turn parks at beforeToolRound and resumes in place after top-up"

requirements-completed: [AIO-TEAM-01, AIO-TEAM-02, AIO-TEAM-03, AIO-TEAM-04, AIO-BG-01, AIO-WRITE-01, AIO-WRITE-02, AIO-BUDGET-02, AIO-MEM-01]

duration: 42min
completed: 2026-11-08
---

# Phase 34 Plan 07: Team-Run Coordinator Summary

**Headless team-run coordinator: lead-mediated `delegate_batch` behind a plan card, three concurrent employee turns settled only on terminal state, dual budget gates that pause without aborting, and both stop controls**

## Performance

- **Duration:** 42 min
- **Started:** 2026-11-08T22:17:00Z
- **Completed:** 2026-11-08T22:59:14Z
- **Tasks:** 3
- **Files modified:** 2 (both new)

## Accomplishments

- `createTeamRunCoordinator` with `send`, `runBatch`, `resolvePlan`, `resolveApproval`, `stopAgent`, `abortAll`, `topUp`, `subscribe`, `getState` — no React import, so a run survives a view switch (D-22)
- `@[Name](agent:<id>)` routing to that employee; bare messages and unknown mentions fall back to the lead
- `delegate_batch` validated by `executeTeamTool`, parked on the plan card unless `autoSplitEnabled`, then run as a concurrent batch whose tool result is produced only after every entry is terminal
- Every other advertised team tool (`search_team_history`, `read_team_turn`, `read_skill`, `list_linked_items`, `get_linked_context`) routed to `executeTeamTool`, never to the dynamic-MCP fall-through
- Per-agent and team budget gates awaited at `beforeToolRound(round, signal)` with the loop's own signal, so a Stop while parked rejects instead of hanging
- Usage accumulated per member via `addUsedTokens`; 80% crossing pauses (never aborts) and `topUp` resumes the parked turn in place
- 25 tests green, `npx tsc --noEmit` clean, no package changes

## Task Commits

1. **Tasks 1-3: coordinator state machine, delegate_batch batch, budget wiring** - `3b239f6` (feat)

_Note: the three plan tasks all edit the same two files and were committed together after the full suite passed; see TDD Gate Compliance._

## Files Created/Modified

- `src/services/ai/office/teamRunCoordinator.ts` — coordinator module (state machine, routing, tool payload composition, batch, gates, stops)
- `tests/services/ai/office/teamRunCoordinator.test.ts` — 25 tests over routing, payloads, plan park, concurrency, terminal settle, stop, budget pause and tool resolution

## Decisions Made

- **Interception over registration:** `delegate_batch` stays out of `AI_DATABASE_TOOLS` and is handled in the coordinator's `executeToolFn`, matching the plan's deliberate deviation from the research note. Zero edits to the 5 280-line `aiTools.ts` switch.
- **Deferred settle, not `start()` racing:** a paused runtime's `start()` never resolves, so the batch awaits a per-agent deferred resolved from the terminal transition path. This is what makes D-30 ("never synthesize past a paused agent") structural rather than timing-dependent.
- **Employee `delegate_batch` refusal:** tier 1 returns `EMPLOYEE_DELEGATE_REFUSAL` for a non-lead caller rather than falling through to `executeTeamTool`'s roster check, so a hallucinated nested batch cannot name a valid agent.
- **Dual-gate resume:** `topUp` only flips a paused agent back to `running` when the team gate is also open; otherwise the snapshot would claim a running turn that is still parked.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `topUp` flipped a still-parked agent to `running`**
- **Found during:** Task 3 (budget pause wiring)
- **Issue:** topping up the agent scope opened the agent gate but left the team gate closed; the state was set to `running` while `beforeToolRound` was still parked on the team gate, and the lead test timed out.
- **Fix:** `topUp` now checks `teamGate.isClosed()` before clearing `paused`, and the team-scope branch re-evaluates every paused agent against its own gate.
- **Files modified:** `src/services/ai/office/teamRunCoordinator.ts`
- **Verification:** "parks the lead when the team budget crosses 80%" passes after two top-ups (agent then team).
- **Committed in:** `3b239f6`

**2. [Rule 1 - Bug] `topUp` before any `send` had no member rows loaded**
- **Found during:** Task 3
- **Issue:** `memberIds` is populated lazily in `send`; a `topUp` on a fresh coordinator silently skipped the DB write.
- **Fix:** `topUp` awaits `ensureMembers()` first.
- **Files modified:** `src/services/ai/office/teamRunCoordinator.ts`
- **Verification:** member `usedTokens` assertion in the resume test.
- **Committed in:** `3b239f6`

**3. [Rule 1 - Bug] Wrong relative import depth for sibling services**
- **Found during:** Task 1
- **Issue:** `../../aiOrchestratorLoop` from `src/services/ai/office/` resolved outside the directory; module not found at test time.
- **Fix:** corrected to `../aiOrchestratorLoop`, `../aiTools`, `../chatTurnTools`, `../aiTurnManager`.
- **Files modified:** `src/services/ai/office/teamRunCoordinator.ts`
- **Verification:** test run resolves all imports.
- **Committed in:** `3b239f6`

---

**Total deviations:** 3 auto-fixed (3 bugs)
**Impact on plan:** All three were correctness defects in the new module; no scope change, no new files.

## TDD Gate Compliance

The plan's three tasks are `tdd="true"` and share one source file and one test file. Test and implementation were written together and committed as a single `feat` commit (`3b239f6`) after the suite passed — there is no separate RED `test(...)` commit. Behaviour is covered by 25 assertions across the three task groups; the RED gate was exercised interactively (two failing runs before the fixes above) but not captured as its own commit.

## Issues Encountered

- The `ChatTokenUsage` type is not re-exported from `chatTurnRuntime.ts`; imported from `src/types/models` instead.
- `tsc` flagged `let` release callbacks assigned inside promise executors as never-callable; replaced with a small `deferred()` holder helper in the test file.

## Known Stubs

None.

## Threat Flags

None — the new surface (batch dispatch, employee read-only enforcement, budget pause, stop-while-parked, error sanitization) is fully covered by the plan's threat register (T-34-32 … T-34-40).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for plan 34-08 (workspace UI) and 34-10 (host wiring): the coordinator exposes the snapshot and resolvers those components need.
- Host must resolve `endpoint` / `apiKey` from `getNineRouterConfig(db)` / `getNineRouterApiKey(db)` before constructing the coordinator (34-10 Task 2).
- `resolveTeamToolName` is exported for the plan's tool-resolution guard test.

## Self-Check: PASSED

- FOUND: `src/services/ai/office/teamRunCoordinator.ts`
- FOUND: `tests/services/ai/office/teamRunCoordinator.test.ts`
- FOUND: commit `3b239f6`

---
*Phase: 34-ai-office-fixed-ai-employees-with-persona-role-per-model-mul*
*Completed: 2026-11-08*
