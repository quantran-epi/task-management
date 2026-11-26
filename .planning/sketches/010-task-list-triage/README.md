---
sketch: 010
name: task-list-triage
question: "Danh sách task từ nút Task trên taskbar nên lọc/chọn/cập nhật hàng loạt thế nào?"
winner: null
tags: [task-list, triage, batch, workbench, density]
---

# Sketch 010: Task List Triage

## Design Question
Refactor `TasksView.tsx` / `TaskTable.tsx` để ưu tiên lọc, chọn và cập nhật hàng loạt. Giữ toolbar tìm kiếm dính đầu, batch bar rõ ràng, không bắt người dùng cuộn để thấy action.

## How to View
`open .planning/sketches/010-task-list-triage/index.html`

## Variants
- **A: Bảng dày + toolbar dính** — giữ cấu trúc TaskTable, thêm sticky toolbar + batch bar nổi; checkbox và row-select cùng hoạt động.
- **B: Board theo trạng thái** — 4 lane Open/In Progress/Pending/Done, move bằng kéo thả; ưu tiên quét trạng thái hơn cột dữ liệu.
- **C: Row compact + inline edit** — row cao ~32px, đổi status/subsystem tại chỗ; giả lập virtual scroll cho dataset lớn.

## What to Look For
- Chọn nhiều row: batch bar có đủ rõ mà không che nội dung không?
- Variant A so với B: bảng hay board hợp với thói quen dùng TaskMate hơn?
- Variant C: inline edit có làm tăng rủi ro đổi nhầm trạng thái không?
- Search/filter có phản hồi ngay không (gõ vào ô tìm ở A/C)?
