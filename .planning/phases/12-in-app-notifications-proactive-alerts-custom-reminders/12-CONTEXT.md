# Phase 12: In-App Notifications, Proactive Alerts & Custom Reminders - Context

**Gathered:** 2026-09-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver proactive in-app alerting and custom reminder management directly in the application shell without external server dependencies. This includes an app header alert badge and notification drawer, custom reminder dates and notes across projects, milestones, and tasks, automated detection and listing of overdue work, imminent deadlines (today/tomorrow), capacity overload (>100% capacity over the next 14 days), stale tasks (>5 days inactive in 'In Progress' or 'In Review'), a scoped daily dismiss mechanism, and optional local browser desktop notifications when the app tab is open.

</domain>

<decisions>
## Implementation Decisions

### Drawer & Phân loại Thông báo (Notification Drawer & Categorization)
- **D-01:** Bố cục Drawer dạng Tabs: Gồm các tab "Tất cả", "Quá hạn & Đến hạn", "Quá tải công suất", "Ứ đọng", "Nhắc nhở" giúp phân loại mạch lạc và lọc nhanh khi có nhiều cảnh báo.
- **D-02:** Header Alert Badge: Đặt icon Chuông (`<BellOutlined />`) kèm Badge đỏ hiển thị tổng số cảnh báo đang kích hoạt (chưa được xử lý hoặc chưa bị ẩn) trên thanh Header của `AppShell`, nằm cạnh `StatusBadge` và `InstallButton`.
- **D-03:** Hành vi khi nhấp vào mục thông báo: Mở ngay `TaskDrawer` (đối với Task) hoặc Modal tương ứng (`ProjectModal`, `MilestoneModal`) để người dùng xem và xử lý lập tức; tự động đóng Drawer thông báo.
- **D-04:** Thao tác nhanh (Quick Action): Hỗ trợ Checkbox đánh dấu hoàn thành (Done) trực tiếp trên dòng cảnh báo task (kế thừa mẫu tương tác từ `AttentionTodayList`).
- **D-05:** Thứ tự ưu tiên sắp xếp trong tab "Tất cả":
  1. Tác vụ quá hạn (Overdue) - Nghiêm trọng nhất
  2. Ngày quá tải công suất (>100% Capacity)
  3. Tác vụ đến hạn hôm nay / ngày mai (Due soon)
  4. Tác vụ ứ đọng (>5 ngày không cập nhật)
  5. Nhắc nhở tùy chỉnh (Custom reminders)

### Nhắc nhở Tùy chỉnh & Nâng cấp Dữ liệu (Custom Reminders & Data Model)
- **D-06:** Mô hình dữ liệu Reminder: Bổ sung 2 trường tùy chọn trực tiếp vào interface `Project`, `Milestone`, và `Task` trong `src/types/models.ts`:
  - `reminderDate?: string` (định dạng chuẩn `YYYY-MM-DD`)
  - `reminderNote?: string` (chuỗi ghi chú nội dung nhắc nhở)
- **D-07:** Nâng cấp Dexie schema lên Version 4: Đánh index `reminderDate` trên cả 3 bảng `projects`, `milestones`, `tasks` để hỗ trợ truy vấn phản ứng nhanh qua `useLiveQuery`. Cập nhật Zod validation schemas (`schemas.ts` và `backupSchemas.ts`) để đồng bộ sao lưu và phục hồi.
- **D-08:** Giao diện nhập liệu: Bổ sung trường chọn "Ngày nhắc nhở" (Ant Design `DatePicker`) và "Ghi chú nhắc nhở" (Ant Design `Input`) trong form tạo/sửa của `ProjectModal`, `MilestoneModal`, và `TaskDrawer`.
- **D-09:** Điều kiện kích hoạt nhắc nhở (Active Alert): Hiển thị cảnh báo khi `currentDate >= reminderDate` VÀ trạng thái item chưa hoàn thành (`status !== 'Done'` và `status !== 'Cancelled'`).
- **D-10:** Điều kiện kết thúc nhắc nhở: Tự động hết cảnh báo khi item chuyển sang `Done` hoặc `Cancelled`, hoặc khi người dùng xóa trắng trường `reminderDate` trong form.

