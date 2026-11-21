---
phase: 49-design-system-foundation
reviewed: 2026-11-21T17:20:00Z
depth: standard
files_reviewed: 20
files_reviewed_list:
  - src/workbench/themeBroadcast.ts
  - src/hooks/useThemeMode.ts
  - src/hooks/__tests__/themeBroadcast.test.ts
  - src/workbench/AntdThemeAdapter.tsx
  - src/styles/tokens.ts
  - src/styles/workbench-tokens.css
  - src/workbench/__tests__/AntdThemeAdapter.test.tsx
  - src/components/ui/button.tsx
  - src/components/ui/modal.tsx
  - src/components/ui/drawer.tsx
  - src/components/ui/icon.tsx
  - src/components/ui/popconfirm.tsx
  - src/components/ui/spin.tsx
  - src/components/ui/tokens.contract.ts
  - src/components/ui/ui-tokens.css
  - src/components/ui/__tests__/controls.test.tsx
  - src/components/ui/__tests__/button.test.tsx
  - src/components/ui/__tests__/antdInventory.test.ts
  - src/components/ui/__tests__/uiTokens.test.ts
  - scripts/generate-icon-wrappers.mjs
verdict: all_9_confirmed_no_new_critical_or_warning
findings:
  critical: 0
  warning: 0
  info: 3
  total: 3
status: clean
---

# Phase 49: Re-Review Verdict

**Reviewed:** 2026-11-21T17:20:00Z
**Depth:** standard
**Status:** clean (fix verified; remaining items are INFO/caveats, không blocking)

## Summary

Đọc code thật, không tin narrative `49-REVIEW-FIX.md`. Chạy lại: 47 scoped Vitest pass, `npm run lint` clean, `npm run build` green (tsc + lightningcss).

**Kết luận: cả 9 finding (2 CR, 5 WR, 2 IN) đều resolved thật trong code. Không tìm thấy bug critical/warning mới do các fix sinh ra.** Một số chỗ narrative fix không khớp implementation (xem INFO), nhưng behavior đúng và có test chứng minh.

## Verification từng finding

### CR-01 — toggle lan tới consumer cùng cửa sổ: RESOLVED
`src/workbench/themeBroadcast.ts:38-40` dispatch `THEME_LOCAL_EVENT` trên `window` trước kênh IPC/storage; `:66` đăng ký listener; `src/hooks/useThemeMode.ts:64` gọi broadcast trong `setMode`. Payload đi qua `isValidThemeModePayload` nên không có injection. `AntdThemeAdapter` dùng `useThemeMode` → re-render → cập nhật `data-theme`, ConfigProvider theme, CSS vars. Test `propagates a toggle to every consumer in the same window` (themeBroadcast.test.ts:153-168) render 2 consumer, toggle 1, assert cái kia đổi cả 2 chiều. Đã chạy pass.

### CR-02 — portaled content kế thừa token: RESOLVED
`src/styles/tokens.ts:318-325` `applyCssVariables` ghi mọi biến + `colorScheme` lên **cả** `target` lẫn `document.documentElement`. Test AntdThemeAdapter.test.tsx:91-104 tạo div trong `<body>` và assert `getComputedStyle()` thấy `--bg-island`/`--border-strong`/`--font-ui` từ root. Đã chạy pass.

### WR-01 — status token theo mode: RESOLVED
3 call site giờ truyền `mode`: icon.tsx:176, popconfirm.tsx:22, spin.tsx:12. Rà toàn bộ 8 call site `getStatusTokens` — tất cả đều truyền mode. Test controls.test.tsx:171-197 assert hex đúng cho cả light/dark. Đã chạy pass.

### WR-02 — `--ui-*` có consumer thật: RESOLVED
`src/components/ui/ui-tokens.css` (mới) có 57 lời gọi `var(--ui-...)`, import từ `WorkbenchLayout.tsx:39`. Gate test uiTokens.test.ts quét mọi property wrapper inject và assert không có property nào thiếu `var()` consumer. Build green. Xem INFO-01 về bản chất "consumer" của contract này.

### WR-03 — caller props win trong Button: RESOLVED
button.tsx:35-43 destructure `style`/`type`/`danger`; dùng `type ?? variantProps.type`, `danger ?? variantProps.danger`, `{ ...controlStyle(), ...style }`. Test button.test.tsx:22-29 assert giữ `ant-btn-link`, không danger, `padding: 0px`. Đã chạy pass.

