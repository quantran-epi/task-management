---
sketch: 009
name: cr-detail-fast-scan
question: "Màn hình chi tiết CR nên gom thông tin thế nào để quét nhanh mà không cuộn nhiều?"
winner: null
tags: [cr-detail, layout, workbench, density]
---

# Sketch 009: CR Detail Fast Scan

## Design Question
Refactor `ChangeRequestDetailView.tsx` (header tags, flat task table, collapsed ghost blocks) thành màn hình quét nhanh: thấy ngay trạng thái, số liệu, task quá hạn và ngữ cảnh mà không phải mở từng collapse.

## How to View
`open .planning/sketches/009-cr-detail-fast-scan/index.html`

## Variants
- **A: Header nén + 2 cột** — stats strip 6 chỉ số, bảng task 7 dòng đầy đủ bên trái, callout + docs + notes bên phải. Không collapse.
- **B: Tab thu gọn** — header tối giản, chia Tác vụ / Ghi chú / Docs & Jira / Nhắc hạn thành subtab.
- **C: Rail CR + main** — rail trái chọn CR khác, main chỉ có CR đang mở; giống cấu trúc DocSet/Profile screen.

## What to Look For
- Variant A so với code hiện tại: collapse `Notes/Jira/Docs/Reminders` có đáng mở thẳng ra không, hay vẫn giữ dạng gọn?
- Variant B: subtab có làm mất ngữ cảnh khi đang đọc task không?
- Variant C: rail có hữu ích khi tab CR đã mở sẵn trong workbench không?
- Hạn quá hạn (đỏ) có đủ nổi bật ở cả 3 variant không.
