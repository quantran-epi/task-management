---
sketch: 006
name: profile-review-controls
question: "Khi sửa profile cho người khác, làm sao làm rõ secret/path máy mà không làm người dùng bỏ sót?"
winner: "B"
tags: [states, review, checklist, secrets, profiles]
---

# Sketch 006: Profile Review Controls

## Design Question
Sketch 005 winner C đã có cột preview bên phải. Cột đó nên mang thông tin gì và mức độ "bắt rà soát" đến đâu để tránh export nhầm secret hoặc path máy của người soạn?

## How to View
`open .planning/sketches/006-profile-review-controls/index.html`

## Variants
- **A: Inline field hints** — badge + hint ngay tại từng field (`theo máy`, `secret — luôn trống`), input machine có border vàng, secret border gạch đứt. Preview cột phải chỉ là tóm tắt JSON. Nhẹ nhất, nhưng dễ bỏ sót khi cuộn qua nhiều field.
- **B: Review panel dính** — field giữ badge ngắn, cột phải là checklist 3 mục + cảnh báo "Đã đổi 3 giá trị theo máy", tick trực tiếp. Rõ trạng thái rà soát mọi lúc, nhưng checkbox không thực sự chặn Export.
- **C: Gate trước khi xuất** — nút Xuất mở modal checklist; 3 mục phải tick hết mới bật "Xác nhận xuất". Chặn chắc nhất, nhưng thêm 1 bước mỗi lần xuất.

## What to Look For
- Ở tab "Kết nối" (nhiều endpoint + secret nhất), cách 3 variant xử lý cảnh báo có khác biệt rõ không.
- Variant C: thử bấm Xuất JSON rồi tick dần 3 checkbox — cảm giác có bị làm phiền không khi xuất profile đã quen thuộc.
- Variant B: checkbox trong panel bên phải có đủ gần với nút Xuất không, hay cần dính thêm footer.
- A/B/C đều dùng khung 005C (rail 220 / editor / preview 296) và token TaskMate có sẵn.

## Grounding
Dựa trên phân loại `PROFILE_KEY_CATALOG` (`portable` / `machine-specific` / `secret-blank`) trong `src/services/configProfiles/catalog.ts` và luồng `ConfigProfileExportButton` + `ImportProfilePreviewModal` hiện tại. Checklist là mockup — chưa quyết định có chặn export thật trong implementation hay không.
