---
slug: native-controls-fake-render
status: investigating
trigger: "Audit phát hiện hệ thống wrapper native render hàng giả (DatePicker dropdown số, List/Table/Typography/Grid/etc drop prop) dù gate xanh; cần khắc phục toàn bộ trước khi đóng milestone v1.6"
created: 2026-11-22
updated: 2026-11-22
---

# Debug Session: native-controls-fake-render

## Current Focus (2026-11-22 — CHƯA ĐÓNG PHASE 54 / MILESTONE)

- user evidence: "vừa kiểm tra thử 1 các control như datepicker, nó không phải datepicker mà là 1 dropdown toàn con số, như thế mà cũng gọi là thực hiện xong hả?"; "gần như mọi control đều trông như 1 đống rác"; "khi code các control bạn không đối chiếu lại với control intellij à?"; "không chỉ compare về UI token, mà size cũng phải chuẩn, tôi xem qua thấy icon đang to khủng khiếp, không hiểu sao code thế mà lại gọi là code xong được".
- bug_class: Bohrbug — gate xanh nhưng wrapper render shape giả / drop prop / sai metric; deterministic, reproduce được bằng DOM/computed style.
- symptom 1 (CRITICAL): `src/components/ui/date-picker.tsx:64-101` render day grid thành danh sách số dọc (`listStyles.sizer`, `translateY(index*24)`, `data-oi-control="list-row"`, popup column), không phải calendar 7 cột + header tháng/năm + footer; test `overlayPopups.test.tsx:399-421` assert shape giả.
- symptom 2 (MAJOR): wrapper khác drop prop hoặc render null: `list.tsx` (actions/extra/pagination), `table.tsx` (`onChange` filters hard-code `{}`), `grid.tsx` (responsive props leak ra DOM), `typography.tsx` (`level` luôn h1, drop strong/code/copyable), `tree.tsx` (`DirectoryTree` trả null), `tree-select.tsx` (`TreeSelectNode` trả null), `time-picker.tsx` (thiếu ArrowUp/Down, RangePicker `onLead` no-op), `image.tsx` (double arrow handler, thiếu zoom/rotate), `form.tsx` (`preserve`/`disabled` voided, methods no-op), `slider.tsx` (`onAfterChange` stale value).
- symptom 3 (CROSS-CUTTING): icon size quá lớn; chưa đo/đối chiếu computed size với IntelliJ/OpenIDEA. Chỉ so token là chưa đủ — phải so sánh width/height/font/icon/padding/margin/radius/alignment/overflow ở light + dark.
- symptom 4 (CROSS-CUTTING, bổ sung 2026-11-22): behavior sai nhiều — event payload, controlled/uncontrolled, focus/keyboard (Tab/Arrow/Enter/Escape), hover/expanded/selected/disabled/loading/empty, validation, open/close popup, outside-click, focus trap. Phải audit + fix behavior parity, không chỉ computed style. Artifact verification cần bảng behavior parity light/dark.
- root cause (giả thuyết ban đầu): kế hoạch Phase 54 chỉ gate "có export / có data hook / test shape" nên sinh ra implementation rút gọn; thiếu đối chiếu trực tiếp DOM + computed style với source OpenIDEA và test behavior thật.
- fix scope: rebuild DatePicker/RangePicker calendar thật; sửa mọi wrapper fake/drop-prop; thay test certify shape giả bằng test behavior thật; đo icon size và metric; behavior parity (payload/focus/keyboard/state/validation/popup/focus-trap); Chrome side-by-side light/dark; chạy GSD review + verifier + push sau khi ổn định.
- icon root cause (confirmed via source): `wrapIcon` chỉ set SVG width/height khi `size` là number; default `size` undefined → SVG rơi về 300×150 browser default. OpenIDEA `SvgIcon({size=16})` luôn set width=height=size. Baseline: 16px default, small 14px (`iconMarkup(name,14)` trong diffToolbar/mergeGutters). Fix: default size=metrics.iconSize (16) + luôn set width/height.
- expected behavior: mỗi wrapper render đúng control IntelliJ/OpenIDEA cả shape lẫn kích thước; props/API/event/keyboard/focus/validation/a11y giữ nguyên; test chỉ pass khi behavior thật; sếp không phải tự duyệt từng màn hình.
- next_action: rebuild DatePicker trước, sau đó sửa từng wrapper theo danh sách; mọi sửa đều kèm chrome parity check (computed size, icon size, DOM) ở light/dark.

## Symptoms

- Expected behavior: DatePicker là calendar thật (7 cột, header tháng/năm, điều hướng, chọn ngày/range, keyboard, disabledDate, footer/clear). Mọi control khác phải đúng shape/kích thước/behavior như OpenIDEA/IntelliJ, không drop prop.
- Actual behavior: DatePicker là dropdown số dọc. Nhiều wrapper khác render placeholder/null hoặc bỏ prop. Icon quá to so với baseline.
- Error messages: Không có runtime error; các focused test vẫn xanh vì assert shape giả.
- Timeline: Phát hiện sau khi Phase 54 review/verification tạm dừng ngày 2026-11-22; audit xác nhận defect có từ lúc implement Phase 53/54.
- Reproduction: mở DatePicker picker trong app, quan sát popup; chạy focused test `overlayPopups.test.tsx`; đo computed style icon trong Chrome.

## Evidence

- timestamp: 2026-11-22 — Audit fake native controls: 56 wrapper, nhiều defect ranked; Phase 54 sign-off `555c6a9a` bị invalidate.
- timestamp: 2026-11-22 — User bổ sung defect icon size; yêu cầu so sánh cả size, không chỉ token.

## Eliminated

- (none yet)
