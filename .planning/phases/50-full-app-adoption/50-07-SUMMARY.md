---
phase: 50-full-app-adoption
plan: 07
subsystem: ui
tags: [antd, react, views, context-hooks, css-vars, codemod, adoption]

requires:
  - phase: 50-full-app-adoption
    provides: "50-04 wave-04 summary, adoption codemod, UI barrel, ThemeAppHolder, static-API and inline-style guards"
provides:
  - "22 migrated paths under src/views (21 view components + TasksViewActions test) using UI barrel imports only"
  - "All static message/notification/Modal.confirm calls in views converted to useMessage/useNotification/useTaskMateModal with contextHolder"
  - "wave-07.txt manifest of 22 paths driving staticApiGuard and inlineStyleSweep"
  - "Token-valued inline styles across all 22 migrated views replaced with CSS vars"
affects: [50-full-app-adoption wave 8-9, 50-UAT.md, eslint src final gate]

tech-stack:
  added: []
  patterns:
    - "Static sub-components (Descriptions.Item, Input.TextArea, Radio.Group, List.Item, Splitter.Panel, Empty.PRESENTED_IMAGE_SIMPLE) replaced with named barrel wrappers per D-03"
    - "Context-bound message instance named messageApi in MermaidAssistantView to keep message.loading avoidable under the guard"
    - "Inline token sweep maps fontSize 11/12/13.5 to --font-size-xs/small/ui, radius 6/8 to --radius-control, accent/secondary hexes to CSS vars"

key-files:
  created:
    - tests/fixtures/adoption/wave-07.txt
  modified:
    - src/views/AIPopoutView.tsx
    - src/views/AgentControlView.tsx
    - src/views/AiOfficeView.tsx
    - src/views/AnalyticsView.tsx
    - src/views/ChangeRequestDetailView.tsx
    - src/views/ChangeRequestsView.tsx
    - src/views/ConfigProfilesView.tsx
    - src/views/DashboardView.tsx
    - src/views/ItemInsightView.tsx
    - src/views/MermaidAssistantView.tsx
    - src/views/NotesPopoutView.tsx
    - src/views/NotesView.tsx
    - src/views/PlannerView.tsx
    - src/views/SettingsView.tsx
    - src/views/StaffDetailView.tsx
    - src/views/SystemCatalogView.tsx
    - src/views/SystemDetailView.tsx
    - src/views/TasksView.tsx
    - src/views/TeamWorkspaceView.tsx
    - src/views/TelegramMonitorView.tsx
    - src/views/TimerPopoutView.tsx
    - src/views/__tests__/TasksViewActions.test.tsx
    - src/components/ui/icon.tsx

key-decisions:
  - "Use named barrel wrappers (DescriptionsItem, TextArea, RadioGroup, etc.) instead of static sub-components; AntD value imports are forbidden in views per D-03"
  - "MermaidAssistantView binds the message instance as messageApi at component scope; the loading call stays messageApi.loading(..., 0) preserving duration 0 and hideLoading()"
  - "Badge statuses error/processing/default mapped to design-system StatusKind danger/accent/info; behavior change limited to status-dot palette in one view"
  - "Extend WrappedIconProps with tabIndex so the warning icon keeps its keyboard-focusable role=img contract"
  - "Inline sweep replaces only guard-matched token literals; near-token values outside the guard (e.g. #0369a1, #9ca3af) stay unchanged to avoid behavior change beyond D-08/D-09"

patterns-established:
  - "Every migrated view declares context hooks at component top, before any early return; modal consumers render {contextHolder} in the main return"
  - "TasksViewActions test renders under ThemeAppHolder and mocks useMessage via importOriginal, so hook-based notification flows are observable"

requirements-completed: [ADOPT-01, ADOPT-02]

duration: 11min
completed: 2026-11-21
---

# Phase 50 Plan 07: Full App Adoption — Views Summary

**All 21 view components and the TasksViewActions test moved to UI barrel imports and context hooks, with token-valued inline styles swept and a 22-path wave-07 manifest driving the adoption guards**

## Performance

