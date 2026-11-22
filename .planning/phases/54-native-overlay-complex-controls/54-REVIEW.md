---
phase: 54-native-overlay-complex-controls
reviewed: 2026-11-22T05:32:53Z
depth: deep
diff_base: 555c6a9a
files_reviewed: 18
files_reviewed_list:
  - src/components/ui/date-picker.tsx
  - src/components/ui/form.tsx
  - src/components/ui/grid.tsx
  - src/components/ui/icon.tsx
  - src/components/ui/image.tsx
  - src/components/ui/list.tsx
  - src/components/ui/native/popup.tsx
  - src/components/ui/openidea/Calendar.module.css
  - src/components/ui/openidea/List.module.css
  - src/components/ui/slider.tsx
  - src/components/ui/table.tsx
  - src/components/ui/time-picker.tsx
  - src/components/ui/tree-select.tsx
  - src/components/ui/tree.tsx
  - src/components/ui/typography.tsx
  - src/components/ui/__tests__/fakeRenderRegression.test.tsx
  - src/components/ui/__tests__/overlayPopups.test.tsx
  - e2e/native-controls-parity.spec.ts
findings:
  critical: 2
  warning: 4
  info: 2
  total: 8
status: issues_found
---

# Phase 54: Code Review Report — fake-control remediation (deep)

**Reviewed:** 2026-11-22T05:32:53Z
**Depth:** deep
**Files Reviewed:** 18
**Status:** issues_found

## Summary

Review cái nhìn thù địch đối với 18 source files của remediation sau fake-control audit. Xác nhận các mục tiêu chính đạt được: DatePicker là calendar thật (7 cột, month/year header, keyboard, disabledDate, range tint, allowClear), icon mặc định 16×16 (`metrics.iconSize = spacing.md = 16px`, test xác nhận), Popup BODY-portal giữ API. Tuy nhiên tìm thấy **2 regression/critical làm sai hành vi ởcaller thật** (Col layout, DateRangePicker mất ngày đầu) và **4 warning** (filter Table cộng dồn, TimePicker mở lại sau pick, Slider uncontrolled không cập nhật, test range chỉ certificate shape). Các probe jsdom tạm đã chạy để chứng minh và đã xoá; `tsc --noEmit` exit 0; 31 test scoped pass. Không Commit.

## Critical Issues

### CR-01: `Col` sinh `gridColumn: "0 / span N"` — CSS không hợp lệ, span bị bỏ qua ở mọi caller không có `offset`

**File:** `src/components/ui/grid.tsx:89-91`

**Issue:** `activeOffset ?? 0` cho ra chuỗi `"0 / span 8"` khi caller không truyền `offset`. Line number của CSS Grid là **1-based**; line `0` không hợp lệ nên browser/jsdom từ chối toàn bộ giá trị → `gridColumn` rỗng → `span` vô hiệu, `Col` co về `auto`. Đây là **regression trực tiếp** từ diff này: code cũ phát `span 8` (hợp lệ). Probe jsdom xác nhận:

```
<Col span={8}>            → style.gridColumn = ""   (computed auto)
<Col xs={24} sm={12}>     → cùng kết quả
assign "0 / span 8"       → ""        (bị từ chối)
assign "1 / span 8"       → "1 / span 8"
```

Blast radius lớn: `DailyReviewModal` (`span={6}`, `span={8}`), `GitHubConfigCard`, `JiraConfigCard`, `NotificationSettingsCard`, `WeeklyCapacityForm`, toàn bộ 8 `<Col xs={24} sm={12} lg={6}>` trong `TaskFilterBar` — tất cả dùng responsive value **không có `offset`** nên layout vỡ. Ngoài ra nhánh có `offset` cũng **off-by-one**: test `fakeRenderRegression.test.tsx:86-88` kỳ vọng `"2 / span 12"` cho `offset={2}`, nhưng CSS line 2 chỉ bỏ qua 1 cột; AntD `offset={2}` phải là line 3 → test đang certificate giá trị sai.

