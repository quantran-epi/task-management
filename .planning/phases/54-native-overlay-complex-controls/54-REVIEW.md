---
phase: 54-native-overlay-complex-controls
reviewed: 2026-11-22
depth: deep
diff_base: c5a8cdd2
files_reviewed: 48
critical: 0
warning: 5
info: 5
status: needs-fix
---

# Phase 54: Deep Code Review — NAT-02 Native Overlay & Complex Controls

**Phạm vi:** 48 file theo `/tmp/review54-files.txt`, diff `c5a8cdd2..HEAD`, đối chiếu `52-UI-SPEC.md` §7/§8/§9, `54-PATTERNS.md`, `54-VERIFICATION.md`.
**Kết luận:** Gate tự báo `PASSED` là có thật ở mức đo đã chạy, nhưng có 5 warning vi phạm đúng hợp đồng §7 (props/event/popup/focus) cần sửa trước khi coi phase `clean`. Không có critical: không credential, không network/backend mới, không phá export guard, license OpenIDEA nguyên vẹn.

## Kiểm chứng độc lập đã chạy

| Gate | Kết quả |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `node scripts/check-native-imports.mjs $(28 file từ 54-PATTERNS.md §1)` | exit 0 |
| `scanWrappers()` / `findMissingWrappers()` | `257` / `[]` |
| `grep -c '^export const .* = wrapIcon(' src/components/ui/icon.tsx` | `141` |
| `find src/components/ui -maxdepth 1 -name '*.tsx' \| wc -l` | `56` |
| 6 overlay suites + `controls.test.tsx` + 4 migrated caller suites | pass khi chạy lẻ từng file (tổng 182 test như báo cáo) |
| `npx playwright test e2e/phase54-overlay.spec.ts --project=chromium --reporter=list` | `2 passed (18.5s)`, light + dark, 0 console.error/pageerror |
| `npx vitest run src/components/agents/__tests__/AgentDiffReviewer.test.tsx` | pass, nhưng stderr có React warning prop leak (xem INFO-01) |

Không chạy full Vitest suite theo memory rule.

---

## W-01 — Modal footer bỏ `okButtonProps` / `cancelButtonProps` (API regression, đã xác nhận bằng probe)

**Vị trí:** `src/components/ui/modal.tsx:64-95`, `src/components/ui/modal.tsx:118-146`.

`defaultFooter()` chỉ đọc `cancelText`, `okText`, `okType`, `okButtonProps?.danger` qua `okDanger()`. Các field còn lại của `okButtonProps` (`disabled`, `loading`, `style`, `className`) và toàn bộ `cancelButtonProps` bị bỏ. Hệ quả thực tế:

- `src/components/settings/ImportPreviewModal.tsx:229-233` truyền `disabled: confirmText !== 'RESTORE' || !validationResult.valid` và `loading`. Nút "Xác nhận khôi phục" vẫn sáng/click được trước khi gõ đúng `RESTORE`; `onOk` có guard nên chưa mất dữ liệu, nhưng đúng là vi phạm §7.1 "props preserved / default policy unchanged" và làm sai UX của luồng xác nhận sao lưu.
- `src/components/settings/ImportProfilePreviewModal.tsx:180` truyền `disabled`, `loading`; bị bỏ tương tự.
- Nhiều caller dùng `okButtonProps={{ danger: true }}` với footer mặc định chỉ được màu danger nhờ `okDanger()`, mất mọi thuộc tính khác.

Probe trực tiếp (render `<Modal open okButtonProps={{ disabled: true, loading: true }} />`) cho `<button ...>OK</button>` với `disabled=false`, không có `aria-busy`.

**Required fix:** trong `defaultFooter(config, dismiss)`, tạo `okButtonProps`/`cancelButtonProps` từ config, spread `className`, `style`, `disabled`, `loading`, `danger` vào đúng button; khi `okButtonProps.loading === true` thì disabled cả OK lẫn Cancel theo semantics AntD; giữ `okDanger()` cho CSS class. Thêm focused test trong `src/components/ui/__tests__/overlayComposite.test.tsx`: assert `disabled`, `aria-busy`/loading class, click vào OK disabled không gọi `onOk`. Không đổi caller.

## W-02 — `onOk` reject sinh unhandled rejection trong confirm + footer mặc định

**Vị trí:** `src/components/ui/modal.tsx:84` (`void Promise.resolve(config.onOk?.(confirmEvent(event) as never)).then(dismiss);`) và `src/components/ui/modal.tsx:64-95` dùng chung cho declarative Modal.

`config.onOk?.()` được gọi trước `Promise.resolve`, nên synchronous throw thoát click handler; async reject không có rejection handler → `Uncaught (in promise)`. Probe với `modal.confirm({ onOk: async () => { throw new Error('reject'); } })` tái hiện lỗi reject không được xử lý. AntD giữ dialog mở khi `onOk` thất bại; native cũng cần giữ mở nhưng không được phát unhandled rejection — đây là rủi ro trực tiếp cho criterion 5 (zero console error) trong UAT thực tế.

