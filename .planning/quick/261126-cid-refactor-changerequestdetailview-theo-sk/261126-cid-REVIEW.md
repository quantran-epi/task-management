# Quick 261126-cid: Code Review Report

**Reviewed:** 2026-11-26T10:40:00Z
**Depth:** deep (scoped strictly to 6 files, diff `d38b7072..c2a00511`)
**Files Reviewed:** 6
**Status:** clean (sau fix commit `5b21c2e8`; các finding ban đầu được ghi lại bên dưới để audit)

## Scope

Chỉ review diff của 3 commit `80f49e10`, `b60e334c`, `c2a00511` so với `d38b7072`, giới hạn 6 file. Không đụng `src/components/ai/*`, `src/workbench/toolwindows/RightToolWindow.tsx`, `tests/ai/*`, `tests/phase51/*` (thuộc session khác). Phát hiện dưới đây đều là do diff này sinh ra hoặc làm nặng thêm; không báo lỗi có từ trước.

Targeted tests (`TaskTable.test.tsx`, `ChangeRequestDetailView.test.tsx`): 28/28 pass. Không thay source file nào.

## Warnings

### WR-01: Số "Nhắc nhở" ở stats strip và ở card không khớp nhau

**File:** `src/views/ChangeRequestDetailView.tsx:113` (đối chiếu `src/views/ChangeRequestDetailView.tsx:256`)

**Issue:** Commit `c2a00511` đổi stats strip thành
`reminderCount: Math.max(cr?.reminders?.length ?? 0, cr?.reminderDate ? 1 : 0)`,
nhưng badge của block "Nhắc nhở" vẫn giữ nguyên biểu thức cũ
`count: cr.reminders?.length ?? (cr.reminderDate ? 1 : 0)`.

Khi CR có `reminders: []` (mảng rỗng, không phải `undefined`) kèm `reminderDate` legacy:
- Stats strip hiện `DOC / REMINDER = n / 1` (vì `Math.max(0, 1) = 1`);
- Badge block hiện `0` (vì `[]?.length = 0` nên `??` không rơi vào nhánh `reminderDate`);
- Body block lại render đúng reminder legacy (nhánh `cr.reminderDate` ở dòng 268).

Trạng thái `reminders: []` + `reminderDate` vẫn tạo được qua `updateChangeRequest` (`src/db/repositories/changeRequestRepo.ts:151-153` gán `updated.reminders = []` mà không xóa `reminderDate`). Diff cố tình sửa trường hợp legacy này ở stats nhưng bỏ sót badge, nên cùng một con số hiển thị hai giá trị ngay trên cùng một màn hình. Đây là inconsistency do diff tạo ra (trước diff không có stats strip nên không có sự so sánh này).

**Fix:** Dùng chung một nguồn tính cho cả hai. Ví dụ:

```tsx
const reminderCount = Math.max(cr?.reminders?.length ?? 0, cr?.reminderDate ? 1 : 0);
// stats:
reminderCount,
// block:
count: reminderCount,
```

Hoặc tách helper `countReminders(cr)` rồi gọi ở cả dòng 113 lẫn 256, kèm test cho ca `reminders: []` + `reminderDate`.

---

### WR-02: Sticky header offset gắn qua `document.querySelector` + `data-testid`, không có fallback

**File:** `src/components/tasks/TaskTable.tsx:141-148`

**Issue:** Code mới:

```tsx
useEffect(() => {
  const bar = document.querySelector<HTMLElement>('[data-testid="task-filter-bar"]');
  if (!bar || typeof ResizeObserver === 'undefined') return;
  const observer = new ResizeObserver(() => setStickyHeaderOffset(Math.ceil(bar.getBoundingClientRect().height)));
  observer.observe(bar);
  return () => observer.disconnect();
}, []);
```

Ba điểm yếu do diff này đưa vào:

