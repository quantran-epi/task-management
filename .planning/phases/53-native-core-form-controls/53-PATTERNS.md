# Phase 53: Native Core & Form Controls — Pattern Map

**Mapped:** 2026-11-22
**Scope:** NAT-01 — 26 wrapper `core/form` từ `.planning/phases/51-control-inventory-surface-audit/51-CONTROL-INVENTORY.md` §4/§4.2, tiêu thụ contract đã duyệt `.planning/phases/52-openidea-mapping-design-contract/52-UI-SPEC.md` §1/§1.1/§2/§5/§7.2/§8/§9/§10 và bàn giao `52-DESIGN-REVIEW.md` §3.
**Files analyzed:** `src/components/ui/` (56 wrapper `.tsx`, 4 file hạ tầng, 10 test), `src/styles/tokens.ts`, `src/hooks/useThemeMode.ts`, `eslint.config.mjs`, `tests/helpers/antdInventory.ts`, `tests/setup.ts`, `tests/fixtures/adoption/*`, prototype `scratchpad/oi-prototype/` (`PROOF.md`, `src/main.jsx`, 28 `vendor/*.module.css`, `LICENSE-OPENIDEA`, `NOTICE-OPENIDEA`), source OpenIDEA `scratchpad/openidea/src/ui/`.
**Analogs found:** đầy đủ — analog trực tiếp nhất là prototype đã duyệt (`PROOF.md` + `src/main.jsx`) và 28 CSS module gốc; Phase 53 là phase **đổi implementation, không đổi API**. Không sửa caller, không thêm UI runtime library, không cài dependency.

> Nguồn truth cho metric/DOM/class/API là `52-UI-SPEC.md` (status: approved, checker 6/6). Bản đồ này chỉ chỉ file, analog, chữ ký phải giữ và test sẽ vỡ nếu sửa sai. Không thay thế contract.

---

## 1. Danh sách 26 file phải sửa (theo thứ tự an toàn)

Nguồn: lệnh `node` lọc `<!-- CLASSIFY: … -->` có cột `core/form` trong `51-CONTROL-INVENTORY.md` §4 → đúng 26 tên; khớp `52-DESIGN-REVIEW.md` §3 (`core/form` 26 wrapper → Phase 53 / NAT-01).

