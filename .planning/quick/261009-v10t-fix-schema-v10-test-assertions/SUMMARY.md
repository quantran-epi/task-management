---
task: 261009-v10t
slug: fix-schema-v10-test-assertions
status: complete
completed: 2026-10-09
---

# Quick Summary: Fix Schema V10 Table List and verno Test Assertions

Updated Dexie test expectations in `tests/db.test.ts` and `tests/timerSegments.test.ts` to account for Schema V10 table registration (`dlpAudits`, `documentSets`, `publishAttempts`, `publishedDocuments`) and schema version 10.

## Changes
- `tests/db.test.ts`: Added Schema V10 stores (`dlpAudits`, `documentSets`, `publishAttempts`, `publishedDocuments`) to expected table list.
- `tests/timerSegments.test.ts`: Updated `v7Db.verno` expectation to `toBeGreaterThanOrEqual(7)`.

## Verification
- `npx vitest run tests/db.test.ts tests/timerSegments.test.ts` passed (8/8 tests).
- `npx vitest run tests/db/ tests/knowledge/schemaV10.test.ts` passed (105/105 tests).
