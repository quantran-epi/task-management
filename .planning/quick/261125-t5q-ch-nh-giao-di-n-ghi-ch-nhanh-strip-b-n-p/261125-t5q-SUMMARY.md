# Quick Task 261125-t5q Summary

**Task:** Chỉnh giao diện danh sách panel "Ghi chú nhanh" trên right stripe
**Commit:** `893bf414`
**Branch:** `pre-v1.6-baseline` (không đổi, không worktree)

## Kết quả

- Giữ nguyên luồng tạo note: `Segmented`, entity `Select`, `QuickNoteEntry`, `createNote` không đổi.
- Query list đổi sang chỉ lấy `!deletedAt && type === 'quick_note'`; sort `updatedAt` desc, `slice(0, 20)` giữ nguyên.
- Row: tag entity (nếu resolve được tên), tiêu đề, body render qua `renderSafeMarkdown(readNoteMarkdown(...))` với CSS clamp 2 dòng (`WebkitLineClamp: 2`, `WebkitBoxOrient: 'vertical'`, `overflow: 'hidden'`), bỏ `maxHeight`/`overflowY: 'auto'`.
- Thêm `Select` lọc riêng `data-testid="quick-notes-list-filter"`, options sinh từ entity đã được note link (dedupe, bỏ id không resolve) + option `Tất cả`; state riêng `listEntityFilter`, không lẫn picker; empty state giữ copy cũ.

## Tests

- 6 test mới: 3 cho quick-note-only + row tag/tiêu đề + clamp style; 3 cho filter entity (options, lọc, `Tất cả`).
- Tổng 11/11 test scoped xanh.
- `npx tsc --noEmit` sạch.

## Verify commands

```
npx vitest run src/workbench/__tests__/QuickNotesPanel.test.tsx --bail=1
npx tsc --noEmit
```

## Files

- `src/components/notes/QuickNotesPanel.tsx` — sửa query, row clamp, thêm list filter.
- `src/workbench/__tests__/QuickNotesPanel.test.tsx` — thêm 6 test.

## Ghi chú

- Không thêm dependency/schema; không đụng file/session task khác.
- Parallel session cùng branch đã commit trong lúc chạy; commit của task này (`893bf414`) đã được tách riêng chỉ 2 file target, không chứa file của session kia.
- Summary không commit theo yêu cầu orchestrator.
