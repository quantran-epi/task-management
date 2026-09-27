# Phase 6: Safe Local Backup & Restore - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-27
**Phase:** 6-Safe Local Backup & Restore
**Areas discussed:** Backup Envelope & Format, Import Preview & Validation, Snapshot & Rollback Flow, Confirmation & Status Feedback

---

## Backup Envelope & Format

### Question 1: Envelope Structure (BACK-01, BACK-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Standard Envelope | `{ app: 'personal-task-planner', schemaVersion: 1, exportedAt: 'ISO', tables: { ... }, counts: { ... } }`. Dễ kiểm tra app marker và counts trước khi parse sâu. | ✓ |
| Envelope + SHA-256 Checksum | Thêm trường checksum SHA-256 của payload để phát hiện tệp hỏng/bị chỉnh sửa dở dang ngay từ đầu. | |
| Flat Dump | Chỉ lưu `{ version: 1, projects, tasks, ... }` trực tiếp, không bọc metadata riêng. Nhẹ hơn nhưng khó preview nhanh. | |

**User's choice:** Standard Envelope (Recommended)
**Notes:** Provides metadata block enabling fast preview without reading all records.

### Question 2: Scope of Backup Data (BACK-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Domain Data Only | Chỉ xuất 6 bảng dữ liệu nghiệp vụ: projects, milestones, tasks, capacityRules, capacityOverrides, plannedAllocations. Giữ nguyên cấu hình giao diện (theme, preferences) hiện tại của trình duyệt. | ✓ |
| Full Database Dump | Xuất tất cả bảng bao gồm cả settings (themeMode, UI prefs). Khôi phục sẽ đồng bộ luôn cả giao diện. | |
| Domain + Whitelisted Settings | Chỉ bao gồm domain data và các settings được chọn lọc rõ ràng, loại trừ các thiết lập tạm thời của thiết bị. | |

**User's choice:** Domain Data Only (Recommended)
**Notes:** Prevents local UI preferences from being clobbered across different devices.

### Question 3: Download Naming Convention (BACK-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Timestamped Date-Time | `task-planner-backup-YYYY-MM-DD-HHmmss.json`. Tránh trùng tên khi tải về nhiều lần trong ngày, dễ sắp xếp theo thời gian. | ✓ |
| Date Only | `task-planner-backup-YYYY-MM-DD.json`. | |
| Versioned Date | `task-planner-v1-backup-YYYY-MM-DD.json`. | |

**User's choice:** Timestamped Date-Time (Recommended)
**Notes:** Unique per export, avoids browser download collisions.

### Question 4: Backup History Logging (BACK-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Log to backupMetadata | Ghi 1 bản ghi vào bảng backupMetadata (id, timestamp, appVersion, recordCount) để hiển thị "Lần sao lưu gần nhất" trên trang Cài đặt. Không bao gồm bảng này trong payload xuất. | ✓ |
| Silent Export (No DB Write) | Chỉ tạo và tải tệp JSON về máy, không ghi thêm bản ghi nào vào IndexedDB. | |
| Store in Settings Key | Lưu timestamp lần xuất gần nhất vào localStorage/Setting key thay vì bảng backupMetadata riêng. | |

**User's choice:** Log to backupMetadata (Recommended)
**Notes:** Leverages existing `backupMetadata` table in schema.

---

## Import Preview & Validation

### Question 1: Pre-import Preview UI (BACK-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Modal with Comparison Table | Mở Modal hiển thị metadata (app marker, schemaVersion, exportedAt) kèm bảng so sánh trực quan số lượng bản ghi từng bảng: [Hiện tại trong DB] vs [Tệp nhập vào] và biến động (+/-). Dễ phát hiện bất thường trước khi ghi đè. | ✓ |
| Inline Card Preview | Hiển thị thẻ Card xem trước ngay bên dưới khu vực tải tệp trên trang Cài đặt, không dùng Modal. | |
| Compact Summary Alert | Chỉ hiện hộp thoại tóm tắt ngắn gọn tổng số bản ghi và thời gian tạo, không có bảng chi tiết từng danh mục. | |

**User's choice:** Modal with Comparison Table (Recommended)
**Notes:** User emphasized: manual import is a fallback when auto sync is not working. The backup and sync core architecture should support seamless auto-backup/auto-sync behavior like an app with a backend.

### Question 2: Validation Failure Handling (BACK-03, BACK-05)

