---
task: 261009-v10t
slug: fix-schema-v10-test-assertions
status: in-progress
created: 2026-10-09
---

# Quick Plan: Fix Schema V10 Table List and verno Test Assertions

Fix Dexie Schema V10 test expectations in `tests/db.test.ts` and `tests/timerSegments.test.ts` caused by addition of Schema V10 knowledge tables (`dlpAudits`, `documentSets`, `publishAttempts`, `publishedDocuments`) and version bump to 10.

## Tasks

- [ ] Task 1: Update `tests/db.test.ts` core table list expectation to include Schema V10 tables
- [ ] Task 2: Update `tests/timerSegments.test.ts` verno expectation to `toBeGreaterThanOrEqual(7)` (or 10)
- [ ] Task 3: Verify tests pass with vitest
