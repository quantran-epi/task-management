# 261128-ipr Summary

**Kết quả:** bảng task CR detail chiếm toàn bộ chiều rộng vùng nội dung; năm section phụ xếp thành 2 cột bên dưới bảng, co về 1 cột ở viewport hẹp. Giữ testid, search/filter, sort theo mốc, dropdown subsystem, modal và drawer.

## Commits

| Hash | Nội dung |
|------|----------|
| `5244a3c6` | `feat(261128-ipr): make CR task table full width and stack secondary cards in two columns` |
| `92acadf0` | `refactor(261128-ipr): move secondary grid CSS into dedicated stylesheet` |

## Chi tiết

- `src/views/ChangeRequestDetailView.tsx`: bỏ grid `2.4fr/1fr` cũ, bỏ `minWidth: 320` của cột Task, bọc bảng bằng `data-testid="cr-detail-task-table"` với `width: 100%; minWidth: 0`; cards nằm trong `data-testid="cr-detail-secondary-grid"` sau bảng.
- `src/views/cr-detail.css`: `.cr-detail-secondary-grid` dùng `repeat(2, minmax(0, 1fr))`, `gap: var(--gap-12)`, `align-items: start`; media `max-width: 900px` ép 1 cột.
- `tests/views/ChangeRequestDetailView.test.tsx`: thay assertion layout cũ bằng guard full-width + grid 2 cột + thứ tự 5 block.

## Tests

Không chạy full Vitest. Scoped:

```
npx vitest run tests/views/ChangeRequestDetailView.test.tsx src/views/__tests__/ChangeRequestDetailView.reminderAndSearch.test.tsx
npx tsc --noEmit
```

Kết quả: 2 files, 28 tests — **21 passed, 7 failed**. Cả 7 failure đã tồn tại ở commit cha `5244a3c6^` (đã verify trong worktree tách biệt), do test cũ nhận định UI inline quick-add/link trước commit `eef54006`, không phải do layout `261128-ipr`. Bổ sung 2 test layout mới đều pass. `npx tsc --noEmit` pass.

## Chrome verification

Dùng Playwright system Chrome riêng, context isolate, light/dark, 1280×900; script `/tmp/ipr-verify/verify.cjs`; ảnh `/tmp/ipr-verify/cr-detail-{light,dark}.png` và `cr-detail-narrow-{light,dark}.png`.

Số đo thực tế: wrap bảng 1029.66px, table 1003.66px, grid cards 1029.66px với 2 cột 508.83px; `tableOverflow = 0`, `bodyOverflow = 0`. Ảnh light/dark: bảng full width, cards "Nhắc nhở" / "Links" nằm 2 cột bên dưới, không chói dark. Phần cạnh phải bị cắt trong screenshot là horizontal scroll có sẵn của `.workbench-editor-body` (tab content 1062px / editor 1013px) — tồn tại trước change này, nằm ngoài scope CR detail.

## Deviations from Plan

- CSS grid tách ra `src/views/cr-detail.css` thay vì `<style>` inline trong JSX, theo convention `TasksView.tsx` import `tasklist-workspace.css`. Test guard cập nhật: grid không chứa `<style>`.

## Hard lock

Không đụng/stage file peer: `src/components/tasks/TaskDrawer.tsx`, `src/workbench/__tests__/DocumentSetDetailPublished.test.tsx`, `tests/views/ItemInsightView.test.tsx`, `.planning/STATE.md`, artifact quick khác. Không push cho tới khi peer 85 báo drawer xong.

## Known Stubs

None.

## Threat Flags

None — chỉ đổi render/CSS local, không thêm endpoint, auth, file access hay schema.
