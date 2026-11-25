---
phase: 51
plan: 03
subsystem: standalone-chat-settings
tags: [chat-standalone, ai-settings, drawer, react, antd-wrappers, dexie, keyring, vitest]

requires:
  - phase: 51
    provides: Wave 02 standalone chat shell with gear-triggered settings drawer state and KnowledgeConfigProvider on the chat route
provides:
  - Seven-group AI settings drawer with locked D-09 side-nav order and per-group accordion
  - Provider group mounting NineRouterConfigCard plus nested GlobalConventionsCard on shared db/keyring
  - Standalone host wiring that keeps chat mounted and restores gear focus on close
  - Eight new contract tests for group order, card identity, provider resolution and chat-state preservation
affects: [51-04, standalone chat first-run configuration, tool-callback wiring]

tech-stack:
  added: []
  patterns:
    - Dedicated body component (AISettingsDrawerBody) composed inside a wrapped Drawer to avoid nested drawers
    - Render-time trigger capture for deterministic focus restoration across close button, Esc and backdrop
    - Card identity assertions through vi.hoisted spies on mocked real card modules

key-files:
  created:
    - src/components/ai/AISettingsDrawer.tsx
    - tests/phase51/AISettingsDrawer.test.tsx
  modified:
    - src/views/AIPopoutView.tsx

key-decisions:
  - "Drawer shell and body live in one file; AIPopoutView mounts only the composite so no nested Drawer is possible."
  - "Global conventions is editable by nesting the existing GlobalConventionsCard inside the Provider pane because NineRouterConfigCard source does not contain that field; it is not an eighth side-nav group."
  - "All seven cards reuse their existing components, one db prop and the unchanged task-planner keyring service and ninerouter_api_key key; no settings key or dependency added."
  - "Focus returns to the gear via render-time activeElement capture plus afterOpenChange, because child Drawer autofocus can overwrite an effect-time capture."

patterns-established:
  - "Real-card composition over reimplementation: module identity spies prove each settings group mounts the existing card against the shared db."
  - "Additive standalone wiring: the legacy TaskMate SettingsView and popout branch remain untouched."

requirements-completed: [P51-SETTINGS-01]

duration: 32min
completed: 2026-11-26
---

# Phase 51 Plan 03: Full AI settings drawer Summary

**Seven-group side-nav settings drawer composing the existing NineRouter, Knowledge, MCP, Graphiti, Oracle, SSH FS and Tool Catalog cards on shared storage, wired into the standalone chat without unmounting chat**

## Performance

- **Duration:** ~32 min
- **Started:** 2026-11-25T23:45:00Z
- **Completed:** 2026-11-26T00:32:07Z
- **Tasks:** 2/2
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- Built `AISettingsDrawer` and `AISettingsDrawerBody` with exactly seven locked side-nav labels, `aria-current`, accordion headers exposing `aria-expanded`, wrapped-only AntD components and a 460px right-side Drawer.
- Mounted each real settings card in its group against one db; Provider includes `NineRouterConfigCard` fields and a nested `GlobalConventionsCard` for editable global conventions.
- Replaced plan 02's empty drawer in `AIPopoutView` with the composite drawer; gear, open state and db flow through unchanged chat state.
- Verified close button, Esc and backdrop close restore gear focus and preserve a pre-typed draft.
- Added eight tests and verified 11/11 scoped tests pass with `npx tsc --noEmit` clean.

## Task Commits

Each task was committed atomically:

1. **Task 1: Seven-group AISettingsDrawer composing real cards** - `e32d694e` (feat; Wave 0 RED observed before implementation)
2. **Task 2: Wire drawer into standalone host with knowledge provider** - `5c223663` (feat; Wave 0 RED observed before wiring)

## Files Created/Modified

- `src/components/ai/AISettingsDrawer.tsx` - seven-group side-nav drawer/body, card composition, focus restoration
- `src/views/AIPopoutView.tsx` - composite drawer host replacing the empty plan 02 Drawer
- `tests/phase51/AISettingsDrawer.test.tsx` - eight contract tests (group order, composition, fields, host wiring, provider, focus/draft)

## Decisions Made

