---
phase: 31
slug: organization-conventions-in-the-solution-pipeline
status: draft
shadcn_initialized: false
preset: none
created: 2026-11-07
---

# Phase 31 — UI Design Contract: Organization Conventions in the Solution Pipeline

> Hợp đồng thiết kế giao diện và tương tác cho Phase 31: Quy ước tổ chức trong pipeline giải pháp SDLC. Tạo bởi gsd-ui-researcher, xác thực bởi gsd-ui-checker.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none |
| Preset | not applicable |
| Component library | Ant Design 6.6.5 |
| Icon library | @ant-design/icons 6.3.4 |
| Font | "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif |

---

## Spacing Scale

Declared values (chuẩn 8-point scale, tất cả là bội số của 4):

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Gaps giữa icon và text, padding nhãn inline, badge padding |
| sm | 8px | Khoảng cách phần tử nhỏ, spacing giữa các nút phụ trong toolbar |
| md | 16px | Khoảng cách mặc định form items, card inner padding chuẩn |
| lg | 24px | Section padding, khoảng cách giữa các khối lớn trong view |
| xl | 32px | Layout gaps giữa các container chính |
| 2xl | 48px | Phân cách khối cấp trang |
| 3xl | 64px | Page-level spacing lớn nhất |

Exceptions (tất cả là bội số của 4):
- 8px: Spacing giữa các nút điều hướng trong toolbar của Step 1 & Step 2.
- 12px: Spacing dọc trong Modal chi tiết quy ước và khoảng cách compact giữa các dòng thông tin.
- 16px: Khoảng cách chia đôi pane soạn thảo/xem trước trong Step 2.
- 24px: Chiều cao statusbar của workbench frame.
- 36px: Chiều rộng stripe và tabbar của workbench frame.
- 40px: Chiều cao titlebar của workbench frame.

---

## Typography

Khai báo đúng 4 kích thước (font sizes) chuẩn phân cấp rõ ràng và 2 mức trọng lượng (weights):

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Label | 12px | 400 | 1.4 |
| Body | 14px | 400 | 1.5 |
| Subheading | 16px | 600 | 1.4 |
| Heading | 18px | 600 | 1.3 |

Ghi chú:
- Font weights chỉ dùng 2 mức: 400 (Regular) cho Body/Label và 600 (Semibold) cho Subheading/Heading.
- Textarea soạn thảo Markdown dùng font monospace (14px, line-height 1.5, font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace).

---

## Color

Tỷ lệ phân bổ màu 60-30-10:

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `#ffffff` / `#e9eaee` | Nền ứng dụng chính (`#ffffff`), nền frame workbench (`#e9eaee`), nền card container |
| Secondary (30%) | `#fafbfc` / `#f7f8fa` | Thẻ card cấu hình (`#ffffff` viền `#d1d3d9`), panel tóm tắt quy ước (`#fafbfc`), background input readonly (`#f7f8fa`) |
| Accent (10%) | `#3871e1` | Chỉ dành cho các thành phần cụ thể bên dưới |
| Destructive | `#c54e58` | Nút xóa trắng nội dung quy ước, tag cảnh báo lỗi kết nối SSH, thông báo xung đột không giải quyết được |

Accent reserved for:
- Nút bấm chính (Primary CTA): "Lưu quy ước", "Làm mới quy ước", "Bắt đầu phân tích Solution"
- Trạng thái Active/Focus: Border của TextArea/Input khi focus, chỉ báo tab đang chọn
- Switch Toggle: Trạng thái BẬT của switch kích hoạt
- Badge trạng thái tích cực: Tag "Đã áp dụng" / "Đã nạp" (`color: processing` hoặc `#3871e1`)

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Primary CTA (Settings) | Lưu quy ước tổ chức |
| Secondary CTA (Settings) | Xem trước Markdown |
| Refresh CTA (Step 1 & 2) | Tải lại từ Repo |
| Detail CTA (Step 1 & 2) | Xem chi tiết quy ước |
| Empty state heading (Settings) | Chưa có quy ước tổ chức |
| Empty state body (Settings) | Chưa có nội dung quy ước nào được lưu. Hãy nhập tài liệu chuẩn kỹ thuật của tổ chức vào đây để AI áp dụng cho toàn bộ dự án. |
| Empty state (Repo conventions) | Không tìm thấy CONVENTIONS.md tại thư mục gốc, .github/ hoặc docs/ của repository. Hệ thống sẽ chỉ áp dụng Quy ước tổ chức (Global). |
| Error state (SSH Fail) | Không thể kết nối tới máy chủ SSH để đọc file quy ước. Vui lòng kiểm tra cấu hình SSH hoặc quyền truy cập. Pipeline vẫn tiếp tục với Quy ước tổ chức. |
| Conflict Warning Alert | Phát hiện xung đột giữa Quy ước tổ chức và Quy ước Repository. AI sẽ chỉ rõ cả 2 nguồn và chờ bạn phân giải trong khung Chat. |
| Destructive confirmation | Xóa trắng quy ước: Bạn có chắc chắn muốn xóa toàn bộ nội dung Quy ước tổ chức không? Thao tác này sẽ xóa dữ liệu khỏi IndexedDB và file backup. |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none | not required (Ant Design 6 native) |
| third-party | none | not applicable |

