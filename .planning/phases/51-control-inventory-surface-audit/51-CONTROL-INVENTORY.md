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

Phần này viết tiếp §2 của 51-01. Mọi số liệu là kết quả lệnh chạy live tại repo root ngày 2026-11-21; PATTERNS chỉ là lịch sử khi lệch source. Không có dòng source nào dưới `src/` đổi trong Phase 51.

### 3.1 Tồn kho import tồn dư

Lệnh gốc cho cả năm nhóm (a)-(e), chạy từ `/Users/tranducquan/Working/Personal/task-management`:

```bash
grep -rnE "from ['\"](antd|@ant-design/icons)" src --include='*.ts' --include='*.tsx'
grep -rnE "^import (type )?\{" src --include='*.ts' --include='*.tsx' \
  | grep -E "(antd|@ant-design/icons)" | grep -vE "^[^:]+:[0-9]+:import type \{" | grep -vE "from ['\"]antd/es/"
grep -rn "import type .* from 'antd'" src --include='*.ts' --include='*.tsx'
grep -rnE "export type .* from ['\"]antd" --include='*.ts' --include='*.tsx' src
grep -rnE "(import|export) type .* from ['\"]antd/es/" --include='*.ts' --include='*.tsx' src
grep -rnE "\b(Modal)\.confirm\(|\b(message|notification)\.(success|error|warning|warn|info|loading|open|destroy)\(" src --include='*.ts' --include='*.tsx' | grep -v '/ui/'
grep -rn "@ant-design/icons/" src --include='*.tsx'
grep -rln "@ant-design/plots" src --include='*.tsx'
```

**(a) Tổng hợp import `antd` / `@ant-design/icons` (runtime + type-only gộp)**

- Lệnh: `grep -rnE "from ['\"](antd|@ant-design/icons)" src --include='*.ts' --include='*.tsx'`
- **139 dòng / 97 file** tại HEAD (PATTERNS ghi "97 file" — khớp; artifact ghi thêm số dòng 139 để không nhầm file với dòng).
- Mọi phát hiện `path:line` được chép nguyên vào `tests/fixtures/ant-design-surface-inventory.txt` (139 dòng, `LC_ALL=C sort`, duy nhất), mỗi dòng `grep -Fq` khớp trong artifact này (xem bảng chi tiết một dòng một mục từ (b) đến (e) ở dưới).
- Phân bổ: 56 wrapper `src/components/ui/*.tsx` + 4 file hạ tầng (`antdTheme.ts`, `index.ts`, test fixtures) + 10 file `__tests__` + các view/tool window/settings/component tiêu thụ type.

Danh sách 139 `path:line` (copy nguyên từ lệnh ở trên, `LC_ALL=C sort`; đây là nội dung fixture `tests/fixtures/ant-design-surface-inventory.txt` trước khi thêm path surface ở §3.2):

```text
src/components/agents/AgentDiffReviewer.tsx:3
src/components/agents/AgentDiffReviewer.tsx:4
src/components/ai/ActiveAiTurnIndicator.tsx:3
src/components/ai/ChatHeader.tsx:3
src/components/ai/ChatInputBar.tsx:3
src/components/ai/ChatMessageBubble.tsx:4
src/components/ai/ChatTabToolbox.tsx:3
src/components/ai/grounded/SourcesPanel.tsx:4
src/components/ai/office/AiStaffImportModal.tsx:4
src/components/analytics/WorkTypeAccuracyCard.tsx:3
src/components/changeRequests/ChangeRequestTable.tsx:3
src/components/knowledge/DocumentSetForm.tsx:3
src/components/knowledge/GraphEvidenceDrawer.tsx:3
src/components/notes/DocEditorPane.tsx:3
src/components/notes/DocFolderTree.tsx:3
src/components/notes/DocListPane.tsx:3
src/components/notes/NoteAttachmentsPanel.tsx:4
src/components/settings/BackupImportCard.tsx:4
src/components/settings/ConfigProfileImportCard.tsx:4
src/components/settings/SystemTypeOptionsCard.tsx:5
src/components/systems/SystemTable.tsx:4
src/components/tasks/BatchActionBar.tsx:3
src/components/tasks/InlineStatusTag.tsx:3
src/components/tasks/QuickAddBar.tsx:3
src/components/tasks/TaskFilterBar.tsx:3
src/components/tasks/TaskTable.tsx:3
src/components/tasks/WorkSessionsTab.tsx:3
src/components/timer/ActiveTimerWidget.tsx:3
src/components/ui/__tests__/antdInventory.test.ts:34
src/components/ui/__tests__/antdInventory.test.ts:38
src/components/ui/__tests__/antdInventory.test.ts:48
src/components/ui/__tests__/antdInventory.test.ts:49
src/components/ui/__tests__/antdInventory.test.ts:50
src/components/ui/__tests__/antdInventory.test.ts:75
src/components/ui/__tests__/antdInventory.test.ts:76
src/components/ui/__tests__/antdInventory.test.ts:81
src/components/ui/__tests__/antdInventory.test.ts:92
src/components/ui/__tests__/button.test.tsx:3
src/components/ui/__tests__/controls.test.tsx:5
src/components/ui/__tests__/wave02Wrappers.test.tsx:4
src/components/ui/__tests__/wave02Wrappers.test.tsx:5
src/components/ui/alert.tsx:1
src/components/ui/antdTheme.ts:5
src/components/ui/app.tsx:1
src/components/ui/auto-complete.tsx:4
src/components/ui/avatar.tsx:1
src/components/ui/badge.tsx:1
src/components/ui/breadcrumb.tsx:1
src/components/ui/button.tsx:1
src/components/ui/card.tsx:1
src/components/ui/checkbox.tsx:1
src/components/ui/checkbox.tsx:2
src/components/ui/collapse.tsx:1
src/components/ui/config-provider.tsx:1
src/components/ui/config-provider.tsx:2
src/components/ui/date-picker.tsx:1
src/components/ui/date-picker.tsx:2
src/components/ui/date-picker.tsx:7
src/components/ui/descriptions.tsx:4
src/components/ui/divider.tsx:1
src/components/ui/drawer.tsx:1
src/components/ui/dropdown.tsx:1
src/components/ui/empty.tsx:1
src/components/ui/form.tsx:1
src/components/ui/grid.tsx:7
src/components/ui/icon.tsx:144
src/components/ui/image.tsx:1
src/components/ui/index.ts:358
src/components/ui/input-number.tsx:1
src/components/ui/input-number.tsx:2
src/components/ui/input.tsx:1
src/components/ui/layout.tsx:1
src/components/ui/list.tsx:1
src/components/ui/mentions.tsx:1
src/components/ui/mentions.tsx:6
src/components/ui/mentions.tsx:7
src/components/ui/menu.tsx:1
src/components/ui/menu.tsx:5
src/components/ui/message.tsx:1
src/components/ui/modal.tsx:1
src/components/ui/notification.tsx:1
src/components/ui/pagination.tsx:1
src/components/ui/popconfirm.tsx:1
src/components/ui/popover.tsx:1
src/components/ui/popover.tsx:5
src/components/ui/progress.tsx:1
src/components/ui/radio.tsx:1
src/components/ui/radio.tsx:2
src/components/ui/result.tsx:1
src/components/ui/segmented.tsx:4
src/components/ui/select.tsx:1
src/components/ui/select.tsx:2
src/components/ui/skeleton.tsx:1
src/components/ui/slider.tsx:5
src/components/ui/space.tsx:1
src/components/ui/spin.tsx:1
src/components/ui/splitter.tsx:1
src/components/ui/splitter.tsx:5
src/components/ui/statistic.tsx:1
src/components/ui/switch.tsx:1
src/components/ui/table.tsx:1
src/components/ui/tabs.tsx:1
src/components/ui/tag.tsx:1
src/components/ui/tag.tsx:2
src/components/ui/textarea.tsx:1
src/components/ui/textarea.tsx:2
src/components/ui/textarea.tsx:3
src/components/ui/time-picker.tsx:5
src/components/ui/time-picker.tsx:9
src/components/ui/tooltip.tsx:1
src/components/ui/tooltip.tsx:5
src/components/ui/tooltip.tsx:6
src/components/ui/tree-select.tsx:1
src/components/ui/tree-select.tsx:5
src/components/ui/tree-select.tsx:6
src/components/ui/tree.tsx:1
src/components/ui/tree.tsx:5
src/components/ui/typography.tsx:1
src/components/ui/upload.tsx:1
src/components/ui/upload.tsx:5
src/utils/documentLinks.tsx:2
src/views/SystemDetailView.tsx:3
src/views/TasksView.tsx:3
src/workbench/EditorArea.tsx:4
src/workbench/toolwindows/AiStaffExplorer.tsx:3
src/workbench/toolwindows/CRExplorer.tsx:15
src/workbench/toolwindows/CRExplorer.tsx:3
src/workbench/toolwindows/DiagramExplorer.tsx:3
src/workbench/toolwindows/RemoteGitExplorer.tsx:10
src/workbench/toolwindows/RemoteGitExplorer.tsx:11
src/workbench/toolwindows/RemoteGitExplorer.tsx:3
src/workbench/toolwindows/RemoteGitExplorer.tsx:4
src/workbench/toolwindows/RemoteGitExplorer.tsx:5
src/workbench/toolwindows/RemoteGitExplorer.tsx:6
src/workbench/toolwindows/RemoteGitExplorer.tsx:7
src/workbench/toolwindows/RemoteGitExplorer.tsx:8
src/workbench/toolwindows/RemoteGitExplorer.tsx:9
src/workbench/toolwindows/SystemsExplorer.tsx:24
src/workbench/toolwindows/SystemsExplorer.tsx:3
```

**(b) Runtime import (value import, không phải `import type`)**

- Lệnh: `grep -rnE "^import (type )?\{" src --include='*.ts' --include='*.tsx' | grep -E "(antd|@ant-design/icons)" | grep -vE "^[^:]+:[0-9]+:import type \{" | grep -vE "from ['\"]antd/es/"`
- **76 dòng / 61 file** (bao gồm 5 dòng deep-import icon value ở (e)); trong đó **65 dòng từ `antd`** (58 file) và **5 dòng từ `@ant-design/icons` barrel** (`icon.tsx:144`, `button.test.tsx:3`, và 3 dòng trong fixture test `antdInventory.test.ts`); phần còn lại là value import từ file nội bộ khớp cụm từ "antd" nhưng **không** phải dependency AntD (`src/styles/tokens.ts:1`, `src/components/ui/antdTheme.ts:6`) — phải lọc tay khi đọc output.
- Đây là nhóm `scanConsumedAntd()` thấy được: 52 components / 141 icons / 3 utilities (xem §1). Hệ quả: thay runtime khi chuyển wrapper sang control tự build (Phase 53/54), adduction caller Phase 55.

**(c) Type-only import từ `antd` barrel**

- Lệnh: `grep -rn "import type .* from 'antd'" src --include='*.ts' --include='*.tsx'`
- **31 dòng / 31 file** (PATTERNS ghi 28 file — lệch; lệnh live là truth). `src/components/ui/config-provider.tsx:2` nằm trong 31 dòng này.
- Tên type phổ biến: `MenuProps` (17), `InputRef` (4), `UploadProps` (3), `TableColumnsType` (3), kèm `ModalFuncProps`, `DescriptionsProps`, `TabsProps`, `MentionsRef`, `UploadFile`, `TreeDataNode`, `ThemeConfig`. Ngoài ra các type import deep `antd/es/*` ở (c2) gồm `DataNode`, `ColumnsType`, `TextAreaRef`.
- Hệ quả: **không thay runtime Phase 53/54, bắt buộc thay khi gỡ dependency Phase 56**. `extractNamedImportsForTest()` bỏ entry có tiền tố `type` (`tests/helpers/antdInventory.ts:34`) nên `scanConsumedAntd()` không đếm nhóm này.

**SURFACE-DETAIL — 31 dòng `import type ... from 'antd'` (đầy đủ, mỗi dòng một file):**

| path:line | type | hệ quả |
|---|---|---|
| src/utils/documentLinks.tsx:2 | `ModalFuncProps` | chỉ thay Phase 56 |
| src/components/changeRequests/ChangeRequestTable.tsx:3 | `TableColumnsType`, `MenuProps` | chỉ thay Phase 56 |
| src/components/ui/config-provider.tsx:2 | `ThemeConfig` | chỉ thay Phase 56 |
| src/components/ui/__tests__/wave02Wrappers.test.tsx:4 | `InputRef` | bằng chứng, thay cùng test Phase 56 |
| src/components/tasks/InlineStatusTag.tsx:3 | `MenuProps` | chỉ thay Phase 56 |
| src/components/timer/ActiveTimerWidget.tsx:3 | `MenuProps` | chỉ thay Phase 56 |
| src/components/settings/ConfigProfileImportCard.tsx:4 | `UploadProps` | chỉ thay Phase 56 |
| src/components/tasks/WorkSessionsTab.tsx:3 | `TableColumnsType` | chỉ thay Phase 56 |
| src/components/tasks/BatchActionBar.tsx:3 | `MenuProps` | chỉ thay Phase 56 |
| src/components/tasks/TaskFilterBar.tsx:3 | `InputRef` | chỉ thay Phase 56 |
| src/components/notes/DocListPane.tsx:3 | `MenuProps` | chỉ thay Phase 56 |
| src/components/notes/NoteAttachmentsPanel.tsx:4 | `UploadFile` | chỉ thay Phase 56 |
| src/components/settings/BackupImportCard.tsx:4 | `UploadProps` | chỉ thay Phase 56 |
| src/components/ai/ActiveAiTurnIndicator.tsx:3 | `MenuProps` | chỉ thay Phase 56 |
| src/components/tasks/QuickAddBar.tsx:3 | `InputRef` | chỉ thay Phase 56 |
| src/components/ai/ChatTabToolbox.tsx:3 | `MenuProps` | chỉ thay Phase 56 |
| src/components/ai/ChatMessageBubble.tsx:4 | `MenuProps` | chỉ thay Phase 56 |
| src/components/tasks/TaskTable.tsx:3 | `TableColumnsType`, `MenuProps` | chỉ thay Phase 56 |
| src/components/agents/AgentDiffReviewer.tsx:3 | `MenuProps` | chỉ thay Phase 56 |
| src/components/notes/DocFolderTree.tsx:3 | `MenuProps` | chỉ thay Phase 56 |
| src/components/knowledge/DocumentSetForm.tsx:3 | `TreeDataNode` | chỉ thay Phase 56 |
| src/components/ai/ChatHeader.tsx:3 | `MenuProps` | chỉ thay Phase 56 |
| src/components/ai/ChatInputBar.tsx:3 | `MentionsRef` | chỉ thay Phase 56 |
| src/components/ai/office/AiStaffImportModal.tsx:4 | `UploadProps` | chỉ thay Phase 56 |
| src/workbench/toolwindows/AiStaffExplorer.tsx:3 | `MenuProps` | chỉ thay Phase 56 |
| src/workbench/toolwindows/CRExplorer.tsx:3 | `MenuProps` | chỉ thay Phase 56 |
| src/workbench/toolwindows/DiagramExplorer.tsx:3 | `MenuProps` | chỉ thay Phase 56 |
| src/workbench/EditorArea.tsx:4 | `MenuProps` | chỉ thay Phase 56 |
| src/workbench/toolwindows/SystemsExplorer.tsx:3 | `MenuProps` | chỉ thay Phase 56 |
| src/views/TasksView.tsx:3 | `InputRef` | chỉ thay Phase 56 |
| src/views/SystemDetailView.tsx:3 | `DescriptionsProps`, `TabsProps` | chỉ thay Phase 56 |

