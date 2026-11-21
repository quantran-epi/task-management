---
phase: 53-native-core-form-controls
reviewed: 2026-11-21T21:30:51Z
depth: deep
files_reviewed: 78
original_findings: 10
original_resolved: 10
new_findings: 3
new_resolved: 3
critical: 0
warning: 0
info: 1
status: clean
fix_report: .planning/phases/53-native-core-form-controls/53-REVIEW-FIX.md
---

# Phase 53: Final Re-Review Report (deep, after iteration-2 fixes)

**Reviewed:** 2026-11-21T21:30:51Z
**Depth:** deep
**Trạng thái:** clean (0 critical, 0 warning, 1 info không blocking)

## Tóm tắt

Tổng 13 finding (10 vòng đầu + 3 vòng re-review iteration 1) đã được sửa và kiểm chứng lại toàn bộ. Các commit fix iteration 2 (`72794011`, `03c8fe04`, `64089491`) chỉ đụng `src/components/ui/select.tsx`, `src/components/ui/radio.tsx`, `src/components/ui/__tests__/formControls.test.tsx` — không có thay đổi với Popup/Checkbox/Switch/token palette, nên không có bề mặt regression ở các thành phần đó.

Kiểm chứng độc lập: scoped Vitest **10 file / 84 test pass**, `npx tsc --noEmit` pass, `npm run build` pass, `npm run lint` exit 0 (1 warning INFO về directive thừa — xem INFO-04). Không có finding nào còn mở. Phase đạt `clean`.

---

## Verification: 10 finding vòng đầu

| Finding | Kết quả | Bằng chứng hiện tại |
|---|---|---|
| CR-01 | Resolved | `src/main.tsx:6-7` import `openidea/tokens.css` + `global.css` trước mọi style khác; `applyCssVariables()` đặt `data-theme` lên `document.documentElement` (`src/styles/tokens.ts:374`); `tokens.test.ts:135` guard import + quét `var(--x)`; Chrome computed style đúng 2 theme. Không bị iteration-2 đụng vào. |
| CR-02 | Resolved | `RadioGroupContext.onSelect` nhận `ChangeEvent<HTMLInputElement>` (`radio.tsx:30`); `Radio.handleChange`/`RadioButton` forward cùng native event instance; `handleSelect` giữ `stopPropagation`/`preventDefault`/`nativeEvent` và normalize `target`. Test `formControls.test.tsx:11,26` assert `target.value === 'b'` + method callable; FormItem lưu `'b'` (`:76`). RR-02 (residual) đã fix. |
| WR-01 | Resolved | `RadioGroup` có uncontrolled state `setInnerValue`, `useId()` name riêng, xử lý `options`; test group isolation pass (`formControls.test.tsx:54`). RR-03 (residual `defaultChecked`) đã fix tại `:47`. |
| WR-02 | Resolved | `checkedChildren`/`unCheckedChildren` render trong knob label; không leak DOM attr; uncontrolled `defaultChecked` toggle đúng (`formControls.test.tsx:101-118`). Không bị iteration-2 đụng vào. |
| WR-03 | Resolved | `Checkbox` forward native change event (methods còn nguyên); `CheckboxGroup.onChange` nhận mảng value; indeterminate `checked=true` + `aria-checked="mixed"` + submit value có trong FormData (`formControls.test.tsx:225-249`). Không bị iteration-2 đụng vào. |
| WR-04 | Resolved | option payload có `value`/`label`; `onSelect` normalize option; `tagRender.onClose` remove đúng tag; `valueKey` xử lý option object (`formControls.test.tsx:160-223`). RR-01 (residual lead reset) đã fix. |
| WR-05 | Resolved | `onCloseRef` giữ effect ổn định; search input giữ focus qua rerender/clear; Escape scope cho popup trên cùng; focus anchor trên Escape/outside-click; cleanup không còn focus anchor (`formControls.test.tsx:120-158`). Không bị iteration-2 đụng vào. |
| INFO-01 | Resolved | Import graph sạch, guard counts đúng; `npm run lint` exit 0 (app-wide `eslint src`). |
| INFO-02 | Resolved | 5 palette value theo §5; scope `--danger: var(--danger-control)` chỉ cho control thật; token test khóa giá trị. Chrome xác nhận primary `rgb(56,113,225)`, border `rgb(209,211,217)` light / `rgb(64,67,74)` dark, dark input `rgb(25,26,28)`. Không bị iteration-2 đụng vào. |
| INFO-03 | Resolved | `controls.test.tsx` assert `badgeDot` không null; test dùng `<Badge dot />`. Không bị iteration-2 đụng vào. |

---

## Verification: 3 finding re-review iteration 1

### RR-01 — Select lead reset mỗi rerender — RESOLVED