### Quy tắc Phát hiện Quá tải & Tác vụ Ứ đọng (Overload & Stale Detection Rules)
- **D-11:** Phạm vi quét Quá tải công suất (Overload Horizon): Quét trong phạm vi 14 ngày tới (từ `currentDate` đến `currentDate + 14 ngày`). Cảnh báo mọi ngày có tổng số phút phân bổ kế hoạch vượt quá 100% công suất làm việc khả dụng (tính theo CapacityRule tuần + CapacityOverride ngoại lệ).
- **D-12:** Tương tác cảnh báo Quá tải: Dòng cảnh báo hiển thị rõ Ngày, Tỷ lệ quá tải (VD: `10h / 8h - 125%`), và số lượng tác vụ phân bổ. Khi nhấp vào, điều hướng người dùng sang `PlannerView` và cuộn/tập trung vào đúng ngày đó để điều phối lại lịch làm việc.
- **D-13:** Tiêu chí Tác vụ Ứ đọng (Stale Task): Xác định đối với các tác vụ có trạng thái `In Progress` hoặc `In Review` mà khoảng cách `currentDate - updatedAt > 5 ngày`. Mọi thao tác chỉnh sửa task (tiến độ, phân bổ, ghi chú) đều tự động cập nhật `updatedAt` và thiết lập lại bộ đếm 5 ngày.

### Cơ chế Ẩn/Bỏ qua Cảnh báo (Dismiss & Snooze Policy)
- **D-14:** Lưu trữ trạng thái Dismiss: Lưu danh sách các cảnh báo đã bỏ qua trong bảng `settings` của IndexedDB dưới key `dismissedAlerts` dạng bản đồ `{ [alertKey]: dismissedDate }`.
- **D-15:** Giới hạn phạm vi Dismiss: Chỉ cho phép người dùng bấm "Bỏ qua" (Dismiss) đối với Cảnh báo việc ứ đọng và Nhắc nhở tùy chỉnh. Các cảnh báo nghiêm trọng (Tác vụ quá hạn và Quá tải công suất) KHÔNG cho phép dismiss, bắt buộc phải giải quyết trên dữ liệu thực tế.
- **D-16:** Hiệu lực Dismiss: Cảnh báo đã bỏ qua chỉ bị ẩn đến hết ngày hiện tại (`dismissedDate === currentDate`). Sang ngày mới, nếu vấn đề vẫn tồn tại, hệ thống sẽ kích hoạt cảnh báo trở lại để không bị lãng quên.
- **D-17:** Không cung cấp nút "Ẩn tất cả" (Dismiss All / Clear All) nhằm tránh thao tác xóa hàng loạt làm mất tập trung vào các trách nhiệm cá nhân cần giải quyết.

### Thông báo Trình duyệt Cục bộ (Local Browser Desktop Notifications)
- **D-18:** Bổ sung tùy chọn "Thông báo trình duyệt" sử dụng Web Notification API tiêu chuẩn của trình duyệt (`window.Notification`). Tính năng này chạy cục bộ khi tab web đang mở, không phụ thuộc máy chủ push bên ngoài.
- **D-19:** Cơ chế kích hoạt: Cung cấp nút bật/tắt (Toggle) trong màn hình Cài đặt (SettingsView) hoặc ngay trên Drawer thông báo (mặc định tắt). Khi người dùng kích hoạt, ứng dụng gọi `Notification.requestPermission()`. Nếu được cấp quyền, ứng dụng sẽ phát một thông báo tóm tắt trên màn hình hệ điều hành khi mở app nếu phát hiện có việc quá hạn, quá tải hoặc có nhắc nhở đến hạn hôm nay.

### Claude's Discretion
- Chiều rộng Drawer: Khoảng 420px trên màn hình desktop, 100% chiều rộng trên thiết bị di động (mobile breakpoint).
- Icon và màu sắc Tag nhận diện cho từng loại thông báo (Quá hạn: Error/Đỏ, Quá tải: Warning/Cam, Đến hạn: Processing/Xanh dương, Ứ đọng: Purple, Nhắc nhở: Gold/Cyan).
- Xử lý âm thanh/rung: Giữ thông báo nhẹ nhàng, không phát âm thanh làm phiền.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Roadmap & Requirements
- `.planning/ROADMAP.md` §Phase 12 — Mục tiêu, phạm vi và tiêu chí thành công của Phase 12
- `.planning/REQUIREMENTS.md` §NOTIF-01..NOTIF-05 — Đặc tả chi tiết 5 yêu cầu cốt lõi về thông báo và nhắc nhở

