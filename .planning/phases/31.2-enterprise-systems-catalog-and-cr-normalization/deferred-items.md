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
- ~~`src/components/sdlc/__tests__/SdlcSidebar.test.tsx` references `onSelectConfig`, `sidebar-btn-repo-config` and a `projectId` fixture — owned by plan 31.2-19.~~ Resolved by plan 31.2-15: the suite is rewritten against a real `fake-indexeddb` CR/subsystem fixture and asserts no `sidebar-btn-repo-config`.
- `src/components/sdlc/steps/__tests__/Step3CodeGuideView.test.tsx` and `Step4ChangePackView.test.tsx` mock `getProjectRepoSshBinding` — owned by plans 31.2-16/17/19.

## Plan 31.2-15 execution

- `tests/unit/sdlc/SdlcWorkspace.test.tsx` — "clamps pointer, keyboard, and reset changes to the supported bounds" fails on the wave-6 base commit `86bf4813` as well as with plan 31.2-15 applied (verified by restoring the base `SdlcWorkspace.tsx` and re-running). Not caused by the Context Bar props. Owner: the plan that next touches `SdlcWorkspace` chat-width behaviour.
- `tests/unit/sdlc/ProjectSdlcView*.test.tsx` and `tests/views/ProjectSdlcViewMultiSystem.test.tsx` import `src/views/ProjectSdlcView`, which plan 05 renamed to `ChangeRequestSdlcView`. Rewritten by plan 31.2-19 Task 3.
- Deliberate scope boundary: `Step3CodeGuideView` still owns a local `selectedSystemId` and its own `Segmented` switcher. Plan 31.2-16 Task 2 removes that state and consumes the view-level prop. Plan 31.2-15 only lifts the state into `ChangeRequestSdlcView` and renders the shared bar above the step content.

## Plan 31.2-23 execution

- `src/services/wizard/workflowSchemas.ts:136` still declares the persisted workflow-state field as `projectId`. Plan 31.2-17 owns that file; renaming the field in `workflowCoordinator.ts` alone would make every `SdlcWorkflowStateSchema.parse` fail (`Unrecognized key: "projectId"` — the schema is a `strictObject`). Plan 23 therefore keeps the persisted JSON field name and only renames the coordinator dependency (`changeRequestId`). Plan 31.2-17 or 31.2-24 must rename the schema field and the `workflowCoordinator.ts:232` write together, or not at all.
- `src/services/ai/sdlcArtifactTools.ts` (`ArtifactToolContext.projectId`, `ArtifactPatchProposal.projectId`) and `src/views/ChangeRequestSdlcView.tsx`'s local `projectId` binding still exist. `sdlcArtifactTools.ts` is plan 31.2-18's file; the view's local variable is a display alias for `selectedChangeRequestId` and does not cross a persisted boundary. Plan 31.2-24's repo-wide `projectId` grep gate will need both resolved.
- `src/components/sdlc/steps/Step2SolutionView.tsx:141,152`, `Step4ChangePackView.tsx:165`, `Step6CabView.tsx:108,146` still pass `projectId` into `HubSolutionInput` / `BuildHubReconciliationInput` / `HubCabInput` / `HubExportInput`, which plan 23 renamed to `changeRequestId`. Those three step views are plans 31.2-16/17's files, so the call sites are left for them; `npx tsc --noEmit` reports the mismatch until they land.
- `src/services/wizard/sdlcCrManager.ts:163` writes `scopeType: 'project'`, which no longer satisfies `ChatScopeType`. Plan 31.2-17 owns that file.
- `src/workbench/EditorArea.tsx:400,403` still reads `db.projects` / `db.milestones` and `:421` passes `initialProjectId` to `TasksView` (whose prop is `initialCrId`). EditorArea is listed in plans 31.2-05/06/13's `files_modified`, not this plan's, so it is out of scope here.
- `tests/ai/artifactPersistence.test.ts` and `src/services/wizard/__tests__/hubCrSummary.test.ts` still build fixtures with `projectId` / a `Project` row; both are in plan 31.2-19's file list (wave 10). The plan's `<verification>` vitest command cannot pass until plan 19 converts them.
