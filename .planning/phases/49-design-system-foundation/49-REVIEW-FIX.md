---
phase: 49-design-system-foundation
fixed_at: 2026-11-21T17:12:00Z
review_path: .planning/phases/49-design-system-foundation/49-REVIEW.md
iteration: 1
findings_in_scope: 9
fixed: 9
skipped: 0
status: all_fixed
---

# Phase 49: Code Review Fix Report

**Fixed at:** 2026-11-21T17:12:00Z
**Source review:** .planning/phases/49-design-system-foundation/49-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 9 (2 Critical, 5 Warning, 2 Info)
- Fixed: 9
- Skipped: 0

Verification applied to every fix: scoped Vitest (`--bail=1`), `tsc --noEmit`, `npm run lint`, and `npm run build` at the end. Final run: 62 scoped tests pass, tsc clean, lint clean, build green.

## Fixed Issues

### CR-01: Toggle theme không lan tới các consumer `useThemeMode` khác trong cùng cửa sổ

**Files modified:** `src/workbench/themeBroadcast.ts`, `src/hooks/__tests__/themeBroadcast.test.ts`
**Commit:** `5fb09d18`
**Applied fix:** Thêm `THEME_LOCAL_EVENT` (`taskmate:theme-mode-local`), dispatch `CustomEvent` trên `window` trong `broadcastThemeMode()`, và lắng nghe sự kiện này trong `subscribeToThemeBroadcast()` cạnh storage/Tauri (giữ nguyên receive path cho popout). Validation đi qua chung `isValidThemeModePayload`. Test mới render hai consumer trong cùng cửa sổ, toggle một cái và assert cái kia đổi.

### CR-02: Dời palette CSS khỏi `:root` làm nội dung portaled mất toàn bộ biến màu

**Files modified:** `src/styles/tokens.ts`, `src/workbench/__tests__/AntdThemeAdapter.test.tsx`
**Commit:** `ef738a1c`
**Applied fix:** `applyCssVariables()` giờ ghi palette + `colorScheme` lên cả wrapper lẫn `document.documentElement`, nên nội dung portaled vào `<body>` (Find dialog, Modal, Dropdown) kế thừa `--bg-island`, `--border-strong`, `--font-ui`, ... Test mới tạo phần tử trong `<body>` và assert `getComputedStyle()` thấy biến từ root.

### WR-01: `getStatusTokens` mặc định `mode='light'` ở icon / Popconfirm / Spin

**Files modified:** `src/components/ui/icon.tsx`, `src/components/ui/popconfirm.tsx`, `src/components/ui/spin.tsx`, `src/components/ui/__tests__/controls.test.tsx`
**Commit:** `b8e9d59a`
**Applied fix:** Cả ba wrapper gọi `useThemeMode()` và truyền `mode` vào `getStatusTokens(...)`. Test mới assert accent/danger hex đúng cho cả light lẫn dark trên Icon tone, Spin accent và Popconfirm danger tone.

### WR-02: Toàn bộ biến `--ui-*` là dead code — wrapper không đổi được giao diện

**Files modified:** `src/components/ui/ui-tokens.css` (mới), `src/components/ui/__tests__/uiTokens.test.ts` (mới), `src/workbench/WorkbenchLayout.tsx`
**Commits:** `536ecc61`, `17b8a10b`
**Applied fix:** Chọn phương án (b): giữ contract `--ui-*` nhưng thêm stylesheet tiêu thụ thật, scoped trong `.taskmate-workbench-theme` và import từ WorkbenchLayout. Mỗi wrapper-injected property (56 biến) có ít nhất một lời gọi `var()` trong CSS; dùng thuộc tính cascade không xung đột (`outline-offset`, `scroll-margin-block`, `column-gap`, `text-decoration-color`) để ConfigProvider vẫn là nguồn pixel duy nhất theo UI-SPEC. Test source↔CSS gate đảm bảo mọi biến injected đều có consumer. Rewrite CSS sau khi phát hiện LightningCSS minify từ chối fallback-chain quá sâu — bản cuối build green.

### WR-03: `Button` wrapper ghi đè `style` và `type` của caller

**Files modified:** `src/components/ui/button.tsx`, `src/components/ui/__tests__/button.test.tsx`
**Commit:** `d00ea940`
**Applied fix:** Destructure `style`, `type`, `danger` ra khỏi props; variant chỉ là default (`type ?? variantProps.type`, `danger ?? variantProps.danger`, `{ ...controlStyle(), ...style }`). Test mới render `<Button type="link" danger={false} style={{ padding: 0 }}>` và assert giữ `ant-btn-link`, không danger, padding 0, vẫn có token metric.

### WR-04: `Modal`/`Drawer` wrapper làm mất `mask={false}` và `maskClosable`

**Files modified:** `src/components/ui/modal.tsx`, `src/components/ui/drawer.tsx`, `src/components/ui/__tests__/controls.test.tsx`
**Commit:** `f7d88191`
**Applied fix:** Thêm `resolveMask()` trong modal.tsx: boolean `mask` được giữ nguyên (không bị ép thành object bật mask); object form nhận `maskClosable`/close policy làm default rồi caller key override. Cả Modal và Drawer forward `maskClosable`. Drawer truyền `width` thẳng (không map sai vào scale số). Test mới assert `.ant-modal-mask`/`.ant-drawer-mask` vắng khi `mask={false}` và raw CSS width (`calc(...)`) tới được AntD.

### WR-05: Nhiều test assertion vacuous / không kiểm tra điều chúng tuyên bố

**Files modified:** `src/workbench/__tests__/AntdThemeAdapter.test.tsx`, `src/components/ui/__tests__/antdInventory.test.ts`
**Commit:** `387ec6e9`
**Applied fix:** Thay `> 0` bằng giá trị compact thực tế đã đo (`fontSize === '10'`, `controlHeight === '26'` từ defaultAlgorithm + compactAlgorithm). Thay test "ownership" vô nghĩa bằng fixture thật: scan một root có `Button`/`Modal`/`SearchOutlined`, assert bucket đúng và `findMissingWrappers` giảm về `[]` sau khi thêm wrapper.

### IN-01: `npm run lint` tạo cảm giác guard toàn cục nhưng thực tế loại trừ gần như toàn bộ app

**Files modified:** `eslint.config.mjs`
**Commit:** `e21e90cb`
**Applied fix:** Bổ sung comment IN-01: `lint` là phase-scoped, không đọc là app-wide guard; Phase 50 phải thay bằng `eslint src` và bắt xanh trước phát hành.

### IN-02: Generator icon dùng regex tự củng cố và phụ thuộc `process.cwd()`

**Files modified:** `scripts/generate-icon-wrappers.mjs`
**Commit:** `465cd741`
**Applied fix:** `root` lấy từ `import.meta.url` thay vì `process.cwd()`; loại trừ `src/components/ui/icon.tsx` khỏi bước quét inventory; ghi chú inventory là snapshot cần review tay. Template generator cũng cập nhật để emit `useThemeMode()` + `getStatusTokens(tone, mode)` khớp WR-01.

## Skipped Issues

None — all 9 in-scope findings fixed.

---

_Fixed: 2026-11-21T17:12:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
