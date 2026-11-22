---
phase: 54-native-overlay-complex-controls
reviewed: 2026-11-22
depth: deep
diff_base: c5a8cdd2
files_reviewed: 61
critical: 0
warning: 0
info: 2
status: clean
---

# Phase 54: Deep Code Review — NAT-02 Native Overlay & Complex Controls (post-fix, post-migration)

**Phạm vi:** chỉ review source HIỆN TẠI sau các commit fix `e61e0bad`, `cbe2f79a`, `ab9f5073`, `629d1179` và migration `d28718a6` (+ docs `6a756bc0`, `9cf02f12`). Không review lại hand-rolled popup cũ. Đối chiếu `52-UI-SPEC.md` §7/§8/§9, `54-PATTERNS.md`, `54-REVIEW-FIX.md`.

**Kết luận:** W-01..W-05 đã được sửa đúng và Floating UI migration đúng hợp đồng. Tuy nhiên fix W-05 sinh ra **1 regression mới (W-06)**: `focusin` guard của `DialogSurface` kéo focus về dialog ngoài khi có dialog lồng nhau, làm keyboard user không thể tới nút của confirm mở từ trong Modal/Drawer. W-06 đã được sửa tại commit `1d1a276a` (topmost guard trong `onFocusIn` + test stacked-dialog 11/11 pass); sign-off `clean`.

## Kiểm chứng độc lập đã chạy lại

| Gate | Kết quả |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `node scripts/check-native-imports.mjs $(28 wrapper từ 54-PATTERNS.md §1)` | exit 0 |
| runtime `antd` / `@ant-design/icons` import trong 28 overlay wrapper | 0 |
| `scanWrappers()` / `findMissingWrappers()` | `257` / `[]` |
| `grep -c '^export const .* = wrapIcon(' src/components/ui/icon.tsx` | `141` |
| `find src/components/ui -maxdepth 1 -name '*.tsx' \| wc -l` | `56` |
| 6 overlay suite + `controls.test.tsx` + 4 migrated caller suite (11 file) | 140 test pass (stderr chỉ có `act(...)` warning cũ của `RemoteGitExplorer`, không phải lỗi Phase 54) |
| `npx playwright test e2e/phase54-overlay.spec.ts --project=chromium` | `3 passed (20.1s)` — light + dark + Floating UI smoke; `assertClean(errors)` = `[]` (chỉ có `console.warn` PanelGroup từ Vite webserver, không phải console.error/pageerror) |
| Full Vitest | không chạy theo memory rule |
| Working tree | chỉ có `54-REVIEW-FIX.md` untracked; không file probe còn sót lại |

---

## W-01..W-05 — xác nhận đã fix trong source hiện tại

| ID | Trạng thái | Bằng chứng trong source |
|---|---|---|
| W-01 | **FIXED** | `src/components/ui/modal.tsx:64-108` — `defaultFooter()` đọc `okButtonProps`/`cancelButtonProps` (`className`, `style`, `disabled`, `loading`, `danger`); `okLoading` khoá cả Cancel; `aria-busy` đúng. Test `overlayComposite.test.tsx:142-171` assert disabled/className/style và click không gọi handler. |
| W-02 | **FIXED** | `src/components/ui/modal.tsx:93-97` — `void Promise.resolve().then(() => config.onOk?.(...)).then(dismiss, () => {})`. Test `overlayComposite.test.tsx:173-218` có listener `unhandledrejection`, reject giữ dialog mở, resolve đóng dialog. |
| W-03 | **FIXED** | `src/components/ui/native/popup.tsx:18-32,36-49` — `preferredPlacement` + `preferredSide()` ánh xạ suffix AntD; 4 wrapper (`tooltip.tsx:87`, `popover.tsx:88`, `dropdown.tsx:128`, `popconfirm.tsx:141`) đều truyền `preferredSide(rest.placement)`. Test `overlayPopups.test.tsx:95-112` assert side `top`/`left` trước flip/shift. |
| W-04 | **FIXED** | `src/components/ui/popconfirm.tsx:113-147` — nhánh `DialogSurface`/`modalLike` đã xoá; mọi trạng thái `open` render chung một `Popup` với `control="popconfirm"`. Test `overlayPopups.test.tsx:254-286` assert hook, `position:fixed`, 4px bubble, `onConfirm`/`onCancel` trên controlled + description dài. |
| W-05 | **FIXED nhưng có side-effect — xem W-06** | `src/components/ui/native/dialog.tsx:147-159` có listener `focusin` + `focusGuardRef` + ngoại lệ popup BODY; test `overlayFoundation.test.tsx:59-73` assert focus không thoát ra shell. Cơ chế đúng cho 1 dialog, nhưng sai khi có ≥2 dialog mở (W-06). |

