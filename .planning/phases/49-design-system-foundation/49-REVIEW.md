---
phase: 49-design-system-foundation
reviewed: 2026-11-21T09:44:46Z
depth: standard
files_reviewed: 63
files_reviewed_list:
  - eslint.config.mjs
  - package.json
  - vite.config.ts
  - tsconfig.json
  - scripts/generate-icon-wrappers.mjs
  - src/main.tsx
  - src/AppIntelliJ.tsx
  - src/styles/tokens.ts
  - src/styles/workbench-tokens.css
  - src/hooks/useThemeMode.ts
  - src/hooks/__tests__/themeBroadcast.test.ts
  - src/workbench/AntdThemeAdapter.tsx
  - src/workbench/TitleBar.tsx
  - src/workbench/themeBroadcast.ts
  - src/workbench/__tests__/AntdThemeAdapter.test.tsx
  - src/workbench/__tests__/mainBoot.test.ts
  - src/workbench/__tests__/shellRemoval.test.ts
  - src/workbench/search/find/parts.tsx
  - src/workbench/search/find/find.css
  - src/workbench/search/find/__tests__/visualTokens.test.tsx
  - tests/helpers/antdInventory.ts
  - tests/fixtures/guard/bad-import.tsx
  - tests/fixtures/guard/good-import.tsx
  - src/components/ui/index.ts
  - src/components/ui/tokens.contract.ts
  - src/components/ui/antdTheme.ts
  - src/components/ui/icon.tsx
  - src/components/ui/alert.tsx
  - src/components/ui/app.tsx
  - src/components/ui/auto-complete.tsx
  - src/components/ui/avatar.tsx
  - src/components/ui/badge.tsx
  - src/components/ui/breadcrumb.tsx
  - src/components/ui/button.tsx
  - src/components/ui/card.tsx
  - src/components/ui/checkbox.tsx
  - src/components/ui/collapse.tsx
  - src/components/ui/date-picker.tsx
  - src/components/ui/descriptions.tsx
  - src/components/ui/divider.tsx
  - src/components/ui/drawer.tsx
  - src/components/ui/dropdown.tsx
  - src/components/ui/empty.tsx
  - src/components/ui/form.tsx
  - src/components/ui/grid.tsx
  - src/components/ui/image.tsx
  - src/components/ui/input.tsx
  - src/components/ui/input-number.tsx
  - src/components/ui/layout.tsx
  - src/components/ui/list.tsx
  - src/components/ui/mentions.tsx
  - src/components/ui/menu.tsx
  - src/components/ui/message.tsx
  - src/components/ui/modal.tsx
  - src/components/ui/notification.tsx
  - src/components/ui/pagination.tsx
  - src/components/ui/popconfirm.tsx
  - src/components/ui/popover.tsx
  - src/components/ui/progress.tsx
findings:
  critical: 2
  warning: 5
  info: 2
  total: 9
status: issues_found
---

# Phase 49: Code Review Report

**Reviewed:** 2026-11-21T09:44:46Z
**Depth:** standard
**Files Reviewed:** 63
**Status:** issues_found

## Summary

Đã review nền tảng design system: theme broadcast, token single-source, ~60 UI wrapper, ESLint guard, shell deletion, và các test đi kèm. Kiến trúc token (tokens.ts làm nguồn đơn nhất) và guard locally-only nhìn chung đúng hướng, nhưng có **2 lỗi critical làm giao diện bị sai khi chạy thật**:

1. Nút đổi theme trong TitleBar không cập nhật `AntdThemeAdapter` cùng cửa sổ — toàn bộ app không đổi theme khi bấm toggle.
2. Palette CSS bị dời từ `:root` vào một `<div>` nội bộ — mọi nội dung portaled (Find dialog, dropdown, modal tùy biến) mất sạch biến màu.

Ngoài ra có 5 warning (status color sai chế độ tối, lớp `--ui-*` chết, wrapper Button/M Modal/Drawer làm mất prop của caller, test assertions vacuous) và 2 info. Các test hiện tại không bắt được 2 lỗi critical vì chỉ test luồng receive giả lập, không test hai consumer trong cùng một cửa sổ.

## Critical Issues

### CR-01: Toggle theme không lan tới các consumer `useThemeMode` khác trong cùng cửa sổ

**File:** `src/hooks/useThemeMode.ts:55-65`, `src/workbench/themeBroadcast.ts:33-42`, `src/workbench/TitleBar.tsx:42,322`

