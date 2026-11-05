---
phase: 27-studio-artifact-tools-diff-approval
plan: "05"
subsystem: ai
tags: [sdlc, authorization, artifact-tools, zod, dexie, analysis-mode, vitest]
requires:
  - phase: 27-studio-artifact-tools-diff-approval
    plan: "01"
    provides: registered artifact dispatch, request-local context, bounded patch preparation
provides:
  - Shared validateArtifactToolAccess with owning-step and actual workflow prerequisite checks
  - Fail-closed scope revalidation after asynchronous workflow reads and hashing
  - Structured prerequisite and target refusals with supplying-step navigation metadata
  - Studio-only artifact advertisement through explicit normalized allowlists
  - Real-dispatch and real-runtime boundary regression suites with active positive controls
affects: [27-03, 27-04, phase-27-verification]
tech-stack:
  added: []
  patterns:
    - Validate live host snapshots and persisted workflow JSON with the same schema
    - Recheck trusted access after awaits before returning content or proposals
    - Explicit studio allowlist is required for advertising either artifact tool
key-files:
  created:
    - tests/services/ai/sdlcArtifactGuards.test.ts
    - tests/ai/artifactToolAccess.test.ts
  modified:
    - src/services/ai/sdlcArtifactTools.ts
    - src/services/ai/chatTurnTools.ts
    - tests/services/ai/sdlcArtifactTools.test.ts
    - tests/ai/sdlcPromptIsolation.test.ts
key-decisions:
  - "Use ARTIFACT_READ_ONLY and ARTIFACT_REQUIRED as the plan's stable refusal codes; prerequisite failures retain existing workflow guard codes and supplyingStep/stepNumber metadata."
  - "Validate host-supplied workflow states as well as DB states, and reject project identity mismatches without exposing artifact content."
  - "A validated Change Pack must have a valid schema reference and sourceHashes containing the current SOLUTION hash; it need not carry Markdown content."
  - "Without an explicit allowlist, ordinary callers receive neither artifact tool; explicitly allowed get_artifact stays read-only and patch remains filtered in Analysis Mode."
requirements-completed: [SDLC-ART-06, SDLC-ART-01, SDLC-ART-02]
actuals:
  tokens: 10901
  tasks: 2
  commits: 4
plan_head_before: ae8ed8b11336da1fc7fe208930b3a58456ef627e
plan_head_after: b5943361f8789753078dfc30bf66d6162d9651c9
coverage:
  - id: D1
    description: "Historical/preview/inactive scopes refuse both registered tools while active scopes read and propose bounded edits without writes"
    requirement: SDLC-ART-06
    verification:
      - kind: integration
        ref: "tests/services/ai/sdlcArtifactGuards.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Owning steps and real PL01/PL02, SOLUTION/Change Pack, PL03B/PL07 prerequisites are enforced with navigation metadata"
    requirement: SDLC-ART-06
    verification:
      - kind: integration
        ref: "tests/services/ai/sdlcArtifactGuards.test.ts#artifact tool access guards (SDLC-ART-06)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Revocation during workflow/hash awaits, malformed arguments, aliases and forged access flags fail closed"
    requirement: SDLC-ART-06
    verification:
      - kind: integration
        ref: "tests/services/ai/sdlcArtifactGuards.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Ordinary payloads omit artifact tools; explicit studio allowlists permit reads/proposals with Analysis OFF, and unsolicited patches retain Analysis Mode cancellation"
    requirement: SDLC-ART-06
    verification:
      - kind: integration
        ref: "tests/ai/artifactToolAccess.test.ts"
        status: pass
      - kind: unit
        ref: "tests/ai/sdlcPromptIsolation.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "Line caps, drift, deletion, Unicode and no-write behavior remain compatible with the 27-01 service and 27-02 card integration"
    requirement: SDLC-ART-02
    verification:
      - kind: integration
        ref: "tests/services/ai/sdlcArtifactTools.test.ts"
        status: pass
      - kind: integration
        ref: "tests/unit/sdlc/ArtifactPatchApproval.test.tsx"
        status: pass
    human_judgment: false
  - id: D6
    description: "Native Tauri refusal navigation and active approve behavior across historical/completed/archived views"
    verification: []
    human_judgment: true
    rationale: "Native end-of-phase UAT belongs after the remaining host integration plans; this plan modifies services and tests only."
duration: 16min
completed: 2026-11-05
status: complete
---

# Phase 27 Plan 05: Artifact Access and Refusal Boundaries Summary

**Registered artifact tools now validate live scope and owning-step prerequisites before and after asynchronous work; ordinary chat payloads omit them unless a normalized studio allowlist explicitly grants advertisement.**

## Performance