### WR-04 — `mask={false}` honored: RESOLVED (caveat ở INFO-02)
`resolveMask()` (modal.tsx:25-32) giữ nguyên boolean `mask`, object form lấy close policy làm default rồi caller override; cả Modal và Drawer forward `maskClosable`. Test controls.test.tsx:91-97 assert vắng `.ant-modal-mask`/`.ant-drawer-mask`. Đã chạy pass.

### WR-05 — assertion không còn vacuous: RESOLVED
AntdThemeAdapter.test.tsx:47-48 thay `> 0` bằng `fontSize === '10'`, `controlHeight === '26'`. antdInventory.test.ts:89-103 thay test "ownership" vô nghĩa bằng fixture thật scan `Button`/`Modal`/`SearchOutlined`, rồi assert `findMissingWrappers` về `[]`. Cả hai đều chạy pass.

### IN-01 — lint phase-scoped: RESOLVED
`eslint.config.mjs:10-13` comment rõ `lint` là phase-scoped, Phase 50 phải promote `eslint src`. Đúng thực tế: `npm run lint` scope hẹp như comment mô tả.

### IN-02 — generator cứng: RESOLVED
`scripts/generate-icon-wrappers.mjs:8` lấy root từ `import.meta.url`; `:31` loại trừ `icon.tsx` khỏi inventory scan; `:28-30` comment snapshot review tay; template emit `useThemeMode()` + `getStatusTokens(tone, mode)` (`:46-47,71,76`) khớp WR-01.

## Bug mới từ các fix

Không có bug critical/warning mới. Đã kiểm tra thêm:
- `getStatusTokens(kind, mode = 'light')` vẫn giữ default, nhưng toàn bộ 8 call site truyền mode tường minh → không còn đường nào rơi vào light mặc định.
- CustomEvent local dispatch không gây double-apply: `setItem` không firing `storage` event trong chính document, nên mỗi toggle chỉ deliver 1 lần/hook.
- `resolveMask` trả boolean đúng kiểu AntD (`MaskType = MaskConfig | boolean`, kiểm tra trong `node_modules/antd/es/_util/hooks/useMergedMask.d.ts`).

## Info

### IN-R01: contract `--ui-*` "được tiêu thụ" nhưng visually inert
`src/components/ui/ui-tokens.css:8-75` chọn các thuộc tính cascade (`outline-offset`, `scroll-margin-block`, `column-gap`, `text-decoration-color`, `border-*-radius`) cố tình không va chạm AntD, theo UI-SPEC để ConfigProvider là nguồn pixel duy nhất. Vì vậy WR-02 được fix đúng chữ ("có consumer CSS") nhưng wrapper vẫn không đổi được giao diện qua `--ui-*`. Đây là tradeoff có chủ đích, có ghi trong comment — chấp nhận được, chỉ cần Phase 50 không hiểu nhầm contract này là "visual override". Nếu muốn contract có tác dụng thật, phải đổi mục tiêu UI-SPEC.

### IN-R02: narrative WR-04 về Drawer width không khớp code
`49-REVIEW-FIX.md:61` ghi "Drawer truyền `width` thẳng (không map sai vào scale số)", nhưng `src/components/ui/drawer.tsx:27` vẫn là `size={width ?? getOverlayWidth(widthScale)}`. Behavior vẫn đúng: AntD `size?: sizeType | number | string`, rc-drawer `parseWidthHeight()` pass-through mọi string không phải số (`calc(...)`, `min(...)`); test controls.test.tsx:99-106 assert raw CSS width tới `.ant-drawer-content-wrapper.style.width` và pass. Nên sửa lại narrative fix report cho khớp code để tránh hiểu nhầm sau này.

### IN-R03: chưa có test integrated toggle TitleBar → `data-theme`
CR-01 được chứng minh qua cơ chế (local event fan-out tới mọi `useThemeMode`) + riêng lẻ adapter đổi `data-theme` khi nhận mode. Chưa có 1 test duy nhất bấm toggle rồi assert `documentElement`/wrapper `data-theme` đổi. Chain đúng về mặt logic, nhưng thêm 1 integrated test sẽ khóa chặt CR-01 (đề xuất Phase 50).

---

_Reviewed: 2026-11-21T17:20:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
