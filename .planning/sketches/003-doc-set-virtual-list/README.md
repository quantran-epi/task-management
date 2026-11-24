---
sketch: 003
name: doc-set-virtual-list
question: "Danh sách docs lớn nên quét/tìm/chọn thế nào mà không lag?"
winner: "A"
tags: [virtualization, search, list, performance]
---

# Sketch 003: Doc Set Virtual List

## Design Question
Khi một bộ chứa rất nhiều docs, chiến lược hiển thị nào cho phép tìm/chọn nhanh mà vẫn giữ render nhẹ?

## How to View
`open .planning/sketches/003-doc-set-virtual-list/index.html`

## Variants
- **A: Virtual scroll + filter dính** — thanh filter sticky (search + status + sort + chip extension), danh sách virtual (chỉ ~12 row trong DOM), footer hiện số row thật vs tổng số. Đổi 1.000 ↔ 50.000 docs và cuộn để thấy DOM không phình.
- **B: Phân trang 50/trang** — thanh phân trang + progress bar, mỗi trang 50 row. Dễ đoán nhưng đi trang khi cần doc cuối.
- **C: Nhóm + load more** — danh sách nạp dần 100 rồi +200 mỗi lần click. Đơn giản nhưng DOM tăng dần.

## What to Look For
- Chuyển 50.000 docs: variant A vẫn giữ ~12 row DOM; B giữ 50; C phình dần sau mỗi lần load more.
- Gõ search: filter có cảm giác tức thì không, count có cập nhật rõ không.
- Với workbench hẹp (nút Phone/Tablet), row có đọc được tên + trạng thái không.
- Footer perf có đủ để sếp tin là render nhẹ không — đây là mock, không phải đo thật.

## Grounding
Code thật: `src/components/notes/DocListPane.tsx:356-499` map toàn bộ filtered notes, mỗi row dựng Dropdown mới; `src/workbench/virtual/VirtualizedList.tsx` đã dùng `@tanstack/react-virtual` nhưng chưa áp dụng cho doc set. `DocumentSetDetail.tsx:39` pageSize=10 cho bảng cũ.
