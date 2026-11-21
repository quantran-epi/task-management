---
artifact: 51-CONTROL-INVENTORY
phase: 51-control-inventory-surface-audit
created: 2026-11-21
scope: INV-01, INV-02, INV-03
source: tests/helpers/antdInventory.ts
status: đang biên soạn — 51-01 viết §0-§2; 51-02 viết §3; 51-03 viết §4-§5
---

# Phase 51: Control Inventory & Surface Audit — Tồn kho control và UI surface

## 0. Cách đọc tồn kho

Artifact này là **nguồn truth duy nhất** cho danh mục control/UI surface của TaskMate trước khi thay bất kỳ dòng source nào (mục tiêu Phase 51, `.planning/ROADMAP.md:39-53`). Phạm vi: INV-01 (liệt kê control/import kèm props/state/event/keyboard-focus/validation/a11y), INV-02 (mọi UI surface), INV-03 (nhóm implementation, độ phức tạp, wrapper cần thay, behavior phải giữ).

Quy ước đọc:

- Đây là artifact **documentation-only**: không đổi source dưới `src/`, không cài dependency, không chạy full Vitest. Lệnh scoped duy nhất được dùng là `npx vitest run src/components/ui/__tests__/antdInventory.test.ts src/components/ui/__tests__/coverage.test.ts --bail=1` (xem `package.json` script `test:foundation`).
- Baseline thiết kế đã được duyệt là `/private/tmp/claude-503/-Users-tranducquan-Working-Personal-task-management/32c7be2b-546e-433a-aa53-76345c15954c/scratchpad/oi-prototype/PROOF.md` — **đường dẫn tuyệt đối, nằm ngoài repo**. `.planning/ROADMAP.md:52` ghi nhầm `scratchpad/oi-prototype/PROOF.md` (tương đối); phải dùng đường dẫn tuyệt đối ở đây.
- Mọi con số trong các phần sau phải trỏ lại bảng §1. Khi source đổi, chạy lại lệnh tái tạo rồi cập nhật artifact — không giữ số nhớ được từ `51-PATTERNS.md`.
- `scanConsumedAntd()` chỉ bắt `import { ... } from 'antd'` và `@ant-design/icons`; helper bỏ `import type` và **không thấy** static API (`message.*`, `notification.*`, `Modal.confirm`). Các dạng đó được liệt kê riêng ở §1 (đối chiếu lệch) và §3 (import tồn dư).
- Ba nhóm file không trộn vào nhau: wrapper `.tsx` (đếm), hạ tầng (`antdTheme.ts`, `index.ts`, `tokens.contract.ts`, `ui-tokens.css` — không đếm), `__tests__` (bằng chứng — không đếm).

## 1. Đối chiếu số liệu

Bốn con số bị lẫn trong `51-PATTERNS.md` được định nghĩa lại bằng lệnh chạy live tại repo root `/Users/tranducquan/Working/Personal/task-management`, ngày 2026-11-21:

| Định nghĩa | Số | Lệnh tái tạo | Ghi chú |
|---|---:|---|---|
| Số file wrapper `.tsx` trong `src/components/ui/` (không tính `__tests__`) | 56 | `find src/components/ui -maxdepth 1 -name '*.tsx' \| wc -l` | "Wrapper" theo nghĩa **file** — dùng cho cột wrapper cần thay (tiêu chí #5). |
| Số tên export首字母大写 do `scanWrappers()` thu được | 257 | `npx tsx -e "import{scanWrappers}from './tests/helpers/antdInventory';console.log(scanWrappers('src/components/ui').size)"` | **Con số guard dùng** cho tiêu chí #5: gồm icon, static subcomponent, hook, helper — không phải số file. Liệt kê từng tên ở §2.1. |
| components / icons / utilities tiêu thụ qua named import | **52/141/3** | `npx tsx -e "import{scanConsumedAntd}from './tests/helpers/antdInventory';const c=scanConsumedAntd('src');console.log(c.components.length+'/'+c.icons.length+'/'+c.utilities.length)"` | PATTERNS ghi 51/141/3; source đổi sau khi map nên live là 52 component. Lệnh là truth. |
| File test nền tảng (bằng chứng cơ chế quét) | 10 | `find src/components/ui/__tests__ -type f \| wc -l` | Bằng chứng, **không phải control**, không vào tồn kho wrapper. |

Lệnh tái tạo đầy đủ một lần (production lẫn missing guard):

```bash
npx tsx -e "import{scanConsumedAntd,scanWrappers,findMissingWrappers}from './tests/helpers/antdInventory';const w=scanWrappers('src/components/ui');const c=scanConsumedAntd('src');console.log('wrappers',w.size);console.log(JSON.stringify(c));console.log('missing',findMissingWrappers(c,w));"
# wrappers 257 ; missing []
```

### Lệch đã đối chiếu với `51-PATTERNS.md`

| PATTERNS ghi | Live | Lệnh tái tạo | Giải thích |
|---|---|---|---|
| 51 component | 52 | `npx tsx -e "import{scanConsumedAntd}from './tests/helpers/antdInventory';console.log(scanConsumedAntd('src').components.length)"` | Source đổi sau khi map; con số live là 52. |
| 28 file `import type { ... } from 'antd'` | 31 dòng / 31 file | `grep -rn "import type .* from 'antd'" src --include='*.ts' --include='*.tsx'` | Helper bỏ type-only import (`antdInventory.ts:37`) nên phải đếm riêng. Danh sách đầy đủ ở §3. |
| 10 icon deep-import | 8 dòng | `grep -rn "@ant-design/icons/" src --include='*.tsx' \| wc -l` | PATTERNS tự liệt kê 8 tên nhưng ghi nhầm số 10; dùng 8. |
| 4 file static call ngoài `ui/` | **0 call unbound**, 86 file có cú pháp `message.*`/`notification.*` | `grep -rlE '\b(message\|notification)\.(success\|error\|warning\|warn\|info\|loading\|open\|destroy)\(\|\bModal\.confirm\(' --include='*.ts' --include='*.tsx' src \| grep -v '/ui/' \| wc -l` và `npx vitest run src/components/ui/__tests__/staticApiGuard.test.ts --bail=1` | AntD static đã biến mất khỏi source; 86 file còn dùng cú pháp đó nhưng **mọi receiver đều bind qua `useMessage`/`useNotification`/`useTaskMateModal`** theo context (`ThemeAppHolder`), guard xanh. Danh sách 4 file trong PATTERNS chỉ là ghi chú lịch sử, **không** trình bày như số liệu hiện tại. |

> Mọi số liệu trong §2-§5 (khi các phần đó được viết) phải khớp bảng trên; nếu lệnh tái tạo trả khác đi, cập nhật bảng trước, cập nhật phần sau sau.

## 2. Tồn kho wrapper

56 file `.tsx` là wrapper và được liệt kê từng dòng bên dưới. Bốn file `antdTheme.ts`, `index.ts`, `tokens.contract.ts`, `ui-tokens.css` là hạ tầng; 10 file trong `src/components/ui/__tests__/` là bằng chứng — cả hai nhóm không có marker `WRAPPER-ROW` và không trộn vào số 56.

Định dạng mỗi dòng: `<!-- WRAPPER-ROW --> | <file> | export | props/extends | state | event | keyboard/focus | validation | accessible name | behavior phải giữ |`. Mỗi wrapper ghi đúng một dòng; icon chỉ một dòng cho `icon.tsx` và 141 export `wrapIcon` nằm ở §2.1; `form.tsx` liệt kê static subcomponent trong cột export. Thuộc tính kế thừa từ AntD được ghi rõ là "kế thừa AntD", không suy diễn thêm.

<!-- WRAPPER-ROW --> | src/components/ui/alert.tsx | export: Alert, AlertErrorBoundary | props/extends: AlertProps = AntAlertProps | state: stateless (useThemeMode) | event: kế thừa AntD (onClose) | keyboard/focus: kế thừa AntD | validation: không có policy riêng | accessible name: alert semantics + text từ caller | behavior phải giữ: type mặc định info, status map D-12, caller style win |
<!-- WRAPPER-ROW --> | src/components/ui/app.tsx | export: App, useApp | props/extends: AppProps<P> = AntAppProps<P> | state: stateless; useApp() → AntApp.useApp() | event: kế thừa AntApp children callbacks | keyboard/focus: kế thừa AntD App | validation: không có | accessible name: App root semantics | behavior phải giữ: token --ui-app-font-size, caller style win; hook tách khỏi message.tsx |
<!-- WRAPPER-ROW --> | src/components/ui/auto-complete.tsx | export: AutoComplete, AutoCompleteOption | props/extends: AutoCompleteProps<ValueType> = AntAutoCompleteProps<ValueType> | state: stateless | event: onChange/onSelect kế thừa AntD | keyboard/focus: combobox Arrow/Enter kế thừa AntD | validation: không có | accessible name: placeholder/aria từ caller | behavior phải giữ: metric qua styles.root, caller root style win |
<!-- WRAPPER-ROW --> | src/components/ui/avatar.tsx | export: Avatar, AvatarGroup | props/extends: AvatarProps = AntAvatarProps | state: stateless | event: onClick kế thừa AntD | keyboard/focus: chỉ focus khi interactive theo AntD | validation: không có | accessible name: alt/text từ caller | behavior phải giữ: iconSize/fontSize token, caller style win; Group mirrored |
<!-- WRAPPER-ROW --> | src/components/ui/badge.tsx | export: Badge | props/extends: BadgeProps extends Omit<AntBadgeProps,'status'>; status?: StatusKind | state: stateless (useThemeMode) | event: kế thừa AntD (onClick) | keyboard/focus: kế thừa AntD | validation: không có | accessible name: count/text từ caller | behavior phải giữ: status color từ map D-12, color explicit caller win, caller style win |
<!-- WRAPPER-ROW --> | src/components/ui/breadcrumb.tsx | export: Breadcrumb, BreadcrumbItem, BreadcrumbSeparator | props/extends: BreadcrumbProps = AntBreadcrumbProps | state: stateless | event: item onClick kế thừa AntD | keyboard/focus: link semantics kế thừa AntD | validation: không có | accessible name: item label | behavior phải giữ: font/gap token, caller style win; statics mirrored |
<!-- WRAPPER-ROW --> | src/components/ui/button.tsx | export: Button, IconButton | props/extends: ButtonProps extends Omit<AntButtonProps,'variant'|'color'>; IconButtonProps thêm 'aria-label' bắt buộc, children?: never | state: stateless | event: onClick kế thừa AntD | keyboard/focus: native button Enter/Space | validation: none | accessible name: text children hoặc aria-label bắt buộc cho IconButton | behavior phải giữ: variant map type/danger, withoutUndefined bỏ key undefined, caller props/style win |
<!-- WRAPPER-ROW --> | src/components/ui/card.tsx | export: Card, CardGrid, CardMeta, cardStyle | props/extends: CardProps = AntCardProps | state: stateless | event: onClick kế thừa AntD | keyboard/focus: kế thừa AntD | validation: không có | accessible name: title/heading từ caller | behavior phải giữ: statics mirrored thành named export, token style, caller style win |
<!-- WRAPPER-ROW --> | src/components/ui/checkbox.tsx | export: Checkbox, CheckboxGroup | props/extends: CheckboxProps = AntCheckboxProps; CheckboxGroupProps = AntCheckboxGroupProps; controlSize?: ControlSize | state: stateless | event: onChange kế thừa AntD | keyboard/focus: Space toggle native | validation: không có | accessible name: label từ children/aria | behavior phải giữ: withoutUndefined, controlSize token, caller style win; Group mirrored |
<!-- WRAPPER-ROW --> | src/components/ui/collapse.tsx | export: Collapse, CollapsePanel | props/extends: CollapseProps = AntCollapseProps | state: stateless | event: onChange/onClick kế thừa AntD | keyboard/focus: header Enter/Space kế thừa AntD | validation: không có | accessible name: panel header | behavior phải giữ: font/height/padding token, caller style win; Panel mirrored |
<!-- WRAPPER-ROW --> | src/components/ui/config-provider.tsx | export: ThemeConfigProvider | props/extends: ConfigProviderProps { theme?: ThemeConfig; children: ReactNode } | state: stateless | event: không có (provider) | keyboard/focus: kế thừa descendants | validation: không có | accessible name: không có (provider) | behavior phải giữ: theme thuộc caller, withoutUndefined(theme), getSharedControlTokens được gọi |
<!-- WRAPPER-ROW --> | src/components/ui/date-picker.tsx | export: DatePicker, DateRangePicker | props/extends: DateFieldProps extends Omit<AntDatePickerProps,'onChange'|'value'>; width?, typed onChange Dayjs|null | state: stateless | event: onChange(date, dateString) | keyboard/focus: picker keyboard kế thừa AntD | validation: không có policy riêng | accessible name: placeholder/aria từ caller | behavior phải giữ: width full mặc định, withoutUndefined value/onChange, caller style win |
<!-- WRAPPER-ROW --> | src/components/ui/descriptions.tsx | export: Descriptions, DescriptionsItem | props/extends: DescriptionsProps = AntDescriptionsProps | state: stateless | event: không có | keyboard/focus: không có | validation: không có | accessible name: label/value pairs | behavior phải giữ: font/height token, caller style win; Item mirrored |
<!-- WRAPPER-ROW --> | src/components/ui/divider.tsx | export: Divider | props/extends: DividerProps = AntDividerProps | state: stateless | event: không có | keyboard/focus: separator semantics | validation: không có | accessible name: text/orientation từ caller | behavior phải giữ: font/gap token, caller style win |
<!-- WRAPPER-ROW --> | src/components/ui/drawer.tsx | export: Drawer | props/extends: DrawerProps extends AntDrawerProps; widthScale?: OverlayWidth; closePolicy?: 'closable'|'silent' | state: stateless | event: onClose kế thừa AntD | keyboard/focus: Esc close khi closable, focus trap AntD | validation: không có | accessible name: title | behavior phải giữ: getOverlayWidth từ token, resolveMask giữ boolean false, closePolicy silent tắt closable, caller width/title win |
<!-- WRAPPER-ROW --> | src/components/ui/dropdown.tsx | export: Dropdown, DropdownButton | props/extends: DropdownProps = AntDropdownProps | state: stateless | event: onClick/onOpenChange kế thừa AntD | keyboard/focus: Arrow/Enter menu kế thừa AntD | validation: không có | accessible name: trigger/menu item label | behavior phải giữ: styles.root token, caller styles win; Button mirrored |
<!-- WRAPPER-ROW --> | src/components/ui/empty.tsx | export: Empty, EmptyImageSimple, EmptyImageDefault | props/extends: EmptyProps = AntEmptyProps | state: stateless | event: không có | keyboard/focus: không có | validation: không có | accessible name: description text | behavior phải giữ: font token, description muted color, caller styles win; images mirrored |
<!-- WRAPPER-ROW --> | src/components/ui/form.tsx | export: Form, FormItem, FormList, FormErrorList, useForm, useWatch | props/extends: FormProps extends AntFormProps; labelPolicy?: 'top'|'left'|'inline' | state: stateless; useForm/useWatch là hook AntD | event: onFinish/onFinishFailed kế thừa AntD | keyboard/focus: Enter submit, field focus kế thừa AntD | validation: requiredMark mặc định true, rules AntD | accessible name: label từ Form.Item | behavior phải giữ: labelPolicy map layout, caller layout/requiredMark win, static hooks mirrored |
<!-- WRAPPER-ROW --> | src/components/ui/grid.tsx | export: Row, Col, Grid | props/extends: ColProps = AntColProps; RowProps = AntRowProps | state: stateless | event: không có | keyboard/focus: không có | validation: không có | accessible name: landmark/structural semantics | behavior phải giữ: gutter mặc định paddingInline, caller gutter/style win, Grid.useBreakpoint mirrored |
<!-- WRAPPER-ROW --> | src/components/ui/icon.tsx | export: wrapIcon + 141 export icon (§2.1) | props/extends: WrappedIconProps { className, style, spin, rotate, size, tone, onClick, aria-label, role, tabIndex } | state: stateless (useThemeMode) | event: onClick forwarded | keyboard/focus: role/tabIndex do caller truyền | validation: không có | accessible name: aria-label tùy chọn; AntD icon decorative mặc định | behavior phải giữ: wrapIcon factory duy nhất, token fontSize/iconSize, tone map D-12, caller style win, tên export giữ nguyên AntD |
<!-- WRAPPER-ROW --> | src/components/ui/image.tsx | export: Image, ImagePreviewGroup | props/extends: ImageProps = AntImageProps | state: stateless | event: onPreviewChange/onError kế thừa AntD | keyboard/focus: preview controls kế thừa AntD | validation: không có | accessible name: alt | behavior phải giữ: styles.root token, caller root style win; PreviewGroup mirrored |
<!-- WRAPPER-ROW --> | src/components/ui/input-number.tsx | export: InputNumber | props/extends: InputNumberProps<T> extends AntInputNumberProps<T>; width?, size? | state: stateless | event: onChange kế thừa AntD | keyboard/focus: ArrowUp/ArrowDown native | validation: status từ aria-invalid | accessible name: aria-label/id từ caller | behavior phải giữ: min/max/precision truyền nguyên, withoutUndefined, caller style win |
<!-- WRAPPER-ROW --> | src/components/ui/input.tsx | export: Input, InputSearch, InputPassword, controlStyle, controlWidthStyle | props/extends: InputProps extends AntInputProps; width?: 'full'|'auto' | state: forwardRef<InputRef> | event: onChange/onPressEnter kế thừa AntD | keyboard/focus: native input focus | validation: status từ aria-invalid, withoutUndefined | accessible name: aria-label/id/placeholder | behavior phải giữ: full width mặc định, ref forwarded, caller style win, Search/Password mirrored |
<!-- WRAPPER-ROW --> | src/components/ui/layout.tsx | export: Layout, LayoutHeader, LayoutFooter, LayoutContent, LayoutSider | props/extends: LayoutProps = AntLayoutProps; SiderProps re-export | state: stateless | event: onCollapse qua Sider | keyboard/focus: sider controls kế thừa AntD | validation: không có | accessible name: landmark semantics | behavior phải giữ: token height/gutter, caller style win; statics mirrored |
<!-- WRAPPER-ROW --> | src/components/ui/list.tsx | export: List, ListItem, ListItemMeta | props/extends: ListProps<T> = AntListProps<T> | state: stateless | event: pagination/onClick kế thừa AntD | keyboard/focus: item focus kế thừa AntD | validation: không có | accessible name: item content | behavior phải giữ: generic preserved, row height/font token, caller style win |
<!-- WRAPPER-ROW --> | src/components/ui/mentions.tsx | export: Mentions, MentionsOption | props/extends: MentionsWrapperProps extends AntMentionsProps; width? | state: forwardRef<MentionsRef> | event: onChange/onSelect kế thừa AntD | keyboard/focus: @ trigger + Arrow/Enter | validation: không có | accessible name: aria-label/input | behavior phải giữ: full width mặc định, ref forwarded, iconSize token, caller style win, Option mirrored |
<!-- WRAPPER-ROW --> | src/components/ui/menu.tsx | export: Menu, MenuItem, MenuSubMenu, MenuItemGroup | props/extends: MenuWrapperProps extends AntMenuProps; compact? mặc định true | state: stateless | event: onClick kế thừa AntD | keyboard/focus: Arrow/Enter/Escape kế thừa AntD | validation: không có | accessible name: item label | behavior phải giữ: row height từ controlHeight, caller style win; statics mirrored |
<!-- WRAPPER-ROW --> | src/components/ui/message.tsx | export: useMessage, ThemeAppHolder | props/extends: ThemeAppHolder { children: ReactNode } | state: AntApp context; useMessage() → AntApp.useApp().message | event: message.success/error/info/... qua instance | keyboard/focus: không có (holder) | validation: không có | accessible name: message content từ caller | behavior phải giữ: holder đơn nhất, không static message.*, kế thừa ConfigProvider theme |
<!-- WRAPPER-ROW --> | src/components/ui/modal.tsx | export: Modal, useTaskMateModal, getOverlayWidth, resolveMask | props/extends: ModalProps extends AntModalProps; widthScale?, footerPolicy?, closePolicy? | state: useModal() → { modal, contextHolder } | event: onOk/onCancel kế thừa AntD | keyboard/focus: Esc close khi closable, focus trap; contextHolder phải render | validation: không có | accessible name: title | behavior phải giữ: boolean mask false giữ nguyên, width từ token scale, footerPolicy none → null, closePolicy silent tắt closable, withoutUndefined, caller win |
<!-- WRAPPER-ROW --> | src/components/ui/notification.tsx | export: useNotification, useNotificationConfig | props/extends: không có props (hook) | state: AntApp.useApp().notification | event: notification.* qua instance | keyboard/focus: không có | validation: không có | accessible name: message/description từ caller | behavior phải giữ: duration 4.5, placement topRight, pauseOnHover true, iconSize token, không static API |
<!-- WRAPPER-ROW --> | src/components/ui/pagination.tsx | export: Pagination | props/extends: PaginationProps = AntPaginationProps | state: stateless | event: onChange/onShowSizeChange kế thừa AntD | keyboard/focus: page buttons kế thừa AntD | validation: không có | accessible name: page aria-label | behavior phải giữ: styles.root token, caller root style win |
<!-- WRAPPER-ROW --> | src/components/ui/popconfirm.tsx | export: Popconfirm | props/extends: PopconfirmProps extends AntPopconfirmProps; tone?: StatusKind | state: stateless (useThemeMode) | event: onConfirm/onCancel kế thừa AntD | keyboard/focus: trigger focus, Escape dismiss | validation: tone danger → okButtonProps.danger | accessible name: title + okText/cancelText | behavior phải giữ: okText "Xác nhận", cancelText "Hủy" mặc định, okType primary, caller okType/okButtonProps win |
<!-- WRAPPER-ROW --> | src/components/ui/popover.tsx | export: Popover | props/extends: PopoverWrapperProps extends AntPopoverProps; widthScale?: 'md'|'lg' | state: stateless | event: onOpenChange kế thừa AntD | keyboard/focus: trigger hover/click/focus | validation: không có | accessible name: title/content | behavior phải giữ: maxWidth từ controlHeight scale, caller overlayStyle win |
<!-- WRAPPER-ROW --> | src/components/ui/progress.tsx | export: Progress | props/extends: ProgressProps = AntProgressProps | state: stateless (useThemeMode) | event: không có | keyboard/focus: progressbar semantics | validation: không có | accessible name: aria-label/percent text | behavior phải giữ: status map D-12, caller strokeColor/style win |
<!-- WRAPPER-ROW --> | src/components/ui/radio.tsx | export: Radio, RadioGroup, RadioButton | props/extends: RadioProps/RadioGroupProps/RadioButtonProps kế thừa AntD; group controlSize?: ControlSize | state: stateless | event: onChange kế thừa AntD | keyboard/focus: Arrow selection native | validation: không có | accessible name: label | behavior phải giữ: Group/Button mirrored cùng token style, caller size/style win |
<!-- WRAPPER-ROW --> | src/components/ui/result.tsx | export: Result | props/extends: ResultProps = AntResultProps | state: stateless | event: không có | keyboard/focus: không có | validation: không có | accessible name: title/status text | behavior phải giữ: font/icon token, caller style win |
<!-- WRAPPER-ROW --> | src/components/ui/segmented.tsx | export: Segmented | props/extends: SegmentedProps<ValueType> = AntSegmentedProps<ValueType> | state: stateless | event: onChange kế thừa AntD | keyboard/focus: Arrow selection | validation: không có | accessible name: option labels | behavior phải giữ: generic preserved, token height/font/radius, caller style win |
<!-- WRAPPER-ROW --> | src/components/ui/select.tsx | export: Select | props/extends: SelectProps extends AntSelectProps; width?, size? | state: stateless | event: onChange/onSearch kế thừa AntD | keyboard/focus: combobox Arrow/Enter | validation: status từ aria-invalid | accessible name: aria-label/id | behavior phải giữ: allowClear mặc định true, withoutUndefined, full width, caller status/style win |
<!-- WRAPPER-ROW --> | src/components/ui/skeleton.tsx | export: Skeleton, SkeletonButton, SkeletonInput, SkeletonImage, SkeletonAvatar, SkeletonNode | props/extends: SkeletonProps = AntSkeletonProps | state: stateless | event: không có | keyboard/focus: không có | validation: không có | accessible name: loading semantics | behavior phải giữ: statics mirrored, row/avatar token, caller style win |
<!-- WRAPPER-ROW --> | src/components/ui/slider.tsx | export: Slider | props/extends: SliderProps = SliderSingleProps \| SliderRangeProps | state: stateless | event: onChange/onAfterChange kế thừa AntD | keyboard/focus: Arrow keys trên handle | validation: không có | accessible name: aria-label từ caller | behavior phải giữ: handle/rail token, caller style win |
<!-- WRAPPER-ROW --> | src/components/ui/space.tsx | export: Space, SpaceCompact | props/extends: SpaceProps = AntSpaceProps | state: stateless | event: không có | keyboard/focus: không có | validation: không có | accessible name: structural semantics | behavior phải giữ: gap mặc định paddingInline, caller size/style win, Compact mirrored |
<!-- WRAPPER-ROW --> | src/components/ui/spin.tsx | export: Spin, setDefaultSpinIndicator | props/extends: SpinProps = AntSpinProps | state: stateless (useThemeMode) | event: không có | keyboard/focus: status semantics | validation: không có | accessible name: tip/aria-label | behavior phải giữ: accent từ map D-12, caller style win, static mirrored |
<!-- WRAPPER-ROW --> | src/components/ui/splitter.tsx | export: Splitter, SplitterPanel | props/extends: SplitterWrapperProps extends AntSplitterProps; compact?, children? | state: stateless | event: onResize/onResizeStart kế thừa AntD | keyboard/focus: resize handle keys | validation: không có | accessible name: handle từ AntD | behavior phải giữ: handle size token, caller style win, Panel mirrored |
<!-- WRAPPER-ROW --> | src/components/ui/statistic.tsx | export: Statistic, StatisticCountdown, StatisticTimer | props/extends: StatisticProps = AntStatisticProps | state: stateless | event: Countdown onFinish kế thừa AntD | keyboard/focus: không có | validation: không có | accessible name: title/value text | behavior phải giữ: font token, statics mirrored, caller style win |
<!-- WRAPPER-ROW --> | src/components/ui/status-dot.tsx | export: StatusDot | props/extends: StatusDotProps { status: StatusKind; label?: string; className?; style? } | state: stateless (useThemeMode) | event: không có | keyboard/focus: role img khi có label; aria-hidden khi không | validation: không có | accessible name: optional label | behavior phải giữ: map D-12 chung, decorative aria-hidden mặc định, caller style win |
<!-- WRAPPER-ROW --> | src/components/ui/switch.tsx | export: Switch | props/extends: SwitchProps = AntSwitchProps | state: stateless | event: onChange kế thừa AntD | keyboard/focus: Space toggle | validation: không có | accessible name: aria-label/checked children | behavior phải giữ: height/radius token, caller style win |
<!-- WRAPPER-ROW --> | src/components/ui/table.tsx | export: Table, TableSummary | props/extends: TableProps<RecordType> extends AntTableProps<RecordType>; density?: TableSize | state: stateless | event: onChange/pagination/row events kế thừa AntD | keyboard/focus: row selection controls | validation: không có | accessible name: column header/caption | behavior phải giữ: density → size chỉ khi set, padding/font token, caller style win, generic preserved |
<!-- WRAPPER-ROW --> | src/components/ui/tabs.tsx | export: Tabs, TabPane | props/extends: TabsProps = AntTabsProps | state: stateless | event: onChange/onTabClick kế thừa AntD | keyboard/focus: Arrow trong tablist | validation: không có | accessible name: tab labels | behavior phải giữ: styles.root token, caller styles win, TabPane mirrored |
<!-- WRAPPER-ROW --> | src/components/ui/tag.tsx | export: Tag, StatusTag, CheckableTag | props/extends: TagProps extends AntTagProps status?: StatusKind; StatusTagProps requires status; AntCheckableTagProps | state: stateless (useThemeMode) | event: CheckableTag onChange | keyboard/focus: checkable tag focus | validation: không có | accessible name: text content | behavior phải giữ: status map D-12 light/dark, caller style win, CheckableTag mirrored |
<!-- WRAPPER-ROW --> | src/components/ui/textarea.tsx | export: Textarea, TextArea, DEFAULT_TEXTAREA_MIN_ROWS | props/extends: TextareaProps extends AntTextAreaProps; width? | state: forwardRef<TextAreaRef> | event: onChange/onPressEnter kế thừa AntD | keyboard/focus: native textarea focus | validation: status từ aria-invalid, withoutUndefined | accessible name: aria-label/id | behavior phải giữ: minRows 2, maxRows từ controlHeight/fontSize, full width, ref forwarded, alias TextArea |
<!-- WRAPPER-ROW --> | src/components/ui/time-picker.tsx | export: TimePicker, TimeRangePicker | props/extends: TimeFieldProps extends AntTimePickerProps; width?; TimeRangePickerProps | state: stateless | event: onChange kế thừa AntD | keyboard/focus: picker Arrow/Enter | validation: không có | accessible name: placeholder/aria | behavior phải giữ: pickerStyle full width mặc định, caller style win |
<!-- WRAPPER-ROW --> | src/components/ui/tooltip.tsx | export: Tooltip | props/extends: TooltipWrapperProps extends AntTooltipProps; widthScale?: 'md'|'lg' | state: stateless | event: onOpenChange kế thừa AntD | keyboard/focus: hover/focus trigger | validation: không có | accessible name: title + trigger aria | behavior phải giữ: mouseEnterDelay 0.15 mặc định, maxWidth token scale, caller overlayStyle win |
<!-- WRAPPER-ROW --> | src/components/ui/tree-select.tsx | export: TreeSelect, TreeSelectNode, TreeSelectSHOW_ALL, TreeSelectSHOW_CHILD, TreeSelectSHOW_PARENT | props/extends: TreeSelectWrapperProps extends AntTreeSelectProps; width? | state: stateless | event: onChange/onTreeExpand kế thừa AntD | keyboard/focus: combobox/tree navigation | validation: không có | accessible name: aria-label/placeholder | behavior phải giữ: full width mặc định, statics mirrored, caller style win |
<!-- WRAPPER-ROW --> | src/components/ui/tree.tsx | export: Tree, TreeNode, DirectoryTree | props/extends: TreeWrapperProps extends AntTreeProps; compact? mặc định true | state: stateless | event: onSelect/onCheck/onExpand kế thừa AntD | keyboard/focus: Arrow/Enter tree navigation | validation: không có | accessible name: node titles | behavior phải giữ: row height từ controlHeight, caller style win, statics mirrored |
<!-- WRAPPER-ROW --> | src/components/ui/typography.tsx | export: Text, Title, Paragraph, Typography | props/extends: TextProps/TitleProps/ParagraphProps = ComponentProps<typeof AntTypography.*>; fontRole?: FontRole | state: stateless | event: không có (Link kế thừa AntD) | keyboard/focus: Link focus kế thừa AntD | validation: không có | accessible name: text content | behavior phải giữ: fontRole 11/12/13/16px qua CSS token, caller style win, namespace gồm Link |
<!-- WRAPPER-ROW --> | src/components/ui/upload.tsx | export: Upload, UploadDragger, UPLOAD_LIST_IGNORE | props/extends: UploadWrapperProps extends AntUploadProps; width? | state: stateless | event: onChange/beforeUpload kế thừa AntD | keyboard/focus: trigger/filename buttons | validation: không có | accessible name: upload button text | behavior phải giữ: full width mặc định, token metrics, Dragger + LIST_IGNORE mirrored, caller style win |

### 2.1 257 tên export theo guard

Danh sách dưới là **output sort nguyên vẹn** của lệnh sau, mỗi tên một dòng `<!-- EXPORT: Ten -->`:

```bash
npx tsx -e "import{scanWrappers}from './tests/helpers/antdInventory';console.log([...scanWrappers('src/components/ui')].sort().join('\\n'))"
```

<!-- EXPORT: Alert -->
<!-- EXPORT: AlertErrorBoundary -->
<!-- EXPORT: ApartmentOutlined -->
<!-- EXPORT: ApiOutlined -->
<!-- EXPORT: App -->
<!-- EXPORT: AppstoreOutlined -->
<!-- EXPORT: ArrowLeftOutlined -->
<!-- EXPORT: ArrowRightOutlined -->
<!-- EXPORT: ArrowUpOutlined -->
<!-- EXPORT: AutoComplete -->
<!-- EXPORT: AutoCompleteOption -->
<!-- EXPORT: Avatar -->
<!-- EXPORT: AvatarGroup -->
<!-- EXPORT: Badge -->
<!-- EXPORT: BarChartOutlined -->
<!-- EXPORT: BellOutlined -->
<!-- EXPORT: BookOutlined -->
<!-- EXPORT: BranchesOutlined -->
<!-- EXPORT: Breadcrumb -->
<!-- EXPORT: BreadcrumbItem -->
<!-- EXPORT: BreadcrumbSeparator -->
<!-- EXPORT: BugOutlined -->
<!-- EXPORT: BulbOutlined -->
<!-- EXPORT: Button -->
<!-- EXPORT: CalendarOutlined -->
<!-- EXPORT: CameraOutlined -->
<!-- EXPORT: Card -->
<!-- EXPORT: CardGrid -->
<!-- EXPORT: CardMeta -->
<!-- EXPORT: CaretDownOutlined -->
<!-- EXPORT: CaretRightOutlined -->
<!-- EXPORT: CheckCircleFilled -->
<!-- EXPORT: CheckCircleOutlined -->
<!-- EXPORT: CheckOutlined -->
<!-- EXPORT: CheckSquareOutlined -->
<!-- EXPORT: CheckableTag -->
<!-- EXPORT: Checkbox -->
<!-- EXPORT: CheckboxGroup -->
<!-- EXPORT: ClearOutlined -->
<!-- EXPORT: ClockCircleOutlined -->
<!-- EXPORT: CloseCircleOutlined -->
<!-- EXPORT: CloseOutlined -->
<!-- EXPORT: CloudDownloadOutlined -->
<!-- EXPORT: CloudOutlined -->
<!-- EXPORT: CloudServerOutlined -->
<!-- EXPORT: CloudSyncOutlined -->
<!-- EXPORT: CloudUploadOutlined -->
<!-- EXPORT: CodeOutlined -->
<!-- EXPORT: Col -->
<!-- EXPORT: Collapse -->
<!-- EXPORT: CollapsePanel -->
<!-- EXPORT: ColumnWidthOutlined -->
<!-- EXPORT: CommentOutlined -->
<!-- EXPORT: CompassOutlined -->
<!-- EXPORT: ControlOutlined -->
<!-- EXPORT: CopyOutlined -->
<!-- EXPORT: CrownOutlined -->
<!-- EXPORT: DEFAULT_TEXTAREA_MIN_ROWS -->
<!-- EXPORT: DashboardOutlined -->
<!-- EXPORT: DatabaseOutlined -->
<!-- EXPORT: DatePicker -->
<!-- EXPORT: DateRangePicker -->
<!-- EXPORT: DeleteOutlined -->
<!-- EXPORT: DeploymentUnitOutlined -->
<!-- EXPORT: Descriptions -->
<!-- EXPORT: DescriptionsItem -->
<!-- EXPORT: DesktopOutlined -->
<!-- EXPORT: DiffOutlined -->
<!-- EXPORT: DirectoryTree -->
<!-- EXPORT: DisconnectOutlined -->
<!-- EXPORT: Divider -->
<!-- EXPORT: DownCircleOutlined -->
<!-- EXPORT: DownOutlined -->
<!-- EXPORT: DownloadOutlined -->
<!-- EXPORT: DragOutlined -->
<!-- EXPORT: Drawer -->
<!-- EXPORT: Dropdown -->
<!-- EXPORT: DropdownButton -->
<!-- EXPORT: EditOutlined -->
<!-- EXPORT: Empty -->
<!-- EXPORT: EmptyImageDefault -->
<!-- EXPORT: EmptyImageSimple -->
<!-- EXPORT: ExclamationCircleFilled -->
<!-- EXPORT: ExclamationCircleOutlined -->
<!-- EXPORT: ExpandAltOutlined -->
<!-- EXPORT: ExperimentFilled -->
<!-- EXPORT: ExperimentOutlined -->
<!-- EXPORT: ExportOutlined -->
<!-- EXPORT: EyeInvisibleOutlined -->
<!-- EXPORT: EyeOutlined -->
<!-- EXPORT: FieldTimeOutlined -->
<!-- EXPORT: FileAddOutlined -->
<!-- EXPORT: FileExcelOutlined -->
<!-- EXPORT: FileMarkdownOutlined -->
<!-- EXPORT: FileOutlined -->
<!-- EXPORT: FilePptOutlined -->
<!-- EXPORT: FileSearchOutlined -->
<!-- EXPORT: FileTextOutlined -->
<!-- EXPORT: FileWordOutlined -->
<!-- EXPORT: FilterOutlined -->
<!-- EXPORT: FireOutlined -->
<!-- EXPORT: FlagOutlined -->
<!-- EXPORT: FolderAddOutlined -->
<!-- EXPORT: FolderFilled -->
<!-- EXPORT: FolderOpenFilled -->
<!-- EXPORT: FolderOpenOutlined -->
<!-- EXPORT: FolderOutlined -->
<!-- EXPORT: FolderViewOutlined -->
<!-- EXPORT: Form -->
<!-- EXPORT: FormErrorList -->
<!-- EXPORT: FormItem -->
<!-- EXPORT: FormList -->
<!-- EXPORT: FormOutlined -->
<!-- EXPORT: FormatPainterOutlined -->
<!-- EXPORT: FullscreenExitOutlined -->
<!-- EXPORT: FullscreenOutlined -->
<!-- EXPORT: FundProjectionScreenOutlined -->
<!-- EXPORT: GithubOutlined -->
<!-- EXPORT: GlobalOutlined -->
<!-- EXPORT: Grid -->
<!-- EXPORT: HddOutlined -->
<!-- EXPORT: HistoryOutlined -->
<!-- EXPORT: HourglassOutlined -->
<!-- EXPORT: IconButton -->
<!-- EXPORT: Image -->
<!-- EXPORT: ImagePreviewGroup -->
<!-- EXPORT: ImportOutlined -->
<!-- EXPORT: InboxOutlined -->
<!-- EXPORT: InfoCircleOutlined -->
<!-- EXPORT: Input -->
<!-- EXPORT: InputNumber -->
<!-- EXPORT: InputPassword -->
<!-- EXPORT: InputSearch -->
<!-- EXPORT: KeyOutlined -->
<!-- EXPORT: Layout -->
<!-- EXPORT: LayoutContent -->
<!-- EXPORT: LayoutFooter -->
<!-- EXPORT: LayoutHeader -->
<!-- EXPORT: LayoutSider -->
<!-- EXPORT: LeftOutlined -->
<!-- EXPORT: LinkOutlined -->
<!-- EXPORT: List -->
<!-- EXPORT: ListItem -->
<!-- EXPORT: ListItemMeta -->
<!-- EXPORT: LoadingOutlined -->
<!-- EXPORT: LockOutlined -->
<!-- EXPORT: Mentions -->
<!-- EXPORT: MentionsOption -->
<!-- EXPORT: Menu -->
<!-- EXPORT: MenuFoldOutlined -->
<!-- EXPORT: MenuItem -->
<!-- EXPORT: MenuItemGroup -->
<!-- EXPORT: MenuSubMenu -->
<!-- EXPORT: MenuUnfoldOutlined -->
<!-- EXPORT: MessageOutlined -->
<!-- EXPORT: MinusCircleOutlined -->
<!-- EXPORT: MinusOutlined -->
<!-- EXPORT: Modal -->
<!-- EXPORT: MoonOutlined -->
<!-- EXPORT: MoreOutlined -->
<!-- EXPORT: NodeIndexOutlined -->
<!-- EXPORT: NotificationOutlined -->
<!-- EXPORT: OrderedListOutlined -->
<!-- EXPORT: Pagination -->
<!-- EXPORT: PaperClipOutlined -->
<!-- EXPORT: Paragraph -->
<!-- EXPORT: PauseCircleOutlined -->
<!-- EXPORT: PictureOutlined -->
<!-- EXPORT: PlayCircleOutlined -->
<!-- EXPORT: PlusOutlined -->
<!-- EXPORT: Popconfirm -->
<!-- EXPORT: Popover -->
<!-- EXPORT: Progress -->
<!-- EXPORT: ProjectOutlined -->
<!-- EXPORT: PushpinFilled -->
<!-- EXPORT: PushpinOutlined -->
<!-- EXPORT: QuestionCircleOutlined -->
<!-- EXPORT: Radio -->
<!-- EXPORT: RadioButton -->
<!-- EXPORT: RadioGroup -->
<!-- EXPORT: ReloadOutlined -->
<!-- EXPORT: Result -->
<!-- EXPORT: RightOutlined -->
<!-- EXPORT: RobotOutlined -->
<!-- EXPORT: RocketOutlined -->
<!-- EXPORT: Row -->
<!-- EXPORT: SafetyCertificateOutlined -->
<!-- EXPORT: SaveOutlined -->
<!-- EXPORT: ScheduleOutlined -->
<!-- EXPORT: SearchOutlined -->
<!-- EXPORT: Segmented -->
<!-- EXPORT: Select -->
<!-- EXPORT: SendOutlined -->
<!-- EXPORT: SettingOutlined -->
<!-- EXPORT: Skeleton -->
<!-- EXPORT: SkeletonAvatar -->
<!-- EXPORT: SkeletonButton -->
<!-- EXPORT: SkeletonImage -->
<!-- EXPORT: SkeletonInput -->
<!-- EXPORT: SkeletonNode -->
<!-- EXPORT: Slider -->
<!-- EXPORT: Space -->
<!-- EXPORT: SpaceCompact -->
<!-- EXPORT: Spin -->
<!-- EXPORT: SplitCellsOutlined -->
<!-- EXPORT: Splitter -->
<!-- EXPORT: SplitterPanel -->
<!-- EXPORT: StarOutlined -->
<!-- EXPORT: Statistic -->
<!-- EXPORT: StatisticCountdown -->
<!-- EXPORT: StatisticTimer -->
<!-- EXPORT: StatusDot -->
<!-- EXPORT: StatusTag -->
<!-- EXPORT: StopOutlined -->
<!-- EXPORT: SunOutlined -->
<!-- EXPORT: SwapOutlined -->
<!-- EXPORT: Switch -->
<!-- EXPORT: SyncOutlined -->
<!-- EXPORT: TabPane -->
<!-- EXPORT: Table -->
<!-- EXPORT: TableSummary -->
<!-- EXPORT: Tabs -->
<!-- EXPORT: Tag -->
<!-- EXPORT: TagOutlined -->
<!-- EXPORT: TagsOutlined -->
<!-- EXPORT: TeamOutlined -->
<!-- EXPORT: Text -->
<!-- EXPORT: TextArea -->
<!-- EXPORT: Textarea -->
<!-- EXPORT: ThemeAppHolder -->
<!-- EXPORT: ThemeConfigProvider -->
<!-- EXPORT: ThunderboltFilled -->
<!-- EXPORT: ThunderboltOutlined -->
<!-- EXPORT: TimePicker -->
<!-- EXPORT: TimeRangePicker -->
<!-- EXPORT: Title -->
<!-- EXPORT: ToolOutlined -->
<!-- EXPORT: Tooltip -->
<!-- EXPORT: Tree -->
<!-- EXPORT: TreeNode -->
<!-- EXPORT: TreeSelect -->
<!-- EXPORT: TreeSelectNode -->
<!-- EXPORT: TreeSelectSHOW_ALL -->
<!-- EXPORT: TreeSelectSHOW_CHILD -->
<!-- EXPORT: TreeSelectSHOW_PARENT -->
<!-- EXPORT: Typography -->
<!-- EXPORT: UPLOAD_LIST_IGNORE -->
<!-- EXPORT: UndoOutlined -->
<!-- EXPORT: UnlockOutlined -->
<!-- EXPORT: UpOutlined -->
<!-- EXPORT: Upload -->
<!-- EXPORT: UploadDragger -->
<!-- EXPORT: UploadOutlined -->
<!-- EXPORT: UserOutlined -->
<!-- EXPORT: WarningOutlined -->
<!-- EXPORT: ZoomInOutlined -->
<!-- EXPORT: ZoomOutOutlined -->

Cuối mục 2, lệnh `findMissingWrappers` chứng minh không control tiêu thụ nào thiếu wrapper:

```bash
npx tsx -e "import{scanConsumedAntd,scanWrappers,findMissingWrappers}from './tests/helpers/antdInventory';console.log(findMissingWrappers(scanConsumedAntd('src'),scanWrappers('src/components/ui')))"
# []
```

Kết quả live: `[]`.

## 3. Import tồn dư và UI surface

*(Do 51-02 viết tiếp.)*

## 4. Phân loại implementation

*(Do 51-03 viết tiếp.)*

## 5. Đối chiếu cuối và bàn giao Phase 52

*(Do 51-03 viết tiếp.)*
