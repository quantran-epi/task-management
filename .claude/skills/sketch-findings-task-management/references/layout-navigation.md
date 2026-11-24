# Layout & Navigation

## Design Decisions

**Rail trái cố định 248px + detail + inspector phải 260px** thắng vì:
- Giữ nguyên khung `DocSetLibrary.tsx` — refactor ít rủi ro nhất.
- Inspector cho doc đang chọn, không cần mở drawer/popup khi đang quét danh sách.
- Rail thu gọn (variant B) tiết kiệm ngang nhưng mất tên bộ + status tag; rail ngang (variant C) lấy chỗ của danh sách, không phù hợp khi cần quét nhiều docs.

**Cấu trúc detail (từ trên xuống):** header (tên bộ, actions Cấu hình / Xuất bản) → stats row (TOTAL DOCS, ĐÃ INDEX, CHƯA ĐỒNG BỘ, PHẠM VI) → toolbar filter → virtual list → inspector.

**Không dùng side panel activity 280px** (sketch 004/C) cùng lúc với inspector 260px — xung đột chiều ngang. Progress/error nằm inline trong detail (xem states-pickers.md).

## CSS Patterns

```css
.workbench { display:flex; height:620px; background:var(--color-surface); border:1px solid var(--color-border); border-radius:var(--radius-lg); overflow:hidden; }
.rail { width:248px; flex:none; border-right:1px solid var(--color-border); background:var(--color-surface-soft); display:flex; flex-direction:column; }
.detail { flex:1; min-width:0; display:flex; flex-direction:column; }
.stats { display:flex; gap:var(--space-5); padding:var(--space-3) var(--space-5); background:var(--color-surface-soft); border-bottom:1px solid var(--color-border); }
.inspector { width:260px; flex:none; border-left:1px solid var(--color-border); padding:var(--space-4); overflow:auto; }
```

## HTML Structures

- `.rail > .rail-head (title + SearchInput) + .rail-list` — mỗi set row gồm `.set-name` (tên + status tag) và `.set-meta` (số docs + ngày).
- `.detail > .detail-head (h2 + p + .actions) + .stats + .body`.
- `.body > .docs (.toolbar + .rows) + .inspector (.kv rows + actions)`.

## What to Avoid

- Tab-based detail (sketch 002/B): dời membership/graph/publish vào tab làm tăng click, không giải quyết lag.
- Rail ngang full-width (sketch 002/C): bỏ inspector, khó xem chi tiết doc đang chọn.
- Header kiểu PageHeader + Row/Col 2 cột cũ — đã bị loại từ sketch 001.

## Origin
Synthesized from sketch: 002 (winner A). Source: sources/002-doc-set-workbench-layout/index.html
