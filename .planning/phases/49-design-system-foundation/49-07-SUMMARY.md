---
phase: 49-design-system-foundation
plan: 07
subsystem: ui
tags: [antd-wrappers, same-name-barrel, status-color-map, d12-parity, scanner-coverage]

requires:
  - phase: 49-design-system-foundation
    provides: tokens.contract.ts helpers, statusColorMap from plan 02, wrapper families from plans 03-06

provides:
  - 14 real AntD wrappers (Divider/Avatar/Skeleton/Segmented/Statistic/Result/Breadcrumb/AutoComplete/Slider/Pagination/Image/Layout/List/App), each calling a contract helper
  - Complete same-name barrel at src/components/ui/index.ts for all wrappers and consumed prop types
  - D-12 status parity tests across StatusTag, Badge, StatusDot in light and dark
  - Read-only live-tree coverage: 52 consumed value components + 141 icons, 253 wrapped names, zero missing, zero pass-through

affects:
  - Plan 08 coverage gate starts from the complete barrel and zero-missing scanner state
  - Phase 50 migrates app imports to the single src/components/ui surface

tech-stack:
  added: []
  patterns:
    - AntD 6 components without a `style` prop (AutoComplete/Pagination/Image) receive `--ui-*` metrics through `styles.root`; caller styles override last
    - Generic wrappers preserve caller literal unions (`Segmented<ValueType>`, `List<T>`)
    - Consumed AntD statics mirrored under wrapper-owned names; no bare `export { X } from 'antd'`
    - Status parity asserts exact hex on CSS custom properties and rgb-normalized equality on rendered colors

key-files:
  created:
    - src/components/ui/divider.tsx
    - src/components/ui/avatar.tsx
    - src/components/ui/skeleton.tsx
    - src/components/ui/segmented.tsx
    - src/components/ui/statistic.tsx
    - src/components/ui/result.tsx
    - src/components/ui/breadcrumb.tsx
    - src/components/ui/auto-complete.tsx
    - src/components/ui/slider.tsx
    - src/components/ui/pagination.tsx
    - src/components/ui/image.tsx
    - src/components/ui/layout.tsx
    - src/components/ui/list.tsx
    - src/components/ui/app.tsx
  modified:
    - src/components/ui/index.ts
    - src/components/ui/__tests__/controls.test.tsx
    - src/components/ai/ActiveAiTurnIndicator.tsx

key-decisions:
  - "App wrapper added although not in the plan's 13-file list: scanConsumedAntd('src') reported App as a consumed value (imported inside ui/message.tsx and ui/notification.tsx), so D-04 requires a real wrapper file."
  - "MenuProps is an AntD type but one app file imported it as a value; converted that import to `type MenuProps`, which both fixes the false missing-wrapper report and satisfies D-19 allowTypeImports. No fake runtime export created."
  - "AntD 6 exports no `SliderProps` alias; the wrapper uses the exported SliderSingleProps | SliderRangeProps union."
  - "SegmentedValue is imported type-only from @rc-component/segmented because AntD 6 root does not re-export it."
  - "Task 3 is verification-only (read-only scanner check); no file changes, so no third commit was created."

requirements-completed: [CTRL-01, CTRL-05, CTRL-06, GUARD-03]

duration: ~13min
completed: 2026-11-21
---

# Phase 49 Plan 07: Design System Foundation — Final Wrappers & Status Parity Summary

**Complete same-name AntD wrapper barrel with 14 token-backed wrappers and a single D-12 status map verified identical across Tag/Badge/StatusDot in both themes**

## Performance

- **Duration:** ~13 phút
- **Started:** 2026-11-21T08:48:14Z
- **Completed:** 2026-11-21T09:00:59Z
- **Tasks:** 3/3 (Task 3 verification-only)
- **Files modified:** 17 (14 created, 3 modified)

## Accomplishments

- Task 1: 13 wrapper utility/layout theo artifact list cộng thêm `app.tsx` cho tên `App` do scanner báo thiếu. Mọi file gọi `getSharedControlTokens()` hoặc `getStatusTokens()`. Static AntD đã consumed (`Image.PreviewGroup`, `List.Item`, `List.Item.Meta`, `Skeleton.*`, `Statistic.Countdown/Timer`, `Breadcrumb.Item`, `Layout.*`, v.v.) được mirror dưới tên wrapper-owned.
- Task 2: `index.ts` chốt barrel đầy đủ — mọi wrapper và prop type theo cùng tên AntD, gồm 4 type bổ sung (`InputRef`, `NotificationArgsProps`, `TableColumnsType`, `ThemeConfig`). `controls.test.tsx` thêm 3 test parity: 5 status × 2 mode × 3 surface, kèm source-string check chặn literal hex trong `tag.tsx`/`badge.tsx`/`status-dot.tsx`.
- Task 3: Scanner live-tree báo `consumed components 52 / icons 141 / wrapped 253 / missing [] / pass-through []`. Không có allowlist, KNOWN_PENDING hay skip list.
- Scoped Vitest: 4 file / 32 test pass với `--bail=1`; `npx tsc --noEmit` exit 0. Không chạy full suite.

## Task Commits

1. **Task 1: Wrap remaining utility/layout controls** — `f3d2afad` (feat)
2. **Task 2: Finalize barrel and add status-map parity test** — `34d7ddaa` (feat)
3. **Task 3: Read-only full-tree coverage check** — verification-only, không có file change nên không tạo commit.

