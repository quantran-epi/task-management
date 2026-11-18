---
phase: 26-sdlc-prompt-grounding-tool-use-policy
plan: "02"
subsystem: ai
tags: [sdlc, tool-policy, mcp, react, typescript, vitest]
requires:
  - phase: "26-01"
    provides: Production per-step grounding and existing workspace forwarding
provides:
  - Six explicit static read-tool allowlists and dynamic-name-aware tool policy
  - Twelve step-specific tool-backed and narrower-query abstention exemplars
  - Atomic discovery snapshot carrying tools and exact dynamic read-only policy names
  - Utility and real-host policy/payload parity regression coverage
affects: [26-03, 26-04, 27, 33]
tech-stack:
  added: []
  patterns: [explicit capability allowlist, per-turn discovery snapshot, fixed prompt layering]
key-files:
  created:
    - tests/unit/sdlc/StepChatPanelToolPolicy.test.tsx
  modified:
    - src/services/ai/sdlcPromptComposer.ts
    - src/services/ai/chatTurnTools.ts
    - src/components/sdlc/chat/useStepChatToolbox.ts
    - src/components/sdlc/chat/StepChatPanel.tsx
    - tests/ai/sdlcPromptComposer.test.ts
    - tests/ai/sdlcPromptIsolation.test.ts
    - tests/unit/sdlc/StepChatPanelArtifactQueue.test.tsx
    - tests/unit/sdlc/StepChatPanelArtifactBudget.test.tsx
key-decisions:
  - Return tools and dynamicReadOnlyToolNames together from toolsForTurn, avoiding stale asynchronous React state.
  - Explicit allowlists restrict dynamic tools to read-only capabilities even with Analysis Mode off; omitted allowlist preserves legacy behavior.
  - Host parity tests wrap the real toolbox hook and mock discovery, proving actual filtering rather than a fabricated filtered result.
patterns-established:
  - Policy and payload consume one discovery snapshot and explicit static-plus-dynamic set.
  - Dynamic capability names are normalized, deduplicated, and restricted to safe identifier characters before entering policy text.
requirements-completed: [SDLC-PR-02, SDLC-PR-04, SDLC-PR-05]
duration: 45min
completed: 2026-11-03
---

# Phase 26 Plan 02: Per-Step Tool Policy and Payload Alignment Summary

**Six SDLC steps now emit explicit read-only tool policy, tool-backed answers and narrower-query abstention examples, with dynamic MCP policy names matched to each turn's actual filtered payload.**

## Performance

- **Started:** 2026-11-03T06:30:12Z
- **Completed:** 2026-11-03T07:15:23Z
- **Duration:** Approximately 45 minutes, including dependency restoration and broad-suite sweep.
- **Tasks:** 2/2
- **Source/test files:** 9

## Accomplishments

- Added `SDLC_READ_TOOL_NAMES`, six explicit `SDLC_STEP_ALLOWED_TOOLS` entries, `SDLC_STEP_TOOL_POLICY`, normalized dynamic capability names, and `buildToolPolicy`.
- Preserved fixed policy → step contract → tool policy → few-shot → grounding → output contract → language ordering. Existing artifact contracts and shared safety policy remain unchanged.
- Added two Vietnamese exemplars per step: tool call/results before evidence-backed response, and narrower re-query followed by explicit missing-evidence abstention.
- Added optional `allowedToolNames` at existing tool-payload filter. Unlisted dynamic names and non-read-only dynamic tools are excluded; legacy two-argument behavior is covered unchanged.
- Step toolbox discovers once per turn and returns `{ tools, dynamicReadOnlyToolNames }`. Host forwards those names to composer and those exact tools to runtime.
- Added integration coverage across all six real host paths, discovery failure, malformed names, and existing artifact queue/completion regressions.

## Task Commits

1. **Task 1: Add static-plus-dynamic tool policy and exemplars to composer** — `cc875049` (`feat`).
2. **Task 2: Filter and forward same static-plus-dynamic allowlist to payload** — `c8c06971` (`feat`).

## Verification

- `node node_modules/vitest/vitest.mjs run tests/ai/sdlcPromptComposer.test.ts` — **PASS: 22 tests**.
- `node node_modules/vitest/vitest.mjs run tests/ai/sdlcPromptIsolation.test.ts tests/ai/sdlcPromptComposer.test.ts tests/unit/sdlc/StepChatPanelToolPolicy.test.tsx tests/unit/sdlc/StepChatPanelArtifactQueue.test.tsx tests/unit/sdlc/StepChatPanelArtifactBudget.test.tsx` — **PASS: 5 files, 53 tests**.
- `node node_modules/typescript/bin/tsc --noEmit` — **PASS**, exit 0, no diagnostics.
- `git diff --check` — **PASS**.
- Full `node node_modules/vitest/vitest.mjs run` — **NOT GREEN / incomplete**. Unchanged drawer suites reported failures; broad sweep exceeded 10-minute budget and its own process tree was stopped. No complete suite totals claimed. See Deferred Issues.
- Tool policy/payload set equality is tested for every step; omitted allowlist behavior and dynamic mutation exclusion are covered in both analysis settings.
- STATE.md and ROADMAP.md verified unchanged against `ccbc89f6`; orchestrator owns shared progress updates in worktree mode. REQUIREMENTS.md marks SDLC-PR-02/04/05 complete.

## Files Created/Modified