**Issue:** Mỗi lần gọi `useThemeMode()` tạo một `useState` riêng. Không có store/context dùng chung. Đồng bộ duy nhất là `subscribeToThemeBroadcast()`, nhưng:
- `broadcastThemeMode()` ghi `localStorage.setItem()`. Sự kiện `storage` **không bao giờ firing trong chính document đã ghi** (chỉ các document/tab khác cùng origin). Nên `AntdThemeAdapter` trong cùng cửa sổ không nhận được.
- `emitTo()` chỉ nhắm vào 4 popout label (`POPOUT_LABELS`); cửa sổ chính không nằm trong danh sách, nên `listen()` ở cửa sổ chính cũng không nhận.

Hệ quả: bấm nút toggle ở TitleBar (`onClick={toggle}`) chỉ đổi state cục bộ của riêng TitleBar (icon flip), còn `AntdThemeAdapter` — nơi quyết định `ConfigProvider theme`, `data-theme`, và CSS vars — **giữ nguyên**. Theme của toàn workbench không đổi. Lỗi dính cả Tauri lẫn browser. OS preference vẫn chạy vì mỗi hook đăng ký `matchMedia` riêng, che giấu lỗi này.

**Fix:** Dùng một nguồn state dùng chung trong cùng cửa sổ. Tối thiểu: phát thêm một `CustomEvent` trên `window` khi `setMode` và lắng nghe nó trong `subscribeToThemeBroadcast` (bổ sung cho storage/IPC):

```ts
// themeBroadcast.ts
export const THEME_LOCAL_EVENT = 'taskmate:theme-mode-local';

export function broadcastThemeMode(mode: ThemeMode): void {
  if (!isValidThemeMode(mode)) return;
  window.dispatchEvent(new CustomEvent(THEME_LOCAL_EVENT, { detail: { mode } }));
  // ...giữ nguyên emitTo + localStorage cho các cửa sổ khác
}

export function subscribeToThemeBroadcast(onMode) {
  // ...
  const onLocal = (e: Event) => deliver((e as CustomEvent).detail);
  window.addEventListener(THEME_LOCAL_EVENT, onLocal);
  return () => { /* ... */ window.removeEventListener(THEME_LOCAL_EVENT, onLocal); };
}
```

Cách sạch hơn: đưa `mode` vào một context/zustand store duy nhất và để mọi consumer đọc từ đó; broadcast chỉ còn là tác dụng phụ cho popout. Cần thêm test render **hai** `useThemeMode` trong cùng cửa sổ, toggle một cái,assert cái kia đổi.

### CR-02: Dời palette CSS khỏi `:root` làm nội dung portaled mất toàn bộ biến màu

**File:** `src/styles/workbench-tokens.css:9-14`, `src/workbench/AntdThemeAdapter.tsx:14-16,20-22`, `src/workbench/search/find/find.css:12,16,21-23`

**Issue:** Bản gốc khai báo `--bg-island`, `--fg`, `--font-ui`, `--border-strong`, `--accent`, ... trên `:root`, `:root[data-theme="light"]`, `:root[data-theme="dark"]`. Bản mới xóa toàn bộ và chỉ inject qua `applyCssVariables(mode, wrapperRef.current)` lên `<div class="taskmate-workbench-theme">`.

AntD Modal/Drawer/Dropdown/Tooltip portaled vào `document.body` — **ngoài** div đó. `find.css` (`.find-dialog-frame`, dùng `modalRender` nhưng vẫn portal ra body) đọc các biến không có fallback: `border: 1px solid var(--border-strong)`, `background: var(--bg-island)`, `color: var(--fg)`, `font-family: var(--font-ui)`. Không còn định nghĩa trên `:root` → các thuộc tính này thành `unset`/inherited sai → dialog Find mất nền, mất viền, mất màu chữ, sai font. Tương tự cho bất kỳ class app nào được render trong portal. `colorScheme` cũng chỉ set trên div, mất scrollbar/native dark.

**Fix:** Giữ palette trên `:root` làm nền tảng (như bản gốc), rồi để `applyCssVariables` ghi đè lên wrapper cho trường hợp cần scope — tốt nhất ghi cả lên `document.documentElement`:

```ts
export function applyCssVariables(mode: ThemeMode, target: HTMLElement): void {
  const tokens = mode === 'dark' ? darkTokens : lightTokens;
  for (const [name, value] of Object.entries(tokens.css)) {
    document.documentElement.style.setProperty(name, value); // phủ cả portal
    target.style.setProperty(name, value);
  }
  document.documentElement.style.colorScheme = mode;
  target.style.colorScheme = mode;
}
```

Hoặc khôi phục các khai báo `:root`/`:root[data-theme=...]` trong `workbench-tokens.css` sinh ra từ `tokens.ts` (build-time), và chỉ dùng inline style để override theo mode. Cần test render Find dialog dạng portal rồi assert computed-style/attr có `--bg-island`.

## Warnings

### WR-01: `getStatusTokens` mặc định `mode='light'` ở icon / Popconfirm / Spin

**File:** `src/components/ui/icon.tsx:174`, `src/components/ui/popconfirm.tsx:699`, `src/components/ui/spin.tsx:954`

**Issue:** Ba nơi gọi `getStatusTokens(...)` không truyền `mode`, nên luôn lấy palette sáng. Các wrapper khác (`tag`, `badge`, `status-dot`, `alert`, `progress`) đều truyền `mode` đúng. Hệ quả: `tone` trên icon và màu danger của Popconfirm dùng sai hex khi app ở chế độ tối (ví dụ accent tối phải `#6a9bff` nhưng vẫn ra `#2f62d8`). `getStatusTokens(kind, mode = 'light')` nên bắt buộc truyền mode thay vì mặc định.

**Fix:** Thêm `useThemeMode()` vào ba wrapper này và truyền `mode`, hoặc đổi chữ ký `getStatusTokens(kind, mode)` thành bắt buộc để TypeScript ép các call site sửa. Ví dụ icon:

```tsx
const PolicyIcon = ({ size, tone, style, ...rest }) => {
  const { mode } = useThemeMode();
  // ...
  ...(tone ? { color: getStatusTokens(tone, mode) } : {}),
};
```

### WR-02: Toàn bộ biến `--ui-*` là dead code — wrapper không đổi được giao diện

**File:** `src/components/ui/*.tsx` (~50 file), ví dụ `button.tsx:24-32`, `table.tsx:14-22`, `tag.tsx:1110-1118`

**Issue:** Mỗi wrapper inject các custom property như `--ui-control-height`, `--ui-control-font-size`, `--ui-table-padding`, `--ui-status-color`. Nhưng rà soát toàn bộ `src` (cả 5 file CSS) cho thấy **không có một lần nào dùng `var(--ui-...)`**. Các thuộc tính này không bao giờ được tiêu thụ → lớp wrapper về mặt thị giác chỉ pass-through props; "policy" metrics/status color không có hiệu lực thật. Kích thước/màu thật đến từ `getAntdTheme()` (ConfigProvider) và các biến workbench (`--fg`, v.v.). Đây là token-drift tiềm ẩn: người đọc tưởng wrapper áp policy nhưng thực tế không.

**Fix:** Chọn một: (a) xóa các inline `--ui-*` vô dụng, để ConfigProvider + workbench CSS làm nguồn duy nhất; hoặc (b) nếu giữ làm contract, phải có CSS thật tiêu thụ chúng (thêm rule trong `workbench-tokens.css`) và test assert computed style thay đổi. Đừng để cả hai nguồn tồn tại song song mà chỉ một nguồn có tác dụng.

### WR-03: `Button` wrapper ghi đè `style` và `type` của caller (ngược comment "caller props win")

**File:** `src/components/ui/button.tsx:34-39`

**Issue:** `const merged = withoutUndefined({ ...rest, type, danger, style: controlStyle() })` — `style` và `type` được set **sau** `...rest`, nên caller `style` bị drop hoàn toàn và caller `type="link"` bị ép thành `type` của variant (mặc định `'default'`). Comment dòng 34 nói "Caller props win" nhưng code làm ngược. Ví dụ thực tế trong app: `<Button style={{ padding: 0 }}>`, `<Button type="link" ...>`. Hiện wrapper chưa được adopt (caller vẫn import từ `antd`), nên lỗi còn ẩn — Phase 50 migrate sẽ vỡ hàng loạt.

**Fix:**

```tsx
export function Button({ variant = 'default', style, type, danger, ...rest }: ButtonProps) {
  const variantProps = VARIANT_PROPS[variant];
  const merged = withoutUndefined({
    ...rest,
    type: type ?? variantProps.type,
    danger: danger ?? variantProps.danger,
    style: { ...controlStyle(), ...style },
  });
  return <AntButton {...merged} />;
}
```

