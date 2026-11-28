---
sketch: 017
name: tasklist-command-deck
question: "Redesign toàn bộ trang Danh sách tác vụ — đâu là cấu trúc bảng/row giúp quét nhanh mà vẫn giữ thao tác hàng loạt?"
winner: A — Dense Table
tags: [task-list, command-deck, table, density, workbench, ant-design]
---

# Sketch 017: Task List Command Deck

## Design Question
Trang tasklist hiện tại là bảng AntD mặc định, header cột bị gãy chữ, metadata CR/mốc/subsystem rời rạc. Cấu trúc nào giúp quét nhanh, vẫn hỗ trợ lọc/sắp xếp/chọn hàng loạt, và đẹp ở cả light/dark?

## How to View
`open .planning/sketches/017-tasklist-command-deck/index.html`

Dùng toolbar góc phải để đổi Light/Dark, viewport, bật annotation. Gõ vào ô tìm kiếm, tick checkbox, đổi tab variant.

## Variants
- **A: Dense Table** — Bảng dày, một dòng duy nhất cho tên + CR/Mốc/Subsystem; cột trạng thái badge, ưu tiên 5 chấm, hạn có màu. Gần nhất với AntD Table hiện tại (path of least resistance).
- **B: Grouped Triage** — Cùng bảng nhưng nhóm "Quá hạn / Sắp tới" bằng section row; ưu tiên quyết định theo nhóm trước.
- **C: Card-Events** — Mỗi task là một card-event có border-left accent; phù hợp nếu thao tác chính là xử lý từng task hơn là quét bảng.

## What to Look For
- Header cột có gãy chữ không (đặc biệt "Tên tác vụ").
- Một dòng có đủ thông tin để quyết định không cần mở drawer.
- Dark mode: badge/trạng thái/ưu tiên có chói không.
- Batch bar hiện đúng khi tick checkbox; search lọc ngay.

## Winner: A — Dense Table

Quyết định của sếp 2026-11-28: A. Bảng dày, mỗi dòng là một high-signal row. Không dùng group header của B (cản sort), không dùng card events của C (kém density). Giữ cấu trúc AntD Table hiện tại, nâng cấp nội dung/cột thay vì thay grid.

## Constraints giữ nguyên khi implementation
Giữ mọi `data-testid`, cột CR/Mốc/Subsystem, sorting, sticky header, keyboard nav, handler thêm/lọc/hàng loạt; không đổi schema/DB.
