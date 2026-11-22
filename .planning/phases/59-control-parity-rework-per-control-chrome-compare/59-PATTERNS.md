# Phase 59 — PATTERNS: per-control Chrome parity protocol

Hợp đồng thực thi cho mọi plan control Phase 59. Mỗi dòng registry là MỘT control = MỘT task = MỘT human checkpoint. Không gộp control, không fix dồn.

## Quyết định sếp 2026-11-22 — human gate per control (HGC)

ID được viện dẫn trực tiếp trong `<action>` mọi control task để truy vết:

- **HGC-01**: MỖI control sau khi sửa phải có HUMAN CHECK riêng. Không tự đánh giá pass thay sếp; test/evidence nội bộ KHÔNG đủ để đi tiếp.
- **HGC-02**: Chuyển sang control kế chỉ khi sếp trả lời chữ `"pass"` cho control hiện tại. Không fix dồn, không handoff nhiều control cùng lúc.
- **HGC-03**: Nếu sếp trả lời không pass → sửa lại CHÍNH control đó, self-verify rồi re-handoff. Lặp tới khi sếp nói "pass".
- **HGC-04**: PAR-03/PAR-04 là human gate per-control: PAR-04 = sếp xác nhận từng control, không chỉ verifier máy; independent code review + verifier (HGC-06) là bước BẮT BUỘC trước handoff nhưng vẫn không được gán pass. (Orchestrator cập nhật ROADMAP/REQUIREMENTS.)
- **HGC-05**: TÔI (assistant) tự mở Chrome cho sếp. Sếp KHÔNG tự mở app, KHÔNG tự setup. Handoff = có tab Chrome đã mở sẵn đúng màn hình/control, light + dark, data dummy đủ để thao tác, kèm 2-3 bước test tiếng Việt ngắn. Cụ thể mỗi task handoff phải làm: **Open Chrome MCP page + seed/state + screenshot + short test steps → wait for sếp "pass"**. Sếp chỉ thao tác rồi trả lời "pass" hoặc mô tả lỗi.
- **HGC-06**: Trước handoff phải có code review + verifier ĐỘC LẬP (không phải executor của control đó), theo config `code_review:true` + `verifier:true` trong `.planning/config.json`. Independent reviewer/verifier kiểm tra diff + evidence + focused test, trả findings vào artifact; reviewer KHÔNG gán "pass". Chữ "pass" của sếp là **điều kiện DUY NHẤT** để sang control kế — review/gate máy chỉ chặn handoff khi phát hiện sai, không thay thế human gate. Config audit (`.planning/config.json`) là authority cho cơ chế review; tài liệu này là authority cho chuỗi handoff.

Chuỗi bắt buộc: `implement → self-verify → independent code review + verifier → Open Chrome MCP page + seed/state + screenshot + short test steps → wait for sếp "pass" → control kế`. Mỗi control là MỘT `checkpoint:human-verify` task, `gate="blocking"`, plan `autonomous: false`. Plan xếp chuỗi tuyến tính (`02 → 03 → … → 21`) — không 2 control chạy song song.

## 0. Nguyên tắc không đàm phán

- **PASS chỉ đến từ sếp (HGC-01/02).** Evidence/test là điều kiện cần để handoff, KHÔNG phải điều kiện đủ để pass. Trước khi sếp trả lời "pass": `PASS.json.status = "pending-human"`.
- **Sếp không setup (HGC-05).** Assistant phải chuẩn bị sẵn tab Chrome, seed data, bật theme, mở đúng màn hình/control trước khi handoff. Không được nhờ sếp chạy lệnh, mở URL, tạo data hay đổi theme.
- Evidence Chrome cặp: OpenIDEA reference (`http://localhost:1420/`), proof (`http://127.0.0.1:5180/`), TaskMate wrapper (`http://127.0.0.1:5173/task-management/`) — cùng viewport `1440x900`, light + dark.
- **Pre-flight BẮT BUỘC (B3):** trước mọi capture, plan 01 Task 0 khởi động cả 3 app (xem §0.1) và `waitOnUrl` từng URL. Nếu URL không reachable trong 30s → FAIL CỨNG (throw + nonzero exit), KHÔNG `test.skip`, KHÔNG coi là xanh. `test.skip` chỉ dùng khi có lý do ngoại lệ đã ghi log rõ ràng; mặc định unreachable = blocker.
- Evidence gồm DOM, computed geometry, screenshot L/D, interaction trace thật, diff resolved, focused test assert behavior. Gate `tests/parity/parityEvidenceIntegrity.test.ts` chặn evidence thiếu trace — nhưng gate KHÔNG thay thế sếp.
- Không sửa CSS module vendored dùng chung (`src/components/ui/openidea/*.module.css`) nếu chưa có diff chứng minh module sai. Mặc định sửa wrapper; nếu cần CSS riêng tạo `src/components/ui/openidea/<control>-parity.module.css`.
- Không chạy full Vitest suite. Chỉ focused test control + gate parity. Không thêm dependency. Không PWA/GitHub Pages — chỉ Tauri desktop.

