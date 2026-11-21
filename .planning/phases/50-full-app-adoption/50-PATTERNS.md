# Phase 50: Full App Adoption - Pattern Map

**Mapped:** 2026-11-21
**Files analyzed:** 25 (new + modified)
**Analogs found:** 24 / 25 (1 không có analog code — `50-UAT.md` là doc bằng chứng, dùng template trong UI-SPEC)

> Ghi chú: Đây là phase adoption (refactor cơ học có guard). Hầu hết file đã tồn tại — "analog" chính là **chính file đó ở trạng thái hiện tại**. Giá trị của bản đồ này là chỉ đúng cơ chế thay thế (import → barrel, static API → hook, inline token → CSS var, service → notify callback) và file mẫu đã implement cơ chế đó từ Phase 49.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/AppIntelliJ.tsx` | provider/component | request-response (context) | `src/components/ui/__tests__/controls.test.tsx:154-160` (mount holder) + self | exact |
| `src/components/ui/message.tsx` | provider/hook | request-response | self (đã có `useMessage` + `ThemeAppHolder`) | exact — nguồn |
| `src/components/ui/modal.tsx` | provider/hook | request-response | self (`useTaskMateModal`, `resolveMask`) | exact — nguồn |
| `src/components/ui/notification.tsx` | provider/hook | request-response | self (`useNotification`, `useNotificationConfig`) | exact — nguồn |
| `src/components/ui/{table,form,tree,...}.tsx` | component/wrapper | transform | `src/components/ui/table.tsx:8`, `form.tsx:8-40`, `modal.tsx:14-18` | exact — nguồn |
| `package.json` | config | N/A | self (scripts block) | exact |
| `eslint.config.mjs` | config | N/A | self (GUARD-01 + IN-01) | exact |
| `src/components/ui/__tests__/guardConfig.test.ts` | test | batch (config assert) | self + `antdInventory.test.ts` | exact |
| `src/components/ui/__tests__/staticApiGuard.test.ts` (new) | test | batch (source sweep) | `src/components/ui/__tests__/coverage.test.ts:1-52` + `tests/helpers/antdInventory.ts:17-66` | role-match |
| `src/components/ui/__tests__/inlineStyleSweep.test.ts` (new) | test | batch (source sweep) | `src/components/ui/__tests__/coverage.test.ts:14-22` (walk + readFileSync) | role-match |
| `e2e/adoption.spec.ts` (new) | test/e2e | request-response (browser) | `e2e/aiChat.spec.ts` + `tests/e2e/coding-zone.spec.ts:116-125` | role-match |
| `.planning/phases/50-full-app-adoption/50-UAT.md` (new) | test evidence/doc | N/A | `50-UI-SPEC.md:113-132` (evidence template) | no code analog |
| `src/utils/exportFolderZip.ts` | utility | file-I/O | self (`message.success/error` tại 119/122) + caller `src/workbench/toolwindows/DocsExplorer.tsx:402` | exact (self), partial (notify) |
| `src/utils/mermaidExport.ts` | utility | file-I/O | self (10 call site dòng 56-162) | exact (self), partial (notify) |
| `src/hooks/useNetworkStatus.ts` | hook | event-driven (online/offline) | self (dòng 17-37) | exact (self), partial (notify) |
| `src/hooks/useTimerAlertMonitor.ts` | hook | event-driven (timer) | self (dòng 165) | exact (self), partial (notify) |
| `src/workbench/actions/actionRegistry.ts` | service/registry | request-response | self (dòng 49-62, 237, 250) | exact (self), partial (notify) |
| `src/services/ai/claudeCliService.ts` | service | request-response | self (dòng 91) | exact (self), partial (notify) |
| `src/components/tasks/QuickAddBar.tsx` | component | CRUD | self (dòng 77/80 message.success/error) | exact |
| `src/components/settings/NotificationSettingsCard.tsx` (+ CRUD cards) | component | CRUD | self (dòng 100-242) | exact |
| `src/components/changeRequests/ChangeRequestModal.tsx` | component | CRUD / modal forms | self (dòng 146-243, `Form.Item` 256-350) | exact |
| `src/components/ai/AIChatDrawer.tsx` | component | streaming / request-response | self (dòng 392-989) | exact |
| `src/workbench/TitleBar.tsx` (+ tool windows) | component | request-response | self (icon buttons 122-373, toggle 316-330) | exact |

## Pattern Assignments

### `src/AppIntelliJ.tsx` (provider/component, request-response)

**Analog:** `src/components/ui/__tests__/controls.test.tsx:154-160` — cách duy nhất trong codebase mount `ThemeAppHolder` đúng cách (bọc consumer dưới `ConfigProvider`).

**Mount pattern** (`controls.test.tsx:154-160`):
```tsx
render(
  <ConfigProvider theme={getAntdTheme('dark')}>
    <ThemeAppHolder>
      <Consumer />
    </ThemeAppHolder>
  </ConfigProvider>,
);
```

**Áp dụng vào shell** — nghiên cứu `AppIntelliJ.tsx:85-136` có 5 branch return (4 popout + main), mỗi branch bọc `AntdThemeAdapter` riêng. `AntdThemeAdapter` chính là `ConfigProvider` (`AntdThemeAdapter.tsx:19`). Mount `ThemeAppHolder` ngay dưới mỗi `AntdThemeAdapter` — đúng một holder cho mỗi rendered tree, không tạo singleton. Import thêm từ barrel:
```tsx
import { ThemeAppHolder } from './components/ui';
// mỗi branch:
<AntdThemeAdapter>
  <ThemeAppHolder>{/* providers + view */}</ThemeAppHolder>
