---
phase: 54-native-overlay-complex-controls
plan: 02
subsystem: ui
tags: [native-controls, menu, list, tree, tabs, splitter, keyboard, focus, event-parity, vitest]

# Dependency graph
requires:
  - phase: 54-01
    provides: Popup/DialogSurface/ImperativeChannel helpers, runtime-import guard CLI, vendored OpenIDEA CSS modules
provides:
  - 5 native overlay/complex primitives: menu, list, tree, tabs, splitter
  - data-oi-control/data-state hooks for menu-item, list-row, tree-row, tab, splitter-handle
  - 14 focused tests keyboard/state/metric/event parity across all five primitives
affects: [54-03, 54-04, 54-07, Phase 56, Phase 57]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "AntD item objects are plain objects; statics are React elements — flatten both before render"
    - "Native event objects gain AntD info fields via Object.defineProperty on the original event, never a synthetic object"
    - "Snapshot arrays via primitive join('|') to keep refs stable without fresh arrays in memo deps"

key-files:
  created:
    - src/components/ui/__tests__/overlayPrimitives.test.tsx
  modified:
    - src/components/ui/menu.tsx
    - src/components/ui/list.tsx
    - src/components/ui/tree.tsx
    - src/components/ui/tabs.tsx
    - src/components/ui/splitter.tsx

key-decisions:
  - "All five wrappers render vendored OpenIDEA CSS module DOM with type-only AntD aliases; no runtime AntD import, no caller changes"
  - "Static subcomponents are self-built values (MenuItem/MenuSubMenu/MenuItemGroup, ListItem/ListItemMeta with .Meta, TreeNode/DirectoryTree, TabPane, SplitterPanel) — no bare AntD re-exports"
  - "Menu/Tree/Tabs preserve AntD event info (key, keyPath, item, itemData, node, event, nativeEvent) by defining fields on the original event"
  - "Tree forwards loadData and onDoubleClick because live callers (RemoteGitExplorer, SystemsExplorer) depend on them; onSelect info.node includes the caller's raw fields (path/isLeaf)"
  - "Tabs onEdit keeps the real AntD signature (event, 'remove'), not the plan's sketch signature ('remove', key, event)"
  - "Splitter emits numeric percentage sizes unchanged; pointer/keyboard resize shares one commit path with min/max clamping and disabled suppression"

patterns-established:
  - "Focused overlay suite spies console.error in beforeEach and asserts zero calls in afterEach to catch React warnings"
  - "Arrow lead uses primitive state snapshots; repeated ArrowDown/PointerMove never resets to selected value (RR-01 regression guard)"

requirements-completed: [NAT-02]

# Metrics
duration: ~24 min
completed: 2026-11-21
---

# Phase 54 Plan 02: Native Overlay Complex Controls Summary

**Five overlay/complex wrappers now render native OpenIDEA DOM with keyboard, state hooks, and AntD event payload parity; no callers or dependencies changed**

## Performance

- **Duration:** ~24 min
- **Started:** 2026-11-21T22:46:28Z
- **Completed:** 2026-11-21T23:09:59Z
- **Tasks:** 3
- **Files modified:** 6 (5 wrappers + 1 new focused test)

## Accomplishments

- Menu: vendored `Menu.module.css` items with divider/danger/icon/disabled, arrow lead + Enter/Space, real click event with `key/keyPath/domEvent/item/itemData` defined on the original event; statics self-built.
- List: 24px absolute rows + `n*24` sizer, generic `<T>`, caller empty text preserved, loading `aria-busy`, `ListItem.Meta` surface intact.
- Tree: 24px rows, indent `16*depth+12`, checkable/expand/select with AntD info payloads, `loadData`/`onDoubleClick` forwarded for live callers.
- Tabs: `Tabs.module.css` strip, arrow lead, disabled/closable tabs, `styles.root` caller wins, native event payloads for `onChange`/`onTabClick`/`onEdit`.
- Splitter: vendored Splitter.module.css group, panel and handle classes with 1px handle and ±3px hit area, pointer + arrow resize, numeric `onResize`/`onResizeStart`/`onResizeEnd`, disabled suppression, nested propagation guard.
- 14 focused tests cover state hooks, keyboard contracts, metrics, and native event methods; 9 focused files / 67 tests green; `tsc`, `lint`, guard CLI green; 56 wrapper files and 257 export names unchanged.

## Task Commits

Each task was committed atomically:

1. **Task 1: Menu + List native** - `38e13e98` (feat)
2. **Task 2: Tree + Tabs native** - `8b5b6de7` (feat)
3. **Task 3: Splitter native + focused state suite** - `bde82a8f` (feat)

**Plan metadata:** pending (this commit)

## Files Created/Modified