## 0.1 Pre-flight — khởi động 3 app + fail cứng (B3)

| App | URL | Lệnh start | CWD |
|---|---|---|---|
| OpenIDEA reference | `http://localhost:1420/` | `npm run dev` | `SP/openidea` |
| Proof fixture | `http://127.0.0.1:5180/` | `npm run dev` | `SP/oi-prototype` |
| TaskMate wrapper | `http://127.0.0.1:5173/task-management/` | `npm run dev -- --host 127.0.0.1` | repo root (Playwright `webServer` đã làm) |

**`PARITY_SP` là precondition bắt buộc** (WR-R2-02): export `PARITY_SP=<scratchpad root>` chứa `openidea/` + `oi-prototype/`. Không có default `/private/tmp` cứng — path đó là session-specific, mất sau reboot và không tồn tại trên fresh clone. Harness resolve lazily qua `resolveSp()` (`tests/helpers/parityEvidence.ts`); thiếu → throw rõ ngay trong `preflight()`, KHÔNG `test.skip`. Fixture ~600 MB nên cố tình giữ ngoài repo (`git ls-files` rỗng); fresh clone phải tự chuẩn bị scratchpad 2 app rồi truyền `PARITY_SP`. Chạy reference/proof bằng `npm --prefix <CWD> run dev` hoặc spawn pb với `cwd=<CWD>`; giữ process sống suốt phase, log stdout/stderr vào `.planning/debug/artifacts/control-parity/server-logs/`. `waitOnUrl` từng URL (30s timeout, poll 500ms): nếu fail → throw kèm URL + lệnh start + log path; KHÔNG skip. Đây là điều kiện cần để mọi verify ở §1 chạy.

## 1. Quy trình MỖI control (trước khi handoff)

1. **Đọc nguồn:** wrapper `src/components/ui/<control>.tsx`, CSS module, file OpenIDEA (cột Nguồn), dòng CLASSIFY `52-UI-SPEC.md` §1, `WRAPPER-ROW` inventory §2, metric §1.1/§2.
2. **Capture reference:** `PARITY_CONTROL=<id> npx playwright test e2e/control-parity.spec.ts --grep "<id>"`. Harness (sau pre-flight §0.1) mở 3 URL, set viewport/theme theo §1.2, resolve selector theo §1.1, dump DOM + computed style + screenshot.
3. **Thao tác thật:** từng state cột States: click / typing / Tab / Arrow / Enter / Escape / focus / hover / disabled / loading / selected / expanded / empty / popup. Ghi `before → after` + payload/ARIA vào `interactions.json`. Chụp ảnh tĩnh đơn lẻ → gate FAIL.
4. **Ghi diff:** `.../<id>/DIFF.md` cột `thuộc tính | reference | wrapper | verdict`. Ghi TRƯỚC khi sửa.
5. **Sửa + re-verify:** sửa wrapper/CSS riêng, chạy lại harness + focused test. Diff entry chỉ `resolved` sau khi metric/interaction khớp reference.
6. **Independent review (HGC-06/PAR-04):** executor gọi code review + verifier không phải chính mình để soi DIFF.md, interactions.json, focused test, screenshot L/D; ghi findings vào artifact. Reviewer KHÔNG gán pass — chỉ chặn handoff nếu còn sai. Sửa finding rồi lặp bước 3-5 trước khi handoff.
7. **Handoff (HGC-05):** ghi `PASS.json.status="pending-human"`; dùng Chrome MCP mở tab TaskMate tại màn hình chứa control, seed data dummy, set light, screenshot; set dark, screenshot; giữ tab đang mở sẵn; đưa 2-3 bước test tiếng Việt trong `<how-to-verify>`. Dừng. Chờ sếp `"pass"`. Nếu không pass → lặp bước 3-6 (HGC-03).

