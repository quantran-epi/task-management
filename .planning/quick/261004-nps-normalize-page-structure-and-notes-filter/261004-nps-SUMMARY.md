---
status: complete
date: 2026-10-04
task: 261004-nps-normalize-page-structure-and-notes-filter
---

# Summary: Normalize Page Structure UI and Notes Filter & Search

## Changes Implemented

1. **Created `PageHeader` Component (`src/components/common/PageHeader.tsx`)**:
   - Provides unified `title`, `subtitle`, `extra` (actions), and optional `children` slots.
   - Enforces consistent typography hierarchy (`Title level={4}` with 600 weight, secondary subtitle) and spacing (`gap: 12`, `marginBottom: 16`).

2. **Updated Top Header & Sidebar Toggle (`src/components/shell/AppShell.tsx`)**:
   - Added desktop sidebar toggle button (`MenuFoldOutlined` / `MenuUnfoldOutlined`) to the left of the Header.
   - Removed the default collapse trigger at the bottom of the sidebar (`trigger={null}`).
   - Relocated the Command Palette search pill (Cmd+K) from the right to the left of Header next to the sidebar toggle.
   - On mobile, retains hamburger menu, brand logo, and app name "PlannerMate".

3. **Normalized All Page Views**:
   - `DashboardView`: Standardized top with `PageHeader` ("Bảng tổng quan").
   - `TasksView`: Standardized with `PageHeader` ("Danh sách tác vụ") and action slot for "Tự động phân bổ".
   - `PlannerView`: Replaced ad-hoc header with `PageHeader` ("Kế hoạch công suất"), integrated action buttons and theme-aware toolbar container.
   - `ProjectsView`: Replaced unstyled `h2` with `PageHeader` ("Dự án & Cột mốc") and "Dự án mới" primary action button.
   - `AnalyticsView`: Replaced ad-hoc title block with `PageHeader` ("Thống kê hiệu suất & Thời gian làm việc") and time-period radio group in `extra`.
   - `SettingsView`: Standardized header with `PageHeader` ("Cài đặt & Cấu hình công suất") and back button in `extra`.
   - `NotesView`: Standardized with `PageHeader` ("Ghi chú & Tài liệu") and popout / create actions.

4. **Enhanced Notes Search & Item Filtering (`src/views/NotesView.tsx`)**:
   - Enabled searching notes by attached parent entity name (matching against task, project, or milestone names).
   - Added item-level filter dropdown when an entity category (`task`, `project`, `milestone`) or `all` is active, allowing filtering notes by a specific parent item.

5. **Targeted Verification**:
   - Added `tests/components/common/PageHeader.test.tsx` (2 tests).
   - Added `tests/views/NotesView.test.tsx` (3 tests).
   - Verified all 9 targeted test files (34 tests passed).
