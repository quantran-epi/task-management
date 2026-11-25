---
phase: quick
plan: 261125-dax
type: execute
wave: 1
depends_on: []
files_modified:
  - src/workbench/WorkbenchLayout.tsx
  - src/workbench/store/layoutStore.ts
  - src/workbench/__tests__/DatabaseExplorer.test.tsx
  - src/workbench/__tests__/layoutStore.test.ts
autonomous: true
requirements:
  - DBX-HIDE-UI
  - DBX-PERSISTED-STATE
  - DBX-REGRESSION
user_setup: []
must_haves:
  truths:
    - "Left stripe no longer renders any Database Explorer button; remaining left stripe items keep their ids, names, icons, and order"
    - "A previously persisted leftActiveId of database_explorer resolves to the default cr_explorer on hydration, so the hidden tool window cannot reopen from stored UI state"
    - "DatabaseExplorer.tsx, OracleObjectViewer, OracleSqlComposer, oracleSqlclService, Dexie tables, and saved data remain byte-unchanged"
    - "No new keyboard shortcut, palette action, settings toggle, route, dependency, or schema change"
    - "Targeted workbench tests and tsc --noEmit pass; full Vitest suite is not run"
  artifacts:
    - path: "src/workbench/WorkbenchLayout.tsx"
      provides: "Filtered left stripe item list; hidden id constant and component code preserved"
      contains: "DEFAULT_LEFT_ITEMS.filter"
    - path: "src/workbench/store/layoutStore.ts"
      provides: "Hydration mapping for the hidden persisted left tool window id"
      contains: "DEFAULT_LAYOUT_STATE.leftActiveId"
    - path: "src/workbench/__tests__/DatabaseExplorer.test.tsx"
      provides: "Regression assertion for hidden stripe entry; existing tree/tab tests untouched"
      contains: "queryByRole"
    - path: "src/workbench/__tests__/layoutStore.test.ts"
      provides: "Hydration regression assertion for the hidden persisted id"
      contains: "persist.rehydrate"
  key_links:
    - from: "src/workbench/WorkbenchLayout.tsx"
      to: "src/workbench/toolwindows/Stripe.tsx"
      via: "items prop from DEFAULT_LEFT_ITEMS.filter"
    - from: "src/workbench/store/layoutStore.ts"
      to: "src/workbench/toolwindows/LeftToolWindow.tsx"
      via: "hydrated leftActiveId decides the docked left panel"
---

<objective>
Hide Database Explorer from every user-facing UI entry point while keeping its code, routes, tabs, and data intact.

Purpose: Sếp wants the feature out of sight, not removed — no deletion, no data loss, no schema or config churn. This is a UI discoverability change only, on the Tauri-first workbench.

Output: Left stripe without the Database Explorer button, persisted UI state that cannot restore the hidden panel, and targeted regression tests.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md
@src/workbench/WorkbenchLayout.tsx
@src/workbench/store/layoutStore.ts
@src/workbench/toolwindows/Stripe.tsx
@src/workbench/toolwindows/LeftToolWindow.tsx
@src/workbench/__tests__/DatabaseExplorer.test.tsx
@src/workbench/__tests__/layoutStore.test.ts

