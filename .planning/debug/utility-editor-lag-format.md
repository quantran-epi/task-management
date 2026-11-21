---
status: resolved
trigger: "rất lag khi gõ và khi bấm save as, mãi mới hiện modal, expand collapse object cũng lag, và khi paste thử data vào, ấn format lần 1 không có phản ứng gì, ấn lần 2 mới được"
created: 2026-11-21
updated: 2026-11-21
---

# Debug: Utility editor lag + Format first-click no-op

## Symptoms

- **Expected:** gõ vào textarea mượt; bấm Save as modal hiện ngay; expand/collapse JSON/XML tức thì; paste data rồi bấm Format lần 1 là format ngay.
- **Actual:** lag rõ khi gõ; Save as mãi mới hiện modal; expand/collapse object lag; paste rồi bấm Format lần 1 không có phản ứng, bấm lần 2 mới được.
- **Errors:** không có lỗi console được báo; chỉ có 3 warning có sẵn (antd destroyOnClose deprecated, panel resize handle, antd message static function).
- **Timeline:** xuất hiện ngay sau quick task 261121-foz (line numbers + folding + session store + Save as). Trước đó (sau 261121-ev5 AI assistant) không có triệu chứng này.
- **Reproduction:** mở Tool Explorer → JSON/XML Formatter → paste nội dung → gõ/Format/Save as/folding.
- **Scope mở rộng (user nhấn mạnh):** "tất cả các tool phải thật mượt trên tất cả" — không chỉ 4 triệu chứng trên, mà toàn bộ 4 utility tool (JSON, XML, Text Compare, Markdown) và mọi thao tác: gõ/paste, Format/Minify, cuộn có gutter, expand/collapse, Save as, đổi tab qua lại, AI assistant. Đưa tiêu chí này vào verification plan. Nếu nguyên nhân chung (re-render/stale closure/folding recompute/store subscription) thì sửa gốc cho cả 4 tool, không vá riêng.

## Initial context

- Quick task: `.planning/quick/261121-foz-line-number-v-collapse-expand-cho-utilit/`
- Commits liên quan: `442a51a0` (LineNumberedPane + computeFoldRanges), `31a833ac` (wire 8 panes + folding + Save as + store), `b85e21f4` (persist), `66c69839` (Save as).
- Files: `src/workbench/toolwindows/UtilityToolPanel.tsx`, `LineNumberedPane.tsx`, `utilityToolContentStore.ts`.
- Hypotheses cần kiểm tra: store subscription re-render toàn bộ editor trên mỗi keystroke; gutter render số + nút cho mỗi dòng bằng styled div; folding recompute trên mọi render; SaveAsModal nặng/createNote import; stale closure giữa `input` state và store `patch` gây Format lần đầu đọc giá trị cũ.

## Root Cause

Common cause ở tầng state owner + render path, ảnh hưởng cả 4 tool:

1. **Re-render thừa trên mỗi keystroke** — `useUtilityContent` trả `patch`/`clear` là hàm mới mỗi render; zustand `patch` tạo `values` object mới → mọi subscriber re-render. `LineNumberedPane` rebuild N div gutter (mỗi dòng 1 div + nút) và `FoldingCodeView` tính lại `computeFoldRanges` + highlight HTML toàn bộ output ngay cả khi `output` không đổi. Đây là nguồn lag gõ/paste/cuộn/expand-collapse.
2. **Save as modal chậm** — caller truyền `formats` inline array mới mỗi render → `SaveAsModal` effect phụ thuộc `[open, defaultName, formats]` chạy lại + 3 `setState` mỗi keystroke. Accumulate công việc làm click hiện modal bị trễ.
3. **Format lần đầu no-op (stale closure)** — `run` trong `JsonFormatter`/`XmlFormatter` đọc `input`/`indent` từ closure render trước. Sau paste, React chưa commit render mới thì click Format → closure cũ còn rỗng → parse `''` → không có output. Lần 2 render mới đã commit nên chạy.
4. **Cấp phát thừa** — `split('\n').length` cấp phát mảng lớn mỗi keystroke khi paste data to ở 10 chỗ đếm dòng/gutter.

## Fix (tận gốc, áp dụng cho cả 4 tool)

- `utilityToolContentStore.ts`: `patch`/`clear` dùng `useCallback` (identity ổn định); thêm `getUtilityContent()` đọc giá trị tươi ngoài React render.
- `UtilityToolPanel.tsx`: `run` JSON/XML đọc `getUtilityContent(...)` thay vì closure; `FoldingCodeView` memo hóa visibleLines/collapsedLines/html + `toggleFold` ổn định; `SaveAsModal` dùng `formatsRef` để effect chỉ chạy khi `open`/`defaultName` đổi; thay `split('\n').length` bằng `countLines`.
- `LineNumberedPane.tsx`: memo hóa `lines` + `gutterRows`; đổi `countNewlines` thành `countLines` export dùng chung (không cấp phát mảng).

Tất cả pane trong `UtilityToolPanel.tsx` (4 pane JSON/XML/TextCompare/Markdown) đi qua chung `LineNumberedPane` + `useUtilityContent` → sửa 1 chỗ cover hết, không vá riêng.

## Verification

- `npx tsc --noEmit`: sạch.
- Scoped vitest: `UtilityToolPanel.test.tsx` + `UtilityToolAIAssistant.test.tsx` → 47 passed.
- Chrome (Playwright, E2E `e2e/utility-editor-lag.spec.ts`): 7/7 passed — paste + Format lần đầu + folding JSON/XML, Save as mở <2s, Text Compare diff + gutter, Markdown render + gutter, đổi tab qua lại giữ nội dung, gutter mirror scroll, AI assistant mở cho cả 4 tool. Không chạy full suite.

## Follow-up (user báo vẫn lag)

Round 2 — đo bằng PerformanceObserver trong Chrome thay vì tin E2E threshold:

- Trước: 113 ký tự gõ vào XML input tạo **6780** component renders (`Tooltip` 876, `Button` 834, `Wave` 731, `SaveAsModal` 114, `UtilityToolAIAssistant` 114) — AntD Modal/Tooltip/Button dù đóng vẫn được dựng lại mỗi keystroke.
- Sau: (a) conditional mount `saveOpen && <SaveAsModal>` / `aiOpen && <UtilityToolAIAssistant>` ở cả 4 tool; (b) thay 22 Tooltip+Button toolbar bằng native `<button>` + `title`, giữ aria-label để test/E2E; (c) thay 2 `Select` indent bằng native `<select>`.
- Đo lại cùng 113 ký tự: **219** component renders (chỉ `LineNumberedPane` 135 + `Update` 84) — giảm ~97%.
- Chrome UAT: Format lần đầu có output ngay; Save as dialog xuất hiện trong **65ms** (đo `performance.now()` trong page); folding vẫn đúng; 47 unit tests + 7/7 Playwright pass.

## Current Focus

- resolved — root cause fixed at state owner + render path + toolbar/modal mount; verified bằng measurement trong Chrome.
