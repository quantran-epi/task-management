---
phase: 35-shared-primitive-extraction-sdlc-behavior-removal
plan: 10
subsystem: backup
tags: [backup, validation, sdlc-removal, ai-remove-05]
dependency_graph:
  requires: [35-05]
  provides:
    - "chat-only backup envelope (type: z.enum(['chat']))"
    - "SDLC-free legacyTabRows backfill"
    - "SDLC-free validateBackup invariants"
  affects: [35-08, 35-12]
tech_stack:
  added: []
  patterns: [zod-strict-object, dexie-transaction]
key_files:
  created: []
  modified:
    - src/validation/backupSchemas.ts
    - src/services/backup/exportBackup.ts
    - src/types/backup.ts
    - src/services/backup/restoreBackup.ts
    - src/services/backup/validateBackup.ts
    - tests/services/backup/validateBackup.test.ts
    - tests/services/backup/restoreBackup.test.ts
    - tests/backup/tabCheckpointBackup.test.ts
decisions:
  - "D-06: chatTabs[].type narrowed to z.enum(['chat']) — an sdlc value is rejected, never coerced"
  - "D-07: restore drops legacy ':sdlc' threads instead of synthesizing SDLC tab/thread; one ordinary chat tab remains per scope"
  - "restoreBackup keeps exactly one ':sdlc' literal (the skip predicate) — enumerated on plan 12's Gate C residual list"
  - "FORBIDDEN_BACKUP_KEYS left byte-identical (T-35-25) so narrowing the schema never widens the accepted surface"
metrics:
  duration: "~22m"
  tasks: 3
  files: 8
  completed: 2026-11-10
  commits: 3
  plan_head_before: 7175b5e0ef4f6f924523e724c5e8e2421053b417
  plan_head_after: 40971baffc931669497b2372bae75c8f534fffa7
actuals:
  tokens: 41000
  tasks: 3
  commits: 3
status: complete
---

# Phase 35 Plan 10: Backup Envelope SDLC Removal Summary

Backup envelope narrowed to chat-only tabs; restore no longer synthesizes an SDLC tab or thread; validate enforces no SDLC invariant, while the export→validate→restore round-trip still passes.

## Tasks

| # | Task | Commit | Outcome |
|---|------|--------|---------|
| 1 | Narrow the backup schemas and the export path together | `0107d666` | Deleted the wizard/workflow schema imports and the `sdlcArtifact` / `workflowState` / `wizard` / document-set `sdlc` fields; `type` is now `z.enum(['chat'])`; the `workflowState` spread left `projectSafeChatTab`; `BackupRecoveryInfo` and the `recovery` result field removed. `FORBIDDEN_BACKUP_KEYS` untouched. |
| 2 | Remove the SDLC generator from restore and the SDLC invariants from validate | `3db6e6a3` | `legacyTabRows` skips `:sdlc`-suffixed threads and pushes unconditional `type: 'chat'` tabs; the synthesized SDLC thread/tab, `SDLC_TITLE`, the `sdlc_workflow:` settings mirror, the `recovery` object, the workflowState artifact-ref block, the `cm.wizard` checks, `note.sdlcArtifact` checks, and the document-set `sdlc` checks are gone. |
| 3 | Update the three backup tests, including the sdlc-tab rejection case | `40971baf` | Added sdlc-tab rejection + chat-tab acceptance to `validateBackup.test.ts`; replaced the SDLC mirror test with an export round-trip test in `restoreBackup.test.ts`; rewrote `tabCheckpointBackup.test.ts` to five chat-only cases, including the legacy `:sdlc`-thread backfill which now yields one ordinary tab and zero `sdlc` tabs. |

## Verification

