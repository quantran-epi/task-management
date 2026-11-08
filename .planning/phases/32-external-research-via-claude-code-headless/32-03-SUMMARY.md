---
phase: 32-external-research-via-claude-code-headless
plan: "03"
subsystem: ai
tags: [research, zod, ssh, shell-escaping, parsing]
dependency_graph:
  requires:
    - 32-02 (propose_research tool, RESEARCH artifact kind)
    - src/services/sshService.ts (getSshConfigById, testSshConnection)
    - src/db/repositories/systemRepo.ts (getSystem)
  provides:
    - ResearchFindingSchema / ResearchPayloadSchema / ResearchPayload / ResearchFinding
    - escapeShellArg
    - parseResearchOutput
    - checkResearchAvailability
    - ResearchRunError
  affects:
    - 32-04 (executeMultiSystemResearch consumes these exports)
tech_stack:
  added: []
  patterns:
    - Zod schema-first payload validation at trust boundary
    - Single-quote shell escaping with '\'' breakout neutralization
    - Balanced-brace JSON extraction with string/escape awareness
    - Per-target error isolation in availability pre-flight
key_files:
  created:
    - src/services/ai/researchService.ts
    - src/services/ai/__tests__/researchService.test.ts
  modified: []
decisions:
  - "parseResearchOutput tries fenced block, then balanced object, then raw text — never throws"
  - "checkResearchAvailability catches per system so one unreachable host cannot abort pre-flight"
  - "SkippedSystemSchema exported alongside payload schema for plan 32-04's skippedSystems field"
metrics:
  duration: "~2 min"
  completed: "2026-11-08T06:24:03Z"
  tasks: 1
  files: 2
---

# Phase 32 Plan 03: Research Service Pure Half Summary

Zod research payload schemas with web/repo scope tagging, injection-safe shell escaping, resilient JSON parser, and per-system SSH availability pre-flight.

## What Was Built

`src/services/ai/researchService.ts` — the deterministic half of the external research feature:

- **Schemas** — `ResearchFindingSchema` (`claim`, `scope: 'web' | 'repo'`, optional `systemCode`, `source`, `confidence` 0..1 default 1), `ResearchPayloadSchema` (`summary`, `findings`, optional `skippedSystems`, optional `rawOutput`), plus `SkippedSystemSchema`. Types `ResearchFinding`, `ResearchPayload`, `SkippedSystem`, `ResearchAvailability` exported.
- **`escapeShellArg(arg)`** — single-quote wrap with `'\''` escaping. Applies identically to prompt text and `remoteRepoPath` (T-32-03).
- **`parseResearchOutput(raw)`** — tries fenced ```` ```json ```` block, then first balanced `{...}` (string/escape-aware brace matching, so braces inside JSON strings do not terminate early), then raw text. Degrades to `{ summary: raw.slice(0,2000), findings: [], rawOutput: raw }`. Never throws (T-32-05).
- **`checkResearchAvailability(targetSystemIds, db?)`** — resolves `getSystem` → `getSshConfigById` → `testSshConnection`. Missing system or missing `sshConfigId` → `NO_SSH_CONFIG`; connection failure → `UNREACHABLE`; otherwise `available: true`. Per-system try/catch keeps one bad host from aborting the run (SDLC-RES-05).
- **`ResearchRunError`** — `Error` subclass with `readonly code` over `RESEARCH_UNAVAILABLE | RESEARCH_TIMEOUT | RESEARCH_CANCELLED | RESEARCH_SSH_ERROR`, for plan 32-04's runner.

## Verification

- `npx vitest run src/services/ai/__tests__/researchService.test.ts` — 14/14 pass
- `npx tsc --noEmit` — exit 0

## TDD Gate Compliance

- RED: `11007baa test(32-03): add failing tests for research schemas, escaping, and availability` (module did not exist; suite failed to resolve)
- GREEN: `eb8b6196 feat(32-03): add research schemas, shell escaping, parser, availability pre-flight`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed over-strict escaping assertion in test**
- **Found during:** Task 1 GREEN phase
- **Issue:** The assertion `escaped.replace(/'\\''/g, '').not.toContain("'")` failed because the outer wrapping quotes of the single-quoted argument remain after stripping inner escape sequences. The implementation was correct; the test's invariant was wrong.
- **Fix:** Strip the outer quotes first (`escaped.slice(1, -1)`) before asserting no bare quote remains inside.
- **Files modified:** `src/services/ai/__tests__/researchService.test.ts`
- **Commit:** `eb8b6196`

## Known Stubs

None. `checkResearchAvailability` and `parseResearchOutput` are fully wired; no placeholder data paths.

## Threat Flags

None beyond the plan's threat register (T-32-03, T-32-05 mitigated in this plan; T-32-SC accepted — no new npm dependencies).

## Self-Check: PASSED

- FOUND: src/services/ai/researchService.ts
- FOUND: src/services/ai/__tests__/researchService.test.ts
- FOUND: 11007baa (RED gate)
- FOUND: eb8b6196 (GREEN gate)