- Started: 2026-11-05T02:39:00Z (recorded execution ledger).
- Completed: 2026-11-05T02:55:04Z.
- Duration: 16 min recorded; initial guard-test authoring preceded the ledger timestamp.
- Tasks: 2/2.
- Source/test files changed: 6 (2 new suites, 4 modified files).
- Dependencies installed: none. No provider calls, PWA/Pages checks, remote execution, or new worktrees.

## Accomplishments

- Added `validateArtifactToolAccess(context, state, kind)` and validated live host snapshots with `SdlcWorkflowStateSchema`, just like stored JSON. A supplied but unavailable host snapshot never falls back to DB.
- Enforced owner map: SOLUTION owns SOLUTION, TECH_DOCS owns PL03B/PL07, CAB owns CAB. SOLUTION requires real PL01 and PL02 content, TECH_DOCS requires SOLUTION and a Change Pack linked to its current hash, CAB requires PL03B/PL07 content.
- Refused read-only, inactive and revoked contexts without returning Markdown/proposals. Rechecked access after awaited workflow reads, after hash work, and before patch diff construction.
- Added `supplyingStep`, `stepNumber`, and `missingArtifact` metadata to actionable prerequisite/target refusals. Read-only copy matches the UI contract.
- `getToolsForTurn` requires an explicit normalized allowlist for either artifact tool. Ordinary query/mutation and dynamic MCP behavior remain unchanged. Analysis Mode continues hiding patch and cancelling unsolicited normalized calls before preparation.
- Exercised real registered dispatch and direct service entry points, delayed reads/hashes, forged flags, supported aliases, malformed arguments, source-chain validation, exact count/cap refusals and writable active controls.

## Task Commits

1. Task 1 RED — `4b041701` `test(27-05): require scoped access and real artifact prerequisites`.
2. Task 1 GREEN — `948b61ee` `feat(27-05): enforce live artifact access and workflow prerequisites`.
3. Task 2 RED — `216c1c2d` `test(27-05): require explicit studio artifact advertisement`.
4. Task 2 GREEN — `b5943361` `feat(27-05): close artifact lifecycle and advertisement boundaries`.

Metadata commit follows this SUMMARY; actuals above measure the four implementation/test commits using the persisted `.git/gsd-plan-head-before-27-05` ledger.

## TDD Gate Compliance

- Runtime applicability query: `query phase.tdd-applicable .planning/phases/27-studio-artifact-tools-diff-approval/27-05-PLAN.md --raw` returned `applicable: true`, `source: task_attribute`, despite global `config_tdd_mode: false`.
- Task 1 RED: JUnit target historical registered dispatch failed on expected `ARTIFACT_READ_ONLY` versus previous `READ_ONLY`; all fixtures executed. Classifier returned `RED_EVIDENCE_OK`, `target_test_failed`. Other failures exposed missing prerequisite and step guards; active positive control passed.
- Task 1 GREEN: 11 guard tests passed; tracer command rerun after commit passed again before expansion.
- Task 2 RED: ordinary no-allowlist advertisement target failed because the real registry still advertised artifact tools. JUnit classifier returned `RED_EVIDENCE_OK`, `target_test_failed`; real-runtime Analysis Mode controls ran without setup failure.
- Task 2 GREEN: service/guard/access suites passed 72/72; final combined targeted run passed 181/181.
- Task 1 production edits began before the RED test commit (evidence had already been validated); the test-only RED commit still precedes the GREEN commit. Recorded here rather than asserting strict edit-time commit ordering.
- No refactor-only commit was needed.

## Verification

All commands ran in `/home/quantd/workspace/personal/new/task-management` with installed dependencies.

```sh
npx vitest run tests/services/ai/sdlcArtifactGuards.test.ts
npx vitest run tests/services/ai/sdlcArtifactGuards.test.ts tests/services/ai/sdlcArtifactTools.test.ts tests/ai/artifactToolAccess.test.ts
npx vitest run tests/services/ai/aiOrchestratorLoop.test.ts tests/ai/chatTurnRuntime.test.ts
```

Final combined command (post-commit):

```sh
npx vitest run tests/services/ai/sdlcArtifactGuards.test.ts tests/services/ai/sdlcArtifactTools.test.ts tests/ai/artifactToolAccess.test.ts tests/services/ai/aiOrchestratorLoop.test.ts tests/ai/chatTurnRuntime.test.ts tests/services/sdlc/markdownSections.test.ts tests/utils/lineDiff.test.ts tests/ai/sdlcPromptIsolation.test.ts tests/ai/ArtifactDiffApprovalCard.test.tsx tests/unit/sdlc/ArtifactPatchApproval.test.tsx
npx tsc --noEmit
```

- Final: **10 files passed, 181 tests passed**, exit 0.
- TypeScript: exit 0.
- Logs: `/tmp/gsd27-05-postcommit.log`, `/tmp/gsd27-05-postcommit-tsc.log`.
- `check evaluation-scope --plan 27-05 --commits-only` resolved all four commits on this branch.
- `git diff --check ae8ed8b1..HEAD` passed; no tracked file deletions or stub markers introduced.