- **Duration:** 11 min
- **Started:** 2026-11-21T14:05:49Z
- **Completed:** 2026-11-21T14:16:29Z
- **Tasks:** 2/2
- **Files modified:** 24 (23 in Task 1 + 16 in Task 2, overlapping views)

## Accomplishments
- Codemod rewrote all runtime `antd`/`@ant-design/icons` imports in `src/views` to the `src/components/ui` barrel; only `import type` remains.
- Converted 128 static API call sites across 14 views to `useMessage()`, `useNotification()`, and `useTaskMateModal()`; every modal confirm now renders `{contextHolder}`.
- Replaced AntD static sub-components with named wrappers (`DescriptionsItem`, `ListItem`, `RadioGroup`, `TextArea`, `SplitterPanel`, `EmptyImageSimple`, etc.) to keep view imports barrel-only.
- Swept 105 token-valued inline literals across 15 views to CSS vars; the adoption inline sweep reports zero violations on all 22 manifest paths.
- Wrote `tests/fixtures/adoption/wave-07.txt` (22 paths); static-API and inline-style guards both pass with it.

## Task Commits

1. **Task 1: Codemod + static API → hook cho 22 view (D-01/D-05)** - `42057e98` (feat)
2. **Task 2: Dọn inline token-valued + manifest wave-07 (D-08/D-09/D-10)** - `d1fe6825` (refactor)

**Plan metadata commit:** `036aa818` (docs: complete views adoption plan summary).

## Files Created/Modified
- `tests/fixtures/adoption/wave-07.txt` — 22-path manifest for adoption source guards
- `src/views/*.tsx` (21 files) — barrel imports, context hooks, named wrappers, token CSS vars
- `src/views/__tests__/TasksViewActions.test.tsx` — `ThemeAppHolder` wrapper + hook-based message mock
- `src/components/ui/icon.tsx` — `WrappedIconProps.tabIndex` added for accessible warning icon

## Decisions Made
- Kept `message.error/success/...` syntax via a locally bound `const message = useMessage()` — matches the guard's context-binding rule and the pattern used by waves 03-06.
- MermaidAssistantView uses `messageApi` as the local binding and calls `messageApi.loading(..., 0)` at component scope, satisfying both the "no `message.loading(` left" grep and React rules-of-hooks.
- Mapped `Badge status="error|processing|default"` in TelegramMonitorView to the design-system `StatusKind` values `danger|accent|info`; color changes are limited to the status dot, copy unchanged.
- Extended the shared icon wrapper with `tabIndex` (D-03) instead of dropping keyboard focus from `WarningOutlined` in ConfigProfilesView.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Hook inserted inside a `useState` initializer in NotesView**
- **Found during:** Task 1 typecheck review
- **Issue:** Scripted insertion placed `useMessage()`/`useTaskMateModal()` inside `useState<number>(() => { ... })`, breaking hook order.
- **Fix:** Moved both hook calls to the top of `NotesView` before the state initializer.
- **Files modified:** `src/views/NotesView.tsx`
- **Verification:** `npx tsc --noEmit` exit 0; `npx eslint src/views` exit 0.
- **Committed in:** `42057e98`

**2. [Rule 3 - Blocking] Codemod changed import surface but not static sub-components**
- **Found during:** Task 1 `npx tsc --noEmit` (118 errors)
- **Issue:** Views used `Descriptions.Item`, `Input.TextArea`, `Radio.Group`, `List.Item`, `Splitter.Panel`, `Empty.PRESENTED_IMAGE_SIMPLE`, `Form.useForm`, etc. — absent from named wrappers.
- **Fix:** Replaced all such uses with named barrel exports per D-03; removed imports left unused after replacement.
- **Files modified:** 12 view files (Analytics, AgentControl, ItemInsight, TelegramMonitor, etc.)
- **Verification:** `npx tsc --noEmit` 0 errors; `npx eslint src/views` 0 errors.
- **Committed in:** `42057e98`

