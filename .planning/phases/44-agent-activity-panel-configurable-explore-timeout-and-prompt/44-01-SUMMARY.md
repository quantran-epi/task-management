---
phase: 44-agent-activity-panel-configurable-explore-timeout-and-prompt
plan: 01
subsystem: api
tags: [explore_repo, watchdog, timeout, clamp, team-tools, vitest]

requires:
  - phase: 43-repo-reading-that-scales-grep-paged-read-and-remote-headless
    provides: "explore_repo JS watchdog, stream-cancel/abort/late-cancel design, EXPLORE_DEFAULT_TIMEOUT_MS = 300_000"
provides:
  - "Per-call explore_repo deadline via optional timeoutSeconds (int, clamped 60..900, default 300)"
  - "clampExploreTimeoutSeconds + EXPLORE_MIN/MAX_TIMEOUT_SECONDS exports and optional timeoutMs deps seam"
  - "Derived milliseconds flowing to the single existing watchdog setTimeout; portable cancel contract unchanged"
  - "Focused tests for clamp boundaries, advertised schema (range/default), derived-ms wiring, and cancel/cleanup regression guards"
affects:
  - "44-02 / 44-03 (Agent Activity Panel needs the explore_repo deadline contract for its progress card)"
  - "Phase 43 explore_repo contract (watchdog is now call-configurable; default behavior byte-identical)"

actuals:
  tokens: 4031
  tasks: 3
  commits: 3
  plan_head_before: 57b69490078871edeae772b27c47f1c1fc365c7e
  plan_head_after: 70ff16989756f31fdee76af023f5868f23c4d3ec

tech-stack:
  added: []
  patterns:
    - "Optional numeric deps seam (timeoutMs?) with `?? DEFAULT` fallback so existing callers keep the default contract under exactOptionalPropertyTypes"
    - "Conditional signal spread `{ timeoutMs, ...(signal ? { signal } : {}) }` to avoid setting an undefined optional property"
    - "Untrusted model input clamped (floor then clamp) at the trust boundary; invalid/non-finite falls back rather than refusing the call"

key-files:
  created: []
  modified:
    - "src/services/remoteExploreService.ts"
    - "src/services/ai/office/teamTools.ts"
    - "tests/services/remoteExploreService.test.ts"
    - "tests/services/ai/office/teamTools.test.ts"
    - "tests/services/ai/office/teamToolsGitRead.test.ts"

key-decisions:
  - "timeoutSeconds is a tuning knob, not a security boundary: out-of-range numeric values clamp to 60/900 and only invalid/non-finite/unparseable values fall back to 300 (D-01)"
  - "The knob lives in RunRemoteExploreDeps (beside signal) and drives the single existing JS watchdog; no remote timeout(1) command, and cancel/abort/late-cancel/4x-buffer/12k-cap stay byte-identical (D-02)"
  - "timeoutMs is optional on the deps type so existing {stream}/{signal} callers still typecheck; the exploreRepo handler always supplies it"
  - "The tool definition advertises timeoutSeconds with range 60..900 and default 300 while required stays ['question'] — no new tool, count remains 12 (D-03)"

patterns-established:
  - "Clamp helper mirrors clampExploreMaxTurns: Math.floor(Number(value)), non-finite -> default, else min/max clamp"
  - "runRemoteExplore deps argument uses conditional spread for every optional property under exactOptionalPropertyTypes"

requirements-completed: [TO-01]

coverage:
  - id: D1
    description: "explore_repo accepts optional timeoutSeconds; clamping at 60/900 boundaries and 300 default/invalid fallback with fractional floor"
    requirement: TO-01
    verification:
      - kind: unit
        ref: "tests/services/remoteExploreService.test.ts#clampExploreTimeoutSeconds (44-01 D-01)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Tool definition advertises timeoutSeconds (number, 60..900, default 300) without changing the 12-tool count"
    requirement: TO-01
    verification:
      - kind: unit
        ref: "tests/services/ai/office/teamTools.test.ts#advertises timeoutSeconds on explore_repo with its range and default"
        status: pass
    human_judgment: false
  - id: D3
    description: "Derived timeoutMs reaches the single watchdog and ends the run at that deadline with detail 'timeout' and a cancel call"
    requirement: TO-01
    verification:
      - kind: unit
        ref: "tests/services/remoteExploreService.test.ts#uses the deps timeoutMs deadline to cancel and report timeout at that instant"
        status: pass
    human_judgment: false
  - id: D4
    description: "Wiring pinned for default 300000 / upper 900000 / invalid-0 60000, and custom deadline keeps cancel + early-exit timer cleanup"
    requirement: TO-01
    verification:
      - kind: unit
        ref: "tests/services/ai/office/teamToolsGitRead.test.ts#explore_repo passes the derived timeoutMs for default, upper-bound and invalid inputs"
        status: pass
      - kind: unit
        ref: "tests/services/remoteExploreService.test.ts#a custom timeoutMs still cancels the remote and keeps the bounded timeout report"
        status: pass
    human_judgment: false