- `src/components/ui/menu.tsx` — native Menu + 3 statics; items/divider/danger/icon; arrow lead; native event info
- `src/components/ui/list.tsx` — native generic List + 2 statics; 24px rows/sizer; empty/loading states
- `src/components/ui/tree.tsx` — native Tree + TreeNode/DirectoryTree; indent/expand/check/select; loadData
- `src/components/ui/tabs.tsx` — native Tabs + TabPane; tablist arrow; closable; caller styles.root
- `src/components/ui/splitter.tsx` — native Splitter + SplitterPanel; resize keys; 1px handle; disabled panel
- `src/components/ui/__tests__/overlayPrimitives.test.tsx` — 14 focused tests with console.error spy

## Decisions Made

- No new dependency, no caller edit, no vendored CSS/token change; type-only AntD aliases kept until Phase 56.
- Native methods on event objects stay alive via `Object.defineProperty` on the original event (53-REVIEW RR-02).
- Snapshot state derived from primitive strings; no `Set`/array recreated per render in memo/render dependencies (RR-01).
- Uncontrolled state uses correct ternary (`controlled ? caller : inner`), never a hard-coded false (RR-03).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Menu `items[]` entries are plain objects, not React elements**
- **Found during:** Task 3 (focused overlay test suite)
- **Issue:** `collectItems` read `element.props` from every item; plain AntD `ItemType` objects were skipped, so divider/danger/icon items never rendered.
- **Fix:** Detect `isValidElement(node)` and read props from either the element or the plain object; derive keys from element `key` or object `key`.
- **Files modified:** `src/components/ui/menu.tsx`
- **Verification:** `overlayPrimitives.test.tsx` divider/danger/disabled test passes; tsc/lint green.
- **Committed in:** `38e13e98` (Task 1 commit, rewritten to keep commits atomic)

**2. [Rule 2 - Missing Critical] Tree `onSelect.info.node` must carry caller raw fields**
- **Found during:** Task 2 (live caller review)
- **Issue:** `AgentDiffReviewer` reads `info.node.path` and `info.node.isLeaf`; a key-only node would break file selection.
- **Fix:** Spread the source `TreeDataNode` into the info node before adding `key/selected`; keep `selectedNodes` consistent.
- **Files modified:** `src/components/ui/tree.tsx`
- **Verification:** tsc green; caller contract preserved in code review.
- **Committed in:** `8b5b6de7` (Task 2 commit)

**3. [Rule 2 - Missing Critical] Tree `loadData` and `onDoubleClick` were not forwarded**
- **Found during:** Task 2 (live caller review)
- **Issue:** `RemoteGitExplorer` lazy-loads children via `loadData`; `SystemsExplorer` opens details on `onDoubleClick`. Dropping either silently breaks navigation.
- **Fix:** Call `loadData` on first expand with an `EventDataNode`-shaped argument; forward `onDoubleClick(event, node)`.
- **Files modified:** `src/components/ui/tree.tsx`
- **Verification:** tsc/lint green; focused UI suite green.
- **Committed in:** `8b5b6de7` (Task 2 commit)

**4. [Rule 1 - API Accuracy] Tabs `onEdit` signature**
- **Found during:** Task 2 (implementation)
- **Issue:** Plan text sketched `onEdit('remove', key, e)` but AntD 6 declares `(event, 'add' | 'remove')`.
- **Fix:** Kept the real AntD signature with the original event; focused test asserts `(event, 'remove')`.
- **Files modified:** `src/components/ui/tabs.tsx`
- **Verification:** `overlayPrimitives.test.tsx` closable-tab test passes.
- **Committed in:** `8b5b6de7` (Task 2 commit)

---

**Total deviations:** 4 auto-fixed (1 bug, 3 missing-contract fixes)
**Impact on plan:** All fixes restore API/behavior parity required by the plan; no scope creep, no new dependency, no caller edits.

## Issues Encountered

- Caller tests asserting `.ant-tree-*` / `.ant-tree-treenode-selected` (`AgentDiffReviewer.test.tsx`, `RemoteGitExplorer.test.tsx`) now fail against native tree DOM. The plan explicitly assigns selector updates to plan 07 ("CHỈ ĐỌC; plan 07 sẽ update selector"). `AgentDiffReviewer` also has one pre-existing CSS-contract failure at HEAD, unrelated to this plan. No selector test was weakened or caller changed here.
- Commit history was rewritten locally (same trees) to keep Task 1's bug fix in Task 1's commit and to restore the required `Co-Authored-By` trailer on all three task commits; no files were changed outside the committed trees.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

Ready for 54-03. Foundation contracts are fixed: all five primitives expose `data-oi-control`/`data-state` hooks, keyboard leads, and native event payloads; Dropdown/AutoComplete/Upload can reuse native Menu and List items. Run `node scripts/check-native-imports.mjs <changed files>` after each wrapper conversion. Do not run the full Vitest suite; plan 07 owns caller selector updates for native Tree/Tabs.

---
*Phase: 54-native-overlay-complex-controls*
*Completed: 2026-11-21*
