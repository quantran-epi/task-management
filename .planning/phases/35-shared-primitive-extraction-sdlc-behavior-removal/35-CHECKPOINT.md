# Phase 35 — Planning checkpoint

**Date:** 2026-11-10
**Branch:** `feature/intellij-workbench`
**State:** Planning verified; ready to execute. No production code executed or changed by this planning run.

## Resume here

```text
/gsd-execute-phase 35
```

Do not replan from scratch. Preserve 12 plans / 7 waves. All historical round-2 blockers listed in the previous checkpoint were addressed.

## Verification history

- Round 2: 8 blockers, 5 warnings, 1 info.
- Revision commits applied to this worktree: `404e42a0`, `6856efcc`. Fixed all round-2 items; added 29 adjacent `<fails_when>` statements; replaced directory-wide Vitest sweep with focused paths.
- Round 3: zero blockers; remaining concrete warning concerned incomplete `ChatTabBar.test.tsx` rewrite instructions in plan 08. Scope-size advisories also recorded for plans 06–08.
- User chose to fix plan 08, not to override the concrete warning.
- Targeted follow-up checker: `VERIFICATION PASSED`. Instructions now cover all SDLC-only blocks, all shifted tab indices, and preserve ordinary close/rename/keyboard/drag/reorder coverage. No new blocker or warning in the delta.
- Deterministic failing-direction probe: 29/29 commands have failure signals; zero findings.
- Requirement coverage: AIO-REMOVE-01 through AIO-REMOVE-05 all claimed by plan frontmatter.
- D-12 exclusion explicitly cited in plan 12 objective: no registry relocation or `teamRunManager.ts` creation in this phase.

Planning verification is not implementation verification. No application tests, build, or live Tauri walkthrough were run here; execute-phase must run planned checks and record observed outputs.

## Wave structure

| Wave | Plans | Scope |
|---|---|---|
| 1 | 01, 02 | Patch core, conventions segment, diff highlighter |
| 2 | 03 | PatchDiffApprovalCard |
| 3 | 04 | Artifact-tool rescope |
| 4 | 05 | SDLC test deletion and safety-gate rewrite |
| 5 | 06, 07, 08, 09, 10 | Atomic SDLC deletion, layout, chat UI, domain types, backup |
| 6 | 11 | Dexie V18 purge |
| 7 | 12 | Focused acceptance sweep |

Wave 5 remains atomic: deleted files read fields removed by plan 09; backupSchemas imports schema modules removed by plan 06. Verify typecheck after the whole wave, not between its plans. Scope-size advisories remain visible for dense plans 07/08; no user waiver was recorded. Use existing executor checkpoint handling if context exhaustion occurs; do not silently split or defer scope.

## Locked execution reminders

1. Dexie V18 belongs to Phase 35. Phase 36 uses V19.
2. Delete `ChatMessage.artifactEvent`, `ChatArtifactEvent`, `ArtifactEventCard.tsx`.
3. Keep and trim `InterruptedBanner`; ordinary interrupted-chat behavior survives.
4. Delete `RestoredSourceNotice`, `deriveMissingSources`, `BackupRecoveryInfo`.
5. Delete `src/services/export/**`; keep `docx` dependency for `dynamicFileSandbox.ts`.
6. Delete orphaned `researchService.ts`, `wizardService.ts`, `wizardPrompts.ts`, `sdlcSolutionParser.ts`.
7. Remove all six launch points, including `ChangeRequestTable.tsx`.
8. Delete `SafeMarkdown` with `components/sdlc/**`.
9. Move `DiffSyntaxHighlighter.tsx`; keep export name `DiffLineCodeRenderer`.
10. AIO-REMOVE-04 requires `_v3` key, `partialize` filter, and `merge` hydration guard.
11. Gate C residuals: Dexie upgrade hooks in `src/db/index.ts`, retired-view guard in `layoutStore.ts`, exactly one `:sdlc` thread skip in `restoreBackup.ts`.
12. Never run full Vitest suite or `npm test`; use focused paths in plans.

## Manual execution check

Use actual layout keys: seed `taskmate_workbench_layout_v2` and `taskmate_workbench_layout_v3` separately with a retired `sdlc` active tab. Relaunch/reload in Tauri; verify no SDLC tab renders, `activeTabId` points to a valid surviving tab, and no accidental Tasks fallback occurs. Record pending rather than passed if not observed.
