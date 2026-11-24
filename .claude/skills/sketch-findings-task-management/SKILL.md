---
name: sketch-findings-task-management
description: Validated design decisions, CSS patterns, and performance direction for TaskMate's doc-set screen. Auto-loaded when refactoring or implementing UI in task-management.
---

<context>
## Project: task-management (TaskMate)

Refactor màn hình "Bộ tài liệu" theo hướng workbench gọn, mật độ cao: rail trái chọn bộ, vùng phải tập trung tìm/chọn doc. Với bộ có rất nhiều docs: search/filter dính đầu + virtual scroll, không render toàn bộ danh sách, không kéo full note body vào row. Không có app/site ngoài làm mẫu; 3 variant tự đề xuất và đã chọn qua checkpoint.

Sketch sessions wrapped: 2026-11-24.
</context>

<design_direction>
## Overall Direction

- **Layout:** rail trái cố định 248px (danh sách bộ) + detail area (header, stats, toolbar, virtual list) + inspector phải 260px. Giữ khung workbench hiện tại của `DocSetLibrary.tsx`, không chuyển sang tab/rail ngang.
- **Density:** control height 28px, font 11-13px, row 38px, spacing 4/8/12/16px — cùng thang với `src/styles/tokens.ts` và sketch 001.
- **Palette:** token Ant Design 6 / TaskMate: bg `#f5f6f8`, surface `#fff`, border `#e4e6ec`, text `#111318`, primary `#2f62d8`, warning `#a56906`, success `#2f9e6e`, danger `#c54e58`. Không thêm màu mới.
- **Typography:** Inter cho UI, IBM Plex Mono cho số/đường dẫn/thời gian.
- **Interaction:** mọi control có hover/focus rõ; filter phản hồi ngay; progress chạy inline mà không chặn danh sách; empty state có CTA; lỗi chỉ đúng doc + action thử lại/bỏ qua.

## Performance Direction (quan trọng như UI)

1. Virtualize danh sách docs bằng `@tanstack/react-virtual` (`src/workbench/virtual/VirtualizedList.tsx` đã có sẵn) — chỉ render window + overscan, không map toàn bộ filtered list.
2. Search/filter nằm ở toolbar dính đầu. Row chỉ chứa: tên, path, kích thước, ngày, status tag — **không** render markdown/snippet/full `Note.body` trong row.
3. Tách hash/index khỏi `notes.toArray()` trong `DocumentSetDetail.tsx:155-191` — không hash toàn bộ note bodies trên mỗi change; xử lý theo docs thuộc bộ, cache sha theo (id, updatedAt), chạy ngoài luồng render nếu cần.
4. Picker chọn docs dùng flat searchable list + virtualization, bỏ `Tree defaultExpandAll` và các vòng `activeNotes.find()/filter()` lặp trong `DocumentSetForm.tsx:87-204`.
5. Membership list của `DocumentSetForm.tsx:596-636` cũng phải virtualize — đây là chỗ re-render nặng nhất khi gõ search trong form.
</design_direction>

<findings_index>
## Design Areas

| Area | Reference | Key Decision |
|------|-----------|--------------|
| Layout & Navigation | references/layout-navigation.md | Rail 248px cố định + detail + inspector 260px; giữ khung workbench |
| Virtual List & Search | references/virtual-list-search.md | Filter sticky + virtual rows; 50.000 docs vẫn ~12 row DOM |
| States & Pickers | references/states-pickers.md | Inline progress/errors; picker flat searchable thay Tree |

## Theme

Winning theme: `sources/themes/default.css` (copy từ `.planning/sketches/themes/default.css`, token lấy từ `src/styles/tokens.ts`).

## Source Files

Full interactive mockups preserved in `sources/002-*`, `sources/003-*`, `sources/004-*/index.html`. Mở trực tiếp bằng browser, không cần build.
</findings_index>

<metadata>
## Processed Sketches

- 002-doc-set-workbench-layout (winner A)
- 003-doc-set-virtual-list (winner A)
- 004-doc-set-heavy-states (winner A)

Không include 001-config-profiles-layout trong lần wrap-up này (chủ đề khác, để riêng).
</metadata>