**Full-suite gate remains red.** The user explicitly accepted continuing with known baseline failures and requested targeted checks/typecheck only. No full-suite rerun or green-suite claim. Native visual checks remain end-of-phase UAT, not a completed verification claim.

## Files Created/Modified

- `src/services/ai/sdlcArtifactTools.ts`: shared scope/owner/prerequisite guard, validated live workflow state, post-await checks, stable refusal metadata, stricter kind args and cap-count metadata.
- `src/services/ai/chatTurnTools.ts`: artifact advertisement requires explicit allowlist.
- `tests/services/ai/sdlcArtifactGuards.test.ts`: new 45-case real-dispatch/direct-service guard matrix.
- `tests/ai/artifactToolAccess.test.ts`: new 8-case payload and real runtime/provider-stub boundary suite.
- `tests/services/ai/sdlcArtifactTools.test.ts`: real PL01/PL02 fixtures, current refusal codes, explicit allowlist controls; existing service behavior remains covered.
- `tests/ai/sdlcPromptIsolation.test.ts`: adjusted one legacy no-allowlist expectation to omit studio-only tools while preserving ordinary tools and dynamic MCP assertions.

## Decisions Made

- Kept the plan's canonical `ARTIFACT_READ_ONLY`/`ARTIFACT_REQUIRED` codes rather than preserving the provisional 27-01 names. Existing tests were updated; no host/component files changed.
- A Change Pack reference has no required Markdown body, so validation relies on its schema-valid hash and link to the current SOLUTION hash in `sourceHashes`.
- Host scope keys remain opaque trusted identities. No invented scope-key string format is imposed; real project identity is validated against workflow state and live `getAccess` remains authoritative.
- Missing/null/unsupported argument kinds now produce `INVALID_ARGUMENTS` at the public dispatch boundary, as requested by the plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Regression] Updated legacy no-allowlist registry assertion**
- Found during Task 2 final adjacent checks.
- Issue: Phase 26's test required all registry tools in ordinary two-argument payloads, directly contradicting the new studio-only filter.
- Fix: Exclude only the two artifact tools in that assertion; preserve exact ordinary tools, Analysis Mode, dynamic read-only MCP and per-step policy assertions.
- File: `tests/ai/sdlcPromptIsolation.test.ts` (one file beyond the five planned paths).
- Verification: the test and final 181-test cluster pass.
- Commit: `b5943361`.

**2. [Rule 2 - Correctness] Bring prior service fixtures into the prerequisite contract**
- Found during Task 1 integration verification.
- Issue: 27-01's SOLUTION fixture lacked PL01/PL02; allowing it would bypass the required guard. Its missing-CAB test also used the non-owning SOLUTION step.
- Fix: Seed valid real refs, test missing current SOLUTION separately, adopt canonical plan refusal names. Do not weaken production guards to fit old fixtures.
- File: `tests/services/ai/sdlcArtifactTools.test.ts`.
- Verification: existing service suite and 27-02 real integration both pass.
- Commit: `948b61ee`.

No architecture, DB schema, package, provider, or host interface changes.

## Issues Encountered

- A typed Dexie `get` spy exposes overloaded `PromiseExtended` signatures; the read-only test delay uses an explicit spy-boundary cast. Production API unchanged; TypeScript passes.
- The initial TDD query used the wrong positional argument (`27`) and returned `Plan file not found`; retried with the exact plan path and received the authoritative applicability result.
- ROADMAP's SDK updater has the known `missing_phase_details` limitation in this repository. Close-out must report its actual return; only the existing plan checkbox/progress line may be updated manually. STATE must keep the next unexecuted plan (27-03), not skip it because 27-05 ran early by explicit dispatch.

## Requirement Tracking and Next Plans

- `requirements.ready-ids` returned ready `[SDLC-ART-06]`; SDLC-ART-01/02 remain blocked by unfinished sibling plans. Only ART-06 may be marked complete globally.
- Explicit coordinator dispatch ran 27-05 after 27-02 while 27-03/27-04 remain pending; no execution of those plans occurred.
- 27-03 still owns production host apply/staleness; 27-04 owns artifact intent/prompt advertisement at owning steps. Their payloads must explicitly allow artifact tools.
- UI refusal-at-tool-position and navigation remain 27-02/phase-UAT responsibilities; this plan supplies canonical codes and navigation metadata without editing UI.

## Self-Check: PASSED

- Both created test files exist on disk.
- Four task commits are ancestors of HEAD; evaluation scope resolved them.
- Final targeted verification and TypeScript pass after commits.
- No stub, skipped phase test, or unrelated source edit introduced.
- Existing 1936 dirty entries preserved; index clear after implementation commits.
