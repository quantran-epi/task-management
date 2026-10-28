---
phase: 25-interactive-sdlc-document-wizards
plan: 07
subsystem: ai
tags: [wizard, zod, grounded-retrieval, structured-output, sdlc]

requires:
  - phase: 25-interactive-sdlc-document-wizards
    provides: "Wizard identity/lifecycle contracts and F01-F16 validation fixtures from Plans 25-03 and 25-04"
provides:
  - "Scoped local/optional-remote evidence collection with explicit degraded coverage"
  - "Strict bounded grounded gap detection with frozen inputs, repairs, currentness, and citation closure"
  - "Validated proposal-only SOLUTION, PL03B, PL07, and CAB stage dispatch"
affects: [25-11, 25-12, 25-13, 25-17, interactive-sdlc-document-wizards]

tech-stack:
  added: []
  patterns:
    - "Stable source-as-untrusted-data system prefix with zero model tools"
    - "Strict local Zod validation regardless of route structured-output capability"
    - "One initial attempt plus two issue-only repairs inside shared stage deadline"
    - "Exact project/thread/revision pins before and after model calls"

key-files:
  created:
    - "src/services/ai/wizardPrompts.ts"
    - "src/services/ai/wizardService.ts"
  modified:
    - "tests/ai/wizardService.test.ts"

key-decisions:
  - "Direct staged JSON calls expose an empty tool set; application code remains sole lifecycle, approval, persistence, and export authority."
  - "Empty resolved set scope returns EMPTY_SCOPE without remote, MCP, local, or global search."
  - "Network/unavailable optional retrieval degrades visibly to scoped local evidence, while auth remains explicit instead of silently falling back."
  - "PL07 schemas accept marks and section VI only; any I-V replacement key fails strict validation."
  - "CAB validates exactly approved same-project, same-thread PL02/PL03B/PL07 source revisions both before and after synthesis."

patterns-established:
  - "Wizard model output is always an untrusted proposal validated by stage-specific strict schemas and evidence-ID membership."
  - "Large proposal stages use maxTokens 8000; gap detection uses maxTokens 2500; all stages share three-attempt and currentness guards."

requirements-completed: [WIZ-INTERACTIVE-01, WIZ-FLOW-01]

duration: 21min
completed: 2026-10-28
---

# Phase 25 Plan 07: Staged Grounded AI Wizard Workflow Summary

**Scoped evidence retrieval, gap-only clarification, and strict revision-pinned SDLC proposals now run as bounded non-mutating stages.**

## Performance

- **Duration:** 21 min
- **Started:** 2026-10-28T15:21:42Z
- **Completed:** 2026-10-28T15:42:17Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added stable `wizard-v1` prompts treating Docs, diffs, graph, and MCP output as untrusted data with no tool, mutation, publication, approval, persistence, or export authority.
- Added exact-scope evidence collection that never widens empty set scope, preserves local ranges and content hashes, and exposes optional remote/MCP degradation.
- Added bounded stage execution: strict local Zod validation, optional strict `json_schema`, maximum three attempts, issue-only repair prompts, 90/45-second per-call ceilings, shared 180-second deadline, and post-await stale/cancel checks.
- Added focused gap detection that removes known/skipped fields from questions, retains skipped fields as unknowns, and rejects unknown citation IDs or unknown output keys.
- Added strict SOLUTION, PL03, PL07, and CAB proposal contracts with current-system surfaces, four reconciliation sections, regression coverage, immutable PL07 I-V boundary, and exact same-thread CAB revisions.
- Kept all stage results proposal-only: no Note write, download, publication, approval, or network export side effect.

## Task Commits

Each TDD task was committed as RED then GREEN:

1. **Task 1 RED: Collect frozen scoped evidence and detect grounded gaps** - `9478b4c` (`test`)
2. **Task 1 GREEN: Collect frozen scoped evidence and detect grounded gaps** - `e37e25b` (`feat`)
3. **Task 2 RED: Generate validated PL/SOLUTION/reconciliation/CAB proposals** - `31c1507` (`test`)
4. **Task 2 GREEN: Generate validated PL/SOLUTION/reconciliation/CAB proposals** - `2b64b13` (`feat`)

