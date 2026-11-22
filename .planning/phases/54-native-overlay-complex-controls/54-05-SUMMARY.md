---
phase: 54-native-overlay-complex-controls
plan: 05
subsystem: ui
tags: [native-controls, form, field-store, validation, collapse, pagination, breadcrumb, card, descriptions, vitest]

# Dependency graph
requires:
  - phase: 54-01
    provides: native CSS module/className conventions and runtime-import guard
  - phase: 54-02
    provides: vendored OpenIDEA CSS modules and Button/Chip/Input primitives
  - phase: 54-03
    provides: focused-suite conventions and event payload parity patterns
  - phase: 54-04
    provides: composite wrapper precedent and 22 native wrappers baseline
provides:
  - 6 native structural wrappers: form, collapse, pagination, breadcrumb, card, descriptions
  - native form field store with eight caller methods, FormList/useWatch and AntD-shaped validation payloads
  - observable expanded/selected/disabled/loading/empty/error hooks on converted wrappers
  - 9-test focused structural suite with clean console
affects: [54-06, 54-07, Phase 56, Phase 57]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Form owns an in-memory field store and subscribe/getVersion snapshots; useWatch and FormItem re-render via useSyncExternalStore"
    - "Controlled/uncontrolled wrappers use the activeKey === undefined ? internal : caller ternary, keeping caller value authoritative"
    - "Measurement hooks stay on data-oi-control/data-state; accessible names and AntD callbacks remain unchanged"

key-files:
  created:
    - src/components/ui/__tests__/overlayStructural.test.tsx
  modified:
    - src/components/ui/form.tsx
    - src/components/ui/collapse.tsx
    - src/components/ui/pagination.tsx
    - src/components/ui/breadcrumb.tsx
    - src/components/ui/card.tsx
    - src/components/ui/descriptions.tsx

key-decisions:
  - "FormInstance keeps an AntD-compatible generic type alias while runtime methods are native; useForm/useWatch preserve generic call sites without caller edits"
  - "Form values are plain nested objects; setFields/resetFields and errorFields use NamePath arrays so ChangeRequestModal and TaskDrawer list fields keep working"
  - "CollapsePanel/Collapse share one context so both items[] and children panels render, with disabled panels suppressing Enter/Space/click"
  - "Pagination and Breadcrumb emit real aria-current=\"page\" and stable data hooks while caller styles.root/style are applied after token defaults"
  - "Breadcrumb renders Fragment-wrapped li/li separators directly under ol; no display:contents wrapper that would break list semantics"
patterns-established:
  - "Form validation rejects with an Error carrying errorFields/values/outOfDate, matching callers that inspect err.errorFields"

requirements-completed: [NAT-02]

# Metrics
duration: 36 min
completed: 2026-11-22
---

# Phase 54 Plan 05: Native Structural Wrappers Summary

**Six structural AntD wrappers now render native OpenIDEA DOM with a self-owned form field store, AntD-shaped validation payloads and observable state hooks**

## Performance

- **Duration:** 36 min
- **Started:** 2026-11-22T00:46:30Z
- **Completed:** 2026-11-22T01:25:35Z
- **Tasks:** 3
- **Files modified:** 7 (6 wrappers + 1 new focused test)

## Accomplishments

