# Quick Task Plan: Reminder Drawer Complete & Context Menu Quick Add

## Objective
1. Thêm nút "Đã xong" (hoàn tất nhắc nhở, xóa reminder đã kích hoạt khỏi entity) trên Notification Drawer.
2. Thêm action "Thêm nhắc nhở" (Quick Add Reminder) vào context menu của TaskTable và ProjectTable.

## Technical Details

### 1. Complete Reminder in Notification Drawer
- Trong `NotificationItemRow.tsx` (hoặc callback handler `onCompleteReminder`):
  - Khi `item.category === 'reminder'`:
    - Alert key dạng: `reminder:task:<taskId>:<reminderId>` hoặc `reminder:task:<taskId>` (legacy)
    - Tương tự với `project` và `milestone`.
    - Thêm nút check "Đã xong" (`CheckOutlined` hoặc button icon).
    - Khi click: Gỡ bỏ reminder tương ứng khỏi entity trong IndexedDB (`taskRepo`, `projectRepo`, `milestoneRepo`). Thông báo toast "Đã hoàn thành nhắc nhở".
  - Với task thông thường trong notification: Checkbox hoàn thành task vẫn giữ nguyên.

### 2. Quick Add Reminder via Context Menu
- Tạo component `QuickReminderModal`:
  - Input: entity (`task` hoặc `project`), open, onClose, onSubmit.
  - Form: Ngày (`DatePicker`, mặc định hôm nay hoặc ngày mai), Giờ (`TimePicker` tuỳ chọn), Ghi chú (`Input` note tuỳ chọn).
  - Thêm một `ReminderItem` vào mảng `reminders` của entity và gọi `updateTask` / `updateProject`.
- Tích hợp vào `TaskTable.tsx`:
  - Thêm item `add-reminder` với icon `BellOutlined` vào `getTaskMenuItems`.
  - Mở `QuickReminderModal` khi click.
- Tích hợp vào `ProjectTable.tsx`:
  - Thêm item `add-reminder` với icon `BellOutlined` vào `getProjectMenuItems`.
  - Mở `QuickReminderModal` khi click.

## Verification
- Unit test / component test cho việc hoàn thành reminder và thêm reminder nhanh.
- Chạy `npm test` để đảm bảo test suite pass.
