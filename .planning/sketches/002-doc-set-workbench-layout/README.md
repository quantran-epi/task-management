---
sketch: 002
name: doc-set-workbench-layout
question: "Bố cục nào cho màn hình bộ tài liệu gọn trong workbench mà vẫn đủ thông tin?"
winner: "A"
tags: [layout, doc-set, workbench, ant-design]
---

# Sketch 002: Doc Set Workbench Layout

## Design Question
Bố cục màn hình bộ tài liệu vừa gọn trong workbench, vừa cho thấy đủ thông tin để tìm/chọn doc mà không kéo full note body vào row.

## How to View
`open .planning/sketches/002-doc-set-workbench-layout/index.html`

## Variants
- **A: Rail cố định + inspector** — rail trái 248px chọn bộ, phải gồm header + stats + danh sách docs, inspector 260px bên phải. Gần với `DocSetLibrary.tsx` hiện tại nhưng có chỗ cho chi tiết doc.
- **B: Rail thu gọn + tab** — rail 64px chỉ icon/tên, thêm tab Docs / Cấu hình / Lịch sử / Graph để dời nội dung nặng ra khỏi màn hình chính.
- **C: Rail ngang + full-width** — rail bộ tài liệu thành hàng ngang phía trên, danh sách docs dùng toàn chiều rộng; tận dụng màn hình rộng, bỏ inspector.

## What to Look For
- Khi chọn bộ mới, header/stats cập nhật mà không làm rung layout.
- Với 128 docs, row phải gọn, status đọc được lẹ, không cần scroll ngang.
- Biến thể B có đủ chỗ cho `DocumentSetForm` và graph khi chuyển tab không.
- Biến thể C có đáng để bỏ inspector không, hay inspector nên là drawer.

## Grounding
Dựa trên code thật: `src/workbench/DocSetLibrary.tsx` (rail 260px), `src/workbench/DocumentSetDetail.tsx` (header, stats, table pageSize=10), `src/components/knowledge/DocumentSetForm.tsx` (membership list). Dùng token từ `.planning/sketches/themes/default.css` (copy từ `src/styles/tokens.ts`).
