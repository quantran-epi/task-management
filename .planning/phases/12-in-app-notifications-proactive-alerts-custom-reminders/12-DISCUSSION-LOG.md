# Phase 12: In-App Notifications, Proactive Alerts & Custom Reminders - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-28
**Phase:** 12-In-App Notifications, Proactive Alerts & Custom Reminders
**Areas discussed:** Drawer & Phân loại, Nhắc nhở tùy chỉnh, Quy tắc quá tải & ứ đọng, Dismiss & Snooze, Thông báo trình duyệt cục bộ

---

## Drawer & Phân loại

### Q1: Thông báo trong Drawer nên được trình bày theo bố cục nào?

| Option | Description | Selected |
|--------|-------------|----------|
| Tabs phân loại | Chia Tabs: 'Tất cả', 'Quá hạn & Đến hạn', 'Quá tải công suất', 'Ứ đọng', 'Nhắc nhở'. Dễ xem khi nhiều cảnh báo. | ✓ |
| Danh sách nhóm 1 trang | Danh sách cuộn 1 trang, chia từng nhóm bằng Header hoặc Accordion/Collapse. | |
| Danh sách phẳng + Tag lọc | Danh sách phẳng kèm các nút Tag lọc nhanh ở phía trên. | |

**User's choice:** Tabs phân loại (Recommended)

### Q2: Icon và Badge thông báo trên thanh Header hiển thị thế nào?

| Option | Description | Selected |
|--------|-------------|----------|
| Chuông + Số đếm đỏ | Icon Chuông với Badge đỏ hiển thị tổng số cảnh báo đang hoạt động. Nằm trên AppHeader cạnh StatusBadge. | ✓ |
| Badge đổi màu theo mức độ | Màu badge linh hoạt: Đỏ (nếu có việc quá hạn/quá tải), Vàng (sắp đến hạn/ứ đọng), Xanh (nhắc nhở). | |
| Chấm đỏ (dot) tối giản | Chỉ hiện chấm đỏ (dot) khi có cảnh báo, không hiện con số cụ thể. | |

**User's choice:** Chuông + Số đếm đỏ (Recommended)

### Q3: Khi người dùng nhấp vào một dòng thông báo, hệ thống xử lý ra sao?

| Option | Description | Selected |
|--------|-------------|----------|
| Mở chi tiết Item | Mở ngay TaskDrawer hoặc Project/Milestone Modal để người dùng xem và xử lý lập tức. Tự động đóng Drawer thông báo. | ✓ |
| Chuyển trang tương ứng | Chuyển route đến trang liên quan (TasksView, PlannerView, ProjectsView) và cuộn đến mục đó. | |
| Bạn quyết định | Bạn quyết định phương án tiện nhất theo kiến trúc hiện tại. | |

**User's choice:** Mở chi tiết Item (Recommended)

### Q4: Có hỗ trợ thao tác nhanh (Quick Action) trực tiếp trong Drawer không?

| Option | Description | Selected |
|--------|-------------|----------|
| Checkbox hoàn thành nhanh | Có checkbox đánh dấu Hoàn thành (Done) cho task ngay trên dòng thông báo (giống AttentionTodayList). | ✓ |
| Chỉ xem, không sửa tại chỗ | Chỉ hiển thị đọc thông tin, muốn thao tác phải mở chi tiết Task/Project. | |

**User's choice:** Checkbox hoàn thành nhanh (Recommended)

---

## Nhắc nhở tùy chỉnh

### Q1: Mô hình dữ liệu lưu trữ Reminder trên Project, Milestone, Task nên thiết kế thế nào?

| Option | Description | Selected |
|--------|-------------|----------|
| Trường trực tiếp + Index v4 | Bổ sung reminderDate (YYYY-MM-DD) và reminderNote (string) vào Project, Milestone, Task; nâng schema v4 index reminderDate. Dữ liệu đi kèm backup json. | ✓ |
| Bảng riêng reminders | Tạo bảng riêng 'reminders' (id, targetType, targetId, date, note) trong IndexedDB. | |
| Chỉ thêm reminderDate | Chỉ lưu reminderDate, tận dụng notes sẵn có làm nội dung nhắc nhở. | |

**User's choice:** Trường trực tiếp + Index v4 (Recommended)

### Q2: Điều kiện để một Custom Reminder được coi là 'Đang kích hoạt' (Active Alert)?

| Option | Description | Selected |
|--------|-------------|----------|
| Từ ngày nhắc đến khi Done | Cảnh báo hiển thị khi ngày hiện tại >= reminderDate VÀ item chưa Done/Cancelled. Giúp không bị bỏ lỡ nếu ngày đó quên mở app. | ✓ |
| Chỉ hiển thị đúng ngày | Chỉ hiển thị đúng vào ngày nhắc (currentDate === reminderDate). Qua ngày đó tự hết. | |
| Trước 1 ngày + đến khi Done | Hiển thị sớm trước 1 ngày để chuẩn bị và kéo dài đến khi hoàn thành. | |