| # | File cần đổi | Spec | MAP | Analog OpenIDEA / CSS module gốc | Invariant đặc thù (không đổi) |
|---:|---|---|---|---|---|
| 1 | `src/components/ui/alert.tsx` | N-01 | 02 | `Feedback.module.css`, S-BTN | `type='info'` default; status D-12; caller style win; `AlertErrorBoundary` giữ export |
| 2 | `src/components/ui/avatar.tsx` | N-03 | 02 | `Chip.module.css .surface`, S-CHIP | `alt`/text name; iconSize/fontSize token; `AvatarGroup` mirrored |
| 3 | `src/components/ui/badge.tsx` | S-CHIP | 01 | `Chip.module.css .surface/.chip/.label` | status map D-12; explicit `color` caller win; caller style win |
| 4 | `src/components/ui/button.tsx` | S-BTN | 01 | `Button.module.css .button/.primary/.secondary/.ghost/.small/.iconButton` | variant map type/danger; `withoutUndefined`; Enter/Space; `IconButton` bắt `aria-label` |
| 5 | `src/components/ui/checkbox.tsx` | S-CHK | 01 | `Checkbox.module.css .row/.boxWrap/.native/.box/.on` + SVG check | `withoutUndefined`; Space toggle; `controlSize`; `CheckboxGroup` mirrored |
| 6 | `src/components/ui/divider.tsx` | N-10 | 02 | `Splitter.module.css .handle` 1px | `role=separator`; font/gap token; caller style win |
| 7 | `src/components/ui/grid.tsx` | N-12 | 02 | spacing tokens `--space-*` | gutter default `paddingInline`; caller gutter/style win; `Grid.useBreakpoint` |
| 8 | `src/components/ui/icon.tsx` | N-13 | 02 | `icons.module.css` + vendored SVG; một factory `wrapIcon` | **141 export giữ nguyên tên**; `WrappedIconProps`; tone D-12; caller style win; 8 deep-import `@ant-design/icons/<Name>` tại `src/workbench/toolwindows/RemoteGitExplorer.tsx:4-11` (phase 56 mới xử lý, phase 53 không sửa caller) |
| 9 | `src/components/ui/input-number.tsx` | S-FLD | 01 | `Input.module.css .input/.framed`; stepper S-BTN | `min/max/precision` truyền nguyên; `withoutUndefined`; ArrowUp/Down; generic `T extends ValueType` |
| 10 | `src/components/ui/input.tsx` | S-FLD | 01 | `Input.module.css .input/.framed/.invalid/.searchField/.searchInput/.multiline` | full width default; `forwardRef<InputRef>`; `withoutUndefined`; `InputSearch`/`InputPassword` mirrored; export `controlStyle`, `controlWidthStyle` |
| 11 | `src/components/ui/mentions.tsx` | S-FLD + S-SEL | 01 | `Input.module.css` + `Select.module.css .popup` | `forwardRef<MentionsRef>`; `@` trigger + Arrow/Enter; `MentionsOption` mirrored; `width` default `full` |
| 12 | `src/components/ui/progress.tsx` | N-20 | 02 | `density.ts` + `--accent`/`--success` | `role=progressbar`; status D-12; caller `strokeColor`/style win |
| 13 | `src/components/ui/radio.tsx` | S-CHK | 01 | `Checkbox.module.css .row/.boxWrap/.native/.box/.radio/.on` | Arrow native; `RadioGroup`/`RadioButton` mirrored; `controlSize` |
| 14 | `src/components/ui/result.tsx` | N-21 | 02 | `List.module.css .emptyWrap` + N-13 | title/status text; font/icon token; caller style win |
| 15 | `src/components/ui/segmented.tsx` | S-TAB | 01 | `Tabs.module.css .tab/.selected/.tabButton` | generic `<ValueType>` preserved; Arrow selection; caller style win |
| 16 | `src/components/ui/select.tsx` | S-SEL | 01 | `Select.module.css .trigger/.framed/.value/.chevron/.popup/.sizer/.row` + `List.module.css .row` | `allowClear:true` default; `withoutUndefined`; full width; combobox Arrow/Enter; generic `<ValueType, OptionType>`; status từ `aria-invalid` |
| 17 | `src/components/ui/skeleton.tsx` | N-22 | 02 | `density.ts` row metrics + `--bg-hover` shimmer | 5 static mirrored (`SkeletonButton/Input/Image/Avatar/Node`); loading semantics; caller style win |
| 18 | `src/components/ui/slider.tsx` | N-23 | 02 | `Splitter.module.css .handle` + S-CHK `.radio` knob | `SliderProps = SliderSingleProps \| SliderRangeProps`; Arrow trên handle; aria-label caller |
| 19 | `src/components/ui/space.tsx` | N-24 | 02 | spacing tokens | gap default `paddingInline`; `SpaceCompact` mirrored; caller size/style win |
| 20 | `src/components/ui/spin.tsx` | N-25 | 02 | `Spinner.module.css .spinner/.spokes`; ring `--ui-spin-accent` | `setDefaultSpinIndicator` mirrored; accent D-12 (không đổi status map); caller style win |
| 21 | `src/components/ui/statistic.tsx` | N-27 | 02 | typography tokens 11/12/13 | `StatisticCountdown`/`StatisticTimer` mirrored; Countdown `onFinish`; caller style win |
| 22 | `src/components/ui/switch.tsx` | S-SW | 01 | `Checkbox.module.css .switch/.switchOn/.knobLabel/.knob` | `role=switch`; Space toggle; height/radius token; caller style win |
| 23 | `src/components/ui/tag.tsx` | S-CHIP | 01 | `Chip.module.css .surface/.chip`, 22px/radius 6/font 12 | status map D-12; `StatusTagProps.status` bắt buộc; `CheckableTag` focused; `Tag` giữ `styles.root` caller-win |
| 24 | `src/components/ui/textarea.tsx` | S-FLD | 01 | `Input.module.css .input/.framed/.multiline/.invalid` | `DEFAULT_TEXTAREA_MIN_ROWS = 2`; maxRows từ controlHeight/fontSize; `TextArea` alias; `forwardRef<TextAreaRef>`; `withoutUndefined` |
| 25 | `src/components/ui/time-picker.tsx` | N-30 | 02 | S-FLD + `Popup.module.css .surface` grid giờ | `TimePicker`/`TimeRangePicker`; `width='full'`; `pickerStyle`; Arrow/Enter; **popup cần portal BODY offset 4 theo rule chung §2 N-30** |
| 26 | `src/components/ui/typography.tsx` | N-33 | 02 | `src/styles/tokens.css:293-295` 11/12/13 (+16 legacy Display) | `fontRole` 4 giá trị; namespace `Typography.Link`; `ComponentProps<typeof AntTypography.*>` giữ nguyên; caller style win |

**File hạ tầng đi kèm (bắt buộc theo migration order `52-UI-SPEC.md` §8):**

