# Phase 51: Control Inventory & Surface Audit - Pattern Map

**Mapped:** 2026-11-21
**Scope:** INV-01 / INV-02 / INV-03 — artifact bắt buộc: `.planning/phases/51-control-inventory-surface-audit/51-CONTROL-INVENTORY.md`
**Files analyzed:** medium breadth — `src/components/ui/` (56 wrapper `.tsx` + 4 file phụ + 10 test), mọi import `antd` / `@ant-design/icons` trong `src` (97 file), mọi root UI (`src/AppIntelliJ.tsx`, `src/views/`, `src/workbench/`, `src/components/`)
**Analogs found:** 11 / 11 cluster — Phase 51 là phase **liệt kê/đối chiếu**, không đổi code. Analog chính là **chính source hiện tại + bộ helper inventory đã có**; giá trị bản đồ này là chỉ đúng nguồn truth và cơ chế quét để artifact không sót/không trùng.

> Không có `CONTEXT.md` / `RESEARCH.md` cho phase này. Scope lấy từ `.planning/ROADMAP.md:39-53` và `.planning/REQUIREMENTS.md:8-12`. Không đề xuất thay đổi implementation, không sửa source.

---

## 1. Nguồn truth cho số lượng — đọc kỹ trước khi viết artifact

Tiêu chí thành công #5 (`ROADMAP.md:50`) yêu cầu "số wrapper trong artifact khớp số wrapper thực tế". Codebase có **4 con số khác nhau** — artifact phải ghi rõ dùng con số nào cho cột nào, nếu không sẽ bị coi là "sót/trùng":

| Con số | Nguồn / lệnh | Ý nghĩa |
|--------|--------------|---------|
| **56** | `find src/components/ui -maxdepth 1 -name '*.tsx' \| wc -l` | Số file wrapper `.tsx` (không tính `__tests__`). Đây là "số wrapper" theo nghĩa file — dùng cho cột **wrapper cần thay**. |
| **257** | `npx tsx -e "import{scanWrappers}from './tests/helpers/antdInventory';console.log(scanWrappers('src/components/ui').size)"` | Số tên export首字母大写 do `scanWrappers()` thu (`export const/function [A-Z]...`) — gồm cả icon, static subcomponent, hook, helper. Đây là con số **guard dùng** — dùng cho tiêu chí #5. |
| **51 / 141 / 3** | `scanConsumedAntd('src')` (`tests/helpers/antdInventory.ts:49-65`) | components / icons / utilities tiêu thụ từ import có tên. Dùng cho cột **control đang dùng**. |
| **10** | `find src/components/ui/__tests__ -type f \| wc -l` | File test nền tảng (không phải wrapper, không đưa vào tồn kho control). |

Caveat bắt buộc ghi trong artifact: `scanConsumedAntd` **chỉ bắt `import { ... } from 'antd'`**, nên **không thấy** static API (`Modal.confirm`, `message.*`, `notification.*`) — các call site này phải liệt kê thủ công (xem §3.4). Helper cũng bỏ `import type` (`antdInventory.ts:37`) — artifact phải ghi riêng danh sách type-only import (xem §3.6).

---

## 2. File Classification — artifact phải cover những file nào