- `npx vitest run tests/services/backup tests/backup` — 9 files, 66 tests passed.
- `npx vitest run tests/services/backup/validateBackup.test.ts tests/services/backup/restoreBackup.test.ts tests/backup/tabCheckpointBackup.test.ts` — 29 tests passed.
- `grep -n "sdlc\|Sdlc\|workflowState\|wizard\|Wizard\|recovery\|Recovery" src/validation/backupSchemas.ts src/services/backup/exportBackup.ts src/types/backup.ts` — 0 lines.
- `grep -n "sdlc\|Sdlc\|workflowState\|wizard\|Wizard\|recovery\|Recovery\|sdlcByScope" src/services/backup/validateBackup.ts` — 0 lines.
- `grep -c "sdlc\|Sdlc" src/services/backup/restoreBackup.ts` — 1 (the intentional `:sdlc` scope-key skip; Gate C residual).
- `grep -c "FORBIDDEN_BACKUP_KEYS" src/validation/backupSchemas.ts` — 3 (declaration + two uses), unchanged from before.
- `npx tsc --noEmit` — no error inside the four backup modules or the three test files.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Export redaction test fixture used unreachable key names**
- **Found during:** Task 3
- **Issue:** With `workflowState` gone, the export-redaction test nested its secret fixtures under `promptContextOptions`. `projectSafeTabValue`'s `FORBIDDEN_TAB_BACKUP_KEY` regex only matches underscore-separated keys (`partial` as a segment, `raw.*response`, `error` as a segment) — `partialBuffer` / `rawModelResponse` are blocklist entries in the *validator*, not the export projection — so `partialBuffer` survived the export and the assertion failed.
- **Fix:** Renamed the fixtures to underscore form (`partial_buffer`, `error_stack`, `private_prompt`, `raw_model_response`), which is the shape the export projector actually redacts. Assertions unchanged.
- **Files modified:** `tests/backup/tabCheckpointBackup.test.ts`
- **Commit:** `40971baf`

**2. [Rule 3 - Blocking] Legacy backfill restructured to preserve CR scopes**
- **Found during:** Task 2
- **Issue:** The plan's `if (scopedThreads.length === 0)` guard alone would drop the scope entirely when a legacy `:sdlc` thread was skipped, so a legacy CR backup would restore with zero tabs instead of one ordinary chat tab (Test 3 in `<behavior>` requires exactly one).
- **Fix:** The skip adds the derived scope to the `scopes` set before `continue`, so the ordinary `:chat:` thread generator still fires for that CR. `importedThreads` is now built by push inside the loop rather than copied and mutated.
- **Files modified:** `src/services/backup/restoreBackup.ts`
- **Commit:** `3db6e6a3`

### Cross-plan dependency (not a deviation)

`src/components/settings/ImportPreviewModal.tsx:136` reads `validationResult.recovery`, which no longer exists. That consumer is deleted by plan 08 Task 3 in this same wave, so `npx tsc --noEmit` is not yet clean tree-wide — matching the plan's own wording that `tsc` exits 0 only at the wave-5 boundary (plans 06-10 land together). Nothing else in `src` referenced `recovery`, `sdlcArtifact`, `workflowState`, or `wizard` in the backup boundary.

## Known Stubs

None.

## Threat Flags

None — the changes only narrow the accepted import surface (T-35-24 mitigated by `z.enum(['chat'])`, T-35-25 by leaving `FORBIDDEN_BACKUP_KEYS` byte-identical, T-35-26 by landing the schema and export change in one plan). T-35-27 is the accepted DoS consequence: a pre-1.4 backup carrying an `sdlc` tab is rejected rather than migrated.

## Self-Check: PASSED

- `src/validation/backupSchemas.ts` — FOUND
- `src/services/backup/exportBackup.ts` — FOUND
- `src/types/backup.ts` — FOUND
- `src/services/backup/restoreBackup.ts` — FOUND
- `src/services/backup/validateBackup.ts` — FOUND
- `tests/services/backup/validateBackup.test.ts` — FOUND
- `tests/services/backup/restoreBackup.test.ts` — FOUND
- `tests/backup/tabCheckpointBackup.test.ts` — FOUND
- commits `0107d666`, `3db6e6a3`, `40971baf` — FOUND (all ancestors of HEAD)