- Form: native field store with 8 caller methods, stable `useForm()` instance, `useSyncExternalStore` subscriptions, FormList render-prop with stable UUID keys, FormErrorList, required/pattern/min/max/len/validator rules, Enter submit, `onFinish` values and `onFinishFailed` `{values,errorFields,outOfDate}` payload, `aria-invalid` and `*`/optional label policy. Caller `layout` and `style` win; `requiredMark` defaults to true.
- Collapse: native accordion with `aria-expanded`, controlled/uncontrolled `activeKey`, accordion mode, disabled panels, Enter/Space toggle, `onChange(key)` payload, `items[]` plus `CollapsePanel` children and nested-panel event isolation.
- Pagination: native prev/next icon buttons, page chips, ellipsis and page-size select; active chip `aria-current="page"`, boundary disabled state, `onChange(page,pageSize)` and `onShowSizeChange(current,size)`; `styles.root` applies after tokens.
- Breadcrumb: native `nav > ol` with item links, separator handling for both `items[]` and statics, last-item `aria-current="page"`, and `style` caller precedence.
- Card/Descriptions: native window/body/footer card with loading `aria-busy`, hover/empty hooks, CardGrid/CardMeta statics and caller copy preserved; native `dl`/`dt`/`dd` description pairs with bordered variant and `data-state="empty"` for empty values.
- Focused suite: 9 tests cover submit/failed payloads, layout precedence, 8 methods/watch/list/error-list, collapse keyboard/disabled, pagination payload/boundaries, breadcrumb semantics, card states, description empty values and host state preservation; console.error spy stays clean.
- Gates: tsc, lint, native-import guard, structural suite, formControls and static guards all green (41 tests in 7 files). No full Vitest run.
- Browser check: Vite dev at `http://localhost:5173/task-management/` rendered Tasks and Settings; Settings shows 1 native form, 9 cards, 2 descriptions with valid `dd[data-state]` hooks and no new console errors attributable to this plan. Pre-existing console warnings from Select/Typography/Splitter remain outside plan scope.

## Task Commits

Each task was committed atomically:

1. **Task 1: Form native field store** - `cbeba35a` (feat)
2. **Task 2: Collapse/Pagination/Breadcrumb native** - `b2146671` (feat)
3. **Task 3: Card/Descriptions native + structural suite** - `c62238cc` (test)
4. **Breadcrumb list-semantics correction** - `277a6f04` (fix)

## Files Created/Modified

- `src/components/ui/form.tsx` — native field store, validation, FormItem/FormList/FormErrorList/useForm/useWatch/FormInstance.
- `src/components/ui/collapse.tsx` — native Collapse + CollapsePanel with shared context.
- `src/components/ui/pagination.tsx` — native Pagination with page/size payload parity.
- `src/components/ui/breadcrumb.tsx` — native Breadcrumb + statics with valid list DOM.
- `src/components/ui/card.tsx` — native Card + cardStyle + CardGrid/CardMeta.
- `src/components/ui/descriptions.tsx` — native Descriptions + DescriptionsItem.
- `src/components/ui/__tests__/overlayStructural.test.tsx` — 9 focused structural tests.

## Decisions Made

- Form validation failures reject with an Error carrying `errorFields`, `values` and `outOfDate`, matching callers that inspect `err.errorFields`; `submit()` separately invokes `onFinishFailed`.
- `FormItem` injects value and trigger handlers onto direct native children; custom fields like TagSelect already expose value/onChange.
- Pagination keeps internal state only for uncontrolled callers; controlled callers receive payloads and manage their own page state.
- Breadcrumb uses Fragment rather than a wrapper span so `ol` contains only `li` children.

## Deviations from Plan

**[Rule 1 - Bug] Breadcrumb list semantics** — Found during: Task 2 verification/browser check | Issue: initial span wrapper made `span` a direct child of `ol` | Fix: render item and separator as direct `li` children via Fragment | Files modified: `breadcrumb.tsx` | Verification: structural suite + Chrome Settings snapshot | Commit: `277a6f04`

**Total deviations:** 1 auto-fixed bug. **Impact:** none on API or caller behavior.

## Issues Encountered

- `controls.test.tsx` intentionally not run in this plan's gate: it still asserts legacy `.ant-*` selectors and is scheduled for 54-07 Task 1.
- Chrome dev console shows 5 pre-existing errors/warnings from untouched Select/Typography/Splitter code (`button` nesting, `optionType`, `buttonStyle`, `ellipsis`, missing resize handle); no new error from the six converted wrappers.
- No full Vitest run, per project rule.

## User Setup Required

None.

## Next Phase Readiness

Ready for 54-06. 24 of 28 overlay/complex wrappers are native; `data-oi-control`/`data-state` hooks remain stable for Phase 57 measurement. Caller selector migration remains owned by 54-07.

---
*Phase: 54-native-overlay-complex-controls*
*Completed: 2026-11-22*