| Nhóm | File / path | Vai trò trong tồn kho | Analog / nguồn truth |
|------|-------------|----------------------|----------------------|
| Wrapper 1-file-1-control (41 file) | `src/components/ui/{alert,app,auto-complete,avatar,badge,breadcrumb,button,card,checkbox,collapse,config-provider,date-picker,descriptions,divider,drawer,dropdown,empty,form,grid,image,input-number,input,layout,list,mentions,menu,message,modal,notification,pagination,popconfirm,popover,progress,radio,result,segmented,select,skeleton,slider,space,spin,splitter,statistic,status-dot,switch,table,tabs,tag,textarea,time-picker,tooltip,tree-select,tree,typography,upload}.tsx` | Mỗi file = 1 control; điền props/state/event/keyboard/focus/validation/a11y (INV-01) | Chính file đó + `button.tsx:8-58` (mẫu prop policy + `IconButtonProps['aria-label']`) |
| Icon wrapper | `src/components/ui/icon.tsx` (141 `export const ... = wrapIcon(...)`), `src/components/icons/JetBrainsIcons.tsx`, `src/workbench/toolwindows/RemoteGitExplorer.tsx:4-11` (10 import icon trực tiếp `@ant-design/icons/<Name>`) | 141 icon consumed + 10 deep-import sót — phải liệt kê cả 2 dạng | `icon.tsx:170-325` (`wrapIcon`) + `coverage.test.ts:37-44` |
| Hạ tầng wrapper | `src/components/ui/{tokens.contract.ts,antdTheme.ts,ui-tokens.css,index.ts}`, `src/styles/tokens.ts`, `src/workbench/AntdThemeAdapter.tsx` | Không phải control, nhưng là chỗ mọi wrapper lấy token/theme — ghi là "nền tảng, không đếm vào số control" | `tokens.contract.ts:27-52`, `antdTheme.ts:5-6`, `index.ts:358` |
| Test nền tảng | `src/components/ui/__tests__/{antdInventory,coverage,guardConfig,staticApiGuard,inlineStyleSweep,tokens,uiTokens,button,controls,wave02Wrappers}.test.ts*`, `tests/helpers/antdInventory.ts` | Bằng chứng cơ chế quét; artifact phải trích lệnh từ đây | `antdInventory.test.ts:31-103`, `coverage.test.ts:24-52`, `50-PATTERNS.md:147-176` |
| Route root | `src/AppIntelliJ.tsx` (5 branch: 4 popout + main), `src/hooks/useHashRoute.ts` (15 route hợp lệ), `src/main.tsx` | Surface "route/view" (INV-02) | `AppIntelliJ.tsx:32-147`, `useHashRoute.ts:11-26` |
| View registry | `src/views/*.tsx` (20 view), `src/workbench/EditorArea.tsx:35-49,61-99,567-670` (switch `viewType` ~22 case) | Mọi view phải xuất hiện trong bảng surface | `EditorArea.tsx:567-670` là nguồn truth dispatch, không phải danh sách import |
| Workbench shell | `src/workbench/{WorkbenchLayout,TitleBar,StatusBar,EditorArea,DocSetLibrary,DocumentSetDetail,WorkbenchResizeHandle}.tsx`, `src/workbench/toolwindows/*.tsx` (19 file), `src/workbench/search/SearchEverywhereModal.tsx`, `src/workbench/virtual/VirtualizedList.tsx`, `src/workbench/actions/actionRegistry.ts` | Tool window / command palette / shell (INV-02) | `50-PATTERNS.md:237-245` (sóng 5 tool window + shell), `AppIntelliJLive.test.tsx` |
| Settings | `src/views/SettingsView.tsx`, `src/views/ConfigProfilesView.tsx`, `src/components/settings/*.tsx` (30 file) | Surface "settings" + mọi form/card bên trong | `NotificationSettingsCard.tsx`, `JiraConfigCard.tsx`, `LocalSqlitePersistenceCard.tsx` |
| CR / notes / AI Office | `src/components/changeRequests/*.tsx` (3), `src/components/notes/*.tsx` (16), `src/views/{ChangeRequestsView,ChangeRequestDetailView,NotesView,AiOfficeView,AgentControlView,StaffDetailView}.tsx`, `src/components/ai/*.tsx` (21) + `src/components/ai/grounded/*`, `src/components/agents/*.tsx` (11), `src/workbench/toolwindows/AiOfficeExplorer.tsx` | Surface CR, notes, AI Office, chat, agents | `50-PATTERNS.md:241-242` (U3+U4, U6) |
| Modal / drawer / popconfirm | 85 file có `<Modal` / `<Drawer` / `<Popover`, 33 file có `<Popconfirm` (đều trừ `__tests__`) | Đếm + liệt kê theo surface; `Popconfirm` khác `Modal.confirm` (xem §3.4) | Lệnh đếm ở §5; `modal.tsx:13-72` |
| Menu / context menu | `src/components/ui/{menu,dropdown}.tsx`, `onContextMenu` chỉ có ở `src/components/tasks/TaskTable.tsx`; `src/workbench/actions/actionRegistry.ts` | Surface menu + context menu (INV-02) — context menu chỉ 1 chỗ, dễ sót nếu chỉ grep `<Menu` | `TaskTable.tsx` (`onContextMenu`), `actionRegistry.ts` |
| Tooltip / popover | 76 file có `<Tooltip`; `src/components/ui/{tooltip,popover}.tsx` | Surface tooltip/popover | `tooltip.tsx:5-6` (export type placement) |
| Notification | `src/components/notifications/{NotificationBell,NotificationDrawer,NotificationItemRow}.tsx`, `src/components/ui/notification.tsx`, `src/workbench/toolwindows/NotificationPanel.tsx`, `src/hooks/{useNotifications,useDesktopNotification,useTimerAlertMonitor}.ts` | Surface notification + realtime OS notification (memory: notification phải realtime, không reload) | `notification.tsx:5-18`, `AppIntelliJ.tsx:43-54` |
| Empty / error / loading | `src/components/common/EmptyState.tsx`, `src/components/ui/{empty,skeleton,result,alert,spin}.tsx`, `src/components/ai/{InlineApiErrorCard,InterruptedBanner}.tsx`, `src/components/ai/widget/StagedLoadingIndicator.tsx`, `src/components/notes/SmartIngestionBanner.tsx`, `src/components/settings/PostRestoreBanner.tsx` | Trạng thái empty/error/loading (INV-02) — phân tán, không nằm gọn trong 1 view | `50-PATTERNS.md` không có cluster này — đây là chỗ dễ sót nhất |
| Import sót ngoài wrapper | 28 file `import type { ... } from 'antd'` (components, views, workbench, `src/utils/documentLinks.tsx`); `@ant-design/icons` deep-import tại `RemoteGitExplorer.tsx`; `@ant-design/plots` tại 4 file analytics | Phần INV-01 "mọi import còn sót" — phải liệt kê cả type-only lẫn plots (plots **không** thuộc phạm vi thay AntD control, nhưng phải ghi chú để khỏi hiểu nhầm) | Output lệnh §5; `50-PATTERNS.md:112` (type import vẫn hợp lệ) |

