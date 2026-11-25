---
sketch: 005
name: profile-management-ui
question: "Quản lý nhiều profile và luồng chọn → sửa → lưu → xuất nên bố trí ra sao trong workbench?"
winner: "C"
tags: [layout, settings, profiles, management, ant-design]
---

# Sketch 005: Profile Management UI

## Design Question
Màn hình "Cấu hình cho người khác" đã có rail danh sách + editor (sketch 001 winner C), nhưng chưa rõ: với nhiều profile thì quản lý ở đâu, thao tác sửa/xuất/nhân bản gom thế nào, và làm sao nhìn thấy ngôn ngữ "profile cho người khác" thay vì chỉ là form cấu hình chung.

## How to View
`open .planning/sketches/005-profile-management-ui/index.html`

## Variants
- **A: Bảng + drawer** — Danh sách profile dạng table mật độ cao (tên, người nhận, ngày, trạng thái); bấm "Sửa" mở drawer phải để chỉnh theo tab. Hợp quản lý nhiều profile, nhưng sửa/xuất cần thêm một lớp drawer.
- **B: Rail + editor tabs** — Rail trái 268px tìm/chọn profile + nút Mới/Nhân bản; editor phải có tên, người nhận, 4 tab nhóm field, footer dính với Xóa/Nhân bản/Xuất/Lưu. Ít bước nhất cho luồng chọn → sửa → xuất.
- **C: List + detail + preview** — Như B nhưng thêm cột preview 286px bên phải: bản xem trước export + checklist rà soát secrets/path. Rõ nhất cho việc gửi cấu hình cho người khác, nhưng panel hẹp hơn.

## What to Look For
- Ở chế độ 768px (nút trên toolbar) xem rail/table có bị ép quá không.
- Cách mỗi variant thể hiện metadata "Người nhận" — đây là điểm khác biệt chính của tính năng "profile cho người khác".
- Footer dĩnh với 4 thao tác: Xóa / Nhân bản / Xuất / Lưu — thứ tự và độ nổi bật có hợp không.
- Badge "theo máy" và "secret — để trống" có đủ rõ trong lúc sửa không (sẽ được tinh chỉnh ở sketch 006).
- Tất cả dùng token TaskMate có sẵn, control 28px; mockup có tìm kiếm, tạo, nhân bản, xóa, đổi tab, toast — thử click các nút.

## Grounding
Field names lấy từ `src/views/ConfigProfilesView.tsx` và catalog phân loại `portable` / `machine-specific` / `secret-blank` trong `src/services/configProfiles/catalog.ts`. Metadata "Người nhận" là ý tưởng mới cần xác nhận với implementation (hiện `ConfigurationProfile` chỉ có `name`). Không đụng logic production.
