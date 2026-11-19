---
phase: 45-knowledge-sets-docs-workspace-oracle-connections-team-pinned
plan: 02
subsystem: ui
tags: [react, antd, dexie, zustand, tabs, pagination, docs-workspace, vitest]
requires:
  - phase: 45-01
    provides: shared DocumentSetDeleteDialog with full-delete default and exact-name local-only gate
provides:
  - dedicated one-screen Docs workspace with bounded set-level browsing
  - doc_set EditorViewType with persistent in-app tabs carrying params.setId
  - bounded document-set detail (antd Table, fixed pageSize 10) mounting the shared hardened delete dialog
  - retired legacy drawer browse trigger; create-only action retained for set creation/publish
affects:
  - future Docs and knowledge-set UI work must reuse doc_set tabs and the shared delete dialog
  - threat T-45-04 bounded rendering and T-45-05 tab registry invariants
tech-stack:
  added: []
  patterns:
    - "Set-level workspace uses antd Table with fixed pageSize; no unbounded notes.map in detail view"
    - "All set-open paths go through layoutStore.openTab('doc_set', { setId }); no browser/system tabs"
    - "No LAYOUT_STORAGE_KEY bump: doc_set survives existing merge/partialize under MAX_OPEN_TABS=20"
key-files:
  created:
    - src/workbench/DocumentSetDetail.tsx
    - src/workbench/__tests__/DocsWorkspace.test.tsx
  modified:
    - src/workbench/store/layoutStore.ts
    - src/workbench/EditorArea.tsx
    - src/workbench/toolwindows/DocsExplorer.tsx
    - src/components/notes/DocsLibraryActions.tsx
    - src/workbench/__tests__/layoutStore.test.ts
    - src/workbench/__tests__/DocsExplorerZip.test.tsx
key-decisions:
  - "doc_set is a distinct EditorViewType; setId lives only in tab.params and is not validated beyond existence"
  - "Document rows come from IndexedDB bulkGet(set.documentIds) and render through antd Table pageSize=10; 25-document fixture renders exactly 10 rows"
  - "Legacy drawer is no longer a set-browsing surface; its form/publish flow stays behind a create-only action"
  - "Optional Knowledge Client is constructed only for the shared delete dialog; browsing/rendering paths make no daemon call"
patterns-established:
  - "Focused Vitest files per task plus tsc --noEmit; full suite intentionally not run"
  - "Component tests mock heavy views and the shared dialog while exercising real Dexie + zustand stores"
requirements-completed: [D-06, D-07, D-08]
coverage:
  - id: D1
    description: "Clicking a set opens exactly one persistent doc_set tab carrying setId; multiple sets open multiple tabs"
    requirement: D-07
    verification:
      - kind: unit
        ref: src/workbench/__tests__/DocsWorkspace.test.tsx#opens exactly one doc_set tab carrying the setId when a set is clicked
        status: pass
      - kind: unit
        ref: src/workbench/__tests__/DocsWorkspace.test.tsx#keeps multiple sets open as separate in-app tabs
        status: pass
    human_judgment: false
  - id: D2
    description: "doc_set tab survives persist/rehydrate without storage key bump under MAX_OPEN_TABS"
    requirement: D-07
    verification:
      - kind: unit
        ref: src/workbench/__tests__/DocsWorkspace.test.tsx#survives a layout persist -> rehydrate cycle without a storage key bump
        status: pass
      - kind: unit
        ref: src/workbench/__tests__/layoutStore.test.ts#keeps a doc_set tab with its setId across persist and rehydrate
        status: pass
    human_judgment: false
  - id: D3
    description: "Bounded document list renders one page plus pagination with many documents; no unbounded notes.map"
    requirement: D-08
    verification:
      - kind: unit
        ref: src/workbench/__tests__/DocsWorkspace.test.tsx#renders only one bounded page plus pagination when a set has many documents
        status: pass
    human_judgment: false
  - id: D4
    description: "doc_set detail mounts the shared DocumentSetDeleteDialog and delete action opens it"
    requirement: D-06
    verification:
      - kind: unit
        ref: src/workbench/__tests__/DocsWorkspace.test.tsx#mounts the shared DocumentSetDeleteDialog from the doc_set detail
        status: pass
    human_judgment: false
  - id: D5
    description: "Dedicated one-screen Docs workspace replaces the long-scroll drawer browse trigger"
    requirement: D-06
    verification:
      - kind: unit
        ref: src/workbench/__tests__/DocsWorkspace.test.tsx#has no long-scroll drawer trigger left in the Docs workspace
        status: pass
      - kind: unit
        ref: src/workbench/__tests__/DocsExplorerZip.test.tsx#exposes one bounded set workspace and no legacy drawer browse trigger
        status: pass
    human_judgment: false
  - id: D6
    description: "Visual adequacy of the one-screen Docs workspace against the approved UI-SPEC in a real Tauri walkthrough"
    verification: []
    human_judgment: true
    rationale: "Component tests prove bounded behavior with stubs; visual density, spacing and perceived scroll adequacy require human UI judgment."
actuals:
  tokens: 6089
  tasks: 2
  commits: 2
commits: 2
plan_head_before: 81d640950ca851dbf7becb8e00413f3885112469
plan_head_after: 387c791219ab3d33bad8c4da1ecbb614ba1efb8f
duration: 17min
completed: 2026-11-19
status: complete
---

# Phase 45 Plan 02: Docs Workspace and Persistent doc_set Tabs Summary

