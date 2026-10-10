---
task: fix-restore-backup-test-note-is-pinned
date: 2026-10-10
status: in-progress
---

# Quick Plan: Fix missing isPinned property in restoreBackup.test.ts

## Problem
In `tests/services/backup/restoreBackup.test.ts`, `testDb.notes.add` calls note object literal missing required `isPinned: boolean` field, causing `tsc` error TS2741 during `npm run build`.

## Plan
1. Add `isPinned: false` to note in `tests/services/backup/restoreBackup.test.ts`.
2. Verify `npm run test tests/services/backup/restoreBackup.test.ts`.
3. Verify `npm run build`.
