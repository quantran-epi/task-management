# Deferred Items — 261125-dqj

- [Out of scope] `tests/services/ai/aiOrchestratorLoop.test.ts`: 5 tests fail at HEAD (pre-existing) because `expect(executeToolFn).toHaveBeenCalledWith(name, args, db, signal)` no longer matches the extra call id argument passed at `aiOrchestratorLoop.ts:538`. Verified by reverting the plan's one-line change and rerunning the file — identical 5 failures. Not caused by this task; no fix applied.
- [Out of scope] `tests/views/TeamWorkspaceView.test.tsx`: 13 tests fail at baseline (verified by reversing all Task 2 changes and rerunning the file — identical 13 failures). The failures cover budget formatting ("750 / 1,000 · 75%" vs "750 / 1k"), missing `team-header-settings`, stale roster/ledger assertions, etc. Not caused by this task; no fix applied.
