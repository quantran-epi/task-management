# Phase 31: Organization Conventions in the Solution Pipeline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-07
**Phase:** 31-organization-conventions-in-the-solution-pipeline
**Areas discussed:** Cấu hình & Lưu trữ Global Convention, Nạp Repo CONVENTIONS qua SSH, Prompt Segment & Xử lý Conflict, Giao diện Intake & Tiêu chí Test Exemplar

---

## Cấu hình & Lưu trữ Global Convention

| Option | Description | Selected |
|--------|-------------|----------|
| Markdown thuần | Cho phép viết Markdown tự do (#, list, table) với editor phong phú kèm preview. | ✓ |
| Cấu trúc chia nhóm có sẵn | Chia thành các danh mục cố định (Naming, Architecture, Database, Security...). | |
| Bạn quyết định | Tùy chọn Claude quyết định. | |

**User's choice:** Markdown thuần (Recommended)
**Notes:** Dễ viết, linh hoạt, trực quan cho quy chuẩn kỹ thuật.

| Option | Description | Selected |
|--------|-------------|----------|
| Card trong tab SDLC / AI Settings | Thêm thẻ Card chuyên biệt "Quy ước tổ chức (Global Conventions)" ngay trong tab SDLC / AI Settings. | ✓ |
| Tab riêng trong trang Settings | Tạo hẳn tab riêng trong trang Cài đặt chung. | |
| Bạn quyết định | Tùy chọn Claude quyết định. | |

**User's choice:** Card trong tab SDLC / AI Settings (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Lưu bảng settings & Backup mã hoá | Lưu vào bảng `settings` trong IndexedDB (key: `global_conventions`), tự động mã hóa và xuất/nhập cùng file backup. | ✓ |
| Bảng riêng kèm lịch sử phiên bản | Tạo bảng riêng `conventions` có lưu lịch sử các phiên bản sửa đổi. | |
| Bạn quyết định | Tùy chọn Claude quyết định. | |

**User's choice:** Lưu bảng settings & Backup mã hoá (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Mẫu chuẩn ngân hàng phong phú | Tự động điền một tài liệu mẫu Markdown thực tế. | |
| Khung sườn tối giản | Chỉ điền khung sườn tiêu đề rỗng. | |
| Để trống hoàn toàn | Để trống hoàn toàn khi mới khởi tạo, người dùng tự nhập quy ước. | ✓ |

**User's choice:** Để trống hoàn toàn (User: "nghĩa là sao, chưa có thì phải nhập chứ tại sao lại tự động điền, tự chế nội dung à")
**Notes:** Người dùng yêu cầu tuyệt đối không tự chế/tự bịa nội dung mẫu; chưa có thì để trống hoàn toàn để người dùng tự nhập.

---

## Nạp Repo CONVENTIONS qua SSH

| Option | Description | Selected |
|--------|-------------|----------|
| Gốc repo (fallback .github/ hoặc docs/) | Ưu tiên tìm `CONVENTIONS.md` ở gốc repo; fallback `.github/CONVENTIONS.md` hoặc `docs/CONVENTIONS.md`. | ✓ |
| Chỉ gốc repo cố định | Chỉ tìm duy nhất tại `<repoPath>/CONVENTIONS.md`. | |
| Cấu hình path tùy biến per-project | Cho phép cấu hình đường dẫn tùy biến. | |

**User's choice:** Gốc repo (fallback .github/ hoặc docs/) (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Native Tauri SSH/SFTP | Dùng native Tauri SSH/SFTP đọc file trực tiếp không cần gateway ngoài. | ✓ |
| HTTP qua fs-gw daemon | Đọc qua HTTP API của local gateway chạy nền port 3000. | |
| Bạn quyết định | Tùy chọn Claude quyết định. | |

**User's choice:** Native Tauri SSH/SFTP (Recommended)
**Notes:** Khớp với kiến trúc desktop native hiện tại của TaskMate.

| Option | Description | Selected |
|--------|-------------|----------|
| Tải lúc mở + Nút Refresh thủ công | Tự động tải khi mở SDLC workspace, lưu tạm kèm timestamp và nút Refresh thủ công. | ✓ |
| Đọc trực tiếp mỗi turn | Luôn đọc trực tiếp qua SSH trên mỗi lượt chat. | |
| Chỉ nạp thủ công bằng nút bấm | Chỉ đọc khi người dùng bấm nút nạp. | |

**User's choice:** Tải lúc mở + Nút Refresh thủ công (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Bỏ qua êm ái kèm thông báo | Hiển thị thông báo repo không có file hoặc mất kết nối SSH, pipeline tiếp tục với Global. | ✓ |
| Chặn cứng luồng khi có liên kết repo | Bắt buộc phải có file mới cho tiếp tục. | |
| Bạn quyết định | Tùy chọn Claude quyết định. | |

**User's choice:** Bỏ qua êm ái kèm thông báo (Recommended)

---

## Prompt Segment & Xử lý Conflict

| Option | Description | Selected |
|--------|-------------|----------|
| Segment riêng trước Grounding | Đặt sau Tool Policy và trước Grounding, bọc khung `[QUY ƯỚC TỔ CHỨC — DỮ LIỆU KHÔNG TIN CẬY]`. | ✓ |
| Gộp vào Grounding chung | Gộp chung vào khối Grounding hiện tại cùng PL01/PL02. | |
| Bạn quyết định | Tùy chọn Claude quyết định. | |

**User's choice:** Segment riêng trước Grounding (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Bắt buộc nêu rõ xung đột & 2 nguồn | AI phải chỉ rõ mâu thuẫn, nêu rõ nguồn từng bên và không được tự ý chọn 1 bên. | ✓ |
| Repo ghi đè Global kèm chú thích | Repo Convention ghi đè Global có chú thích. | |
| Global ghi đè Repo | Global ghi đè Repo. | |

**User's choice:** Bắt buộc nêu rõ xung đột & 2 nguồn (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Giới hạn an toàn kèm cảnh báo cắt bớt | Giới hạn dung lượng tối đa và cắt bớt nếu vượt quá. | |
| Không giới hạn độ dài | Không giới hạn, đưa toàn bộ nội dung file vào prompt. | ✓ |
| Bạn quyết định | Tùy chọn Claude quyết định. | |

**User's choice:** Không giới hạn độ dài

---

## Giao diện Intake & Tiêu chí Test Exemplar

| Option | Description | Selected |
|--------|-------------|----------|
| Panel/Card tóm tắt trạng thái | Panel/Card tóm tắt "Quy ước áp dụng" tại Step 1 và Step 2. | ✓ |
| Tag/Badge nhỏ gọn trên Header kèm Drawer | Chỉ hiển thị tag nhỏ trên header click mở Drawer. | |
| Bạn quyết định | Tùy chọn Claude quyết định. | |

**User's choice:** Panel/Card tóm tắt trạng thái (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Chuẩn API ResponseEnvelope & Logging | Quy định API ResponseEnvelope<T> và log correlationId làm exemplar test. | ✓ |
| Quy tắc đặt tên DB & Audit columns | Quy tắc đặt tên bảng và audit columns. | |
| Bạn quyết định | Tùy chọn Claude quyết định. | |

**User's choice:** Chuẩn API ResponseEnvelope & Logging (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Log Level / Naming Case conflict | Xung đột Log Level (INFO vs DEBUG) hoặc Naming Case làm ca kiểm thử witness. | ✓ |
| Kiến trúc tích hợp Kafka vs REST | Kafka vs REST. | |
| Bạn quyết định | Tùy chọn Claude quyết định. | |

**User's choice:** Log Level / Naming Case conflict (Recommended)

---

## Claude's Discretion

- Chi tiết thiết kế giao diện Card trong Settings (Ant Design Form, Typography, Markdown Preview Modal).
- Cú pháp lệnh SSH kiểm tra sự tồn tại của file (`test -f ...`) trước khi fetch nội dung để tối ưu tốc độ kết nối.
- Icon và định dạng badge hiển thị trong Panel tóm tắt quy ước tại Step 1 và Step 2.

## Deferred Ideas

None — discussion remained strictly focused on Phase 31 scope. External research via Claude Code headless is scoped for Phase 32; prompt transparency view is scoped for Phase 33.