| Option | Description | Selected |
|--------|-------------|----------|
| Strict All-or-Nothing with Detailed List | Dùng Zod schema + kiểm tra toàn vẹn tham chiếu (foreign key: projectId, milestoneId). Có bất kỳ lỗi nào sẽ CHẶN restore hoàn toàn, hiển thị chi tiết vị trí và nội dung lỗi (bảng, ID, trường vi phạm) để bảo vệ DB tuyệt đối. | ✓ |
| Strict with Summary Alert Only | Chặn restore nếu có lỗi, nhưng chỉ hiển thị thông báo tóm tắt tổng số lỗi. | |
| Sanitize Orphans with Warning | Cho phép tự động loại bỏ liên kết hỏng và cảnh báo vàng. | |

**User's choice:** Strict All-or-Nothing with Detailed List (Recommended)
**Notes:** Absolute data integrity protection. Zero risk of corrupted state.

### Question 3: App Marker & Schema Version Compatibility (BACK-02, BACK-05)

| Option | Description | Selected |
|--------|-------------|----------|
| Strict Marker + Version Migration | Bắt buộc kiểm tra app marker ('personal-task-planner'). Nếu app marker sai -> từ chối ngay. Nếu schemaVersion > phiên bản hiện tại -> báo lỗi yêu cầu nâng cấp ứng dụng. Nếu schemaVersion cũ hơn -> hỗ trợ migration. | ✓ |
| Exact Version Match Only | Chỉ chấp nhận duy nhất tệp có đúng schemaVersion hiện tại (= 1), từ chối tất cả phiên bản khác. | |
| Duck Typing Verification | Chỉ kiểm tra cấu trúc dữ liệu bảng (duck typing), không phụ thuộc vào chuỗi định danh app marker. | |

**User's choice:** Strict Marker + Version Migration (Recommended)
**Notes:** Forward-compatible and safe against non-app JSON files.

### Question 4: Upload Interaction & Size Limit (BACK-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Dragger + File Picker (50MB cap) | Dùng vùng kéo thả Ant Design Upload.Dragger kết hợp nút duyệt tệp, chấp nhận tệp .json tối đa 50MB. Đọc và chạy kiểm tra xác thực bất đồng bộ ngay khi chọn tệp. | ✓ |
| Simple Button Picker | Chỉ cung cấp nút bấm đơn giản 'Chọn tệp sao lưu...' gọi native file picker. | |
| File Picker + JSON Paste Box | Hỗ trợ cả tải tệp JSON và dán trực tiếp nội dung chuỗi JSON qua Textarea. | |

**User's choice:** Dragger + File Picker (50MB cap) (Recommended)
**Notes:** Fast UX with clear drag-and-drop feedback.

---

## Snapshot & Rollback Flow

### Question 1: Snapshot Storage Location (BACK-04)

| Option | Description | Selected |
|--------|-------------|----------|
| IndexedDB + Optional Download | Lưu snapshot vào IndexedDB (bảng settings/backupMetadata) và cung cấp tùy chọn tải tệp snapshot về máy. Tự động, liền mạch như có backend, vừa có dự phòng ngoại tuyến. | ✓ |
| IndexedDB Only | Chỉ lưu ngầm bên trong IndexedDB, không sinh tệp tải về. | |
| Auto-download File Only | Tự động kích hoạt tải tệp JSON snapshot về máy tính trước khi cho phép ghi đè dữ liệu. | |

**User's choice:** IndexedDB + Optional Download (Recommended)
**Notes:** In-browser seamless restore plus export option for safety.

### Question 2: Snapshot Retention Policy (BACK-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Single Latest Snapshot | Chỉ lưu 1 bản snapshot gần nhất (Latest Snapshot). Mỗi lần restore mới sẽ thay thế bản snapshot trước đó. Gọn nhẹ, tránh phình to IndexedDB, đủ hoàn tác ngay khi phát hiện nhầm. | ✓ |
| Rolling 3 Snapshots | Lưu xoay vòng tối đa 3 bản snapshot gần nhất với timestamp cụ thể. | |
| Keep All with Manual Delete | Lưu tất cả các lần snapshot, hiển thị danh sách cho phép xóa thủ công. | |

**User's choice:** Single Latest Snapshot (Recommended)
**Notes:** Low overhead, zero maintenance, sufficient for immediate undo.

### Question 3: Rollback UI Placement (BACK-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Banner & Settings Card | Sau khi restore, hiển thị Alert thông báo thành công kèm nút bấm 'Hoàn tác về bản trước đó' và 'Tải tệp snapshot'. Đồng thời trong trang Cài đặt luôn có thẻ hiển thị bản snapshot gần nhất để hoàn tác bất kỳ lúc nào. | ✓ |
| Settings Card Only | Chỉ hiển thị nút khôi phục snapshot trong khu vực Cài đặt sao lưu. | |
| Dedicated Drawer | Mở một Drawer riêng biệt liệt kê chi tiết snapshot. | |