**Fix:**
```tsx
const gridColumn = resolvedSpan !== undefined
  ? activeOffset !== undefined
    ? `${activeOffset + 1} / span ${resolvedSpan}`   // CSS grid lines are 1-based
    : `span ${resolvedSpan}`
  : activeOffset !== undefined
    ? `${activeOffset + 1} / auto`
    : undefined;
```
Cập nhật test: kỳ vọng `"3 / span 12"` cho `offset={2}` và thêm assert `<Col span={8}>` → `"span 8"` (không có offset).

### CR-02: `DateRangePicker` không có state nội bộ — mất ngày đầu, không chọn được range ở caller controlled

**File:** `src/components/ui/date-picker.tsx:292-314` (`pair`, `commit`), `358-365` (`Calendar`)

**Issue:** `commit()` luôn đọc `pair = value ?? [null,null]` (thuần prop), không lưu lựa chọn trung gian. Caller chính đều **gate trên cả hai ngày**: `TaskFilterBar.tsx:263-345` (3 range) và `FeasibilityModal.tsx:380-388` chỉ ghi lại khi `dates[0] && dates[1]`. Chuỗi tương tác thực tế:

1. Click input đầu, pick ngày 05 → `onChange([05, null])` → caller bỏ qua (chưa đủ 2) → `value` vẫn `null`.
2. Click input cuối, pick ngày 12 → `pair` vẫn `[null,null]` → `onChange([null, 12])` → caller lại bỏ qua.

Probe với đúng pattern gate của FeasibilityModal cho kết quả `["", "2026-11-12"]` — range **không bao giờ hình thành** bằng click, dù component được quảng cáo là range picker. `active` đổi sang 1 sau pick đầu, nhưng không có local echo nên dữ liệu bay. Đây là lỗi hành vi, không phải shape.

**Fix:** giữ một draft pair nội bộ, sync từ prop khi prop đổi, và commit vào draft ngay cả khi controlled:
```tsx
const [draft, setDraft] = useState<[DateValue, DateValue]>(pair);
useEffect(() => setDraft(pair), [pair[0], pair[1]]);

function commit(next: Dayjs) {
  const updated: [DateValue, DateValue] =
    active === 0 ? [next, draft[1]] : [draft[0], next];
  setDraft(updated);
  setTexts([formatValue(updated[0], format), formatValue(updated[1], format)]);
  setOpen(false);
  anchorRef.current?.focus();
  onChange?.(updated, [updated[0]?.format(format) ?? '', updated[1]?.format(format) ?? '']);
  if (active === 0) setActive(1);
}
```

## Warnings

### WR-01: Bộ lọc `Table` cộng dồn giá trị khi đổi lựa chọn trong `<select>`

**File:** `src/components/ui/table.tsx:248-259` (handler), `174-184` (`toggleFilter`)

**Issue:** Handler gọi `toggleFilter(key, previous, false)` rồi `toggleFilter(key, nextValue, true)`, nhưng cả hai đều đọc `filterState` từ closure render cũ. Lần hai thấy `current = [A]` (stale) nên tạo `['A','B']`. Probe xác nhận:

```
chọn A    → { status: ["A"] }
đổi sang B → { status: ["A","B"] }   // sai
```

`<select value={String(filterState[key]?.[0] ?? '')}>` sau đó vẫn hiện `A`. Filter single-select nhưng phát payload multi-value, `filtered` lọc OR → sai tập dữ liệu.

**Fix:** thay bằng một functional update thiết lập đúng một giá trị cho cột (single-select) và emit một lần:
```tsx
function setFilterValue(key: string, value: string) {
  const next = { ...filterState, [key]: value ? [value] : [] };
  setFilterState(next);
  onChange?.({ ...pageConfig, current: currentPage, pageSize } as TablePaginationConfig,
    next as never, {} as never, { currentDataSource: [...filtered], action: 'filter' });
}
```

### WR-02: `TimePicker` mở lại popup ngay sau khi pick time

**File:** `src/components/ui/time-picker.tsx:193` (`onFocus`), `167-176` (`close`/`pick`)

