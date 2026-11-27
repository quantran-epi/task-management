---
phase: quick
plan: 261127-uoi
subsystem: ui
tags: [react, antd, task-insight, system-detail, tabs, vitest]
requires:
  - phase: 261127-ts3
    provides: "Quick-create link row on task insight kept intact"
  - phase: 31.2
    provides: "Canonical system_detail tab contract from SystemsExplorer.handleOpenDetail"
provides:
  - "Task insight section 'Hệ thống liên kết' with clickable code — name tag and fallback rendering"
  - "Optional onOpenSystemDetail prop; EditorArea wires openTab to canonical system_detail tab"
affects: [task-insight, systems-explorer, editor-tabs]
tech-stack:
  added: []
  patterns: ["Optional view callback owned by EditorArea; view stays store-independent"]
key-files:
  created: []
  modified:
    - src/views/ItemInsightView.tsx
    - src/workbench/EditorArea.tsx
    - tests/views/ItemInsightView.test.tsx
key-decisions:
  - "Tab contract copied verbatim from SystemsExplorer.handleOpenDetail: id `system-${id}`, title name, viewType system_detail, closable true, params {systemId:id}"
  - "ItemInsightView receives optional onOpenSystemDetail prop and never imports useLayoutStore/openTab"
  - "Breadcrumb system chip and dedicated section tag share the same callback; no fallback to insight route"
patterns-established:
  - "Cross-view navigation contracts stay in EditorArea; child views expose optional callbacks for independent tests"
requirements-completed: [LINKED_SYSTEM_SECTION, CANONICAL_SYSTEM_TAB, NO_REGRESSION]
duration: 5min
completed: 2026-11-27
---

# Quick 261127-uoi: Kiểm tra task detail page với ch Linked System Summary

**Task insight giờ có Card "Hệ thống liên kết" riêng; tag và breadcrumb hệ thống mở tab `system_detail` canonical thay vì tab insight trùng lặp**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-11-27T15:08:00Z
- **Completed:** 2026-11-27T15:12:11Z
- **Tasks:** 2 (TDD: 1 test commit + 1 feat commit; task 2 feat commit)
- **Files modified:** 3

## Accomplishments

- Added dedicated task-only Card "Hệ thống liên kết" with clickable `code — name` tag (`data-testid="item-insight-linked-system"`), plus fallback `Chung (không gắn)` / orphan `systemId`.
- Removed the system tag (both attached and fallback) from the compact header tag row; kept `Tác vụ` and other tags unchanged.
- System breadcrumb now calls `onOpenSystemDetail(parentSystem)` instead of `onNavigate('insight', ...)`; other breadcrumbs untouched.
- EditorArea wires callback to `openTab` with exact SystemsExplorer contract: `id: system-${system.id}`, `title: system.name`, `viewType: 'system_detail'`, `closable: true`, `params: { systemId: system.id }`.
- ItemInsightView remains testable standalone: optional prop only, no store import.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED gate:** `c900c3d6` (test)
2. **Task 1 GREEN:** `a1daeaad` (feat)
3. **Task 2:** `959c1762` (feat)

**Plan metadata:** orchestrator handles docs commit; not included here.

## Files Created/Modified

- `src/views/ItemInsightView.tsx` - Optional `onOpenSystemDetail` prop; new task-only linked system Card; breadcrumb callback; header system tag removed.
- `src/workbench/EditorArea.tsx` - Wires callback to canonical `system_detail` tab via existing `openTab`.
- `tests/views/ItemInsightView.test.tsx` - Reworked system test: dedicated section, tag + breadcrumb click-through, no system insight navigation, both fallbacks; all prior tests intact.

## Decisions Made

- Tab contract copied verbatim from `SystemsExplorer.handleOpenDetail` (single canonical system detail surface).
- Callback ownership stays in EditorArea; ItemInsightView receives it as optional prop for independent rendering/tests.
- No new route, page, dependency, model, DB or backup schema change.

## Deviations from Plan

None - plan executed as written. Test assertion `getAllByText(...).toEqual([tag])` added to explicitly prove header tag removal (plan behavior 2). Test mock cleared between render cases to avoid cross-case call-history leaks.

**Total deviations:** 0

## Issues Encountered

- RED test run failed as expected (`findByText('Hệ thống liên kết')` missing).
- First GREEN run exposed test-only issue: `mockOpenSystem` retained calls from the attached case; added `mockOpenSystem.mockClear()` before fallback renders.
- `npx eslint tests/views/ItemInsightView.test.tsx` reports "File ignored because no matching configuration was supplied" (pre-existing config scope, warning only); source files lint clean.

## Verification

- `npx vitest run tests/views/ItemInsightView.test.tsx --bail=1`: 1 file passed, 9 tests passed.
- `npx tsc --noEmit`: clean.
- `npx eslint src/workbench/EditorArea.tsx src/views/ItemInsightView.tsx`: clean.
- `grep -n "viewType: 'system_detail'"` confirmed identical contract in `EditorArea.tsx:692` and `SystemsExplorer.tsx:51`.
- Full suite intentionally not run (project rule: > 1 hour). No PWA/GitHub Pages validation (out of scope).
- Orchestrator review diff `2c660c65..959c1762`: sạch, không band-aid, contract đúng state/navigation owner. Rerun `npx vitest run tests/views/ItemInsightView.test.tsx --bail=1` — 9/9 pass; `npx tsc --noEmit` + ESLint source clean.
- Chrome MCP light/dark trên `http://127.0.0.1:5173/task-management/`: task insight hiện Card "Hệ thống liên kết", header không còn tag hệ thống; bấm tag và breadcrumb đều mở đúng một tab `UAT Service` (`SystemDetailView`), không tạo tab insight hệ thống; dark bg `rgb(17,21,29)` vs section `rgb(23,29,39)`. Seed UAT đã dọn.

## Review

- Reviewer/orchestrator: no defects. Root cause confirmed at `EditorArea` route `'insight'` rendering `ItemInsightView` for system type; fixed at that owner, not at the tag component.

## User Setup Required

None.

## Next Phase Readiness

Ready for review. No blockers; callback path covered by scoped Vitest, tsc, eslint and contract grep.

---
*Phase: quick*
*Completed: 2026-11-27*
