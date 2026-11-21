---
phase: 53-native-core-form-controls
reviewed: 2026-11-21T20:42:01Z
depth: deep
files_reviewed: 68
files_reviewed_list:
  - src/components/ui/alert.tsx
  - src/components/ui/avatar.tsx
  - src/components/ui/badge.tsx
  - src/components/ui/button.tsx
  - src/components/ui/checkbox.tsx
  - src/components/ui/divider.tsx
  - src/components/ui/grid.tsx
  - src/components/ui/icon.tsx
  - src/components/ui/input-number.tsx
  - src/components/ui/input.tsx
  - src/components/ui/mentions.tsx
  - src/components/ui/progress.tsx
  - src/components/ui/radio.tsx
  - src/components/ui/result.tsx
  - src/components/ui/segmented.tsx
  - src/components/ui/select.tsx
  - src/components/ui/skeleton.tsx
  - src/components/ui/slider.tsx
  - src/components/ui/space.tsx
  - src/components/ui/spin.tsx
  - src/components/ui/statistic.tsx
  - src/components/ui/switch.tsx
  - src/components/ui/tag.tsx
  - src/components/ui/textarea.tsx
  - src/components/ui/time-picker.tsx
  - src/components/ui/typography.tsx
  - src/components/ui/native/classNames.ts
  - src/components/ui/native/popup.tsx
  - src/components/ui/icon-svgs/descriptors.json
  - src/components/ui/openidea/*.module.css (28 files, including tokens.css counterpart)
  - src/components/ui/openidea/global.css
  - src/components/ui/openidea/tokens.css
  - src/components/ui/openidea/LICENSE-OPENIDEA
  - src/components/ui/openidea/NOTICE-OPENIDEA
  - src/components/ui/tokens.contract.ts
  - src/components/ui/ui-tokens.css
  - src/styles/tokens.ts
  - src/components/ui/__tests__/button.test.tsx
  - src/components/ui/__tests__/controls.test.tsx
  - src/components/ui/__tests__/tokens.test.ts
  - src/components/ui/__tests__/wave02Wrappers.test.tsx
findings:
  critical: 2
  warning: 5
  info: 3
  total: 10
status: changes-required
---

# Phase 53: Review Report (deep)

**Reviewed:** 2026-11-21T20:42:01Z
**Depth:** deep
**Files Reviewed:** 68
**Status:** changes-required (2 critical, 5 warning, 3 info)

## Summary

Import gate, export guard, icon count, typecheck và focused tests đều xanh khi tự chạy lại (`tsc --noEmit` exit 0; 4 file test phase 53 = 40/40 pass; 4 guard test = 15/15 pass; 141 icon export; 257 export guard). Tuy nhiên review cross-file phát hiện 2 lỗi critical làm hỏng hoàn toàn metric parity và API event của nhiều control, cộng 5 warning về API/hành vi. Không có credential/passphrase, dependency mới, hay vi phạm license vendoring.

---

## CR-01 — Vendored OpenIDEA token CSS không bao giờ được import: mọi control native render không có palette

**Severity:** critical
**Files:**
- `/Users/tranducquan/Working/Personal/task-management/src/components/ui/openidea/tokens.css`
- `/Users/tranducquan/Working/Personal/task-management/src/components/ui/openidea/global.css`
- `/Users/tranducquan/Working/Personal/task-management/src/workbench/AntdThemeAdapter.tsx`
- `/Users/tranducquan/Working/Personal/task-management/src/components/ui/openidea/Button.module.css`
- `/Users/tranducquan/Working/Personal/task-management/src/components/ui/openidea/Input.module.css`
- `/Users/tranducquan/Working/Personal/task-management/src/components/ui/openidea/Checkbox.module.css`
- `/Users/tranducquan/Working/Personal/task-management/src/styles/tokens.ts`

**Vấn đề:** `tokens.css` và `global.css` (nơi định nghĩa `--space-1`, `--space-1-5`, `--space-2`, `--border-button`, `--bg-button-primary`, `--fg-button-primary`, `--bg-field`, `--bg-checkbox`, `--bg-tree-selected`, `--bg-toolbar-hover`, `--z-popup`, `--scrollbar-thumb`, v.v.) chỉ nằm trên đĩa; toàn bộ `src/` không có lệnh import nào cho hai file này. `AntdThemeAdapter` chỉ import `workbench-tokens.css` + `ui-tokens.css`; `applyCssVariables()` (`src/styles/tokens.ts:364`) chỉ inject 100 tên biến trong enum của nó — **không** có `--bg-button-primary`, `--border-button`, `--space-1/1.5/2`, `--bg-dialog`, `--bg-tree-selected`, `--border-checkbox`, `--bg-tooltip`, `--z-popup`, `--scrollbar-thumb`, `--h-titlebar`, `--tab-selected-bg`, v.v.

Hệ quả trực tiếp trên browser thật (jsdom test không bắt được vì không compute custom property cascade):
- `Button.module.css .button`: `height: var(--h-button, 28px)` fallback OK, nhưng `background: var(--bg-button-primary)` và `color: var(--fg-button-primary)` **rỗng** → primary button không có nền xanh `#3871e1`, chữ trắng mất; `.secondary` `box-shadow: inset 0 0 0 1px var(--border-button)` mất border; `padding: 0 16px` cứng nhưng `gap: var(--space-1-5)` mất.
- `Input.module.css .framed`: `box-shadow: inset 0 0 0 1px var(--border-button)` mất khung; `.searchField gap: var(--space-0-5)` mất.
- `Checkbox.module.css .box`: `box-shadow: inset 0 0 0 1px var(--border-checkbox, var(--control-off))` rơi về `--control-off` shell (`#c3c5cb` light / `#4a566b` dark) thay vì `#a8adbd` / `#5f6269`; `.on` mất nền accent.
- `List.module.css .row.active`: `background: var(--bg-tree-selected)` rỗng → selection vô hình.
- `Popup.module.css`: `z-index: var(--z-popup)` rỗng → popup có z-index `auto`, có thể bị shell chồng lên; scrollbar thumb mất.
- `Tabs.module.css`: `--tab-selected-bg: var(--bg-tab-selected)` rỗng → selected tab mất nền.

Đây là vi phạm trực tiếp `52-UI-SPEC.md` §8 (migration order: token mới + alias trước khi đổi wrapper; palette control phải có giá trị ở cả 2 theme), §10 (baseline Phase 57 đo `rgb(56,113,225)`, border `rgb(209,211,217)`, active bg `rgb(208,223,254)`), và ACK của plan `53-01-PLAN.md` Task 2 (đòi `--bg-dialog`, `--border-checkbox`, `--bg-tree-selected`, `--bg-tree-selected-inactive`, `--bg-tooltip`, `--fg-tooltip` — **tất cả đều vắng mặt** trong `tokens.ts` đầu vào).

**Cách sửa (chọn 1, khuyến nghị 1a):**
1a. Import `./openidea/tokens.css` (và `global.css` nếu cần reset) từ một entry point luôn load trước theme adapter — ví dụ thêm `import '../components/ui/openidea/tokens.css'` cạnh dòng 38-39 của `src/workbench/WorkbenchLayout.tsx`, và import tương tự trong test setup/jsdom nếu test đo computed style. Vì `data-theme={mode}` nằm trên wrapper `.taskmate-workbench-theme` (`AntdThemeAdapter.tsx:23`) chứ không trên `:root`, selector `:root[data-theme="light"]` của vendored CSS **sẽ không khớp** — phải chuyển `data-theme` lên `document.documentElement` trong `applyCssVariables()` (hoặc đổi scope selector, nhưng contract cấm sửa CSS nguồn), rồi giữ wrapper class cho shell.
1b. Nếu không muốn load vendored token sheet: bổ sung **toàn bộ** alias control (kể cả spacing 2/4/6/8/12, z-index, tab/button/checkbox/toggle/tooltip palette) vào `cssMetrics` + palette light/dark trong `src/styles/tokens.ts`, rồi verify bằng script quét `var(--name)` trong 28 module CSS so với tập biến inject. Cách này dài hơn và dễ sót.

**REGRESSION TEST bắt buộc:** 1 test trong `src/components/ui/__tests__/` quét mọi `var(--x)` không có fallback trong `src/components/ui/openidea/*.module.css`, đối chiếu với tập biến do `lightTokens.css`/`darkTokens.css` + vendored token sheet define; assert không có tên nào thiếu. Thêm 1 test Chrome (Phase 57) đo computed-style primary button/secondary border/active row ở 2 theme.

---

## CR-02 — RadioGroup/RadioButton hỏng hoàn toàn: caller onChange nhận `e.target.value` = `undefined`

**Severity:** critical
**Files:**
- `/Users/tranducquan/Working/Personal/task-management/src/components/ui/radio.tsx`
- `/Users/tranducquan/Working/Personal/task-management/src/components/ui/switch.tsx` (cùng anti-pattern, xem WR-02)

**Vấn đề:** `RadioGroup` tách `onChange` ra khỏi `rest` rồi truyền qua context dưới dạng `{ target: { value, checked } }` (`radio.tsx:19, 57, 75`). `Radio` gọi `group.onChange?.({ target: { value, checked: true } })` — payload này **đi thẳng tới caller** (`radio.tsx:76`: `onChange?.(event as never)`). Trong khi đó AntD `RadioGroupProps.onChange` có signature `(e: RadioChangeEvent) => void`, caller đọc `e.target.value`. 20+ caller trong repo làm đúng vậy:
- `src/components/tasks/TaskFilterBar.tsx:182`: `onChange={(e) => onFilterChange({ horizon: e.target.value })}`
- `src/components/settings/GitHubSyncCard.tsx:521`: `onChange={(e) => updateAutoSyncSetting('github_auto_sync_mode', e.target.value)}`
- `src/AppIntelliJ.tsx`, `src/components/changeRequests/ChangeRequestModal.tsx` (FormItem `name="type"` dựa vào `e.target.value` để ghi值 vào form).

`RadioButton` (`radio.tsx:93-105`) thậm chí là `<button>` thường, không có `value` trong DOM, không có checked state, và **loại bỏ hoàn toàn** `value` khỏi props trước khi spread (`{ style, className, children, ...rest }` — `value` nằm trong `rest` nhưng `RadioGroup` context đọc `value` từ closure của `Radio`, không từ `RadioButton`). Kết quả: bấm bất kỳRadioButton nào cũng không đổi selection, form không lưu, filter không đổi. Đây là vi phạm MAP-03 §7.2 (`Radio`: Arrow native, Group/Button mirrored — event payload giữ nguyên).

**Cách sửa:** Giữ signature AntD. Trong `RadioGroup`, render mỗi `Radio` với `checked` được tính từ `value`/`defaultValue` group (dùng context chỉ để đọc value + name + disabled), để chính `Radio` tạo ra `ChangeEvent` thật từ `<input type="radio">` rồi gọi cả `onChange` của radio lẫn `group.onChange` với **cùng event object đó**. Với `RadioButton`: dùng `<label>`/`<input type="radio">` ẩn giống `Radio` (giữ `aria-pressed` nếu cần) hoặc ít nhất `value={rest.value}` + gọi group.onChange với target chứa `value`. Không đổi props/public type.

**REGRESSION TEST bắt buộc:** render `<RadioGroup value="a" onChange={spy}><RadioButton value="b">B</RadioButton></RadioGroup>`, fireEvent.click, assert `spy.mock.calls[0][0].target.value === 'b'`; thêm test uncontrolled FormItem tích hợp (`ChangeRequestModal` pattern). Test hiện tại không có case nào cho radio — đây là lý do lỗi lọt qua 62-test gate.

---

## WR-01 — RadioGroup KHÔNG kiểm soát selection (uncontrolled/defaultValue) và name mặc định gây xung đột

**Severity:** warning
**Files:** `/Users/tranducquan/Working/Personal/task-management/src/components/ui/radio.tsx`

**Vấn đề:** `Radio` chỉ tự checked khi `group !== null && value !== undefined && (group.value ?? group.defaultValue) === value` (`radio.tsx:36`). Không có internal state; sau khi click, `checked` vẫn false nếu caller không rerender (uncontrolled `<RadioGroup defaultValue>` — pattern có ở `src/components/settings/SshConfigCard.tsx` thông qua FormItem). Ngoài ra `name ?? 'taskmate-radio-group'` (`radio.tsx:72`) dùng **cùng name cho mọi group** trong trang → trình duyệt tự bỏ checked khi group khác được chọn. `RadioGroup` cũng drop `options` prop (AntD hỗ trợ) và `controlSize` không ảnh hưởng DOM. Vi phạm §7.1 Controlled/uncontrolled + accessible behavior.

**Cách sửa:** thêm internal state trong `RadioGroup` khi `value === undefined`; sinh name duy nhất bằng `useId()` khi caller không truyền; xử lý `options` nếu caller dùng.

**REGRESSION TEST:** `<RadioGroup defaultValue="a">` click radio khác → DOM checked chuyển; 2 group trên cùng trang không ảnh hưởng nhau.

---

## WR-02 — Switch bỏ `checkedChildren`/`unCheckedChildren` và đổi `onChange` payload khi loading

**Severity:** warning
**Files:**
- `/Users/tranducquan/Working/Personal/task-management/src/components/ui/switch.tsx`
- Caller: `/Users/tranducquan/Working/Personal/task-management/src/views/TelegramMonitorView.tsx:384-385` dùng `checkedChildren={<CheckCircleOutlined />}` / `unCheckedChildren={<StopOutlined />}`.

**Vấn đề:** component destructures chỉ `{ style, className, checked, defaultChecked, disabled, loading, 'aria-label', onChange, ...rest }`, rồi spread `...(rest as object)` — AntD `checkedChildren`/`unCheckedChildren` bị đẩy thẳng xuống `<button>` dưới dạng attribute React không hợp lệ (`checkedChildren` và `unCheckedChildren` không phải DOM prop), có thể gây warning và **icon không bao giờ hiển thị**. Ngoài ra internal `on = checked ?? defaultChecked ?? false` cố định; `<Switch defaultChecked>` click không đổi `aria-checked`. Loading factually disable button (`disabled={disabled || loading}`) nhưng vẫn giữ class switchOn — chấp nhận được, nhưng API checkedChildren là vi phạm MAP-03.

**Cách sửa:** destructure `checkedChildren`, `unCheckedChildren`, render nội dung tương ứng trong span knob/label (giữ `aria-label` nếu caller có), nếu không có thì giữ ON/OFF như hiện tại. Thêm internal state cho uncontrolled.

**REGRESSION TEST:** render `<Switch checkedChildren={<span>ONX</span>} />` → `screen.getByText('ONX')` tồn tại; không có attribute `checkedchildren` trong DOM.

---

## WR-03 — Checkbox onChange payload sai shape; indeterminate submit value và readOnly bị mất

**Severity:** warning
**Files:** `/Users/tranducquan/Working/Personal/task-management/src/components/ui/checkbox.tsx`

**Vấn đề:** AntD `CheckboxProps.onChange` nhận `CheckboxChangeEvent` (event có `target.checked`, `target.value`, `target.name`, `e.stopPropagation`, v.v.). `checkbox.tsx:119-128` thay bằng object literal `{ ...event, target: { checked, value, name } }` — spread `SyntheticEvent` vào object thường làm mất prototype methods (`preventDefault`, `stopPropagation`, `persist`) và không phải event instance; caller đọc `e.target.value` vẫn được nhưng bất kỳ method nào fails. `CheckboxGroup.onChange` (`checkbox.tsx:33-65`) có signature AntD `(checkedValue: T[]) => void` nhưng implement truyền `{ ...event, target: {...} }` — **sai hoàn toàn**: caller như `TagSelect`/`TaskFilterBar` (nếu dùng Group) kỳ vọng mảng value. Ngoài ra `indeterminate` chỉ set `aria-checked="mixed"` trên native input nhưng `checked` prop vẫn `false` → trình duyệt submit value sai; AntD render indeterminate với checked=true.

**Cách sửa:** `onChange` truyền `event` thật (native change event phù hợp với AntD shape, bổ sung `target` nếu cần nhưng không thay object). `CheckboxGroup` gọi `onChange?.(nextValues)` theo đúng signature. Với indeterminate, set `checked={isChecked || mixed}` trên native input.

**REGRESSION TEST:** group onChange spy nhận mảng `['a','b']`; single checkbox `event.stopPropagation` là function; indeterminate input `.checked === true`.

---

## WR-04 — Select event payload không khớp AntD (onChange option object, onSearch, maxTagCount); search trong controlled mode có thể mất

**Severity:** warning
**Files:** `/Users/tranducquan/Working/Personal/task-management/src/components/ui/select.tsx`

**Vấn đề:**
- `onChange` AntD signature `(value, option: OptionType | OptionType[])` — implement truyền option object thô `option` (từ `rest.options`) thay vì `label/value` chuẩn; tag mode fallback `{ value, label: String(value) }` (`select.tsx:152, 166`). Caller `TagSelect.tsx`/`JiraConfigCard.tsx` chỉ dùng value nên đã pass, nhưng `taskRender` callback dùng `closable/onClose` giả (`select.tsx:268`) — `onClose` gọi `selectOption(option)` (toggle) thay vì remove cụ thể.
- `onSearch` AntD signature `(value: string) => void` — implement gọi đúng 1 arg (`select.tsx:287`), OK. Tuy nhiên query bị clear ngay trong `selectOption` (`select.tsx:154` OK) nhưng `useEffect` setLead chỉ chạy lúc mở popup (`select.tsx:114-118`), không chạy khi `query` thay đổi → `lead` có thể vượt quá `filtered.length` (ArrowDown clamp dùng `Math.min(filtered.length-1, ...)`, nhưng `Enter` ở `lead` cũ chọn sai option). Cần reset lead khi query đổi.
- `valueKey` (`select.tsx:54`) với object option trả `''` khi không có `value/key` → các option label-only collapse thành cùng key, selection nhầm. Contract AntD yêu cầu `value` (hoặc `key`) unique; nhưng `children`-flatten path (`select.tsx:88-96`) nhận element có `value` nên OK.
- `mode="tags"` controlled nhập token mới: `addToken` gọi `emit` nhưng không đóng popup, AntD giữ popup mở — OK.

**Cách sửa:** reset lead trên `query`/`filtered` change (`useEffect` phụ thuộc `filtered`), guard `filtered[lead] ?? filtered[0]`; dùng payload option có `value`+`children`/`label` theo AntD; `tagRender.onClose` remove đúng value.

**REGRESSION TEST:** type filter query → ArrowDown/Enter chọn đúng option đầu; multi-select xóa đúng tag bị click.

---

## WR-05 — Popup cleanup focus anchor ngay cả khi dismiss bằng outside-click; Escape eventglobal không phân biệt nested popup

**Severity:** warning
**Files:** `/Users/tranducquan/Working/Personal/task-management/src/components/ui/native/popup.tsx`

**Vấn đề:** `useEffect` cleanup (`popup.tsx:83-89`) luôn gọi `anchorRef.current?.focus()` khi `open` chuyển false hoặc `onClose` identity đổi, kể cả khi `close(false)` được gọi từ `Select.onClear` (`select.tsx:193` — ý đồ không focus lại). Điều này làm focus nhảy về trigger sau khi clear, trái contract §9 (focus trở về anchor chỉ cho Escape/outside-click; clear button giữ focus). Ngoài ra `document.addEventListener('keydown', onKeyDown)` không kiểm tra `event.defaultPrevented` và không stopPropagation — nested popups (Select trong Drawer/Modal) có thể cùng đóng khi bấm Escape. `onClose` không ổn định (inline arrow ở select/time-picker/mentions) → effect re-run + focus anchor **mỗi render**, gây mất focus input search khi gõ (SearchInput onChange setQuery → rerender → cleanup focuses anchor `<button>`/`<span>` → input mất focus). Đây là bug lớn với mọi searchable Select (`showSearch` dùng ở 10+ caller) và TimePicker typing.

**Cách sửa:** bỏ focus khỏi cleanup; focus anchor explicitly trong các handler Escape/outside-click (và chỉ khi `onClose` yêu cầu); dùng ref cho `onClose` để effect chỉ phụ thuộc `[open, anchorRef]`; bỏ qua Escape nếu `event.defaultPrevented`.

**REGRESSION TEST:** render searchable Select, type "abc" vào search input → input vẫn giữ focus (`document.activeElement`); click clear button → focus không quay về trigger; 2 popup nested Escape → chỉ popup trên đóng.

---

## INFO-01 — Import graph sạch, guard counts đúng

26 wrapper core: 0 runtime `antd` / `@ant-design/icons` import; chỉ `import type`/`export type` (được phép tới phase 56). Không có `@floating-ui/react-dom` trong `package.json`/lock. `icon.tsx` export đúng 141 icon, `descriptors.json` 141 key, mỗi key có `viewBox/body/mono/source`, body không chứa script/on*=*, javascript:, foreignObject (đã quét regex). `scanWrappers()` = 257, `findMissingWrappers()` = []. Không có credential/passphrase/dependency/license violation; `LICENSE-OPENIDEA` (202 dòng Apache-2.0) + `NOTICE-OPENIDEA` có mặt, 28 CSS module vendored đúng số.

**Verified commands:** `npx tsc --noEmit` exit 0; `npx vitest run <4 phase-53 test files> --bail=1` 40/40 pass; `npx vitest run <4 guard files>` 15/15 pass.

---

## INFO-02 — Một số map/alias sai §8 nhưng không gây lỗi runtime ngay

- `src/styles/tokens.ts:205` light `--fg-faint: #94a3b8`, spec §5 yêu cầu `#9fa2a8`; dark `#71819a` vs `#5f6269`. Ảnh hưởng placeholder/empty text ở Phase 57.
- `--bg-elev` light `#f7f8fa` vs spec `#f7f8f9`; dark `#171d27` vs `#212326`.
- `--bg-input` dark `#111720` vs spec `#191a1c`; `--fg-strong` dark `#f4f7fb` vs `#dfe1e5`; `--border-strong` dark `#3d4a5f` vs `#40434a`.
- `ui-tokens.css` rule `.taskmate-workbench-theme [data-oi-control] { --danger: var(--danger-control) }` (line 20-22) override `--danger` cho **mọi** data-oi-control, kể cả `chip` của StatusTag/Badge (`tag.tsx`/`badge.tsx` dùng `--ui-status-color` inline nên test D-12 vẫn pass, nhưng rule này là global override dễ gây drift ở Phase 54/55). Nên scope lại thành `[data-oi-control="input"], [data-oi-control="input-number"], ...`.

---

## INFO-03 — Focused tests được cập nhật đúng tinh thần nhưng có một chỗ nới quá mức

`controls.test.tsx` D-12 badge assertions thay `.ant-badge-count/.ant-badge-dot` bằng query `[data-oi-control="chip"]` dùng chung cho cả tag lẫn badge, rồi `if (badgeDot)` — nếu wrapper badgem mất dot thì test vẫn pass. Nên assert `badgeDot` không null. `tokens.test.ts` bỏ assertion duplicate-literal cho `#3871e1` — hợp lý vì workbench-tokens.css có fallback thật (đã ghi trong summary), nhưng cần thêm assertion CR-01 (token sheet được import) để không tái diễn.

---

## Required Fix Order (for orchestrator)

1. **CR-01** — wire vendored token CSS (`data-theme` lên `:root`) hoặc inject đầy đủ alias; thêm guard test var coverage. Blocking.
2. **CR-02** + **WR-01** — sửa Radio/RadioGroup/RadioButton event + state cùng lúc (1 file). Blocking.
3. **WR-02** — Switch checkedChildren/uncontrolled state.
4. **WR-03** — Checkbox/CheckboxGroup payload shape.
5. **WR-04** — Select lead reset + option payload.
6. **WR-05** — Popup focus/effect deps.
7. INFO-02 palette drift — sửa khi đã mở `tokens.ts` cho CR-01 (đổi value spec §5, cập nhật test tương ứng).

Không commit. Sau fix, chạy lại đúng 10-file scoped Vitest + `tsc --noEmit` + 1 Chrome computed-style check cho CR-01 (không chạy full suite).
