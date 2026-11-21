---
phase: 49-design-system-foundation
plan: 05
subsystem: ui
tags: [antd-wrappers, status-color-map, complex-controls, token-policy, d-12]

requires:
  - phase: 49-design-system-foundation
    provides: tokens.contract.ts helpers, tokens.ts statusColorMap, Button/Icon wrapper pattern from plan 03, input/overlay wrappers and controls.test.tsx from plan 04

provides:
  - Tag/StatusTag/CheckableTag, Badge and StatusDot reading the single D-12 status map in both themes
  - 12 complex control wrappers (Table/Form/DatePicker/TimePicker/Menu/Tooltip/Popover/Tree/Splitter/Mentions/TreeSelect/Upload) as real token-aware swap points
  - Consumed prop types re-exported as type-only exports for the plan 07 barrel

affects:
  - Plan 07 finalizes the same-name barrel and adds the status-parity test in controls.test.tsx
  - Plan 08 coverage gate consumes these files; Phase 50 migrates app imports to them

tech-stack:
  added: []
  patterns:
    - Status color hexes resolve only through getStatusTokens(status, mode) backed by statusColorMap; no status literal in wrapper files
    - Wrapper defaults emitted as --ui-* custom properties so token-derived fractional fontSize never reaches inline font-size
    - Consumed AntD statics mirrored as named exports (FormItem, TableSummary, DateRangePicker, SplitterPanel, etc.) without empty sub-wrapper files

key-files:
  created:
    - src/components/ui/tag.tsx
    - src/components/ui/badge.tsx
    - src/components/ui/status-dot.tsx
    - src/components/ui/table.tsx
    - src/components/ui/form.tsx
    - src/components/ui/date-picker.tsx
    - src/components/ui/time-picker.tsx
    - src/components/ui/menu.tsx
    - src/components/ui/tooltip.tsx
    - src/components/ui/popover.tsx
    - src/components/ui/tree.tsx
    - src/components/ui/splitter.tsx
    - src/components/ui/mentions.tsx
    - src/components/ui/tree-select.tsx
    - src/components/ui/upload.tsx
  modified: []

key-decisions:
  - "Status surfaces call useThemeMode() and pass the active mode to getStatusTokens, so the exact light/dark D-12 hex is rendered rather than a light-only default"
  - "Tag applies token metrics through --ui-control-* custom properties and a CSS var font-size; complex wrappers use the same pattern to avoid fractional inline font-size"
  - "AntD statics actually consumed by the app are mirrored as named exports from each wrapper file; no bare `export { X } from 'antd'` and no empty sub-wrapper files"
  - "Barrel index.ts, controls.test.tsx parity cases and all app call-site migration stay outside this plan, owned by plan 07 and Phase 50"

patterns-established:
  - "One policy prop per wrapper at most; AntD props otherwise pass through unchanged"
  - "Every wrapper visibly calls getSharedControlTokens or getStatusTokens, satisfying the inventory pass-through gate"
  - "Type-only re-exports carry consumed prop/ref types into the plan 07 barrel without runtime surface"

requirements-completed: [CTRL-01, CTRL-05, CTRL-06, GUARD-03]

duration: ~7min
completed: 2026-11-21
---

# Phase 49 Plan 05: Design System Foundation — Status & Complex Control Wrappers Summary

**Fifteen token-backed AntD wrappers with all three status surfaces resolving hexes from the single D-12 statusColorMap**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-11-21T08:30:13Z
- **Completed:** 2026-11-21T08:37:35Z
- **Tasks:** 3/3
- **Files modified:** 15 (all created; no barrel, test or app file touched)

## Accomplishments

- `Tag`/`StatusTag`/`Badge`/`StatusDot` all call `getStatusTokens(status, mode)` from `tokens.contract.ts`; the active theme comes from `useThemeMode()`, so light and dark resolve the exact locked map values with zero literal status hex in any wrapper.
- Seven primary complex controls (Table, Form, DatePicker, TimePicker, Menu, Tooltip, Popover) and five tree/data-entry controls (Tree, Splitter, Mentions, TreeSelect, Upload) are real one-file swap points; each calls a contract helper and emits token-derived custom properties.
- Consumed AntD statics are mirrored under wrapper-owned names: `FormItem`, `FormList`, `useForm`, `useWatch`, `TableSummary`, `DateRangePicker`, `TimeRangePicker`, `MenuItem`/`MenuSubMenu`/`MenuItemGroup`, `TreeNode`, `DirectoryTree`, `SplitterPanel`, `MentionsOption`, `TreeSelectNode`/`SHOW_*`, `UploadDragger`/`UPLOAD_LIST_IGNORE`.
- Consumed prop/ref types (`TreeDataNode`, `UploadProps`, `UploadFile`, `MentionsRef`, `TreeSelectProps`, etc.) are re-exported as `export type` for the plan 07 barrel.

## Task Commits

