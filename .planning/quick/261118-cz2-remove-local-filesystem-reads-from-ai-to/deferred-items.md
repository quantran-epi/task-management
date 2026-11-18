# Deferred Items — quick 261118-cz2

## Pre-existing test failures (out of scope)

Verified failing on baseline `HEAD` (before Task 5 working-tree changes) with
`npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts -t 'raises the limit mid-batch'`:

- `Scheduler — raises the limit mid-batch and admits the queued agent without rebuilding (D-04)` — `expected [] to deeply equal ['emp-a-model']` at teamRunCoordinator.test.ts:2985.
- `Scheduler — lowers the limit mid-batch: both keep running and nothing new starts (D-04)` — started-set mismatch at ~:3014.
- `Scheduler — stops a QUEUED agent without invoking its script, and names it incomplete (D-10)` — started-set mismatch at ~:3072.
- `real chat ... R6: a lead parked on a delegatee reports waiting, never lead-thinking` — `expected undefined to be 'running'` at ~:4838.

These are timing-sensitive scheduler tests unrelated to the cz2 changes (local-read removal,
SSH rename, per-team tool flags, payload gating). Not fixed per scope boundary. All other
focused tests for the plan pass; tool-resolution / Oracle advertisement tests specifically
pass after the Task 5 updates.

## Environment limitation

`cargo check --manifest-path src-tauri/Cargo.toml` could not run: the sandbox network proxy
(McAfee Web Gateway) blocked downloading the uncached `bit-vec v0.8.0` crate, and `--offline`
fails because that crate is not in the local cargo cache. Rust edits were limited to deleting
two functions/two registrations (Task 2) and renaming one function/one registration (Task 3);
lexical brace/paren balance was verified against the baseline file.
