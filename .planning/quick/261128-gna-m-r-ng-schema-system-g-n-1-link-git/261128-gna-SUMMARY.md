# Quick 261128-gna Summary: System Git Source/GitOps Links

## One-liner

Extended System with optional `gitSourceUrl` / `gitOpsUrl` metadata links — one shared allowlist validator at form and backup boundaries, persisted in existing Dexie V31 rows, surfaced in modal/detail/catalog table with safe clickable links.

## Tasks

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | Data contract, validation and persistence | `8a546b7a` | complete |
| 2 | UI form, detail and table | `5ddd01da` | complete |
| 3 | Independent review fixes (URL hardening, SCP href, shared helpers, tests) | `dd6a07f5` | complete |

## Files modified

Created:
- `tests/validation/systemGitUrls.test.ts`
- `src/utils/gitLink.ts` — shared `gitHref` (SCP → HTTPS) + `gitLinkLabel` for table/detail
- `src/components/systems/SystemTable.test.tsx` — link href/label assertions
- `.planning/quick/261128-gna-m-r-ng-schema-system-g-n-1-link-git/261128-gna-SUMMARY.md`

Updated:
- `src/types/models.ts` — 2 optional fields on `System`
- `src/validation/schemas.ts` — `isGitRepoUrl` / `isValidGitRepoUrl` / `gitRepoUrlSchema`; added to both System schemas
- `src/validation/backupSchemas.ts` — `BackupSystemRecordSchema` accepts both links; version stays 15
- `src/db/repositories/systemRepo.ts` — create/update/delete semantics for both fields
- `src/components/systems/SystemModal.tsx` — Link Git block, seeded values, inline validation, trim + undefined on empty
- `src/components/systems/SystemModal.test.tsx` — 4 new tests (old 2 untouched)
- `src/components/systems/SystemTable.tsx` — Link Git column with labelled safe links
- `src/views/SystemDetailView.tsx` — 2 overview description rows with safe links
- `tests/services/backup/validateBackup.test.ts` — 3 backup trust-boundary tests

## Verification

- `npx vitest run tests/validation/systemGitUrls.test.ts tests/services/backup/validateBackup.test.ts src/components/systems/SystemModal.test.tsx src/components/systems/SystemTable.test.tsx --bail=1` — **4 files, 75 tests passed**
- `npx tsc --noEmit` — clean for all GNA files. One unrelated pre-existing error in `src/views/TasksView.tsx` (`PlusOutlined` unused) from a parallel session; untouched.
- `npx eslint src/types/models.ts src/validation/schemas.ts src/validation/backupSchemas.ts src/db/repositories/systemRepo.ts src/components/systems src/views/SystemDetailView.tsx` — clean, zero warnings/errors
- Chrome (real Google Chrome, non-headless, Vite dev server): verified both light and dark:
  - detail shows both links clickable (`https://...` and `git@host:owner/repo.git`) with `target="_blank"` `rel="noopener noreferrer"`
  - edit modal shows 2 inputs seeded with stored values
  - `javascript:alert(1)` in source input blocks save with inline error
  - clearing both inputs and saving removes links after reload
  - System catalog table shows a labelled Source/GitOps column with clickable links; parent rows show "—"
  - after review fixes: SCP link `git@github.com:acme/gitops.git` opens `https://github.com/acme/gitops.git`; whitespace-only input shows inline error; URLs with userinfo/backslash are rejected
- No full vitest suite run (project rule: >1 hour).

## Decisions

- URL allowlist is a single function reused by Zod schemas and AntD form validators; rejects credentials/backslash (except standard `ssh://git@host`), no blacklist, no new dependency
- SCP-style URLs are stored as entered but rendered with an HTTPS `href` so browser navigation opens the repo
- Both links are metadata usable on LOGICAL_GROUP; `assertParentHasNoRepoFields` still blocks SSH/repo binding
- Dexie stays at V31 and backup stays at v15 — fields are optional row payload, no migration needed
- `remoteRepoPath` label/behavior kept intact and visually separated from the new link block

## Deviations from plan

Independent review found 1 HIGH + 3 MEDIUM issues after Task 2; fixed in `dd6a07f5` (URL hardening, SCP href, shared helpers, added test coverage). Otherwise plan executed as written.

## Stub tracking

None.

## Threat flags

None beyond plan `threat_model`; all four dispositions implemented (allowlist, safe target/rel, backup validation, 500-char cap).

## Constraint compliance

- Zero changes to files of parallel sessions (`src/views/TasksView.tsx`, `src/components/tasks/**`, `src/workbench/**`, `src/styles/workbench-tokens.css`, `.planning/STATE.md`, 261128-fqs/fvp artifacts)
- No new branch/worktree, no fetch/push
- Only specific files staged, verified with `git diff --cached --name-only` before each commit
- No dependency added; no schema version bump
- SUMMARY/PLAN/STATE artifacts not committed (orchestrator handles)

## Duration

~8 minutes (2026-11-28 05:05Z → ~05:13Z)