| File | Việc phải làm | Lưu ý |
|---|---|---|
| `src/styles/tokens.ts` | (1) thêm/đổi token mới: `controlHeight` 30→28, accent `#2f62d8`/`#6a9bff`→`#3871e1`, `--danger` control `#c54e58`/`#f57e84`, palette bổ sung §5, alias radius popup/selection/tab/tooltip/dialog, duration/ease. `statusColorMap.success/warning/danger/info` và `fileStatusMap` giữ nguyên. | `applyCssVariables(mode, target)` đã ghi cả `target` lẫn `document.documentElement` — giữ cơ chế này để portal trong `BODY` kế thừa. Chrome token `--h-toolbar-widget` 30px là token riêng, **không đổi**. |
| `src/components/ui/tokens.contract.ts` | giữ nguyên chữ ký `getSharedControlTokens(): WrapperPolicy`, `getStatusTokens(kind, mode?)`, `withoutUndefined<T>()`; chỉ đổi giá trị trả về theo token mới. | Mọi wrapper core phải gọi helper này — tiêu chí #4 của NAT-01. Không hardcode hex/metric trong component/CSS module. |
| `src/components/ui/ui-tokens.css` | cập nhật định nghĩa α của mọi `--ui-*` còn dùng và thêm consumer `var(<name>, …)` cho biến mới. | `uiTokens.test.ts` quét literal `'--ui-…'` trong **mọi** file `.tsx` ở `src/components/ui/` rồi yêu cầu `var(name,` tồn tại trong file CSS này. Xóa var khỏi wrapper mà quên CSS hoặc ngược lại → test đỏ. |
| `src/components/ui/openidea/` (mới) | vendored 28 `*.module.css` + `tokens.css` + `global.css` từ `scratchpad/openidea/src/ui/` (hoản bản `vendor/` đã proof) + `LICENSE-OPENIDEA`/`NOTICE-OPENIDEA` từ prototype `vendor/`. Copy nguyên vẹn. | Không sửa selector/metric nguồn; không import từ `/private/tmp/...`. Phase 53 cần tối thiểu: `Button`, `Input`, `Checkbox`, `Chip`, `Tabs`, `Feedback`, `Spinner`, `Splitter`, `List`, `Popup`, `Select`, `icons.module.css`, `density.ts`, `tokens.css`, `global.css`; phần còn lại chia cho Phase 54 nhưng nên copy cả 28 một lần theo contract §0/Registry. |
| `src/components/ui/index.ts` | **không sửa trừ khi export thay đổi** — contract cấm đổi tên export, nên barrel giữ nguyên. | Kiểm tra bằng `scanWrappers()` = 257 (`tests/helpers/antdInventory.ts`), không đếm theo số file. |
| `src/components/ui/antdTheme.ts` | **không sửa ở Phase 53** — vẫn bridges AntD theme cho overlay wrappers/phases sau; gỡ ở Phase 56. | `eslint.config.mjs` override `files: ['src/components/ui/**/*.{ts,tsx}']` tắt `no-restricted-imports`, nên overlay vẫn import AntD hợp lệ tới Phase 54/56. |

**Không sửa caller.** Lớp consumer đi qua `src/components/ui/index.ts` barrel; số file import trực tiếp từng wrapper (đếm bằng parser import, loại thư mục `ui/`): `button` 157, `typography` 122, `space` 114, `tag` 105, `alert` 70, `input` 63, `select` 46, `spin` 19, `segmented` 18, `badge` 16, `checkbox` 15, `progress` 14, `switch` 13, `divider` 9, `avatar` 8, `radio` 5, `statistic` 5, `textarea` 5, `grid` 2, `skeleton` 2, `slider` 2, `mentions` 1, `result` 1; `input-number` và `time-picker` không có consumer trực tiếp ngoài `ui/` (vẫn phải giữ export vì guard 257). Icon: 165 file import từ `../icon`/barrel. Đây là lý do "caller không sửa" ở `52-DESIGN-REVIEW.md` rule 1 là ràng buộc cứng.

---

## 2. Analog native-pattern gần nhất

### 2.1 Prototype đã duyệt — nguồn implementation trực tiếp

`PROOF.md` (đường dẫn tuyệt đối, ngoài repo): `/private/tmp/claude-503/-Users-tranducquan-Working-Personal-task-management/32c7be2b-546e-433a-aa53-76345c15954c/scratchpad/oi-prototype/PROOF.md`. Cùng thư mục: `src/main.jsx` (263 dòng) chứa các hàm native mẫu — đọc **1 lần, phạm vi đủ rộng**, không đọc lặng đoạn:

| Hàm trong `src/main.jsx` | Dòng | Dùng cho Phase 53 |
|---|---|---|
| `Button({ variant, size, children, ...rest })` | 24-25 | `button.tsx` (`S-BTN`), stepper của `input-number`, trigger của `time-picker` |
| `Check({ checked, onChange, label, type, name, disabled })` | 27-37 | `checkbox.tsx`, `radio.tsx` (`.radio`), `switch.tsx` (xem `Toggle`) |
| `Toggle({ checked, onChange, label, disabled })` | 39-48 | `switch.tsx` (`S-SW`) |
| `InputField({ invalid, disabled, ...rest })` | 51-52 | `input.tsx`, `textarea.tsx`, `input-number.tsx`, `mentions.tsx`, `time-picker.tsx` (`S-FLD`) |
| `Popup({ open, anchorRef, onClose, className, children })` | 54-83 | popup `time-picker`; **thay floating-ui bằng tự tính flip/shift** theo contract §Design System |
| `SelectField` + `CheckIcon` | 20, 85-136 | `select.tsx` (`S-SEL`), list 24px + sizer n×24 + SVG check, lead `data-lead` + `aria-activedescendant` |
| `Tabs` | 138-156 | `segmented.tsx` (`S-TAB`) |
| `DemoDialog` | 157-199 | không phải Phase 53 nhưng là mẫu `createPortal`/focus trap cho Phase 54 |
| `chip.*` class | 253-254 | `badge.tsx`, `tag.tsx`, `avatar.tsx` (`S-CHIP`) |

`PROOF.md` là bằng chứng computed-style light+dark (height 28, radius 4, accent `rgb(56,113,225)`, padding `0 16`/`0 8`/`0px 6px 0px 9px`, invalid `rgb(197,78,88)`, popup parent `BODY` gap 4 radius 10, row 24 translateY(i×24), checkbox SVG 12px, focus ring 2px). Mọi lệch ở Phase 57 là defect, không được "harmonise" sang token shell.

### 2.2 Ánh xạ spec → CSS module gốc (phase 53)