- `src/services/ai/sdlcPromptComposer.ts` — explicit policy maps, safe dynamic-name normalization, tool-policy layer, twelve step exemplars.
- `src/services/ai/chatTurnTools.ts` — optional explicit allowlist and read-only dynamic filter.
- `src/components/sdlc/chat/useStepChatToolbox.ts` — step-aware discovery/filtering and atomic policy/payload return.
- `src/components/sdlc/chat/StepChatPanel.tsx` — step argument and exact dynamic-name handoff only; artifact-intent changes remain 26-03.
- `tests/ai/sdlcPromptComposer.test.ts` — static/dynamic policy, safe names, exemplar behaviors, ordering.
- `tests/ai/sdlcPromptIsolation.test.ts` — explicit filters, legacy behavior, six-step policy/payload equality.
- `tests/unit/sdlc/StepChatPanelToolPolicy.test.tsx` — real toolbox/host integration with mocked runtime/discovery.
- `tests/unit/sdlc/StepChatPanelArtifactQueue.test.tsx` and `StepChatPanelArtifactBudget.test.tsx` — update toolbox mock return shape, preserve all prior assertions.

## Decisions Made

- Per-turn tools/names return together; asynchronous discovery never relies on a state update reaching an older submit closure.
- Dynamic names only originate from discovered read-only catalog; invalid identifier text cannot become policy instructions.
- Host integration wraps real hook rather than mocking a hand-filtered payload, strengthening planned parity proof.
- No package additions, endpoint, persistence schema, or second AI engine.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree started from stale unrelated baseline**
- **Found during:** Setup.
- **Issue:** Agent branch initially pointed at `9c89bda1`; Phase 26 plan files absent.
- **Fix:** Aligned clean owned `worktree-agent-aa0f922a40e71cf2e` branch with requested synchronized staging baseline `ccbc89f6`; no protected refs modified.
- **Verification:** Init found completed 26-01 and requested 26-02 plan.

**2. [Rule 3 - Blocking] Missing installed test dependencies**
- **Found during:** Task 1 verification.
- **Issue:** Shared node_modules lacked declared `@vitejs/plugin-react` and Testing Library packages.
- **Fix:** Removed temporary dependency junction; restored this worktree's exact lockfile with `npm ci --offline --ignore-scripts` from existing npm cache. No new package or lockfile change.
- **Verification:** Composer suite and final focused suites passed; TypeScript passed.
- **Environment note:** Installed Node is v20.19.5 and emits dependency engine warnings; recommended Node 24 unavailable. Direct local runner entrypoints worked; `npx` invocation stalled and was replaced with equivalent direct entrypoint.

**3. [Rule 3 - Blocking] Existing toolbox mocks needed atomic snapshot shape**
- **Found during:** Task 2.
- **Fix:** Updated two existing artifact test mocks for `{ tools, dynamicReadOnlyToolNames }` without removing assertions.
- **Verification:** Both artifact suites included in 53 passing tests.
- **Commit:** `c8c06971`.

**4. [Rule 2 - Missing Critical] Reject instruction-shaped dynamic names**
- **Found during:** Task 1 security implementation.
- **Issue:** Trimming alone would allow catalog names with newline/instruction text into system policy.
- **Fix:** Require normalized identifier-only names and deduplicate before policy/payload allowlist construction.
- **Verification:** Composer malformed-name test and real-host malformed-catalog test pass.
- **Commits:** `cc875049`, `c8c06971`.

## Deferred Issues

Broad sweep observed failures in unchanged `tests/ai/AIChatDrawer.test.tsx` (15), `tests/ai/AIChatWidgetParity.test.tsx` (1), and `tests/ai/AIChatDrawerSdlcRecovery.test.tsx` (2). Output also showed other drawer wiring failures during the run. These surfaces were not modified; legacy two-argument filter behavior is explicitly verified unchanged. Baseline reproduction was not run, so pre-existing status is not asserted. Investigate separately under supported Node 24; full-suite acceptance remains outstanding. Log: `C:/Users/quantd/AppData/Local/Temp/26-02-full-suite.log`.

## Issues Encountered

- GSD CLI absent from PATH and installed version exposes legacy commands rather than `query` namespace; used `node C:/Users/quantd/.claude/gsd-core/bin/gsd-tools.cjs` equivalents.
- Context7 CLI absent; lookup availability checked, no package auto-downloaded. No external version-specific API changes required; repository patterns retained.
- Broad tests emitted existing Ant Design deprecations, jsdom pseudo-element warnings, and React act warnings. No unrelated fixes attempted.

## Known Stubs

None introduced. Empty dynamic list on discovery failure is intentional fail-closed behavior. Existing SOLUTION artifact hardcoding remains deliberately owned by plan 26-03, not this plan's tool-policy work.

## Security Review

T-26-02/02b/02c/02d/02e mitigations covered by explicit allowlist, shared snapshot, read-only metadata check, policy-first ordering, safe normalized capability names, and forbidden-claim exemplar tests. No new network endpoint, auth path, filesystem access, schema boundary, or secret handling introduced.

## User Setup Required

None.

## Next Phase Readiness

26-03 must preserve `useStepChatToolbox(db, stepId)` and destructure `{ tools, dynamicReadOnlyToolNames }` from `toolsForTurn()` while adding explicit artifact intents. 26-04 can reuse unchanged runtime engine. Orchestrator owns shared STATE/ROADMAP sync after merge; full-suite failures need separate triage.

## Self-Check: PASSED

- All nine source/test files exist.
- Task commits `cc875049` and `c8c06971` verified with `git cat-file -e`.
- Focused verification: 53 passing tests, strict TypeScript clean.
- STATE.md/ROADMAP.md unchanged against requested baseline.
- Broad suite failure is disclosed; no full-suite success claimed.
