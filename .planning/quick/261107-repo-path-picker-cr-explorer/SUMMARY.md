---
id: 261107-repo-path-picker-cr-explorer
type: quick
created: 2026-11-07
status: complete
description: SSH directory picker in SystemModal, rename Project Explorer to CR Explorer with New CR button, unify SDLC Studio around CR, and open SystemDetailView on System Explorer click
files_modified:
  - src/components/systems/SystemModal.tsx
  - src/workbench/WorkbenchLayout.tsx
  - src/workbench/toolwindows/LeftToolWindow.tsx
  - src/workbench/actions/actionRegistry.ts
  - src/views/ProjectSdlcView.tsx
  - src/views/SystemDetailView.tsx
  - src/components/sdlc/SdlcSidebar.tsx
  - src/workbench/toolwindows/ProjectExplorer.tsx
  - src/workbench/toolwindows/CRExplorer.tsx
  - src/workbench/toolwindows/SystemsExplorer.tsx
  - src/workbench/EditorArea.tsx
  - src/workbench/store/layoutStore.ts
  - tests/components/systems/SystemCatalogView.test.tsx
  - src/components/sdlc/__tests__/SdlcSidebar.test.tsx
  - tests/views/ProjectSdlcViewMultiSystem.test.tsx
---

# Quick Task Summary: SystemModal SSH Directory Picker, CR Explorer Rebrand & SDLC Studio CR Unification

## What Changed
1. **SystemModal SSH Directory Picker**:
   - Integrated `RemoteDirectoryBrowserModal` for `remoteRepoPath` in `SystemModal.tsx`.
   - Added `Duyệt SSH...` button using the selected SSH configuration to browse the server file tree directly over SSH.
   - Enforces absolute remote path validation (`/path/...`).

2. **Project Explorer -> CR Explorer Rebrand**:
   - Renamed left stripe item, tooltip (`Alt+1: CR Explorer`), header, and actions to `CR Explorer`.
   - Exported `CRExplorer` component and created `src/workbench/toolwindows/CRExplorer.tsx`.
   - Added `Tạo CR` button directly on the CR Explorer toolbar alongside search, plus a create button on empty state.

3. **SDLC Studio Unification around Change Request (CR)**:
   - Eliminated the redundant "Dự án (Project)" selector tier in `SdlcSidebar.tsx`.
   - Primary selector now directly chooses a Change Request (CR) with its code, name, and type badge (New Feature, Enhancement, Bugfix).
   - Under the selector: displays affected Subsystems pills and quick SSH/repo config.
   - Replaced all "Dự án" placeholders in SDLC Studio with "Change Request (CR)".

4. **Systems Explorer Detail View**:
   - Registered `system_detail` editor view in `layoutStore.ts` and `EditorArea.tsx`.
   - Created `SystemDetailView.tsx` with breadcrumbs, subsystem hierarchy, deployment/SSH specs, and related Change Requests.
   - In `SystemsExplorer.tsx`: clicking a tree node directly opens that system's `SystemDetailView` in Center Area. Removed redundant "Mở danh mục" from context menu.

## Verification
- `37/37` tests pass across `SystemCatalogView`, `SdlcSidebar`, `ChangeRequestsView`, `multiSystemConventionService`, `ProjectSdlcViewMultiSystem`, `schemaV15Migration`, `systemRepo`, and `changeRequestRepo`.