### Data Layer & Models
- `src/types/models.ts` — Định nghĩa interface Task, Project, Milestone, Setting
- `src/db/schema.ts` — Schema IndexedDB hiện tại (v1, v2, v3) cần nâng cấp lên v4
- `src/db/index.ts` — Định nghĩa lớp TaskPlannerDatabase và hàm upgrade schema
- `src/validation/schemas.ts` — Zod runtime schemas cho dữ liệu Task, Project, Milestone
- `src/validation/backupSchemas.ts` — Zod backup schemas đảm bảo tương thích xuất/nhập sao lưu

### UI Shell & Reusable Components
- `src/components/shell/AppShell.tsx` — Vị trí thanh Header nơi đặt Notification Bell Badge và Notification Drawer
- `src/components/dashboard/AttentionTodayList.tsx` — Mẫu component phát hiện việc quá hạn, đến hạn hôm nay và thao tác nhanh toggle Done

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AttentionTodayList`: Đã có sẵn logic truy vấn task quá hạn (`overdue`) và đến hạn hôm nay (`due-today`), cùng component `InlineStatusTag` và thao tác nhanh toggle Done.
- `useLiveQuery` (dexie-react-hooks): Sử dụng rộng rãi trong toàn bộ ứng dụng để theo dõi trực tiếp các thay đổi dữ liệu trong IndexedDB mà không cần tự viết subscription.
- `AppShell.tsx`: Đã có hệ thống layout responsive, header icon toolbar (`StatusBadge`, `InstallButton`, `UpgradeModal`), vị trí lý tưởng để tích hợp `NotificationBell` và `NotificationDrawer`.
- `TaskDrawer.tsx`, `ProjectModal.tsx`, `MilestoneModal.tsx`: Đã xây dựng sẵn cấu trúc Form với Ant Design, chỉ cần bổ sung 2 trường `reminderDate` và `reminderNote`.
- Capacity Calculation Utilities (`src/domain/`): Các hàm tính toán công suất ngày và tổng số giờ phân bổ từ `plannedAllocations`.

### Established Patterns
- Lưu trữ ngày dưới định dạng chuỗi `YYYY-MM-DD` để tránh sai lệch múi giờ (timezone drift).
- Quản lý trạng thái cài đặt cục bộ qua bảng `settings` trong IndexedDB (sử dụng key-value).
- Nâng cấp schema Dexie không phá hủy dữ liệu cũ thông qua `db.version(n).stores(...).upgrade(...)`.
- Khả năng hoạt động 100% offline-first trên GitHub Pages không cần máy chủ backend.

### Integration Points
- `src/components/shell/AppShell.tsx`: Thêm component `NotificationBell` vào Header và nhúng `NotificationDrawer`.
- `src/components/notifications/NotificationDrawer.tsx`: Component mới hiển thị danh sách cảnh báo theo Tabs.
- `src/services/notificationService.ts` hoặc `src/hooks/useNotifications.ts`: Hook/Service tập trung tính toán các cảnh báo chủ động từ IndexedDB (live query).
- `src/views/SettingsView.tsx`: Thêm mục cài đặt thông báo trình duyệt (Browser Desktop Notifications).

</code_context>

<specifics>
## Specific Ideas

- Người dùng mong muốn khi nhấp vào thông báo sẽ mở ngay chi tiết Task hoặc điều hướng đến đúng ngày quá tải trên PlannerView để xử lý trực tiếp, tránh mất thời gian tìm kiếm.
- Có tùy chọn cấp quyền thông báo trình duyệt (Web Notification API) để nhận thông báo nổi trên desktop khi tab đang mở, với thiết kế toggle rõ ràng trong Cài đặt.

</specifics>

<deferred>
## Deferred Ideas

- **FUTR-01**: Đồng bộ webhook 2 chiều với Jira Cloud (yêu cầu server backend).
- **FUTR-03**: Native Browser Push Notification API với Service Worker Background Sync (thông báo khi đóng hoàn toàn trình duyệt - yêu cầu push service / backend).

</deferred>

---

*Phase: 12-In-App Notifications, Proactive Alerts & Custom Reminders*
*Context gathered: 2026-09-28*