Observed at planning time: the only discoverable entry is the `database_explorer` item in `DEFAULT_LEFT_ITEMS`, passed to `<Stripe slot="left">` in `WorkbenchLayout.tsx`. `LeftToolWindow.tsx` renders the panel only when `leftActiveId === 'database_explorer'` and has no other caller. `src/workbench/actions/actionRegistry.ts`, `src/workbench/hooks/useGlobalKeymap.ts`, and `src/workbench/search/SearchEverywhereModal.tsx` contain no Database Explorer entry. `layoutStore.ts` `merge` already maps a retired persisted left id (`'diagrams'` to `'docs'`); reuse that seam for the hidden id.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Hide Database Explorer entry point and neutralize restored UI state</name>
  <files>src/workbench/WorkbenchLayout.tsx, src/workbench/store/layoutStore.ts, src/workbench/__tests__/DatabaseExplorer.test.tsx, src/workbench/__tests__/layoutStore.test.ts</files>
  <behavior>
    - Render WorkbenchLayout: no button exposes the Database Explorer name; CR Explorer, Docs Explorer, Systems Explorer, Remote Git Explorer buttons remain with unchanged aria-labels.
    - Hydrate a persisted layout blob with leftActiveId 'database_explorer': resolved state is DEFAULT_LAYOUT_STATE.leftActiveId ('cr_explorer'); a blob with another valid left id is unchanged.
    - The existing DatabaseExplorer tree/tab tests keep passing unchanged; no source file under src/workbench/toolwindows or src/services/ai is modified.
  </behavior>
  <action>Start with the two regression tests, run them to confirm they fail, then implement. In src/workbench/__tests__/DatabaseExplorer.test.tsx replace the two shell tests (stripe ordering and stripe activation) with one test that renders WorkbenchLayout, asserts no button exposes the Database Explorer name, and asserts the other left stripe entries still exist; leave the tree/cache/tab tests byte-identical. In src/workbench/__tests__/layoutStore.test.ts add a hydration test following the existing 'diagrams' mapping test: write a localStorage blob at LAYOUT_STORAGE_KEY with leftActiveId set to the hidden id, call useLayoutStore.persist.rehydrate, assert the resolved leftActiveId is DEFAULT_LAYOUT_STATE.leftActiveId; add one control case proving an unrelated valid left id survives hydration. In src/workbench/WorkbenchLayout.tsx keep DEFAULT_LEFT_ITEMS untouched and filter only the value passed to the left Stripe's items prop by the 'database_explorer' id; keep the DatabaseOutlined import and the component rendering branch in LeftToolWindow.tsx intact. In src/workbench/store/layoutStore.ts extend the existing leftActiveId mapping inside persist merge so a persisted 'database_explorer' falls back to DEFAULT_LAYOUT_STATE.leftActiveId, placed alongside the current 'diagrams' case; do not change partialize, RETIRED_VIEW_TYPES, openTabs, or any Dexie schema. No new dependency, no feature flag, no keymap or palette entry, no PWA/GitHub Pages work, no deletion of DatabaseExplorer.tsx, OracleObjectViewer.tsx, OracleSqlComposer.tsx, oracleSqlclService.ts, or any stored record.</action>
  <verify>
    <automated>npx vitest run src/workbench/__tests__/DatabaseExplorer.test.tsx src/workbench/__tests__/layoutStore.test.ts --bail=1 && npx tsc --noEmit</automated>
  </verify>
  <done>No user-facing control can open Database Explorer from a fresh or restored workbench; other left stripe buttons and all existing database explorer behavior tests unchanged; scoped tests and typecheck pass; git diff touches only the four listed files.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| localStorage → layoutStore hydration | Persisted UI state is user-writable and currently decides which left tool window is docked. |
| Stripe items → WorkbenchLayout | Static item array is the only user-facing discovery surface for left tool windows. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-dax-01 | T (Tampering) | `layoutStore.ts` persist merge | low | mitigate | Map a stored `database_explorer` leftActiveId to `DEFAULT_LAYOUT_STATE.leftActiveId` in the existing hydration seam; regression test rehydrates a crafted blob and checks the fallback. |
| T-dax-02 | I (Information disclosure) | `WorkbenchLayout.tsx` left Stripe | low | mitigate | Filter the hidden id from the items passed to Stripe; test asserts no accessible button exposes the feature and that the other stripe entries stay reachable. |
| T-dax-SC | Tampering | npm/pip/cargo installs | high | accept | No package-manager install in this plan; edits use only existing React, zustand, and Vitest code. |

</threat_model>

<verification>
1. `npx vitest run src/workbench/__tests__/DatabaseExplorer.test.tsx src/workbench/__tests__/layoutStore.test.ts --bail=1` — pass (scoped only; full suite takes over an hour and is not run).
2. `npx tsc --noEmit` — clean, with `noUnusedLocals` and `noUnusedParameters` enabled; DEFAULT_LEFT_ITEMS and DatabaseOutlined must stay referenced.
3. `git diff --name-only` — exactly the four files in `files_modified`; no files under `src/workbench/toolwindows/`, `src/services/ai/`, `src/db/`, or `.planning/` outside this quick directory.
</verification>

<success_criteria>
- Fresh workbench shows no Database Explorer button; persisted workbench restores to CR Explorer rather than the hidden panel.
- DatabaseExplorer component, Oracle object viewer, SQL composer, Oracle service, Dexie schema, and all stored records remain untouched.
- No shortcut, palette action, settings toggle, route, schema version, or new dependency introduced.
- Scoped Vitest files and `tsc --noEmit` pass; no full-suite run; no commit or push inside this plan.
</success_criteria>

<output>
Create `.planning/quick/261125-dax-hide-database-explorer-feature-from-ui-k/261125-dax-SUMMARY.md` when done
</output>
