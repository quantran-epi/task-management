---
phase: 54-native-overlay-complex-controls
mapped: 2026-11-22
status: ready-for-planning
---

# Phase 54: Native Overlay & Complex Controls — Pattern Map

**Scope:** NAT-02 — đúng 28 wrapper nhóm `overlay/complex` từ `.planning/phases/51-control-inventory-surface-audit/51-CONTROL-INVENTORY.md` §4/§4.2, tiêu thụ contract đã duyệt `.planning/phases/52-openidea-mapping-design-contract/52-UI-SPEC.md` §1/§1.1/§2/§5/§7.2/§8/§9/§10 và bàn giao `52-DESIGN-REVIEW.md` §3. Kế thừa kết quả Phase 53: `.planning/phases/53-native-core-form-controls/53-PATTERNS.md`, `53-REVIEW.md`, `53-REVIEW-FIX.md`.
**Files analyzed:** 28 wrapper overlay + 26 wrapper core đã native (để biết helper dùng lại), `src/components/ui/native/{classNames.ts,popup.tsx}`, `src/components/ui/openidea/*.module.css` (đã vendored), `src/components/ui/{tokens.contract.ts,ui-tokens.css,index.ts,antdTheme.ts}`, `src/styles/tokens.ts`, `src/components/ui/__tests__/`, `tests/helpers/antdInventory.ts`, `tests/setup.ts`, prototype `scratchpad/oi-prototype/src/main.jsx` + `PROOF.md`, caller tiêu biểu `src/components/tasks/TaskTable.tsx`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`.
**Analogs found:** đủ cho 28 wrapper — 10 có analog PROOF/S-* trực tiếp, 18 thiết kế mới N-* dùng primitive đã vendored. Không cần dependency mới; AntD gỡ ở Phase 56, không phải Phase 54.

> Bản đồ này chỉ chỉ file/analog/chữ ký/test/rủi ro. Nguồn truth metric/DOM/class/API vẫn là `52-UI-SPEC.md` (approved 6/6). Không sửa source khi mapping. Không chạy full Vitest.

---

## 1. 28 file phải đổi (nhóm theo thứ tự an toàn)

Lọc từ 56 dòng `<!-- CLASSIFY: … -->` có cột `overlay/complex` → đúng 28 tên, khớp `52-DESIGN-REVIEW.md` §3. Số liệu consumer là số file `src` import wrapper (trực tiếp hoặc qua barrel), đo bằng parser import — để planner biết mức độ "caller không sửa".

### Tier 0 — hạ tầng/primitive (làm trước, chia sẻ cho các tier sau)

| File | Việc phải làm | Lưu ý |
|---|---|---|
| `src/components/ui/native/popup.tsx` | Giữ API `PopupProps { open, anchorRef, onClose(reason?: 'escape'\|'outside'), className?, children, label?, control? }`. Dùng lại cho dropdown/menu/popover/tooltip/date-picker/tree-select/popconfirm. Chỉ mở rộng nếu cần focus trap riêng; **không** nhập `@floating-ui/react-dom`. | `onCloseRef.current = onClose` là bắt buộc (WR-05); Escape chỉ popup trong cùng (`role="dialog"][data-positioned]`), focus anchor sau Escape/outside. Không đưa inline `onClose` vào deps effect. |
| `src/components/ui/native/classNames.ts` | Dùng nguyên; không thêm `clsx`. | Đã có ở Phase 53. |
| `src/components/ui/openidea/` | **Không sửa** 31 CSS module vendored, `tokens.css`, `global.css`, `LICENSE-OPENIDEA`, `NOTICE-OPENIDEA`. Import thêm module cần thiết từ đây. | Module Phase 54 dùng: `Dialog`, `Menu`, `Popup`, `Tooltip`, `Tree`, `List`, `Tabs`, `Splitter`, `Feedback`, `DialogFieldset` (đã có) + `Button`, `Chip`, `Input`, `Select`, `Checkbox`, `Spinner`. |
| `src/styles/tokens.ts`, `src/components/ui/ui-tokens.css`, `src/components/ui/tokens.contract.ts` | Giữ contract Phase 53. Chỉ thêm alias CSS nếu overlay cần var mới; mọi literal `'--ui-*'` trong `.tsx` phải có `var(name,` trong `ui-tokens.css`. | `applyCssVariables(mode, target)` ghi cả `target` lẫn `document.documentElement` — portals trong `BODY` phải kế thừa accent/popup/dialog/tooltip token. |
| `src/components/ui/index.ts`, `src/components/ui/antdTheme.ts` | **Không sửa** ở Phase 54. | 257 export guard, 56 wrapper; bridge AntD chỉ gỡ ở Phase 56. |

### Tier 1 — overlay primitives tự build

| # | File cần đổi | Spec | MAP | Analog OpenIDEA / CSS module gốc | Invariant đặc thù | Consumer |
|---:|---|---|---|---|---|---:|
| 1 | `src/components/ui/menu.tsx` | S-MNU | 01 | `Menu.module.css .popup/.menu/.item/.active/.disabled/.danger/.icon/.menuHeading`; `Popup.module.css` | `compact=true`; 3 static; Arrow/Enter/Escape; context menu `TaskTable.tsx:1014` | 0 trực tiếp, qua barrel |
| 2 | `src/components/ui/list.tsx` | S-LST | 01 | `List.module.css .list/.sizer/.row/.active/.emptyWrap` | generic `<T>`; row 24 + sizer n×24; statics | 18 |
| 3 | `src/components/ui/tree.tsx` | N-32 / S-TR | 02 | `Tree.module.css .tree/.row/.indent/.toggle/.label/.sizer` | `compact=true`; `TreeNode`/`DirectoryTree`; Arrow/Enter; indent 16/depth+12 | 5 |
| 4 | `src/components/ui/modal.tsx` | S-DLG | 01 | `Dialog.module.css .backdrop/.dialog/.window/.titleBar/.lights/.footer`; prototype `DemoDialog` | `getOverlayWidth`/`resolveMask`/`useTaskMateModal` giữ nguyên; mask boolean; focus trap; `contextHolder` | 68 |
| 5 | `src/components/ui/drawer.tsx` | S-DLG panel | 01 | `Dialog.module.css` panel variant | import helper từ `modal.tsx`; `mask:false` boolean; `closePolicy:'silent'` | 9 |
| 6 | `src/components/ui/tooltip.tsx` | N-31 / S-TT | 02 | `Tooltip.module.css .tooltip/.text/.shortcut`; `Popup.module.css` | `mouseEnterDelay=0.15`; `widthScale`; `overlayStyle` caller win; `TooltipPlacement` type | 76 |
| 7 | `src/components/ui/popover.tsx` | N-19 | 02 | `Popup.module.css .popup/.surface/.centered`; `Dialog.module.css .popup` | `widthScale={md:18,lg:28}`; hover/click/focus trigger; `overlayStyle` caller win | 10 |
| 8 | `src/components/ui/dropdown.tsx` | S-SEL/S-MNU | 01 | `Select.module.css .trigger/.popup`; `Menu.module.css` | `DropdownButton`; `menu.items` AntD shape; `styles` caller win | 19 |
| 9 | `src/components/ui/popconfirm.tsx` | S-DLG/S-SEL | 01 | `Dialog.module.css .popup/.buttons`; `Button.module.css`; S-BTN actions | copy `Xác nhận`/`Hủy`; `tone:'danger'` → `okButtonProps.danger` + `--ui-status-color`; Escape dismiss | 33 |
| 10 | `src/components/ui/date-picker.tsx` | N-08 | 02 | `Input.module.css .input/.framed`; `Popup.module.css .surface`; S-SEL day grid | `Dayjs` typed `onChange`; `DateRangePicker`; SHOW_* policy; Arrow/Enter/Escape | 11 |
| 11 | `src/components/ui/tabs.tsx` | S-TAB | 01 | `Tabs.module.css .tab/.selected/.tabButton/.closable/.strip` | `TabPane`; `styles.root` caller win; Arrow trong tablist | 11 |
| 12 | `src/components/ui/splitter.tsx` | N-26 / S-SPL | 02 | `Splitter.module.css .group/.panel/.handle` | `compact=true`; `SplitterPanel`; resize keys; handle 1px + hit ±3px | 2 |
| 13 | `src/components/ui/table.tsx` | N-29 | 02 | `List.module.css .row` + `Menu.module.css .item` header; `tableStyle()` | generic `<RecordType>`; `density` chỉ set `size` khi có; `TableSummary`; selection/sort/pagination/context menu | 27 |
| 14 | `src/components/ui/tree-select.tsx` | S-SEL + S-TR | 01 | `Select.module.css .treeIndent/.popup`; `Tree.module.css` | 4 static SHOW_* + `TreeSelectNode`; `width='full'`; combobox navigation | 1 |
| 15 | `src/components/ui/image.tsx` | N-14 | 02 | `Popup.module.css .centered/.surface`; `Dialog.module.css` toolbar | `ImagePreviewGroup`; preview keyboard; `styles.root` caller win | 1 |
| 16 | `src/components/ui/upload.tsx` | N-34 | 02 | `Button.module.css` + `List.module.css .row` + `Feedback.module.css .progress` | `width='full'`; `UploadDragger`; `UPLOAD_LIST_IGNORE`; `beforeUpload`/`onChange` | 1 |

### Tier 2 — structural/holder wrappers

| # | File cần đổi | Spec | MAP | Analog OpenIDEA / CSS module gốc | Invariant đặc thù | Consumer |
|---:|---|---|---|---|---|---:|
| 17 | `src/components/ui/form.tsx` | S-FLD/S-CHK layout | 01 | `Input.module.css .framed`; `Checkbox.module.css .row`; `Feedback.module.css` error | `requiredMark:true` default; `labelPolicy`; `FormItem/FormList/FormErrorList/useForm/useWatch`; caller `layout` win | 24 |
| 18 | `src/components/ui/app.tsx` | N-02 | 02 | holder vô hình, không geometry | `--ui-app-font-size`; `useApp()` | 0 trực tiếp |
| 19 | `src/components/ui/config-provider.tsx` | N-07 | 02 | provider vô hình; inject CSS vars | `withoutUndefined(theme)`; gọi `getSharedControlTokens()` | 0 trực tiếp |
| 20 | `src/components/ui/message.tsx` | N-16 | 02 | `Feedback.module.css .toast/.toastTitle/.toastBody/.toastClose` | holder đơn nhất + `contextHolder`; realtime không reload | 0 trực tiếp |
| 21 | `src/components/ui/notification.tsx` | N-17 | 02 | `Feedback.module.css` + `Tooltip.module.css .tooltip` shape | `duration:4.5`, `placement:'topRight'`, `pauseOnHover:true`, `iconSize`; hook only | 0 trực tiếp |
| 22 | `src/components/ui/collapse.tsx` | N-06 | 02 | `Menu.module.css` + `Tabs.module.css .tabButton` | `CollapsePanel`; header Enter/Space; expanded/collapsed | 9 |
| 23 | `src/components/ui/pagination.tsx` | N-18 | 02 | `Button.module.css .iconButton.is-small` + `Chip.module.css .chip` | `onChange`/`onShowSizeChange`; page aria-label; `styles.root` | 1 |
| 24 | `src/components/ui/breadcrumb.tsx` | N-04 | 02 | `Menu.module.css .item` inline variant | `BreadcrumbItem`/`BreadcrumbSeparator`; link semantics; `aria-current=page` | 4 |
| 25 | `src/components/ui/card.tsx` | N-05 | 02 | `Dialog.module.css .window` radius 10 + island padding | `cardStyle()`; `CardGrid`/`CardMeta`; caller style win | 54 |
| 26 | `src/components/ui/descriptions.tsx` | N-09 | 02 | `DialogFieldset.module.css` label/value rows | `DescriptionsItem`; label/value pair | 10 |
| 27 | `src/components/ui/layout.tsx` | N-15 | 02 | `global.css` chrome metrics 40/26/36 | 4 static landmark; Sider collapse; **chrome palette không đổi** | 0 trực tiếp |
| 28 | `src/components/ui/auto-complete.tsx` | S-SEL | 01 | `Select.module.css .trigger/.popup`; `List.module.css .row` | `AutoCompleteOption`; `onChange/onSelect`; combobox Arrow/Enter; `styles.root` | 2 |

Tổng: 28 file wrapper. Không wrapper nào trong danh sách này được thêm prop bắt buộc hay đổi export. Không sửa caller — kể cả `TaskTable.tsx` dù có 68 import Modal/76 import Tooltip toàn app.

---

## 2. Analog native gần nhất & DOM/class bám nguồn

### 2.1 Popup/chrome dùng lại từ Phase 53

| Helper/module | Dùng cho | Hành vi đã có, không viết lại |
|---|---|---|
| `src/components/ui/native/popup.tsx` | dropdown, menu, tooltip, popover, popconfirm, date-picker, tree-select, auto-complete | portal `document.body`, `position:fixed`, offset 4, flip/shift, width=anchor, Escape/outside đóng, focus anchor, nested-popup guard, `data-oi-control={control}` + `data-positioned=""`. |
| `src/components/ui/native/classNames.ts` | mọi wrapper | join class, không dependency. |
| `openidea/Dialog.module.css` + prototype `DemoDialog` (`scratchpad/oi-prototype/src/main.jsx:157-199`) | modal, drawer, popconfirm, image preview | `.backdrop` transparent (không dim), `.dialog.window` radius 10, `.titleBar.macTitleBar > .lights > .light.lightClose`, `.body`, `.footer > .buttons`. Focus trap: focus control đầu, Tab/Shift+Tab first↔last, Escape đóng, khôi phục trigger — **Popup helper không làm phần này**, cần helper dialog riêng hoặc implement trong `modal.tsx` rẽ dùng cho drawer/popconfirm/image. |
| `openidea/Menu.module.css`, `List.module.css`, `Tree.module.css`, `Tabs.module.css`, `Splitter.module.css`, `Tooltip.module.css`, `Feedback.module.css` | menu/list/tree/tabs/splitter/tooltip/message/notification/form/error/card/descriptions | class gốc giữ nguyên; chỉ thêm `data-oi-control`/`data-state` hook đo. |
| `openidea/Button.module.css`, `Chip.module.css`, `Input.module.css`, `Select.module.css`, `Checkbox.module.css`, `Spinner.module.css` | pagination, breadcrumb, date-picker, tree-select, upload, collapse, form | đã native ở Phase 53; import module, không import AntD component. |

### 2.2 Quy tắc DOM/state hook

- Dùng `classNames(styles.root, styles[variant])` (tương đương `clsx` Phase 53) bám class/thứ tự phần tử CSS module gốc. Không dùng `.ant-*` làm selector measurement.
- Measurement hook cho Phase 57: `data-oi-control` + `data-state`; optional `data-size`, `data-lead`, `data-placed`, `data-positioned`. Đây là ngoại lệ được phép, **không phải prop API**, không đổi accessible name.
- Baseline Phase 57 cần có: `dialog`, `dialog-backdrop`, `menu-item`, `tooltip`, `tree-row`, `splitter-handle`, `list-row`, `select-popup`, `tab`, `input`, `button`.
- Metric khóa: control 28 / small 24; list/tree/menu row 24; selection radius 5; popup radius 10 + offset 4; tab radius 6; dialog radius 10; tooltip radius 6/padding 6/10; chip 22; focus ring 2px `#3871e1`; accent đổi màu ở dark bị cấm.

---

## 3. Chữ ký hiện tại phải giữ nguyên (byte-for-byte)

Trích từ source hiện tại. Chỉ đổi phần render; tên export, generic, payload, default policy, static, hook, accessible name giữ nguyên theo `52-UI-SPEC.md` §7.2.

| File | Chữ ký/export load-bearing |
|---|---|
| `app.tsx` | `export type AppProps<P = Record<string, unknown>> = AntAppProps<P>`; `export function App<P = Record<string, unknown>>({ children, style, ...rest }: AppProps<P>)`; `export function useApp()`; CSS `--ui-app-font-size`. |
| `auto-complete.tsx` | `export type AutoCompleteProps<ValueType = any> = AntAutoCompleteProps<ValueType>`; `export const AutoCompleteOption = AntAutoComplete.Option`; `export function AutoComplete<ValueType = any>({ styles, ...rest }: AutoCompleteProps<ValueType>)`; `onChange/onSelect`. |
| `breadcrumb.tsx` | `export type BreadcrumbProps = AntBreadcrumbProps`; `BreadcrumbItem`, `BreadcrumbSeparator`; `export function Breadcrumb({ style, ...rest }: BreadcrumbProps)`. |
| `card.tsx` | `export type CardProps = AntCardProps`; `CardGrid`, `CardMeta`, `export function cardStyle(): CSSProperties`; `export function Card({ style, ...rest }: CardProps)`. |
| `collapse.tsx` | `export type CollapseProps = AntCollapseProps`; `export const CollapsePanel = AntCollapse.Panel`; `export function Collapse({ style, ...rest }: CollapseProps)`; `onChange` payload AntD. |
| `config-provider.tsx` | `export type ConfigProviderProps = { theme?: ThemeConfig; children: ReactNode }`; `export function ThemeConfigProvider({ theme, children }: ConfigProviderProps)`; `withoutUndefined({theme})` + gọi `getSharedControlTokens()`. |
| `date-picker.tsx` | `export type { DatePickerProps } from 'antd'`; `export type { RangePickerProps }`; `export interface DateFieldProps extends Omit<AntDatePickerProps,'onChange'\|'value'> { width?: 'full'\|'auto'; onChange?: (date: Dayjs \| null, dateString: string \| string[]) => void; value?: Dayjs \| null }`; `export function DatePicker({width='full',style,onChange,value,...rest})`; `export function DateRangePicker({width='full',style,value,onChange,...rest}: Omit<RangePickerProps,'onChange'\|'value'> & { width?: 'full'\|'auto'; value?: [Dayjs\|null,Dayjs\|null]\|null; onChange?: (dates:[Dayjs\|null,Dayjs\|null]\|null, dateStrings:[string,string])=>void })`. |
| `descriptions.tsx` | `export type DescriptionsProps = AntDescriptionsProps`; `export const DescriptionsItem = AntDescriptions.Item`; `export function Descriptions({ style, ...rest }: DescriptionsProps)`. |
| `drawer.tsx` | `export interface DrawerProps extends AntDrawerProps { widthScale?: OverlayWidth; closePolicy?: 'closable'\|'silent' }`; default `widthScale='lg'`, `placement='right'`; `size={width ?? getOverlayWidth(widthScale)}`; `resolveMask(mask, closableByDefault, maskClosable)`; import helper từ `modal.tsx`. |
| `dropdown.tsx` | `export type DropdownProps = AntDropdownProps`; `export const DropdownButton = AntDropdown.Button`; `export function Dropdown({ styles, ...rest }: DropdownProps)`; `onClick/onOpenChange`; `menu.items` shape. |
| `form.tsx` | `export type FormLabelPolicy = 'top'\|'left'\|'inline'`; `export interface FormProps extends AntFormProps { labelPolicy?: FormLabelPolicy; children?: ReactNode }`; `export function formStyle(): CSSProperties`; `export function Form({labelPolicy='top',style,...rest})` — `layout = rest.layout ?? policyLayout`, `requiredMark = rest.requiredMark ?? true`; `FormItem/FormList/FormErrorList/useForm/useWatch`, `export type { FormInstance }`. |
| `image.tsx` | `export type ImageProps = AntImageProps`; `export const ImagePreviewGroup = AntImage.PreviewGroup`; `export function Image({ styles, ...rest }: ImageProps)`; `onPreviewChange/onError`; `alt`. |
| `layout.tsx` | `export type LayoutProps = AntLayoutProps`; `export type { SiderProps }`; `LayoutHeader/LayoutFooter/LayoutContent/LayoutSider`; `function layoutStyle(): CSSProperties`; `export function Layout({style,...rest})`. |
| `list.tsx` | `export type ListProps<T> = AntListProps<T>`; `ListItem`, `ListItemMeta`; `export function List<T>({style,...rest}: ListProps<T>)`. |
| `menu.tsx` | `export type { MenuProps, MenuItemProps, MenuRef, MenuTheme } from 'antd'`; `export interface MenuWrapperProps extends AntMenuProps { compact?: boolean }`; `export function Menu({compact=true,style,...rest})`; `MenuItem/MenuSubMenu/MenuItemGroup`; `onClick` event shape. |
| `message.tsx` | `export function useMessage()` → `AntApp.useApp().message`; `export function ThemeAppHolder({ children }: { children: ReactNode })`; holder render `contextHolder`; không static `message.*`. |
| `modal.tsx` | `export type OverlayWidth = 'sm'\|'md'\|'lg'`; `export function getOverlayWidth(scale: OverlayWidth): number` (factor 10/18/28); `export interface ModalProps extends AntModalProps { widthScale?: OverlayWidth; footerPolicy?: 'default'\|'none'; closePolicy?: 'closable'\|'silent' }`; `export function resolveMask(mask, closableByDefault, maskClosable?): AntModalProps['mask']`; `export function Modal({widthScale='md',footerPolicy='default',closePolicy='closable',width,footer,closable,mask,maskClosable,title,...rest})`; `export function useTaskMateModal()` → `{ modal, contextHolder }`. |
| `notification.tsx` | `export function useNotification()`; `export function useNotificationConfig()` → `{duration:4.5,placement:'topRight',pauseOnHover:true,iconSize}`; không static. |
| `pagination.tsx` | `export type PaginationProps = AntPaginationProps`; `export function Pagination({styles,...rest})`; `onChange/onShowSizeChange`; page aria-label. |
| `popconfirm.tsx` | `export interface PopconfirmProps extends AntPopconfirmProps { tone?: StatusKind }`; `export function Popconfirm({tone='info',okText='Xác nhận',cancelText='Hủy',okType,okButtonProps,title,...rest})`; `onConfirm/onCancel`; `--ui-status-color` khi `tone='danger'`. |
| `popover.tsx` | `export type { PopoverProps } from 'antd'`; `export interface PopoverWrapperProps extends AntPopoverProps { widthScale?: 'md'\|'lg' }`; `WIDTH_SCALE={md:18,lg:28}`; `export function Popover({widthScale='md',overlayStyle,...rest})`; `onOpenChange`. |
| `splitter.tsx` | `export type { SplitterProps } from 'antd'`; `export interface SplitterWrapperProps extends AntSplitterProps { compact?: boolean; children?: ReactNode }`; `export function Splitter({compact=true,style,...rest})`; `export const SplitterPanel = AntSplitter.Panel`; `onResize/onResizeStart`. |
| `table.tsx` | `export type TableSize = 'small'\|'middle'\|'large'`; `export interface TableProps<RecordType = unknown> extends AntTableProps<RecordType> { density?: TableSize }`; `export function tableStyle(): CSSProperties`; `export function Table<RecordType = unknown>({density,style,...rest})`; `export const TableSummary = AntTable.Summary`; `onChange` payload (pagination/filters/sorter), `rowSelection`. |
| `tabs.tsx` | `export type TabsProps = AntTabsProps`; `export const TabPane = AntTabs.TabPane`; `export function Tabs({styles,...rest}: TabsProps)`; `onChange/onTabClick`. |
| `tooltip.tsx` | `export type { TooltipProps } from 'antd'`; `export type { TooltipPlacement } from 'antd/es/tooltip'`; `export interface TooltipWrapperProps extends AntTooltipProps { widthScale?: 'md'\|'lg' }`; `export function Tooltip({widthScale='md',overlayStyle,...rest})` — `mouseEnterDelay = rest.mouseEnterDelay ?? 0.15`. |
| `tree-select.tsx` | `export type { TreeSelectProps, TreeDataNode } from 'antd'`; `export type { SelectValue } from 'antd/es/tree-select'`; `export interface TreeSelectWrapperProps extends AntTreeSelectProps { width?: 'full'\|'auto' }`; `TreeSelectNode`, `TreeSelectSHOW_ALL/CHILD/PARENT`; `onChange/onTreeExpand`. |
| `tree.tsx` | `export type { TreeProps, TreeDataNode } from 'antd'`; `export interface TreeWrapperProps extends AntTreeProps { compact?: boolean }`; `export function Tree({compact=true,style,...rest})`; `TreeNode`, `DirectoryTree`; `onSelect/onCheck/onExpand`. |
| `upload.tsx` | `export type { UploadProps, UploadFile } from 'antd'`; `export interface UploadWrapperProps extends AntUploadProps { width?: 'full'\|'auto' }`; `export function Upload({width='full',style,...rest})`; `UploadDragger`, `UPLOAD_LIST_IGNORE`; `beforeUpload`/`onChange`. |

`scanWrappers()` phải vẫn trả **257**; 56 file `.tsx` không đổi số lượng. Static subcomponent phải là giá trị do wrapper định nghĩa (`export const X = …`), không `export { X } from 'antd'` — `coverage.test.ts`/`isPassThroughWrapper` sẽ đỏ.

---

## 4. State variants cần render & đo được

NAT-02 success criterion #1 yêu cầu 9 trạng thái quan sát qua computed style trong focused test. Phân bổ theo wrapper; `data-state` là hook đo, không prop API.

| State | Wrapper bắt buộc | Class/attr nguồn | Ghi chú |
|---|---|---|---|
| default | tất cả 28 | `styles.root`, `styles.surface`, `styles.window` | caller `style/className` áp sau token default. |
| hover | menu item, table row, list/tree row, card, pagination chip, breadcrumb link, upload row | `.item:hover`, `.row:hover`, `.chip:hover` | CSS module gốc; không JS state. |
| focus-visible | trigger popup, modal/drawer controls, menu item, tab, tree row, splitter handle, pagination page | `:focus-visible` ring 2px `#3871e1`, offset 1; field dùng double ring | `global.css` focus rule; không dùng `[data-pointer-focus]` (PROOF loại trừ). |
| disabled | menu item, table rowSelection control, tree node checkbox, pagination boundary, splitter panel, upload/dragger, date disabled date, collapse disabled | `.disabled`, `aria-disabled`, native `disabled` | vẫn giữ event suppressed đúng AntD; popup không mở từ trigger disabled. |
| invalid/error | form (`FormErrorList`, `aria-invalid`), date-picker invalid, table edit cell nếu có | double ring `--danger-control` `#c54e58`/`#f57e84` | không đổi D-12 status map khi dùng tone status. |
| loading | table (`loading`), image (preview load), upload (`uploading`), message/notification (`type:'loading'`), card/result nếu caller set | `aria-busy`, `Spinner.module.css` 0.9s | spinner ring `--ui-spin-accent` giữ API Phase 53; reduced-motion 2.4s. |
| selected | table row, menu `.active`, tree `.selected`, tabs `.selected`, pagination active page, list `.active`, upload success row | selection radius 5, inset 6, bg `--bg-tree-selected` light `#d0dffe` / dark `#2a4371` | inactive selection dùng `--bg-tree-selected-inactive`. |
| expanded | collapse panel, tree node, menu submenu, splitter panel resize, date picker open, dropdown/menu open | `aria-expanded`, chevron rotate, `.popup[data-positioned]` | popup open ⇒ Escape/outside đóng, focus anchor. |
| empty | table `emptyText`, list `.emptyWrap`, descriptions empty value, card empty, upload no file | `.emptyWrap` + text 12 muted | copy caller giữ byte-for-byte; không sinh text mới. |

Quy tắc chung: mọi popup (dropdown, tooltip, popover, date-picker, tree-select, popconfirm, image preview, menu context) dùng portal BODY, offset 4, flip/shift, outside/Escape, focus về anchor; mọi dialog-like (modal, drawer, popconfirm, image preview) dùng backdrop transparent + focus trap; mọi list item dùng row 24 + sizer; reduced-motion tắt transition/animation trừ spinner. Không tạo metric mới ngoài hệ 13/12/11, 28/24, radius 4/5/6/10, row 24, offset 4.

---

## 5. Keyboard / focus / event contracts

| Nhóm | Hành động bắt buộc | Consequences nếu sai |
|---|---|---|
| Popup (menu, dropdown, popover, tooltip, date-picker, tree-select, popconfirm, auto-complete) | ArrowDown mở + focus popup/lead; ArrowUp/Down di chuyển `data-lead` + `aria-activedescendant`; Enter/Space chọn; Escape/outside đóng; focus về anchor; flip/shift gần edge; nested popup chỉ popup trên cùng nhận Escape. | `Popup.tsx` đã có Escape/outside/focus; effect phụ thuộc `onCloseRef` (WR-05). Inline callback trong deps → re-register listener → mất focus field. |
| Dialog (modal, drawer, popconfirm, image preview) | Focus control đầu khi mở; Tab/Shift+Tab trap first↔last; Escape đóng khi `closable`; `closePolicy:'silent'` vẫn silent; focus về trigger; `mask={false}` giữ boolean; backdrop `background:transparent`. | `resolveMask()` Phase 53 fix WR-04: object form làm mask bật lại. Không trả `mask` object khi caller truyền `false`. |
| Table | `onChange(pagination, filters, sorter, extra)` payload AntD; row selection `onChange(keys)`; context menu click tại `TaskTable.tsx:1014`; `rowClassName='…keyboard-active-row'` của caller phải còn tác dụng; `locale.emptyText` ReactNode. | Đổi payload → filter/sort/pagination caller hỏng; bỏ `onRow` context menu → mất menu. |
| Form | Enter submit; `onFinish(values)`, `onFinishFailed({values,errorFields,outOfDate})`; `requiredMark:true`; `aria-invalid`; `labelPolicy` map layout nhưng caller `layout` win. | Test hiện assert class `ant-form-*`; đổi sang class native nhưng vẫn giữ ngữ nghĩa horizontal/vertical/inline. |
| Menu / Tree / Tabs / List | Arrow/Enter; tree indent; checkable node; closable tab; `MenuProps.items` hỗ trợ `type:'divider'`, `danger`, `icon`, `label`, `key`, `onClick(event)`; `danger` tone D-12. | `TaskTable.getTaskMenuItems` dùng đủ các dạng trên + `modal.confirm` trong `onClick`. |
| Splitter | Arrow resize trên handle; `aria-orientation`; `onResize(sizes)`, `onResizeStart` payload; hit ±3px. | Không đổi số/đơn vị của `sizes`. |
| DatePicker / RangePicker | `onChange(date, dateString)` / `(dates, [s1,s2])`; Arrow/Enter trong grid; disabled date không chọn; range start/end; `value` Dayjs null/tuple. | Type union từng bị leak ở D-03 — giữ signature đã sửa, không trả AntD union. |
| Message / Notification / Modal hook | holder render `contextHolder`; `useMessage()/useNotification()/useTaskMateModal()` receiver bound; realtime cập nhật ngay không reload (memory rule); copy `duration:4.5`, `topRight`, `pauseOnHover:true`. | Static `message.*`/`notification.*`/`Modal.confirm` ngoài `ui/` bị guard chặn; re-render holder mất notification. |

### Event payload pitfalls đã học ở Phase 53 (53-REVIEW RR-01..RR-03)

- `RadioGroup.onChange`: giữ nguyên event instance, normalize `target` bằng `Object.defineProperty` chứ không tạo object tổng hợp — method `stopPropagation/preventDefault/nativeEvent` phải sống. Áp tương tự cho mọi event wrapper overlay (menu `onClick`, table `onChange`, dropdown `onOpenChange`).
- Popup lead reset (RR-01): deps `useMemo` phải là primitive snapshot (`selectedValueKey`), không phải `Set`/array tạo mới mỗi render; nếu không, ArrowDown/PointerMove reset lead.
- `defaultChecked`/uncontrolled (RR-03): ternary đúng thứ tự; đừng dùng `??` sau biểu thức đã trả `false`. Áp cho uncontrolled `open` của dropdown/popover/modal/menu.
- Không thêm `eslint-disable-next-line react-hooks/exhaustive-deps`: rule không bật trong `eslint.config.mjs` (INFO-04), directive chết gây warning.

---

## 6. Test patterns — cái gì vỡ, chạy cái gì

### 6.1 Test现有 sẽ cần cập nhật selector (không hạ tiêu chí)

| File | Assert overlay hiện tại | Hướng sửa khi native |
|---|---|---|
| `src/components/ui/__tests__/controls.test.tsx:86-224` | `.ant-modal`, `.ant-modal-footer`, `.ant-modal-close`, `.ant-modal-mask`, `.ant-drawer-*`, `.ant-btn-dangerous`, `.ant-app`; `getOverlayWidth` factors; copy `Xác nhận`/`Hủy`; `--ui-status-color`; Form `.ant-form-vertical/horizontal/inline` | Đổi selector sang `data-oi-control='dialog'`, `data-state`, class CSS module vendored; **giữ nguyên** width scale, mask boolean, footer/close policy, status color, copy, layout policy. Test focus trap/Escape/restore nên bổ sung ở đây. |
| `src/components/ui/__tests__/wave02Wrappers.test.tsx` | `DateRangePicker` chỉ `typeof === 'function'` | Giữ nguyên; có thể bổ sung assert tuple `value/onChange` nếu đổi implementation sâu. |
| `src/components/ui/__tests__/uiTokens.test.ts` | quét literal `'--ui-*'` trong mọi `.tsx` ui/, yêu cầu `var(name,` trong `ui-tokens.css` | Mỗi var mới của overlay phải có consumer CSS; đừng dùng template literal cho tên var. |
| `src/components/ui/__tests__/antdInventory.test.ts`, `coverage.test.ts` | `scanWrappers()` guard, `findMissingWrappers()===[]`, no pass-through | Giữ `getSharedControlTokens`/`getStatusTokens`/`tokens.contract` reference trong mọi wrapper có static; 257 export không đổi. |
| `src/components/ui/__tests__/staticApiGuard.test.ts` | cấm static `Modal.confirm`/`message.*`/`notification.*` ngoài `ui/` | Holder/hook phải tiếp tục render `contextHolder`. |
| `src/components/ui/__tests__/tokens.test.ts`, `inlineStyleSweep.test.ts` | hard-code token Phase 53, quét literal fixture | Không đổi giá trị token Phase 53; dùng token helper; không đưa raw hex/metric vào inline style. |
| `src/views/__tests__/TasksViewActions.test.tsx` | caller TaskTable/Tooltip/Modal | Không sửa caller để "cho xanh" — wrapper phải tương thích. |

### 6.2 Focused test nên thêm cho NAT-02

- Mở rộng `controls.test.tsx` (ưu tiên hơn file mới): popup flip/shift + outside/Escape + focus anchor; dialog Tab/Shift+Tab trap + Escape + restore + mask/footer/closePolicy; table `onChange` payload + rowSelection + context menu; menu `items` divider/danger/icon + Arrow/Enter; form `onFinish/onFinishFailed` + aria-invalid; date-picker tuple callback.
- Measurement: dùng `data-oi-control`/`data-state` selector để Phase 57 đo computed style 25 dòng baseline §10; assert class style cho `dialog-backdrop` transparent, `menu-item` 24px, `tooltip` radius 6, `tree-row` 24, `splitter-handle` 1px/±3px.
- `tests/setup.ts` đã có jsdom + `matchMedia`, `ResizeObserver`, `scrollIntoView`, Web Crypto shim. Popup placement dùng `window.innerWidth/innerHeight` + `getBoundingClientRect` — stub `getBoundingClientRect` trong test flip/shift, không thêm dependency.
- Gate commands (KHÔNG chạy full Vitest — memory rule):

```bash
cd /Users/tranducquan/Working/Personal/task-management
npx tsc --noEmit
npm run lint
npx vitest run \
  src/components/ui/__tests__/controls.test.tsx \
  src/components/ui/__tests__/button.test.tsx \
  src/components/ui/__tests__/formControls.test.tsx \
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

- Chrome/Tauri dev (roadmap NAT-02 #5): chuyển state popup/dialog/table/menu mở trong dev build, đảm bảo không console error; chụp log cho Phase 57. Không validate PWA/GitHub Pages.

---

## 7. Rủi ro đã biết & cách xử lý

| Rủi ro | Mức | Xử lý |
|---|---|---|
| `Popup` helper chưa có focus trap | cao | Dialog/modal/drawer/popconfirm/image preview cần trap riêng theo prototype `DemoDialog`; don't pretend `role=dialog` của Popup là trap. Giữ `onCloseRef.current` stable. |
| Event payload shape bị "đơn giản hóa" | cao | Giữ AntD signature trong §3; đặc biệt table `onChange`, form `onFinishFailed`, date tuple, menu `onClick`. Giữ method native trên event object. |
| Token CSS/portal | cao | `applyCssVariables` ghi documentElement; mọi var mới khai báo consumer trong `ui-tokens.css`; CSS module vendored không sửa selector/metric; accent `#3871e1` cả 2 mode; shell chrome 40/26/36 không đổi. |
| `useMemo` deps primitive | trung bình | Dùng snapshot primitive cho lead/selection; test ArrowDown ×2 như RR-01. |
| Uncontrolled/open state | trung bình | Test `defaultOpen`/`open` undefined riêng; đừng hard-code `false` làm trị quyết định (RR-03). |
| Static/holder tách rời | cao | `ThemeAppHolder`/`App`/`ConfigProvider` render cùng provider; `useTaskMateModal().contextHolder` phải mount; notification realtime cập nhật không reload. |
| Copy tiếng Việt / status map | cao | `Xác nhận`/`Hủy`, mọi copy caller giữ byte-for-byte; `statusColorMap`/`fileStatusMap` D-12 không đổi, chỉ control-level invalid dùng `--danger-control`. |
| Prototype `PROOF.md` nằm ngoài repo, có thể mất | trung bình | Đã copy CSS module + license vào `src/components/ui/openidea/`; dùng bản vendored làm nguồn DOM/class, không import `/private/tmp/...`. |
| Import AntD trong overlay sau Phase 54 | trung bình | Mỗi wrapper overlay đổi hẳn sang native; `eslint.config.mjs` override vẫn cho phép tới Phase 56, nhưng tiêu chí NAT-02 là không còn runtime AntD trong 28 file này. Giữ type-only import nếu cần (`AntXProps`) tới Phase 56. |
| Full Vitest >1h | cao | Chỉ chạy lệnh scoped §6.2. |

---

## Metadata

**Analog search scope:** `52-UI-SPEC.md` §1/§1.1/§2/§5/§7.2/§8/§9/§10; `52-DESIGN-REVIEW.md` §3; `51-CONTROL-INVENTORY.md` §2/§4/§4.2; `ROADMAP.md:85-98`; `REQUIREMENTS.md` NAT-02; 28 wrapper overlay; 26 wrapper core Phase 53 (helper patterns); 11 test ui/; `native/popup.tsx`; `openidea/` 31 CSS module; prototype `PROOF.md` + `src/main.jsx:157-199` (DemoDialog) + vendor CSS; `TaskTable.tsx` caller tiêu biểu.
**Dừng khi:** có analog cho cả 28 wrapper + contract chữ ký cho cả 28 file + test/risks. Không không đọc lại cùng file hai lần.
**Pattern extraction date:** 2026-11-22.
**Lưu ý cho planner:** Output này **không** thay Plan. Không sửa source, không cài dependency, không chạy full Vitest. Mọi rule "caller không sửa / API byte-for-byte / không UI runtime library / focus trap + popup" là hard constraint milestone v1.6.
