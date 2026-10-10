---
phase: 17-pilot-ontology-deterministic-extraction-neo4j-knowledge-grap
plan: 06
subsystem: knowledge-graph
status: complete
tags: [react, fastify, zod, graph-rebuild, error-handling]
requires:
  - phase: 17-05
    provides: Durable graph rebuild orchestration and atomic active-graph promotion
provides:
  - Stable memoized KnowledgeClient identity in DocumentSetDrawer
  - Terminal failed-rebuild polling with bounded safe error details
  - Actionable graph failure toast and alert while preserving prior active graph metadata
  - Human retest sequence for Phase 17 UAT Tests 2 through 7
affects: [knowledge-graph-ui, knowledge-server, phase-17-uat]
tech-stack:
  added: []
  patterns: [memoized service clients, bounded safe error DTOs, explicit terminal failure handling]
key-files:
  created: []
  modified:
    - src/components/knowledge/DocumentSetDrawer.tsx
    - src/services/knowledge/knowledgeClient.ts
    - knowledge-server/src/routes/graph.ts
    - knowledge-server/src/services/graphBuildService.ts
    - tests/knowledge/knowledgeClient.test.ts
    - knowledge-server/tests/graphRoutes.test.ts
    - .planning/phases/17-pilot-ontology-deterministic-extraction-neo4j-knowledge-grap/17-UAT.md
key-decisions:
  - "Expose only allow-listed graph rebuild codes and fixed user-safe messages; never return stored raw errors."
  - "Return failed graph status with prior active snapshot metadata when available so failure isolation stays visible."
patterns-established:
  - "Graph rebuild failures are terminal client states, not successful completion."
  - "Daemon error DTOs remain strict and length-bounded across server and browser schemas."
requirements-completed: [GRAPH-05, GRAPH-06]
duration: 9min
completed: 2026-10-10
---

# Phase 17 Plan 06: Graph Rebuild UAT Gap Closure Summary

**Stable graph status loading plus safe terminal rebuild failures with actionable UI and preserved prior active graph context**

## Performance

- **Duration:** 9 min
- **Started:** 2026-10-10T15:44:00Z
- **Completed:** 2026-10-10T15:53:00Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Memoized `KnowledgeClient` from stable injected/configured inputs, stopping graph-status effect churn.
- Added strict bounded error envelopes on server and client graph status DTOs.
- Sanitized rebuild failures into allow-listed codes and fixed safe messages without raw internal error leakage.
- Stopped polling immediately on `Failed`, suppressed false success toast, and rendered actionable error alert.
- Preserved active graph snapshot and counts in failed status when an earlier graph remains active.
- Added explicit UAT retest routing for Tests 2 through 7.

## Task Commits

1. **Task 1: Stabilize DocumentSetDrawer client identity** — `2333e96`
2. **Task 2: Expose and render safe rebuild failures** — `a3aaf9b`
3. **Task 3: Document UAT retest routing** — `7083931`

## Verification

- `npm test -- tests/knowledge/knowledgeClient.test.ts -t "graph client methods"` — 3 passed.
- `npm test -- knowledge-server/tests/graphRoutes.test.ts tests/knowledge/knowledgeClient.test.ts` — 18 passed; root runner covers browser client file.
- `npm --prefix knowledge-server test -- tests/graphRoutes.test.ts` — 6 passed.
- `npm test -- knowledge-server/tests/pilotAcceptance.test.ts tests/knowledge/offlineIsolation.test.ts` — 3 passed; root runner covers offline isolation file.
- `npm --prefix knowledge-server test -- tests/pilotAcceptance.test.ts` — 8 passed.
- `npm --prefix knowledge-server exec tsc -- --noEmit` — passed.

## Files Created/Modified

- `src/components/knowledge/DocumentSetDrawer.tsx` — Memoizes client and renders terminal rebuild failure feedback.
- `src/services/knowledge/knowledgeClient.ts` — Validates safe errors and returns failed polling state immediately.
- `knowledge-server/src/routes/graph.ts` — Adds strict bounded graph error DTO.
- `knowledge-server/src/services/graphBuildService.ts` — Maps stored failures to safe status and preserves prior active metadata.
- `tests/knowledge/knowledgeClient.test.ts` — Covers stable client use and one-request failed polling.
- `knowledge-server/tests/graphRoutes.test.ts` — Covers sanitized failed status response.
- `.planning/phases/17-pilot-ontology-deterministic-extraction-neo4j-knowledge-grap/17-UAT.md` — Marks gaps addressed and records retest sequence.

## Decisions Made

- Generic failures use fixed Vietnamese copy instead of raw `Error.message`; prevents stack, path, credential, or implementation leakage.
- Any stored rebuild failure produces `Failed`, including when prior active graph exists; response retains active snapshot metadata for evidence access and failure-isolation verification.

## Deviations from Plan

- Root Vitest excludes `knowledge-server/tests`; server tests were run separately through knowledge-server package.
- Plan requested generic raw error message capped at 240 characters. Replaced with fixed safe copy because arbitrary internal errors can leak credentials or stack details.

**Total deviations:** 2 necessary execution/security adjustments. **Impact:** Full planned behavior preserved with stronger information-disclosure protection.

## Issues Encountered

- Two executor dispatches were incorrectly isolated by harness despite `workflow.use_worktrees=false`; both branch/base guards stopped before edits. Plan executed inline on `phase-17-build`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Automated gap checks pass. Phase remains pending human UAT retests 2 through 7.

## Self-Check: PASSED

- Task commits exist on `phase-17-build`.
- All declared modified files exist.
- Targeted browser and knowledge-server tests pass.
- No unrelated untracked files were staged or changed.

---
*Phase: 17-pilot-ontology-deterministic-extraction-neo4j-knowledge-grap*
*Completed: 2026-10-10*
