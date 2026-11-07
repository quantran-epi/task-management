# Deferred Items — Phase 31.2

Out-of-scope discoveries logged during plan 31.2-05 execution. Not fixed here.

## Cross-plan gap: `AIChatDrawer` still calls the deleted `loadRepoConventions`

- **File:** `src/components/ai/AIChatDrawer.tsx` (lines 50 and 1842)
- **Discovered during:** 31.2-05 Task 2
- **Issue:** Plan 31.2-05 deletes `loadRepoConventions(projectId, db)` from `src/services/conventionService.ts` (D-36: single config source). `AIChatDrawer.tsx` both imports it and calls it in a `Promise.all` at line 1842. `AIChatDrawer.tsx` is owned by plan 31.2-10 (wave 5), whose task list covers `isProjectScope`/`'milestone'` renames but does not mention conventions.
- **Impact:** `npx tsc --noEmit` reports `TS2724: '"../../services/conventionService"' has no exported member named 'loadRepoConventions'` until it is converted. Plan 24 restores whole-repo compilation at wave 11, so this must be resolved by then.
- **Suggested fix:** replace the call with `loadMultiRepoConventions(cr.targets.map(t => t.systemId), db)` against the active CR, mirroring `ChangeRequestSdlcView.fetchAllConventions`.
- **Owner:** plan 31.2-10 (or plan 31.2-24 if 10's scope is already closed).

## Test files still referencing removed symbols

- `tests/services/multiSystemConventionService.test.ts` imports `loadRepoConventions` — owned by plan 31.2-24.
- `src/components/sdlc/__tests__/SdlcSidebar.test.tsx` references `onSelectConfig`, `sidebar-btn-repo-config` and a `projectId` fixture — owned by plan 31.2-19.
- `src/components/sdlc/steps/__tests__/Step3CodeGuideView.test.tsx` and `Step4ChangePackView.test.tsx` mock `getProjectRepoSshBinding` — owned by plans 31.2-16/17/19.
