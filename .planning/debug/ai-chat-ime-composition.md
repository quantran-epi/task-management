---
status: fixed
trigger: "Gõ tiếng Việt trong AI chat panel bị nhảy loạn ký tự. Ví dụ gõ 'có bao nhiêu' ra 'ccocócó bbabaobao nhinhienhiêu'. Có session khác đang chạy; không đụng ConfigProfilesView.tsx / ConfigProfilesView.test.tsx, không chạy full vitest suite."
created: 2026-11-25
updated: 2026-11-25
---

# AI chat IME composition corruption

## Symptoms

- Expected: gõ "có bao nhiêu" → textarea giữ đúng "có bao nhiêu".
- Actual: textarea hiện "ccocócó bbabaobao nhinhienhiêu" — mọi trạng thái preedit của telex bị commit thành văn bản thật.
- Errors: không có error message.
- Timeline: regression gần đây (sau commit `a56992d8`? chưa chứng minh; commit đó chỉ thêm submit guard).
- Reproduction: mở AI chat panel, bật IME tiếng Việt, gõ "có bao nhiêu".
- Scope: AI chat panel (composer). Fullscreen TextArea nghi ngờ bị tương tự.

## Current Focus

- hypothesis: `ChatInputBar` controlled-value write-through — `onChange` at `src/components/ai/ChatInputBar.tsx:814` gọi `update()` đẩy mọi preedit value lên `onValueChange` → `AIChatDrawer.tsx:2651` patch registry → `useTabRuntimes.ts:19-43` notify coalesce 50ms → prop `value` cũ đi ngược xuống controlled `Mentions`/`TextArea` trong lúc IME còn compose, React ghi đè DOM, IME nối preedit mới → nhân chuỗi ký tự. Effect đồng bộ `internalValue` theo prop ở `ChatInputBar.tsx:141` làm vòng lặp chắc chắn hơn. `onChange` không có guard `isComposing`; fullscreen `TextArea` ở `:961` cũng không có.
- test: focused test mô phỏng `compositionStart` → nhiều `change` tạm → `compositionEnd` với controlled `value` + `onValueChange`, có `vi.advanceTimersByTime(50)` để kích hoạt notify; xác nhận DOM textarea không bị lùi/Không nhân ký tự.
- expecting: trong lúc composing, DOM tự quản lý preedit, parent không nhận value tạm, không có re-render ghi ngược value; chỉ commit value cuối ở `compositionEnd`. Cả composer thường lẫn fullscreen.
- hypothesis (fixed): local mirror drives DOM thay vì `value ?? internalValue`; onChange lúc composing chỉ `setInternalValue`, defer `onValueChange` tới `compositionEnd`; effect đồng bộ `value` bỏ qua khi composing. Fullscreen TextArea KHÔNG đổi — local state đồng bộ, không có echo 50ms nên không corruption; guard ở đó sẽ breaks normally.
- test: focused test `keeps IME preedit intact when controlled draft updates are coalesced` đã thêm vào `tests/ai/ChatInputBar.test.tsx`; mô phỏng ControlledHarness (setTimeout 50ms mirror) + compositionStart/3 change/compositionEnd, expect DOM 'có' + onDraftChange 1 lần duy nhất với 'có'.
- expecting: test chuyển xanh; scoped suite `npx vitest run tests/ai/ChatInputBar.test.tsx` pass; tsc sạch.
- next_action: xong — session-manager chạy scoped test thay debugger (debugger bị chặn permission), xanh 20/20, đã commit. Xem Resolution.

### Fix applied (chưa verify được)

`src/components/ai/ChatInputBar.tsx`:
- `effectiveValue = internalValue` (thay `value ?? internalValue`) → DOM bind local mirror, không bind echo bị coalesce 50ms của registry.
- `useState(value ?? '')` init mirror từ controlled value.
- `isComposingRef`: `onCompositionStart` set true; `onChange` lúc composing chỉ `setInternalValue`, KHÔNG gọi `onValueChange`; `onCompositionEnd` set false + `update(next)` emit đúng 1 lần giá trị commit.
- Effect sync `value → internalValue` skip khi `isComposingRef.current`.
- Fullscreen TextArea KHÔNG sửa: local state đồng bộ tức thì, không có echo 50ms; guard ở đó sẽ làm mất preedit.

