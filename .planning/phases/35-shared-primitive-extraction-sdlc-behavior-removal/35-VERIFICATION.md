---
phase: 35-shared-primitive-extraction-sdlc-behavior-removal
verified: 2026-11-10
status: passed
verification_mode: targeted-inline
---

# Phase 35 Verification

12/12 planned executions merged locally. Phase accepted under the user's clarified fresh-data-only scope. Legacy-data compatibility, legacy-layout walkthrough, and exact UI copy differences are not completion blockers. User authorized phase completion and push. Security, separate validation audit, and UI audit stopped at user's request; no new audit agents launched. This acceptance does not claim an observed Tauri runtime walkthrough or an all-green broad test sweep.

## Observed results

- Latest corrective commits: `713afc2b` (strip retired document-set metadata in V18), `353a8cff` (remove messages alongside skipped legacy threads).
- Post-merge focused regression: 3 files / 33 tests passed, command `npx vitest run tests/services/backup/restoreBackup.test.ts tests/services/backup/validateBackup.test.ts tests/db/sdlcPurgeMigration.test.ts`.
- Post-correction `npx tsc --noEmit`: exit 0, no diagnostics.
- Post-correction `npm run build`: exit 0. Existing Vite warning: node:crypto externalized from documentSetRepo; no PWA/Pages runtime validation performed.
- Post-correction residual scan over tracked existing src files: zero sdlc/Sdlc matches outside src/db/index.ts, src/workbench/store/layoutStore.ts, src/services/backup/restoreBackup.ts; zero retired schema-symbol matches.
- Earlier merged Wave 5 focused integration: 23 files / 179 tests passed.
- Earlier V18 DB/backup regression: 38 files / 235 tests passed.
- Plan 35-12 acceptance sweep reported 580 passing tests and one pre-existing KnowledgeServerConfigCard selector failure. This was not an all-green sweep. Broad sweep not rerun after corrections; latest targeted tests and build listed above are current evidence.

## Requirement disposition

| ID | Result | Evidence / limit |
|---|---|---|
| AIO-REMOVE-01 | Implemented | Extracted conventionsSegment, common DiffSyntaxHighlighter, patchProposal, PatchDiffApprovalCard present before deletion. Patch core intentionally prepares proposals for later Phase 39 reuse; no new writer added. |
| AIO-REMOVE-02 | Automated deletion gates pass | Entry points and delete set removed per plan 12; latest residual scan clean outside enumerated files. |
| AIO-REMOVE-03 | Implemented, test debt disclosed | Schema modules removed; focused backup/chat/knowledge evidence in summaries. Broad knowledge sweep has one reported pre-existing failure. |
| AIO-REMOVE-04 | Partial | Retired sdlc tabs filtered and layout key v3; automated layout tests passed. Requirement wording also asks filtering unknown view types; current code filters only RETIRED_VIEW_TYPES. Manual Tauri hydration walkthrough unrun. |
| AIO-REMOVE-05 | Implementation follows locked plans; wording conflict | Restore no longer creates SDLC tabs; orphan-message regression fixed. D-06/UI-SPEC mandate rejecting explicit sdlc tabs, whereas REQUIREMENTS.md says import-tolerant. Do not silently undo locked decision or label intentional rejection a critical regression. |

## Accepted non-blocking debt

User explicitly clarified that only fresh data matters and retired-data compatibility must not delay progression. Items below are disclosed, not claimed fixed, and do not block Phase 36.

1. InterruptedBanner description differs from exact UI-SPEC copy: checkpoint word was removed despite contract requesting it be preserved.
2. BackupChatTabRecordSchema.type lacks UI-SPEC's fixed Vietnamese invalid-sdlc-tab message; rejection is safe but copy defaults to English.
3. Layout filter covers named retired type only, not every unknown view type required by AIO-REMOVE-04. Existing comment overclaims coverage.
4. Manual Tauri layout restore walkthrough remains pending. No browser screenshot or runtime success fabricated.
5. Existing KnowledgeServerConfigCard selector test failure tracked in deferred-items.md; no unrelated cleanup requested.

## Review

Original review report preserved; triage in 35-REVIEW-DISPOSITION.md. Confirmed data regressions CR-01/WR-04 fixed and tested. Other reviewer critical claims were not accepted without scope/reachability checks. No additional security audit requested or completed.