## 1.1 Selector/fixture map cho 56 control (B1)

`PARITY_CONTROL=<id>` phải resolve được selector THẬT trên cả reference lẫn proof — KHÔNG giả định control tồn tại. Nguồn authority là bảng §4 (56 id) + `51-CONTROL-INVENTORY.md` §2. Mọi wrapper có `data-oi-control="<id>"` → selector ổn định `[data-oi-control="<id>"]`. Ba wrapper chưa có attribute xử lý theo F2 (xem §1.3).

Harness import bảng `CONTROL_REGISTRY` từ `tests/parity/parityEvidenceIntegrity.test.ts` (plan 01) — mỗi entry gồm `id`, `wrapperSelector`, `referenceSelector`, `proofSelector`, `states`, `fixture`. Khi chạy single-control, nếu selector không resolve trên reference HOẶC proof → FAIL CỨNG với thông báo id + app + selector, KHÔNG skip, KHÔNG chụp evidence giả.

**Chiến lược fixture mở rộng (không skip control nào):** proof hiện chỉ render ~7 họ control (Button, Input, Check/Radio/Toggle, Select/List, Tabs, Chip, Dialog — xác nhận tại `oi-prototype/src/main.jsx` + PROOF.md). Plan 01 Task 1 phải mở rộng fixture proof bằng một route demo `?fixture=<id>` (hoặc section render theo registry) cho **toàn bộ 56 id**: mỗi id render 1 instance wrapper-equivalent dùng CSS module vendored gốc, gắn `data-oi-control="<id>"` + state tối thiểu theo §3. Với id không có analog trong OpenIDEA thật `:1420` (ví dụ date-picker/time-picker/table/tree — nằm ngoài 7 họ proof), reference lấy component tương ứng trong `openidea/src/ui/` (ví dụ `Calendar.tsx` cho date-picker) mount qua cùng route demo reference `?fixture=<id>`, hoặc nếu component chỉ tồn tại dạng CSS module thì render DOM/class bám source với module đó. Mọi fixture phải là DOM/class thật từ source OpenIDEA, không phải approximation tự bịa. Ghi rõ `fixture` cho từng id trong `CONTROL_REGISTRY`. Không control nào được đánh dấu skip/unsupported.

**Smoke plan 01 (B4):** dùng `button` — control có analog thật ở cả 3 app VÀ có focused test thật được tạo ngay trong plan 01 (`src/components/ui/__tests__/parity-button.test.tsx`, tối thiểu 1 `fireEvent`/`userEvent` + assertion state đổi). Smoke chạy ở chế độ `SMOKE=1`: harness capture + gate integrity validate schema/trace/focused test đầy đủ; KHÔNG hạ tiêu chí gate. Chế độ full (mặc định) vẫn yêu cầu 56 artifact + focused test của từng control. Plan 02 khi xử lý Button chỉ mở rộng test smoke có sẵn, không viết lại từ đầu.

## 1.2 Theme riêng từng app (B2)

KHÔNG dùng một selector chung. Harness `setTheme(page, app, theme)` chuyển theo từng app:

| App | Cách set | Poll xác nhận |
|---|---|---|
| TaskMate `:5173` | bấm `getByRole('button',{name:'Chuyển đổi giao diện sáng/tối'})` (`src/workbench/TitleBar.tsx:317`) | `.taskmate-workbench-theme` đầu tiên có `data-theme` = `light`/`dark` (khớp `e2e/native-controls-parity.spec.ts`) |
| Proof `:5180` | bấm `button.themeBtn` (nhãn `Theme: light`/`Theme: dark`) hoặc evaluate `document.documentElement.dataset.theme = theme` (`oi-prototype/src/main.jsx:206-214`) | `document.documentElement.dataset.theme` = `theme` |
| Reference `:1420` | KHÔNG có nút TitleBar/`.themeBtn`; set `document.documentElement.dataset.theme = theme` qua evaluate (OpenIDEA `themeWatch.ts`/`themes.ts` đọc attr trên root) | `document.documentElement.dataset.theme` = `theme`; nếu app override qua IPC, chờ attr ổn định 2 poll liên tiếp rồi mới capture |

Sau set, đợi 2 animation frame + poll attribute (tối đa 5s) rồi mới dump DOM/screenshot. Assert hash L ≠ D cho cả 3 app.

