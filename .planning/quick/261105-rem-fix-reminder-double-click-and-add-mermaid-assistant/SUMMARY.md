---
status: complete
date: 2026-11-05
title: Fix reminder double-click done bug, mermaid diagram viewer with AI assistant page, export PNG and open studio triggers
---

# Summary: Fix Reminder 2-Click Done Bug, Mermaid Studio Open Trigger & Live Code Sync

## Work Completed
1. **Fix "Mở trong Mermaid Studio" từ AI Chat**:
   - **Nguyên nhân**:
     - Drawer AI Chat (ở AppShell) hoặc ToolWindow AI Chat (ở Workbench) che lấp màn hình khiến người dùng không thấy phản hồi.
     - `MermaidAssistantView` chỉ đọc mã từ `useState` khi mount lần đầu; khi mở lại tab hoặc truyền mã mới từ AI chat qua event, state `code` không được đồng bộ lại.
     - `layoutStore.ts` không merge `params` mới khi tab `'mermaid'` đã tồn tại trong danh sách `openTabs`.
   - **Khắc phục**:
     - Trong `src/views/MermaidAssistantView.tsx`: thêm `useEffect` lắng nghe `initialCode` thay đổi và sự kiện `taskmate:open-mermaid-studio` để nạp mã sơ đồ mới ngay lập tức.
     - Trong `src/workbench/store/layoutStore.ts`: cập nhật `openTab` để luôn cập nhật `params` mới khi tab đã tồn tại.
     - Trong `src/workbench/WorkbenchLayout.tsx` & `src/components/shell/AppShell.tsx`: tự động đóng Drawer / ToolWindow AI Chat để lộ giao diện Diagram Studio ở khu vực chính.
     - Thêm thông báo `message.success('Đã mở sơ đồ trong Diagram Studio')`.

2. **Fix `Model content is not valid JSON`**:
   - Thêm `completeChatText` trong `src/services/ai/nineRouterClient.ts` để nhận raw completion mà không ép `JSON.parse`.

3. **Fix xuất PNG / SVG trên desktop**:
   - Tạo `src/utils/mermaidExport.ts` với `saveFileWithPicker` (gọi native file save dialog của Tauri RFD).

4. **Fix lỗi Reminder ấn 2 lần**:
   - Đồng bộ `reminderDate` về `undefined` khi hoàn thành reminder cuối cùng trong `src/db/repositories/notificationRepo.ts`.