| Spec | CSS module vendored | Wrapper core tiêu thụ |
|---|---|---|
| S-BTN | `Button.module.css` | `button` (kể cả `IconButton` 20/24/28) |
| S-FLD | `Input.module.css` | `input`, `textarea`, `input-number`, `mentions`, `time-picker` |
| S-CHK / S-SW | `Checkbox.module.css` + SVG `expui/actions/checked.svg` | `checkbox`, `radio`, `switch` |
| S-SEL / S-LST | `Select.module.css`, `List.module.css`, `Popup.module.css` | `select`, `mentions` popup, `time-picker` grid popup |
| S-CHIP | `Chip.module.css` | `badge`, `tag`, `avatar` |
| S-TAB | `Tabs.module.css` | `segmented` |
| N-01 | `Feedback.module.css` | `alert` |
| N-10 / N-23 | `Splitter.module.css` | `divider`, `slider` |
| N-12 / N-24 | spacing tokens (`src/styles/tokens.css` OpenIDEA) | `grid`, `space` |
| N-13 | `icons.module.css` + `expui/**`, `openidea/**` SVG | `icon` (141 export) |
| N-20 / N-22 / N-27 / N-33 | `density.ts` + `src/styles/tokens.css` | `progress`, `skeleton`, `statistic`, `typography` |
| N-21 | `List.module.css .emptyWrap` | `result` |
| N-25 | `Spinner.module.css` | `spin` |

### 2.3 Quy tắc DOM/class bắt buộc (từ `52-UI-SPEC.md` §1.1/§2)

- Dùng `clsx(styles.root, styles[variant])` (hoặc tương đương tự build) bám tên class/thứ tự phần tử của CSS module gốc; **không** dùng class `.ant-*` làm selector measurement.
- Chỉ thêm `data-oi-control`, `data-state`, `data-lead`, `data-size` làm measurement hook cho Phase 57 — đây là ngoại lệ được phép, **không phải prop API**, không đổi accessible name. Ví dụ baseline: `button[data-state=primary]`, `[data-oi-control=input][data-state=invalid]`, `[data-oi-control=spinner]`.
- Caller `style`/`className` áp sau token default; `withoutUndefined()` vẫn bỏ key `undefined` (`exactOptionalPropertyTypes`). Không sinh text mới: chỉ có `Xác nhận`/`Hủy` (Popconfirm, Phase 54) và copy hiện tại của empty/error/notification.
- Popup mọi core có popup (`time-picker`, `mentions`, `select`): `createPortal` vào `BODY`, `position:fixed`, offset 4px, flip/shift tự tính, outside-click + Escape đóng, focus về anchor. **Không cài `@floating-ui/react-dom`** hay bất kỳ UI runtime library nào; AntD chỉ gỡ ở Phase 56.
- Height control 28 / `.small` 24 (không giữ 30 của AntD cho control); radius 4, focus ring 2px accent `#3871e1`, popup radius 10, list row 24, chip 22, tab radius 6, dialog radius 10 (Phase 54).
- Không copy hành vi ngầm của AntD; mọi behavior validation/keyboard/a11y cũ nằm ở `51-CONTROL-INVENTORY.md` §2 và `52-UI-SPEC.md` §9 phải có implementation native tương đương.

---

## 3. Chữ ký hiện tại phải giữ nguyên (trích trực tiếp từ source)

Bảng dưới là "hợp đồng" — planner/executor không cần mở lại `51-CONTROL-INVENTORY.md` §2 khi lock API. Mọi tên export, prop type, generic, event payload, static subcomponent, default policy, accessible name giữ byte-for-byte (`52-UI-SPEC.md` §7.2). Chỉ đổi phần render bên trong.

