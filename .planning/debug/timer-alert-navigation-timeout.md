---
status: resolved
trigger: "Fix GitHub Actions timeout in tests/views/TimerAlertNavigation.test.tsx. First test exceeds Vitest default 5000ms because it intentionally waits 3500ms after render/navigation. I already added explicit 15000ms timeout to first test; inspect root cause, check similar tests, apply minimum complete fix, and verify targeted test."
created: 2026-10-01
updated: 2026-10-01
---

# Debug Session: Timer Alert Navigation Timeout

## Symptoms

- expected: `TimerAlertNavigation.test.tsx` passes reliably in GitHub Actions.
- actual: First navigation alert test times out at Vitest's default 5000 ms.
- errors: `Error: Test timed out in 5000ms.` at line 39.
- timeline: Current GitHub Actions build; local prior behavior not supplied.
- reproduction: Run `tests/views/TimerAlertNavigation.test.tsx` in CI or under comparable load.

## Current Focus

- hypothesis: Confirmed. Fixed-duration sleeps race asynchronous app and Dexie initialization and consume most of Vitest's default timeout.
- test: Replace fixed sleeps with condition-based `waitFor` assertions and run targeted file twice.
- expecting: All three tests pass repeatedly within explicit 15-second ceilings.
- next_action: None; session resolved.
- reasoning_checkpoint:
- tdd_checkpoint:

## Evidence

- timestamp: 2026-10-01
  observation: First test intentionally waits 3500 ms and has no explicit timeout; third test has a 15000 ms timeout.
  implication: Default 5000 ms budget leaves too little time for setup/render/navigation on GitHub runner.

## Eliminated

## Resolution

- root_cause: Each alert test used a fixed 3500 ms sleep while app rendering, navigation, Dexie live queries, and timer monitor initialization were still asynchronous. Under CI load, first test exceeded Vitest's 5000 ms default; locally, increasing only test timeout exposed assertion race because monitor had not fired when sleep ended.
- fix: Replaced fixed sleeps with condition-based `waitFor` assertions capped at 10000 ms, gave all three integration tests explicit 15000 ms ceilings, and removed unused `act` import and debug logging.
- verification: `npm test -- --run tests/views/TimerAlertNavigation.test.tsx` passed twice consecutively; 3 tests passed each run.
- files_changed: `tests/views/TimerAlertNavigation.test.tsx`, `.planning/debug/timer-alert-navigation-timeout.md`
