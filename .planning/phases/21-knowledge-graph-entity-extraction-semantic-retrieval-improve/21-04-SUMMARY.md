---
phase: 21-knowledge-graph-entity-extraction-semantic-retrieval-improve
plan: 04
subsystem: knowledge-graph-extraction
tags:
  - knowledge-graph
  - prose-extraction
  - fallback
  - docker-compose
  - resilience
dependency_graph:
  requires:
    - 21-01
    - 21-03
  provides:
    - hybrid prose extraction configuration
    - fail-safe fallback to deterministic extraction
  affects:
    - docker-compose.yml
    - knowledge-server/src/main.ts
    - knowledge-server/src/services/graphBuildService.ts
tech_stack:
  added: []
  patterns:
    - Graceful degradation on LLM endpoint omission or outage
    - Zero downtime / fail-safe snapshot construction
key_files:
  created: []
  modified:
    - docker-compose.yml
    - knowledge-server/src/main.ts
    - knowledge-server/src/services/graphBuildService.ts
    - knowledge-server/tests/main.test.ts
    - knowledge-server/tests/graphBuildRuntime.test.ts
    - knowledge-server/tests/proseFallback.test.ts
decisions:
  - "Default PROSE_EXTRACTION_ENABLED to true with fallback to PLANNER credentials when explicit prose extraction endpoint is not set"
  - "Gracefully disable prose extraction when unconfigured rather than crashing the container on startup"
  - "Allow http:// protocol for localhost / loopback hosts while enforcing https:// on remote endpoints"
  - "Wrap prose extraction in try-catch in GraphBuildService so LLM timeout, network errors, or malformed outputs never fail snapshot creation"
metrics:
  duration: 8m
  completed_date: "2026-10-18"
---

# Phase 21 Plan 04: Prose Extraction Fallback & Configuration Hardening Summary

Hybrid prose extraction activated with robust fail-safe fallback to 100% deterministic extraction when LLM is unconfigured, unreachable, or times out.

## What Was Done

### Task 1: Enable PROSE_EXTRACTION_ENABLED and Harden Configuration Loading
- Updated `docker-compose.yml` to set `PROSE_EXTRACTION_ENABLED=${PROSE_EXTRACTION_ENABLED:-true}` with passthroughs for `PROSE_EXTRACTION_ENDPOINT`, `PROSE_EXTRACTION_MODEL`, `PROSE_EXTRACTION_API_KEY`, and `PROSE_EXTRACTION_ALLOWED_HOSTS`.
- Hardened `knowledge-server/src/main.ts` `readKnowledgeServerOptions`:
  - Reuses remote planner credentials (`PLANNER_ENDPOINT`, `PLANNER_MODEL`, `PLANNER_API_KEY`, `PLANNER_REMOTE_ALLOWED_HOSTS`) if `PROSE_EXTRACTION_ENDPOINT` is not explicitly set.
  - Logs a diagnostic warning and safely sets `proseExtraction.enabled = false` when no LLM endpoint is configured at all, preventing container crash loops.
  - Permits `http://` protocol for loopback hosts (`127.0.0.1`, `::1`, `localhost`) while strictly requiring `https://` for external remote hosts.
- Commits: `cada434`, `dc51056`.

### Task 2: Verify Hybrid Prose Extraction Fallback and Graph Build Stability
- Hardened `knowledge-server/src/services/graphBuildService.ts` to wrap prose extraction execution in a try-catch block, guaranteeing that snapshot build pipeline always proceeds to `READY` state.
- Enhanced `knowledge-server/tests/proseFallback.test.ts` with integration test suite:
  - **HTTP 504 Gateway Timeout**: Verified snapshot state transitions to `READY`, preserving all deterministic nodes (`ProcessStep`, `DatabaseObject`, `SoftwareComponent`) and relations (`PRECEDES`, `CALLS`/`INVOKES`, `WRITES_TO`) with failure quarantined.
  - **Network Error / Timeout**: Verified network rejections do not interrupt candidate compilation.
  - **Malformed JSON**: Verified broken responses are safely quarantined without corrupting the active graph candidate.
  - **Unresolvable URN Endpoints**: Verified LLM candidates referencing phantom URNs are quarantined.
  - **Unconfigured Endpoint**: Verified snapshot builds complete cleanly using deterministic extractions only.
  - **Successful Prose Extraction**: Verified valid prose relations merge as `INFERRED` alongside deterministic `OBSERVED` facts.
- Commits: `40e9ded`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated obsolete test assertion in `graphBuildRuntime.test.ts`**
- **Found during:** Task 1 verification
- **Issue:** Test previously asserted that omitting prose extraction endpoint threw an exception, which contradicted the new requirement to gracefully fallback to `enabled: false`.
- **Fix:** Updated test case to verify `opts.proseExtraction.enabled === false`.
- **Files modified:** `knowledge-server/tests/graphBuildRuntime.test.ts`
- **Commit:** `dc51056`

## Verification

Ran automated test suites:
- `npm --prefix knowledge-server test -- tests/proseFallback.test.ts` (11 passed)
- `npm --prefix knowledge-server test -- tests/main.test.ts` (23 passed)
- `npm --prefix knowledge-server test -- tests/graphBuildRuntime.test.ts` (20 passed)

All 54 tests across configuration and fallback suites pass.

## Self-Check: PASSED

- `docker-compose.yml`: FOUND
- `knowledge-server/src/main.ts`: FOUND
- `knowledge-server/src/services/graphBuildService.ts`: FOUND
- `knowledge-server/tests/proseFallback.test.ts`: FOUND
- Commit `cada434`: FOUND
- Commit `dc51056`: FOUND
- Commit `40e9ded`: FOUND