---

## 3. Pattern Assignments — cách document từng nhóm

### 3.1 Wrapper 56 file → bảng props/state/event/a11y

**Analog:** `src/components/ui/button.tsx:8-58` — mẫu đầy đủ nhất: `ButtonProps extends Omit<AntButtonProps,...>`, policy prop `variant`, `IconButtonProps` với `'aria-label': string` bắt buộc, `children?: never`, `withoutUndefined()`.

**Cách ghi vào `51-CONTROL-INVENTORY.md`:** mỗi wrapper 1 dòng/1 block gồm:
- `file` + tên export + `extends Ant<Name>Props` (xem `select.tsx:1-2`, `date-picker.tsx:1-7`, `tree.tsx:1-5` — nhiều file có `export type` riêng, phải liệt kê cả static subcomponent như `FormItem`/`FormList`/`FormErrorList`/`useForm`/`useWatch` ở `form.tsx:35-40`).
- **state**: phần lớn wrapper stateless, ngoại trừ `useTaskMateModal()` (`modal.tsx:69-72` → `AntModal.useModal()` trả `{modal, contextHolder}`), và các holder `ThemeAppHolder` / `AntdApp` (`message.tsx`, `notification.tsx`, `app.tsx`). Ghi rõ "stateless" thay vì bỏ trống.
- **event/keyboard/focus/a11y**: lấy từ AntD props kế thừa + policy riêng (`IconButton` aria-label, `resolveMask` ở `modal.tsx:21-32`, `closePolicy`). Không suy diễn — trích dòng code.
- **behavior phải giữ nguyên** (INV-03): caller props win, `withoutUndefined` strips undefined, mask boolean `false` không bị đổi thành object, `contextHolder` phải render.