Thêm test render `<Button type="link" style={{ padding: 0 }}>` rồi assert giữ `ant-btn-link` và `padding: 0`.

### WR-04: `Modal`/`Drawer` wrapper làm mất `mask={false}` và `maskClosable`

**File:** `src/components/ui/modal.tsx:42-43`, `src/components/ui/drawer.tsx:347-348`

**Issue:** `mask={{ closable: ..., ...(typeof mask === 'object' ? mask : {}) }}` — nếu caller truyền `mask={false}` (boolean), giá trị bị bỏ qua, mask trở thành object `{ closable: true }` → AntD hiểu là mask bật (mặc định). `maskClosable` cũng không được xử lý. Drawer còn map `width` vào `size`, có thể sai với giá trị CSS như `"min(1240px, 94vw)"`. Các call site hiện dùng `mask={false}` (`AIDebugModal`, `FindInRemoteFiles`) vẫn import trực tiếp từ `antd` nên chưa dính; Phase 50 migrate sẽ mất mask-off.

**Fix:** Tôn trọng boolean:

```tsx
const resolvedMask = typeof mask === 'boolean' ? mask : { closable: closePolicy === 'closable', ...(mask ?? {}) };
// và truyền maskClosable={maskClosable ?? (closePolicy === 'closable')} nếu cần
```

Đổi Drawer để truyền `width` thẳng cho AntD thay vì gán vào `size`, trừ khi caller dùng `widthScale`.

### WR-05: Nhiều test assertion vacuous / không kiểm tra điều chúng tuyên bố

**File:** `src/workbench/__tests__/AntdThemeAdapter.test.tsx:46-47`, `src/components/ui/__tests__/antdInventory.test.ts:89-92`

**Issue:**
- `AntdThemeAdapter.test.tsx` comment nói "compactAlgorithm scales seed token values down", nhưng assertion chỉ `Number(...fontSize) > 0` và `> 0` cho controlHeight — đúng với mọi số dương, không chứng minh compact được áp dụng.
- `antdInventory.test.ts` "coverage gate ownership" assert `Object.keys(scanConsumedAntd('/nonexistent-src-root'))` — `walk()` trả `[]` cho path không tồn tại nên test chỉ kiểm tra shape object rỗng, tự thừa nhận "does not assert full-tree coverage". Đây là assertion vô nghĩa trong suite guard.

**Fix:** Thay bằng assert giá trị cụ thể đã scale (ví dụ `fontSize === 12` / `controlHeight === 24` theo compactAlgorithm thực tế, đọc từ kết quả thật), và xóa test "ownership" hoặc đổi thành test có fixture thật kiểm tra `scanConsumedAntd` trả đúng component trên một root hợp lệ.

## Info

### IN-01: `npm run lint` tạo cảm giác guard toàn cục nhưng thực tế loại trừ gần như toàn bộ app

**File:** `package.json:23-24`, `eslint.config.mjs:7-11`

**Issue:** Script `lint` chỉ quét `src/components/ui` + vài file nền tảng; ~248 file app import AntD trực tiếp nằm ngoài scope và chỉ `lint:adoption` (`eslint src`) mới bắt nhưng được thiết kế "EXPECTED RED". Điều này đã được comment rõ ràng nên không phải lỗi, nhưng dễ gây hiểu nhầm khi CI/chReview chỉ chạy `lint`.

**Fix:** Ghi rõ trong README/phase doc rằng `lint` là phase-scoped; trước khi phát hành Phase 50 phải chuyển `lint:adoption` thành `lint` và đảm bảo xanh.

### IN-02: Generator icon dùng regex tự củng cố và phụ thuộc `process.cwd()`

**File:** `scripts/generate-icon-wrappers.mjs:6,8,27`

**Issue:** `root = process.cwd()` nên chạy sai thư mục sẽ đọc sai; inventory quét cả `icon.tsx` đã generate và comment, nên regex `/<([A-Z]...)\b/` có thể giữ lại icon stale hoặc bỏ sót icon chỉ dùng qua alias import. Đây là công cụ một lần, không ảnh hưởng runtime.

**Fix:** Chạy script từ repo root (hoặc dùng `import.meta.url`), loại trừ `src/components/ui/icon.tsx` khỏi bước quét, và ghi chú inventory là snapshot cần review tay khi regenerate.

---

_Reviewed: 2026-11-21T09:44:46Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