**(c2) Type re-export + deep type import (tách riêng, không gộp vào 31 dòng (c))**

- (i) `grep -rnE "export type .* from ['\"]antd" --include='*.ts' --include='*.tsx' src | wc -l` = **13 dòng**: 10 dòng `from 'antd'` + 3 dòng `from 'antd/es/*'`. PATTERNS không liệt kê riêng nhóm này.
- (ii) `grep -rnE "(import|export) type .* from ['\"]antd/es/" --include='*.ts' --include='*.tsx' src | wc -l` = **22 dòng** (19 `import type` + 3 `export type`). PATTERNS ghi "10 icon deep-import ở `RemoteGitExplorer.tsx`" — **đó là import value ở (e)**, không phải type; không được cộng vào 22.
- Hệ quả: **đổi khi gỡ dependency Phase 56**, cùng hệ quả với (c) nhưng giữ hàng riêng để Phase 56 quét đủ ba dạng `import type`, `export type`, deep path.

**SURFACE-DETAIL — 13 dòng `export type ... from 'antd...'`:**

| path:line | nội dung | hệ quả |
|---|---|---|
| src/components/ui/date-picker.tsx:7 | `DatePickerProps` from `'antd'` | đổi Phase 56 |
| src/components/ui/mentions.tsx:6 | `MentionsProps`, `MentionsRef` from `'antd'` | đổi Phase 56 |
| src/components/ui/mentions.tsx:7 | `MentionsOptionProps` from `'antd/es/mentions'` | đổi Phase 56 |
| src/components/ui/menu.tsx:5 | `MenuProps`, `MenuItemProps`, `MenuRef`, `MenuTheme` from `'antd'` | đổi Phase 56 |
| src/components/ui/popover.tsx:5 | `PopoverProps` from `'antd'` | đổi Phase 56 |
| src/components/ui/splitter.tsx:5 | `SplitterProps` from `'antd'` | đổi Phase 56 |
| src/components/ui/time-picker.tsx:9 | `TimePickerProps`, `TimeRangePickerProps` from `'antd'` | đổi Phase 56 |
| src/components/ui/tooltip.tsx:5 | `TooltipProps` from `'antd'` | đổi Phase 56 |
| src/components/ui/tooltip.tsx:6 | `TooltipPlacement` from `'antd/es/tooltip'` | đổi Phase 56 |
| src/components/ui/tree-select.tsx:5 | `TreeSelectProps`, `TreeDataNode` from `'antd'` | đổi Phase 56 |
| src/components/ui/tree-select.tsx:6 | `SelectValue` from `'antd/es/tree-select'` | đổi Phase 56 |
| src/components/ui/tree.tsx:5 | `TreeProps`, `TreeDataNode` from `'antd'` | đổi Phase 56 |
| src/components/ui/upload.tsx:5 | `UploadProps`, `UploadFile` from `'antd'` | đổi Phase 56 |

**SURFACE-DETAIL — 19 dòng `import type ... from 'antd/es/*'` (cộng 3 export ở trên thành 22):**

| path:line | type | hệ quả |
|---|---|---|
| src/components/agents/AgentDiffReviewer.tsx:4 | `DataNode` | đổi Phase 56 |
| src/components/ai/grounded/SourcesPanel.tsx:4 | `ColumnsType` | đổi Phase 56 |
| src/components/analytics/WorkTypeAccuracyCard.tsx:3 | `ColumnsType` | đổi Phase 56 |
| src/components/knowledge/GraphEvidenceDrawer.tsx:3 | `ColumnsType` | đổi Phase 56 |
| src/components/notes/DocEditorPane.tsx:3 | `TextAreaRef` | đổi Phase 56 |
| src/components/settings/SystemTypeOptionsCard.tsx:5 | `ColumnsType` | đổi Phase 56 |
| src/components/systems/SystemTable.tsx:4 | `ColumnsType` | đổi Phase 56 |
| src/components/ui/__tests__/wave02Wrappers.test.tsx:5 | `TextAreaRef` | đổi Phase 56 |
| src/components/ui/checkbox.tsx:2 | `CheckboxGroupProps as AntCheckboxGroupProps` | đổi Phase 56 |
| src/components/ui/date-picker.tsx:2 | `RangePickerProps` | đổi Phase 56 |
| src/components/ui/input-number.tsx:2 | `InputNumberProps as AntInputNumberProps` | đổi Phase 56 |
| src/components/ui/radio.tsx:2 | `RadioButtonProps as AntRadioButtonProps` | đổi Phase 56 |
| src/components/ui/select.tsx:2 | `BaseOptionType`, `DefaultOptionType` | đổi Phase 56 |
| src/components/ui/tag.tsx:2 | `CheckableTagProps as AntCheckableTagProps` | đổi Phase 56 |
| src/components/ui/textarea.tsx:2 | `TextAreaProps as AntTextAreaProps` | đổi Phase 56 |
| src/components/ui/textarea.tsx:3 | `TextAreaRef` | đổi Phase 56 |
| src/workbench/toolwindows/CRExplorer.tsx:15 | `DataNode` | đổi Phase 56 |
| src/workbench/toolwindows/RemoteGitExplorer.tsx:3 | `DataNode` | đổi Phase 56 |
| src/workbench/toolwindows/SystemsExplorer.tsx:24 | `DataNode` | đổi Phase 56 |

**(d) Static API — regex call site, KHÔNG phải import**

- Nguồn phát hiện: **regex call site**, không phải import. `scanConsumedAntd()` không thấy `message.*` / `notification.*` / `Modal.confirm` (`51-CONTROL-INVENTORY.md:21`).
- Phương pháp: dùng chính receiver-binding rule của `src/components/ui/__tests__/staticApiGuard.test.ts:7-10,38-60` — receiver chỉ hợp lệ khi bind qua `useMessage()` / `useNotification()` / `useTaskMateModal()`; mọi call không bind là violation. Chạy `npx vitest run src/components/ui/__tests__/staticApiGuard.test.ts --bail=1`: **0 call unbound** tại HEAD (AntD static đã biến mất).
- Lệnh `grep -rlE '\b(message|notification)\.(success|error|warning|warn|info|loading|open|destroy)\(|\bModal\.confirm\(' --include='*.ts' --include='*.tsx' src | grep -v '/ui/' | wc -l` = **86 file ngoài `ui/` dùng cú pháp `message.*` / `notification.*`**, **tất cả bind qua context** (`useMessage` / `useNotification` trong `ThemeAppHolder`) — đây là surface thông báo, không phải static API.
- Bốn file PATTERNS nêu (`src/components/changeRequests/ChangeRequestModal.tsx`, `src/components/settings/JiraConfigCard.tsx`, `src/components/settings/LocalSqlitePersistenceCard.tsx`, `src/components/settings/SnapshotRollbackCard.tsx`) là **ghi chú lịch sử**: hiện `ChangeRequestModal.tsx:67` `const message = useMessage()`, ba file settings `const notification = useNotification()` (`JiraConfigCard.tsx:38`, `LocalSqlitePersistenceCard.tsx:23`, `SnapshotRollbackCard.tsx:19`). Không trình bày như số liệu hiện tại; vẫn là surface thông báo phải giữ behavior realtime (xem §3.2 nhóm notification).

**(e) Deep-import icon value + ghi chú plots**

- Lệnh: `grep -rn "@ant-design/icons/" src --include='*.tsx'` = **8 dòng**, tất cả tại `src/workbench/toolwindows/RemoteGitExplorer.tsx:4-11`:
  - `src/workbench/toolwindows/RemoteGitExplorer.tsx:4` — `FolderOutlined`
  - `src/workbench/toolwindows/RemoteGitExplorer.tsx:5` — `FolderOpenOutlined`
  - `src/workbench/toolwindows/RemoteGitExplorer.tsx:6` — `FileTextOutlined`
  - `src/workbench/toolwindows/RemoteGitExplorer.tsx:7` — `ReloadOutlined`
  - `src/workbench/toolwindows/RemoteGitExplorer.tsx:8` — `SearchOutlined`
  - `src/workbench/toolwindows/RemoteGitExplorer.tsx:9` — `BranchesOutlined`
  - `src/workbench/toolwindows/RemoteGitExplorer.tsx:10` — `CloudServerOutlined`
  - `src/workbench/toolwindows/RemoteGitExplorer.tsx:11` — `FolderViewOutlined`
- PATTERNS tự liệt kê 8 tên nhưng ghi nhầm thành 10; dùng **8**, không cộng thêm type import `antd/es/tree` ở dòng 3 (đó là nhóm (c2)).
- `@ant-design/plots` xuất hiện ở 4 file analytics (ngoài phạm vi thay control nhưng phải ghi để grep `@ant-design` không hiểu nhầm): `src/components/analytics/EstimateVsActualChart.tsx`, `src/components/analytics/ProductivityHeatmapChart.tsx`, `src/components/analytics/WorkTypeAccuracyCard.tsx`, `src/components/analytics/WorkTypeBreakdownChart.tsx`.


### 3.2 Tồn kho UI surface (INV-02 — 12 nhóm)

Mỗi dòng dưới đây bắt đầu bằng marker `<!-- SURFACE: <group> -->` để kiểm tra bằng grep. Cột `file/route` là path tương đối hoặc route hash; cột `control tiêu thụ` là wrapper/control AntD cần thay hoặc behavior phải giữ; cột `ghi chú` là lý do nhóm này dễ sót. Mọi path cũng được thêm một dòng vào fixture `tests/fixtures/ant-design-surface-inventory.txt` (file thuộc nhiều nhóm chỉ một dòng fixture). Số đếm là lệnh chạy live; PATTERNS ghi 19 tool window / 20 view nhưng live là 18 / 22.