---

## Visual Hierarchy & Focal Points

- **Focal Point - GlobalConventionsCard**: Vùng soạn thảo `Input.TextArea` Markdown (chiếm trọng tâm diện tích) kết hợp với nút Primary CTA "Lưu quy ước tổ chức" màu accent `#3871e1` ở góc dưới bên phải.
- **Focal Point - AppliedConventionsSummary**: Cụm Tag chỉ báo trạng thái quy ước (Global & Repo) với màu nhận diện trực quan (xanh lá/cam/đỏ) kết hợp nút "Tải lại từ Repo" (`SyncOutlined`).

---

## Component Specifications

### 1. Card Quản lý Global Conventions (`GlobalConventionsCard.tsx`)
- **Vị trí**: Tab "Cài đặt SDLC / AI" trong giao diện Settings (`src/components/settings/GlobalConventionsCard.tsx`).
- **Layout**:
  - Header: Icon `BookOutlined` + Tiêu đề "Quy ước tổ chức (Global Conventions)" + Tag trạng thái ("Đã cấu hình" hoặc "Chưa thiết lập").
  - Mô tả: Paragraph hướng dẫn ngắn gọn: "Tài liệu chuẩn kỹ thuật chung cho toàn bộ dự án. Được lưu an toàn trong IndexedDB và tự động đồng bộ qua backup mã hóa."
  - Toolbar phụ: Nút "Xem trước Markdown" (mở modal hoặc toggle preview), hiển thị số ký tự / số dòng.
  - Body: `Input.TextArea` hỗ trợ auto-size (tối thiểu 10 dòng, tối đa 24 dòng), font monospace.
  - Footer / Action: Nút "Xóa trắng" (nút phụ, có Popconfirm xác nhận) bên trái; Nút "Lưu quy ước tổ chức" (Primary CTA, icon `SaveOutlined`) bên phải.
