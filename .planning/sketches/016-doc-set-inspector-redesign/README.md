---
sketch: 016
name: doc-set-inspector-redesign
question: "Thiết kế lại toàn màn hình Bộ tài liệu với right section không dồn control: đâu là cấu trúc đúng?"
winner: A
tags: [doc-set, inspector, modal, layout, workbench]
---

# Sketch 016: Doc Set Inspector Redesign

## Design Question

Giữ rail trái và danh sách tài liệu ở giữa; thiết kế lại bên phải để không còn cảnh "ấn Cấu hình thì ra một đồng control chen chúc". Cấu hình nên sống ở đâu, inspector nên hiện gì khi đọc?

## How to View

Mở `.planning/sketches/016-doc-set-inspector-redesign/index.html` trong browser. Chuyển tab A/B/C ở trên cùng. Bấm thử "Cấu hình", chọn tài liệu, mở drawer (variant C).

## Variants

- **A: Inspector tách bạch** — Aside 300px chỉ xem tài liệu (title, path, size, date, status, id, actions). Nút "Cấu hình" mở Modal 620px có form theo section. Mỗi doc row có nút `⋯` mở menu sửa nhanh/đổi tên/sao chép đường dẫn/xoá khỏi bộ; inspector có nút Sửa nhanh + Xoá. Đây là hướng sếp chọn.
- **B: Inspector tabbed** — Aside có 2 tab "Tài liệu"/"Bộ"; cấu hình vẫn mở modal. Ưu: xem thông tin bộ không cần modal. Nhược: thêm một lớp tab.
- **C: Detail list + drawer** — Bỏ aside cố định, chỉ còn rail icon 72px; bấm doc mở drawer 320px; cấu hình mở modal. Ưu: list docs rộng tối đa. Nhược: inspector không còn "luôn nhìn thấy".

## What to Look For

- Khi bấm "Cấu hình": form có không gian riêng, không chen trong aside hẹp.
- Khi không mở cấu hình: aside phải có thông tin hữu ích, không trống.
- Dark mode: dùng token có sẵn, không màu cứng.
- Với màn hình hẹp: toolbar/list có co giãn được không (nút 375/768/1280).