### 3.2 Icon 141 export + 10 deep-import

**Analog:** `icon.tsx:170-325` + `coverage.test.ts:37-44` (test khẳng định mọi `consumed.icons` đều có wrapper) + `antdInventory.test.ts:60-71` (fixture `icon.tsx` ↔ `SearchOutlined`).

**Cách ghi:** 1 bảng 141 dòng `icon name → dòng wrapIcon trong icon.tsx`; thêm mục riêng "ngoại lệ deep-import" với 10 dòng `src/workbench/toolwindows/RemoteGitExplorer.tsx:4-11` (`CloudServerOutlined`, `FolderViewOutlined`, `FolderOutlined`, `FolderOpenOutlined`, `FileTextOutlined`, `ReloadOutlined`, `SearchOutlined`, `BranchesOutlined`, …). Nhãn INV-03: tất cả vào nhóm **core** (icon tự build ở Phase 53), complexity thấp (thay 1 component), behavior giữ nguyên `className` / `onClick` / `aria-hidden` qua `wrapIcon`.

### 3.3 Surface route/view

**Analog:** `AppIntelliJ.tsx:32-147` (5 branch return) + `useHashRoute.ts:11-26` (15 route) + `EditorArea.tsx:567-670` (switch `viewType`).

**Cách ghi:** bảng 2 cấp — (1) 15 hash route → branch render → provider bọc; (2) ~22 `viewType` case → `<XView />` → file. Đánh dấu 4 popout (`timer-popout`, `notes-popout`, `ai-popout`, `coding-zone-popout`) là surface riêng có branch riêng — dễ sót nếu chỉ quét `src/views/`. Ghi rõ mỗi branch tự bọc `AntdThemeAdapter` + `ThemeAppHolder` (không singleton) — đây là behavior phải giữ.

### 3.4 Static API — analog chống sót

**Analog:** `50-PATTERNS.md:147-176` (`staticApiGuard.test.ts` quét regex `Modal\.confirm\(|message\.(...)\(|notification\.(...)\(`) + `modal.tsx:69-72`.

**Cách ghi:** danh sách riêng, tách khỏi import inventory. Hiện tại còn **4 file**outside `ui/` có static call: `src/components/changeRequests/ChangeRequestModal.tsx` (6 `message.*`), `src/components/settings/JiraConfigCard.tsx` (6 `notification.*`), `src/components/settings/LocalSqlitePersistenceCard.tsx` (7 `notification.*`), `src/components/settings/SnapshotRollbackCard.tsx` (1). Ghi chú: `scanConsumedAntd()` **không bắt** các call này — artifact phải có cột "nguồn phát hiện = regex call site", không phải "import".

### 3.5 State empty/error/loading — analog phân tán

**Analog:** không có cluster gọn — phải ghép `EmptyState.tsx` + `ui/{empty,skeleton,result,alert,spin}.tsx` + 6 file banner/error/chat ở bảng §2. Đây là chỗ `50-PATTERNS.md` không cover; planner phase 51 phải tự quét bằng lệnh §5 và ghi từng file vào bảng INV-02.

### 3.6 Type-only import

**Analog:** `50-PATTERNS.md:112` — `import type` hợp lệ (`allowTypeImports: true`). 28 file type-only import (`MenuProps`, `ColumnsType`, `DataNode`, `InputRef`, `UploadProps`, `TextAreaRef`, `MentionsRef`, `ModalFuncProps`, `DescriptionsProps`, `TabsProps`, …). Artifact ghi riêng cột "type-only — không thay runtime, nhưng phải thay khi gỡ dependency ở Phase 56". Đây là nơi dễ nhầm với runtime import khi chạy grep.

