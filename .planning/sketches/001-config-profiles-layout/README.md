---
sketch: 001
name: config-profiles-layout
question: "Bố cục nào giúp soạn/đọc/đổi cấu hình cho người khác rõ ràng nhất?"
winner: null
tags: [layout, settings, profiles, ant-design]
---

# Sketch 001: Config Profiles Layout

## Design Question
Màn hình "Cấu hình cho người khác" hiện là PageHeader + Row/Col 2 cột đơn điệu. Bố cục nào làm rõ luồng "soạn profile mới → rà soát secrets → xuất JSON" mà vẫn gọn trong workbench panel?

## How to View
`open .planning/sketches/001-config-profiles-layout/index.html`

## Variants
- **A: Wizard 3 bước** — Chọn mẫu → Điền thông tin → Rà soát & xuất, kèm sidebar tóm tắt. Rõ nhất cho người mới, nhưng thêm 1 lần click.
- **B: Dashboard thẻ profile + drawer** — Grid thẻ với badge trạng thái ("Cần rà soát secrets"), mở drawer bên phải để sửa. Hợp khi quản lý nhiều profile.
- **C: Rail danh sách + editor** — Sidebar trái tìm/chọn profile, phải là editor có section tabs. Giống IDE, thao tác điều hướng ít nhất.

## What to Look For
- Cách mỗi phương án xử lý cảnh báo "secrets/path được giữ lại khi export" — đây là điểm dễ bỏ sót nhất.
- Mật độ thông tin ở panel hẹp (thử nút 768px trên toolbar).
- Luồng sửa profile cũ vs tạo profile mới — variant nào ít bước hơn cho sếp?
- Tất cả dùng token màu thật từ `src/styles/tokens.ts` (#2f62d8 / #1e4bb8), control height 28px.

## Grounding
Field names lấy từ `src/views/ConfigProfilesView.tsx`: Tên profile, Ngày ngoại lệ, Ghost Dev master/worker model, Ghost Dev claudePath, Team budget warn threshold. Không đụng logic production.
