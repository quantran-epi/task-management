---
phase: 49-design-system-foundation
plan: 06
subsystem: ui
tags: [antd-wrappers, token-policy, typography-roles, status-color-map, layout-controls]

requires:
  - phase: 49-design-system-foundation
    provides: tokens.contract.ts helpers, tokens.ts status map, Button/Input wrapper pattern từ plan 03, status + complex wrappers từ plan 04/05

provides:
  - 15 wrapper AntD thật (Card/Descriptions/Grid/Typography/Space, Alert/Empty/Dropdown/Spin/Checkbox, Progress/Switch/Radio/Tabs/Collapse), mỗi file gọi helper từ tokens.contract.ts
  - Typography dùng 4 font role khóa 11/12/13/16px, không inline font-size lẻ/fractional
  - Static AntD đã consumed (Descriptions.Item, Grid.useBreakpoint, Empty.PRESENTED_IMAGE_*, Radio.Group/Button, Space.Compact, Tabs.TabPane, Collapse.Panel, Card.Grid/Meta, Dropdown.Button, Alert.ErrorBoundary...) được mirror dưới tên wrapper-owned

affects:
  - Plan 07 chốt barrel index.ts và status parity test; plan 08 chạy coverage gate với 15 file này
  - Phase 50 migrate app import sang cùng-name wrapper

tech-stack:
  added: []
  patterns:
    - Metric token phát ra dưới dạng CSS custom property --ui-*; caller style vẫn override cuối
    - Status tone chỉ lấy qua getStatusTokens(status, mode) từ D-12 map; active mode từ useThemeMode()
    - Text/Title/Paragraph là named export trong cùng typography.tsx, không tạo file riêng (scanner consumed tên Typography)

key-files:
  created:
    - src/components/ui/card.tsx
    - src/components/ui/descriptions.tsx
    - src/components/ui/grid.tsx
    - src/components/ui/typography.tsx
    - src/components/ui/space.tsx
    - src/components/ui/alert.tsx
    - src/components/ui/empty.tsx
    - src/components/ui/dropdown.tsx
    - src/components/ui/spin.tsx
    - src/components/ui/checkbox.tsx
    - src/components/ui/progress.tsx
    - src/components/ui/switch.tsx
    - src/components/ui/radio.tsx
    - src/components/ui/tabs.tsx
    - src/components/ui/collapse.tsx
  modified: []

key-decisions:
  - "scanConsumedAntd('src') chạy trước khi code: 16/19 tên được list trực tiếp; Text/Title/Paragraph chỉ xuất hiện dưới dạng Typography.* nên nằm cùng typography.tsx theo artifact requirement của plan, không tạo file orphan"
  - "Font role 11/12/13px dùng CSS var khóa (--font-size-xs/small/ui); heading 16px lấy từ spacing.md của getSharedControlTokens() làm fallback, không hex hay fractional inline style"
  - "Alert type và Progress status map vào StatusKind rồi mới gọi getStatusTokens(..., mode), nên light/dark đều trả đúng hex từ map chung"
  - "Checkbox controlSize là policy prop ('small'|'middle'|'large'); RadioGroup dùng cùng ControlSize union, map sang AntD size"
  - "AntD 6 DropdownProps không có style prop nên token metric đi qua styles.root; Empty styles.description lấy --fg-muted thay vì Literal color"

requirements-completed: [CTRL-01, CTRL-06, GUARD-03]

duration: ~7min
completed: 2026-11-21
---

# Phase 49 Plan 06: Design System Foundation — Layout & Utility Control Wrappers Summary

**Mười lăm wrapper AntD có token contract thật, gồm font role khóa và status tone từ bản đồ D-12 dùng chung**

## Performance

- **Duration:** ~7 phút
- **Started:** 2026-11-21T08:38:58Z
- **Completed:** 2026-11-21T08:46:00Z
- **Tasks:** 3/3
- **Files modified:** 15 (tất cả tạo mới; không đụng barrel, test hay app call site)

## Accomplishments

- Task 1: 5 wrapper layout (Card/Descriptions/Grid/Typography/Space). Grid gồm `Row`, `Col`, namespace `Grid.useBreakpoint`; Typography gồm `Text`, `Title`, `Paragraph` với `FontRole` đóng ('meta'|'label'|'body'|'heading').
- Task 2: 5 wrapper feedback/selection. Alert lấy tone theo active theme; Empty/Dropdown/Spin/Checkbox dùng metric chung và mirror static đã consumed.
- Task 3: 5 wrapper display. Progress map status → D-12; Switch/Radio/Tabs/Collapse phát custom property từ `getSharedControlTokens()`.
- Mọi file đều có lời gọi contract helper visible; node per-file gate và scan bare re-export đều sạch.
- `npx tsc --noEmit` exit 0. Scoped Vitest: 4 file / 29 test pass (`antdInventory.test.ts`, `controls.test.tsx`, `tokens.test.ts`, `button.test.tsx`) với `--bail=1`; không chạy full suite.

## Task Commits

1. **Task 1: Wrap layout-oriented controls (Card/Descriptions/Grid/Typography/Space)** — `bb78ea58` (feat)
2. **Task 2: Wrap feedback and selection controls (Alert/Empty/Dropdown/Spin/Checkbox)** — `c0eb6c3c` (feat)
3. **Task 3: Wrap display controls (Progress/Switch/Radio/Tabs/Collapse)** — `5d33b185` (feat)