INFO-01 (prop leak `blockNode`/`block`) đã fix ở `ab9f5073`; stderr scoped test sạch lỗi prop leak. INFO-03..INFO-05 giữ nguyên theo `54-REVIEW-FIX.md`.

## Floating UI migration — đúng hợp đồng

`src/components/ui/native/popup.tsx` dùng `useFloating` với `placement`, `strategy:'fixed'`, `transform:false`, `elements.reference=anchorRef.current`, middleware `offset(4)` → `flip({padding:6, fallbackPlacements:[side đối diện]})` → `shift({padding:6})`, `whileElementsMounted: autoUpdate`, render `createPortal(..., document.body)`. Không còn `place()` hand-rolled hay hardcode `top/left`. API public (`open`, `anchorRef`, `onClose`, `className`, `children`, `label`, `control`) nguyên vẹn; `onCloseRef` giữ listener ổn định; Escape chỉ popup trong cùng (nested guard `popups[popups.length-1]`), outside `pointerdown` capture, focus restore về anchor. `data-floating`, `data-positioned`, `data-placement`, width theo anchor — đủ cho measurement hook Phase 57. E2E assert `position:fixed`, `left/top` có giá trị, `data-placement` match `^(bottom|top|left|right)`.

Dependency: `@floating-ui/react-dom@2.1.9` trong `package.json:32` — lib nhẹ đúng policy mới (chỉ cấm UI kit nặng), không có runtime AntD/@ant-design/icons mới. Không có issue từ dependency policy.

## Token contract §8 — KHÔNG regression

Câu hỏi: removal `getSharedControlTokens()` khỏi `select.tsx` có làm hỏng §8 không? **Không.**

- `src/components/ui/select.tsx:74` trước đây là `void getSharedControlTokens()` — no-op guard, không có side-effect.
- Source hiện tại vẫn áp token qua `controlStyle()` ở `select.tsx:239`: `renderedStyle = {...controlStyle(), ...controlWidthStyle(width), ...style}`, truyền vào `sharedTrigger.style` (`:248`). `controlStyle()` (`src/components/ui/input.tsx:26-34`) gọi `getSharedControlTokens()` và xuất đủ `--ui-control-height`, `--ui-control-radius`, `--ui-control-font-size`, `--ui-control-padding-inline`.
- `src/components/ui/date-picker.tsx:35` vẫn gọi trực tiếp `getSharedControlTokens()` cho 3 CSS var. `tokens.contract.ts:27-36` và `applyCssVariables()` (`src/styles/tokens.ts:364-375`) nguyên vẹn; portal BODY vẫn kế thừa token qua `document.documentElement`.
- `tests/helpers/antdInventory.ts:99` vẫn dùng token-helper detection để classify pass-through wrapper — không bị ảnh hưởng.

---

## W-06 (MỚI) — `focusin` guard kéo focus về dialog ngoài khi có dialog lồng nhau

**Severity:** warning (keyboard/accessibility regression; mouse + Escape vẫn chạy, không mất dữ liệu).
**Vị trí:** `src/components/ui/native/dialog.tsx:150-159` (`onFocusIn` trong effect của `DialogSurface`).

**Vấn đề:** mọi `DialogSurface` đang mở đều đăng ký một `focusin` listener riêng trên `document`. Khi dialog thứ hai mount và focus phần tử đầu của nó, listener của dialog thứ nhất cũng chạy: target không nằm trong dialog ngoài → guard ép focus ngược về dialog ngoài. Khác với nhánh Escape (`dialog.tsx:118-119`) đã có topmost guard `dialogs[dialogs.length-1] !== dialog`, `onFocusIn` **không có guard đó**, nên luôn có dialog ngoài "thắng".

**Reproduce (probe jsdom, so sánh với baseline `cbe2f79a^`):**

```
2 modal.confirm stacked cùng hook:
  baseline (trước W-05): activeElement nằm trong dialog trong  → title "Two"
  source hiện tại       : activeElement nằm trong dialog ngoài → title "One"
 fireEvent.keyDown(document, Tab) × 8 → focus luôn quay về "Đóng" của dialog ngoài,
   không bao giờ chạm "Hủy"/"OK2" của dialog trong (inner.contains(active) === false).
```

Mouse click trực tiếp vào OK của dialog trong vẫn gọi `onOk` (handler chạy độc lập focus), nhưng keyboard user bị kẹt trong dialog ngoài — vi phạm §9 "focus trap first↔last, không thoát ra shell" theo nghĩa focus không bao giờ vào surface đang mở trên cùng.

