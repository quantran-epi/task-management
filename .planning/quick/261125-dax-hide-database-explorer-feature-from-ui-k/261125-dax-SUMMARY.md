---
phase: quick
plan: 261125-dax
subsystem: ui
tags: [workbench, stripe, layout-store, database-explorer, regression-tests]

requires: []
provides:
  - Left stripe without a Database Explorer button; remaining stripe entries unchanged
  - Hydration fallback mapping persisted `database_explorer` leftActiveId to `cr_explorer`
  - Scoped regression tests for hidden entry and restored state
affects: [workbench layout, tool-window visibility]

actuals:
  tokens: 1290
  tasks: 1
  commits: 1

tech-stack:
  added: []
  patterns: [filter-only discovery surface, persist-merge retired-id mapping]

key-files:
  created: []
  modified:
    - src/workbench/WorkbenchLayout.tsx
    - src/workbench/store/layoutStore.ts
    - src/workbench/__tests__/DatabaseExplorer.test.tsx
    - src/workbench/__tests__/layoutStore.test.ts

key-decisions:
  - "Database Explorer is hidden only at the discovery surface: DEFAULT_LEFT_ITEMS, DatabaseOutlined import, LeftToolWindow rendering branch, Oracle tools, Dexie tables and saved data stay byte-unchanged."
  - "Persisted `database_explorer` leftActiveId falls back to DEFAULT_LAYOUT_STATE.leftActiveId in the existing persist merge seam, reusing the `diagrams` -> `docs` precedent."

patterns-established:
  - "Hide a tool window by filtering the Stripe items prop, not by deleting the item definition or its render branch."
  - "Neutralize stale persisted UI ids in layoutStore persist merge so a restore cannot reopen a hidden panel."

requirements-completed: [DBX-HIDE-UI, DBX-PERSISTED-STATE, DBX-REGRESSION]

coverage:
  - id: D1
    description: "Left stripe renders no Database Explorer button; CR Explorer, Docs Explorer, Systems Explorer and Remote Git Explorer remain reachable"
    requirement: DBX-HIDE-UI
    verification:
      - kind: unit
        ref: "src/workbench/__tests__/DatabaseExplorer.test.tsx#hides Database Explorer from the left stripe while keeping the other entries"
        status: pass
    human_judgment: false
  - id: D2
    description: "Persisted database_explorer leftActiveId resolves to cr_explorer on hydration; unrelated valid left ids survive"
    requirement: DBX-PERSISTED-STATE
    verification:
      - kind: unit
        ref: "src/workbench/__tests__/layoutStore.test.ts#falls back to the default left tool window for a persisted hidden database_explorer"
        status: pass
    human_judgment: false
  - id: D3
    description: "Existing DatabaseExplorer tree, cache and tab behavior tests pass unchanged"
    requirement: DBX-REGRESSION
    verification:
      - kind: unit
        ref: "src/workbench/__tests__/DatabaseExplorer.test.tsx (tree/cache/tab tests)"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-11-25
status: complete
---

# Quick 261125-dax: Hide Database Explorer From UI Summary

**Filtered the hidden tool id out of the left stripe and neutralized its persisted state so the feature stays in code and data but cannot be reopened from the workbench.**

## Performance

- **Duration:** ~4 min (2026-11-25T02:39:17Z -> 2026-11-25T02:43:08Z)
- **Started:** 2026-11-25T02:39:17Z
- **Completed:** 2026-11-25T02:43:08Z
- **Tasks:** 1/1
- **Files modified:** 4

## Accomplishments

- Left stripe no longer exposes a Database Explorer button. `DEFAULT_LEFT_ITEMS` and the `DatabaseOutlined` import stay intact; only the value passed to `<Stripe slot="left">` is filtered by the hidden id.
- `layoutStore` persist merge maps a stored `database_explorer` leftActiveId to `DEFAULT_LAYOUT_STATE.leftActiveId` (`cr_explorer`), alongside the existing `diagrams` -> `docs` mapping. Other valid left ids survive unchanged.
- Replaced the two old shell tests with a hidden-entry regression test; added hydration fallback and control tests. Tree/cache/tab tests, `LeftToolWindow.tsx`, Oracle tools, Dexie schema and saved records untouched.
- Verification: scoped Vitest files pass (23 tests, 2 files); `npx tsc --noEmit` clean. Full suite not run (project rule: over an hour).

## Task Commits

Each task was committed atomically:

1. **Task 1: Hide Database Explorer entry point and neutralize restored UI state** - `7aa15859` (feat)

**Plan head before:** `8db328f1225f0b305547841049725091875258b6`
**Plan head after:** `7aa158596b6fb57692fc6b669d3155856fd543eb`

## Deviations from Plan

### Auto-fixed Issues

None - plan executed exactly as written.

**Environment note (not a code deviation):** `node_modules` was missing the already-declared, lockfile-pinned packages `mammoth@1.13.0` and `pdfjs-dist@6.5.438`, which blocked the DatabaseExplorer test import. Restored with `npm install --no-save` using the exact declared versions; `package.json`, `package-lock.json` and tracked source unchanged. No new dependency introduced.

## Known Stubs

None.

## Threat Flags

None - both STRIDE mitigations (T-dax-01 hydration mapping, T-dax-02 stripe filtering) implemented with regression coverage, as planned.

## Self-Check: PASSED

- `src/workbench/WorkbenchLayout.tsx` filter present; `DEFAULT_LEFT_ITEMS` and `DatabaseOutlined` import retained.
- `src/workbench/store/layoutStore.ts` hydration fallback present; `partialize`, `RETIRED_VIEW_TYPES`, `openTabs` and Dexie schema untouched.
- Git diff touches exactly the four listed files; no files under `src/workbench/toolwindows/`, `src/services/ai/`, `src/db/`, or outside the quick directory.
- Commit `7aa15859` exists with no tracked file deletions.
