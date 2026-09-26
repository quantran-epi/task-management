# Phase 3: Capacity Model & Daily Planning Ledger - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-26
**Phase:** 03-capacity-model-daily-planning-ledger
**Areas discussed:** Planner layout, Capacity settings, Allocation flow, Load status rules

---

## Planner Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Weekly grid (Recommended) | Mon-Sun column board / 7-day strip showing capacity header and task allocation cards per day | ✓ |
| Ledger table | Date rows showing capacity bar, total allocated, net balance, expanding to task allocation rows | |
| Split workbench | Left panel shows tasks needing allocation or backlog, right panel shows weekly schedule grid | |

**User's choice:** Weekly grid (Recommended)
**Notes:** User chose weekly grid view style for /#/planner.

| Option | Description | Selected |
|--------|-------------|----------|
| Week nav + Picker (Recommended) | Nút Previous / Next tuần, nút Today quay về hôm nay, DatePicker nhảy tới ngày bất kỳ | ✓ |
| Toggle 7d / 14d | Segmented toggle chuyển view giữa 7-day (1 tuần) và 14-day (2 tuần) liên tục | |
| You decide | Cho bạn tự quyết định cách tiện nhất | |

**User's choice:** Week nav + Picker (Recommended)
**Notes:** Standard weekly navigation with jump picker.

| Option | Description | Selected |
|--------|-------------|----------|
| Header + Task Cards (Recommended) | Header: Thứ + Ngày, Capacity tag, Remaining/Overload badge; Body: Danh sách card task đã allocate; Footer: Nút + Allocate nhanh | ✓ |
| Compact + Day Drawer | Header tối giản, click vào cột ngày mở Drawer/Modal chi tiết để quản lý các task trong ngày | |
| You decide | Cho bạn tự quyết định cấu trúc tối ưu | |

**User's choice:** Header + Task Cards (Recommended)
**Notes:** Comprehensive day column layout.

| Option | Description | Selected |
|--------|-------------|----------|
| Stack on mobile (Recommended) | Desktop: 7 cột ngang Mon-Sun. Mobile (<768px): tự chuyển thành dạng danh sách dọc (vertical stack) các ngày hoặc tab lướt từng ngày | ✓ |
| Horizontal scroll | Giữ nguyên 7 cột ngang trên mọi màn hình, cho phép cuộn ngang (horizontal scroll table) | |
| You decide | Cho bạn tự quyết định breakpoint và style responsive | |

**User's choice:** Stack on mobile (Recommended)
**Notes:** Clean responsive adaptation for mobile viewports.

---

## Capacity Settings

| Option | Description | Selected |
|--------|-------------|----------|
| Settings + Modal (Recommended) | Cấu hình chính tại /#/settings, kèm nút 'Capacity Settings' trên header /#/planner mở Modal chỉnh sửa nhanh | ✓ |
| Only Settings tab | Chỉ đặt trong tab /#/settings, trang /#/planner chỉ dùng để xem và lập kế hoạch | |
| Only Planner Drawer | Đặt toàn bộ trong Drawer cấu hình tại /#/planner, tab /#/settings chỉ giữ mục quản lý database/reset | |

**User's choice:** Settings + Modal (Recommended)
**Notes:** Dual access: durable config in Settings with convenience modal in Planner.

| Option | Description | Selected |
|--------|-------------|----------|
| Hours/Mins + Presets (Recommended) | Mỗi ngày trong tuần có InputNumber cho Giờ (0-24) và Phút (0-59), kèm nút preset tiện lợi (0h, 4h, 8h). Lưu số nguyên phút vào DB | ✓ |
| Decimal Hours input | Chỉ nhập một ô số giờ thập phân (ví dụ: 8, 7.5, 4, 0), tự quy đổi ra phút | |
| You decide | Cho bạn tự quyết định cấu trúc form nhập liệu phù hợp nhất | |

**User's choice:** Hours/Mins + Presets (Recommended)
**Notes:** Matches established duration input patterns from Phase 2.