**route/view** — lệnh: `sed -n "11,26p" src/hooks/useHashRoute.ts` (15 VALID_ROUTES), `sed -n "82,147p" src/AppIntelliJ.tsx` (5 branch render), grep case trong `src/workbench/EditorArea.tsx` (22 case).
<!-- SURFACE: route --> | `#dashboard` → branch main `src/AppIntelliJ.tsx` → `WorkbenchLayout` → `EditorArea.tsx` tab `dashboard` | `AntdThemeAdapter` + `ThemeAppHolder` bọc một lần cho branch main | 15 route hợp lệ, mọi branch tự bọc provider
<!-- SURFACE: route --> | `#tasks` → branch main `src/AppIntelliJ.tsx` → `WorkbenchLayout` → `EditorArea.tsx` tab `tasks` | `AntdThemeAdapter` + `ThemeAppHolder` bọc một lần cho branch main | 15 route hợp lệ, mọi branch tự bọc provider
<!-- SURFACE: route --> | `#planner` → branch main `src/AppIntelliJ.tsx` → `WorkbenchLayout` → `EditorArea.tsx` tab `planner` | `AntdThemeAdapter` + `ThemeAppHolder` bọc một lần cho branch main | 15 route hợp lệ, mọi branch tự bọc provider
<!-- SURFACE: route --> | `#analytics` → branch main `src/AppIntelliJ.tsx` → `WorkbenchLayout` → `EditorArea.tsx` tab `analytics` | `AntdThemeAdapter` + `ThemeAppHolder` bọc một lần cho branch main | 15 route hợp lệ, mọi branch tự bọc provider
<!-- SURFACE: route --> | `#notes` → branch main `src/AppIntelliJ.tsx` → `WorkbenchLayout` → `EditorArea.tsx` tab `notes` | `AntdThemeAdapter` + `ThemeAppHolder` bọc một lần cho branch main | 15 route hợp lệ, mọi branch tự bọc provider
<!-- SURFACE: route --> | `#settings` → branch main `src/AppIntelliJ.tsx` → `WorkbenchLayout` → `EditorArea.tsx` tab `settings` | `AntdThemeAdapter` + `ThemeAppHolder` bọc một lần cho branch main | 15 route hợp lệ, mọi branch tự bọc provider
<!-- SURFACE: route --> | `#config-profiles` → branch main `src/AppIntelliJ.tsx` → `WorkbenchLayout` → `EditorArea.tsx` tab `config-profiles` | `AntdThemeAdapter` + `ThemeAppHolder` bọc một lần cho branch main | 15 route hợp lệ, mọi branch tự bọc provider
<!-- SURFACE: route --> | `#timer-popout` → `src/AppIntelliJ.tsx` branch riêng → `src/views/TimerPopoutView.tsx` | `AntdThemeAdapter` + `ThemeAppHolder` (không singleton), provider riêng từng popout | surface popout — dễ sót nếu chỉ quét `src/views/`
<!-- SURFACE: route --> | `#notes-popout` → `src/AppIntelliJ.tsx` branch riêng → `src/views/NotesPopoutView.tsx` | `AntdThemeAdapter` + `ThemeAppHolder` (không singleton), provider riêng từng popout | surface popout — dễ sót nếu chỉ quét `src/views/`
<!-- SURFACE: route --> | `#ai-popout` → `src/AppIntelliJ.tsx` branch riêng → `src/views/AIPopoutView.tsx` | `AntdThemeAdapter` + `ThemeAppHolder` (không singleton), provider riêng từng popout | surface popout — dễ sót nếu chỉ quét `src/views/`
<!-- SURFACE: route --> | `#coding-zone-popout` → `src/AppIntelliJ.tsx` branch riêng → `src/views/CodingZonePopoutView.tsx` | `AntdThemeAdapter` + `ThemeAppHolder` (không singleton), provider riêng từng popout | surface popout — dễ sót nếu chỉ quét `src/views/`
<!-- SURFACE: route --> | `#insight` → branch main → `src/views/ItemInsightView.tsx` (tab `insight`) | `AntdThemeAdapter` + `ThemeAppHolder` branch main | route hợp lệ nhưng render qua tab workbench
<!-- SURFACE: route --> | `#team` → branch main `src/AppIntelliJ.tsx` → `src/views/TeamWorkspaceView.tsx` (tab `team_workspace`) | `AntdThemeAdapter` + `ThemeAppHolder` dùng chung branch main | route hợp lệ nhưng render qua tab workbench
<!-- SURFACE: route --> | `#telegram` → branch main `src/AppIntelliJ.tsx` → `WorkbenchLayout` → `EditorArea.tsx` tab `telegram` | `AntdThemeAdapter` + `ThemeAppHolder` bọc một lần cho branch main | 15 route hợp lệ, mọi branch tự bọc provider
<!-- SURFACE: route --> | `#mermaid` → branch main `src/AppIntelliJ.tsx` → `WorkbenchLayout` → `EditorArea.tsx` tab `mermaid` | `AntdThemeAdapter` + `ThemeAppHolder` bọc một lần cho branch main | 15 route hợp lệ, mọi branch tự bọc provider
<!-- SURFACE: route --> | `viewType:"tasks"` → `<TasksView />` (`src/workbench/EditorArea.tsx:567-670`) → `src/views/TasksView.tsx` | wrapper AntD trong view | 22 case switch, liệt kê riêng không viết tắt
<!-- SURFACE: route --> | `viewType:"notes"` → `<NotesView />` (`src/workbench/EditorArea.tsx:567-670`) → `src/views/NotesView.tsx` | wrapper AntD trong view | 22 case switch, liệt kê riêng không viết tắt
<!-- SURFACE: route --> | `viewType:"doc_set"` → `<DocumentSetDetail />` (`src/workbench/EditorArea.tsx:567-670`) → `src/workbench/DocumentSetDetail.tsx` | wrapper AntD trong view | 22 case switch, liệt kê riêng không viết tắt
<!-- SURFACE: route --> | `viewType:"doc_set_library"` → `<DocSetLibrary />` (`src/workbench/EditorArea.tsx:567-670`) → `src/workbench/DocSetLibrary.tsx` | wrapper AntD trong view | 22 case switch, liệt kê riêng không viết tắt
<!-- SURFACE: route --> | `viewType:"planner"` → `<PlannerView />` (`src/workbench/EditorArea.tsx:567-670`) → `src/views/PlannerView.tsx` | wrapper AntD trong view | 22 case switch, liệt kê riêng không viết tắt
<!-- SURFACE: route --> | `viewType:"analytics"` → `<AnalyticsView />` (`src/workbench/EditorArea.tsx:567-670`) → `src/views/AnalyticsView.tsx` | wrapper AntD trong view | 22 case switch, liệt kê riêng không viết tắt
<!-- SURFACE: route --> | `viewType:"settings"` → `<SettingsView />` (`src/workbench/EditorArea.tsx:567-670`) → `src/views/SettingsView.tsx` | wrapper AntD trong view | 22 case switch, liệt kê riêng không viết tắt
<!-- SURFACE: route --> | `viewType:"config-profiles"` → `<ConfigProfilesView />` (`src/workbench/EditorArea.tsx:567-670`) → `src/views/ConfigProfilesView.tsx` | wrapper AntD trong view | 22 case switch, liệt kê riêng không viết tắt
<!-- SURFACE: route --> | `viewType:"cr_detail"` → `<ChangeRequestDetailView />` (`src/workbench/EditorArea.tsx:567-670`) → `src/views/ChangeRequestDetailView.tsx` | wrapper AntD trong view | 22 case switch, liệt kê riêng không viết tắt
<!-- SURFACE: route --> | `viewType:"dashboard"` → `<DashboardView />` (`src/workbench/EditorArea.tsx:567-670`) → `src/views/DashboardView.tsx` | wrapper AntD trong view | 22 case switch, liệt kê riêng không viết tắt
<!-- SURFACE: route --> | `viewType:"telegram"` → `<TelegramMonitorView />` (`src/workbench/EditorArea.tsx:567-670`) → `src/views/TelegramMonitorView.tsx` | wrapper AntD trong view | 22 case switch, liệt kê riêng không viết tắt
<!-- SURFACE: route --> | `viewType:"mermaid"` → `<MermaidAssistantView />` (`src/workbench/EditorArea.tsx:567-670`) → `src/views/MermaidAssistantView.tsx` | wrapper AntD trong view | 22 case switch, liệt kê riêng không viết tắt
<!-- SURFACE: route --> | `viewType:"systems"` → `<SystemCatalogView />` (`src/workbench/EditorArea.tsx:567-670`) → `src/views/SystemCatalogView.tsx` | wrapper AntD trong view | 22 case switch, liệt kê riêng không viết tắt
<!-- SURFACE: route --> | `viewType:"system_detail"` → `<SystemDetailView />` (`src/workbench/EditorArea.tsx:567-670`) → `src/views/SystemDetailView.tsx` | wrapper AntD trong view | 22 case switch, liệt kê riêng không viết tắt
<!-- SURFACE: route --> | `viewType:"remote_file"` → `<RemoteFileViewer />` (`src/workbench/EditorArea.tsx:567-670`) → `src/workbench/editor/RemoteFileViewer.tsx` | wrapper AntD trong view | 22 case switch, liệt kê riêng không viết tắt
<!-- SURFACE: route --> | `viewType:"insight"` → `<ItemInsightView />` (`src/workbench/EditorArea.tsx:567-670`) → `src/views/ItemInsightView.tsx` | wrapper AntD trong view | 22 case switch, liệt kê riêng không viết tắt
<!-- SURFACE: route --> | `viewType:"staff_detail"` → `<StaffDetailView />` (`src/workbench/EditorArea.tsx:567-670`) → `src/views/StaffDetailView.tsx` | wrapper AntD trong view | 22 case switch, liệt kê riêng không viết tắt
<!-- SURFACE: route --> | `viewType:"team_workspace"` → `<TeamWorkspaceView />` (`src/workbench/EditorArea.tsx:567-670`) → `src/views/TeamWorkspaceView.tsx` | wrapper AntD trong view | 22 case switch, liệt kê riêng không viết tắt
<!-- SURFACE: route --> | `viewType:"json_formatter"` → `<UtilityToolPanel />` (`src/workbench/EditorArea.tsx:567-670`) → `src/workbench/toolwindows/UtilityToolPanel.tsx` | wrapper AntD trong view | 22 case switch, liệt kê riêng không viết tắt
<!-- SURFACE: route --> | `viewType:"xml_formatter"` → `<UtilityToolPanel />` (`src/workbench/EditorArea.tsx:567-670`) → `src/workbench/toolwindows/UtilityToolPanel.tsx` | wrapper AntD trong view | 22 case switch, liệt kê riêng không viết tắt
<!-- SURFACE: route --> | `viewType:"text_compare"` → `<UtilityToolPanel />` (`src/workbench/EditorArea.tsx:567-670`) → `src/workbench/toolwindows/UtilityToolPanel.tsx` | wrapper AntD trong view | 22 case switch, liệt kê riêng không viết tắt
<!-- SURFACE: route --> | `viewType:"markdown_viewer"` → `<UtilityToolPanel />` (`src/workbench/EditorArea.tsx:567-670`) → `src/workbench/toolwindows/UtilityToolPanel.tsx` | wrapper AntD trong view | 22 case switch, liệt kê riêng không viết tắt
<!-- SURFACE: route --> | popout `timer-popout` — `src/views/TimerPopoutView.tsx` tự bọc `AntdThemeAdapter` + `ThemeAppHolder` trong `src/AppIntelliJ.tsx` | provider context message/notification riêng | behavior phải giữ: không dùng singleton holder chung
<!-- SURFACE: route --> | popout `notes-popout` — `src/views/NotesPopoutView.tsx` tự bọc `AntdThemeAdapter` + `ThemeAppHolder` trong `src/AppIntelliJ.tsx` | provider context message/notification riêng | behavior phải giữ: không dùng singleton holder chung
<!-- SURFACE: route --> | popout `ai-popout` — `src/views/AIPopoutView.tsx` tự bọc `AntdThemeAdapter` + `ThemeAppHolder` trong `src/AppIntelliJ.tsx` | provider context message/notification riêng | behavior phải giữ: không dùng singleton holder chung
<!-- SURFACE: route --> | popout `coding-zone-popout` — `src/views/CodingZonePopoutView.tsx` tự bọc `AntdThemeAdapter` + `ThemeAppHolder` trong `src/AppIntelliJ.tsx` | provider context message/notification riêng | behavior phải giữ: không dùng singleton holder chung
<!-- SURFACE: route --> | `src/views/ChangeRequestsView.tsx` | wrapper AntD qua workbench | view tồn tại dù không phải case switch trực tiếp của EditorArea
<!-- SURFACE: route --> | `src/views/AgentControlView.tsx` | wrapper AntD qua workbench | view tồn tại dù không phải case switch trực tiếp của EditorArea
<!-- SURFACE: route --> | `src/views/AiOfficeView.tsx` | wrapper AntD qua workbench | view tồn tại dù không phải case switch trực tiếp của EditorArea

**tool window + shell** — lệnh: `find src/workbench/toolwindows -maxdepth 1 -name "*.tsx" | sort` = **18 file** (PATTERNS ghi 19); `find src/workbench -maxdepth 2 -name "*.tsx" | grep -v __tests__` cho shell.
<!-- SURFACE: toolwindow --> | `src/workbench/toolwindows/AiOfficeExplorer.tsx` | wrapper AntD (icon/menu/toolbar) | tool window workbench
<!-- SURFACE: toolwindow --> | `src/workbench/toolwindows/AiStaffExplorer.tsx` | wrapper AntD (icon/menu/toolbar) | tool window workbench
<!-- SURFACE: toolwindow --> | `src/workbench/toolwindows/BottomToolWindow.tsx` | wrapper AntD (icon/menu/toolbar) | tool window workbench
<!-- SURFACE: toolwindow --> | `src/workbench/toolwindows/CRExplorer.tsx` | wrapper AntD (icon/menu/toolbar) | tool window workbench
<!-- SURFACE: toolwindow --> | `src/workbench/toolwindows/DiagramExplorer.tsx` | wrapper AntD (icon/menu/toolbar) | tool window workbench
<!-- SURFACE: toolwindow --> | `src/workbench/toolwindows/DocsExplorer.tsx` | wrapper AntD (icon/menu/toolbar) | tool window workbench
<!-- SURFACE: toolwindow --> | `src/workbench/toolwindows/LeftToolWindow.tsx` | wrapper AntD (icon/menu/toolbar) | tool window workbench
<!-- SURFACE: toolwindow --> | `src/workbench/toolwindows/LineNumberedPane.tsx` | wrapper AntD (icon/menu/toolbar) | tool window workbench
<!-- SURFACE: toolwindow --> | `src/workbench/toolwindows/NotificationPanel.tsx` | wrapper AntD (icon/menu/toolbar) | tool window workbench
<!-- SURFACE: toolwindow --> | `src/workbench/toolwindows/RemoteGitExplorer.tsx` | wrapper AntD (icon/menu/toolbar) | tool window workbench
<!-- SURFACE: toolwindow --> | `src/workbench/toolwindows/RemoteTerminalPanel.tsx` | wrapper AntD (icon/menu/toolbar) | tool window workbench
<!-- SURFACE: toolwindow --> | `src/workbench/toolwindows/RightToolWindow.tsx` | wrapper AntD (icon/menu/toolbar) | tool window workbench
<!-- SURFACE: toolwindow --> | `src/workbench/toolwindows/Stripe.tsx` | wrapper AntD (icon/menu/toolbar) | tool window workbench
<!-- SURFACE: toolwindow --> | `src/workbench/toolwindows/SystemsExplorer.tsx` | wrapper AntD (icon/menu/toolbar) | tool window workbench
<!-- SURFACE: toolwindow --> | `src/workbench/toolwindows/ToolExplorerPanel.tsx` | wrapper AntD (icon/menu/toolbar) | tool window workbench
<!-- SURFACE: toolwindow --> | `src/workbench/toolwindows/UtilityToolAIAssistant.tsx` | wrapper AntD (icon/menu/toolbar) | tool window workbench
<!-- SURFACE: toolwindow --> | `src/workbench/toolwindows/UtilityToolPanel.tsx` | wrapper AntD (icon/menu/toolbar) | tool window workbench
<!-- SURFACE: toolwindow --> | `src/workbench/toolwindows/utilityTools.tsx` | wrapper AntD (icon/menu/toolbar) | tool window workbench
<!-- SURFACE: toolwindow --> | `src/workbench/WorkbenchLayout.tsx` | shell/provider/command registry | không phải wrapper nhưng tiêu thụ control
<!-- SURFACE: toolwindow --> | `src/workbench/TitleBar.tsx` | shell/provider/command registry | không phải wrapper nhưng tiêu thụ control
<!-- SURFACE: toolwindow --> | `src/workbench/StatusBar.tsx` | shell/provider/command registry | không phải wrapper nhưng tiêu thụ control
<!-- SURFACE: toolwindow --> | `src/workbench/EditorArea.tsx` | shell/provider/command registry | không phải wrapper nhưng tiêu thụ control
<!-- SURFACE: toolwindow --> | `src/workbench/search/SearchEverywhereModal.tsx` | shell/provider/command registry | không phải wrapper nhưng tiêu thụ control
<!-- SURFACE: toolwindow --> | `src/workbench/virtual/VirtualizedList.tsx` | shell/provider/command registry | không phải wrapper nhưng tiêu thụ control
<!-- SURFACE: toolwindow --> | `src/workbench/actions/actionRegistry.ts` | shell/provider/command registry | không phải wrapper nhưng tiêu thụ control
<!-- SURFACE: toolwindow --> | `src/workbench/AntdThemeAdapter.tsx` | shell/provider/command registry | không phải wrapper nhưng tiêu thụ control
<!-- SURFACE: toolwindow --> | `src/workbench/DocSetLibrary.tsx` | shell/provider/command registry | không phải wrapper nhưng tiêu thụ control
<!-- SURFACE: toolwindow --> | `src/workbench/DocumentSetDetail.tsx` | shell/provider/command registry | không phải wrapper nhưng tiêu thụ control
<!-- SURFACE: toolwindow --> | `src/workbench/WorkbenchResizeHandle.tsx` | shell/provider/command registry | không phải wrapper nhưng tiêu thụ control
<!-- SURFACE: toolwindow --> | `src/workbench/editor/RemoteFileViewer.tsx` | shell/provider/command registry | không phải wrapper nhưng tiêu thụ control

