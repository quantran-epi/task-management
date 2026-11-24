---
sketch: 004
name: doc-set-heavy-states
question: "Trạng thái nặng (hash/index/publish/empty/error/picker) nên hiển thị ra sao?"
winner: "A"
tags: [states, progress, picker, performance]
---

# Sketch 004: Doc Set Heavy States

## Design Question
Khi bộ tài liệu lớn phát sinh công việc nặng (hash/index/publish) hoặc rơi vào trạng thái rỗng/lỗi/chọn docs, UI nên thể hiện thế nào mà không làm sếp mất phương hướng hay tăng tải render?

## How to View
`open .planning/sketches/004-doc-set-heavy-states/index.html`

## Variants
- **A: Inline progress + action** — banner + progress nằm ngay trong detail, có nút Tạm dừng; lỗi hiện danh sách doc lỗi kèm Thử lại/Bỏ qua; empty có CTA; picker là flat searchable list thay vì Tree defaultExpandAll.
- **B: Toast + modal tập trung** — sự kiện đẩy ra toast/modal, detail luôn sạch. Gọn nhưng progress dễ bị bỏ lỡ, modal chặn thao tác.
- **C: Side panel riêng** — cột phải 280px chuyên activity + history, progress và lỗi không chiếm vùng danh sách.

## What to Look For
- Chuyển qua các state: progress có làm layout nhảy không; lỗi có chỉ đúng doc và có action rõ không.
- Variant A picker: gõ search, click chọn — so với tree `defaultExpandAll` hiện tại trong `DocumentSetForm.tsx:672-679`.
- Variant C: side panel 280px có chen được với inspector 260px từ sketch 002 không (gợi ý: không — cần chọn một).
- Khi index chạy, danh sách docs có đọc/click được không.

## Grounding
`DocumentSetDetail.tsx:155-191` hash toàn bộ note bodies bằng Promise.all; `DocumentSetForm.tsx:87-204` tree data tìm tuyến tính + defaultExpandAll; `DocumentSetDetail.tsx:41-52` tag trạng thái publish (`Chưa xuất bản`, `Đã đồng bộ`, `Có thay đổi cục bộ`).