**Issue:** `close()` đặt `open:false` rồi gọi `anchorRef.current?.focus()`. Input có `onFocus={() => setOpen(true)}` nên focus restore kích hoạt mở lại. Probe: sau khi click 1 option, `onChange` gọi 1 lần nhưng popup vẫn còn trong DOM (`STILL OPEN`), `activeElement` là input. Người dùng không thể đóng picker bằng cách chọn giờ. (Bug có sẵn trong base nhưng nằm trong file được "repair" ở wave này — keyboard nav mới thêm ở `TimeColumn` — và chưa được test bắt.)

**Fix:** chặn mở trong lần focus restore:
```tsx
const suppressOpen = useRef(false);
function close() {
  suppressOpen.current = true;
  setState((p) => ({ ...p, open: false }));
  anchorRef.current?.focus();
  queueMicrotask(() => { suppressOpen.current = false; });
}
// onFocus:
onFocus={() => { if (!suppressOpen.current) setState((p) => ({ ...p, open: true })); }}
```

### WR-03: `Slider` uncontrolled không cập nhật vị trí handle sau commit

**File:** `src/components/ui/slider.tsx:72-76`, `46-55`

**Issue:** `commit()` ghi `uncontrolledRef.current = output` nhưng không có state update → không re-render → `current`/`values` vẫn là giá trị cũ. Probe `<Slider defaultValue={10}>` + ArrowRight: `onChange(11)` nhưng `aria-valuenow` vẫn `10`, `left` vẫn `calc(10% + 6.4px)`. Vi phạm hợp đồng uncontrolled mode của AntD. Hiện tại mọi caller (`InlineProgress`, `TaskDrawer`) đều truyền `value` qua `FormItem`, nên chưa lộ ra — nhưng API vẫn sai và test `fakeRenderRegression.test.tsx:95-102` chỉ kiểm tra `onAfterChange`, không bắt trường hợp này.

**Fix:** force re-render khi uncontrolled commit:
```tsx
const [, force] = useReducer((n: number) => n + 1, 0);
// trong commit:
if (controlled === undefined) { uncontrolledRef.current = output; force(); }
```

### WR-04: Test range DatePicker certificate shape, không certificate hành vi chọn 2 bước

**File:** `src/components/ui/__tests__/overlayPopups.test.tsx:381-423`

**Issue:** Test truyền `value={[dayjs('2026-01-05'), dayjs('2026-01-07')]}` (đã đầy đủ 2 đầu) rồi click 1 cell và assert `Array.isArray(dates)` + `strings.length === 2`. Nó **không** mô phỏng luồng thực tế (bắt đầu từ `value = null`, pick đầu rồi pick cuối) nên hoàn toàn không phát hiện CR-02. Đây chính là dạng "test certify fake behavior" mà remediation muốn triệt tiêu.

**Fix:** thêm test với caller gate giống `FeasibilityModal`, render `value={null}`, pick ngày đầu rồi ngày cuối, assert `onChange` cuối cùng nhận `[Dayjs, Dayjs]` đủ 2 đầu và string tương ứng — test này sẽ đỏ cho đến khi CR-02 được sửa.

## Info

### IN-01: `TimeColumn` dùng id cố định toàn cục

**File:** `src/components/ui/time-picker.tsx:71,97` (`id="tp-h"/"tp-m"/"tp-s"`, `"tr-*"`)

**Issue:** Hai `TimePicker`/`TimeRangePicker` trên cùng trang tạo trùng DOM id (`tp-h-0`, …), làm `aria-activedescendant` mơ hồ và HTML không hợp lệ. `querySelector` trong `onColumnKeyDown` đã scoped theo `columnRef` nên scroll đúng, nhưng id vẫn trùng.

**Fix:** tiền tố hoá bằng `useId()` giống `Tree.tsx:108`.

### IN-02: `WEEKDAYS`/`YEARS` đóng băng theo thời điểm import module

**File:** `src/components/ui/date-picker.tsx:37-38`

**Issue:** `CURRENT_YEAR = dayjs().year()` và `YEARS` được tính lúc module load. App chạy qua ranh giới năm sẽ giữ danh sách năm cũ. Không ảnh hưởng UAT hiện tại; có thể tính trong render nếu cần.

**Fix:** chuyển vào `useMemo` trong `Calendar` nếu muốn đúng sau midnight 31/12.

---

_Reviewed: 2026-11-22T05:32:53Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