- **Tương tác**:
  - Khi chưa có dữ liệu: TextArea để trống, hiển thị placeholder gợi ý cấu trúc markdown mẫu (# Tiêu chuẩn API, # Quy ước Logging, ...). Không tự động điền dữ liệu giả định.
  - Bấm "Lưu quy ước tổ chức": Lưu vào key `global_conventions` trong bảng `settings`, hiển thị notification toast "Đã lưu quy ước tổ chức thành công".
  - Bấm "Xem trước Markdown": Mở Modal hiển thị render HTML an toàn qua `renderSafeMarkdown`.

### 2. Panel Tóm tắt Quy ước Áp dụng (`AppliedConventionsSummary.tsx`)
- **Vị trí**: Đặt tại đầu trang Step 1 (`Step1IntakeView.tsx`) và đầu thanh công cụ của Step 2 (`Step2SolutionView.tsx`).
- **Layout**:
  - Giao diện thẻ phẳng gọn nhẹ (Card type="inner" hoặc Collapse Panel nhỏ gọn) viền `#e9eaee`, nền `#fafbfc`.
  - Hàng thông tin tóm tắt:
    - **Global Conventions**: Tag trạng thái xanh lá (nếu có nội dung) kèm số dòng; Tag màu xám "Trống" nếu chưa cấu hình.
    - **Repository Conventions**: Tag trạng thái xanh lá (kèm đường dẫn tìm thấy, ví dụ `repo:CONVENTIONS.md`), thời gian nạp gần nhất (ví dụ: `10:45:12`); hoặc Tag màu cam "Không có file" nếu không tìm thấy; Tag màu đỏ "Mất kết nối SSH" nếu lỗi kết nối.
    - **Thao tác**: Nút icon `SyncOutlined` "Tải lại" (cho phép reload lại file từ remote repo qua SSH) + Nút "Xem chi tiết" (mở Drawer hiển thị nội dung cả 2 file quy ước đang được đưa vào prompt).
- **Tương tác**:
  - Khi người dùng bấm "Tải lại": Nút chuyển sang trạng thái loading spin, gọi `conventionService.fetchRepoConventions(projectId)`, cập nhật lại timestamp và nội dung cache trong SDLC state.
  - Khi có lỗi SSH: Hiển thị tooltip giải thích lý do, không vô hiệu hóa nút chuyển bước hay chặn quy trình phân tích Solution.

### 3. Drawer / Modal Xem Chi tiết Quy ước (`ConventionsDetailModal.tsx`)
- **Layout**: Modal rộng 760px, gồm 2 Tabs:
  - Tab 1: "Quy ước tổ chức (Global)" — xem nội dung Markdown đang lưu ở Settings.
  - Tab 2: "Quy ước Repository" — xem nội dung file `CONVENTIONS.md` lấy từ SSH kèm đường dẫn nguồn (`/CONVENTIONS.md` hoặc `.github/CONVENTIONS.md` hoặc `docs/CONVENTIONS.md`).
- **Footer**: Nút "Đóng" và liên kết nhanh "Đi tới Cài đặt để chỉnh sửa Global".

---

## State & Interaction Contracts

### Trạng thái tải Repo Conventions
1. **Idle**: Chưa tải (khi project chưa cấu hình liên kết SSH/Repo) -> Panel ghi "Chưa liên kết SSH Repository".
2. **Loading**: Đang đọc file qua native SSH command -> Icon tải lại quay, nhãn "Đang kiểm tra remote...".
3. **Success**: Tìm thấy và đọc thành công -> Hiển thị đường dẫn nguồn và thời điểm nạp.
4. **Not Found (Graceful)**: Không tìm thấy file ở cả 3 đường dẫn chuẩn -> Tag cảnh báo nhẹ "Không có file CONVENTIONS.md", cho phép tiếp tục bình thường.
5. **SSH Error (Graceful)**: Lỗi kết nối hoặc timeout -> Tag cảnh báo lỗi, nút "Thử lại", cho phép tiếp tục với Global.

### Trạng thái Xử lý Xung đột (Conflict Resolution)
- Khi AI Chat phát hiện mâu thuẫn giữa Global và Repo:
  - Phản hồi của AI xuất hiện Block cảnh báo trực quan:
    - Tiêu đề: "⚠️ Xung đột quy ước kỹ thuật"
    - Nguồn Global: Trích dẫn điều khoản A
    - Nguồn Repo: Trích dẫn điều khoản B
    - Lựa chọn: Yêu cầu người dùng chỉ định quy ước ưu tiên hoặc nhập phương án điều chỉnh trực tiếp trong chat.

---

## Accessibility Contract

- **Phím tắt & Focus**:
  - Nút "Lưu quy ước tổ chức" có thể kích hoạt bằng `Ctrl+S` / `Cmd+S` khi con trỏ đang ở trong TextArea của `GlobalConventionsCard`.
  - Mọi nút bấm (Lưu, Xem trước, Tải lại) có `aria-label` rõ ràng.
- **Tương phản màu sắc (WCAG AA)**:
  - Text chính (`#191b1f`) trên nền trắng (`#ffffff`): Tỷ lệ tương phản 14.8:1 (đạt AAA).
  - Text phụ (`#5f6269`) trên nền xám nhạt (`#fafbfc`): Tỷ lệ tương phản 6.2:1 (đạt AA).
  - Màu nhấn (`#3871e1`) trên nền trắng: Tỷ lệ tương phản 4.6:1 (đạt AA).
- **Phản hồi trạng thái màn hình đọc**:
  - Trạng thái nạp quy ước có thẻ thông báo `role="status"` để người dùng khiếm thị nhận biết khi hoàn tất tải file qua SSH.

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved 2026-11-07