**settings** — lệnh: `find src/components/settings -maxdepth 1 -name "*.tsx" | sort` = **30 file**, mỗi file một dòng.
<!-- SURFACE: settings --> | `src/components/settings/AiToolCatalogCard.tsx` | form/table/modal/notification wrapper | settings surface
<!-- SURFACE: settings --> | `src/components/settings/BackupExportCard.tsx` | form/table/modal/notification wrapper | settings surface
<!-- SURFACE: settings --> | `src/components/settings/BackupImportCard.tsx` | form/table/modal/notification wrapper | settings surface
<!-- SURFACE: settings --> | `src/components/settings/BudgetWarnThresholdCard.tsx` | form/table/modal/notification wrapper | settings surface
<!-- SURFACE: settings --> | `src/components/settings/ConfigProfileExportButton.tsx` | form/table/modal/notification wrapper | settings surface
<!-- SURFACE: settings --> | `src/components/settings/ConfigProfileImportCard.tsx` | form/table/modal/notification wrapper | settings surface
<!-- SURFACE: settings --> | `src/components/settings/GhostDevConfigCard.tsx` | form/table/modal/notification wrapper | settings surface
<!-- SURFACE: settings --> | `src/components/settings/GitHubConfigCard.tsx` | form/table/modal/notification wrapper | settings surface
<!-- SURFACE: settings --> | `src/components/settings/GitHubConflictModal.tsx` | form/table/modal/notification wrapper | settings surface
<!-- SURFACE: settings --> | `src/components/settings/GitHubPassphraseModal.tsx` | form/table/modal/notification wrapper | settings surface
<!-- SURFACE: settings --> | `src/components/settings/GitHubSyncCard.tsx` | form/table/modal/notification wrapper | settings surface
<!-- SURFACE: settings --> | `src/components/settings/GlobalConventionsCard.tsx` | form/table/modal/notification wrapper | settings surface
<!-- SURFACE: settings --> | `src/components/settings/ImportPreviewModal.tsx` | form/table/modal/notification wrapper | settings surface
<!-- SURFACE: settings --> | `src/components/settings/ImportProfilePreviewModal.tsx` | form/table/modal/notification wrapper | settings surface
<!-- SURFACE: settings --> | `src/components/settings/JiraConfigCard.tsx` | form/table/modal/notification wrapper | settings surface
<!-- SURFACE: settings --> | `src/components/settings/KnowledgeServerConfigCard.tsx` | form/table/modal/notification wrapper | settings surface
<!-- SURFACE: settings --> | `src/components/settings/LocalSqlitePersistenceCard.tsx` | form/table/modal/notification wrapper | settings surface
<!-- SURFACE: settings --> | `src/components/settings/McpConfigCard.tsx` | form/table/modal/notification wrapper | settings surface
<!-- SURFACE: settings --> | `src/components/settings/NineRouterConfigCard.tsx` | form/table/modal/notification wrapper | settings surface
<!-- SURFACE: settings --> | `src/components/settings/NotificationSettingsCard.tsx` | form/table/modal/notification wrapper | settings surface
<!-- SURFACE: settings --> | `src/components/settings/OracleAiToolConfigCard.tsx` | form/table/modal/notification wrapper | settings surface
<!-- SURFACE: settings --> | `src/components/settings/OverridesTable.tsx` | form/table/modal/notification wrapper | settings surface
<!-- SURFACE: settings --> | `src/components/settings/PostProfileImportChecklist.tsx` | form/table/modal/notification wrapper | settings surface
<!-- SURFACE: settings --> | `src/components/settings/PostRestoreBanner.tsx` | form/table/modal/notification wrapper | settings surface
<!-- SURFACE: settings --> | `src/components/settings/SnapshotRollbackCard.tsx` | form/table/modal/notification wrapper | settings surface
<!-- SURFACE: settings --> | `src/components/settings/SshConfigCard.tsx` | form/table/modal/notification wrapper | settings surface
<!-- SURFACE: settings --> | `src/components/settings/SshFsAiToolConfigCard.tsx` | form/table/modal/notification wrapper | settings surface
<!-- SURFACE: settings --> | `src/components/settings/StoragePersistenceCard.tsx` | form/table/modal/notification wrapper | settings surface
<!-- SURFACE: settings --> | `src/components/settings/SystemTypeOptionsCard.tsx` | form/table/modal/notification wrapper | settings surface
<!-- SURFACE: settings --> | `src/components/settings/WeeklyCapacityForm.tsx` | form/table/modal/notification wrapper | settings surface
<!-- SURFACE: settings --> | `src/views/SettingsView.tsx` | chứa các settings card | view tổng hợp
<!-- SURFACE: settings --> | `src/views/ConfigProfilesView.tsx` | chứa các settings card | view tổng hợp

**CR / notes** — lệnh: `find src/components/changeRequests -maxdepth 1 -name "*.tsx"` = 3 file; `find src/components/notes -maxdepth 1 -name "*.tsx"` = **16 file**.
<!-- SURFACE: cr --> | `src/components/changeRequests/ChangeRequestModal.tsx` | modal/table/form wrapper | CR surface
<!-- SURFACE: cr --> | `src/components/changeRequests/ChangeRequestTable.tsx` | modal/table/form wrapper | CR surface
<!-- SURFACE: cr --> | `src/components/changeRequests/TargetSystemsSelector.tsx` | modal/table/form wrapper | CR surface
<!-- SURFACE: cr --> | `src/views/ChangeRequestsView.tsx` | view CR | ánh xạ route/tab
<!-- SURFACE: cr --> | `src/views/ChangeRequestDetailView.tsx` | view CR | ánh xạ route/tab
<!-- SURFACE: notes --> | `src/components/notes/BacklinksSection.tsx` | wrapper AntD (tree/editor/modal/banner) | notes surface
<!-- SURFACE: notes --> | `src/components/notes/DocEditorPane.tsx` | wrapper AntD (tree/editor/modal/banner) | notes surface
<!-- SURFACE: notes --> | `src/components/notes/DocFolderContentsView.tsx` | wrapper AntD (tree/editor/modal/banner) | notes surface
<!-- SURFACE: notes --> | `src/components/notes/DocFolderTree.tsx` | wrapper AntD (tree/editor/modal/banner) | notes surface
<!-- SURFACE: notes --> | `src/components/notes/DocListPane.tsx` | wrapper AntD (tree/editor/modal/banner) | notes surface
<!-- SURFACE: notes --> | `src/components/notes/DocOutlineToC.tsx` | wrapper AntD (tree/editor/modal/banner) | notes surface
<!-- SURFACE: notes --> | `src/components/notes/DocsLibraryActions.tsx` | wrapper AntD (tree/editor/modal/banner) | notes surface
<!-- SURFACE: notes --> | `src/components/notes/EntityNotesSection.tsx` | wrapper AntD (tree/editor/modal/banner) | notes surface
<!-- SURFACE: notes --> | `src/components/notes/NormalizeDocModal.tsx` | wrapper AntD (tree/editor/modal/banner) | notes surface
<!-- SURFACE: notes --> | `src/components/notes/NoteAttachmentsPanel.tsx` | wrapper AntD (tree/editor/modal/banner) | notes surface
<!-- SURFACE: notes --> | `src/components/notes/NoteDetailModal.tsx` | wrapper AntD (tree/editor/modal/banner) | notes surface
<!-- SURFACE: notes --> | `src/components/notes/NoteEditor.tsx` | wrapper AntD (tree/editor/modal/banner) | notes surface
<!-- SURFACE: notes --> | `src/components/notes/QuickNoteEntry.tsx` | wrapper AntD (tree/editor/modal/banner) | notes surface
<!-- SURFACE: notes --> | `src/components/notes/QuickPreviewDrawer.tsx` | wrapper AntD (tree/editor/modal/banner) | notes surface
<!-- SURFACE: notes --> | `src/components/notes/SmartIngestionBanner.tsx` | wrapper AntD (tree/editor/modal/banner) | notes surface
<!-- SURFACE: notes --> | `src/components/notes/ZipImportPreviewModal.tsx` | wrapper AntD (tree/editor/modal/banner) | notes surface
<!-- SURFACE: notes --> | `src/views/NotesView.tsx` | view notes + popout | popout tự bọc holder
<!-- SURFACE: notes --> | `src/views/NotesPopoutView.tsx` | view notes + popout | popout tự bọc holder

**AI Office** — lệnh: `find src/components/ai -maxdepth 1 -name "*.tsx"` (21), `find src/components/ai/grounded -maxdepth 1 -type f` (16), `find src/components/agents -maxdepth 1 -name "*.tsx"` = **11 file**; cộng `AiOfficeExplorer`, team workspace.
<!-- SURFACE: ai --> | `src/views/AiOfficeView.tsx` | wrapper AntD trong AI Office | view điều khiển
<!-- SURFACE: ai --> | `src/views/AgentControlView.tsx` | wrapper AntD trong AI Office | view điều khiển
<!-- SURFACE: ai --> | `src/views/StaffDetailView.tsx` | wrapper AntD trong AI Office | view điều khiển
<!-- SURFACE: ai --> | `src/components/ai/AIChatDrawer.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/components/ai/AIDebugModal.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/components/ai/AITaskPlannerInstructionsModal.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/components/ai/ActiveAiTurnIndicator.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/components/ai/AiChatWidget.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/components/ai/ChatHeader.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/components/ai/ChatInputBar.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/components/ai/ChatMessageBubble.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/components/ai/ChatMessageList.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/components/ai/ChatTabBar.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/components/ai/ChatTabToolbox.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/components/ai/CitationChip.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/components/ai/InlineAISelectionBar.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/components/ai/InlineApiErrorCard.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/components/ai/InterruptedBanner.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/components/ai/McpSettingsModal.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/components/ai/MermaidViewer.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/components/ai/OracleSqlclSettingsModal.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/components/ai/RemoteCitationChips.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/components/ai/ScopePickerModal.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/components/ai/SshFsSettingsModal.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/components/ai/grounded/CandidateChipList.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/components/ai/grounded/CitationGroup.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/components/ai/grounded/ClaimBlock.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/components/ai/grounded/DiagnosticsPanel.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/components/ai/grounded/EvidenceOnlyCard.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/components/ai/grounded/GraphPathCard.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/components/ai/grounded/GroundedAnswerCard.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/components/ai/grounded/GroundedBanner.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/components/ai/grounded/IntentRoutingPrompt.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/components/ai/grounded/PartialSeedNotice.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/components/ai/grounded/ReasonCodeChip.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/components/ai/grounded/ScopeChipsBar.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/components/ai/grounded/ScopeVariationCard.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/components/ai/grounded/SeedEntityCard.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/components/ai/grounded/SourcesPanel.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/components/ai/grounded/StageDiagnosticsList.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/components/agents/AgentDiffReviewer.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/components/agents/AgentSessionList.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/components/agents/AgentTerminalLog.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/components/agents/CodingZoneChatStrip.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/components/agents/CodingZoneDiffPanel.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/components/agents/CodingZoneModal.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/components/agents/CodingZoneTree.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/components/agents/DiffHunkView.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/components/agents/DiffInlineCommentModal.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/components/agents/RunGhostDevModal.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/components/agents/ShellPermissionModal.tsx` | wrapper AntD (chat/citation/modal/diff) | AI Office surface
<!-- SURFACE: ai --> | `src/workbench/toolwindows/AiOfficeExplorer.tsx` | explorer / team workspace | nhánh AI Office
<!-- SURFACE: ai --> | `src/views/TeamWorkspaceView.tsx` | explorer / team workspace | nhánh AI Office