## 1.3 Selector fallback cho 3 wrapper thiếu attribute (F2)

`config-provider.tsx`, `empty.tsx`, `status-dot.tsx` hiện KHÔNG có `data-oi-control`. Xử lý ưu tiên: thêm attribute trực tiếp trong control task tương ứng (plan 19 task 2, plan 20 task 2, plan 15 task 3) theo 52-UI-SPEC §10: `data-oi-control="config-provider"|"empty"|"status-dot"` + `data-state` phù hợp. Nếu vì lý do kỹ thuật không thêm được, harness用 fallback có ghi rõ trong registry: config-provider → `.taskmate-theme-context[data-theme]`, status-dot → `[role="img"], span[aria-hidden="true"]` trong vùng chứa + filter theo style `--ui-status-color`, empty → `.ant-empty` (AntD Empty root). Mọi fallback phải được ghi trong `CONTROL_REGISTRY.fixture` kèm lý do; selector không xác định = FAIL CỨNG, không im lặng.

## 2. Computed geometry (light + dark)

`width`, `height`, `fontSize`, `padding`, `margin`, `border`, `borderRadius`, `boxShadow` + `icon width/height` (16 default, 14 small), `alignment`, `overflow`. Lệch subpixel < 1px chấp nhận; lệch khác resolve.

Baseline PROOF (không harmonise sang token shell): button 28/24, r4/6, font 13, pad `0 16`/`0 8`/`0 10`, min-w 72, primary `rgb(56,113,225)`, secondary inset `rgb(209,211,217)`; input 28/4/`0 8`; select `0px 6px 0px 9px`; popup BODY fixed offset4 r10; row 24; dialog r10, light `rgb(247,248,249)` / dark `rgb(25,26,28)`; icon 16/14.

## 3. Behavior state checklist

pointer: click/hover/mousedown/up/outside-click · keyboard: Tab/Shift+Tab/Arrow*/Enter/Space/Escape · focus: ring 2px offset 1 (icon -2), trap, restore · value: disabled/loading(`aria-busy`)/selected/expanded/empty/invalid/indeterminate · popup: open/close, lead(`data-lead`+`aria-activedescendant`), portal BODY · payload: onChange/onSelect/onFinish giá trị thật, không `{}`/stale/no-op. Mỗi state có assertion so sánh reference.

## 4. Registry 56 control — thứ tự ưu tiên

P0 = analog trực tiếp/tác động lớn (trước). P1 = overlay/data. P2 = structural/adoption/feedback/holder.