- Global conventions is nested inside the Provider pane via the existing `GlobalConventionsCard`; the real `NineRouterConfigCard` does not render that field, and D-10 requires it editable without adding an eighth group.
- Trigger focus is captured during render rather than in an effect because the wrapped Drawer autofocuses its panel in a layout effect on open.
- No second `KnowledgeConfigProvider` was added; the route provider from plan 02 resolves `KnowledgeServerConfigCard`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Global conventions was not part of NineRouterConfigCard**
- **Found during:** Task 1 (Provider group implementation)
- **Issue:** Plan/UI-SPEC list "Global conventions" as a locked Provider field, but `src/components/settings/NineRouterConfigCard.tsx` has no such field; it lives in `GlobalConventionsCard` in TaskMate's AI tab.
- **Fix:** Nested the existing `GlobalConventionsCard db={db}` inside the Provider pane, keeping exactly seven side-nav groups and the same Dexie `settings` store. D-08 suppression of conventions in standalone prompts remains plan 04's work.
- **Files modified:** `src/components/ai/AISettingsDrawer.tsx`, `tests/phase51/AISettingsDrawer.test.tsx`
- **Verification:** Provider contract test asserts the five locked labels and keyring constants; `npx vitest run tests/phase51/AISettingsDrawer.test.tsx --bail=1` green.
- **Committed in:** `e32d694e`

**2. [Rule 1 - Bug] Reliable gear focus restoration on every close path**
- **Found during:** Task 2 (focus/draft test)
- **Issue:** Antd Drawer autofocuses its panel in a layout effect, so effect-time trigger capture recorded the panel; Esc and repeated open/close left focus on the hidden drawer root.
- **Fix:** Capture `document.activeElement` during the open transition in render and restore it in `afterOpenChange`.
- **Files modified:** `src/components/ai/AISettingsDrawer.tsx`, `tests/phase51/AISettingsDrawer.test.tsx`
- **Verification:** Test 8 asserts gear focus after close button, window Escape and backdrop clicks with draft unchanged; 11/11 scoped tests pass.
- **Committed in:** `5c223663`

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 bug)
**Impact on plan:** Both required for the locked D-10 field and D-06/UI-SPEC focus behavior. No new dependency, schema or keyring namespace.

## Issues Encountered

- AntD close button's accessible name comes from locale (`Close` in en_US); the requested Vietnamese name is applied to the close icon span nested inside that button. Test asserts the icon label and the button role.
- Antd keeps closed drawers mounted with an inert hidden wrapper during motion; close assertions use `.ant-drawer-open` absence and focus restoration instead of DOM removal.
- Test mocks for `SshFsAiToolConfigCard` must also export `DEFAULT_SSH_FS_CONFIG`, which is consumed by the real `SshFsSettingsModal` module graph.
- No install attempted; D-15 respected. No full Vitest suite run per memory rule.

## Auth Gates

None.

## Known Stubs

None affecting the plan goal. All seven groups mount real cards on shared storage; plan 04 still owns D-08 suppression of global conventions in prompts (no TaskMate context in standalone turns).

## Threat Flags

None. No new network endpoint, auth path, file access pattern or schema change. Threat register mitigations T-51-09..T-51-12 and T-51-SC are upheld: masked/keyring-backed key via unchanged card, no second settings/keyring namespace, route provider resolves knowledge config, side nav pinned to seven labels, and no installs.

## User Setup Required

None - configuration is entered through the existing cards at runtime; no external service setup required by this plan.

## Next Phase Readiness

- Plan 04 can wire task-specific message callbacks and D-08 prompt-context suppression without changing the settings drawer or shell.
- Full dual-app install smoke remains a phase-51 human checkpoint outside this plan.

## Verification

- `npx vitest run tests/phase51/AISettingsDrawer.test.tsx tests/phase51/AIPopoutView.standalone.test.tsx --bail=1` - 2 files, 11 tests passed.
- `npx tsc --noEmit` - exit 0.
- No direct `antd` or `@ant-design/icons` import in new production code; only `src/components/ui` / `src/components/ui/icon` used.
- TaskMate normal `SettingsView` and popout branch unchanged; shared `.planning/STATE.md`, `.planning/config.json` and `.planning/debug/*` untouched by this plan.

## Self-Check: PASSED

- All four plan artifacts exist on disk.
- Commits `e32d694e` (Task 1) and `5c223663` (Task 2) exist in git history.
- 11 scoped tests pass; `npx tsc --noEmit` clean.
- No shared files touched (`.planning/STATE.md`, `.planning/config.json`, `.planning/debug/*`).
- No file deletions in either task commit.

---
*Phase: 51-taskmate-chat-standalone*
*Completed: 2026-11-26*