**modal/drawer/popconfirm** — lệnh: `grep -rlnE "<(Modal|Drawer|Popover)" src --include="*.tsx" | grep -v __tests__ | wc -l` = **85 file**; `grep -rln "<Popconfirm" src --include="*.tsx" | grep -v __tests__ | wc -l` = **33 file** (PATTERNS ghi 85/33 — khớp). `<Popconfirm>` khác `Modal.confirm` đã xử lý ở §3.1(d).
<!-- SURFACE: modal --> | `src/components/agents/AgentDiffReviewer.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/agents/DiffInlineCommentModal.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/agents/RunGhostDevModal.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/agents/ShellPermissionModal.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/ai/AIDebugModal.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/ai/AITaskPlannerInstructionsModal.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/ai/ChatInputBar.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/ai/ChatMessageList.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/ai/ChatTabToolbox.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/ai/McpSettingsModal.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/ai/MermaidViewer.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/ai/OracleSqlclSettingsModal.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/ai/ScopePickerModal.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/ai/SshFsSettingsModal.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/ai/grounded/SourcesPanel.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/ai/office/AiStaffImportModal.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/ai/office/BudgetTopUpModal.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/ai/office/EmployeeEditorDrawer.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/ai/office/LinkedItemPicker.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/ai/office/SkillEditorDrawer.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/ai/office/TeamActivityIndicator.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/ai/office/TeamEditorDrawer.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/ai/office/TeamSettingsDrawer.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/changeRequests/ChangeRequestModal.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/changeRequests/ChangeRequestTable.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/common/GlobalDiagramViewer.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/common/QuickReminderModal.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/common/RemoteDirectoryBrowserModal.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/common/ResetDbModal.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/common/ShortcutHUD.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/common/TagListDisplay.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/dailyReview/DailyReviewModal.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/diagrams/EntityDiagramsSection.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/knowledge/DocumentSetDeleteDialog.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/knowledge/DocumentSetForm.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/knowledge/GraphEvidenceDrawer.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/knowledge/PublishPreviewModal.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/notes/DocFolderTree.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/notes/DocsLibraryActions.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/notes/NormalizeDocModal.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/notes/NoteDetailModal.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/notes/NoteEditor.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/notes/QuickPreviewDrawer.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/notes/ZipImportPreviewModal.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/notifications/NotificationDrawer.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/palette/CommandPaletteModal.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/planner/ActualWorklogPlanner.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/planner/AllocationModal.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/planner/CapacitySettingsModal.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/planner/FeasibilityModal.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/planner/TaskAllocationCard.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/planner/WorkSessionDetailModal.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/settings/AiToolCatalogCard.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/settings/GitHubConfigCard.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/settings/GitHubConflictModal.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/settings/GitHubPassphraseModal.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/settings/GlobalConventionsCard.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/settings/ImportPreviewModal.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/settings/ImportProfilePreviewModal.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/settings/JiraConfigCard.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/settings/McpConfigCard.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/settings/NineRouterConfigCard.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/settings/OverridesTable.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/settings/SshConfigCard.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/shell/UpgradeModal.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/systems/SystemModal.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/tasks/BatchActionBar.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/tasks/CreateJiraIssueModal.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/tasks/InlineProgress.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/tasks/ManualWorkSessionModal.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/tasks/TaskDrawer.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/tasks/TaskDrawerPlanning.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/tasks/TaskTable.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/views/AgentControlView.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/views/MermaidAssistantView.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/views/NotesView.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/views/PlannerView.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/views/TasksView.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/views/TelegramMonitorView.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/workbench/DocumentSetDetail.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/workbench/TitleBar.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/workbench/search/find/FindInRemoteFiles.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/workbench/toolwindows/DiagramExplorer.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/workbench/toolwindows/UtilityToolAIAssistant.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/workbench/toolwindows/UtilityToolPanel.tsx` | `<Modal>`/`<Drawer>`/`<Popover>` wrapper | overlay surface
<!-- SURFACE: modal --> | `src/components/agents/AgentDiffReviewer.tsx` | `<Popconfirm>` wrapper | confirm surface, khác static `Modal.confirm`
<!-- SURFACE: modal --> | `src/components/agents/AgentSessionList.tsx` | `<Popconfirm>` wrapper | confirm surface, khác static `Modal.confirm`
<!-- SURFACE: modal --> | `src/components/ai/ActiveAiTurnIndicator.tsx` | `<Popconfirm>` wrapper | confirm surface, khác static `Modal.confirm`
<!-- SURFACE: modal --> | `src/components/ai/OracleSqlclSettingsModal.tsx` | `<Popconfirm>` wrapper | confirm surface, khác static `Modal.confirm`
<!-- SURFACE: modal --> | `src/components/ai/office/AgentActivityPanel.tsx` | `<Popconfirm>` wrapper | confirm surface, khác static `Modal.confirm`
<!-- SURFACE: modal --> | `src/components/ai/office/EmployeeCard.tsx` | `<Popconfirm>` wrapper | confirm surface, khác static `Modal.confirm`
<!-- SURFACE: modal --> | `src/components/ai/office/SkillCard.tsx` | `<Popconfirm>` wrapper | confirm surface, khác static `Modal.confirm`
<!-- SURFACE: modal --> | `src/components/ai/office/TeamSettingsDrawer.tsx` | `<Popconfirm>` wrapper | confirm surface, khác static `Modal.confirm`
<!-- SURFACE: modal --> | `src/components/diagrams/EntityDiagramsSection.tsx` | `<Popconfirm>` wrapper | confirm surface, khác static `Modal.confirm`
<!-- SURFACE: modal --> | `src/components/notes/DocEditorPane.tsx` | `<Popconfirm>` wrapper | confirm surface, khác static `Modal.confirm`
<!-- SURFACE: modal --> | `src/components/notes/EntityNotesSection.tsx` | `<Popconfirm>` wrapper | confirm surface, khác static `Modal.confirm`
<!-- SURFACE: modal --> | `src/components/notes/NoteAttachmentsPanel.tsx` | `<Popconfirm>` wrapper | confirm surface, khác static `Modal.confirm`
<!-- SURFACE: modal --> | `src/components/planner/TaskAllocationCard.tsx` | `<Popconfirm>` wrapper | confirm surface, khác static `Modal.confirm`
<!-- SURFACE: modal --> | `src/components/planner/WorkSessionDetailModal.tsx` | `<Popconfirm>` wrapper | confirm surface, khác static `Modal.confirm`
<!-- SURFACE: modal --> | `src/components/settings/GitHubConfigCard.tsx` | `<Popconfirm>` wrapper | confirm surface, khác static `Modal.confirm`
<!-- SURFACE: modal --> | `src/components/settings/GlobalConventionsCard.tsx` | `<Popconfirm>` wrapper | confirm surface, khác static `Modal.confirm`
<!-- SURFACE: modal --> | `src/components/settings/JiraConfigCard.tsx` | `<Popconfirm>` wrapper | confirm surface, khác static `Modal.confirm`
<!-- SURFACE: modal --> | `src/components/settings/KnowledgeServerConfigCard.tsx` | `<Popconfirm>` wrapper | confirm surface, khác static `Modal.confirm`
<!-- SURFACE: modal --> | `src/components/settings/McpConfigCard.tsx` | `<Popconfirm>` wrapper | confirm surface, khác static `Modal.confirm`
<!-- SURFACE: modal --> | `src/components/settings/NineRouterConfigCard.tsx` | `<Popconfirm>` wrapper | confirm surface, khác static `Modal.confirm`
<!-- SURFACE: modal --> | `src/components/settings/OverridesTable.tsx` | `<Popconfirm>` wrapper | confirm surface, khác static `Modal.confirm`
<!-- SURFACE: modal --> | `src/components/settings/SshConfigCard.tsx` | `<Popconfirm>` wrapper | confirm surface, khác static `Modal.confirm`
<!-- SURFACE: modal --> | `src/components/settings/SystemTypeOptionsCard.tsx` | `<Popconfirm>` wrapper | confirm surface, khác static `Modal.confirm`
<!-- SURFACE: modal --> | `src/components/systems/SystemTable.tsx` | `<Popconfirm>` wrapper | confirm surface, khác static `Modal.confirm`
<!-- SURFACE: modal --> | `src/components/tasks/BatchActionBar.tsx` | `<Popconfirm>` wrapper | confirm surface, khác static `Modal.confirm`
<!-- SURFACE: modal --> | `src/components/tasks/LinkedKnowledgeSection.tsx` | `<Popconfirm>` wrapper | confirm surface, khác static `Modal.confirm`
<!-- SURFACE: modal --> | `src/components/tasks/TaskDrawerPlanning.tsx` | `<Popconfirm>` wrapper | confirm surface, khác static `Modal.confirm`
<!-- SURFACE: modal --> | `src/components/tasks/TaskJiraSection.tsx` | `<Popconfirm>` wrapper | confirm surface, khác static `Modal.confirm`
<!-- SURFACE: modal --> | `src/components/tasks/WorkSessionsTab.tsx` | `<Popconfirm>` wrapper | confirm surface, khác static `Modal.confirm`
<!-- SURFACE: modal --> | `src/views/NotesPopoutView.tsx` | `<Popconfirm>` wrapper | confirm surface, khác static `Modal.confirm`
<!-- SURFACE: modal --> | `src/views/TelegramMonitorView.tsx` | `<Popconfirm>` wrapper | confirm surface, khác static `Modal.confirm`
<!-- SURFACE: modal --> | `src/workbench/toolwindows/AiOfficeExplorer.tsx` | `<Popconfirm>` wrapper | confirm surface, khác static `Modal.confirm`
<!-- SURFACE: modal --> | `src/workbench/toolwindows/BottomToolWindow.tsx` | `<Popconfirm>` wrapper | confirm surface, khác static `Modal.confirm`

**form/table** — lệnh: `grep -rlnE "<(Table|Form)([ >]|$)|<Form\." src --include="*.tsx" | grep -v __tests__ | wc -l` = **38 file**. `src/components/ui/form.tsx:35-39` mirror static subcomponent `FormItem`/`FormList`/`FormErrorList`/`useForm`/`useWatch` — phải thay cùng wrapper.
<!-- SURFACE: form --> | `src/components/ui/form.tsx` | static subcomponent `FormItem`, `FormList`, `FormErrorList`, `useForm`, `useWatch` | mirror AntD form static
<!-- SURFACE: form --> | `src/components/agents/RunGhostDevModal.tsx` | `<Form>`/`<Table>` wrapper | caller form/table
<!-- SURFACE: form --> | `src/components/ai/OracleSqlclSettingsModal.tsx` | `<Form>`/`<Table>` wrapper | caller form/table
<!-- SURFACE: form --> | `src/components/ai/SshFsSettingsModal.tsx` | `<Form>`/`<Table>` wrapper | caller form/table
<!-- SURFACE: form --> | `src/components/analytics/WorkTypeAccuracyCard.tsx` | `<Form>`/`<Table>` wrapper | caller form/table
<!-- SURFACE: form --> | `src/components/changeRequests/ChangeRequestModal.tsx` | `<Form>`/`<Table>` wrapper | caller form/table
<!-- SURFACE: form --> | `src/components/changeRequests/ChangeRequestTable.tsx` | `<Form>`/`<Table>` wrapper | caller form/table
<!-- SURFACE: form --> | `src/components/common/QuickReminderModal.tsx` | `<Form>`/`<Table>` wrapper | caller form/table
<!-- SURFACE: form --> | `src/components/knowledge/DlpWarningPanel.tsx` | `<Form>`/`<Table>` wrapper | caller form/table
<!-- SURFACE: form --> | `src/components/knowledge/DocumentSetForm.tsx` | `<Form>`/`<Table>` wrapper | caller form/table
<!-- SURFACE: form --> | `src/components/knowledge/GraphEvidenceDrawer.tsx` | `<Form>`/`<Table>` wrapper | caller form/table
<!-- SURFACE: form --> | `src/components/notes/NoteEditor.tsx` | `<Form>`/`<Table>` wrapper | caller form/table
<!-- SURFACE: form --> | `src/components/notes/ZipImportPreviewModal.tsx` | `<Form>`/`<Table>` wrapper | caller form/table
<!-- SURFACE: form --> | `src/components/planner/ActualWorklogPlanner.tsx` | `<Form>`/`<Table>` wrapper | caller form/table
<!-- SURFACE: form --> | `src/components/planner/AllocationModal.tsx` | `<Form>`/`<Table>` wrapper | caller form/table
<!-- SURFACE: form --> | `src/components/planner/CandidateAllocationsTable.tsx` | `<Form>`/`<Table>` wrapper | caller form/table
<!-- SURFACE: form --> | `src/components/planner/DateInspectionBreakdown.tsx` | `<Form>`/`<Table>` wrapper | caller form/table
<!-- SURFACE: form --> | `src/components/planner/WorkSessionDetailModal.tsx` | `<Form>`/`<Table>` wrapper | caller form/table
<!-- SURFACE: form --> | `src/components/settings/GhostDevConfigCard.tsx` | `<Form>`/`<Table>` wrapper | caller form/table
<!-- SURFACE: form --> | `src/components/settings/GitHubConfigCard.tsx` | `<Form>`/`<Table>` wrapper | caller form/table
<!-- SURFACE: form --> | `src/components/settings/GitHubSyncCard.tsx` | `<Form>`/`<Table>` wrapper | caller form/table
<!-- SURFACE: form --> | `src/components/settings/ImportPreviewModal.tsx` | `<Form>`/`<Table>` wrapper | caller form/table
<!-- SURFACE: form --> | `src/components/settings/ImportProfilePreviewModal.tsx` | `<Form>`/`<Table>` wrapper | caller form/table
<!-- SURFACE: form --> | `src/components/settings/JiraConfigCard.tsx` | `<Form>`/`<Table>` wrapper | caller form/table
<!-- SURFACE: form --> | `src/components/settings/KnowledgeServerConfigCard.tsx` | `<Form>`/`<Table>` wrapper | caller form/table
<!-- SURFACE: form --> | `src/components/settings/McpConfigCard.tsx` | `<Form>`/`<Table>` wrapper | caller form/table
<!-- SURFACE: form --> | `src/components/settings/NineRouterConfigCard.tsx` | `<Form>`/`<Table>` wrapper | caller form/table
<!-- SURFACE: form --> | `src/components/settings/OverridesTable.tsx` | `<Form>`/`<Table>` wrapper | caller form/table
<!-- SURFACE: form --> | `src/components/settings/SshConfigCard.tsx` | `<Form>`/`<Table>` wrapper | caller form/table
<!-- SURFACE: form --> | `src/components/settings/SshFsAiToolConfigCard.tsx` | `<Form>`/`<Table>` wrapper | caller form/table
<!-- SURFACE: form --> | `src/components/systems/SystemModal.tsx` | `<Form>`/`<Table>` wrapper | caller form/table
<!-- SURFACE: form --> | `src/components/tasks/CreateJiraIssueModal.tsx` | `<Form>`/`<Table>` wrapper | caller form/table
<!-- SURFACE: form --> | `src/components/tasks/ManualWorkSessionModal.tsx` | `<Form>`/`<Table>` wrapper | caller form/table
<!-- SURFACE: form --> | `src/components/tasks/TaskDrawer.tsx` | `<Form>`/`<Table>` wrapper | caller form/table
<!-- SURFACE: form --> | `src/components/tasks/TaskTable.tsx` | `<Form>`/`<Table>` wrapper | caller form/table
<!-- SURFACE: form --> | `src/components/tasks/WorkSessionsTab.tsx` | `<Form>`/`<Table>` wrapper | caller form/table
<!-- SURFACE: form --> | `src/views/ChangeRequestDetailView.tsx` | `<Form>`/`<Table>` wrapper | caller form/table
<!-- SURFACE: form --> | `src/views/SystemDetailView.tsx` | `<Form>`/`<Table>` wrapper | caller form/table
<!-- SURFACE: form --> | `src/views/TelegramMonitorView.tsx` | `<Form>`/`<Table>` wrapper | caller form/table

**menu/context menu** — lệnh: `grep -rln "onContextMenu" src --include="*.tsx" | grep -v __tests__` trả **đúng 1 file**: `src/components/tasks/TaskTable.tsx:1014`. Chỉ grep `<Menu` sẽ sót context menu này.
<!-- SURFACE: menu --> | `src/components/ui/menu.tsx` | wrapper Menu + static item/submenu/group | menu/context menu surface
<!-- SURFACE: menu --> | `src/components/ui/dropdown.tsx` | wrapper Dropdown/DropdownButton | menu/context menu surface
<!-- SURFACE: menu --> | `src/workbench/actions/actionRegistry.ts` | command/menu registry | menu/context menu surface
<!-- SURFACE: menu --> | `src/components/tasks/TaskTable.tsx` | `onContextMenu` duy nhất tại dòng 1014 — dễ sót | menu/context menu surface