| # | id | wrapper | Nguồn / Spec | P | Geometry focus | States bắt buộc | Pass criteria tối thiểu |
|---:|---|---|---|---|---|---|---|
| 1 | button | `button.tsx` | `Button.tsx`, S-BTN | P0 | 28/24, r4/6, min-w72, pad 0 16/8/10, ring | default, hover, active, focus, disabled, loading, selected | 4 variant đúng metric + Enter/Space + `aria-busy`/`aria-pressed` |
| 2 | input | `input.tsx` | `Input.tsx`, S-FLD | P0 | 28, r4, pad 0 8, double-ring | hover, focus, disabled, invalid, placeholder, Search/Password | typing onChange, Enter pressEnter, ref, invalid shadow |
| 3 | textarea | `textarea.tsx` | `Input.module.css .multiline` | P0 | minRows 2, maxRows, full width | focus, disabled, invalid, typing | onChange + minRows 2 + alias |
| 4 | checkbox | `checkbox.tsx` | `Checkbox.tsx`, S-CHK | P0 | native16 opacity0, box16 r3, SVG12 | checked, indeterminate, disabled, focus | Space + SVG + `aria-checked=mixed` + Group |
| 5 | radio | `radio.tsx` | `Checkbox.module.css .radio` | P0 | 16 box, 6px dot | checked, disabled, Arrow | Arrow selection + Group/Button |
| 6 | switch | `switch.tsx` | `Checkbox.module.css .switch`, S-SW | P0 | 42x18, r3, knob16 tx24 | on/off, disabled, focus, Space | `role=switch`, `aria-checked`, tx |
| 7 | select | `select.tsx` | `Select.tsx`, `List.tsx`, S-SEL | P0 | trigger28/r4/pad `0 6 0 9`, popup BODY r10, row24 | open, lead, selected, disabled, clear, empty, search | Arrow/Enter/Escape/outside + payload + allowClear |
| 8 | auto-complete | `auto-complete.tsx` | `Select.module.css`, S-SEL | P0 | S-SEL trigger+popup | typing filter, lead, selected, empty, Escape | lọc theo query, Enter emit, Option |
| 9 | mentions | `mentions.tsx` | `Input.module.css`, `Select.module.css` | P0 | input28 + popup24 | `@` trigger, Arrow, Enter, empty | ref + `@` mở popup + payload |
| 10 | date-picker | `date-picker.tsx` | N-08, `Popup.module.css` | P0 | trigger28/4/13, cell24, grid7 | open, nav, lead, disabledDate, clear, range | header đổi, Arrow/Enter, disabledDate, clear null |
| 11 | time-picker | `time-picker.tsx` | N-30 | P0 | trigger28/4/13, col24 | open, ArrowUp/Down, Enter, clear, range | lead+scroll+pick, RangePicker onLead |
| 12 | icon | `icon.tsx` | `icons.tsx`, N-13 | P0 | 16/14, width=height | decorative, aria, spin, rotate, onClick | không fallback 300x150, mọi export |
| 13 | tag | `tag.tsx` | `Chip.tsx`, S-CHIP | P0 | 22, r6, font12, pad0 6 | tone, checkable, hover, close | D-12 L/D, onChange, close |
| 14 | breadcrumb | `breadcrumb.tsx` | `Menu.module.css`, N-04 | P0 | font13, gap, separator | link hover, focus, ellipsis | onClick, statics, link semantics |
| 15 | tabs | `tabs.tsx` | `Tabs.tsx`, S-TAB | P0 | h22..28, r6, font13 | selected, hover, focus, disabled, closable, Arrow | Arrow + onChange + TabPane |
| 16 | segmented | `segmented.tsx` | `Tabs.module.css`, S-TAB | P0 | height/radius, inset | selected, hover, Arrow, disabled | Arrow + onChange value |
| 17 | menu | `menu.tsx` | `Menu.tsx`, S-MNU | P0 | popup pad6px0, minw180, item24, r5 | active, disabled, danger, submenu, Escape/outside | Arrow/Enter/Escape + onClick + statics |
| 18 | tooltip | `tooltip.tsx` | `Tooltip.tsx`, S-TT | P0 | pad6px10, r6, font13, lh16 | placed, shortcut, hover-out, Escape, delay | portal fixed, pointer-events none |
| 19 | popover | `popover.tsx` | `Popup.module.css`, N-19 | P0 | offset4, maxWidth scale | hover/click/focus, open, close, outside | onOpenChange + overlayStyle win |
| 20 | popconfirm | `popconfirm.tsx` | `Dialog.module.css .popup` | P0 | popup r10, btn28, tone | open, confirm, cancel, Escape | okText/cancelText, payload, tone |
| 21 | modal | `modal.tsx` | `Dialog.module.css`, S-DLG | P1 | r10, bg L/D, shadow, titlebar | mask false, footer none, trap, Escape | contextHolder, mask false giữ, trap |
| 22 | drawer | `drawer.tsx` | S-DLG panel | P1 | panel width, titlebar, shadow | silent, Esc, trap, mask | width token, silent tắt closable, trap |
| 23 | dropdown | `dropdown.tsx` | `Select.module.css`, `Menu.module.css` | P1 | trigger + popup180/24 | click/hover, Arrow, Enter, Escape, outside | onClick/onOpenChange + Button |
| 24 | pagination | `pagination.tsx` | `Button.module.css`, N-18 | P1 | btn28/icon20, chip22 | page, prev/next, size, disabled | onChange/onShowSizeChange đúng số |
| 25 | upload | `upload.tsx` | `List.module.css`, N-34 | P1 | btn28, row24, progress | select, uploading, done, error, remove | onChange/beforeUpload + Dragger/LIST_IGNORE |
| 26 | list | `list.tsx` | `List.tsx`, S-LST | P1 | row24 translateY, sizer n*24 | empty, loading, selected, lead, extra/actions, pagination | extra render + pagination payload |
| 27 | table | `table.tsx` | `List.module.css`, N-29 | P1 | header24, padding/font, sticky | sort, filter, clear, select, sticky, empty | onChange.filters keyed (không `{}`) |
| 28 | tree | `tree.tsx` | `Tree.tsx`, S-TR | P1 | row24, indent16/depth+12, toggle16 | collapsed, expanded, selected, checkable, Arrow | payload + DirectoryTree thật |
| 29 | tree-select | `tree-select.tsx` | `Select.module.css`, `Tree.module.css` | P1 | S-SEL + indent | open, expand, lead, selected, clear | children→treeData + payload + statics |
| 30 | progress | `progress.tsx` | `density.ts`, N-20 | P1 | track height/radius, accent | 0%, partial, 100%, exception, status | percent + status D-12 L/D |
| 31 | slider | `slider.tsx` | `Splitter.module.css`, N-23 | P1 | rail/handle, focus ring | hover, drag, Arrow, disabled, range | onAfterChange committed + defaultValue |
| 32 | splitter | `splitter.tsx` | `Splitter.module.css`, S-SPL | P1 | handle1px, hit±3px, cursor | hover, dragging, keyboard resize | onResize + aria-orientation + Panel |
| 33 | form | `form.tsx` | S-FLD | P1 | label gap, error `--danger` | required, invalid, submitting, preserve, rules | onFinish + rule.type + methods wired |
| 34 | input-number | `input-number.tsx` | `Input.module.css`, S-FLD | P1 | input28, stepper20 | typing, Arrow, min/max, precision | onChange số + props nguyên |
| 35 | collapse | `collapse.tsx` | `Menu.module.css`, N-06 | P1 | header height/padding | collapsed, expanded, focus, disabled, nested | onChange + Enter/Space + Panel |
| 36 | image | `image.tsx` | `Popup.module.css`, N-14 | P1 | preview radius/shadow | open, zoom, rotate, reset, Arrow, Escape | một owner arrow + payload + Group |
| 37 | alert | `alert.tsx` | `Feedback.module.css`, N-01 | P2 | banner pad/gap, D-12 | 4 status, closable, close | onClose + D-12 L/D + ErrorBoundary |
| 38 | message | `message.tsx` | `Feedback.module.css`, N-16 | P2 | surface pad/radius | 5 loại, dismiss | holder đơn nhất + instance + theme |
| 39 | notification | `notification.tsx` | `Feedback.module.css`, N-17 | P2 | radius/shadow, icon16 | open, pauseOnHover, close, 4.5s | instance + không static + iconSize |
| 40 | result | `result.tsx` | `List.module.css`, N-21 | P2 | icon, font13/12 | 4 status, extra | status icon + text + extra click |
| 41 | statistic | `statistic.tsx` | `tokens.css:293`, N-27 | P2 | font13/12/11 | precision, prefix/suffix, loading | format + Countdown onFinish |
| 42 | status-dot | `status-dot.tsx` | D-12 | P2 | dot6, status colors | each status, with/without label | D-12 L/D + role/aria-hidden |
| 43 | card | `card.tsx` | `Dialog.module.css`, N-05 | P2 | radius10, padding | hover, clickable, loading, grid/meta | onClick + statics |
| 44 | descriptions | `descriptions.tsx` | `DialogFieldset.module.css`, N-09 | P2 | label/value row | bordered, column, empty | label/value + Item |
| 45 | avatar | `avatar.tsx` | `Chip.module.css`, N-03 | P2 | size, iconSize, radius | image/text/icon/group | fallback + onClick + Group |
| 46 | divider | `divider.tsx` | `Splitter.module.css`, N-10 | P2 | 1px, orientation, margin | horizontal, vertical, text, dashed | separator + align |
| 47 | grid | `grid.tsx` | `tokens.css:19-24`, N-12 | P2 | gutter, 24-col | span/offset/xs, nested | gridColumn, không leak attr |
| 48 | layout | `layout.tsx` | `tokens.css` 40/26/36, N-15 | P2 | header/footer/sider | collapse, breakpoint | onCollapse + statics |
| 49 | space | `space.tsx` | `tokens.css`, N-24 | P2 | gap, direction, wrap | h/v/wrap, Compact | gap + Compact |
| 50 | typography | `typography.tsx` | `tokens.css:293`, N-33 | P2 | 11/12/13/16, h1..h6 | levels, strong/code/copyable, link | level tag + props không drop |
| 51 | badge | `badge.tsx` | `Chip.module.css`, D-12 | P2 | chip22, dot6 | count, dot, status, overflow | D-12 L/D + color win |
| 52 | app | `app.tsx` | N-02 holder | P2 | `--ui-app-font-size` | mount, useApp, nested | contextHolder + hook |
| 53 | config-provider | `config-provider.tsx` | N-07 provider | P2 | CSS vars | theme L/D, nested | tokens gọi + withoutUndefined |
| 54 | spin | `spin.tsx` | `Spinner.module.css`, N-25 | P2 | spokes 0.9s, accent | spinning, static, tip, nested | accent + static mirrored |
| 55 | skeleton | `skeleton.tsx` | `density.ts`, N-22 | P2 | row/avatar, shimmer | active, rows, avatar, image | statics + row count |
| 56 | empty | `empty.tsx` | `List.module.css`, N-11 | P2 | font12 muted | default, custom image, description | description + images |

