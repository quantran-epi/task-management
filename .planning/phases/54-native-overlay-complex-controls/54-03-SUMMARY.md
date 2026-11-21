---
phase: 54-native-overlay-complex-controls
plan: 03
subsystem: ui
tags: [native-controls, popup, portal, focus, keyboard, dropdown, tooltip, popover, popconfirm, auto-complete, tree-select, date-picker, vitest]

# Dependency graph
requires:
  - phase: 54-01
    provides: native Popup/DialogSurface helpers, vendored OpenIDEA CSS modules, runtime-import guard CLI
  - phase: 54-02
    provides: native Menu/Tree/List primitives and AntD event-payload parity patterns
provides:
  - 7 native popup wrappers: dropdown, tooltip, popover, popconfirm, auto-complete, tree-select, date-picker
  - shared Popup placement contract: BODY portal, fixed positioning, 4px offset, flip/shift, outside/Escape close, anchor focus restore, nested-popup guard
  - focused 17-test popup suite for placement, keyboard, copy, statics, event payload and controlled-value behavior
affects: [54-04, 54-07, Phase 56, Phase 57]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "All popup wrappers reuse native Popup; DatePicker supplies control='select-popup' for the Phase 57 hook"
    - "Trigger wrappers own the ref so function-component children remain usable and caller handlers are untouched"
    - "AntD prop types stay type-only; statics, defaults, copy, event payloads and measurement hooks remain source-compatible"

key-files:
  created:
    - src/components/ui/__tests__/overlayPopups.test.tsx
  modified:
    - src/components/ui/dropdown.tsx
    - src/components/ui/tooltip.tsx
    - src/components/ui/popover.tsx
    - src/components/ui/popconfirm.tsx
    - src/components/ui/auto-complete.tsx
    - src/components/ui/tree-select.tsx
    - src/components/ui/date-picker.tsx

key-decisions:
  - "Native Popup owns all positioning and dismissal; no wrapper reimplements flip/shift or focus handling"
  - "Popconfirm uses an anchored bubble for the common case and DialogSurface for a controlled long description"
  - "Dropdown/AutoComplete/TreeSelect/DatePicker keep AntD-shaped payloads, static strategies and Vietnamese copy byte-for-byte"
  - "Ref-safe span anchors replace cloneElement/ref forwarding because live callers pass function-component buttons and tags"
  - "Controlled comboboxes keep a local text draft so callers can type custom values without changing their value state"
patterns-established:
  - "Focused popup suite asserts zero console.error and exercises real native event methods on wrapper payloads"
  - "SHOW_CHILD filtering is applied to the next checked-key set, never to a stale render snapshot"
  - "DatePicker display text resynchronizes on external value changes instead of freezing at mount"
requirements-completed: [NAT-02]

# Metrics
duration: 26min
completed: 2026-11-21
---

# Phase 54 Plan 03: Native Overlay Complex Controls Summary

**Seven popup wrappers now render OpenIDEA CSS-module DOM through the native BODY-portal Popup helper, with keyboard, focus, statics and AntD payload parity preserved**

## Performance

- **Duration:** 26 min
- **Started:** 2026-11-21T23:15:07Z
- **Completed:** 2026-11-21T23:41:28Z
- **Tasks:** 3
- **Files modified:** 8 (7 wrappers + 1 new focused test)

## Accomplishments

- Dropdown: native menu items with divider/danger/disabled, click/contextMenu/hover/focus triggers, open-state hooks and self-built DropdownButton; item and dropdown onClick payloads share the live native event.
- Tooltip: delayed hover/focus bubble, empty-title suppression, widthScale 18/28, `data-oi-control="tooltip"`, overlayStyle caller precedence and `data-placed` text hook.
- Popover: hover/click/focus triggers, token width scale, transparent surface and caller overlayStyle precedence.
- Popconfirm: 4px confirm bubble with `Xác nhận`/`Hủy`, danger tone via `--ui-status-color`, native event payloads for confirm/cancel, Escape/outside dismissal with anchor focus restore; controlled long confirmations use DialogSurface.
- AutoComplete: combobox input with 24px list rows, stable primitive Arrow lead, `aria-activedescendant`, onChange/onSelect payloads, disabled suppression, caller styles.root, self-built AutoCompleteOption and controlled custom-value drafts.
- TreeSelect: combobox with portal Tree, self-built TreeSelectNode and wrapper-defined SHOW_ALL/SHOW_CHILD/SHOW_PARENT, checked-key payloads with SHOW_CHILD filtering, width policy and caller style precedence.
- DatePicker/DateRangePicker: native day-grid popups using `control="select-popup"`, Dayjs tuple/range signatures, disabledDate, format support, external value sync and 7-column 24px rows.
- Focused suite: 17 tests cover portal/fixed/flip/shift, outside and Escape dismissal, nested-popup Escape, focus restore, tooltip delay/empty state, dropdown triggers, popconfirm tone/copy, combobox lead, tree-select strategies and picker callbacks; console.error spy stays clean.
- Gates: `tsc --noEmit`, `npm run lint`, native-import guard, all acceptance greps, and 6 scoped files / 64 tests green. No full Vitest run.

## Task Commits

Each task was committed atomically:

1. **Task 1: Dropdown + Tooltip + Popover native popup** - `39f46eb9` (feat)
2. **Ref-safe trigger wrappers** - `e014087c` (fix, preserves Task 1 API)
3. **Task 2: Popconfirm + AutoComplete native** - `a9702f5d` (feat)
4. **Task 3: TreeSelect + DatePicker + focused suite** - `1327f3b6` (feat)
5. **Controlled-value and payload regression fixes** - `1757a6b0` (fix, preserves Task 2/3 API)

