# Deferred Items — Phase 25.1

Out-of-scope findings recorded during plan execution. Not fixed here.

## 25.1-13

- **Flaky test:** `tests/ai/AIChatDrawerSdlcRecovery.test.tsx` › "closes the active cycle when CAB generation succeeds" fails intermittently (roughly 1 in 3 runs). Reproduced at the pre-plan baseline `afb8ab5` as well as at `staging` HEAD, so the flake predates plan 13. The test drives the CAB button through the dropzone → confirm-pack → CAB path with several `waitFor` timeouts; likely a timing race in the mocked coordinator handoff. Needs a deterministic synchronization point rather than a longer timeout.

## Plan 25.1-14 (2026-10-31)

- `tests/ai/AIChatDrawerSdlcRecovery.test.tsx` › "closes the active cycle when CAB generation succeeds" (and intermittently "opens a new cycle when the last cycle is completed") fails with `Unable to find role="button" and name "Xác nhận pack"`. Reproduced with `git checkout HEAD -- src/components/ai/AIChatDrawer.tsx`, so it predates plan 25.1-14; each test passes when run alone. Not fixed here (out of scope).

## Plan 25.1-15 (2026-10-31)

- **UX (belongs to G1 review):** the revision confirm button (`Xác nhận cập nhật`) sat under the AI drawer's zIndex 1200 layer, so a real pointer click was intercepted by the drawer subtree. **Fixed after the round-4 review in `54f0650`:** `RevisionImpactModal` now sets `zIndex={1300}`. G1 should re-check keyboard reachability and the focus ring only.
- **Fixed, no longer deferred:** the `D-16..D-19` 320px horizontal-scroll assertion was order-dependent (sampled scroll metrics before the drawer reflowed). The spec now polls until the layout settles; 4/4 green on repeat.
- `tests/ai/AIChatDrawerSdlcRecovery.test.tsx` CAB-cycle flake did not reproduce during plan 25.1-15 (16/16 in three full-suite runs). Entry kept above. Re-characterised after the round-4 review: when the file runs alongside `AIChatDrawerGroundedWiring` and `AIChatDrawerSdlcIntake`, 2–3 tests can fail; identical failures reproduce at `79b3ba6`, so it is pre-existing ordering sensitivity, not a round-4 regression. Each test passes alone and the file is green 16/16 on repeated solo runs.