</AntdThemeAdapter>
```
Lưu ý **không** mount holder ở popout riêng ngoài `AppIntelliJ` — research Open Question 2; planner chọn bọc từng branch (cùng React tree, route-based render) và ghi rõ. Không đổi `AntdThemeAdapter` (đã inject token lên `document.documentElement`,CR-02).

---

### `src/components/ui/message.tsx`, `modal.tsx`, `notification.tsx` (provider/hook, request-response)

**Analog:** chính các file này — đã implement xong cơ chế Phase 49. **Không sửa implementation**, chỉ dùng làm nguồn copy cho mọi view.

**Hook import pattern** (`index.ts:162-174` barrel export):
```tsx
import { useMessage, useNotification, useTaskMateModal } from '../components/ui';
```

**Hook bodies:**
- `message.tsx:5-19` — `useMessage()` = `AntApp.useApp().message`; `ThemeAppHolder` = `<AntApp>{children}</AntApp>`.
- `notification.tsx:5-18` — `useNotification()` = `AntApp.useApp().notification`; `useNotificationConfig()` trả default `duration: 4.5, placement: 'topRight', pauseOnHover: true`.
- `modal.tsx:69-72` — `useTaskMateModal()` = `AntModal.useModal()` → `{ modal, contextHolder }`.

**Bắt buộc** (research Pitfall 1): mọi view dùng `useTaskMateModal()` phải render `{contextHolder}` trong tree, nếu không `modal.confirm` không hiện. Xem `controls.test.tsx:140-167` để copy pattern test (message → notification → confirm, assert `.ant-app` tồn tại).

**Confirm copy giữ byte-for-byte** (UI-SPEC §Copywriting), ví dụ research Pattern 1:
```tsx
modal.confirm({ title: 'Xác nhận xóa', content: '...', onOk: async () => { ... } });
```

---

### `src/components/ui/{table,form,tree,...}.tsx` (component/wrapper — mở rộng prop D-03)

**Analog:** `form.tsx:8-40` (mirror static subcomponents), `table.tsx:8`, `modal.tsx:14-18` (wrapper policy props + `resolveMask`).

**Prop-gap extension pattern** (`modal.tsx:14-18, 38-61`):
```tsx
export interface ModalProps extends AntModalProps {
  widthScale?: OverlayWidth;
  footerPolicy?: 'default' | 'none';
  closePolicy?: 'closable' | 'silent';
}
// caller props win; policy props map to AntD props; withoutUndefined() strips undefined
```

**Static subcomponent mirror** (`form.tsx:35-40`) — copy khi wrapper thiếu `Form.Item`/`Form.List`:
```tsx
export const FormItem = AntForm.Item;
export const FormList = AntForm.List;
export const FormErrorList = AntForm.ErrorList;
export const useForm = AntForm.useForm;
export const useWatch = AntForm.useWatch;
```

D-03: thiếu prop chuyên sâu (column render, `namePath`, tree props) → thêm vào file wrapper hiện có + test (xem `button.test.tsx`, `controls.test.tsx`). **Cấm** import runtime `antd` tại view. `import type` vẫn hợp lệ (`allowTypeImports: true`). Cẩn thận WR-03/WR-04 (button ghi đè caller props, mất `mask={false}`) — giữ `withoutUndefined` + `resolveMask` (`button.tsx:37-43`, `modal.tsx:25-32`).

---

### `package.json` + `eslint.config.mjs` (config, D-11/IN-01)

**Analog:** chính hai file này.

**`package.json:23-25` — hiện trạng:**
```json
"lint": "eslint src/components/ui src/main.tsx src/AppIntelliJ.tsx src/styles src/hooks/useThemeMode.ts src/workbench/themeBroadcast.ts tests/fixtures/guard/good-import.tsx",
"lint:adoption": "eslint src",
"test:foundation": "vitest run ... --bail=1"
```
Đổi `lint` → `"eslint src"`, xóa hẳn `lint:adoption`, giữ `test:foundation` và `build: "tsc && vite build"`.

**`eslint.config.mjs:7-14` — comment IN-01 cần cập nhật** (bỏ hướng dẫn "trước Phase 50 thay lint bằng eslint src", thay bằng trạng thái đã áp dụng). Giữ nguyên rule `no-restricted-imports` (`:39-55`, `allowTypeImports: true`) và override `src/components/ui/**` (`:58-62`). Không thêm GitHub Actions.

---

### `src/components/ui/__tests__/guardConfig.test.ts` (test, config assert)

**Analog:** self + `antdInventory.test.ts`.

**Hiện trạng vỡ khi D-11** (`guardConfig.test.ts:11-16`):
```ts
expect(packageJson.scripts.lint).toBeDefined();
expect(packageJson.scripts['lint:adoption']).toBeDefined();
expect(packageJson.scripts['test:foundation']).toBeDefined();
expect(packageJson.scripts.build).toBe('tsc && vite build');
```
Sửa: assert `lint === 'eslint src'`, bỏ dòng `lint:adoption`, giữ `test:foundation` + `build`. Giữ nguyên 3 test còn lại (`:18-58`: no remote CI, Babel parser + guard config, negative fixture reject). Negative fixture dùng `execFileSync('npx', ['eslint', 'tests/fixtures/guard/bad-import.tsx'], ...)` (`guardConfig.test.ts:44-48`) — pattern chạy ESLint thật trong test.

---

### `src/components/ui/__tests__/staticApiGuard.test.ts` (new — test, source sweep, D-07)

**Analog:** `src/components/ui/__tests__/coverage.test.ts:1-52` (cấu trúc test quét source) + `tests/helpers/antdInventory.ts:17-66` (`walk` + `readFileSync`).

**Source-sweep structure** (`coverage.test.ts:11-22, 24-35`):
```ts
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = 'src';
const UI = 'src/components/ui';
function walkUi(dir: string): string[] { /* readdirSync recursive, bỏ __tests__ */ }