**Required fix:** đổi thành `void Promise.resolve().then(() => config.onOk?.(confirmEvent(event) as never)).then(dismiss, () => { /* giữ dialog mở, caller tự notification */ });` (hoặc tương đương có `catch`). Thêm test: reject async → dialog vẫn còn, listener `unhandledrejection` không nhận event; resolve → dialog đóng.

## W-03 — Tooltip/Popover/Dropdown/Popconfirm bỏ hoàn toàn prop `placement`

**Vị trí:** `src/components/ui/native/popup.tsx:28-47` (`place()` chỉ tính below/above + shift), `src/components/ui/tooltip.tsx:31`, `src/components/ui/popover.tsx:25`, `src/components/ui/dropdown.tsx:42`, `src/components/ui/popconfirm.tsx:41`.

Các wrapper nhận `AntTooltipProps`/`AntPopoverProps`/`AntDropdownProps`/`AntPopconfirmProps` (có `placement`) nhưng không đọc `rest.placement`; mọi popup luôn mở bên dưới anchor, chỉ flip khi hết chỗ. App có caller thật: `src/components/tasks/TaskTable.tsx:403,428` (`placement="top"`), `src/components/ai/office/DiffHunkView.tsx:215,330,389` (`placement="left"`), `src/components/tasks/TaskTable.tsx:963`, `src/components/ai/ActiveAiTurnIndicator.tsx:289` (`bottomRight`), `src/components/notes/DocFolderTree.tsx:494,651,905`. Đây là regression props so với §7.1 và khác vị trí AntD trước Phase 54; flip/shift không thay thế được preferred side.

**Required fix:** mở rộng `PopupProps` với optional `preferredPlacement` (internal hook, không thêm prop public), đưa vào `place()` để chọn side theo `top/left/right/bottom` trước khi flip/shift. Truyền `rest.placement` từ 4 wrapper. Thêm focused test trong `overlayPopups.test.tsx`: `placement="top"` cho `top + height <= anchor.top - 4` khi đủ chỗ; `placement="left"` cho `right <= anchor.left - 4`; vẫn giữ test flip/shift hiện tại.

## W-04 — Popconfirm controlled có `description` đổi thành dialog, mất hook đo và popup 4px

**Vị trí:** `src/components/ui/popconfirm.tsx:113-162`, đặc biệt `const modalLike = controlledOpen !== undefined && descriptionNode !== undefined;` và nhánh `DialogSurface`.

`AgentSessionList.tsx:271-299` dùng controlled `open` + `description` dài. Trong nhánh `modalLike`, portal render `[data-oi-control="dialog"]`; `[data-oi-control="popconfirm"]` chỉ tồn tại trong nhánh `Popup`, nên measurement hook mất đúng surface mà caller đó dùng. Nó cũng đổi hoàn toàn hành vi định vị (4px anchored bubble → centered dialog) chỉ vì prop `open` được truyền, không phải vì caller yêu cầu. §7.2 #32 giữ `AntPopconfirmProps` nguyên vẹn; §9/§10 yêu cầu popup 4px và hook ổn định cho Phase 57.

**Required fix:** giữ một `Popup` cho mọi trạng thái `open` của Popconfirm, luôn render `data-oi-control="popconfirm"` trên portal; nếu cần biến thể nội dung dài, dùng class/chính sách nội bộ nhưng không đổi loại surface dựa trên controlled/uncontrolled. Thêm test controlled+description assert `body > [data-positioned][data-oi-control="popconfirm"]` và `position:fixed`, `onCancel` khi Escape/outside, `onConfirm` khi OK. Xoá nhánh `DialogSurface` nếu không còn lý do contract.

## W-05 — Focus trap chỉ chặn phím Tab, focus có thể thoát dialog bằng click

**Vị trí:** `src/components/ui/native/dialog.tsx:106-148`.

Effect chỉ đăng ký `keydown` và xử lý `Tab`/`Shift+Tab` + `Escape`. Không có `focusin` guard: khi dialog đang mở, click vào button ở shell (hoặc `element.focus()` từ code khác) chuyển `document.activeElement` ra ngoài `[data-oi-control="dialog"]` mà không bị kéo về. §9 ghi "focus trap first↔last, không thoát ra shell" và criterion 3 của ROADMAP là focus trap cho Dialog/Modal/Drawer; Chrome spec hiện chỉ assert `Shift+Tab` nên không phát hiện.