| File | Chữ ký / export hiện tại (load-bearing) |
|---|---|
| `alert.tsx` | `export type AlertProps = AntAlertProps`; `export const AlertErrorBoundary = AntAlert.ErrorBoundary`; `function Alert({ type = 'info', style, ...rest }: AlertProps)`; map `STATUS_BY_ALERT_TYPE` success/warning/error→danger/info; event `onClose` kế thừa |
| `avatar.tsx` | `export type AvatarProps = AntAvatarProps`; `export const AvatarGroup = AntAvatar.Group`; `function Avatar({ style, ...rest }: AvatarProps)` |
| `badge.tsx` | `interface BadgeProps extends Omit<AntBadgeProps,'status'> { status?: StatusKind }`; `function Badge({ status='info', color, style, ...rest }: BadgeProps)` — `color ?? statusColor` |
| `button.tsx` | `type ButtonVariant = 'primary'\|'default'\|'danger'`; `interface ButtonProps extends Omit<AntButtonProps,'variant'\|'color'> { variant?: ButtonVariant }`; `interface IconButtonProps extends ButtonProps { 'aria-label': string; size?: ControlSize; children?: never }`; `VARIANT_PROPS` map sang type/danger; `function Button({variant='default', style, type, danger, ...rest})`; `function IconButton({'aria-label': label, size='middle', icon, ...rest})` |
| `checkbox.tsx` | `type CheckboxProps = AntCheckboxProps`; `type CheckboxGroupProps = AntCheckboxGroupProps`; `const CheckboxGroup = AntCheckbox.Group`; `function Checkbox({ controlSize='middle', style, ...rest }: CheckboxProps & { controlSize?: ControlSize })` |
| `divider.tsx` | `type DividerProps = AntDividerProps`; `function dividerStyle(): CSSProperties`; `function Divider({style,...rest}: DividerProps)`; separator semantics |
| `grid.tsx` | `type ColProps = AntColProps`; `type RowProps = AntRowProps`; `export function gridStyle(): CSSProperties`; `function Row({gutter, style,...rest})` — `gutter ?? paddingInline`; `function Col(...)`; `export const Grid = { useBreakpoint: AntGrid.useBreakpoint }` |
| `icon.tsx` | `interface WrappedIconProps { className?; style?; spin?; rotate?; size?: number\|string; tone?: StatusKind; onClick?; 'aria-label'?; role?; tabIndex? }`; `type WrappedIcon = (props: WrappedIconProps) => ReactNode`; `export function wrapIcon(Component: AntIconComponent): WrappedIcon`; **141 dòng `export const <Name> = wrapIcon(<Name>Component)`** (dòng 185-325 của file hiện tại), không đổi tên, không đổi thứ tự export trong barrel |
| `input-number.tsx` | `interface InputNumberProps<T extends ValueType = ValueType> extends AntInputNumberProps<T> { width?: InputWidth; size?: ControlSize }`; `function InputNumber<T extends ValueType = ValueType>({width='full', status, style, ...rest})`; min/max/precision pass-through; `status ?? (rest['aria-invalid'] ? 'error' : undefined)` |
| `input.tsx` | `type InputWidth = 'full'\|'auto'`; `interface InputProps extends AntInputProps { width?: InputWidth }`; `export function controlStyle(): CSSProperties`; `export function controlWidthStyle(width: InputWidth): CSSProperties`; `export const Input = forwardRef<import('antd').InputRef, InputProps>(...)`; `export const InputSearch`, `export const InputPassword` |
| `mentions.tsx` | `export type { MentionsProps, MentionsRef } from 'antd'`; `export type { MentionsOptionProps } from 'antd/es/mentions'`; `interface MentionsWrapperProps extends AntMentionsProps { width?: 'full'\|'auto' }`; `export const Mentions = forwardRef<MentionsRef, MentionsWrapperProps>`; `export const MentionsOption = AntMentions.Option` |
| `progress.tsx` | `type ProgressProps = AntProgressProps`; `STATUS_BY_PROGRESS` normal→accent/active→info/success→success/exception→danger; `function Progress({status='normal', strokeColor, ...rest})` — `strokeColor ?? tone` |
| `radio.tsx` | `RadioProps`/`RadioGroupProps`/`RadioButtonProps` từ AntD; `function Radio({style,...rest})`; `function RadioGroup({controlSize='middle', style,...rest}: RadioGroupProps & {controlSize?: ControlSize})` — `size = rest.size ?? controlSize`; `function RadioButton(...)` |
| `result.tsx` | `type ResultProps = AntResultProps`; `function Result({style,...rest}: ResultProps)`; CSS `--ui-result-icon-size = controlHeight*2` |
| `segmented.tsx` | `type SegmentedProps<ValueType = SegmentedValue> = AntSegmentedProps<ValueType>`; `function Segmented<ValueType = SegmentedValue>({style,...rest})` — generic cho `<Segmented<'a'\|'b'>>` |
| `select.tsx` | `interface SelectProps<ValueType=unknown, OptionType extends BaseOptionType=DefaultOptionType> extends AntSelectProps<ValueType,OptionType> { width?: InputWidth; size?: ControlSize }`; `function Select<ValueType, OptionType>({width='full', allowClear=true, status, style, ...rest})`; `onChange/onSearch` payload AntD |
| `skeleton.tsx` | `type SkeletonProps = AntSkeletonProps`; 5 static `SkeletonButton/Input/Image/Avatar/Node`; `function Skeleton({style,...rest})` |
| `slider.tsx` | `type SliderProps = SliderSingleProps \| SliderRangeProps` (AntD 6 không có alias `SliderProps`); `function Slider({style,...rest}: SliderProps)`; `onChange/onAfterChange` |
| `space.tsx` | `type SpaceProps = AntSpaceProps`; `const SpaceCompact = AntSpace.Compact`; `function Space({size, style,...rest})` — `size ?? paddingInline` |
| `spin.tsx` | `type SpinProps = AntSpinProps`; `function Spin({style,...rest})`; `export const setDefaultSpinIndicator = AntSpin.setDefaultIndicator`; `--ui-spin-accent` từ `getStatusTokens('accent', mode)` — **giữ status map D-12, không đổi thành accent control trực tiếp** |
| `statistic.tsx` | `type StatisticProps = AntStatisticProps`; `const StatisticCountdown`, `const StatisticTimer`; `function Statistic({style,...rest})`; Countdown `onFinish` |
| `switch.tsx` | `type SwitchProps = AntSwitchProps`; `function Switch({style,...rest})`; `role=switch`, Space toggle |
| `tag.tsx` | `interface TagProps extends AntTagProps { status?: StatusKind }`; `interface StatusTagProps extends Omit<TagProps,'status'> { status: StatusKind }`; `function Tag({status, style,...rest})` giữ `styles={{root:{fontSize:'var(--font-size-small)', padding:'var(--status-badge-pad)'}}}`; `function StatusTag({status,...rest})`; `function CheckableTag({style,...rest}: AntCheckableTagProps)` |
| `textarea.tsx` | `interface TextareaProps extends AntTextAreaProps { width?: InputWidth }`; `export const DEFAULT_TEXTAREA_MIN_ROWS = 2`; `export const Textarea = forwardRef<TextAreaRef, TextareaProps>(...)`; `autoSize ?? {minRows:2,maxRows:Math.max(2,Math.round((controlHeight/fontSize)*2))}`; `export const TextArea = Textarea` |
| `time-picker.tsx` | `export type { TimePickerProps, TimeRangePickerProps } from 'antd'`; `interface TimeFieldProps extends AntTimePickerProps { width?: 'full'\|'auto' }`; `function TimePicker({width='full', style,...rest})`; `function TimeRangePicker({width='full', style,...rest}: TimeRangePickerProps & {width?: 'full'\|'auto'})`; `pickerStyle` full-width + `--ui-control-*` |
| `typography.tsx` | `type TextProps/TitleProps/ParagraphProps = ComponentProps<typeof AntTypography.*>`; `type FontRole = 'meta'\|'label'\|'body'\|'heading'`; `fontRoleSize(role)` 11/12/13 + heading fallback iconSize; `function Text/Paragraph({fontRole='body'})`, `function Title({fontRole='heading'})`; `export const Typography = { Text, Title, Paragraph, Link: AntTypography.Link }` |