## Files Created/Modified

- `src/components/ui/{divider,avatar,skeleton,segmented,statistic,result,breadcrumb,auto-complete,slider,pagination,image,layout,list,app}.tsx` — 14 wrapper thật, contract helper visible, static mirror
- `src/components/ui/index.ts` — complete same-name barrel + type exports
- `src/components/ui/__tests__/controls.test.tsx` — D-12 status parity section
- `src/components/ai/ActiveAiTurnIndicator.tsx` — `MenuProps` đổi sang `import type`

## Decisions Made

- `App` không nằm trong danh sách 13 file của plan nhưng scanner báo thiếu; tạo wrapper thật thay vì bỏ qua.
- `MenuProps` là type, không phải component: sửa import tại call site thay vì tạo runtime export giả. Đây là fix biênD-19, không migrate app.
- AntD 6 không có `SliderProps`; dùng union `SliderSingleProps | SliderRangeProps`. `SegmentedValue` lấy type-only từ `@rc-component/segmented`.
- Các component không có `style` prop (AutoComplete/Pagination/Image) nhận `--ui-*` qua `styles.root` như plan 06 đã làm với Dropdown.
- Task 3 là read-only check, không đụng file nên không có commit riêng; đã chạy scanner trực tiếp và scoped test.

## Deviations from Plan

None về scope — plan chạy đúng 3 task, không migrate app. Có 4 auto-fix biên cần ghi:

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `App` là consumed value nhưng không có wrapper**
- **Found during:** Task 1 (re-derive `scanConsumedAntd('src')`)
- **Issue:** Scanner báo `App` thiếu; chỉ tồn tại trong `message.tsx` và `notification.tsx` dưới tên `AntApp`.
- **Fix:** Tạo `src/components/ui/app.tsx` với `App`/`useApp`/`AppProps` gọi `getSharedControlTokens()`.
- **Files modified:** `src/components/ui/app.tsx`
- **Commit:** `f3d2afad`

**2. [Rule 1 - Bug] `MenuProps` import nhầm thành value**
- **Found during:** Task 1 (coverage re-check)
- **Issue:** `ActiveAiTurnIndicator.tsx` import `MenuProps` không có `type`, scanner tính là value component thiếu wrapper.
- **Fix:** Đổi sang `type MenuProps`. Type đã có sẵn trong `menu.tsx` và barrel.
- **Files modified:** `src/components/ai/ActiveAiTurnIndicator.tsx`
- **Commit:** `f3d2afad`

**3. [Rule 3 - Blocking] `SliderProps` / `SegmentedValue` không export từ AntD 6 root**
- **Found during:** Task 1
- **Issue:** `tsc` báo TS2305 khi import `SegmentedValue` từ `antd`; `SliderProps` cũng không tồn tại.
- **Fix:** `SegmentedValue` import type-only từ `@rc-component/segmented`; Slider dùng `SliderSingleProps | SliderRangeProps`.
- **Files modified:** `src/components/ui/segmented.tsx`, `src/components/ui/slider.tsx`
- **Commit:** `f3d2afad`

**4. [Rule 1 - Bug] Skeleton không có statics `Paragraph`/`Title`**
- **Found during:** Task 1
- **Issue:** AntD 6 `Skeleton` chỉ có Button/Avatar/Input/Image/Node; mirror `Paragraph`/`Title` gây TS2339.
- **Fix:** Bỏ 2 static không tồn tại, giữ `SkeletonNode`.
- **Files modified:** `src/components/ui/skeleton.tsx`
- **Commit:** `f3d2afad`

## Issues Encountered

- jsdom normalize color sang `rgb()`; test dùng `hexToRgb()` cho rendered color và giữ exact-hex assertion trên CSS custom property `--ui-status-color`.
- Badge custom property nằm trên `.ant-badge-count`/`.ant-badge-dot`, không phải `.ant-badge`; test chọn đúng surface.
- Không chạy full Vitest suite theo giới hạn dự án; chỉ 4 file UI scope.

## User Setup Required

None.

## Known Stubs

None. Mọi wrapper forward component AntD thật với default từ token; không placeholder, TODO, mock data hay empty re-export.

## Threat Flags

None. Không endpoint mạng, auth path, file access hay schema change mới. T-49-14 thỏa bằng 3 test parity và source-string check; T-49-15 thỏa bằng `isPassThroughWrapper` trên mọi file ui/; T-49-18 thỏa bằng scanner live-tree trả `[]`; T-49-SC không có install nào.

## Next Phase Readiness

- Plan 08 có thể cắm coverage gate vào `findMissingWrappers(scanConsumedAntd('src'), scanWrappers('src/components/ui'))` — hiện đã `[]` với 52 components + 141 icons.
- Barrel là single import surface cho Phase 50; mọi wrapper và prop type đã có same-name export.

## Self-Check: PASSED

- 14 file wrapper mới + barrel + test tồn tại trên disk.
- Commit `f3d2afad`, `34d7ddaa` có trong `git log`.
- `npx tsc --noEmit` exit 0.
- Scoped Vitest: 4 file / 32 test pass với `--bail=1`.
- Scanner live-tree: consumed 52 + icons 141, wrapped 253, missing `[]`, pass-through `[]`.

---
*Phase: 49-design-system-foundation*
*Completed: 2026-11-21*
