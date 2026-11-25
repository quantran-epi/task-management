# Quick Task 261125-tp9: Lọc Select thực thể theo Segmented trong QuickNotesPanel

## Kết quả

Select gắn thực thể trong panel "Ghi chú nhanh" giờ chỉ liệt kê đúng loại đang chọn trên Segmented (CR / Task / Hệ thống). Đổi loại luôn xóa `entityId` đã chọn, nên note lưu ngay sau đó không mang nhầm `entityType`/`entityId` của loại cũ.

## Thay đổi

- `src/components/notes/QuickNotesPanel.tsx`
  - `entityNames` chuyển sang `Map<string, EntityName>` với `{ label, type }`; vẫn query đúng 3 bảng `changeRequests` / `tasks` / `systems` trong một `Promise.all`, dependency `[db]`, default `new Map()`.
  - `entityOptions` lọc `entity.type === entityType` trước rồi `.slice(0, 200)`, map thành `{ label, value }`. Giữ nguyên prop Select (`showSearch`, `disabled`, `allowClear`, `data-testid`, placeholder 4 nhánh, `onChange`, `filterOption`).
  - Giữ nguyên `onChange` Segmented: `setEntityType(value); setEntityId(undefined);`.
  - Cập nhật 2 chỗ đọc tên (`listFilterOptions`, tag trong row Card) dùng `.label`; danh sách 2 dòng, filter entity đã link, `QuickNoteEntry`, `NoteDetailModal`, `NoteEditor` giữ nguyên.
- `src/workbench/__tests__/QuickNotesPanel.test.tsx`
  - Thêm 3 test: option theo CR; đổi Task rồi Hệ thống; chọn CR + entity rồi đổi Task → hết selection item, chỉ còn option Task, note lưu có `entityType: 'task'`, `entityId` undefined, không có row `cr`.

## Verify

- RED: `npx vitest run src/workbench/__tests__/QuickNotesPanel.test.tsx --bail=1` → 1 fail đúng như kỳ vọng (Select hiện cả task khi chọn CR).
- GREEN: cùng lệnh → 14/14 test passed; `npx tsc --noEmit` sạch.
- Không chạy full suite (quy tắc dự án).

## Commits

- `b391bd11` — `test(261125-tp9): add failing tests for entity select filtering`
- `25f3c54f` — `feat(261125-tp9): lọc entity select theo loại đang chọn và clear khi đổi segmented`

## Phạm vi

Branch vẫn `pre-v1.6-baseline`, không worktree, không stash/reset/checkout. Chỉ 2 file target thay đổi; các file untracked khác (`.planning/debug/`, quick task khác) không bị đụng. Không thêm dependency/schema. Summary này không được commit theo yêu cầu.