`tests/ai/ChatInputBar.test.tsx`: thêm test `keeps IME preedit intact when controlled draft updates are coalesced` (ControlledHarness mirror 50ms + compositionStart/3 change/compositionEnd; expect DOM 'có' + onDraftChange 1 lần 'có').

Dry-run logic (chưa execute): trước fix, mỗi change emit → echo stale → 3 lần onDraftChange + DOM bị reset về echo; sau fix, chỉ compositionEnd emit → 1 lần, DOM 'có' ổn định.

Không commit: verification scoped chưa pass (blocked). Đã xóa helper script tạm.

## Evidence

- 2026-11-25: Đọc code thực tế `ChatInputBar.tsx:121-143,811-832,961-975`, `AiChatWidget.tsx:563-564`, `AIChatDrawer.tsx:2651-2659`, `useTabRuntimes.ts:19-43,82-89`; xác nhận `effectiveValue = value ?? internalValue` nên local mirror KHÔNG ảnh hưởng DOM khi chế độ controlled — prop `value` từ registry (notify coalesce 50ms) là nguồn DOM duy nhất. `Mentions` không guard `isComposing` trên `onChange`; `rc-input/TextArea` chỉ guard submit và count, không stop onChange lúc compose. React DOM `createAndAccumulateChangeEvent` → `restoreStateOfTarget` → `updateInput` ghi ngược `props.value` cũ sau mỗi change event.
- 2026-11-25: Điều tra tĩnh bởi subagent (read-only): `ChatInputBar.tsx:814-820`, `:121-143`, `:318-320`, `:961-970`, `AIChatDrawer.tsx:2651-2659`, `useTabRuntimes.ts:19-43,82-89`, `mentions.tsx:14-30`. `git diff a56992d8 HEAD` với composer/drawer rỗng → code hiện tại y hệt commit đó. Commit `a56992d8` chỉ thêm guard submit `isComposing/keyCode 229` ở `:318` và `:969`; test `tests/ai/ChatInputBar.test.tsx:119-130` chỉ check không submit lúc compose, không check value. Chưa repro bằng focused test/browser.

## Eliminated

- hypothesis: global shortcuts nuốt phím trong textarea. Eliminated: `useGlobalShortcuts.ts:183-225`, `useGlobalKeymap.ts:20-38`, `useKeyboardShortcuts.ts:26-38`, `useDoubleShift.ts:20-34`, `utils/keyboard.ts:14-36` đều check `isInputFocused`/tag `TEXTAREA`.
- hypothesis: commit `a56992d8` thay đổi onChange/value. Eliminated: `git diff a56992d8 HEAD` rỗng cho composer/drawer; commit chỉ thêm guard submit.
- hypothesis: textarea remount theo người dùng gõ. Eliminated: không có `key` theo value ở composer; autofocus chỉ phụ thuộc `open/disabled/isStreaming`.

## Verification

- 2026-11-25: `npx vitest run tests/ai/ChatInputBar.test.tsx` → `Test Files 1 passed (1)`, `Tests 20 passed (20)` (chạy bởi session-manager; debugger bị chặn permission nên dừng ở checkpoint human-action). Không chạy full suite. Không launch browser/dev server.

## Resolution

- root_cause: Composer bind DOM vào `effectiveValue = value ?? internalValue` — prop `value` là echo của registry bị coalesce ~50ms (`useTabRuntimes.ts`), mỗi preedit `onChange` đẩy value lên parent, echo stale đi ngược xuống trong lúc IME compose, React `restoreStateOfTarget` ghi đè DOM → nhân ký tự. Fullscreen TextArea dùng local state đồng bộ, không dính.
- fix: `ChatInputBar` dùng local mirror làm nguồn DOM; `isComposingRef` — `onChange` lúc compose chỉ `setInternalValue`, defer `onValueChange` tới `compositionEnd`; effect sync `value` bỏ qua khi composing; init mirror từ `value`. Fullscreen giữ nguyên.
- files: `src/components/ai/ChatInputBar.tsx`, `tests/ai/ChatInputBar.test.tsx` (thêm test IME coalesced echo).
- status: fixed, scoped test pass.