**tooltip/popover** — lệnh: `grep -rln "<Tooltip" src --include="*.tsx" | grep -v __tests__ | wc -l` = **76 file** (PATTERNS ghi 76 — khớp).
<!-- SURFACE: tooltip --> | `src/components/ui/tooltip.tsx` | wrapper Tooltip/Popover | control gốc
<!-- SURFACE: tooltip --> | `src/components/ui/popover.tsx` | wrapper Tooltip/Popover | control gốc
<!-- SURFACE: tooltip --> | `src/components/agents/AgentDiffReviewer.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/agents/AgentTerminalLog.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/agents/DiffHunkView.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/ai/ActiveAiTurnIndicator.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/ai/ChatHeader.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/ai/ChatInputBar.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/ai/ChatMessageBubble.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/ai/ChatMessageList.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/ai/ChatTabBar.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/ai/ChatTabToolbox.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/ai/CitationChip.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/ai/InlineAISelectionBar.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/ai/MermaidViewer.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/ai/grounded/CandidateChipList.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/ai/grounded/ClaimBlock.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/ai/grounded/GroundedAnswerCard.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/ai/grounded/ReasonCodeChip.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/ai/grounded/SourcesPanel.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/ai/office/AgentActivityPanel.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/ai/office/TeamWorkspace.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/ai/widget/PatchDiffApprovalCard.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/changeRequests/ChangeRequestTable.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/common/TagListDisplay.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/diagrams/EntityDiagramsSection.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/knowledge/DocPublishBadge.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/knowledge/DocumentSetForm.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/knowledge/GraphEvidenceDrawer.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/notes/DocEditorPane.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/notes/DocFolderTree.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/notes/DocListPane.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/notes/EntityNotesSection.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/notes/NoteAttachmentsPanel.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/notes/QuickNoteEntry.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/notes/QuickPreviewDrawer.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/notifications/NotificationBell.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/notifications/NotificationItemRow.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/palette/CommandPaletteModal.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/planner/DayColumn.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/planner/DayColumnHeader.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/settings/SshConfigCard.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/settings/SystemTypeOptionsCard.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/shell/GitHubSyncStatusDot.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/shell/StatusBadge.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/systems/SystemTable.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/tasks/LinkedKnowledgeSection.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/tasks/TaskChecklistSection.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/tasks/TaskDrawer.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/tasks/TaskDrawerPlanning.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/tasks/TaskTable.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/tasks/WorkSessionsTab.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/components/timer/ActiveTimerWidget.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/views/ChangeRequestDetailView.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/views/ConfigProfilesView.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/views/ItemInsightView.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/views/MermaidAssistantView.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/views/NotesPopoutView.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/views/NotesView.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/views/SystemDetailView.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/views/TelegramMonitorView.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/views/TimerPopoutView.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/workbench/DocumentSetDetail.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/workbench/EditorArea.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/workbench/StatusBar.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/workbench/TitleBar.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/workbench/editor/RemoteFileViewer.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/workbench/search/find/FindInRemoteFiles.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/workbench/toolwindows/AiOfficeExplorer.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/workbench/toolwindows/AiStaffExplorer.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/workbench/toolwindows/BottomToolWindow.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/workbench/toolwindows/DiagramExplorer.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/workbench/toolwindows/LeftToolWindow.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/workbench/toolwindows/RemoteGitExplorer.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/workbench/toolwindows/RemoteTerminalPanel.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/workbench/toolwindows/RightToolWindow.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/workbench/toolwindows/Stripe.tsx` | `<Tooltip>` wrapper | caller tooltip
<!-- SURFACE: tooltip --> | `src/workbench/toolwindows/ToolExplorerPanel.tsx` | `<Tooltip>` wrapper | caller tooltip

**notification** — lệnh: `find src/components/notifications -type f` + `ls src/hooks/use{Notifications,DesktopNotification,TimerAlertMonitor}.ts`. Notification phải **realtime, không reload** (memory rule).
<!-- SURFACE: notification --> | `src/components/notifications/NotificationBell.tsx` | notification wrapper/hook | giữ realtime, không reload
<!-- SURFACE: notification --> | `src/components/notifications/NotificationDrawer.tsx` | notification wrapper/hook | giữ realtime, không reload
<!-- SURFACE: notification --> | `src/components/notifications/NotificationItemRow.tsx` | notification wrapper/hook | giữ realtime, không reload
<!-- SURFACE: notification --> | `src/components/ui/notification.tsx` | notification wrapper/hook | giữ realtime, không reload
<!-- SURFACE: notification --> | `src/workbench/toolwindows/NotificationPanel.tsx` | notification wrapper/hook | giữ realtime, không reload
<!-- SURFACE: notification --> | `src/hooks/useNotifications.ts` | notification wrapper/hook | giữ realtime, không reload
<!-- SURFACE: notification --> | `src/hooks/useDesktopNotification.ts` | notification wrapper/hook | giữ realtime, không reload
<!-- SURFACE: notification --> | `src/hooks/useTimerAlertMonitor.ts` | notification wrapper/hook | giữ realtime, không reload

**empty/error/loading** — lệnh: `find src -type f \( -iname "*empty*" -o -iname "*loading*" -o -iname "*error*" -o -iname "*skeleton*" -o -iname "*banner*" \)` — nhóm phân tán, PATTERNS không có cluster riêng.
<!-- SURFACE: state --> | `src/components/common/EmptyState.tsx` | empty/error/loading wrapper hoặc banner | trạng thái phân tán, dễ sót
<!-- SURFACE: state --> | `src/components/ui/empty.tsx` | empty/error/loading wrapper hoặc banner | trạng thái phân tán, dễ sót
<!-- SURFACE: state --> | `src/components/ui/skeleton.tsx` | empty/error/loading wrapper hoặc banner | trạng thái phân tán, dễ sót
<!-- SURFACE: state --> | `src/components/ui/result.tsx` | empty/error/loading wrapper hoặc banner | trạng thái phân tán, dễ sót
<!-- SURFACE: state --> | `src/components/ui/alert.tsx` | empty/error/loading wrapper hoặc banner | trạng thái phân tán, dễ sót
<!-- SURFACE: state --> | `src/components/ui/spin.tsx` | empty/error/loading wrapper hoặc banner | trạng thái phân tán, dễ sót
<!-- SURFACE: state --> | `src/components/ai/InlineApiErrorCard.tsx` | empty/error/loading wrapper hoặc banner | trạng thái phân tán, dễ sót
<!-- SURFACE: state --> | `src/components/ai/InterruptedBanner.tsx` | empty/error/loading wrapper hoặc banner | trạng thái phân tán, dễ sót
<!-- SURFACE: state --> | `src/components/ai/widget/StagedLoadingIndicator.tsx` | empty/error/loading wrapper hoặc banner | trạng thái phân tán, dễ sót
<!-- SURFACE: state --> | `src/components/ai/grounded/GroundedBanner.tsx` | empty/error/loading wrapper hoặc banner | trạng thái phân tán, dễ sót
<!-- SURFACE: state --> | `src/components/notes/SmartIngestionBanner.tsx` | empty/error/loading wrapper hoặc banner | trạng thái phân tán, dễ sót
<!-- SURFACE: state --> | `src/components/settings/PostRestoreBanner.tsx` | empty/error/loading wrapper hoặc banner | trạng thái phân tán, dễ sót

## 4. Phân loại implementation

Mục này là INV-03. Mỗi dòng `<!-- CLASSIFY: <tên-file> -->` khớp đúng một `<!-- WRAPPER-ROW -->` ở §2 theo cùng tên file (56 dòng, không thiếu, không trùng). Nhóm được gán theo `51-PATTERNS.md` §4 với **quy tắc ưu tiên bắt buộc, mỗi file chỉ một nhóm**: (1) có behavior overlay/complex (range picker, popup, focus trap, portal, mask, contextHolder) → `overlay/complex`; (2) domain-specific phục vụ view cụ thể → `domain/adoption`; (3) còn lại → `core/form`. Áp dụng quy tắc: `date-picker.tsx` có range picker → `overlay/complex` (không ghi core/form); `status-dot.tsx` và `empty.tsx` phục vụ view cụ thể → `domain/adoption` (không ghi core/form); `auto-complete.tsx` có popup → `overlay/complex`. `icon.tsx` gộp 141 export `wrapIcon` vào một dòng, kèm ghi chú 8 deep-import ở `RemoteGitExplorer.tsx` (§3.1(e), vẫn tính chung nhóm core/form).

Cột `OpenIDEA analog` là **nhãn dự kiến** lấy từ baseline đã duyệt (`PROOF.md`, §5): chỉ ghi tên control có bằng chứng trong PROOF (Button, Input, Checkbox, Radio, Toggle, Select/Listbox, Tabs, Chip, Dialog); mọi control khác ghi đúng chữ `cần thiết kế mới`. Phase 51 **không** đặt metric/CSS module/DOM/class — đó là MAP-01/MAP-02 của Phase 52. "Control còn thiếu" mô tả phần PROOF chưa port, không phải quyết định thiết kế.