**Dedicated one-screen Docs workspace opening bounded document-set views as persistent in-app tabs with the shared hardened delete dialog**

## Performance

- **Duration:** 17 min
- **Started:** 2026-11-19T05:18:33Z
- **Completed:** 2026-11-19T05:35:37Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Added `doc_set` to `EditorViewType` and a `renderViewContent` case that mounts `DocumentSetDetail` from `tab.params.setId`; the tab survives existing `merge`/`partialize` with no `LAYOUT_STORAGE_KEY` bump and stays under `MAX_OPEN_TABS=20`.
- Built `DocumentSetDetail`: local IndexedDB reads, antd `Table` with fixed `pageSize=10` and pagination, and the shared `DocumentSetDeleteDialog` from plan 01 so full-delete default and exact-name local-only remain reachable.
- Replaced the drawer browse surface with a compact set-level workspace in `DocsExplorer` (antd `Table`, `pageSize=8`, Vietnamese empty copy) and bounded the remaining folder-tree viewport so Docs stays one screen.
- Routed all set-open paths through `openTab('doc_set', { setId })`; the legacy "Bộ tài liệu" browse trigger is gone, with a create-only action retained so set creation/publish remains possible.
- Focused tests plus `tsc --noEmit` pass: 25/25 across `DocsWorkspace.test.tsx`, `layoutStore.test.ts`, `DocsExplorerZip.test.tsx`.

## Task Commits

1. **Task 1: Click a set -> open a persistent in-app doc_set tab** - `b41aa6a1` (feat)
2. **Task 2: Retire the Docs drawer entry and guard against long-scroll regression** - `387c7912` (refactor)

**Plan metadata:** pending final docs commit

## Files Created/Modified
- `src/workbench/DocumentSetDetail.tsx` — bounded doc_set detail with paginated Table and shared delete dialog.
- `src/workbench/store/layoutStore.ts` — `doc_set` view type registration.
- `src/workbench/EditorArea.tsx` — `doc_set` render case and tab icon.
- `src/workbench/toolwindows/DocsExplorer.tsx` — one-screen set workspace, openTab routing, bounded tree viewport.
- `src/components/notes/DocsLibraryActions.tsx` — create-only drawer action; browse trigger removed.
- `src/workbench/__tests__/DocsWorkspace.test.tsx` — six cases covering tabs, persistence, bounded rendering, delete reachability, trigger retirement.
- `src/workbench/__tests__/layoutStore.test.ts` — doc_set rehydrate case.
- `src/workbench/__tests__/DocsExplorerZip.test.tsx` — updated for the retired browse trigger.

## Decisions Made
- `doc_set` carries only `params.setId`; no new validation or storage key was added because `merge`/`partialize` already tolerate the new view type.
- Document lists are bounded at two levels: set grid `pageSize=8`, detail `pageSize=10`; the folder tree keeps a bounded viewport instead of virtualization to avoid an architectural change outside this plan's file scope.
- The optional Knowledge Client exists only in the delete dialog path; browsing and rendering remain local-first with no daemon dependency (D-06/offline contract).
- The legacy drawer form/publish flow was preserved behind a create-only action — removing it entirely would have destroyed set creation and publish capabilities, which no plan file replaces.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test drift] Updated pre-existing DocsExplorerZip test for the retired drawer browse trigger**
- **Found during:** Task 1
- **Issue:** `DocsExplorerZip.test.tsx` asserted that clicking "Bộ tài liệu" opened the long-scroll drawer, which this plan intentionally retires.
- **Fix:** Replaced that assertion with checks that the bounded workspace is present, no legacy browse trigger exists, and no `notes` tab is opened.
- **Files modified:** `src/workbench/__tests__/DocsExplorerZip.test.tsx`
- **Verification:** Focused test file passes; 25/25 across affected files.
- **Committed in:** `b41aa6a1`, `387c7912`

**2. [Rule 2 - Missing critical] Bounded the residual folder-tree viewport**
- **Found during:** Task 2
- **Issue:** `DocsExplorer` still mounted `DocFolderTree` from `db.notes.toArray()`, which could reintroduce the user's "scroll rất dài" pain despite the bounded set grid.
- **Fix:** Wrapped the tree in a flex-1, `overflowY: auto` container so its viewport is bounded; no virtualization library or new file added.
- **Files modified:** `src/workbench/toolwindows/DocsExplorer.tsx`
- **Verification:** Focused tests pass; grep confirms no unbounded `notes.toArray().map()` in the `doc_set` detail path.
- **Committed in:** `387c7912`

---

**Total deviations:** 2 auto-fixed (1 test drift, 1 bounded-rendering gap)
**Impact on plan:** Both changes are required for the plan's own bounded-rendering and retired-trigger success criteria. No scope creep.

## Issues Encountered
- Initial `DocsWorkspace` tests were flaky when two test files ran in one process because zustand's persisted store bled session state across cases; fixed by clearing `localStorage`, resetting layout, and rehydrating in `beforeEach`.
- The first bounded-page assertion counted rows from both tables on screen; scoped the assertion to the `doc_set` detail container and waited for the async `useLiveQuery` result.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Ready for adjacent phase 45 plans: the shared `DocumentSetDeleteDialog` is now mounted from both the retired drawer path and the new `doc_set` detail.
- A real Tauri UI walkthrough of the one-screen Docs workspace and visible delete-action copy remains for phase verification (D6).

## Self-Check: PASSED

---
*Phase: 45-knowledge-sets-docs-workspace-oracle-connections-team-pinned*
*Completed: 2026-11-19*