**User's choice:** Từ ngày nhắc đến khi Done (Recommended)

### Q3: Vị trí nhập Reminder trên giao diện tạo/sửa Project, Milestone và TaskDrawer?

| Option | Description | Selected |
|--------|-------------|----------|
| Fields trực tiếp trong Form | Thêm field 'Ngày nhắc nhở' (DatePicker) & 'Ghi chú nhắc nhở' (Input) trực tiếp vào form ProjectModal, MilestoneModal, TaskDrawer. Đơn giản, tự nhiên. | ✓ |
| Icon Chuông Popover riêng | Nút icon Chuông ở góc form/header, bấm vào mở Popover/Modal phụ để cài đặt nhắc nhở. | |
| Bạn quyết định | Bạn quyết định phương án gọn gàng nhất. | |

**User's choice:** Fields trực tiếp trong Form (Recommended)

### Q4: Cách hủy hoặc kết thúc một nhắc nhở tùy chỉnh diễn ra như thế nào?

| Option | Description | Selected |
|--------|-------------|----------|
| Tự tắt khi Done hoặc xóa date | Tự động biến mất khỏi Alert khi item hoàn thành (Done/Cancelled), hoặc người dùng xóa trắng trường reminderDate trong form. | ✓ |
| Nút tắt 1-click trong Alert Drawer | Thêm nút 'Tắt nhắc nhở' ngay trong Drawer thông báo để gỡ reminderDate của task chỉ bằng 1-click. | |

**User's choice:** Tự tắt khi Done hoặc xóa date (Recommended)

---

## Quy tắc quá tải & ứ đọng

### Q1: Phạm vi ngày nào nên được quét để phát hiện Quá tải công suất (>100% capacity)?

| Option | Description | Selected |
|--------|-------------|----------|
| 14 ngày tới | Quét từ ngày hiện tại đến 14 ngày tới (2 tuần làm việc / sprint). Đủ xa để cảnh báo điều phối mà nhẹ hiệu năng. | ✓ |
| 7 ngày tới | Quét 7 ngày tới (tập trung tuần làm việc hiện tại). | |
| 30 ngày tới | Quét 30 ngày tới (toàn bộ tháng tới). | |

**User's choice:** 14 ngày tới (Recommended)

### Q2: Khi nhấp vào một cảnh báo Quá tải công suất, giao diện phản hồi thế nào?

| Option | Description | Selected |
|--------|-------------|----------|
| Mở PlannerView đúng ngày | Hiển thị ngày, tỷ lệ quá tải (VD: 10h/8h - 125%), danh sách task trong ngày. Nhấp vào mở PlannerView chuyển đến đúng ngày đó. | ✓ |
| Modal sửa phân bổ nhanh | Mở Modal tóm tắt phân bổ của ngày đó để điều chỉnh giờ trực tiếp. | |
| Bạn quyết định | Bạn quyết định phương án tiện nhất. | |

**User's choice:** Mở PlannerView đúng ngày (Recommended)

### Q3: Quy tắc xác định 'không có hoạt động trong hơn 5 ngày' cho Tác vụ ứ đọng (Stale Task)?

| Option | Description | Selected |
|--------|-------------|----------|
| Dựa trên updatedAt > 5 ngày | Status là 'In Progress' hoặc 'In Review' VÀ (now - updatedAt) > 5 ngày. Mọi chỉnh sửa task đều cập nhật updatedAt tự nhiên. | ✓ |
| Thêm trường statusChangedAt | Thêm trường riêng statusChangedAt, chỉ đếm thời gian kể từ lúc chuyển trạng thái mà không quan tâm cập nhật khác. | |

**User's choice:** Dựa trên updatedAt > 5 ngày (Recommended)

### Q4: Thứ tự sắp xếp các mục thông báo trong tab 'Tất cả' ưu tiên thế nào?

| Option | Description | Selected |
|--------|-------------|----------|
| Theo độ nghiêm trọng | 1. Quá hạn -> 2. Quá tải công suất -> 3. Đến hạn hôm nay/mai -> 4. Ứ đọng (>5 ngày) -> 5. Nhắc nhở tùy chỉnh. | ✓ |
| Mới nhất lên đầu | Xếp theo thời gian gần nhất (mới nhất lên đầu). | |
| Theo Priority của Task | Nhóm theo Task Priority (Urgent -> High -> Medium -> Low). | |

**User's choice:** Theo độ nghiêm trọng (Recommended)

---

## Dismiss & Snooze

### Q1: Cảnh báo có hỗ trợ cơ chế Ẩn/Bỏ qua (Dismiss) hoặc Hoãn (Snooze) không?

| Option | Description | Selected |
|--------|-------------|----------|
| Hỗ trợ Dismiss lưu settings | Hỗ trợ Bỏ qua (Dismiss) một số cảnh báo: lưu ID đã dismiss trong IndexedDB settings, tránh làm phiền liên tục. | ✓ |
| Tính động 100%, không Dismiss | Tính toán động 100% (Pure Derived State): Chỉ biến mất khi đã xử lý gốc rễ dữ liệu (đổi deadline, Done, dời giờ). Tránh việc bấm ẩn rồi quên. | |
| Hỗ trợ Snooze hoãn ngày | Hỗ trợ Hoãn (Snooze) thêm 1 ngày / 3 ngày. | |

