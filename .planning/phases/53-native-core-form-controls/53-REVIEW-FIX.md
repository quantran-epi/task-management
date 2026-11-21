---
status: complete
findings_in_scope: 3
fixed:
  - RR-01
  - RR-02
  - RR-03
skipped: []
iteration: 2
---

# Phase 53 — Review Fix Report (iteration 2)

## Tóm tắt

Đã fix đúng 3 warning mới từ lần re-review (`53-REVIEW.md`): RR-01 (Select lead reset), RR-02 (RadioGroup event shape), RR-03 (RadioButton standalone `defaultChecked`). Mỗi fix commit riêng `fix(53): ...` kèm `Co-Authored-By: Claude Code <noreply@anthropic.com>`. File báo cáo này không được commit.

## Fixes

1. **RR-01** — `fix(53): stabilize Select lead reset across rerenders`
   - `src/components/ui/select.tsx`: thay `selectedKeys` (Set tạo mới mỗi render) bằng `selectedValueKey` primitive + `useMemo`; effect reset lead chỉ chạy khi `open`/`filtered`/giá trị selection thật sự đổi.
   - Regression test `formControls.test.tsx`: gõ `alpha`, ArrowDown × 2, assert `data-lead = Alpha two`, Enter → `onChange('a2')`.
   - Đã chứng minh test fail trên source HEAD cũ (`Alpha one`) rồi pass sau fix.

2. **RR-02** — `fix(53): forward native event from RadioGroup onChange`
   - `src/components/ui/radio.tsx`: `RadioGroupContext.onSelect` nhận `ChangeEvent<HTMLInputElement>`; `Radio`/`RadioButton` forward cùng native event instance.
   - `RadioGroup.handleSelect` giữ nguyên event (`stopPropagation`, `preventDefault`, `nativeEvent`) và normalize `target` thành `{ value, checked: true, name }` đúng `RadioChangeEventTarget`.
   - Focused test assert `target.value`, methods callable, `nativeEvent` tồn tại; test FormItem cũ vẫn pass.

3. **RR-03** — `fix(53): honour standalone RadioButton defaultChecked`
   - `src/components/ui/radio.tsx`: đổi `?? ownChecked` thành ternary như `Radio`, nên `defaultChecked` có hiệu lực khi không có group.
   - Focused test assert `input.checked === true` và `data-state="checked"`.

## Kiểm chứng

- Scoped Vitest đúng 10 file: **10 file / 84 test pass** (81 baseline + 3 regression test mới); không chạy full suite.
- `npx tsc --noEmit`: pass.
- `npm run lint`: pass.
- `npm run build`: pass.
- Chrome thật (DevTools MCP, Vite dev server `http://localhost:5173/task-management/`, mount `<Select showSearch options=[Alpha one, Alpha two, Alpha three] />`): gõ `alpha`, phím ArrowDown × 2 cho `data-lead = "Alpha two"`, Enter → `onChange` nhận `['a2']`, popup đóng. Probe DOM đã dọn sạch.

## Ghi chú

- Không có warning nào bị bỏ qua. Không commit file này theo chỉ dẫn của orchestrator.
