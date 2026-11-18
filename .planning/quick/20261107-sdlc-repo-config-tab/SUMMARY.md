---
status: complete
date: 2026-11-07
description: Redesign SDLC with 3-tier sidebar hierarchy, global trigger, and consistent convention summaries
---

# Summary: SDLC Studio Redesign

## Changes Delivered
1. **Global Entry Trigger**:
   - Added **SDLC Studio** quick trigger button to the top `TitleBar` navigation.
   - Registered `sdlc: 'SDLC Studio'` in `WorkbenchLayout.tsx` for 1-click access from anywhere in the app.
2. **3-Tier Hierarchical Left Sidebar (`SdlcSidebar.tsx`)**:
   - **Tầng 1 (Project Scope)**: Project Selector dropdown + Trạng thái liên kết SSH (`path` hoặc `Chưa liên kết SSH`) + nút `[Cấu hình]` mở `RepoConfigView`.
   - **Tầng 2 (CR Scope)**: Dropdown danh sách Change Requests của Project đang chọn + nút "+ Tạo CR".
   - **Tầng 3 (CR Steps)**: Thanh tiến độ và danh sách 6 bước SDLC (`INTAKE`, `SOLUTION`, `CODE_GUIDE`, `CHANGE_PACK`, `TECH_DOCS`, `CAB`).
3. **Smooth Switching & Independent View (`ProjectSdlcView.tsx`)**:
   - Hỗ trợ mở SDLC Studio mà không cần truyền `projectId` trước (tự động chọn dự án đầu tiên).
   - Khi chuyển đổi giữa các dự án từ Sidebar: nạp mượt mà, chuyển CR và làm mới conventions tự động.
   - Cập nhật PageHeader hiển thị rõ tên Dự án và mã CR đang chọn.
4. **Đồng bộ Convention Summary lên toàn bộ 6 bước**:
   - Đã gắn `ConventionsSummaryCard` lên đầu cả 6 bước (Step 1 đến Step 6).
5. **Tests**:
   - 24 unit tests chạy thành công trong `src/components/sdlc/`.
   - Bổ sung `SdlcSidebar.test.tsx` và `RepoConfigView.test.tsx`.
