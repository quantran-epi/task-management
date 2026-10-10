---
task: fix-restore-backup-test-note-is-pinned
date: 2026-10-10
status: complete
---

# Quick Summary: Fix missing isPinned property in restoreBackup.test.ts

## What Changed
- Added `isPinned: false` to mock note in `tests/services/backup/restoreBackup.test.ts:118`.
- Installed missing root and `knowledge-server` dependencies (`docx`, `exceljs`, `unified`, `remark-parse`, etc.).

## Verification
- `npx vitest run tests/services/backup/restoreBackup.test.ts` passed (4/4 tests).
- `npm run build` passed (`tsc` and Vite client production build succeed).