## 5. Artifact path

```
.planning/debug/artifacts/control-parity/<id>/
  reference-light.png  reference-dark.png
  wrapper-light.png    wrapper-dark.png
  dom-light.json       dom-dark.json
  geometry-light.json  geometry-dark.json
  interactions.json    # [{state, action, before, after, asserted, reference, wrapper}]
  DIFF.md              # thuộc tính | reference | wrapper | verdict
  PASS.md              # handoff log + 2-3 bước tiếng Việt đã đưa cho sếp
  PASS.json            # {id, status:"pending-human"|"pass", humanVerdict, chromeTabUrl, seedDescription, geometry, interactions, consoleErrors:[], focusedTest}
```

Trước handoff: `status="pending-human"`, `humanVerdict=null`, ghi `chromeTabUrl` + `seedDescription`. Sau sếp pass: `status="pass"`, `humanVerdict="pass"`, timestamp. `interactions.json` entry `asserted:true` cho MỌI state. Hash L ≠ D.

## 6. Gate chống certify shape giả

`tests/parity/parityEvidenceIntegrity.test.ts` (plan 01) kiểm tra: (0) pre-flight §0.1 đã chạy, 3 URL reachable — nếu không, FAIL CỨNG (không skip); (1) đủ file artifact; (2) status hợp lệ, consoleErrors rỗng, focusedTest tồn tại; (3) mỗi state có interaction `asserted:true`, thiếu `click|type|key|focus|hover` → FAIL; (4) focused test có `fireEvent.`/`userEvent.` VÀ assertion trên state đổi, test chỉ assert className/style tĩnh → FAIL; (5) hash L≠D; (6) gate cuối (plan 21): 56 PASS.json `status:"pass"` VÀ `humanVerdict:"pass"`; (7) independent review/verifier artifact tồn tại trước handoff (HGC-06). Gate máy KHÔNG tự gán humanVerdict.

