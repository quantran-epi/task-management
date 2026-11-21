---
phase: 53-native-core-form-controls
plan: 03
subsystem: ui
tags: [openidea, native-controls, form-fields, portal-popup, accessibility, ant-migration]

requires:
  - phase: 53-native-core-form-controls
    provides: 53-01 vendored OpenIDEA CSS modules, native classNames/Popup helpers; 53-02 native core primitives
provides:
  - 6 native form-field wrappers (input, textarea, input-number, select, mentions, time-picker) using vendored CSS modules and no runtime AntD import
  - InputRef/TextAreaRef/MentionsRef compatible imperative handles for DocEditorPane/ChatInputBar/QuickAddBar/TasksView
  - Native BODY portal listboxes with 24px rows, keyboard lead, Escape/outside-click close and focus return
affects: [53-native-core-form-controls plans 04-05, 54-overlay-complex-controls, 56-antd-removal, 57-visual-measurement]

tech-stack:
  added: []
  patterns:
    - "AntD prop aliases remain type-only while native DOM replaces runtime wrappers"
    - "data-oi-control/data-state/data-lead hooks are measurement-only, never API props"

key-files:
  created: []
  modified:
    - src/components/ui/input.tsx
    - src/components/ui/textarea.tsx
    - src/components/ui/input-number.tsx
    - src/components/ui/select.tsx
    - src/components/ui/mentions.tsx
    - src/components/ui/time-picker.tsx
    - src/components/ui/native/popup.tsx
    - src/components/ui/__tests__/controls.test.tsx
    - src/components/ui/__tests__/wave02Wrappers.test.tsx

key-decisions:
  - "InputRef/TextAreaRef/MentionsRef keep focus/blur/select, resizableTextArea.textArea and textarea members used by existing callers"
  - "InputNumber commits clamped numeric values on blur/Enter while ArrowUp/ArrowDown step with min/max/precision intact"
  - "Select/mentions/time-picker reuse the 53-01 Popup helper; Popup gains a control prop for per-wrapper measurement hooks"
  - "Dayjs value payloads for TimePicker/TimeRangePicker stay compatible with existing form handlers"

patterns-established:
  - "Wrapper S-FLD fields render native input/textarea with OpenIDEA Input.module.css classes and caller style precedence"
  - "Native listbox rows use translateY(i*24px), sizer n*24 and data-lead/aria-activedescendant"

requirements-completed: [NAT-01]

duration: ~19 min
completed: 2026-11-21
---

# Phase 53 Plan 03: Native Core Form Controls Summary

**Six native form-field wrappers with OpenIDEA CSS modules, BODY portal listboxes, and ref-compatible InputRef/TextAreaRef/MentionsRef handles**

## Performance

- **Duration:** ~19 min
- **Started:** 2026-11-21T19:37:52Z
- **Completed:** 2026-11-21T19:56:33Z
- **Tasks:** 4/4
- **Files modified:** 9

## Accomplishments
- `Input`, `InputSearch`, `InputPassword`, `Textarea`/`TextArea` render native inputs/textareas with `controlStyle`, `controlWidthStyle`, `DEFAULT_TEXTAREA_MIN_ROWS`, clear/password affordances and correct `aria-invalid` double-ring state.
- `InputNumber` renders a native numeric field with min/max/precision clamping, ArrowUp/Down stepping, `formatter`/`parser` support and the unchanged generic `InputNumberProps<T extends ValueType>`.
- `Select` renders a native trigger plus BODY portal listbox with `allowClear=true` default, 24px rows, lead keyboard navigation and AntD-shaped `onChange`/`onSearch` payloads.
- `Mentions` and `TimePicker`/`TimeRangePicker` render native textarea/input fields with portal suggestion/time grids; `MentionsOption`, `TimeRangePicker`, type-only re-exports and Dayjs payloads remain intact.
- Focused gates pass: tsc, lint and 32 tests in `controls.test.tsx`, `wave02Wrappers.test.tsx`, `button.test.tsx`; no runtime AntD import in the six wrappers.

