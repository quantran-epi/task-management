---
phase: 44-agent-activity-panel-configurable-explore-timeout-and-prompt
reviewed: "2026-11-17T06:20:00Z"
depth: standard
files_reviewed: 6
files_reviewed_list:
  - src/services/remoteExploreService.ts
  - src/services/ai/office/teamTools.ts
  - src/services/ai/office/teamRunCoordinator.ts
  - src/types/aiOffice.ts
  - src/components/ai/office/AgentActivityPanel.tsx
  - src/components/ai/office/TeamWorkspace.tsx
findings:
  critical: 0
  warning: 0
  info: 3
  total: 3
  necessity: 0
status: clean
---

# Phase 44: Code Review Report

**Reviewed:** 2026-11-17T06:20:00Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** clean

## Summary

Reviewed the six source files changed across phase-44 plans 01–03 (base `57b6949`..HEAD):
the configurable `explore_repo` watchdog deadline, the id-keyed tool-event upsert in the
coordinator, the additive `AgentLiveStep` telemetry fields, the new presentational
`AgentActivityPanel`, and the `TeamWorkspace` rail/migration wiring.

Trace-verified the load-bearing data path rather than trusting the diff: `chatTurnRuntime.ts:386-405`
emits `call` (args = `JSON.stringify(call.args ?? {})`) and `result` (`result: toolResult`) events
with a shared id; `aiOrchestratorLoop.ts:485-492` serializes thrown tool errors as
`JSON.stringify({error: "..."})` and refusals at `:465-468` likewise, so `deriveToolStatus`'s
`record['refused'] === true || record['error'] || record['outcome'] === 'error'` correctly
classifies error results. The deadline derivation in the panel's `ProgressCard` uses the same
`Math.floor(Number(x))` then clamp-to-60..900 (default 300) rule as
`clampExploreTimeoutSeconds`, so the displayed deadline matches the actual watchdog for
numeric, out-of-range, fractional, null, empty and non-numeric inputs.

All plan-mandated traps are clean: no discarded result events (`onToolEvent` no longer has an
early `phase !== 'call'` return), no status inferred from a tool name, previews capped at 8 000
chars at write time (coordinator `TOOL_PREVIEW_CAP`) and again at render (panel
`ACTIVITY_PREVIEW_CAP`), no `dangerouslySetInnerHTML` on tool/prompt text, no auto-expanded
details, no dead `Modal`/`BugOutlined`/`debugModalOpen` remnants, `EXPLORE_DEFAULT_TIMEOUT_MS`
still `300_000`, and no `AIDebugModal.tsx`/PWA/GitHub-Pages/Dexie/backup-schema changes in the
phase diff. Three Info observations are recorded below with rationale; none blocks the quality bar.

All reviewed files meet the critical/warning quality bar. No Critical or Warning findings.

## Narrative Findings (AI reviewer)

## Info

### IN-01: `capPreview().truncated` boolean is computed but never read

**File:** `src/components/ai/office/AgentActivityPanel.tsx:87-91`
**Issue:** `capPreview` returns `{ text, truncated }`, but no caller reads `.truncated` (three
call sites at `:157`, `:158`, `:316` use only `.text`). The truncation is actually conveyed by
embedding `TRUNCATION_MARKER` into the returned `text`, so behavior is correct; the boolean is
just a redundant return field.
**Fix:** Optional cleanup — drop `truncated` from the return type or use it to drive an explicit
badge. Not required for correctness; recorded as Info per the review rubric (dead code).

### IN-02: `explore_repo` progress clock is a render-time snapshot — RESOLVED in UI review

**File:** `src/components/ai/office/AgentActivityPanel.tsx:264-274` (pre-fix)
**Issue:** `elapsedMs = Date.now() - startedMs` was computed only at render; the panel had no
timer of its own, so the elapsed clock could freeze at `00:00` during a blocked remote call.
**Resolution:** The parallel UI review independently classified this as WR-01 (Warning) and it
was fixed with a self-driven 1s ticker plus cleanup and a RED/PASSING-AFTER test. See
`44-UI-REVIEW.md` WR-01. No action remains for the code-review artifact.

### IN-03: one progress card shown when several `explore_repo` calls run concurrently

**File:** `src/components/ai/office/AgentActivityPanel.tsx:440-442`
**Issue:** `runningExplore` uses `.find()` over reverse-chronological rows, so only the most
recent running `explore_repo` gets a progress card; other concurrent running explores still get
normal rows but no card. Tool execution within one agent turn is sequential, and the plan/UI-SPEC
specify a single app-level progress card, so this matches the approved design; cross-agent
concurrent explores are an edge case.
**Fix:** None required for this phase — would be a multi-card redesign out of scope of D-11.
Recorded as Info for backlog awareness.

---

_Reviewed: 2026-11-17T06:20:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
