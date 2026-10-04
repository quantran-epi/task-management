# Quick Task 261004-nps: Normalize Page Structure UI and Notes Filter & Search

## Goal
1. Standardize UI page structure across all main views (`DashboardView`, `TasksView`, `PlannerView`, `ProjectsView`, `NotesView`, `AnalyticsView`, `SettingsView`) using a reusable `PageHeader` component with normalized `title`, `subtitle`, and `extra` action slots.
2. Update the top Header in `AppShell` so it displays the dynamic current route title instead of fixed "PlannerMate" (which duplicates the brand logo in the sidebar).
3. In `NotesView`:
   - Enable searching notes by attached parent entity name (task, project, milestone).
   - Add item-level filter (select a specific task, project, or milestone) when filtering notes by entity type.

## Tasks

### Task 1: Create Reusable PageHeader Component and Update Top Header
- **Files**:
  - `src/components/common/PageHeader.tsx`
  - `src/components/shell/AppShell.tsx`
- **Action**:
  - Implement `PageHeader` with title, optional subtitle/description, optional extra action buttons, and optional children slot (for sub-toolbars/segmented controls).
  - Use consistent typography (`Title level={4}`, secondary subtitle text) and token-based spacing (`marginBottom: 16`).
  - In `AppShell.tsx`, map `currentRoute` to human-readable Vietnamese page titles and render the route title in the top header instead of static "PlannerMate".
- **Verify**: Targeted tests pass.

### Task 2: Standardize Page Structure Across Views
- **Files**:
  - `src/views/DashboardView.tsx`
  - `src/views/TasksView.tsx`
  - `src/views/PlannerView.tsx`
  - `src/views/ProjectsView.tsx`
  - `src/views/AnalyticsView.tsx`
  - `src/views/SettingsView.tsx`
  - `src/views/NotesView.tsx`
- **Action**:
  - Integrate `PageHeader` across all views with consistent titles, descriptions, and action placement.
  - Normalize outer layout containers and spacing.
- **Verify**: Targeted tests pass.

### Task 3: Enhance Notes Search & Item Filter
- **Files**:
  - `src/views/NotesView.tsx`
- **Action**:
  - Update note search filtering in `NotesView` to check parent entity name (`entityNames.get(...)`) in addition to title, body, and attachment texts.
  - Fetch tasks, projects, and milestones for item-level selection dropdown.
  - When `entityFilter` is `'task'`, `'project'`, or `'milestone'`, render a secondary selector to filter by specific item, or allow clearing to show all items of that type.
- **Verify**: Run targeted tests.