**Đường đi production thật:** `src/utils/documentLinks.tsx:195-216` → `promptLocalPathAction()` gọi `options.confirm` (`modal.confirm`) từ trong một Modal đã mở — cụ thể `src/components/changeRequests/ChangeRequestModal.tsx:391`, `src/components/tasks/TaskDrawer.tsx:829`, `src/components/tasks/TaskTable.tsx:481,483`. Ngoài ra `src/components/ai/AIChatDrawer.tsx` có nhiều `modal.confirm` có thể stacked. Đây không phải case giả tạo.

**Required fix:** thêm cùng topmost guard đã dùng ở Escape vào đầu `onFocusIn`:

```ts
const dialogs = document.querySelectorAll('[role="dialog"][data-oi-control][data-state="open"]');
if (dialogs.length > 0 && dialogs[dialogs.length - 1] !== dialog) return;
```

đặt trước logic `dialog.contains(target)`. Như vậy chỉ surface trên cùng giữ focus; dialog ngoài không còn giật focus về. Nên cân nhắc áp chung guard này cho cả nhánh `Tab` trong `onKeyDown` (`dialog.tsx:125-145`) để hai dialog cùng xử lý Tab không đẩy nhau —但目前 triệu chứng chính nằm ở `focusin`.

**Test bắt buộc:** trong `src/components/ui/__tests__/overlayFoundation.test.tsx`, render 2 `DialogSurface open` (hoặc 2 `modal.confirm` stacked), assert `document.activeElement.closest('[data-oi-control="dialog"]')` là dialog trong, và sau vài lần `fireEvent.keyDown(document, {key:'Tab'})` focus vẫn nằm trong dialog trong. Giữ nguyên test background-focus hiện tại để đảm bảo W-05 không tái phát.

## INFO-06 — `54-REVIEW-FIX.md` ghi nhận không khớp source

`54-REVIEW-FIX.md:23` nói đã xoá `void config` trong `config-provider.tsx`, nhưng source hiện tại `src/components/ui/config-provider.tsx:30-33` vẫn có `const config = withoutUndefined({ theme });` và `void config;`. Không ảnh hưởng runtime (`applyCssVariables()` ở `:34` vẫn chạy, token vào `documentElement`), nhưng báo cáo fix cần đính chính. Thêm vào đó §7 dòng 299 ghi `config-provider` "gọi token helper" — no-op `void getSharedControlTokens()` đã bị xoá ở `629d1179`; đây là literal contract detail, không phải lỗi vì `applyCssVariables()` đã đẩy token thật. Không bắt buộc sửa code.

## INFO-07 — placement suffix bị rút gọn về `-start`

`preferredSide()` (`popup.tsx:25-32`) ánh xạ `topLeft`/`topRight` → `top`, rồi `requestedPlacement = "<side>-start"`. Side đúng theo yêu cầu W-03, nhưng alignment `Right` của AntD (`bottomRight` ở `TaskTable.tsx:963`, `DocFolderTree.tsx:494,651,905`, …) không được giữ — popup luôn căn trái anchor. Không nằm trong W-03 (chỉ yêu cầu side), nhưng nếu Phase 57 đo alignment thì cần map suffix sang `bottom-end` tương ứng. Không blocking Phase 54.

## Required Fix Order

1. **W-06** — `src/components/ui/native/dialog.tsx`: topmost guard trong `onFocusIn` (+ cân nhắc nhánh Tab). Test trong `overlayFoundation.test.tsx`. Đây là regression trực tiếp từ fix W-05, ưu tiên trước khi sign-off.
2. **INFO-06** — đính chính `54-REVIEW-FIX.md` cho đúng source (không bắt buộc đổi code).
3. **INFO-07** — để Phase 57 xử lý cùng lúc đo alignment; không đổi ở Phase 54.

Sau wave sửa, chạy lại: `npx tsc --noEmit`, 11 file scoped Vitest ở bảng trên, guard 28 wrapper, `scanWrappers()=257`/`ICONS=141`/`wrapper_files=56`, và `npx playwright test e2e/phase54-overlay.spec.ts --project=chromium`. Không chạy full Vitest. Không commit trong review này.

## Sign-off

Đã `clean`: W-06 từng là regression keyboard-focus có đường đi production thật, sinh ra bởi cố gắng sửa W-05. W-01..W-05, Floating UI migration, token contract §8, counter 257/141/56, import guard và 3 e2e Chrome test đều đã xanh. W-06 đã fix + test từ `overlayFoundation.test.tsx` (11/11), lint/tsc xanh; NAT-02 hoàn tất.