| dòng phân loại | nhóm | complexity | wrapper cần thay | OpenIDEA analog | control còn thiếu | behavior phải giữ nguyên |
|---|---|---|---|---|---|---|
<!-- CLASSIFY: alert -->
| `src/components/ui/alert.tsx` | core/form | thấp | `src/components/ui/alert.tsx` | cần thiết kế mới | banner/alert variant light+dark | type mặc định info; status map D-12; caller style win |
<!-- CLASSIFY: app -->
| `src/components/ui/app.tsx` | overlay/complex | trung bình | `src/components/ui/app.tsx` | cần thiết kế mới | app root holder tương đương AntApp | token `--ui-app-font-size`; caller style win; `useApp()` tách khỏi `message.tsx`; context holder phải render |
<!-- CLASSIFY: auto-complete -->
| `src/components/ui/auto-complete.tsx` | overlay/complex | cao | `src/components/ui/auto-complete.tsx` | Select + Listbox | popup gợi ý auto-complete | metric qua `styles.root`; caller root style win; popup Arrow/Enter/Escape, portal cách anchor 4px (Phase 52 xác nhận) |
<!-- CLASSIFY: avatar -->
| `src/components/ui/avatar.tsx` | core/form | thấp | `src/components/ui/avatar.tsx` | cần thiết kế mới | avatar + group fallback | iconSize/fontSize token; caller style win; Group mirrored |
<!-- CLASSIFY: badge -->
| `src/components/ui/badge.tsx` | core/form | trung bình | `src/components/ui/badge.tsx` | Chip | badge count/status light+dark | status color từ map D-12; color explicit caller win; caller style win |
<!-- CLASSIFY: breadcrumb -->
| `src/components/ui/breadcrumb.tsx` | overlay/complex | thấp | `src/components/ui/breadcrumb.tsx` | cần thiết kế mới | breadcrumb separator/link | font/gap token; caller style win; statics mirrored (Item, Separator) |
<!-- CLASSIFY: button -->
| `src/components/ui/button.tsx` | core/form | thấp | `src/components/ui/button.tsx` | Button | none cho shape cơ bản (PROOF có primary/secondary/ghost/small/disabled) | variant map type/danger; `withoutUndefined` bỏ key undefined; native Enter/Space; caller props/style win; `IconButton` bắt `aria-label` |
<!-- CLASSIFY: card -->
| `src/components/ui/card.tsx` | overlay/complex | trung bình | `src/components/ui/card.tsx` | cần thiết kế mới | card grid/meta | statics mirrored thành named export; token style; caller style win |
<!-- CLASSIFY: checkbox -->
| `src/components/ui/checkbox.tsx` | core/form | thấp | `src/components/ui/checkbox.tsx` | Checkbox | none cho shape cơ bản (PROOF có SVG check 12px) | `withoutUndefined`; Space toggle native; controlSize token; caller style win; Group mirrored |
<!-- CLASSIFY: collapse -->
| `src/components/ui/collapse.tsx` | overlay/complex | trung bình | `src/components/ui/collapse.tsx` | cần thiết kế mới | accordion panel | header Enter/Space; font/height/padding token; caller style win; Panel mirrored |
<!-- CLASSIFY: config-provider -->
| `src/components/ui/config-provider.tsx` | overlay/complex | trung bình | `src/components/ui/config-provider.tsx` | cần thiết kế mới | theme provider holder | theme thuộc caller; `withoutUndefined(theme)`; `getSharedControlTokens` được gọi; kế thừa descendants |
<!-- CLASSIFY: date-picker -->
| `src/components/ui/date-picker.tsx` | overlay/complex | cao | `src/components/ui/date-picker.tsx` | cần thiết kế mới | calendar popup + range picker | **range picker (DateRangePicker) thuộc nhóm này**; width full mặc định; `withoutUndefined` value/onChange; picker keyboard; caller style win |
<!-- CLASSIFY: descriptions -->
| `src/components/ui/descriptions.tsx` | overlay/complex | trung bình | `src/components/ui/descriptions.tsx` | cần thiết kế mới | description list layout | font/height token; label/value pairs; caller style win; Item mirrored |
<!-- CLASSIFY: divider -->
| `src/components/ui/divider.tsx` | core/form | thấp | `src/components/ui/divider.tsx` | cần thiết kế mới | divider/separator | separator semantics; font/gap token; caller style win |
<!-- CLASSIFY: drawer -->
| `src/components/ui/drawer.tsx` | overlay/complex | cao | `src/components/ui/drawer.tsx` | Dialog (panel) | drawer placement + mask policy | Esc close khi closable; **focus trap**; `resolveMask` giữ boolean `false` không đổi thành object; `closePolicy: silent` tắt closable; caller width/title win |
<!-- CLASSIFY: dropdown -->
| `src/components/ui/dropdown.tsx` | overlay/complex | cao | `src/components/ui/dropdown.tsx` | Select + Listbox (trigger) | overlay menu placement | Arrow/Enter menu; `styles.root` token; caller styles win; portal placement; Button mirrored |
<!-- CLASSIFY: empty -->
| `src/components/ui/empty.tsx` | domain/adoption | thấp | `src/components/ui/empty.tsx` | cần thiết kế mới | domain-specific empty description | font token; description muted color; caller styles win; images mirrored; trạng thái empty/error/loading (§3.2 state) giữ nguyên |
<!-- CLASSIFY: form -->
| `src/components/ui/form.tsx` | overlay/complex | cao | `src/components/ui/form.tsx` | Input + Checkbox (form layout) | form layout + validation/error list | labelPolicy map layout; caller layout/requiredMark win; Enter submit + field focus; `FormItem`/`FormList`/`FormErrorList`/`useForm`/`useWatch` static phải mirrored như source (`form.tsx:35-39`) |
<!-- CLASSIFY: grid -->
| `src/components/ui/grid.tsx` | core/form | trung bình | `src/components/ui/grid.tsx` | cần thiết kế mới | grid gutter/breakpoint | gutter mặc định paddingInline; caller gutter/style win; `Grid.useBreakpoint` mirrored |
<!-- CLASSIFY: icon -->
| `src/components/ui/icon.tsx` | core/form | cao | `src/components/ui/icon.tsx` | cần thiết kế mới | bộ icon SVG thay 141 export `@ant-design/icons` | **141 export qua một factory `wrapIcon`**; token fontSize/iconSize; tone map D-12; caller style win; tên export giữ nguyên. §3.1(e): 8 deep-import tại `RemoteGitExplorer.tsx` (`FolderOutlined`, `FolderOpenOutlined`, `FileTextOutlined`, `ReloadOutlined`, `SearchOutlined`, `BranchesOutlined`, `CloudServerOutlined`, `FolderViewOutlined`) thuộc **cùng nhóm core/form** |
<!-- CLASSIFY: image -->
| `src/components/ui/image.tsx` | overlay/complex | trung bình | `src/components/ui/image.tsx` | cần thiết kế mới | image preview portal | preview controls keyboard; `styles.root` token; caller root style win; PreviewGroup mirrored |
<!-- CLASSIFY: input-number -->
| `src/components/ui/input-number.tsx` | core/form | trung bình | `src/components/ui/input-number.tsx` | Input | number stepper | min/max/precision truyền nguyên; `withoutUndefined`; ArrowUp/ArrowDown native; status từ aria-invalid; caller style win |
<!-- CLASSIFY: input -->
| `src/components/ui/input.tsx` | core/form | thấp | `src/components/ui/input.tsx` | Input | none cho shape cơ bản | full width mặc định; forwardRef; native focus; status từ aria-invalid; `withoutUndefined`; caller style win; Search/Password mirrored |
<!-- CLASSIFY: layout -->
| `src/components/ui/layout.tsx` | overlay/complex | trung bình | `src/components/ui/layout.tsx` | cần thiết kế mới | shell landmark + sider | token height/gutter; sider controls; landmark semantics; caller style win; statics mirrored |
<!-- CLASSIFY: list -->
| `src/components/ui/list.tsx` | overlay/complex | trung bình | `src/components/ui/list.tsx` | Listbox | list pagination + meta | generic preserved; row height/font token; item focus; caller style win |
<!-- CLASSIFY: mentions -->
| `src/components/ui/mentions.tsx` | core/form | trung bình | `src/components/ui/mentions.tsx` | Input | @-mention popup | full width mặc định; forwardRef; @ trigger + Arrow/Enter; iconSize token; caller style win; Option mirrored |
<!-- CLASSIFY: menu -->
| `src/components/ui/menu.tsx` | overlay/complex | cao | `src/components/ui/menu.tsx` | Listbox | menu popup placement | Arrow/Enter/Escape; row height từ controlHeight; caller style win; Item/SubMenu/ItemGroup mirrored; context menu duy nhất `TaskTable.tsx:1014` (§3.2) |
<!-- CLASSIFY: message -->
| `src/components/ui/message.tsx` | overlay/complex | cao | `src/components/ui/message.tsx` | cần thiết kế mới | message holder + instance API | holder đơn nhất; không static `message.*`; `contextHolder` phải render; kế thừa ConfigProvider theme; realtime không reload |
<!-- CLASSIFY: modal -->
| `src/components/ui/modal.tsx` | overlay/complex | cao | `src/components/ui/modal.tsx` | Dialog + window titlebar | imperative modal + footer/mask policy | Esc close khi closable; **focus trap**; boolean `mask: false` giữ nguyên (không đổi thành object); `contextHolder` từ `useTaskMateModal()` phải render; `footerPolicy: none` → null; `withoutUndefined`; caller win |
<!-- CLASSIFY: notification -->
| `src/components/ui/notification.tsx` | overlay/complex | trung bình | `src/components/ui/notification.tsx` | cần thiết kế mới | notification instance + realtime sink | duration 4.5; placement topRight; pauseOnHover true; iconSize token; không static API; realtime không reload (memory rule) |
<!-- CLASSIFY: pagination -->
| `src/components/ui/pagination.tsx` | overlay/complex | trung bình | `src/components/ui/pagination.tsx` | cần thiết kế mới | pagination controls | `styles.root` token; page buttons keyboard; caller root style win |
<!-- CLASSIFY: popconfirm -->
| `src/components/ui/popconfirm.tsx` | overlay/complex | trung bình | `src/components/ui/popconfirm.tsx` | Dialog (confirm) | confirm popover + tone | okText "Xác nhận", cancelText "Hủy"; okType primary; `tone: danger` → okButtonProps.danger; trigger focus + Escape dismiss; caller okType/okButtonProps win; khác static `Modal.confirm` |
<!-- CLASSIFY: popover -->
| `src/components/ui/popover.tsx` | overlay/complex | trung bình | `src/components/ui/popover.tsx` | cần thiết kế mới | portal placement | trigger hover/click/focus; maxWidth từ controlHeight scale; caller overlayStyle win |
<!-- CLASSIFY: progress -->
| `src/components/ui/progress.tsx` | core/form | thấp | `src/components/ui/progress.tsx` | cần thiết kế mới | progress bar | status map D-12; progressbar semantics; caller strokeColor/style win |
<!-- CLASSIFY: radio -->
| `src/components/ui/radio.tsx` | core/form | thấp | `src/components/ui/radio.tsx` | Radio | none cho shape cơ bản | Arrow selection native; Group/Button mirrored cùng token style; caller size/style win |
<!-- CLASSIFY: result -->
| `src/components/ui/result.tsx` | core/form | thấp | `src/components/ui/result.tsx` | cần thiết kế mới | result illustration | font/icon token; caller style win; title/status text |
<!-- CLASSIFY: segmented -->
| `src/components/ui/segmented.tsx` | core/form | trung bình | `src/components/ui/segmented.tsx` | Tabs | segmented control shape | generic preserved; Arrow selection; token height/font/radius; caller style win |
<!-- CLASSIFY: select -->
| `src/components/ui/select.tsx` | core/form | trung bình | `src/components/ui/select.tsx` | Select + Listbox | none cho shape cơ bản (PROOF có listbox 24px row) | allowClear mặc định true; `withoutUndefined`; full width; combobox Arrow/Enter; status từ aria-invalid; caller status/style win |
<!-- CLASSIFY: skeleton -->
| `src/components/ui/skeleton.tsx` | core/form | thấp | `src/components/ui/skeleton.tsx` | cần thiết kế mới | skeleton shapes | statics mirrored; row/avatar token; loading semantics; caller style win |
<!-- CLASSIFY: slider -->
| `src/components/ui/slider.tsx` | core/form | trung bình | `src/components/ui/slider.tsx` | cần thiết kế mới | slider handle/rail | Arrow keys trên handle; handle/rail token; caller style win; aria-label từ caller |
<!-- CLASSIFY: space -->
| `src/components/ui/space.tsx` | core/form | thấp | `src/components/ui/space.tsx` | cần thiết kế mới | spacing primitive | gap mặc định paddingInline; caller size/style win; Compact mirrored |
<!-- CLASSIFY: spin -->
| `src/components/ui/spin.tsx` | core/form | thấp | `src/components/ui/spin.tsx` | cần thiết kế mới | spinner | accent từ map D-12; status semantics; caller style win; static mirrored |
<!-- CLASSIFY: splitter -->
| `src/components/ui/splitter.tsx` | overlay/complex | cao | `src/components/ui/splitter.tsx` | cần thiết kế mới | resize handle + drag policy | resize handle keys; handle size token; caller style win; Panel mirrored |
<!-- CLASSIFY: statistic -->
| `src/components/ui/statistic.tsx` | core/form | thấp | `src/components/ui/statistic.tsx` | cần thiết kế mới | statistic/countdown display | font token; statics mirrored; Countdown onFinish; caller style win |
<!-- CLASSIFY: status-dot -->
| `src/components/ui/status-dot.tsx` | domain/adoption | thấp | `src/components/ui/status-dot.tsx` | cần thiết kế mới | domain status dot (view-specific) | map D-12 chung; decorative aria-hidden mặc định; role img khi có label; caller style win |
<!-- CLASSIFY: switch -->
| `src/components/ui/switch.tsx` | core/form | thấp | `src/components/ui/switch.tsx` | Toggle | none cho shape cơ bản | Space toggle; `role=switch`; height/radius token; caller style win |
<!-- CLASSIFY: table -->
| `src/components/ui/table.tsx` | overlay/complex | cao | `src/components/ui/table.tsx` | cần thiết kế mới | data grid (header/sort/pagination/selection) | generic preserved; density → size chỉ khi set; padding/font token; row selection controls; caller style win; `TableSummary` mirrored |
<!-- CLASSIFY: tabs -->
| `src/components/ui/tabs.tsx` | overlay/complex | trung bình | `src/components/ui/tabs.tsx` | Tabs | none cho shape cơ bản | Arrow trong tablist; `styles.root` token; caller styles win; TabPane mirrored |
<!-- CLASSIFY: tag -->
| `src/components/ui/tag.tsx` | core/form | trung bình | `src/components/ui/tag.tsx` | Chip | status tag variants | status map D-12 light/dark; checkable tag focus; caller style win; CheckableTag mirrored |
<!-- CLASSIFY: textarea -->
| `src/components/ui/textarea.tsx` | core/form | thấp | `src/components/ui/textarea.tsx` | Input | multiline + auto-size | minRows 2; maxRows từ controlHeight/fontSize; full width; forwardRef; native focus; `withoutUndefined`; alias `TextArea` |
<!-- CLASSIFY: time-picker -->
| `src/components/ui/time-picker.tsx` | core/form | trung bình | `src/components/ui/time-picker.tsx` | cần thiết kế mới | time popup + range | pickerStyle full width mặc định; picker Arrow/Enter; caller style win; TimeRangePicker mirrored |
<!-- CLASSIFY: tooltip -->
| `src/components/ui/tooltip.tsx` | overlay/complex | trung bình | `src/components/ui/tooltip.tsx` | cần thiết kế mới | portal tooltip placement | hover/focus trigger; mouseEnterDelay 0.15 mặc định; maxWidth token scale; caller overlayStyle win |
<!-- CLASSIFY: tree-select -->
| `src/components/ui/tree-select.tsx` | overlay/complex | cao | `src/components/ui/tree-select.tsx` | Select + Listbox | tree popup + checkable nodes | full width mặc định; combobox/tree navigation; `SHOW_ALL`/`SHOW_CHILD`/`SHOW_PARENT` mirrored; caller style win |
<!-- CLASSIFY: tree -->
| `src/components/ui/tree.tsx` | overlay/complex | cao | `src/components/ui/tree.tsx` | cần thiết kế mới | virtualized tree + drag/drop | Arrow/Enter navigation; row height từ controlHeight; caller style win; TreeNode/DirectoryTree mirrored |
<!-- CLASSIFY: typography -->
| `src/components/ui/typography.tsx` | core/form | trung bình | `src/components/ui/typography.tsx` | cần thiết kế mới | font roles + Link | fontRole 11/12/13/16px qua CSS token; Link focus kế thừa; caller style win; namespace gồm Link |
<!-- CLASSIFY: upload -->
| `src/components/ui/upload.tsx` | overlay/complex | cao | `src/components/ui/upload.tsx` | cần thiết kế mới | file picker + drop zone + progress | full width mặc định; token metrics; trigger/filename buttons; `beforeUpload`/`onChange` giữ nguyên; Dragger + `UPLOAD_LIST_IGNORE` mirrored; caller style win |

Tổng theo nhóm: `core/form` 26 wrapper, `overlay/complex` 28 wrapper, `domain/adoption` 2 wrapper (`status-dot`, `empty`) — cộng 56, **không đếm trùng** một file nào. 257 tên export guard đứng riêng ở §2.1; 141 export icon nằm trong đúng một dòng `icon`.

### 4.1 Adoption surface → wrapper

Mỗi dòng dưới tương ứng một nhóm `<!-- SURFACE: ... -->` trong §3.2 (12 nhóm INV-02, 441 dòng). Độ phức tạp adoption tính theo **số file call site**: thấp ≤5, trung bình 6-20, cao >20. `domain/adoption` ở bảng §4 là wrapper domain-specific; bảng này là phần còn lại của nhóm — mọi surface consumer phải đổi import sang wrapper đã thay ở Phase 53/54.

| SURFACE nhóm | complexity adoption | wrapper tiêu thụ chính | path files dẫn chứng (§3.2) | behavior phải giữ |
|---|---|---|---|---|
| route | cao | ThemeConfigProvider, App, message/notification holder | `src/hooks/useHashRoute.ts`, `src/AppIntelliJ.tsx`, `src/views/TimerPopoutView.tsx`, `src/views/NotesPopoutView.tsx`, `src/views/AIPopoutView.tsx`, `src/views/CodingZonePopoutView.tsx`, `src/workbench/EditorArea.tsx` | 15 route + 22 `viewType`; mỗi popout tự bọc `AntdThemeAdapter` + `ThemeAppHolder`, không singleton holder |
| toolwindow | cao | Button, IconButton, Tooltip, Dropdown, Menu, Spin | `src/workbench/toolwindows/*.tsx` (18), `src/workbench/WorkbenchLayout.tsx`, `src/workbench/TitleBar.tsx`, `src/workbench/StatusBar.tsx`, `src/workbench/EditorArea.tsx`, `src/workbench/search/SearchEverywhereModal.tsx` | shell/provider/command registry; theme + context message giữ nguyên |
| settings | cao | Input, Select, Switch, Form, Table, Modal, Popconfirm, notification | `src/components/settings/*.tsx` (30), `src/views/SettingsView.tsx`, `src/views/ConfigProfilesView.tsx` | form validation, import preview/DLP confirmation, realtime notification không reload |
| cr | thấp | Modal, Table, Form, Select | `src/components/changeRequests/ChangeRequestModal.tsx`, `ChangeRequestTable.tsx`, `TargetSystemsSelector.tsx`, `src/views/ChangeRequestsView.tsx`, `src/views/ChangeRequestDetailView.tsx` | modal/table/form behavior, caller props win |
| notes | trung bình | Tree, Modal, Drawer, Input, Popconfirm, Tooltip | `src/components/notes/*.tsx` (16), `src/views/NotesView.tsx`, `src/views/NotesPopoutView.tsx` | tree editor/modal/banner; popout tự bọc holder |
| ai | cao | Button, Input, Tooltip, Modal, Drawer, Table, message/notification | `src/components/ai/**`, `src/components/agents/*.tsx` (11), `src/views/AiOfficeView.tsx`, `src/views/TeamWorkspaceView.tsx`, `src/workbench/toolwindows/AiOfficeExplorer.tsx` | chat/citation/modal/diff + realtime agent activity; context-bound notification |
| modal | cao | Modal, Drawer, Popover, Popconfirm | 85 file `<Modal>`/`<Drawer>`/`<Popover>` + 33 file `<Popconfirm>` (danh sách §3.2) | focus trap, Escape, portal, mask `false`, `contextHolder`; `<Popconfirm>` khác static `Modal.confirm` |
| form | cao | Form + static subcomponent, Input, Select, Table | 38 file (danh sách §3.2), `src/components/ui/form.tsx:35-39` | `FormItem`/`FormList`/`FormErrorList`/`useForm`/`useWatch` mirror; validation + labelPolicy |
| menu | thấp | Menu, Dropdown | `src/components/ui/menu.tsx`, `src/components/ui/dropdown.tsx`, `src/workbench/actions/actionRegistry.ts`, `src/components/tasks/TaskTable.tsx:1014` | `onContextMenu` duy nhất tại `TaskTable.tsx:1014` — grep `<Menu` sẽ sót |
| tooltip | cao | Tooltip, Popover | 76 file (danh sách §3.2), gồm `src/components/ui/tooltip.tsx`, `src/components/ui/popover.tsx` | mouseEnterDelay 0.15; portal placement; caller overlayStyle win |
| notification | trung bình | notification hook, ThemeAppHolder | `src/components/notifications/*.tsx`, `src/components/ui/notification.tsx`, `src/workbench/toolwindows/NotificationPanel.tsx`, `src/hooks/useNotifications.ts`, `useDesktopNotification.ts`, `useTimerAlertMonitor.ts` | **realtime, không reload**; context-bound, không static API |
| state | trung bình | Empty, Skeleton, Result, Alert, Spin | `src/components/common/EmptyState.tsx`, `src/components/ui/{empty,skeleton,result,alert,spin}.tsx`, `src/components/ai/InlineApiErrorCard.tsx`, `InterruptedBanner.tsx`, `widget/StagedLoadingIndicator.tsx`, `grounded/GroundedBanner.tsx`, `notes/SmartIngestionBanner.tsx`, `settings/PostRestoreBanner.tsx` | empty/error/loading semantics + status map D-12 |