1. **Coupling qua test attribute.** `TaskTable` phụ thuộc vào `data-testid="task-filter-bar"` của `TaskFilterBar` (được thêm ở commit `b60e334c`). Đây là thuộc tính dùng cho test, không phải contract giữa hai component. Đổi/sửa testid hoặc tách bar ra khỏi `TasksView` là header dính sai lệch mà không có lỗi hay type-check nào báo.
2. **Truy vấn global, không scope.** `document.querySelector` lấy phần tử đầu tiên trong toàn bộ document. Nếu có nhiều hơn một `TaskFilterBar` được mount cùng lúc (tab khác, popout, 또는 view khác trong workbench), `TaskTable` sẽ đo nhầm chiều cao của bar không liên quan tới nó.
3. **Không có fallback.** Nếu `ResizeObserver` không tồn tại hoặc bar chưa mount lúc `useEffect` chạy, `stickyHeaderOffset` giữ nguyên `0` vĩnh viễn; AntD `sticky={{ offsetHeader: 0 }}` làm header bảng dính ngay dưới filter bar đã pinned ở `top: 0` (`TaskFilterBar.tsx:73-76`) → hai lớp chồng lên nhau, chính là lỗi mà commit này đang cố sửa.

**Fix:** Truyền offset/chiều cao từ `TasksView` xuống qua prop hoặc context thay vì querySelector; đồng thời đặt giá trị khởi tạo an toàn, ví dụ đo trực tiếp bằng `ref` được truyền vào:

```tsx
// TasksView: const filterBarRef = useRef<HTMLDivElement>(null);
// truyền xuống: <TaskTable filterBarRef={filterBarRef} ... />
const height = filterBarRef.current?.offsetHeight ?? 0;
```

Nếu giữ cách đo hiện tại, ít nhất cần fallback `offsetHeader` khác 0 (hoặc bỏ sticky header) khi `ResizeObserver` thiếu, và scope query bằng `tableRef.current?.closest(...)` thay vì `document`.

---

## Verified-clean (không phải finding)

- `cr.updatedAt.slice(0, 10)` (dòng 346) an toàn: `updatedAt` là field bắt buộc, được gán ở mọi path tạo/migrate (`src/db/index.ts:328-344`, `changeRequestRepo.ts:70,106`) và bắt buộc trong `BackupChangeRequestRecordSchema`.
- Bỏ filter `n.type !== 'diagram'` (dòng 93) là cố tình, giúp `noteCount` khớp với `EntityNotesSection` (cùng filter `entityType`/`!deletedAt`). Không phải lỗi.
- Nhãn `MỞ / PENDING` đếm mọi status không phải `Done`/`Cancelled`; đúng theo quyết định ghi trong `261126-cid-PLAN.md`. Không báo.
- `BatchActionBar`, `TaskFilterBar`, các test assertion mới và `autoSize={false}` của `Textarea`: không phát hiện lỗi correctness/security.

## Tóm tắt

| Severity | Số lượng |
|---|---|
| Critical | 0 |
| Warning | 2 |
| Info | 0 |

Không có lỗi bảo mật hay mất dữ liệu. Hai warning đều là consistency/robustness do chính diff tạo ra: một ở số đếm reminder, một ở cơ chế sticky header.

---

## Re-review final — 2026-11-26

**Scope:** diff `d38b7072..5b21c2e8`, 7 file (6 file ban đầu + `src/views/TasksView.tsx` cho ref wiring).
**Verdict:** clean — 0 critical, 0 warning, 0 info.

- **WR-01 resolved:** `ChangeRequestDetailView.tsx:113` và `:256` cùng dùng `stats.reminderCount = Math.max(cr?.reminders?.length ?? 0, cr?.reminderDate ? 1 : 0)`. Regression test `tests/views/ChangeRequestDetailView.test.tsx` cho ca `reminders: []` + `reminderDate` legacy.
- **WR-02 resolved:** `TaskTable.tsx` bỏ `document.querySelector`/testid, dùng `filterBarRef?.current` từ `TasksView` (một `useRef` duy nhất truyền qua `containerRef`), fallback `96px`, đo ngay khi mount, disconnect observer khi cleanup. Regression test `tests/components/TaskTable.test.tsx` khẳng định offset nonzero khi không có filter bar mounted.
- Targeted tests: 44/44 pass (5 file). `npx tsc --noEmit`: không có lỗi trong file scope.
- Không có finding mới. Out-of-scope AI files thuộc session khác, không review.