**Required fix:** trong cùng effect, thêm listener `focusin` trên `document`: nếu target nằm ngoài `dialog` và không nằm trong popup BODY đang mở (`[role="dialog"][data-positioned]`) thì `event.preventDefault()` + focus phần tử focusable đầu tiên (hoặc `dialog`). Giữ điều kiện `open`/`closable` và cleanup như hiện tại. Thêm test `overlayFoundation.test.tsx`: tạo background button, focus nó trong lúc dialog mở, assert `document.activeElement.closest('[data-oi-control="dialog"]') !== null`.

---

## INFO-01 — Prop leak `blockNode` từ caller Tree (đã xuất hiện trong stderr test)

`src/components/agents/AgentDiffReviewer.tsx:644` truyền `blockNode`; `src/components/ui/tree.tsx:107` đưa `...rest` vào DOM nên React in `Received true for a non-boolean attribute 'block'`. Test vẫn pass vì warning là stderr, nhưng đây đúng dạng prop leak mà 54-07 đã sửa ở nơi khác. Consume `blockNode` (và `virtual`, `height` nếu không dùng) trong Tree wrapper bằng allowlist kiểu `domProps()`, hoặc bỏ prop ở caller nếu đã vô nghĩa với native tree.

## INFO-02 — Dead no-op giữ import type-only

`src/components/ui/select.tsx:74` (`void getSharedControlTokens()`), `src/components/ui/date-picker.tsx:257` (`void withoutUndefined`), `src/components/ui/config-provider.tsx:33-34` (`void config; void getSharedControlTokens()`). Không gây lỗi, nhưng là code chết sinh ra chỉ để qua guard; xoá cùng import nếu không còn dùng. Không đổi hành vi.

## INFO-03 — Một assertions migrated bị thu hẹp phạm vi

`src/components/agents/__tests__/AgentDiffReviewer.test.tsx:101-105` đổi `css.slice(start)` thành `css.slice(start, css.indexOf('/* Utility tool editor', start))`. Lý do (tránh rule utility khác) hợp lệ, nhưng rõ ràng là giảm số dòng được kiểm tra. Giữ nguyên được nếu kèm comment giải thích đã có; khi review sau cần nhớ đây không còn là assert toàn block `.agent-diff-tree`. Không phải weakened assertion ở mức behavior.

## INFO-04 — Notification giữ `placement` trong payload nhưng holder luôn topRight

`src/components/ui/notification.tsx:44,68,165-174` lưu `placement` nhưng style holder cố định `right:16`. Không có caller app truyền `placement`, nên không blocking; nếu Phase 55 có caller, cần map `topLeft/topRight/bottomLeft/bottomRight` ở holder thay vì chỉ đọc field.

## INFO-05 — Một số asserting test mới phụ thuộc DOM bootstrap hơn contract

`e2e/phase54-overlay.spec.ts` chạy đúng 2 theme và assert 0 error, nhưng phần dialog (d)-(e) mở CR Modal rồi đóng bằng Escape trước khi mở lại; nếu luồng CR thay đổi trigger, test sẽ fail giả tạo. Giữ nguyên hiện tại; khi Phase 57 thêm route sweep, chuyển sang helper mở dialog dùng chung để tránh duplication.

---

## Required Fix Order

1. **W-01 + W-02** — `src/components/ui/modal.tsx`: phục hồi footer props và xử lý reject `onOk`. Add test trong `overlayComposite.test.tsx`. Đây là surface xác nhận importing/rollback; ưu tiên trước vì liên quan data-safety UX.
2. **W-03 + W-04** — `src/components/ui/native/popup.tsx` và 4 wrapper popup: preferred placement + Popconfirm controlled; add test trong `overlayPopups.test.tsx`. Giữ nguyên offset 4/flip/shift và BODY portal.
3. **W-05** — `src/components/ui/native/dialog.tsx`: focusin guard + test trong `overlayFoundation.test.tsx`.
4. **INFO-01..INFO-05** — dọn prop leak/dead code/ghi chú test. Không bắt buộc cho NAT-02 nhưng nên xử lý trong cùng wave sửa để tránh phase sau tái phát hiện.

Sau mỗi wave, chạy lại: `npx tsc --noEmit`, 6 overlay suite + `controls.test.tsx` + 4 migrated caller suite, `node scripts/check-native-imports.mjs $(28 wrapper)`, `scanWrappers()=257`, `ICONS=141`, `wrapper_files=56`, và `npx playwright test e2e/phase54-overlay.spec.ts --project=chromium`. Không chạy full Vitest. Không commit trong review này.

## Sign-off

Chưa thể sign-off `clean`: gate hiện tại xanh nhưng 5 warning ở đúng hợp đồng §7/§9. Sau khi sửa theo thứ tự trên và re-verify, cần re-review các file `modal.tsx`, `popup.tsx`, `popconfirm.tsx`, `dialog.tsx` và test mới trước khi đánh dấu NAT-02 hoàn tất.