Chế độ gate: `SMOKE=1 PARITY_CONTROL=<id>` → validate schema/harness/focused test của ĐÚNG 1 control (không nới tiêu chí); mặc định → validate toàn bộ 56. Cả 2 chế độ đều áp (0)-(5),(7); chỉ (6) thuộc plan 21.

## 7. File ownership

- Mỗi control plan: `src/components/ui/<control>.tsx`, `src/components/ui/__tests__/parity-<control>.test.tsx`, `src/components/ui/openidea/<control>-parity.module.css` (nếu cần), `.planning/debug/artifacts/control-parity/<control>/**`.
- Plan 01: `e2e/control-parity.spec.ts`, `tests/helpers/parityHarness.ts`, `tests/helpers/parityEvidence.ts`, `tests/parity/parityEvidenceIntegrity.test.ts`, `src/components/ui/__tests__/parity-button.test.tsx` (focused test smoke thật cho B4), fixture mở rộng 56 control trong proof/reference (B1).
- Không plan nào sửa 4 file Plan 01, `package.json`, `playwright.config.ts`, CSS module vendored dùng chung.

## 8. Nguồn tham chiếu

- `.planning/debug/control-quality-rework.md`, `.planning/debug/native-controls-fake-render.md`
- `.planning/phases/51-control-inventory-surface-audit/51-CONTROL-INVENTORY.md` §2
- `.planning/phases/52-openidea-mapping-design-contract/52-UI-SPEC.md` §1/§1.1/§2/§9/§10
- `/private/tmp/claude-503/-Users-tranducquan-Working-Personal-task-management/32c7be2b-546e-433a-aa53-76345c15954c/scratchpad/oi-prototype/PROOF.md`
- `/private/tmp/claude-503/-Users-tranducquan-Working-Personal-task-management/32c7be2b-546e-433a-aa53-76345c15954c/scratchpad/openidea/src/ui/`