1. **Task 1: Wrap status controls on the single D-12 color map** — `1ed7e2c4` (feat)
2. **Task 2: Wrap primary complex controls (Table/Form/DatePicker/Menu/Tooltip/Popover)** — `98f15f98` (feat)
3. **Task 3: Wrap tree/data-entry complex controls** — `6f953ea0` (feat)

## Files Created/Modified

- `src/components/ui/tag.tsx` — Tag + StatusTag + CheckableTag, status-token colors and token font/padding
- `src/components/ui/badge.tsx` — Badge with status policy prop mapped to the shared map
- `src/components/ui/status-dot.tsx` — TaskMate StatusDot, third D-12 surface, size from shared contract
- `src/components/ui/table.tsx` — Table with density policy and token padding/font custom properties
- `src/components/ui/form.tsx` — Form with label/validation policy, mirrored Form statics
- `src/components/ui/date-picker.tsx` — DatePicker + DateRangePicker with shared metrics
- `src/components/ui/time-picker.tsx` — TimePicker + TimeRangePicker with shared metrics
- `src/components/ui/menu.tsx` — Menu with token row height/icon size, mirrored statics
- `src/components/ui/tooltip.tsx` — Tooltip with token-derived font and width scale
- `src/components/ui/popover.tsx` — Popover with the same width scale policy
- `src/components/ui/tree.tsx` — Tree with token row metrics, TreeNode/DirectoryTree statics
- `src/components/ui/splitter.tsx` — Splitter with token handle size, Panel static
- `src/components/ui/mentions.tsx` — Mentions with shared input metrics and type re-exports
- `src/components/ui/tree-select.tsx` — TreeSelect with shared metrics and SHOW_* statics
- `src/components/ui/upload.tsx` — Upload with shared metrics, Dragger/LIST_IGNORE statics

## Decisions Made

- Status wrappers read the active mode through `useThemeMode()` instead of relying on `getStatusTokens`'s light default; this is what makes both themes render the exact D-12 hex.
- Fractional `sharedTokens.fontSize` (13.5px) is never written to inline `font-size`; wrappers emit `--ui-control-*` custom properties, and `Tag` uses `var(--font-size-small)` for its visible label size, matching the established Button/Input policy.
- Tooltip/Popover expose a closed `widthScale` policy (`md`/`lg`) derived from `controlHeight`; callers cannot inject raw CSS width.
- AntD statics consumed by the app are attached as named exports from each wrapper file rather than empty re-export sub-wrappers, keeping D-03's one-file-per-control rule intact.

## Deviations from Plan

None. Plan executed as written; no app migration, barrel edit, or test edit performed.

### Auto-fixed Issues

None. Type-level corrections during implementation (AntD 6 `BadgeProps.status` collision, `CheckableTagProps` import path, `FormProps.children` narrowing, `RangePickerProps`/`TooltipPlacement` deep import paths, `MentionsOptionProps` deep import) were compile adjustments within the planned files, committed with their tasks; no behavior or scope changed.

**Total deviations:** 0.
**Impact on plan:** None.

## Issues Encountered

- AntD 6.6.5 does not export `CheckableTagProps`, `TooltipPlacement`, `MentionsOptionProps` or date `RangePickerProps` from the package root; imported them from their declared deep paths with type-only imports. These compile away and add no runtime import surface.
- `BadgeProps.status` in AntD 6 collides with the TaskMate `StatusKind` union, so the wrapper omits the AntD prop and supplies `color` from the D-12 map instead.
- `eslint.config.mjs` does not exist yet (plan 08 owns it), so `npx eslint` could not run. Local verification used `npx tsc --noEmit`, the node per-file contract gates, and scoped Vitest paths only. No lint or full-suite run was attempted.

## User Setup Required

None.

## Known Stubs

None. Every wrapper applies token-derived defaults and forwards real AntD components; no placeholder UI, TODO, mock data, or empty re-export was introduced.

## Threat Flags

None. The wrapper files add no network endpoint, auth path, file access pattern or schema change. Threat register mitigations T-49-14 (status hexes only from the map), T-49-15 (visible contract call in every wrapper), and T-49-18 (inventory-driven coverage) are satisfied by construction; T-49-19 type-only exports compile away. Status parity and full scanner coverage remain plan 07/08 gates.

## Next Phase Readiness

- Plan 07 can finalize `src/components/ui/index.ts` and add status-parity cases to `controls.test.tsx` against these three surfaces in both themes.
- Plan 08 coverage gate will accept all 15 files (visible contract call, no bare re-export).
- Phase 50 can migrate app imports to these same-name wrappers without changing call-site props beyond the documented policy props.

## Self-Check: PASSED

- All 15 created wrapper files exist on disk.
- Task commits `1ed7e2c4`, `98f15f98`, `6f953ea0` are present in `git log`.
- `npx tsc --noEmit` exits 0; node gate confirms all 15 wrappers call a contract helper; no bare AntD re-export found.
- Scoped Vitest: 3 files / 24 tests pass (`antdInventory.test.ts`, `tokens.test.ts`, `controls.test.tsx`) with `--bail=1`; no full suite run.

---
*Phase: 49-design-system-foundation*
*Completed: 2026-11-21*