**Ngoại lệ measurement hook:** thêm `data-oi-control`/`data-state`/`data-lead`/`data-size` là được phép; thêm prop bắt buộc, đổi payload event, đổi static subcomponent, đổi accessible name, đổi default policy → **fail Phase 53**.

---

## 4. Test patterns — cái gì sẽ vỡ, chạy cái gì

### 4.1 Test nền tảng hiện hữu (`src/components/ui/__tests__/`)

| File | Cơ chế | Tác động Phase 53 |
|---|---|---|
| `antdInventory.test.ts` | fixture tạm + `extractNamedImportsForTest`, `scanWrappers`, `findMissingWrappers`, `isPassThroughWrapper`; fixture `icon.tsx` ↔ `SearchOutlined` | Giữ nguyên helper `tests/helpers/antdInventory.ts`. `scanWrappers()` đếm `export (const\|function) [A-Z]` → phải vẫn **257**. Không đổi helper để "cho qua". |
| `coverage.test.ts` | `scanConsumedAntd('src')` vs `scanWrappers('src/components/ui')`; yêu cầu `findMissingWrappers() === []`, mọi consumed icon có trong `icon.tsx`, `iconSource` chứa `wrapIcon`, **không có pass-through wrapper** | Khi wrapper core ngừng import AntD, `consumed.components/icons` giảm nhưng wrapped set vẫn ≥ consumed → xanh. `isPassThroughWrapper` đỏ nếu thay static bằng `export { … } from 'antd'` mà không có `getSharedControlTokens`/`getStatusTokens`/`tokens.contract` trong file. Giữ import helper token ở mọi wrapper có static. |
| `guardConfig.test.ts` | đọc `package.json`, `eslint.config.mjs`, chạy `npx eslint tests/fixtures/guard/bad-import.tsx`; assert đúng 1 `no-restricted-imports: 'off'`, scripts build/lint không đổi | Không sửa `eslint.config.mjs` hay scripts để hợp thức hóa import AntD ngoài `ui/`. Fixture `tests/fixtures/guard/{bad,good}-import.tsx` giữ nguyên. |
| `staticApiGuard.test.ts` | regex quét `Modal.confirm`/`message.*`/`notification.*` ngoài `src/components/ui/`, nhận diện receiver bound qua `useMessage`/`useNotification`/`useTaskMateModal` | Không đụng tới; core group không có static API ngoài `setDefaultSpinIndicator` (nằm trong `ui/`, bị loại khỏi scan). |
| `tokens.test.ts` | `lightTokens/darkTokens/getAntdTheme/statusColorMap/applyCssVariables`; **hard-code** `controlHeight 30`, `buttonPaddingInline 12`, accent `#2f62d8`/`#6a9bff` ở cả 2 mode, status map D-12 đầy đủ | **Sẽ đỏ ngay khi migrate token §8.** Phải cập nhật assertion theo giá trị mới (28 / 16 / `#3871e1` cả 2 mode, `--danger` mới, palette §5) trong cùng change; giữ nguyên assertion status map D-12 (`success/warning/danger/info`) và metric còn lại không thuộc diện migrate. |
| `uiTokens.test.ts` | quét literal `'--ui-…'` trong mọi `.tsx` dưới `src/components/ui/`, yêu cầu `var(name,` trong `ui-tokens.css`; CSS phải chứa `.taskmate-workbench-theme :where([style*="--ui-"])` | Mỗi lần thêm/bỏ custom property trong 26 wrapper phải đổi `ui-tokens.css` tương ứng. Không dùng template literal cho tên var nếu muốn test quét thấy. |
| `inlineStyleSweep.test.ts` | quét token literal trong `tests/fixtures/adoption/wave-0*.txt` | Không sửa fixture. Không đưa raw hex/metric vào inline style wrapper. |

### 4.2 Test hành vi hiện hữu

