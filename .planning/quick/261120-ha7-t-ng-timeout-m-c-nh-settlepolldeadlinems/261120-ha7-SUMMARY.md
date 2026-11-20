---
phase: quick-261120-ha7
plan: '01'
subsystem: ai-office
tags: [settle-poll, deadline, explore-repo, anti-stuck, regression-test]

requires:
  - phase: quick-261117-ss8
    provides: WR-05 anti-stuck settle-poll finalization and abort-source telemetry in teamRunCoordinator
provides:
  - DEFAULT_SETTLE_POLL_DEADLINE_MS = 1_800_000 as the single source of truth for the production settle-poll bound
  - onBatchSettled uses the constant instead of the inline 120_000 literal
  - Millisecond pin test guarding both the value and its source wiring
affects: [AI Office team run settle polling, WR-05 anti-stuck path]

tech-stack:
  added: []
  patterns:
    - exported named constant as single source of truth for a previously inline config literal
    - source-text wiring assertion readFileSync to guard against silent revert to a hardcoded bound
    - explicit short deadline test seam kept so the expiry branch stays covered in milliseconds

key-files:
  created: []
  modified:
    - src/services/ai/office/teamRunCoordinator.ts
    - tests/services/ai/office/teamRunCoordinator.test.ts

key-decisions:
  - "Deadline value lives only in DEFAULT_SETTLE_POLL_DEADLINE_MS; onBatchSettled references it so no second literal can drift"
  - "The deadline-expiry finalization branch is byte-identical — only the bound changed, not the abort/registry/marker/finalize/close consequences"
  - "Test pins value plus source wiring (constant present, old ?? 120_000 absent) so a constant-only edit with unwired code is caught"
  - "Production still omits settlePollDeadlineMs; WR-05 tests keep explicit 50ms so the expiry branch stays fast-covered"

requirements-completed: [SETTLE-DEADLINE-30M, SETTLE-ANTI-STUCK-INTACT]

actuals:
  tokens: 4612
  tasks: 2
  commits: 2
  plan_head_before: 167da8c3504a521000c75a6588b58ff13ebab44f
  plan_head_after: 2082d27c3942f2a41aa1b91d762b6668f6993d55

duration: ~6min
completed: 2026-11-20
status: complete
---

# Quick 261120-ha7: Raise default settle-poll deadline to 30 minutes Summary

**Default settle-poll deadline is now an exported 30-minute constant wired into onBatchSettled; the anti-stuck expiry branch is untouched and a millisecond pin test guards both value and wiring**

## Performance

- Duration: ~6 min
- Tasks: 2 of 2 complete
- Commits: 2
- Files changed: 2

## Accomplishments

1. **30-minute default** — `DEFAULT_SETTLE_POLL_DEADLINE_MS = 1_800_000` added beside `MAX_LIVE_STEPS`; `onBatchSettled` now uses `options.settlePollDeadlineMs ?? DEFAULT_SETTLE_POLL_DEADLINE_MS` instead of the inline `?? 120_000`. JSDoc updated to 30 minutes. The `explore_repo` 20-40 turn case is no longer force-finalized at two minutes.
2. **Anti-stuck mechanism preserved** — the `if (deadlineExpired)` branch (5 abort passes, `assignmentControllers.abort()`, `registry.abort()`, `userStopped.set(..., 'tool-limit')`, `stampAbortSource`, `finalizeAttempt`, batch close) is byte-identical. Only the bound value changed.
3. **Pin test** — new `it('defaults the settle poll deadline to 30 minutes')` imports the constant, asserts `1_800_000`, and reads the source to assert the constant is used and the old `?? 120_000` literal is gone. Runs in milliseconds with no fake timers or real wait.

## Task Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `03640416` | feat(quick-261120-ha7): raise settle-poll deadline default to 30 minutes |
| 2 | `2082d27c` | test(quick-261120-ha7): pin 30-minute settle deadline and source wiring |

## Files Created/Modified

- `src/services/ai/office/teamRunCoordinator.ts` — new exported constant, use-site replacement, JSDoc
- `tests/services/ai/office/teamRunCoordinator.test.ts` — constant import, new pin/wiring test

## Decisions Made

- Single exported constant is the only home for the default; no duplicate literal.
- Expiry consequences unchanged — this is a bound adjustment, not a behavior change to finalization.
- Source-wiring assertion protects against a future edit that fixes the constant value but forgets to wire it.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

- Full-suite run showed one failure in an unrelated telemetry test (`stamps user-abort on abortAll and app-exit on dispose without changing stop reasons`, line 7822): `exitRows.every(row => row.runStatus === 'stopped')` was false. Verified pre-existing: the same test fails identically at base commit `167da8c3` with both files restored, and passes in isolation. The change is a no-op on the dispose path (loop exits on `disposed` before the deadline matters). Not caused by this plan; not fixed (out of scope).
- `npx tsc --noEmit` clean.

## User Setup Required

None.

## Next Phase Readiness

Ready — default deadline raised, anti-stuck path intact, coverage added. No dependency or runtime behavior changes.

## Self-Check: PASSED

- `DEFAULT_SETTLE_POLL_DEADLINE_MS` = 1_800_000 present at `src/services/ai/office/teamRunCoordinator.ts:402`
- Single use-site `?? DEFAULT_SETTLE_POLL_DEADLINE_MS` at line 3615; no `?? 120_000` remains
- New pin test passes in isolation (2.39s); full suite 197 passed, 1 pre-existing flake; `tsc --noEmit` clean
- Both task commits present in git history