**3. [Rule 3 - Blocking] `useMessage()` called inside a click handler in MermaidAssistantView**
- **Found during:** Task 1 `npx eslint src/views`
- **Issue:** Plan's literal `useMessage().loading(...)` at the call site violated `react-hooks/rules-of-hooks`; the inline form also needed a guard-safe receiver.
- **Fix:** Bound `const messageApi = useMessage()` at component top and changed the loading call to `messageApi.loading(..., 0)`, preserving `duration: 0` and `hideLoading()`.
- **Files modified:** `src/views/MermaidAssistantView.tsx`
- **Verification:** `npx eslint src/views` exit 0; guard test reports no unbound static API.
- **Committed in:** `42057e98`

**4. [Rule 2 - Missing Critical] Icon wrapper lacked `tabIndex`**
- **Found during:** Task 1 typecheck (ConfigProfilesView `WarningOutlined`)
- **Issue:** `role="img" aria-label=... tabIndex={0}` on the warning icon failed type check because `WrappedIconProps` omitted `tabIndex`, which would drop keyboard focus.
- **Fix:** Added `tabIndex?: number` to `WrappedIconProps`; factory forwards it through `...rest`.
- **Files modified:** `src/components/ui/icon.tsx`
- **Verification:** `npx tsc --noEmit` 0 errors.
- **Committed in:** `42057e98`

**5. [Rule 1 - Bug] TasksViewActions test mocked the removed static message API**
- **Found during:** Task 1 scoped Vitest
- **Issue:** Test spied on `message.info` from `antd`; after migration the view calls the hook-bound instance, so the spy never observed calls and an unhandled `message.error is not a function` surfaced.
- **Fix:** Wrapped renders in `ThemeAppHolder`, mocked `useMessage` via `vi.mock` + `importOriginal` with full no-op API, and asserted `mocks.messageInfo`.
- **Files modified:** `src/views/__tests__/TasksViewActions.test.tsx`
- **Verification:** `npx vitest run src/views/__tests__/TasksViewActions.test.tsx --bail=1` — 4/4 pass, no unhandled errors.
- **Committed in:** `42057e98`

**6. [Rule 3 - Blocking] Inline sweep required more files than Task 2's explicit `<files>` list**
- **Found during:** Task 2 guard pre-scan
- **Issue:** `inlineStyleSweep.test.ts` scans every path in all wave manifests; 15 views (not just NotesView/TasksView/DashboardView) contained guard-matched token literals.
- **Fix:** Swept all 105 violations across the 22-path whitelist; left dynamic inline values untouched.
- **Files modified:** 15 views
- **Verification:** Guard test passes; manual regex scan reports 0 remaining violations.
- **Committed in:** `d1fe6825`

---

**Total deviations:** 6 auto-fixed (3 Rule 1 bugs, 1 Rule 2 missing critical, 2 Rule 3 blocking). No new packages, no architecture change; all fixes needed to keep barrel-only imports and working hooks.

## Issues Encountered
- None beyond the deviations above.

## User Setup Required
None.

## Next Phase Readiness
Wave-07 manifest is registered with both adoption guards. Remaining waves can run the same codemod/hook/sweep flow; final D-11 gate (`lint = eslint src`) still belongs to the last wave. Note for UAT: Badge status dots in TelegramMonitorView now use design-token colors (`danger/accent/info`), and inline colors previously hardcoded in views now follow light/dark CSS vars.

## Threat Flags
None — no new network endpoint, auth path, file access pattern, or schema change; all work stayed inside the view/wrapper layer already covered by the plan's threat model.

## Self-Check: PASSED

- All 22 manifest paths exist on disk; `grep -c . tests/fixtures/adoption/wave-07.txt` = 22.
- Both task commits found in git history (`42057e98`, `d1fe6825`).
- Gates: `npx tsc --noEmit`, `npm run lint`, `npx eslint src/views`, `npm run test:foundation` (14 files / 83 tests), `npx vitest run src/views/__tests__/TasksViewActions.test.tsx --bail=1` (4 tests), static-API + inline-sweep guards (4 tests) all green.

---
*Phase: 50-full-app-adoption*
*Completed: 2026-11-21*
