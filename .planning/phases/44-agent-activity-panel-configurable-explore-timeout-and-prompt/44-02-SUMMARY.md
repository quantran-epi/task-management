---
phase: 44-agent-activity-panel-configurable-explore-timeout-and-prompt
plan: 02
subsystem: api
tags: [tool-events, id-upsert, runtime-telemetry, capped-preview, payload-status, team-run-coordinator, vitest]

requires:
  - phase: 44-agent-activity-panel-configurable-explore-timeout-and-prompt
    provides: "Plan 01 explore_repo timeoutSeconds -> derived timeoutMs contract (44-01-SUMMARY.md)"
  - phase: 37.1
    provides: "AgentRunState.steps / AgentLiveStep runtime step list and MAX_LIVE_STEPS = 200 ceiling"
provides:
  - "AgentLiveStep extended additively with seven optional telemetry fields (D-04)"
  - "id-based call+result upsert (upsertToolStep) into AgentRunState.steps via updateAgent (D-05)"
  - "8000-char args/result preview caps and 200-row timeline ceiling enforced at write time (D-06/D-07)"
  - "Payload-derived tool status (refused/error/outcome-error -> error, plain text -> done, call-only -> running) (D-08)"
  - "Compact TeamActivityIndicator remains a byte-identical single-source reader of the same rows"
  - "Six focused coordinator tests plus full-file regression proof (187 tests pass)"
affects:
  - "44-03 (Agent Activity Panel renders these id-keyed rows; derive explore_repo deadline from serialized args)"
  - "TeamActivityIndicator popover (keeps working from label/at/detail on the same rows)"

actuals:
  tokens: 3571
  tasks: 3
  commits: 3
  plan_head_before: ae7c4588f1d696a987e2e7b1711e2568ec6a5802
  plan_head_after: b77fd32c9fcdf2710050c6fa8fc618c926871451

tech-stack:
  added: []
  patterns:
    - "Id-keyed upsert modeled on mergeToolEvents ({...previous, ...event}) but keyed by event.id, with both phases guarded so orphan/duplicate results never spread undefined or append"
    - "Payload status parsed defensively from a JSON string in try/catch; unparseable value treated as plain-text success (never infer status from tool name)"
    - "Untrusted previews capped at write time (slice(0, TOOL_PREVIEW_CAP)) and every optional field conditionally spread under exactOptionalPropertyTypes"

key-files:
  created: []
  modified:
    - "src/types/aiOffice.ts"
    - "src/services/ai/office/teamRunCoordinator.ts"
    - "tests/services/ai/office/teamRunCoordinator.test.ts"

key-decisions:
  - "AgentLiveStep gains toolName/phase/startedAt/endedAt/durationMs/status/resultPreview as explicit '| undefined' optional fields, all conditionally spread; id/label/at/detail remain byte-identical (D-04)"
  - "upsertToolStep is the sole id-keyed writer beside the preserved pushStep; it reuses updateAgent and the existing MAX_LIVE_STEPS = 200 ceiling with no second cap (D-05/D-07)"
  - "A result with no prior call still creates a minimal non-blank row (toolName/label from event.name or id), and a duplicate result merges in place rather than appending (Pitfall 2)"
  - "deriveToolStatus parses the JSON-string result in try/catch; refused===true, a truthy error, or outcome==='error' -> error; parse failure -> done (D-08, Pitfall 1/A2)"
  - "TOOL_PREVIEW_CAP = 8000 is applied to args and result previews before they enter runtime state; the model still receives the full tool result (D-06)"
  - "TeamActivityIndicator.tsx is left byte-identical — a compatibility test pins label/at/detail on each upserted row so a future refactor that drops them breaks a test instead of blanking the popover (D-04/Pitfall 3)"

patterns-established:
  - "Tool telemetry is one id-keyed row per call+result pair; the same rows feed both the compact popover and the upcoming panel — no second data path"
  - "Optional runtime fields use explicit '| undefined' in the type and conditional spreads at the write site, satisfying exactOptionalPropertyTypes"

requirements-completed: [PANEL-01]

coverage:
  - id: D1
    description: "AgentLiveStep extended additively with seven telemetry fields; onToolEvent consumes both phases and upserts one id-keyed row with timing and result preview"
    requirement: PANEL-01
    verification:
      - kind: unit
        ref: "tests/services/ai/office/teamRunCoordinator.test.ts#pairs a call and its result into ONE id-keyed row with timing and preview"
        status: pass
    human_judgment: false
  - id: D2
    description: "Status derived from the result payload: refused/error/outcome-error -> error, plain text -> done, call-only -> running, orphan result non-blank"
    requirement: PANEL-01
    verification:
      - kind: unit
        ref: "tests/services/ai/office/teamRunCoordinator.test.ts#derives error status from refused, error and outcome-error payloads"
        status: pass
      - kind: unit
        ref: "tests/services/ai/office/teamRunCoordinator.test.ts#leaves a call-only row running and handles a result with no prior call"
        status: pass
    human_judgment: false
  - id: D3
    description: "Arguments and result previews capped at 8000 chars before storing; timeline capped at 200 rows"
    requirement: PANEL-01
    verification:
      - kind: unit
        ref: "tests/services/ai/office/teamRunCoordinator.test.ts#caps args and result previews at 8000 chars before storing"
        status: pass
      - kind: unit
        ref: "tests/services/ai/office/teamRunCoordinator.test.ts#caps the timeline at MAX_LIVE_STEPS (200) rows"
        status: pass
    human_judgment: false
  - id: D4
    description: "Compact popover legacy fields (label, ISO at, capped detail) preserved on call+result rows; pushStep and existing coordinator behavior unregressed"
    requirement: PANEL-01
    verification:
      - kind: unit
        ref: "tests/services/ai/office/teamRunCoordinator.test.ts#keeps label, ISO at and capped detail for the compact popover after call+result"
        status: pass
      - kind: unit
        ref: "tests/services/ai/office/teamRunCoordinator.test.ts (full file, 187 tests)"
        status: pass
    human_judgment: false

