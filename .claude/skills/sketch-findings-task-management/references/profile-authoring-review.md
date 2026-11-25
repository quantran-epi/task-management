# Profile Authoring & Review

## Design Decisions
- **Shell (005C):** rail trái 220px (danh sách + tìm kiếm + Mới/Nhân bản) · editor giữa (tên profile, người nhận, 4 tab nhóm field, footer Lưu/Xuất/Xóa) · panel phải 296px (preview export + checklist rà soát). Thay vì table+drawer (005A) hay rail+editor thuần (005B) vì cần nhìn thấy nội dung export ngay khi sửa — đây là màn hình "cấu hình cho người khác".
- **Metadata "Người nhận":** tên người nhận là metadata nội bộ, đặt cạnh tên profile ở đầu editor, không được ghi vào file export. `ConfigurationProfile` hiện chỉ có `name`, `createdAt`, `updatedAt`, `config` — cần mở rộng type nếu dùng.
- **4 tab nhóm field:** Cơ bản / Kết nối / AI & Team / Công suất. Giữ `forceRender` hoặc tương đương để DOM hook tests không mất khi đổi tab (pattern hiện có trong `ConfigProfilesView.tsx`).
- **Footer dính:** Xóa · Nhân bản · Xuất JSON · Lưu profile. Lưu là primary action; Xuất bật khi đã chọn profile.
- **Review panel (006B):** 3 checkbox rà soát (machine values / secret trống / xem trước JSON) + cảnh báo vàng khi có giá trị theo máy; tick trực tiếp, **không chặn Export** — khác 006C (modal gate) vốn thêm 1 bước mỗi lần xuất. Checklist hiện có sau import (`PostProfileImportChecklist`) nên giữ export nhẹ.
- **Field hints (từ 006A, ghép vào B):** badge `theo máy` (vàng) tại field machine-specific; badge `secret — để trống` (tím) tại field secret; border vàng cho input machine. Không lặp giải thích dài dòng — panel phải giải thích, field chỉ báo hiệu.

## CSS Patterns
```css
.shell { display: grid; grid-template-columns: 220px minmax(0,1fr) 296px; min-height: 620px; }
.rail { border-right: 1px solid var(--color-border); }
.side { border-left: 1px solid var(--color-border); background: var(--color-surface-soft); }
.field.machine input { border-color: var(--color-warning); background: #fffdf7; }
.field.secret input { border-style: dashed; background: #faf8ff; }
.alert.warn { background: var(--color-warning-bg); border: 1px solid #f0d59b; color: #6f4b08; }
.check { display: flex; gap: 7px; padding: 6px 4px; border-bottom: 1px dashed var(--color-border); font-size: var(--text-xs); }
```
Control height 28px, font 11–13px, row padding 6–8px, radius 4/8px; token lấy từ `.planning/sketches/themes/default.css` (khớp `src/styles/tokens.ts`).

## HTML Structures
- Rail: `<div class="pitem active"><div class="name">…</div><div class="meta">người nhận · ngày</div></div>`
- Editor: `.editor-head` (2-column tên/người nhận) → `.tabs` → `.editor-body` (grid2 fields theo tab) → `.editor-foot` (buttons).
- Panel phải: `h3` + `.alert.warn` + 3 × `.check` (checkbox + label + mono value) + `.code` preview JSON.

## What to Avoid
- **005A table + drawer:** sửa phải mở thêm lớp; rail/editor trực tiếp nhanh hơn cho luồng chọn→sửa→xuất.
- **006C modal gate:** bắt tick 3 checkbox mới được xuất — làm phiền khi export profile đã quen; import đã có checklist riêng.
- Hiện metadata người nhận trong file export (vi phạm ranh giới profile portable).
- Bỏ `data-*` hooks / `aria-label` của field khi đổi layout — tests hiện tại phụ thuộc vào đó.

## Origin
Synthesized from sketches: 001 (winner C), 005 (winner C), 006 (winner B).
Sources: `sources/001-config-profiles-layout/`, `sources/005-profile-management-ui/`, `sources/006-profile-review-controls/`.
