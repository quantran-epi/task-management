# Quick Task: Add Repo Configuration Tab to SDLC Sidebar and View

## Problem
1. SDLC shows "Repository: Chưa liên kết SSH" in ConventionsSummaryCard, but there is no dedicated place to configure SSH repo binding.
2. Step 3 (Code Guide) only auto-saves SSH binding on blur without an explicit Save button.
3. Step 3 lacks the `ConventionsSummaryCard` at the top.
4. Users need a dedicated "Cấu hình Repo & Quy ước" tab in SDLC sidebar to configure SSH, remote repo path, base branch, test connection, and inspect conventions anytime without being blocked by step prerequisites.

## Implementation Steps
1. **Create `src/components/sdlc/config/RepoConfigView.tsx`**:
   - SSH config selector, remote repo path with folder browser modal, base branch.
   - Explicit "Lưu cấu hình liên kết" button.
   - "Kiểm tra kết nối & Nạp quy ước" action.
   - Remote `CONVENTIONS.md` preview and Global Conventions summary.
2. **Update `SdlcSidebar.tsx`**:
   - Add a dedicated button/tab for "Cấu hình Repo & Quy ước" (with active state indicator).
   - Allow user to toggle between workflow steps and Repo Config.
3. **Update `ProjectSdlcView.tsx`**:
   - Manage `currentView: 'STEPS' | 'CONFIG'` state.
   - Render `RepoConfigView` when in config mode.
   - Refresh conventions upon binding save.
   - Pass `conventionsSummary` to `Step3CodeGuideView`.
4. **Update `Step3CodeGuideView.tsx`**:
   - Add `ConventionsSummaryCard` at top of Step 3.
   - Add an explicit "Lưu" button for SSH binding in Step 3 configuration bar.
5. **Verify**:
   - Run vitest on SDLC test suite.
