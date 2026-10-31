# Deferred Items — Phase 25.1

Out-of-scope findings recorded during plan execution. Not fixed here.

## 25.1-13

- **Flaky test:** `tests/ai/AIChatDrawerSdlcRecovery.test.tsx` › "closes the active cycle when CAB generation succeeds" fails intermittently (roughly 1 in 3 runs). Reproduced at the pre-plan baseline `afb8ab5` as well as at `staging` HEAD, so the flake predates plan 13. The test drives the CAB button through the dropzone → confirm-pack → CAB path with several `waitFor` timeouts; likely a timing race in the mocked coordinator handoff. Needs a deterministic synchronization point rather than a longer timeout.