**User's choice:** Banner & Settings Card (Recommended)
**Notes:** Immediate post-restore action plus persistent access in settings.

### Question 4: Atomic Restore & Failure Protection (BACK-05)

| Option | Description | Selected |
|--------|-------------|----------|
| Single Dexie Transaction | Bọc toàn bộ quá trình (lưu snapshot, xóa dữ liệu cũ, ghi dữ liệu mới vào 6 bảng) trong 1 Dexie transaction 'rw' duy nhất. Nếu có bất kỳ lỗi nào, IndexedDB tự động rollback về trạng thái ban đầu mà không làm biến đổi DB. | ✓ |
| Two-Phase Commit with Snapshot First | Lưu snapshot vào DB trước trong 1 transaction độc lập, sau đó mới thực hiện ghi đè ở transaction thứ hai. | |
| Sequential Per-Table Write | Xóa và thêm từng bảng tuần tự mà không bọc transaction chung. | |

**User's choice:** Single Dexie Transaction (Recommended)
**Notes:** Atomic guarantee via browser transaction rollback.

---

## Confirmation & Status Feedback

### Question 1: Explicit Confirmation Mechanism (BACK-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Type 'RESTORE' Keyword | Yêu cầu nhập từ khóa 'RESTORE' vào ô input (nhất quán với mẫu ResetDbModal đã có trong app). Nút 'Xác nhận khôi phục' (danger) chỉ kích hoạt khi nhập đúng. | ✓ |
| Checkbox Confirmation | Đánh dấu vào ô kiểm 'Tôi hiểu toàn bộ dữ liệu hiện tại sẽ bị thay thế'. | |
| Simple Confirm Dialog | Chỉ dùng hộp thoại Modal xác nhận đơn giản với nút Đồng ý / Hủy. | |

**User's choice:** Type 'RESTORE' Keyword (Recommended)
**Notes:** Matches existing `ResetDbModal` safety pattern in the project.

### Question 2: Post-restore UI Update (UX-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Reactive Live Update | Tận dụng useLiveQuery của Dexie: giao diện tự động cập nhật ngay lập tức mà không cần reload trang. Hiển thị notification.success chi tiết số bản ghi. Mượt mà, liền mạch như app có backend. | ✓ |
| Hard Page Reload | Tự động gọi window.location.reload(). | |
| Prompt Reload Choice | Hỏi người dùng có muốn tải lại trang hay tiếp tục làm việc. | |

**User's choice:** Reactive Live Update (Recommended)
**Notes:** Smooth SPA experience, Dexie live queries handle view reactivity.

### Question 3: Assistive Technology & Status Regions (UX-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Notification + aria-live Region | Kết hợp Ant Design notification hiển thị trực quan và một vùng aria-live="polite" (role="status") để thông báo kết quả chi tiết cho công nghệ trợ năng (trình đọc màn hình). | ✓ |
| Standard Ant Design Toasts | Chỉ sử dụng Ant Design notification/message mặc định. | |
| Fixed Alert Banner | Chỉ sử dụng thanh Alert banner cố định trên đầu trang. | |

**User's choice:** Notification + aria-live Region (Recommended)
**Notes:** Meets WCAG 2.1 and requirement UX-04.

### Question 4: Settings View Organization (UX-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Two-Tab Settings Layout | Dùng Ant Design Tabs chia trang Cài đặt thành 2 tab: 'Công suất làm việc' và 'Sao lưu & Dữ liệu' (gồm Xuất, Nhập, Quản lý Snapshot, Đặt lại DB). Gọn gàng, dễ quản lý. | ✓ |
| Single Scrollable Page | Xếp chồng tất cả các Card cấu hình và sao lưu nối tiếp nhau trên một trang cuộn dài. | |
| New Sidebar Menu Item | Tạo thêm một mục điều hướng riêng biệt trên Sidebar cho chức năng 'Sao lưu & Phục hồi'. | |

**User's choice:** Two-Tab Settings Layout (Recommended)
**Notes:** Clean separation of concerns without cluttering the sidebar.

---

## Claude's Discretion

- Styling tokens, comparison badge colors, and progress indicators during upload/import processing.
- Formatting of error table rows in validation failure display.

## Deferred Ideas

- **PROD-04:** Selective merge import (v2).
- **Phase 8:** Encrypted GitHub Contents API sync.