duration: 11min
completed: 2026-11-17
status: complete
---

# Phase 44 Plan 02: Agent Activity Panel Data Contract Summary

**Tool calls and results now collapse into one id-keyed, capped, payload-statused live step that both the compact popover and the upcoming panel read from a single source**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-11-17T05:33:32Z
- **Completed:** 2026-11-17T05:44:12Z
- **Tasks:** 3
- **Files modified:** 3
- **Files created:** 0

## Accomplishments

- Extended `AgentLiveStep` additively with `toolName`, `phase`, `startedAt`, `endedAt`, `durationMs`, `status`, `resultPreview` (all explicit `| undefined`), keeping `id`/`label`/`at`/`detail` unchanged.
- Added module-private `upsertToolStep`, `deriveToolStatus` and `TOOL_PREVIEW_CAP` in `teamRunCoordinator.ts`; `onToolEvent` now consumes both `call` and `result`, so results are no longer discarded.
- One row per tool-event id: `call` creates timing + capped args + running status; `result` merges duration, endedAt, payload-derived status and a capped preview into that same row — orphan and duplicate results are guarded.
- Bounded at write time: args and result previews at 8000 chars each, timeline at the existing `MAX_LIVE_STEPS = 200` via `updateAgent`.
- Left `TeamActivityIndicator.tsx` byte-identical and pinned its required `label`/`at`/`detail` fields with a compatibility test.
- Verified with `npx tsc --noEmit -p tsconfig.json` (exit 0), the six focused "tool event" tests, and the full 187-test coordinator file (exit 0, no regressions).

## Task Commits

Each task was committed atomically:

1. **Task 1: One tool call flows call -> result -> one upserted live step** - `43c851f6` (feat, tracer)
2. **Task 2: Cap previews and timeline; derive status from payload** - `733d138a` (test)
3. **Task 3: Preserve the compact popover as a thin reader of the same rows** - `b77fd32c` (test)

**Plan metadata:** pending (docs commit by orchestrator)

_Note: the production helpers for status derivation and capping were implemented in Task 1 (the plan explicitly prefers a real end-to-end single path); Task 2 and Task 3 add their verification tests. All production code lives in the Task 1 commit._

## Files Created/Modified

- `src/types/aiOffice.ts` - seven additive optional telemetry fields on `AgentLiveStep` (D-04).
- `src/services/ai/office/teamRunCoordinator.ts` - imports for `AgentLiveStep`/`ChatTurnToolEvent`; `TOOL_PREVIEW_CAP`, `deriveToolStatus`, `upsertToolStep`; `onToolEvent` calls the upsert for both phases (D-05/D-06/D-08).
- `tests/services/ai/office/teamRunCoordinator.test.ts` - new `describe('tool event upsert')` block: pairing, status derivation, orphan/call-only guards, caps, and popover compatibility (6 cases).

## Decisions Made

- Implemented the capping and status-derivation helpers inside Task 1's single end-to-end path rather than stubbing them, per the plan's stated preference; Tasks 2 and 3 lock them with tests. No architectural change.
- The tracer task has an automated-only `<verify>` and `human_verify_mode` is `end-of-phase`, so no tracer feedback checkpoint was required — the verify was re-run and passed (final full-file run: 187/187).
- All untracked files present at execution start were pre-existing and left untouched; this plan created no new files.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Typecheck and all focused tests passed on every task; the full coordinator file passed with no regressions. No stub patterns were found in the changed production files.

## User Setup Required

None - no external service configuration required.

## Threat Flags

None - the plan's threat register (T-44-01 payload tampering, T-44-03 timeline DoS) is fully mitigated: previews capped at 8000 chars before storage, tool text stored as strings only and never interpreted, status parsed defensively in try/catch, timeline capped at 200 rows with runtime-only state and no new egress/schema.

## Next Phase Readiness

- The id-keyed, capped, payload-statused `AgentRunState.steps` rows are stable; plan 03 can render them directly in the new Agent Activity Panel and derive the `explore_repo` deadline from the serialized args string (per RESOLVED open question, no unlisted `AgentLiveStep` field).
- No blockers.

---
*Phase: 44-agent-activity-panel-configurable-explore-timeout-and-prompt*
*Completed: 2026-11-17*

## Self-Check: PASSED

- SUMMARY.md exists at the expected phase path.
- All 3 task commits (43c851f6, 733d138a, b77fd32c) are ancestors of HEAD.
- All 3 modified source/test files exist on disk.
- `npx tsc --noEmit -p tsconfig.json` exits 0; 6 focused "tool event" tests and the full 187-test coordinator file pass.