## Files Created/Modified

- `src/components/ui/card.tsx` — radius/height/font token; `CardGrid`, `CardMeta`
- `src/components/ui/descriptions.tsx` — label/value metric; `DescriptionsItem`
- `src/components/ui/grid.tsx` — `Row`, `Col`, `Grid.useBreakpoint`, gutter mặc định từ token
- `src/components/ui/typography.tsx` — `Text`, `Title`, `Paragraph`, `Typography` namespace, 4 font role khóa
- `src/components/ui/space.tsx` — gap mặc định từ token; `SpaceCompact`
- `src/components/ui/alert.tsx` — tone từ D-12 theo theme; `AlertErrorBoundary`
- `src/components/ui/empty.tsx` — text color từ `--fg-muted`; `EmptyImageSimple`, `EmptyImageDefault`
- `src/components/ui/dropdown.tsx` — menu metric qua `styles.root`; `DropdownButton`
- `src/components/ui/spin.tsx` — accent từ status map; `setDefaultSpinIndicator`
- `src/components/ui/checkbox.tsx` — policy `controlSize`; `CheckboxGroup`
- `src/components/ui/progress.tsx` — status → D-12 color, font metric
- `src/components/ui/switch.tsx` — height/radius/font token
- `src/components/ui/radio.tsx` — `Radio`, `RadioGroup`, `RadioButton` cùng policy
- `src/components/ui/tabs.tsx` — gutter/indicator token; `TabPane`
- `src/components/ui/collapse.tsx` — header metric token; `CollapsePanel`

## Decisions Made

- Scanner là nguồn inventory; `Text`/`Title`/`Paragraph` không đứng riêng trong scanner vì app import `Typography`. Chúng được export như named exports trong `typography.tsx`, đúng artifact requirement mà không tạo wrapper orphan.
- `fontSize` 13.5px của `sharedTokens` không bao giờ đưa thẳng vào `font-size` inline. Typography dùng CSS var 11/12/13px và heading fallback 16px nguyên (`spacing.md`).
- Status color chỉ đi qua `getStatusTokens`, active mode lấy từ `useThemeMode()`; không literal hex trong wrapper.
- Static AntD được mirror dưới tên mới thay vì `export { X } from 'antd'`, giữ D-03 một file một control và thỏa anti-pass-through gate.

## Deviations from Plan

None — plan thực hiện đúng 3 task, không migrate app, không sửa barrel/test.

### Auto-fixed Issues

**1. [Rule 1 - Bug] Dropdown style prop không tồn tại trong AntD 6**
- **Found during:** Task 2
- **Issue:** `DropdownProps` AntD 6 không có `style`; bản đầu truyền `style` gây `TS2339`/`TS2375`.
- **Fix:** Chuyển token metric vào `styles.root`, giữ caller `styles` override sau.
- **Files modified:** `src/components/ui/dropdown.tsx`
- **Commit:** `c0eb6c3c`

**2. [Rule 1 - Bug] Progress style object không nhận custom property**
- **Found during:** Task 3
- **Issue:** object literal với `--ui-progress-*` không khớp `CSSProperties` dưới strict TS.
- **Fix:** Import `CSSProperties` và cast object metric; caller `rest.style` vẫn override cuối.
- **Files modified:** `src/components/ui/progress.tsx`
- **Commit:** `5d33b185`

**3. [Rule 3 - Blocking] CheckboxGroupProps không export từ root AntD**
- **Found during:** Task 2
- **Issue:** cần type chính xác thay vì tự chế `options` type.
- **Fix:** Type-only import từ `antd/es/checkbox/Group` (compile away, không thêm runtime surface).
- **Files modified:** `src/components/ui/checkbox.tsx`
- **Commit:** `c0eb6c3c`

**Total deviations:** 0 scope change; 3 compile-level fixes trong file được giao, commit cùng task tương ứng.

## Issues Encountered

- `eslint.config.mjs` chưa tồn tại (plan 08 owns), nên không chạy ESLint. Verification dùng tsc, node gates và scoped Vitest.
- Không chạy full Vitest suite theo giới hạn dự án; chỉ 4 file UI scope.

## User Setup Required

None.

## Known Stubs

None. Mọi wrapper forward component AntD thật với default từ token; không placeholder, TODO, mock data hay empty re-export.

## Threat Flags

None. Không endpoint mạng, auth path, file access hay schema change mới. T-49-15 thỏa bằng contract call visible trong từng file; T-49-18 vẫn do plan 08 enforce qua `scanConsumedAntd`; T-49-19 type-only imports compile away; T-49-SC không có install nào.

## Next Phase Readiness

- Plan 07 có thể thêm 15 wrapper vào barrel `index.ts` và status parity test cho Alert/Progress.
- Plan 08 coverage gate sẽ chấp nhận 15 file (có contract call, không bare re-export).
- Phase 50 migrate app import, giữ nguyên props hiện có trừ policy prop mới (`controlSize`, `fontRole`).

## Self-Check: PASSED

- 15 file wrapper tồn tại trên disk.
- Commit `bb78ea58`, `c0eb6c3c`, `5d33b185` có trong `git log`.
- `npx tsc --noEmit` exit 0; node gate xác nhận cả 15 file gọi contract helper và không có bare re-export.
- Scoped Vitest: 4 file / 29 test pass với `--bail=1`; không full suite.

---
*Phase: 49-design-system-foundation*
*Completed: 2026-11-21*
