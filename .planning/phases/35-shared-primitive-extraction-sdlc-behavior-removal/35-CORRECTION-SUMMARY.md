---
phase: 35
plan: correction
status: complete
scope: "CR-01 + WR-04 data fixes only"
base_commit: 0238a50c6246977679c8c6cccb16a8a9042589b6
commits:
  - 27e3bade
  - 425445e1
---

# Phase 35 Correction Summary

Narrow corrective work for the two source-confirmed data defects in
`35-REVIEW-DISPOSITION.md`. No audit, no UI copy, no security sweep, no
dependency changes, no push.

## Fix 1 — CR-01: V18 strips retired `sdlc` from `documentSets`

- **File:** `src/db/index.ts` (V18 `.upgrade()` hook, step 3)
- **Change:** `documentSets` collection `.modify()` deletes the retired `sdlc`
  key when present.
- **Preserved:** the document set row, its id, `documentIds` membership,
  `createdAt`, every unrelated field, and all referenced `notes`.
- **Why:** `DocumentSetSchema` is `.strict()`, and both `updateDocumentSet` and
  `updatePresentationOrder` spread the existing row before `parse`, so a legacy
  row carrying `sdlc` threw on every edit/reorder.
- **V18 kept as-is:** no new V19. V14 and all earlier history untouched.
- **Test:** `tests/db/sdlcPurgeMigration.test.ts` seeds a V17 `documentSets` row
  with `sdlc` metadata plus an ordinary set and a member note, upgrades, then:
  case 6 asserts the key is gone and set/note content survives; case 7 asserts
  `updateDocumentSet` and `updatePresentationOrder` both succeed afterwards.
  Both cases fail with the migration step removed.

## Fix 2 — WR-04: legacy restore drops `:sdlc` thread messages too

- **File:** `src/services/backup/restoreBackup.ts` (`restoreRows`)
- **Change:** when the payload has no `chatTabs`, `chatMessages` is filtered
  against the ids of the threads `legacyTabRows` actually kept.
- **Preserved:** ordinary threads, their messages, and their backfilled tabs.
- **Unchanged:** an explicit `chatTabs` array still goes through strict
  validation, so any `type: 'sdlc'` tab is still rejected outright (D-06), and
  `CURRENT_SCHEMA_VERSION` stays 11.
- **Why:** `legacyTabRows` deletes `:sdlc` threads but messages were left behind,
  producing orphans that the app's own exporter/validator rejects.
- **Test:** `tests/services/backup/restoreBackup.test.ts` restores a legacy
  envelope with no `chatTabs` carrying one legacy `:sdlc` thread plus one
  ordinary thread and their messages; asserts the legacy thread and message are
  gone, the ordinary pair survives, no orphan remains, and a fresh
  `exportBackupPayload` re-validates clean.

## Verification

- `npx vitest run tests/db/sdlcPurgeMigration.test.ts` — 8 passed.
- `npx vitest run tests/services/backup/restoreBackup.test.ts tests/services/backup/validateBackup.test.ts tests/db/sdlcPurgeMigration.test.ts` — 33 passed.
- RED confirmed for both fixes by temporarily reverting each source change.
- `tsc --noEmit`: no error in any changed file. 155 pre-existing errors remain in
  unrelated workbench/test files (missing `@tanstack/react-virtual` in this
  worktree's dependency set plus implicit-`any` callbacks); out of scope.

## Not done (by request)

- No push; no shared STATE/ROADMAP/REQUIREMENTS edits.
- CR-02 remained rejected per D-06; no version bump, no explicit-tab
  normalization.
- No other review findings touched.