| Option | Description | Selected |
|--------|-------------|----------|
| Table + Click-to-edit (Recommended) | Bảng quản lý tập trung ở Settings + click nhanh vào Capacity header trên Planner để sửa tại chỗ | ✓ |
| Dedicated Table only | Chỉ quản lý qua bảng danh sách trong Settings/Modal. Planner thuần túy hiển thị kết quả | |

**User's choice:** Table + Click-to-edit (Recommended)
**Notes:** User requested more details before selecting Table + Click-to-edit for quick in-context adjustments.

| Option | Description | Selected |
|--------|-------------|----------|
| Popconfirm + Reset btn (Recommended) | Nút xóa trên bảng có Popconfirm xác nhận, trong popover sửa nhanh có nút 'Reset to Default (8h)'. Xóa xong ngày tự về chuẩn tuần | ✓ |
| Direct delete + Undo | Xóa trực tiếp không cần hỏi xác nhận (cho phép bấm nút Undo nếu lỡ tay) | |
| You decide | Cho bạn tự quyết định trải nghiệm an toàn nhất | |

**User's choice:** Popconfirm + Reset btn (Recommended)
**Notes:** Safe fallback to base weekly template per CAP-04.

---

## Allocation Flow

| Option | Description | Selected |
|--------|-------------|----------|
| Drawer + Planner (Recommended) | Cả hai: Trong Task Drawer (mục Planning xem/sửa các ngày của task) VÀ nút + Allocate trên từng cột ngày ở Planner (chọn task + nhập giờ) | ✓ |
| Only on Planner | Chỉ trên Weekly grid ở Planner: Bấm + Allocate trên từng ngày để gán task vào ngày đó | |
| Only in Task Drawer | Chỉ trong Task Drawer: Quản lý toàn bộ lịch phân bổ của task bên trong drawer chi tiết | |

**User's choice:** Drawer + Planner (Recommended)
**Notes:** Accessible both when managing tasks and when viewing weekly planner.

| Option | Description | Selected |
|--------|-------------|----------|
| Soft warning (Recommended) | Hiển thị rõ: 'Allocated Xh / Est Yh (Còn Zh)'. Cho phép phân bổ vượt estimate nhưng cảnh báo màu cam nhẹ, không chặn cứng | ✓ |
| Hard block | Chặn cứng (Hard validation): Không cho phép tổng allocation vượt quá estimateMinutes của task | |
| You decide | Cho bạn tự quyết định cơ chế validation | |

**User's choice:** Soft warning (Recommended)
**Notes:** Non-blocking warning keeps planning flexible.

| Option | Description | Selected |
|--------|-------------|----------|
| Popover inline edit (Recommended) | Card task có nút sửa nhanh phút/ngày qua Popover và nút xóa kèm Popconfirm (hoặc icon xóa nhanh với thông báo hoàn tất) | ✓ |
| Modal edit | Click vào card mở Modal chi tiết để chỉnh sửa ngày và phút phân bổ | |
| You decide | Cho bạn tự quyết định thao tác chỉnh sửa trực quan nhất | |

**User's choice:** Popover inline edit (Recommended)
**Notes:** Lightweight inline editing on day cards.

| Option | Description | Selected |
|--------|-------------|----------|
| 1 alloc per task/day (Recommended) | Mỗi task có tối đa 1 record allocation trên 1 ngày (nếu gán tiếp vào ngày đó thì cộng dồn/sửa). Gọn gàng, tránh trùng lặp | ✓ |
| Multiple allocs/day | Cho phép nhiều record riêng lẻ cho cùng một task trong một ngày (ví dụ ca sáng 2h, ca chiều 1h) | |
| You decide | Cho bạn tự quyết định thiết kế dữ liệu | |

**User's choice:** 1 alloc per task/day (Recommended)
**Notes:** Clean single record per (task, date).