duration: 5min
completed: 2026-11-17
status: complete
---

# Phase 44 Plan 01: Configurable Explore Timeout Summary

**explore_repo now takes a clamped per-call timeoutSeconds (60..900s, default 300) that reaches the existing JS watchdog as derived milliseconds, with the portable cancel/abort contract left untouched**

## Performance

- **Duration:** 5 min
- **Started:** 2026-11-17T05:26:22Z
- **Completed:** 2026-11-17T05:31:42Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Added `clampExploreTimeoutSeconds` plus `EXPLORE_MIN_TIMEOUT_SECONDS` (60) / `EXPLORE_MAX_TIMEOUT_SECONDS` (900); `EXPLORE_DEFAULT_TIMEOUT_MS = 300_000` stays exported and unchanged.
- Extended `RunRemoteExploreDeps` with an optional `timeoutMs` seam; the single watchdog `setTimeout` now reads the derived `timeoutMs` and nothing else in the timer/cancel/abort/buffer/cap path changed.
- Wired the `exploreRepo` handler to compute `clampExploreTimeoutSeconds(args.timeoutSeconds) * 1000` and pass it with a conditional signal spread; no new tool and no remote `timeout(1)` command.
- Advertised `timeoutSeconds` on the `explore_repo` definition (range 60..900, default 300) while `required` stays `['question']` and the tool count stays 12.
- Proved the contract with focused tests: clamp boundaries/default/fractional, schema advertisement, derived-ms wiring for default/upper/invalid inputs, and cancel/cleanup regression guards.

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire timeoutSeconds end-to-end from tool args to the watchdog** - `7f0009f0` (feat, tracer)
2. **Task 2: Clamp boundaries and the advertised tool contract** - `269aaff1` (feat)
3. **Task 3: Lock the wiring and guard the unchanged cancel contract** - `70ff1698` (test)

**Plan metadata:** pending (docs commit by orchestrator)

## Files Created/Modified

- `src/services/remoteExploreService.ts` - new clamp helper and 60/900 bounds; optional `timeoutMs` deps field consumed by the single watchdog `setTimeout`.
- `src/services/ai/office/teamTools.ts` - `timeoutSeconds` tool-definition property + description range/default; handler derives and passes `timeoutMs`.
- `tests/services/remoteExploreService.test.ts` - clamp-boundary unit cases, fake-timer derived-deadline case, custom-deadline cancel and early-exit cleanup guards.
- `tests/services/ai/office/teamTools.test.ts` - schema-property case (tool count assertion unchanged at 12).
- `tests/services/ai/office/teamToolsGitRead.test.ts` - behavior-preserving `runRemoteExplore` spy and derived-ms wiring cases (300000/900000/60000).

## Decisions Made

- Invalid and out-of-range numeric input follows D-01: numeric values clamp to the nearest boundary (0 -> 60, 901 -> 900), while only non-finite/unparseable/absent input falls back to 300. Task 3 explicitly pins 0 -> 60000ms, not the default.
- `timeoutMs` is optional on `RunRemoteExploreDeps` so the existing `runRemoteExplore(..., { stream })` / `{ signal }` callers (and tsc, which includes `tests`) keep compiling; the exploreRepo handler is the only caller that always supplies it.
- The `runRemoteExplore` mock in `teamToolsGitRead.test.ts` wraps the real implementation (`vi.fn(actual.runRemoteExplore)`) so the watchdog still runs in every existing explore_repo case; only call history is cleared per test.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Typecheck and all three focused suites passed on the first run of each task.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The timeout contract is complete and locked; the remaining phase-44 plans can build the Agent Activity Panel's `explore_repo` progress/deadline card against a stable `timeoutSeconds` (60..900, default 300) contract.
- No blockers. Note: this plan touched only the explore-timeout half of phase 44; the panel, prompt-log migration, and phase-wide code/UI review remain in later plans.

---
*Phase: 44-agent-activity-panel-configurable-explore-timeout-and-prompt*
*Completed: 2026-11-17*

## Self-Check: PASSED

- All 5 modified source/test files and the SUMMARY.md exist on disk.
- All 3 task commits (7f0009f0, 269aaff1, 70ff1698) are ancestors of HEAD.
- `npx tsc --noEmit -p tsconfig.json` exits 0; the three focused suites pass (154 tests).