| File | Pattern | Ghi chú |
|---|---|---|
| `button.test.tsx` | `@testing-library/react` `render/screen`, import `SearchOutlined` từ `@ant-design/icons`, `Button/IconButton` từ `../button`, `getSharedControlTokens()`; assert `aria-label="Tìm kiếm"`, `variant='danger'`, caller `style={{padding:0}}` win, disabled/loading | **Chỗ dễ vỡ nhất:** test hiện import icon AntD. Phase 53 chuyển sang `SearchOutlined` từ `../icon` (giữ tên export). Kiểu `IconButtonProps` giữ nguyên để test không đổi. |
| `controls.test.tsx` | 12+ behavior test cho input-family/overlay/status map, bọc `AntdThemeAdapter`, `beforeEach` đọc `localStorage` theme; assert `.ant-tag`, `.ant-spin`, `--ui-spin-accent`, copy `Xác nhận`/`Hủy`, form `ant-form-vertical/horizontal/inline` | Assert className `.ant-*` của overlay/Form là Phase 54 — **không sửa ở Phase 53**. Phần input-family (`Input`, `Textarea`, `Select`, `InputNumber`, `Spin`, `StatusTag`, `Badge`) sẽ cần cập nhật selector sang `data-oi-control`/DOM native khi đổi implementation; giữ nguyên các assert về token/color/copy. |
| `wave02Wrappers.test.tsx` | `createRef` + `render`; `Input`, `Textarea`, `DateRangePicker`, `EmptyImageSimple`; assert ref forwarded | `Input`/`Textarea` ref phải vẫn là `InputRef`/`TextAreaRef` tương thích — giữ `forwardRef`. |
| (không có test riêng cho) `avatar`, `divider`, `grid`, `icon`, `mentions`, `progress`, `radio`, `result`, `segmented`, `skeleton`, `slider`, `space`, `statistic`, `time-picker`, `typography` | coverage gián tiếp qua `coverage.test.ts` + fixture adoption | Không tạo file test mới trừ khi cần assert behavior native chưa được cover. Ưu tiên mở rộng `controls.test.tsx` / `button.test.tsx` thay vì thêm file. |

### 4.3 Gate commands (chạy scoped, KHÔNG chạy full Vitest — memory rule)

```bash
cd /Users/tranducquan/Working/Personal/task-management

npx tsc --noEmit
npm run lint
npx vitest run \
  src/components/ui/__tests__/button.test.tsx \
  src/components/ui/__tests__/controls.test.tsx \
  src/components/ui/__tests__/wave02Wrappers.test.tsx \
  src/components/ui/__tests__/tokens.test.ts \
  src/components/ui/__tests__/uiTokens.test.ts \
  src/components/ui/__tests__/antdInventory.test.ts \
  src/components/ui/__tests__/coverage.test.ts \
  src/components/ui/__tests__/guardConfig.test.ts \
  src/components/ui/__tests__/staticApiGuard.test.ts \
  src/components/ui/__tests__/inlineStyleSweep.test.ts \
  --bail=1
```

`tests/setup.ts` đã có jsdom + `matchMedia`, `ResizeObserver`, `scrollIntoView`, Web Crypto shim — không cần thêm setup cho control thuần. Không chạy `npm test` (full suite >1h).

---

## 5. Shared helper / token contracts

