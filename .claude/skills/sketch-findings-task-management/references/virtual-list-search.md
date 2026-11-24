# Virtual List & Search

## Design Decisions

**Filter sticky + virtual rows** thắng vì:
- B (phân trang 50/trang): DOM nhỏ nhưng phải chuyển trang để tới doc cuối — chậm khi đã biết tên doc.
- C (load more): DOM phình dần sau mỗi lần click — chính là bệnh hiện tại.
- A: filter tức thì, cuộn mượt, DOM gần như không đổi khi dataset tăng 1.000 → 50.000.

**Row shape cố định 38px:** `no | name | path | size | date | status tag`. Không snippet markdown, không Dropdown dựng mới mỗi row (bệnh `DocListPane.tsx:423`), không preview.

**Toolbar dính:** search (tên/đường dẫn) + Select status + Select sort + chip `.md`/`.docx` + count `filtered / total`. Count là tín hiệu quan trọng để sếp biết search đang lọc trên tập nào.

## CSS / JS Patterns

```css
.filters { position:sticky; top:0; z-index:5; background:var(--color-surface-soft); display:flex; gap:var(--space-2); padding:var(--space-2) var(--space-4); border-bottom:1px solid var(--color-border); }
.list { height:440px; overflow:auto; position:relative; }
.row { height:38px; display:flex; align-items:center; gap:var(--space-3); padding:6px var(--space-4); border-bottom:1px solid var(--color-border); }
```

```js
// Virtualization pattern (mock); production dùng @tanstack/react-virtual
const ROW=38, overscan=4;
const start=Math.max(0,Math.floor(el.scrollTop/ROW)-overscan);
const end=Math.min(list.length,start+Math.ceil(VIEWPORT/ROW)+overscan*2);
// padTop = start*ROW; padBottom = (list.length-end)*ROW
```

## Performance Requirements cho implementation

- Dùng `src/workbench/virtual/VirtualizedList.tsx` (`@tanstack/react-virtual`) thay vì tự tính scroll.
- Giữ filter state ngoài row component; row là `React.memo` với props ổn định — tránh dựng `MenuProps`/Dropdown mới mỗi render.
- Không gọi `computeSha256(normalizeMarkdownForHash(note.body))` cho mọi note trong `DocumentSetDetail.tsx:155-191`; cache theo `(id, updatedAt)` và chỉ xử lý docs của bộ đang xem.
- Membership list `DocumentSetForm.tsx:596-636` (mỗi member 3 Tooltip + Button) phải virtualize — đây là điểm lag lớn nhất khi gõ search trong form.

## What to Avoid

- Paginator như `DocumentSetDetail.tsx:39` pageSize=10 — ổn cho bảng cũ nhưng không đủ cho danh sách docs lớn cần quét nhanh.
- Load-more vô hạn — DOM tăng dần, lag quay lại.
- Full markdown/snippet trong row — kéo `Note.body` vào render path.

## Origin
Synthesized from sketch: 003 (winner A). Source: sources/003-doc-set-virtual-list/index.html