### 4.2 Ba nhóm ↔ phase tiêu thụ

| Nhóm INV-03 | Số wrapper | Tiêu thụ bởi | Requirement/plan | Đầu ra bị cấm ở Phase 51 |
|---|---:|---|---|---|
| core/form | 26 | Phase 53 | NAT-01 | không đổi props/keyboard/focus/a11y của control hiện hữu |
| overlay/complex | 28 | Phase 54 | NAT-02 | không thiết kế focus trap/portal/mask mới — chỉ ghi tiêu chí phải giữ |
| domain/adoption | 2 wrapper + 12 SURFACE nhóm ở §4.1 | Phase 55 | NAT-03 / NAT-04 | không sửa call site, không đổi route/popout provider |
| (liên kết) import type/static/plots | 31 import type + 13 export type + 22 deep type + 8 icon deep-import + 4 plots | Phase 56 | CLEAN-01 / CLEAN-02 / CLEAN-03 | chỉ gỡ import khi dependency AntD bị xóa; ghi rõ ở §3.1, không đụng runtime Phase 53/54 |

## 5. Đối chiếu cuối và bàn giao Phase 52

### 5.1 Tiêu chí thành công ↔ vị trí trong artifact

Năm tiêu chí của `.planning/ROADMAP.md:45-49` (Phase 51) đối chiếu trực tiếp với marker trong artifact này. Mọi lệnh chạy từ repo root `/Users/tranducquan/Working/Personal/task-management`.

| Tiêu chí ROADMAP | Vị trí trong artifact / marker | Lệnh kiểm tra |
|---|---|---|
| #1 — danh mục mọi wrapper và grep import khớp, không import ngoài tồn kho | §2 `<!-- WRAPPER-ROW -->` (56 dòng), §2.1 `<!-- EXPORT:` (257 tên), §3.1 `SURFACE-DETAIL` 139 `path:line` + fixture 365 entry | `grep -c '^<!-- WRAPPER-ROW -->' .planning/phases/51-control-inventory-surface-audit/51-CONTROL-INVENTORY.md` (=56); `find src/components/ui -maxdepth 1 -name '*.tsx' \| wc -l` (=56); `grep -Fq "<path:line>" tests/fixtures/ant-design-surface-inventory.txt` cho từng entry |
| #2 — mỗi control có file, props, state, event, keyboard/focus, validation, accessible name | §2 mỗi dòng `WRAPPER-ROW` có đủ 7 cột sau marker | `grep -c '^<!-- WRAPPER-ROW -->' ...` (=56); đọc 56 dòng §2 — cột `props/extends`, `state`, `event`, `keyboard/focus`, `validation`, `accessible name`, `behavior phải giữ` |
| #3 — mọi UI surface 12 nhóm được quét | §3.2 `<!-- SURFACE: <group> -->` (441 dòng), đủ 12 nhóm INV-02 | `grep -c '^<!-- SURFACE:' ...` (=441); `grep -o '^<!-- SURFACE: [a-z]*' ... \| sort -u \| wc -l` (=12) |
| #4 — nhóm implementation, complexity, wrapper cần thay, analog hoặc "cần thiết kế mới", behavior phải giữ | §4 bảng 56 dòng `<!-- CLASSIFY:` (mỗi dòng 7 cột), §4.1 12 dòng SURFACE adoption, §4.2 3 nhóm ↔ phase | `grep -c '^<!-- CLASSIFY:' ...` (=56); lệnh `npx tsx` đối chiếu CLASSIFY ↔ WRAPPER-ROW ở cuối §5.2 |
| #5 — số wrapper artifact khớp số wrapper thực tế, không sót/không trùng | §1 bảng đối chiếu: **257 tên export làm con số guard** (được `scanWrappers()` trả về) và **56 file** làm cột "wrapper cần thay" — trùng bảng đối chiếu §1 và 56 dòng §2 | `npx tsx -e "import{scanWrappers}from './tests/helpers/antdInventory';console.log(scanWrappers('src/components/ui').size)"` (=257); `find src/components/ui -maxdepth 1 -name '*.tsx' \| wc -l` (=56); `npx tsx .../findMissingWrappers` → `[]` |

> #5 là hai phép đếm khác nhau, không được gộp: 257 tên export (icon, static subcomponent, hook, helper) là guard; 56 file `.tsx` là cột wrapper cần thay. Cả hai cùng khớp §1. `51-PATTERNS.md` từng gộp hai số này — đã bị §1 bác bỏ bằng lệnh live.

### 5.2 Lệnh tái tạo tổng hợp

Gộp lệnh ở `51-PATTERNS.md` §5 với lệnh grep marker. Copy/paste nguyên khối từ repo root (không chạy full Vitest):

```bash
cd /Users/tranducquan/Working/Personal/task-management

# 56 file wrapper + 4 hạ tầng + 10 test
find src/components/ui -maxdepth 1 -name '*.tsx' | wc -l
find src/components/ui -maxdepth 1 -type f ! -name '*.tsx' | sort
find src/components/ui/__tests__ -type f | sort

# 257 tên export guard, consumed antd và missing wrapper
npx tsx -e "import{scanWrappers,scanConsumedAntd,findMissingWrappers}from './tests/helpers/antdInventory';const w=scanWrappers('src/components/ui');const c=scanConsumedAntd('src');console.log('wrappers',w.size);console.log(JSON.stringify(c));console.log('missing',findMissingWrappers(c,w));"

# import antd / @ant-design/icons (runtime, type-only, re-export, deep)
grep -rnE "from ['\"](antd|@ant-design/icons)" src --include='*.ts' --include='*.tsx' | sort
grep -rnE "^import (type )?\{" src --include='*.ts' --include='*.tsx' \
  | grep -E "(antd|@ant-design/icons)" | grep -vE "^[^:]+:[0-9]+:import type \{" | sort
grep -rn "import type .* from 'antd'" src --include='*.ts' --include='*.tsx'
grep -rnE "export type .* from ['\"]antd" --include='*.ts' --include='*.tsx' src
grep -rnE "(import|export) type .* from ['\"]antd/es/" --include='*.ts' --include='*.tsx' src
grep -rn "@ant-design/icons/" src --include='*.tsx'
grep -rln "@ant-design/plots" src --include='*.tsx' | sort
grep -rnE "(Modal\.(confirm|info|success|warning|error)|message\.(success|error|warning|warn|info|loading|open|destroy)\(|notification\.(success|error|warning|warn|info|loading|open|destroy)\()" src --include='*.ts' --include='*.tsx' | grep -v '/ui/'

# surface: route, view, workbench, settings
cat src/hooks/useHashRoute.ts
grep -nE "case '" src/workbench/EditorArea.tsx
find src/views -maxdepth 1 -name '*.tsx' | sort
find src/workbench -maxdepth 2 -name '*.tsx' | sort
find src/components/settings -maxdepth 1 -name '*.tsx' | sort

# surface: overlay / menu / state
grep -rlnE '<(Modal|Drawer|Popover)' src --include='*.tsx' | grep -v __tests__ | sort
grep -rln '<Popconfirm' src --include='*.tsx' | grep -v __tests__ | sort
grep -rln '<Tooltip' src --include='*.tsx' | grep -v __tests__ | sort
grep -rln 'onContextMenu' src --include='*.tsx' | grep -v __tests__ | sort
find src -type f \( -iname '*empty*' -o -iname '*loading*' -o -iname '*error*' -o -iname '*skeleton*' -o -iname '*banner*' \) | sort

# marker artifact + fixture sort
grep -c '^<!-- WRAPPER-ROW -->' .planning/phases/51-control-inventory-surface-audit/51-CONTROL-INVENTORY.md   # 56
grep -c '^<!-- SURFACE:' .planning/phases/51-control-inventory-surface-audit/51-CONTROL-INVENTORY.md         # 441
grep -c '^<!-- EXPORT:' .planning/phases/51-control-inventory-surface-audit/51-CONTROL-INVENTORY.md          # 257
grep -c '^<!-- CLASSIFY:' .planning/phases/51-control-inventory-surface-audit/51-CONTROL-INVENTORY.md        # 56
awk 'NF' tests/fixtures/ant-design-surface-inventory.txt | LC_ALL=C sort -c

# CLASSIFY ↔ WRAPPER-ROW phải khớp từng tên file
npx tsx -e "import{readFileSync}from 'node:fs';const d=readFileSync('.planning/phases/51-control-inventory-surface-audit/51-CONTROL-INVENTORY.md','utf8');const rows=[...d.matchAll(/^<!-- WRAPPER-ROW -->[^\\n]*src\\/components\\/ui\\/([a-z0-9-]+)\\.tsx/gm)].map(m=>m[1]);const cls=[...d.matchAll(/^<!-- CLASSIFY: ([a-z0-9-]+) -->/gm)].map(m=>m[1]).sort();const want=[...new Set(rows)].sort();if(cls.length!==56||JSON.stringify(cls)!==JSON.stringify(want))throw Error('classify drift');console.log('classify matches',cls.length)"

# gate scoped — KHÔNG chạy full Vitest
npx vitest run src/components/ui/__tests__/antdInventory.test.ts src/components/ui/__tests__/coverage.test.ts src/components/ui/__tests__/staticApiGuard.test.ts --bail=1
npx tsc --noEmit
git status --short src
```

Kết quả chạy lúc đóng plan 2026-11-22 (repo root, Node v24.16.0):

| Kiểm tra | Kết quả |
|---|---|
| `npx vitest run ... --bail=1` (3 file) | **3 file / 12 test passed**, exit 0 |
| `npx tsc --noEmit` | exit 0, không lỗi |
| `git status --short src` | trống — Phase 51 không đổi source |
| `awk 'NF' fixture \| LC_ALL=C sort -c` | exit 0 |
| Marker artifact | `WRAPPER-ROW` 56, `EXPORT` 257, `SURFACE` 441, `CLASSIFY` 56; `classify matches 56` |
| `scanWrappers` / `findMissingWrappers` | `wrappers 257` / `missing []` |

### 5.3 Bàn giao Phase 52

- **Research**: bị bỏ theo quyết định milestone (ROADMAP ghi `Research flag: skipped`). Không chạy research phase; artifact này là input.
- **Baseline đã duyệt**: `/private/tmp/claude-503/-Users-tranducquan-Working-Personal-task-management/32c7be2b-546e-433a-aa53-76345c15954c/scratchpad/oi-prototype/PROOF.md` — **đường dẫn tuyệt đối, nằm ngoài repo**. `.planning/ROADMAP.md:52` ghi tắt `scratchpad/oi-prototype/PROOF.md`; phải dùng đường dẫn tuyệt đối ở trên. PATTERNS §6 ghi "không tìm thấy file" là kết quả quét bên trong repo; file tồn tại ở scratchpad và là proof đã được sếp duyệt. PROOF chỉ chứng minh prototype ngoài repo (Button/Input/Checkbox/Radio/Toggle/Select+Listbox/Tabs/Chip/Dialog, light+dark, focus ring, portal 4px, row 24px, dialog radius 10px); Phase 51 **không** copy thiết kế từ PROOF.
- **Phase 52 sản xuất** `52-UI-SPEC.md` và khóa API/metric cho MAP-01 (có analog) lẫn MAP-02 (thiết kế mới). MAP-03 khẳng định props/API/event/controlled-uncontrolled/validation/keyboard-focus/a11y giữ nguyên theo §2.
- **Phase 51 không đổi** props, API, event, keyboard, focus, accessible name của bất kỳ control nào — mọi cột `behavior phải giữ nguyên` ở §4/§4.1 là tiêu chí chặn cho Phase 53/54/55, không phải đề xuất thay đổi.
- **Đầu vào MAP-02** — danh sách 34 nhãn `cần thiết kế mới` đã gán ở §4 (mỗi dòng là một wrapper cần thiết kế control mới; Phase 52 quyết shape cụ thể):

  `alert`, `app`, `avatar`, `breadcrumb`, `card`, `collapse`, `config-provider`, `date-picker`, `descriptions`, `divider`, `empty`, `grid`, `icon`, `image`, `layout`, `message`, `notification`, `pagination`, `popover`, `progress`, `result`, `skeleton`, `slider`, `space`, `spin`, `splitter`, `statistic`, `status-dot`, `table`, `time-picker`, `tooltip`, `tree`, `typography`, `upload` — cộng 4 deep-import icon trong `RemoteGitExplorer.tsx` (`FolderOutlined`, `FolderOpenOutlined`, `FileTextOutlined`, `ReloadOutlined`, `SearchOutlined`, `BranchesOutlined`, `CloudServerOutlined`, `FolderViewOutlined`) đã nằm trong dòng `icon`, không đếm riêng.

  22 wrapper còn lại có analog từ PROOF: `button` (Button), `badge`/`tag` (Chip), `checkbox` (Checkbox), `input`/`input-number`/`mentions`/`textarea` (Input), `radio` (Radio), `select`/`auto-complete`/`tree-select` (Select + Listbox), `segmented`/`tabs` (Tabs), `switch` (Toggle), `drawer`/`modal`/`popconfirm` (Dialog), `form`/`list` (Input/Checkbox/Listbox). Phase 52 rà soát lại ánh xạ này trước khi khóa MAP-01. 34 + 22 = 56.

- **Liên kết Phase 56** (CLEAN-01..03): 31 dòng import type, 13 dòng export type + 22 dòng deep type, 8 icon deep-import và 4 file `@ant-design/plots` chỉ được gỡ khi xóa dependency; không thuộc runtime Phase 53/54 (xem §3.1 và §4.2).
