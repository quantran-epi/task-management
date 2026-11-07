# Phase 31 Plan 02: Remote Repository CONVENTIONS.md Discovery and Loading over Native Tauri SSH Summary

**One-liner:** Single-roundtrip remote repository `CONVENTIONS.md` discovery across root, `.github/`, and `docs/` candidate paths over native Tauri SSH with graceful absence tolerance.

## Overview
- Extended `conventionService.ts` to export `CONVENTION_CANDIDATE_PATHS` constant and `loadRepoConventions` function.
- Probes candidate paths (`CONVENTIONS.md`, `.github/CONVENTIONS.md`, `docs/CONVENTIONS.md`) in order via a single roundtrip `test -f` shell command through `execRemoteCommand`.
- Reads full convention content via `readRemoteFile` when found, returning `{ content, foundPath, loadedAt }`.
- Automatically degrades to `null` when: running in browser context, project has no SSH binding, binding is missing required fields, configuration does not exist, file is absent on remote host, or SSH connection fails/times out.
- Added comprehensive unit and mock tests in `tests/services/conventionService.test.ts`.

## Tasks Completed
| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 & 2 | Remote repository convention candidate probing, loading & unit tests | 1405a49c | `src/services/conventionService.ts`, `tests/services/conventionService.test.ts` |

## Key Decisions Made
- Used single-roundtrip probe shell script `for p in ...; do if [ -f ".../$p" ]; then echo "$p"; exit 0; fi; done; exit 1` to minimize SSH roundtrips.
- Handled trailing slashes on `remoteRepoPath` safely with `.replace(/\/+$/, '')`.
- Applied try-catch around SSH and remote read operations with `console.warn` logging to guarantee non-blocking pipeline flow (per D-08).

## Deviations from Plan
None — plan executed exactly as written.

## Verification
- Unit test suite: `npx vitest run tests/services/conventionService.test.ts` (16 passed / 16 total).
- No uncommitted files or deletions.

## Self-Check: PASSED
- `src/services/conventionService.ts` exists and exports `CONVENTION_CANDIDATE_PATHS`, `loadRepoConventions`, and `RepoConventionResult`.
- `tests/services/conventionService.test.ts` exists and tests all discovery and error cases.
- Commit `1405a49c` exists in repository history.
