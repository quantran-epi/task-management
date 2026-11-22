---
slug: control-quality-rework
status: investigating
trigger: "các control vẫn tệ lắm, mới cải thiện được đôi chút"
created: 2026-11-22
updated: 2026-11-22
---

# Debug Session: control-quality-rework

## Current Focus (2026-11-22 — phase 54 remediation KHÔNG ĐỦ)

- user evidence: "các control vẫn tệ lắm, mới cải thiện được đôi chút"; trước đó: "gần như mọi control đều trông như 1 đống rác", "khi code các control bạn không đối chiếu lại với control intellij à?", "không chỉ compare về UI token, mà size cũng phải chuẩn", "behaviour cũng sai rất nhiều".
- status: Phase 54 remediation trước đã sửa fake shape rõ ràng (DatePicker, icon, drop-prop) nhưng sếp vẫn đánh giá không đạt. Không được coi phase 54/milestone xong, không tiếp tục phase 55 cho tới khi sếp hài lòng với chất lượng control.
- root cause giả thuyết: remediation chỉ sửa các defect discoverable bằng test/probe nội bộ; chưa tái cấu trúc toàn bộ 56 wrapper theo source OpenIDEA/IntelliJ thật. Baseline UI-SPEC còn khái quát (token/metric), thiếu component-level DOM/CSS behavior comparison.
- method mới (bắt buộc): với MỖI wrapper trong `src/components/ui/`, mở source tương ứng trong OpenIDEA (`scratchpad/openidea`) hoặc IntelliJ reference, chạy cả hai trên Chrome cùng viewport/theme, chụp DOM tree + computed styles (width/height/font/padding/margin/radius/border/shadow/alignment/overflow) + thao tác behavior (focus/hover/disabled/loading/selected/expanded/keyboard/popup), ghi diff cụ thể trước khi code. Sau đó sửa từng diff. Không được viết test assert shape tự chế làm bằng chứng hoàn tất.
- scope: 56 wrapper. Ưu tiên control có tương đương OpenIDEA trực tiếp (Button/Input/Checkbox/Select/DatePicker/Menu/Tooltip/Dialog/Table/Tree/List/Progress/Tabs/Icon...), rồi control thiết kế mới theo ngôn ngữ IntelliJ.
- expected: sếp mở app thấy control giống hệt OpenIDEA/IntelliJ cả mắt lẫn thao tác, không còn cảm giác "hời hợt". Mọi phase phải có evidence Chrome light+dark.
- next_action: dừng planning Phase 55; chạy audit component-level có source đối chiếu; lập remediation plan mới với GSD; fix theo diff; Chrome verify từng control; review+verifier; push.

## Symptoms

- Expected: Bộ control wrapper TaskMate phải giống hệt OpenIDEA/IntelliJ về visual, kích thước và behavior ở light+dark.
- Actual: Sau remediation, sếp đánh giá "vẫn tệ lắm, mới cải thiện được đôi chút".
- Timeline: 2026-11-22, ngay sau khi Phase 54 remediation được verify/push.
- Reproduction: Mở app, quan sát/thao tác control bất kỳ so với OpenIDEA/IntelliJ.

## Evidence

- timestamp: 2026-11-22 — Sếp phản hồi chất lượng control vẫn thấp sau 3 vòng review/fix.
- timestamp: 2026-11-22 — Đã dừng gsd-planner Phase 55, chưa có PLAN.md nào được tạo.

## Eliminated

- (none)