## Files Created/Modified

- `src/services/ai/wizardPrompts.ts` - Stable prompt prefix, gap/proposal schemas, JSON schemas, and issue-only repair prompts.
- `src/services/ai/wizardService.ts` - Evidence collector, bounded validator, gap detector, stage dispatcher, identity/revision gates, and error taxonomy.
- `tests/ai/wizardService.test.ts` - F01/F02/F03/F04/F05/F06/F08/F09/F11/F12/F13/F14 behavior and security coverage.

## Decisions Made

- Reused existing `completeJson`, capability probe, local BM25, grounded dependencies, Zod, and structured logger; no package or framework added.
- Direct calls remain tool-free because existing generic orchestrator lacks stage output-token ceilings and defaults to broad tool loops.
- Repair prompts contain validation issue paths/codes only; source/evidence stays frozen outside repair messages.
- Diagnostics log stage/outcome/attempt/tool/issue counts only; no content, path, title, query, URL, response, or stack.
- Mermaid stays downstream derived presentation from validated `flowSteps[]`; model cannot return executable Mermaid or generated scripts.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Enforced citation membership inside generic stage validation**
- **Found during:** Task 1 verification
- **Issue:** Strict schema could accept a syntactically valid object containing an unknown citation ID.
- **Fix:** Recursively collect `citationIds`, compare against frozen evidence IDs, and route violations through bounded validation repairs.
- **Files modified:** `src/services/ai/wizardService.ts`
- **Verification:** F12 rejects unknown citations after exactly three attempts.
- **Committed in:** `e37e25b`

**2. [Rule 2 - Missing Critical] Added exact CAB source validation before and after synthesis**
- **Found during:** Task 2 implementation
- **Issue:** Schema validation alone cannot prove source artifacts belong to current project/thread or remain current after await.
- **Fix:** Require exactly PL02, PL03B, and PL07 approved pins; validate project, thread, hash, version, and expected revision before model call and again after await.
- **Files modified:** `src/services/ai/wizardService.ts`
- **Verification:** F09 mixed revision rejects before transport invocation.
- **Committed in:** `2b64b13`

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical security/correctness guard).
**Impact on plan:** Required fail-closed behavior; no scope expansion or new dependency.

## Issues Encountered

- Isolated worktree began before Phase 25 plan/prerequisite commits. Fast-forwarded worktree branch to current `master` (`9fc8c99`) before edits; no conflict or unrelated file change.
- Plan referenced `src/services/wizard/reconciliation.ts`, but file does not yet exist in prerequisite history. Task 2 used pinned reconciliation payload contracts locally without creating a new service layer.

## Verification

```text
npm test -- tests/ai/wizardService.test.ts tests/ai/wizardState.test.ts
2 test files passed, 19 tests passed

npx tsc --noEmit --pretty false
passed
```

No live provider or paid network call used.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None in production files created or modified by this plan. No TODO/FIXME, empty UI data source, or placeholder behavior remains.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: model-provider-boundary | `src/services/ai/wizardService.ts` | New bounded structured model-call path receives untrusted source data and returns proposal-only JSON; mitigated by zero tools, strict schemas, evidence closure, and stale guards. |

## Next Phase Readiness

- Wizard UI plans can call `collectWizardEvidence`, `detectWizardGaps`, and `runWizardStage` without granting AI persistence/export authority.
- Export builders can consume validated structured flows and proposal payloads after explicit downstream review/approval.
- No STATE.md or ROADMAP.md modification made, per executor instruction.

## Self-Check: PASSED

- Created files exist: `src/services/ai/wizardPrompts.ts`, `src/services/ai/wizardService.ts`.
- Modified test exists and targeted suites pass.
- Task commits exist: `9478b4c`, `e37e25b`, `31c1507`, `2b64b13`.
- No tracked deletion, package change, STATE.md change, or ROADMAP.md change introduced by Plan 25-07.

---
*Phase: 25-interactive-sdlc-document-wizards*
*Plan: 07*
*Completed: 2026-10-28*