**Plan metadata:** `15c83808` (docs: complete plan)

## Files Created/Modified

- `src/components/ui/dropdown.tsx` — native Dropdown + self-built DropdownButton and menu portal.
- `src/components/ui/tooltip.tsx` — native delayed tooltip portal with width scale and caller overlayStyle.
- `src/components/ui/popover.tsx` — native popover portal and exported WIDTH_SCALE.
- `src/components/ui/popconfirm.tsx` — native confirm bubble/dialog, tone map and Vietnamese copy.
- `src/components/ui/auto-complete.tsx` — native combobox, 24px options and self-built AutoCompleteOption.
- `src/components/ui/tree-select.tsx` — native tree combobox, SHOW_* statics and checked-key payloads.
- `src/components/ui/date-picker.tsx` — native day grid, DatePicker/DateRangePicker tuple behavior and `select-popup` hook.
- `src/components/ui/__tests__/overlayPopups.test.tsx` — 17 focused popup tests with console.error spy.

## Decisions Made

- Reused the Phase 53 Popup helper unchanged; wrapper-specific `control` values keep Phase 57 selectors stable.
- Kept all AntD imports type-only; statics are wrapper-defined values, never bare AntD re-exports.
- Used real DOM wrapper anchors for triggers: cloning caller children with a ref broke function-component Tooltip/Button/Dropdown callers.
- Applied SHOW_CHILD to the freshly checked key set so controlled callers receive child keys immediately.
- Preserved local drafts under controlled value for AutoComplete; live callers type custom model names before committing.
- Popconfirm cancellation now emits an event-shaped payload with callable native methods instead of `undefined`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] cloneElement/ref forwarding could not anchor function-component children**
- **Found during:** Task 1 (live caller shape review)
- **Issue:** Tooltip/Dropdown/Popover callers pass Button and Tag components; attaching a ref to those elements yields React warnings and a null anchor.
- **Fix:** Wrap children in a real DOM span that owns the ref and delegated trigger events.
- **Files modified:** `dropdown.tsx`, `tooltip.tsx`, `popover.tsx`, `overlayPopups.test.tsx`
- **Verification:** focused suite green; Chrome smoke test opened dropdown and popover portals with BODY/fixed placement.
- **Committed in:** `e014087c`

**2. [Rule 1 - Bug] Controlled AutoComplete could not accept custom typed values**
- **Found during:** post-Task 3 diff review (SystemModal/NineRouterConfigCard callers)
- **Issue:** Rendering directly from `rest.value` stopped the input from showing typed text while controlled.
- **Fix:** Keep a local draft synchronized from props, update it on typing and selection, and still emit caller onChange.
- **Files modified:** `auto-complete.tsx`, `overlayPopups.test.tsx`
- **Verification:** new regression test types `flux-dev` under `value=""` and asserts input text plus callback payload.
- **Committed in:** `1757a6b0`

**3. [Rule 1 - Bug] TreeSelect SHOW_CHILD filtered a stale selection**
- **Found during:** post-Task 3 diff review
- **Issue:** `commit` used the previous render's filtered keys, so a new checked child could be reported with an obsolete parent set.
- **Fix:** Apply the strategy to the freshly checked key array inside `commit`.
- **Files modified:** `tree-select.tsx`
- **Verification:** focused SHOW_CHILD test asserts the emitted array excludes parent keys.
- **Committed in:** `1757a6b0`

**4. [Rule 1 - Bug] DatePicker display text froze after mount**
- **Found during:** post-Task 3 diff review (FormItem/caller-controlled values)
- **Issue:** `text`/`texts` initialized from props but never followed later value changes.
- **Fix:** Synchronize display state from value props with effects for single and range pickers.
- **Files modified:** `date-picker.tsx`, `overlayPopups.test.tsx`
- **Verification:** new rerender test asserts single-picker text follows an external Dayjs change.
- **Committed in:** `1757a6b0`

**5. [Rule 2 - Missing Critical] Popconfirm cancellation lacked an event payload**
- **Found during:** post-Task 3 diff review
- **Issue:** Escape/outside cancellation called `onCancel(undefined)`, breaking AntD event-shape parity.
- **Fix:** Build a MouseEvent-shaped payload with key/domEvent fields and live native methods.
- **Files modified:** `popconfirm.tsx`
- **Verification:** focused suite asserts click payloads; cancellation path now uses the same helper.
- **Committed in:** `1757a6b0`

---

**Total deviations:** 5 auto-fixed (5 correctness/API-parity fixes)
**Impact on plan:** All fixes are required for caller compatibility and API parity. No new dependency, no caller edit, no scope creep.

## Issues Encountered

- Browser smoke test on Vite dev confirmed native Tooltip, Dropdown and Popover portals are BODY children with `position: fixed`, and Escape closes the dropdown. Console showed six pre-existing errors from untouched Phase 53 Select/Button/DOM-nesting code, not from the seven wrappers here.
- `BottomToolWindow.test.tsx` still fails to find an accessible name matching `/fullscreen/i`; the source button's Tooltip title is `Maximize Panel` and was unchanged by this plan. It is a pre-existing selector/name mismatch outside 54-03 scope.
- No full Vitest run, per project rule.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

Ready for 54-04. 14 of 28 overlay/complex wrappers are native (54-01..54-03). Keep using `node scripts/check-native-imports.mjs <changed files>` and the `data-oi-control`/`data-state` hooks. DatePicker already exposes `control="select-popup"` for the Chrome hook planned in 54-07; caller selector migrations remain owned by 54-07.

---
*Phase: 54-native-overlay-complex-controls*
*Completed: 2026-11-21*
