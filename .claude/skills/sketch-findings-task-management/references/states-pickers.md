# States & Pickers

## Design Decisions

**Inline progress + action** thắng vì:
- Toast (variant B) dễ trôi qua; modal chặn thao tác chính.
- Side panel (variant C) xung đột với inspector 260px của layout đã chọn.
- Inline banner + progress bar nằm trong detail: sếp vừa đọc danh sách vừa thấy tiến độ, có nút Tạm dừng/Thử lại/Bỏ qua ngay tại chỗ.

**State matrix (phải render được hết):**
- Bình thường: stats + vài row mẫu.
- Đang index: banner spinner + "124 / 128 docs · chạy locally" + progress bar + nút Tạm dừng; danh sách vẫn click được.
- Lỗi: errbox liệt kê đúng doc + lý do (`file trống`, `quá lớn`) + Thử lại / Bỏ qua.
- Rỗng: icon + "Chưa có tài liệu nào trong bộ này" + CTA "+ Chọn tài liệu".
- Chọn docs: flat searchable list, checkbox, "Đã chọn N docs", Hủy / Thêm vào bộ.

**Picker thay Tree:** bỏ `Tree defaultExpandAll` trong `DocumentSetForm.tsx:672-679` và các vòng `activeNotes.find()/filter()` tại `87-204`. Dùng flat list + search + virtual rows; mỗi row: checkbox + tên + path.

## CSS Patterns

```css
.banner { border:1px solid var(--color-border); border-left:3px solid var(--color-primary); background:var(--color-surface-soft); padding:10px 12px; display:flex; align-items:center; gap:var(--space-3); }
.spin { width:14px; height:14px; border:2px solid var(--color-primary-soft); border-top-color:var(--color-primary); border-radius:50%; animation:spin .8s linear infinite; }
.track { height:6px; background:var(--color-border); border-radius:3px; overflow:hidden; }
.track i { height:100%; background:var(--color-primary); transition:width .3s ease; }
.errbox { border:1px solid color-mix(in srgb,var(--color-danger) 35%,transparent); background:color-mix(in srgb,var(--color-danger) 5%,var(--color-surface)); border-radius:var(--radius-md); padding:12px; }
.pick-row { display:flex; align-items:center; gap:8px; padding:6px var(--space-3); cursor:pointer; }
.pick-row.on .checkbox { background:var(--color-primary); border-color:var(--color-primary); color:#fff; }
```

## HTML Structures

- Banner: `.banner > .spin + .txt(b + span) + button.act`.
- Error: `.errbox > b + p(code) + buttons`; sau đó danh sách `.row` mỗi doc + `.tag.err`.
- Empty: `.empty > .icon + h4 + p + button.primary`.
- Picker: `.picker > .picker-head(input + .tag) + .picker-body(.pick-row*) + .picker-foot(count + buttons)`.

## What to Avoid

- Modal chặn toàn bộ workflow cho lỗi hash — để Thử lại/Bỏ qua inline.
- Trạng thái progress làm layout nhảy — chiều cao banner cố định, chỉ đổi width của progress bar.
- Tree expand-all với bộ lớn — sinh quá nhiều node DOM; flat list + search là hướng đã duyệt.

## Origin
Synthesized from sketch: 004 (winner A). Source: sources/004-doc-set-heavy-states/index.html