---

## 4. Shared Patterns / nguyên tắc viết artifact

### Nguồn truth là source, không phải con số nhớ được
`50-PATTERNS.md:312` đã cảnh báo: số call site lệch giữa research và CONTEXT (615 vs 633) — dùng grep làm truth. Phase 51 áp dụng y hệt: mọi số trong `51-CONTROL-INVENTORY.md` phải kèm lệnh tái tạo (§5).

### Nhóm implementation (INV-03) — 3 nhóm theo ROADMAP
- **core/form** (Phase 53): button, input, textarea, checkbox, radio, switch, select, input-number, date-picker, time-picker, slider, rate-like, icon, tokens — analog `button.tsx`, `form.tsx`, `tokens.contract.ts`.
- **overlay/complex** (Phase 54): table, modal, drawer, menu, dropdown, tooltip, popover, popconfirm, date-picker (range), tree, tree-select, mentions, form (static), upload, message/notification/modal hooks — analog `modal.tsx`, `form.tsx:35-40`, `50-PATTERNS.md:66-86`.
- **domain/adoption** (Phase 55): mọi view/tool window/shell tiêu thụ wrapper — analog 5 sóng ở `50-PATTERNS.md:237-245`.

Mỗi control ghi: nhóm + complexity (thấp/trung bình/cao) + wrapper cần thay + nhãn OpenIDEA tương đương hoặc `"cần thiết kế mới"` + tiêu chí behavior giữ nguyên. Phase 51 **không quyết định** control OpenIDEA cụ thể — việc đó là Phase 52 (`MAP-01/02`); ở đây chỉ đặt nhãn dự kiến.

### Không đếm trùng
- `index.ts` là barrel (`index.ts:358` export type từ antd) — không phải wrapper, ghi ở hạ tầng.
- `antdTheme.ts` / `tokens.contract.ts` / `ui-tokens.css` — hạ tầng token, không phải control.
- 10 file `__tests__` — bằng chứng, không phải control.
- `@ant-design/plots` (4 file analytics) — thư viện biểu đồ, nằm ngoài phạm vi "thay AntD control"; phải ghi chú một dòng để tránh hiểu nhầm khi chạy grep `@ant-design`.

### Gate lệnh
Không chạy full Vitest (memory rule). Lệnh scoped cho phase này: `npx vitest run src/components/ui/__tests__/antdInventory.test.ts src/components/ui/__tests__/coverage.test.ts --bail=1` (xem `package.json:24` `test:foundation`). Không sửa source.

---

## 5. Lệnh enumerate chính xác (copy vào artifact để tái tạo)