describe('...', () => {
  const consumed = scanConsumedAntd(SRC);
  it('...', () => { expect(findMissingWrappers(consumed, wrapped)).toEqual([]); });
});
```
Test mới: walk toàn `src` (bỏ `UI`), regex `Modal\.confirm\(|message\.(success|error|warning|warn|info|loading|open|destroy)\(|notification\.(success|error|warning|warn|info|loading|open|destroy)\(`, assert `[]` — regex bắt buộc gồm `loading`/`open`/`destroy`/`warn` để chặn 4 call `message.loading(` tĩnh (nguồn lệch 615/633). Khớp lệnh grep cổng trong `50-UI-SPEC.md:167`. Chạy qua `test:foundation` (thêm path vào script) hoặc `npx vitest run src/components/ui/__tests__ --bail=1`.

---

### `src/components/ui/__tests__/inlineStyleSweep.test.ts` (new — test, source sweep, D-10)

**Analog:** `src/components/ui/__tests__/coverage.test.ts:14-22` (walk + readFileSync) + `tests/e2e/coding-zone.spec.ts:117-124` (so sánh computed style).

Dùng lại `walk()` từ `tests/helpers/antdInventory.ts:17-27`. Quét pattern token-value: `fontSize: 11/12`, `borderRadius: 6/8`, hex `#1677ff/#4f46e5/#8c8c8c/#ffffff`, `gap` lệch. Kiểm tra whitelist bề mặt đã migrate (research Open Question 3 — planner chọn: quét toàn `src` nhưng chỉ fail trên whitelist, hoặc chạy ở sóng cuối). Ngoại lệ phải có comment giải thích (D-10) — test bỏ qua dòng có marker comment. Không tạo ESLint rule (đã defer).

---

### `e2e/adoption.spec.ts` (new — test/e2e, 6 luồng × light/dark)

**Analog:** `e2e/aiChat.spec.ts` (spec style, `getByRole`/`getByLabel`/`getByTestId`) + `tests/e2e/coding-zone.spec.ts:116-125` (parity computed-style).

**Parity pattern** (`coding-zone.spec.ts:116-125`) — copy cho U1..U6:
```ts
const lightBg = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
await page.getByTestId('cz-theme-toggle').click();
const darkBg = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
expect(darkBg).not.toEqual(lightBg);
// assert font/size không đổi, chỉ token đổi
```

**Toggle selector:** `TitleBar.tsx:316-330` có `aria-label="Chuyển đổi giao diện sáng/tối"` — dùng `page.getByRole('button', { name: 'Chuyển đổi giao diện sáng/tối' })` (research Open Question 4: có sẵn accessible name, không cần thêm data-testid). `useThemeMode` (`hooks/useThemeMode.ts:42-72`) lưu localStorage + broadcast, toggle đổi tức thì không reload.

**A11y assertions** (UI-SPEC §Accessibility preservation): focus ring 2px, Tab/Shift+Tab, Enter activate, Escape đóng overlay, mọi IconButton có `aria-label`. Dùng config `playwright.config.ts` (`baseURL: http://127.0.0.1:5173/task-management/`, `channel: 'chrome'`, webServer Vite tự start). Không chạy full suite (memory rule) — chạy scoped `npm run test:e2e -- e2e/adoption.spec.ts`.

---

### `.planning/phases/50-full-app-adoption/50-UAT.md` (new — evidence doc)

**Analog:** không có analog code. Dùng template trong `50-UI-SPEC.md:113-132`: matrix 6 luồng × 2 theme = 12 dòng (Focus/Keyboard/Aria), parity checks, defects table, gates. Không commit screenshot (D-13).

---

### 6 file `.ts` phi-React → notify callback (D-06, research Pitfall 2)

**Analog chung:** `src/components/ui/__tests__/controls.test.tsx:140-152` — pattern closure `notify` được tạo trong component rồi truyền xuống:
```tsx
const notificationApi = useNotification();
const notify = () => notificationApi.open({ title: 'thông báo' });
```
Áp dụng: **view** (React component) gọi `useMessage()` → tạo callback → truyền vào service/util. File `.ts` nhận `notify` như parameter, **không** import `antd`, **không** tạo singleton/bridge global. Giữ chữ thông báo byte-for-byte.

| File | Role / Flow | Static call sites (self) | Notify injection point (caller view) |
|------|-------------|--------------------------|--------------------------------------|
| `src/utils/exportFolderZip.ts` | utility / file-I/O | `message.success` 119, `message.error` 122 (`key: 'download-folder'` object form — giữ nguyên content) | `src/workbench/toolwindows/DocsExplorer.tsx:402` (`downloadFolderAsZip`) — view tạo `notify`, truyền vào |
| `src/utils/mermaidExport.ts` | utility / file-I/O | 10 call site dòng 56-162 (`warning/success/error`) | view dùng `exportSvg`/`exportPng` (MermaidViewer) truyền `notify` |
| `src/hooks/useNetworkStatus.ts` | hook / event-driven | `message.success` 20, `message.warning` 26 (trong `handleOnline`/`handleOffline` dòng 18-28) | Hook **là** React hook → có thể gọi `useMessage()` trực tiếp thay callback; giữ `announceToScreenReader` dòng 21/27 |
| `src/hooks/useTimerAlertMonitor.ts` | hook / event-driven | `message.warning(alert.message)` 165 | Hook React → gọi `useMessage()` trực tiếp |
| `src/workbench/actions/actionRegistry.ts` | service/registry / request-response | `message.warning` 49, `error` 55, `info` 62/237/250 | Caller: `SearchEverywhereModal.tsx:107`, `RemoteGitExplorer.tsx:838` — `executeAction(id, notify)`; giữ logic `unhandled` dòng 62 |
| `src/services/ai/claudeCliService.ts` | service / request-response | `message.success` 91 | Caller view truyền `notify` vào hàm copy-lệnh |

Lưu ý đặc biệt: `useNetworkStatus.ts` và `useTimerAlertMonitor.ts` là hook (dùng được hook context) — ưu tiên `useMessage()` trực tiếp hơn notify callback, nhưng vẫn cấm import static. Bốn file còn lại (`exportFolderZip`, `mermaidExport`, `actionRegistry`, `claudeCliService`) là `.ts` thuần → dùng notify callback.

---

### 5 sóng bề mặt — view migration (ADOPT-01/02)

Mọi view dùng chung 3 bước (copy pattern đã nêu ở các mục trên):
1. **Import** (`tests/fixtures/guard/good-import.tsx:1-8`): `import { Button, Input, ... } from '../../components/ui';` + `import { SearchOutlined } from '../../components/ui/icon';`. Giữ `import type { ... } from 'antd'` (D-19). Xóa runtime import `antd`/`@ant-design/icons`.
2. **Static API → hook** (`controls.test.tsx:140-152`): `const { message } = useMessage();`, `const { modal, contextHolder } = useTaskMateModal();` + render `{contextHolder}`. Giữ copy byte-for-byte.
3. **Inline token → CSS var** (`button.tsx:24-32`, token vars `--font-size-ui`, `--radius-control`, `--accent`, `--fg-secondary`, `--island-gap` từ `workbench-tokens.css`):
   ```tsx
   <div style={{ fontSize: 'var(--font-size-ui)', borderRadius: 'var(--radius-control)' }} />
   // dynamic — giữ inline + comment (D-10):
   <div style={{ width: `${progressPct}%` }} /> // ponytail: dynamic data width, không phải token
   ```

| Sóng / View | UAT | Analog (chính là view) — excerpt đáng chú ý |
|-------------|-----|---------------------------------------------|
| **1 tasks** `src/components/tasks/QuickAddBar.tsx` | U1 | `message.success({ content: 'Task created', duration: 1.5 })` dòng 77, `message.error({ content: 'Không thể tạo tác vụ', duration: 2 })` dòng 80 → giữ object form content/duration. Input có `data-shortcut-id="quick-add-input"` (dòng 141) — selector ổn định cho Playwright. Inline `gap: 6` dòng 98 → `--island-gap`. |
| **2 settings** `src/components/settings/NotificationSettingsCard.tsx` (+ 10 CRUD cards) | U2 | Import `antd` block dòng 1-17 + icons dòng 19-23. 8 static call dòng 100-242 (warning/success/info/error) → hook. Form/Select/Switch/Drawer/Modal qua barrel. Giữ error/disabled copy. |
| **3 CR/notes** `src/components/changeRequests/ChangeRequestModal.tsx` | U3+U4 | Import dòng 1-24 (Modal/Form/Input/DatePicker/Select/Button/Space/Radio/Tag/message + 9 icons). `message.error/success` dòng 146-232. `Form.Item name=...` dòng 256-350 → mirror `FormItem` từ `form.tsx:35`. `confirmLoading={loading}` dòng 243, `danger` 415, `loading={creatingEpic}` 470 — giữ. `modal.confirm` → `useTaskMateModal()` + render contextHolder. StatusTag map màu từ `tokens.contract.ts`. |
| **4 AI/chat** `src/components/ai/AIChatDrawer.tsx` | U6 | `import { theme, message, Modal } from 'antd'` dòng 2 → barrel. `message.success/error/warning` dòng 392-989 → `useMessage()`. Notification → `useNotification()` (`notification.tsx`). Toggle theme đổi tức thì (`useThemeMode`). |
| **5 tool windows + shell** `src/workbench/TitleBar.tsx` | U5 | Icon buttons dòng 122-373 dùng `aria-label` (`'Search Everywhere...'`, `'Open Tasks'`, `'Settings'`,...) → thay bằng `IconButton` (`button.tsx:50-58` — `'aria-label'` bắt buộc, `children?: never`). Theme toggle dòng 316-330: `type="text" size="small"`, inline `width/height 28, padding 0, borderRadius 4` — giữ size cố định (dimension 49), `borderRadius: 4` đã đúng token. |

---

## Shared Patterns

### Static API → Context Hook
**Source:** `src/components/ui/message.tsx:5-19`, `modal.tsx:69-72`, `notification.tsx:5-18`
**Apply to:** Mọi view trong 5 sóng + 6 file `.ts` phi-React
```tsx
const { message } = useMessage();
const { notification } = useNotification();
const { modal, contextHolder } = useTaskMateModal();
return <>{contextHolder}{/* ... */}</>;
```
Mount `ThemeAppHolder` đúng một lần/branch tại `AppIntelliJ` dưới `AntdThemeAdapter`. Cấm `message.*`/`Modal.confirm`/`notification.*` tĩnh ngoài `ui/`.

### Wrapper-Only Import + Type Exception
**Source:** `eslint.config.mjs:39-62`, `tests/fixtures/guard/good-import.tsx:1-8`
**Apply to:** Mọi view đã migrate
```tsx
import { Button } from '../../components/ui';
import { SearchOutlined } from '../../components/ui/icon';
import type { ButtonProps } from 'antd'; // OK — allowTypeImports: true
```
Negative fixture `tests/fixtures/guard/bad-import.tsx:1-7` chứng minh guard chặn runtime import.

### Notify Callback cho file phi-React
**Source:** `src/components/ui/__tests__/controls.test.tsx:140-144` + D-06
**Apply to:** `exportFolderZip.ts`, `mermaidExport.ts`, `actionRegistry.ts`, `claudeCliService.ts`
View tạo `const notify = () => message.success(...)` rồi truyền xuống; file `.ts` nhận `notify` param, giữ copy byte-for-byte, không singleton.

### Token-Valued Inline Style → CSS var
**Source:** `src/components/ui/button.tsx:24-32`, `src/styles/workbench-tokens.css`, `src/components/ui/ui-tokens.css`
**Apply to:** Mọi view đã migrate
Vars: `--font-size-ui`, `--font-size-small`, `--radius-control`/`--island-radius`, `--accent`, `--accent-soft`, `--fg-secondary`, `--island-gap`. Near-token (`fontSize 11→12`, `borderRadius 6/8→4`, `#1677ff→--accent`, `#8c8c8c→--fg-secondary`) ghi rõ chỗ đổi value (D-09). Giữ inline cho giá trị động + comment (D-10). Không sửa bảng `src/styles/tokens.ts`.

### IconButton Accessible Name
**Source:** `src/components/ui/button.tsx:12-16, 50-58`
**Apply to:** Toolbar icon buttons (U5) + mọi icon-only button
```tsx
export interface IconButtonProps extends ButtonProps {
  'aria-label': string;
  children?: never;
}
```
`'aria-label'` bắt buộc theo type — không sửa tại view bằng inline.

### Theme Toggle / Parity
**Source:** `src/hooks/useThemeMode.ts:42-72`, `src/workbench/TitleBar.tsx:316-330`, `src/workbench/AntdThemeAdapter.tsx:10-37`
**Apply to:** `e2e/adoption.spec.ts`, `50-UAT.md`
`useThemeMode().toggle` → `setMode` → `broadcastThemeMode` + localStorage. Selector: `getByRole('button', { name: 'Chuyển đổi giao diện sáng/tối' })`. Portaled overlay kế thừa var qua `document.documentElement` (`applyCssVariables` — CR-02).

### Gate Commands
**Source:** `package.json:6-25`, `eslint.config.mjs`
**Apply to:** Mọi wave/phase gate (D-02/D-11)
Per task: `npx tsc --noEmit && npm run lint && npm run test:foundation`. Per wave: `eslint <file đã migrate>` + Vitest liên quan. Phase: `npm run lint` (= `eslint src`) + `test:foundation` + `npm run build`. Không chạy full Vitest suite (memory rule — trên 1 giờ).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `.planning/phases/50-full-app-adoption/50-UAT.md` | test evidence/doc | N/A | Không có analog code — dùng template matrix 6 luồng × 2 theme trong `50-UI-SPEC.md:113-132` |

## Metadata

**Analog search scope:** `src/components/ui/` (51 wrapper + `__tests__`), `src/{components,workbench,services,hooks,utils}/`, `tests/{helpers,e2e,fixtures/guard}/`, `e2e/`, config files (`package.json`, `eslint.config.mjs`, `playwright.config.ts`), phase docs.
**Files scanned:** ~60 candidates; đọc sâu 18 file; dừng khi có 3-5 analog mạnh/cluster (early stopping).
**Pattern extraction date:** 2026-11-21
**Lưu ý cho planner:** Số call site lệch (research đo 615 vs CONTEXT 633) — dùng grep guard làm nguồn truth, migrate theo bề mặt, không dựa số cố định (A1). Mọi khác biệt hành vi do chuẩn hóa style phải ghi vào plan (D-04).