`src/components/ui/select.tsx:90-97`: thay `selectedKeys` tạo mới mỗi render bằng `selectedValueKey` primitive + `useMemo` theo `[multiple, selectedValueKey]`. Effect reset lead (`:130-134`) giờ phụ thuộc `selectedKeys` ổn định: `setLead` từ ArrowDown/ArrowUp/PointerMove rerender nhưng không đổi `current`, `selectedValueKey`, `filtered` → effect không chạy lại, lead được giữ. Guard `filtered[lead] ?? filtered[0]` vẫn còn ở `:199,324`.

Regression test `formControls.test.tsx:183-206`: gõ `alpha`, ArrowDown × 2, assert `data-lead = Alpha two`, Enter → `onChange('a2')`. Fix report ghi nhận test fail trên source HEAD cũ (`Alpha one`) rồi pass sau fix. Probe Chrome iteration 2 cũng xác nhận `data-lead = "Alpha two"` và `onChange(['a2'])`.

### RR-02 — RadioGroup.onChange thiếu method native — RESOLVED

`src/components/ui/radio.tsx:104-114`: `handleSelect(event: ChangeEvent<HTMLInputElement>)` lấy `selected = event.target.value`, giữ nguyên event instance (mọi method + `nativeEvent` còn sống), dùng `Object.defineProperty(event, 'target', { configurable: true, value: { value, checked: true, name } })` để normalize đúng `RadioChangeEventTarget`. `Radio` (`:62`) và `RadioButton` (`:183`) forward cùng event instance, không tạo object tổng hợp nữa.

Test `formControls.test.tsx:26-45` assert `target.value`, `target.checked`, `typeof stopPropagation === 'function'`, `typeof preventDefault === 'function'`, `nativeEvent` tồn tại, gọi method không throw. FormItem test cũ vẫn pass. Lưu ý: `event.currentTarget` vẫn là input thật; `nativeEvent.target` cũng vậy — chỉ `event.target` được normalize theo AntD, đúng ý đồ.

### RR-03 — Standalone RadioButton bỏ qua defaultChecked — RESOLVED

`src/components/ui/radio.tsx:159-161`: đổi `?? ownChecked` (không bao giờ chạy vì vế giữa trả `false`) thành ternary `checked ?? (group !== null && value !== undefined ? keyOf(group.checkedValue) === keyOf(value) : ownChecked)`, khớp `Radio` ở `:55`. Test `formControls.test.tsx:47-52` assert `input.checked === true` và `data-state="checked"`. Hành vi in-group giữ nguyên (test isolation + FormItem pass).

---

## Kiểm chứng đã chạy vòng final

- `npx vitest run` đúng 10 file scoped (button, controls, tokens, wave02, formControls, guardConfig, themeBroadcast, AntdThemeAdapter, mainBoot, shellRemoval): **10 file / 84 test pass** (81 baseline + 3 regression test mới). Không chạy full suite theo quy ước dự án.
- `npx tsc --noEmit`: pass, không lỗi.
- `npm run build`: pass (chỉ cảnh báo chunk size + INEFFECTIVE_DYNAMIC_IMPORT có từ trước, không liên quan phase 53).
- `npm run lint`: exit 0, 0 error, 1 warning (xem INFO-04).
- Kiểm tra git: 3 fix commit chỉ đổi `select.tsx`, `radio.tsx`, `formControls.test.tsx`; working tree sạch với source (chỉ 2 file planning đang mở). Không regression trên Popup/Checkbox/Switch/token palette — cả source lẫn test của các thành phần này không bị đụng, và scoped test của chúng vẫn xanh.

---

## INFO-04 (mới, không blocking) — Directive `eslint-disable` thừa trong select.tsx

**Severity:** info
**File:** `src/components/ui/select.tsx:96`

Dòng `// eslint-disable-next-line react-hooks/exhaustive-deps -- ...` do fix RR-01 thêm vào là directive chết: rule `react-hooks/exhaustive-deps` **không được bật** trong `eslint.config.mjs` (config chỉ bật `react-hooks/rules-of-hooks` ở `:35`). ESLint vì thế báo `Unused eslint-disable directive`. Deps `[multiple, selectedValueKey]` đã đúng (selectedValueKey là snapshot primitive của `current`), nên không cần suppress.

Tác động: bằng không — `npm run lint` vẫn exit 0, không ảnh hưởng runtime/type/build/spec. Không đưa vào `changes-required`. Dọn nếu muốn bằng cách xóa dòng comment (giữ lại comment giải thích ý đồ nếu cần, bỏ prefix `eslint-disable-next-line`).

---

## Kết luận

13/13 finding đã resolved. Không còn critical hay warning. Phase 53 đạt **clean**. Không commit.