**User's choice:** Hỗ trợ Dismiss lưu settings (Recommended)

### Q2: Loại cảnh báo nào được phép Ẩn/Bỏ qua (Dismiss)?

| Option | Description | Selected |
|--------|-------------|----------|
| Chỉ dismiss việc ứ đọng/nhắc nhở | Cảnh báo nghiêm trọng (Quá hạn, Quá tải) KHÔNG cho dismiss, bắt buộc phải xử lý dữ liệu. Chỉ cho Dismiss việc ứ đọng và nhắc nhở. | ✓ |
| Cho phép Dismiss tất cả | Cho phép Dismiss bất kỳ cảnh báo nào trong danh sách. | |
| Không loại nào | Không áp dụng Dismiss cho loại nào cả (thuần derived state). | |

**User's choice:** Chỉ dismiss việc ứ đọng/nhắc nhở (Recommended)

### Q3: Khi người dùng bấm Bỏ qua (Dismiss), hiệu lực ẩn kéo dài bao lâu?

| Option | Description | Selected |
|--------|-------------|----------|
| Hết ngày tự nhắc lại | Ẩn cho đến hết ngày hiện tại (qua ngày mới nếu vấn đề chưa giải quyết sẽ nhắc lại). Đảm bảo không bị lãng quên. | ✓ |
| Ẩn đến khi có update mới | Ẩn vĩnh viễn cho đến khi item có cập nhật dữ liệu mới. | |
| Chỉ trong phiên làm việc | Chỉ ẩn trong phiên làm việc hiện tại (session/in-memory, tải lại trang sẽ hiện lại). | |

**User's choice:** Hết ngày tự nhắc lại (Recommended)

### Q4: Có nên cung cấp nút 'Bỏ qua tất cả' (Dismiss All / Clear All) trong Drawer không?

| Option | Description | Selected |
|--------|-------------|----------|
| Không có Clear All | Không làm nút 'Ẩn tất cả' (Clear All) để tránh thói quen bấm tiện tay rồi bỏ sót việc quan trọng của cá nhân. | ✓ |
| Có nút Bỏ qua tất cả | Có nút 'Bỏ qua tất cả' ở góc trên Drawer (chỉ áp dụng cho các mục được phép dismiss). | |
| Bạn quyết định | Bạn quyết định phương án an toàn nhất. | |

**User's choice:** Không có Clear All (Recommended)

---

## Thông báo Trình duyệt Cục bộ (Local Browser Desktop Notifications)

### Q1: Về Browser Push Notification: Giữ thuần In-App hay thêm thông báo trình duyệt cục bộ?

| Option | Description | Selected |
|--------|-------------|----------|
| Chỉ In-App, Browser Push để sau | Đúng theo ROADMAP & REQUIREMENTS.md: Tập trung hoàn thiện In-App Alert (Chuông, Badge, Drawer). Browser Push lưu vào Backlog (FUTR-03). | |
| Thêm thông báo trình duyệt cục bộ | Bổ sung thêm Web Notification API cục bộ (chỉ kích hoạt khi tab đang mở, yêu cầu người dùng cấp quyền Notification). | ✓ |

**User's choice:** Thêm thông báo trình duyệt cục bộ

### Q2: Cơ chế cấp quyền và kích hoạt thông báo trình duyệt cục bộ nên như thế nào?

| Option | Description | Selected |
|--------|-------------|----------|
| Toggle trong Cài đặt + Báo tóm tắt | Có nút toggle 'Bật thông báo trình duyệt' trong Cài đặt / Drawer (mặc định tắt). Khi bật, xin quyền Notification.permission và chỉ bắn 1 thông báo tóm tắt khi mở app nếu có việc khẩn. | ✓ |
| Tự xin quyền ngay từ đầu | Tự động hỏi xin quyền ngay lần đầu vào app và bắn thông báo mỗi khi phát hiện cảnh báo mới. | |

**User's choice:** Toggle trong Cài đặt + Báo tóm tắt (Recommended)

---

## Claude's Discretion

- Chiều rộng Drawer: Khoảng 420px trên màn hình desktop, 100% trên thiết bị di động (mobile breakpoint).
- Icon và màu sắc Tag nhận diện cho từng loại thông báo (Quá hạn: Error/Đỏ, Quá tải: Warning/Cam, Đến hạn: Processing/Xanh dương, Ứ đọng: Purple, Nhắc nhở: Gold/Cyan).
- Xử lý âm thanh/rung: Giữ thông báo tĩnh, không phát âm thanh.

## Deferred Ideas

- **FUTR-01**: Webhook 2 chiều với Jira Cloud.
- **FUTR-03**: Native Browser Push Notification API với Service Worker Background Sync khi đóng tab/trình duyệt.