## Task Commits

Each task was committed atomically:

1. **Task 1: Input/Textarea native + ref contract (S-FLD)** - `a9701a9e` (feat)
2. **Task 2: InputNumber native generic (S-FLD)** - `b860f9a8` (feat)
3. **Task 3: Select native + portal listbox (S-SEL/S-LST)** - `586daa0d` (feat)
4. **Task 4: Mentions + TimePicker native popup (S-FLD + S-SEL/N-30)** - `d65fdcd2` (feat)
5. **Post-task TimeRangePicker popup lifecycle fix** - `0df05b76` (fix)

**Plan metadata:** pending metadata commit.

## Files Created/Modified

- `src/components/ui/input.tsx` - native S-FLD input/search/password with shared metric helpers and full InputRef shape.
- `src/components/ui/textarea.tsx` - native multiline field with `resizableTextArea.textArea` and token-derived autoSize.
- `src/components/ui/input-number.tsx` - native numeric field with stepper, clamping and preserved generic props.
- `src/components/ui/select.tsx` - native combobox trigger and BODY portal listbox with clear/token/multi-mode behavior.
- `src/components/ui/mentions.tsx` - native textarea with @-trigger suggestions and MentionsRef compatibility.
- `src/components/ui/time-picker.tsx` - native time field/range with BODY portal grids and Dayjs payloads.
- `src/components/ui/native/popup.tsx` - Popup gains an optional `control` measurement hook while defaulting to `popup`.
- `src/components/ui/__tests__/controls.test.tsx` - input-family assertions now target native `data-oi-control` hooks without lowering criteria.
- `src/components/ui/__tests__/wave02Wrappers.test.tsx` - ref assertions lock `focus()`, `input` and `resizableTextArea.textArea` contracts.

## Decisions Made

- Kept every AntD prop alias as `import type`; callers and barrel exports remain unchanged until Phase 56.
- Implemented clear/password/token affordances with native buttons and SVG so accessible names stay explicit.
- Reused the 53-01 Popup helper for all three popup fields rather than duplicating portal placement code.
- TimePicker defaults to `HH:mm:ss` and parses caller formats such as `HH:mm` with dayjs `customParseFormat`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TimeRangePicker popup stayed mounted after selection**
- **Found during:** Post-task self-check after Task 4
- **Issue:** Range grid remained open because the range variant had no open-state lifecycle.
- **Fix:** Added focus-open/close-after-pick state with focus return to the active input.
- **Files modified:** `src/components/ui/time-picker.tsx`
- **Verification:** tsc, lint and focused UI tests pass.
- **Committed in:** `0df05b76`

---

**Total deviations:** 1 auto-fixed (Rule 1 bug). **Impact:** Local lifecycle fix; no API or scope change.

Known contract limits, accepted by the plan: advanced Select props not implemented natively (`dropdownRender`, `popupRender`, virtual scrolling, `tagRender` beyond simple native tag slots) remain in the prop type and are ignored at runtime. Mentions `onChange` delivers the native text value without the AntD mention-metadata second argument; the active caller consumes only the text value.

## Issues Encountered

- AntD 6 does not export `TextAreaProps`/`TextAreaRef` from the top-level `antd` module; imported the identical types from `antd/es/input/TextArea` while preserving the exported `TextareaProps` surface.
- `rc-picker` declares `format` as `FormatType | FormatType[]`, so the native implementation narrows it to a string at the wrapper boundary; current callers pass `HH:mm`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 53-04. The remaining core/form wrappers can consume these native S-FLD/select surfaces without caller changes. Phase 56 must remove the lingering type-only AntD imports and the ESLint override; Phase 57 can measure the new `data-oi-control` hooks.

---
*Phase: 53-native-core-form-controls*
*Completed: 2026-11-21*