| Option | Description | Selected |
|--------|-------------|----------|
| Configurable threshold (Recommended) | Cảnh báo khi > 4 tasks/ngày. Hiển thị tag cảnh báo màu cam 'High context switching (N tasks)' trên header ngày. Cho phép cấu hình ngưỡng trong Settings (mặc định 4) | ✓ |
| Fixed threshold (4 tasks) | Cố định ngưỡng 4 hoặc 5 task/ngày (không cần config trong Settings), vượt ngưỡng hiện badge cảnh báo cam trên cột ngày | |
| You decide | Cho bạn tự quyết định ngưỡng và vị trí hiển thị tối ưu | |

**User's choice:** Configurable threshold (Recommended)
**Notes:** Raised by user: handling cognitive overload from too many simultaneous tasks scheduled on one day.

---

## Load Status Rules

| Option | Description | Selected |
|--------|-------------|----------|
| 80-100% Busy (Recommended) | 80% - 100% capacity = Busy. Dưới 80% = Available. Vượt 100% = Overloaded. Dung lượng = 0 = No-Capacity | ✓ |
| 100% exact Busy | Chỉ khi đạt đúng 100% mới là Busy/Full. Dưới 100% đều là Available. Vượt 100% là Overloaded | |
| You decide | Cho bạn tự quyết định ngưỡng tối ưu | |

**User's choice:** 80-100% Busy (Recommended)
**Notes:** Practical buffer range for busy days.

| Option | Description | Selected |
|--------|-------------|----------|
| Tag(Icon+Text) + Bar (Recommended) | Thanh Progress bar kết hợp Tag có Icon + Text rõ ràng (Available: xanh/Check, Busy: cam/Clock, Overloaded: đỏ/Alert, No-Capacity: xám/Minus). Phù hợp WCAG | ✓ |
| Progress bar only | Chỉ dùng thanh Progress bar đổi màu kèm text số giờ, không cần tag trạng thái riêng | |
| You decide | Cho bạn tự quyết định component hiển thị | |

**User's choice:** Tag(Icon+Text) + Bar (Recommended)
**Notes:** Strictly satisfies PLAN-04 and WCAG 2.1 AA accessibility guidelines.

| Option | Description | Selected |
|--------|-------------|----------|
| Toggle show + Muted (Recommended) | Ẩn mặc định để view gọn gàng, có toggle 'Show completed' trên toolbar. Khi bật, card hiển thị mờ (opacity) kèm nhãn 'Done (excluded from load)' | ✓ |
| Always show muted | Luôn hiển thị trên cột ngày dưới dạng nhóm mờ tách biệt ở dưới cùng của cột ngày | |
| You decide | Cho bạn tự quyết định cách trình bày lịch sử | |

**User's choice:** Toggle show + Muted (Recommended)
**Notes:** Fulfills PLAN-05 by preserving historical records while isolating active load.

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit 3 numbers (Recommended) | Hiển thị rõ 3 con số trên Header: Capacity: Xh, Allocated: Yh, Balance: '+Zh remaining' (xanh lá) hoặc '-Zh overload' (đỏ). Minh bạch, dễ theo dõi | ✓ |
| Compact fraction + Tooltip | Rút gọn dạng 'Yh / Xh', rê chuột vào hiển thị Tooltip tính toán chi tiết | |
| You decide | Cho bạn tự quyết định kiểu hiển thị số liệu | |

**User's choice:** Explicit 3 numbers (Recommended)
**Notes:** Transparent daily capacity breakdown.

---

## Claude's Discretion

- Component structuring into focused subcomponents (`DayColumn`, `AllocationCard`, `CapacityModal`, `AllocationDrawerSection`).
- Keyboard navigation shortcuts on weekly board (`Alt+Left` / `Alt+Right` for week switching).
- Dexie repository query patterns and reactive hooks.

## Deferred Ideas

- Drag-and-drop allocation between days (v2 candidate: PROD-05).
- Recurring overrides or shift schedules (v2 candidate).