| Contract | Vị trí | Cách dùng ở Phase 53 |
|---|---|---|
| `getSharedControlTokens(): WrapperPolicy` | `src/components/ui/tokens.contract.ts:27-36` | Nguồn duy nhất cho `controlHeight`/`borderRadius`/`fontSize`/`paddingInline`/`iconSize`. Mọi wrapper core giữ lời gọi này (NAT-01 #4); chỉ đổi số liệu ở `src/styles/tokens.ts`. |
| `getStatusTokens(kind, mode?)` | `src/components/ui/tokens.contract.ts:39-41` | Duy nhất cho tone D-12: `alert`, `badge`, `progress`, `spin`, `icon` (tone), `tag`. Không đổi status map (D-12). |
| `withoutUndefined<T>()` | `src/components/ui/tokens.contract.ts:48-52` | Giữ ở `button`, `checkbox`, `input`, `input-number`, `select`, `textarea`. `exactOptionalPropertyTypes: true` trong `tsconfig.json` — bỏ helper → lỗi type. |
| `WrapperPolicy`, `ControlSize`, `StatusKind`, `DefinedProperties` | `src/components/ui/tokens.contract.ts` | Không đổi tên/api type; caller import qua barrel. |
| `applyCssVariables(mode, target)` | `src/styles/tokens.ts:333-340` | Ghi biến vào `target` **và** `document.documentElement` → portal BODY kế thừa. Giữ nguyên cơ chế; `data-theme` enum `light\|dark` không đổi. |
| `sharedTokens`, `lightTokens`, `darkTokens`, `statusColorMap`, `fileStatusMap` | `src/styles/tokens.ts` | Migration §8 chỉ đổi metric/palette control; `fileStatusMap` (VCS domain) và `statusColorMap.*` giữ nguyên. Chrome metrics 40/26/36 giữ nguyên (palette shell ≠ palette control). |
| `--ui-*` CSS vars | `src/components/ui/ui-tokens.css` | Giữ tên để test/caller cũ không vỡ; value dẫn xuất từ token mới. Mọi var inject phải có `var(name,` trong file này. |
| `useThemeMode()` | `src/hooks/useThemeMode.ts:42` | Trả `{ mode }`; dùng khi cần tone theo mode (`alert`, `badge`, `progress`, `spin`, `icon`, `tag`). Không thay bằng context mới. |
| `controlStyle()`, `controlWidthStyle()` | `src/components/ui/input.tsx:13,24` | Helper dùng chung bởi `input`, `input-number`, `select`, `mentions`, `textarea` — giữ export và chữ ký; nếu chuyển sang CSS module thì vẫn giữ hàm trả `CSSProperties` cho caller/test. |
| `gridStyle()` | `src/components/ui/grid.tsx:15` | Export công khai; giữ. |
| `wrapIcon()` | `src/components/ui/icon.tsx:170` | Factory duy nhất cho 141 icon; thay AntD component bằng vendored SVG nhưng giữ shape `(props: WrappedIconProps) => ReactNode` và tên export. |
| `index.ts` barrel | `src/components/ui/index.ts` | 257 export guard đi qua đây; không thêm/bớt export. |
| `tests/helpers/antdInventory.ts` | `scanWrappers`, `scanConsumedAntd`, `findMissingWrappers`, `isPassThroughWrapper` | Không sửa helper. Dùng để tự check `257` và `missing []` sau khi đổi wrapper. |
| `eslint.config.mjs` | override `src/components/ui/**/*` tắt restricted imports | Giữ nguyên tới Phase 56; phase 53 vẫn cho phép import AntD trong overlay wrappers chưa đổi, nhưng **không được còn import AntD trong 26 file core** (tiêu chí NAT-01 #1). |

---

## 6. No analog / rủi ro đã biết

| Item | Tình trạng | Cách xử lý |
|---|---|---|
| `createPortal` trong repo | **Không có** (`grep -rln createPortal src` trống). Prototype `main.jsx` dùng `react-dom`. | Dùng `createPortal` từ `react-dom` (đã là dependency), portal vào `document.body`. Không thêm package. |
| CSS module trong repo | **Không có** (`find src -name '*.module.css'` trống); Vite hỗ trợ sẵn, chưa cấu hình thêm. | Vendor CSS module theo contract; không đổi `vite.config.ts` trừ khi build thực sự lỗi. |
| PROOF / OpenIDEA source nằm ngoài repo | Đường dẫn `/private/tmp/claude-503/.../scratchpad/...`, có thể mất giữa phiên. | Copy ngay 28 module + `tokens.css`/`global.css` + `LICENSE-OPENIDEA`/`NOTICE-OPENIDEA` vào `src/components/ui/openidea/`; sau đó không import từ scratchpad. |
| `time-picker`/`mentions`/`select` vẫn có popup dù nằm core/form | Contract xếp chúng core nhưng rule popup chung áp cả light+dark. | Phase 53 phải dựng portal helper tự tính flip/shift ngay (dùng lại cho Phase 54), nhưng **không** tạo dependency hay thay đổi props `overlayStyle`/`width`. |
| `icon.tsx` 8 deep-import `@ant-design/icons/<Name>` tại `RemoteGitExplorer.tsx:4-11` | Ngoài 26 wrapper; caller không sửa ở Phase 53. | Giữ 141 export wrapper; deep-import là việc Phase 55/56. `coverage.test.ts` chỉ quét import `{ … } from '@ant-design/icons'`, không quét deep-import — đừng tưởng đã xong. |
| `tokens.test.ts` hard-code số cũ | Sẽ đỏ ngay khi migrate token. | Cập nhật assertion trong cùng change migration (đây là test, không phải band-aid giấu lỗi). Giữ assertion D-12. |
| `controls.test.tsx` assert className `.ant-*` | Một số thuộc overlay/Form (Phase 54). | Chỉ sửa assert cho control core đã đổi; không "sửa cho xanh" phần overlay bằng cách hạ tiêu chí. |
| Test scope | Full Vitest >1h. | Luôn chạy lệnh scoped §4.3; không `npm test`. |

---

## Metadata

**Analog search scope:** `.planning/ROADMAP.md:70-83` (NAT-01 success criteria), `.planning/REQUIREMENTS.md:22` (NAT-01), `52-UI-SPEC.md` §1/§1.1/§2/§5/§7/§8/§9/§10, `52-DESIGN-REVIEW.md` §3, `51-CONTROL-INVENTORY.md` §2/§4/§4.2, 26 wrapper `.tsx`, 10 test `src/components/ui/__tests__/`, `src/styles/tokens.ts`, `src/components/ui/{tokens.contract.ts,ui-tokens.css,index.ts,antdTheme.ts}`, `src/hooks/useThemeMode.ts`, `tests/helpers/antdInventory.ts`, `tests/setup.ts`, `eslint.config.mjs`, prototype `PROOF.md`/`src/main.jsx`/`vendor/*`, OpenIDEA `src/ui/*.module.css`.
**Files scanned:** ~120; đọc sâu 4 wrapper mẫu (`button`, `input`, `select`, `tokens.contract`) + full 26 wrapper + 10 test + 3 planning artifact + PROOF. Dừng khi có analog cho cả 26 wrapper (early stopping).
**Pattern extraction date:** 2026-11-22
**Lưu ý cho planner:** Output bản đồ này **không** thay Plan. Không sửa source, không cài dependency, không chạy full Vitest ở bước pattern mapping. Mọi rule "caller không sửa / API byte-for-byte / không UI runtime library / không thêm dependency" là hard constraint của milestone v1.6.
