# Quick 261109-eme: Refactor AI Office & Staff to Left Stripe Explorers and Hide Ghost Dev

**Execution Summary:**
- **Phase:** quick-261109-eme
- **Plan:** 01
- **Status:** complete
- **Duration:** ~15m
- **Commits:**
  - `2414c61e`: task(quick-261109-eme): hide ghost dev from titlebar and aiofficeview
  - `c2175556`: task(quick-261109-eme): register viewTypes and implement StaffDetailView and TeamWorkspaceView
  - `93dd3873`: task(quick-261109-eme): implement AiStaffExplorer, AiOfficeExplorer and wire left stripe

## What was built

1. **TitleBar & AiOfficeView Cleanup (Task 1):**
   - Removed Ghost Dev button, status badge, and useGhostDevSessions hook from TitleBar.
   - Removed legacy AI Office button from TitleBar.
   - Removed outer Segmented toggle ('office' vs 'ghost-dev') from AiOfficeView, rendering office management directly.

2. **Editor Tabs & Detail Views (Task 2):**
   - Added `staff_detail` and `team_workspace` to `EditorViewType` union in `layoutStore.ts`.
   - Created `StaffDetailView` supporting direct in-tab inspection and editing of AI Employees and Leads (name, role, capability, persona, model, skill) with schema validation (`AiEmployeeInputSchema`, `AiLeadInputSchema`).
   - Created `TeamWorkspaceView` hosting `TeamWorkspace` inside center editor area with graceful fallback when team is missing/deleted.
   - Updated `EditorArea.tsx` with dedicated tab icons (`UserOutlined`, `TeamOutlined`) and rendering wiring.

3. **Left Stripe Explorers (Task 3):**
   - Implemented `AiStaffExplorer` listing AI Leads and AI Employees with search, count badges, and quick add triggers for Lead/Employee. Clicking items opens `staff_detail` editor tab.
   - Implemented `AiOfficeExplorer` listing AI Teams with status tags, lead information, and member counts. Clicking opens `team_workspace` editor tab.
   - Updated `WorkbenchLayout.tsx` adding `ai_office` to `DEFAULT_LEFT_ITEMS` (Alt+7) and `ai_staff` to `DEFAULT_BOTTOM_LEFT_ITEMS` (Alt+8) directly above `remote_explorer`.
   - Updated `LeftToolWindow.tsx` to mount `AiStaffExplorer` and `AiOfficeExplorer`.
   - Added unit test suite `tests/workbench/AiExplorers.test.tsx` verifying tab opening on staff and team clicks.

## Verification

- `npm test -- tests/workbench/AiExplorers.test.tsx`: 3 passed (100%)
- `npm test -- tests/views/AiOfficeView.test.tsx`: 15 passed (100%)

## Self-Check: PASSED
- `src/workbench/toolwindows/AiStaffExplorer.tsx`: FOUND
- `src/workbench/toolwindows/AiOfficeExplorer.tsx`: FOUND
- `src/views/StaffDetailView.tsx`: FOUND
- `src/views/TeamWorkspaceView.tsx`: FOUND
- `tests/workbench/AiExplorers.test.tsx`: FOUND