```bash
cd /Users/tranducquan/Working/Personal/task-management

# 56 file wrapper .tsx
find src/components/ui -maxdepth 1 -name '*.tsx' | sort

# 4 file hạ tầng + 10 test
find src/components/ui -maxdepth 1 -type f ! -name '*.tsx' | sort
find src/components/ui/__tests__ -type f | sort

# 257 tên export theo guard (con số tiêu chí #5)
npx tsx -e "import{scanWrappers,scanConsumedAntd,findMissingWrappers}from './tests/helpers/antdInventory';const w=scanWrappers('src/components/ui');const c=scanConsumedAntd('src');console.log('wrappers',w.size);console.log(JSON.stringify(c,null,2));console.log('missing',findMissingWrappers(c,w));"

# 97 file có import antd/@ant-design/icons (kèm type-only + test)
grep -rnE "from ['\"](antd|@ant-design/icons)" src --include='*.ts' --include='*.tsx' | sort

# chỉ runtime import (loại "import type {")
grep -rnE "^import (type )?\{" src --include='*.ts' --include='*.tsx' \
  | grep -E "(antd|@ant-design/icons)" | grep -vE "^[^:]+:[0-9]+:import type \{" | sort

# deep-import icon sót + plots (ngoài phạm vi)
grep -rn "@ant-design/icons/" src --include='*.tsx'
grep -rln "@ant-design/plots" src --include='*.tsx' | sort

# static API call site (helper không bắt)
grep -rnE "(Modal\.(confirm|info|success|warning|error)|message\.(success|error|warning|warn|info|loading|open|destroy)\(|notification\.(success|error|warning|warn|info|loading|open|destroy)\()" src --include='*.ts' --include='*.tsx' | grep -v '/ui/'

# surface: route, view, workbench, settings, CR/notes/AI
cat src/hooks/useHashRoute.ts                       # VALID_ROUTES
grep -nE "case '" src/workbench/EditorArea.tsx      # viewType switch
find src/views -maxdepth 1 -name '*.tsx' | sort
find src/workbench -maxdepth 2 -name '*.tsx' | sort
find src/components/settings -maxdepth 1 -name '*.tsx' | sort

# surface: overlay / menu / state
grep -rlnE '<(Modal|Drawer|Popover)' src --include='*.tsx' | grep -v __tests__ | sort
grep -rln '<Popconfirm' src --include='*.tsx' | grep -v __tests__ | sort
grep -rln '<Tooltip' src --include='*.tsx' | grep -v __tests__ | sort
grep -rln 'onContextMenu' src --include='*.tsx' | grep -v __tests__ | sort
find src -type f \( -iname '*empty*' -o -iname '*loading*' -o -iname '*error*' -o -iname '*skeleton*' -o -iname '*banner*' \) | sort
```

---

## 6. No Analog Found

| Item | Vai trò | Lý do / cách xử lý |
|------|---------|--------------------|
| `51-CONTROL-INVENTORY.md` chính nó | artifact/doc | Chưa tồn tại, không có analog code. Cấu trúc tham khảo: bảng classification (`50-PATTERNS.md:11-35`) + pattern assignment (`:39-245`) + metadata (`:307-313`). |
| `scratchpad/oi-prototype/PROOF.md` | baseline thiết kế | `ROADMAP.md:52` nói đã duyệt nhưng **không tìm thấy file** khi quét (`find . -name PROOF.md` trống). Phase 51 chỉ cần nhãn "cần thiết kế mới"/"có tương đương"; Phase 52 mới cần proof — planner nên flag sếp trước khi sang phase 52. |
| Nhóm empty/error/loading | surface | Không có cluster gọn trong `50-PATTERNS.md`; phải quét riêng bằng lệnh §5. |

## Metadata

**Analog search scope:** `src/components/ui/` (56 wrapper + 4 hạ tầng + 10 test), `src/` toàn bộ (import antd), `src/{views,workbench,components}/` (surface roots), `tests/helpers/antdInventory.ts`, `.planning/phases/50-full-app-adoption/50-PATTERNS.md`, `.planning/ROADMAP.md:39-53`, `.planning/REQUIREMENTS.md:8-12`, `package.json:6-25`.
**Files scanned:** ~200 candidates; đọc sâu 8 file (`AppIntelliJ.tsx`, `button.tsx`, `modal.tsx`, `form.tsx`, `tokens.contract.ts`, `antdInventory.ts`, `coverage.test.ts`, `antdInventory.test.ts`, `50-PATTERNS.md`); dừng khi có 11 cluster analog mạnh (early stopping).
**Pattern extraction date:** 2026-11-21
**Lưu ý cho planner:** Đây là phase tồn kho — output duy nhất là `51-CONTROL-INVENTORY.md`; không sửa source, không cài dependency, không chạy full test. Số "wrapper" phải định nghĩa rõ (56 file vs 257 export) ngay đầu artifact để tiêu chí #5 không bị tranh cãi.
