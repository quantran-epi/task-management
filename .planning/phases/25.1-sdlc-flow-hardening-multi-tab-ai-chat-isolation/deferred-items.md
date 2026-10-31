# Deferred Items — Phase 25.1

Out-of-scope findings recorded during plan execution. Not fixed here.

## 25.1-13

- **Flaky test:** `tests/ai/AIChatDrawerSdlcRecovery.test.tsx` › "closes the active cycle when CAB generation succeeds" fails intermittently (roughly 1 in 3 runs). Reproduced at the pre-plan baseline `afb8ab5` as well as at `staging` HEAD, so the flake predates plan 13. The test drives the CAB button through the dropzone → confirm-pack → CAB path with several `waitFor` timeouts; likely a timing race in the mocked coordinator handoff. Needs a deterministic synchronization point rather than a longer timeout.

## Plan 25.1-14 (2026-10-31)

- `tests/ai/AIChatDrawerSdlcRecovery.test.tsx` › "closes the active cycle when CAB generation succeeds" (and intermittently "opens a new cycle when the last cycle is completed") fails with `Unable to find role="button" and name "Xác nhận pack"`. Reproduced with `git checkout HEAD -- src/components/ai/AIChatDrawer.tsx`, so it predates plan 25.1-14; each test passes when run alone. Not fixed here (out of scope).
