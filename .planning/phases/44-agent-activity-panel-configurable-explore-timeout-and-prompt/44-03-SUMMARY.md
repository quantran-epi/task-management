---
phase: 44-agent-activity-panel-configurable-explore-timeout-and-prompt
plan: 03
subsystem: ui
tags: [agent-activity-panel, right-rail, timeline, prompt-log, tool-events, accessibility, overflow, ant-design, vitest]

requires:
  - phase: 44-agent-activity-panel-configurable-explore-timeout-and-prompt
    provides: "Plan 01 explore_repo timeoutSeconds -> timeoutMs contract and plan 02 id-keyed AgentLiveStep rows with 8000-char caps and payload-derived status"
  - phase: 37.1
    provides: "AgentRunState.steps runtime step list consumed by the compact TeamActivityIndicator popover"
provides:
  - "Presentational AgentActivityPanel: header, agent filter pills, Timeline/Prompt log tabs, explore_repo progress card, status-icon+text event rows, collapsed capped previews"
  - "Third Splitter.Panel in TeamWorkspace with a runtime-only Activity affordance; both controls share open state with synced aria-expanded/aria-controls"
  - "Debug Prompt presentation fully migrated into the Prompt log tab; dropdown item, debug modal, debugModalOpen state and dead imports removed"
  - "TeamDebugLog shape exported from the panel and re-exported by TeamWorkspace; debugLogs capture block byte-unchanged"
  - "14 focused component tests (12 panel + 2 workspace) covering all UI-SPEC covered states and backstops"
affects:
  - "Phase 44 verification: /gsd-code-review, /gsd-ui-review and /gsd-verify-work consume this rail implementation"
  - "TeamWorkspace header layout (new Activity affordance; overflow menu now has only the settings item)"
  - "Debug Prompt is reachable only through the rail's Prompt log tab (D-16)"

actuals:
  tokens: 11717
  tasks: 3
  commits: 3
  plan_head_before: 544222871711cfbcf3038b29ecd3db2c39d88f67
  plan_head_after: 27a938a87653c591ac76983073b07dd38caffbb6

tech-stack:
  added: []
  patterns:
    - "Ant Design 6.6.5 components (Splitter.Panel, Button, Tabs-equivalent accessible strip, Tag, Empty, Tooltip, Progress, Popconfirm, Typography) with theme.useToken() tokens only — no hard-coded light-only hex"
    - "Custom accessible tab strip (role=tablist/tab/tabpanel, aria-selected/aria-controls, arrow/Home/End keys) chosen over AntD Tabs to match the approved draft and keep testable a11y attrs"
    - "Untrusted tool/prompt text rendered as escaped plain-text <pre> (white-space pre-wrap, word-break break-word, own maxHeight/overflow), never dangerouslySetInnerHTML"
    - "Runtime-only rail open/filter/tab state via useState; no persistence, no Dexie/backup schema change (D-07/D-10)"
    - "explore_repo deadline derived from the serialized args string (timeoutSeconds clamped 60..900, default 300) — no unlisted AgentLiveStep field"

key-files:
  created:
    - "src/components/ai/office/AgentActivityPanel.tsx"
    - "tests/components/ai/office/AgentActivityPanel.test.tsx"
    - "tests/components/ai/office/TeamWorkspaceDebugMenu.test.tsx"
  modified:
    - "src/components/ai/office/TeamWorkspace.tsx"

key-decisions:
  - "The panel is presentational and reads the single id-keyed AgentRunState.steps path from plan 02; it creates no second event path and never streams nested remote CLI steps (D-05/D-09)"
  - "A custom accessible tab strip is used instead of AntD Tabs (Claude's Discretion); both Timeline and Prompt log expose role/aria-selected/aria-controls and full keyboard parity"
  - "The rail owns no open-state persistence: TeamWorkspace holds activityOpen (default true on Tauri desktop) and both the Activity affordance and the header close control share it with synced aria-expanded/aria-controls (D-10)"
  - "TeamDebugLog moved byte-identically out of TeamWorkspace and is exported by the panel; TeamWorkspace re-exports it, keeping one shape while the debugLogs capture block stays unchanged (D-14)"
  - "The old Debug Prompt dropdown item, debug modal, debugModalOpen state and the Modal/BugOutlined/Tag/Typography imports are removed in one pass; AIDebugModal.tsx and TeamActivityIndicator.tsx are byte-unchanged (D-15/D-16)"
  - "Status is icon + text only (xong/đang chạy/lỗi) with token colors; every flex child pins minWidth:0 and previews scroll internally so untrusted output cannot widen the page (D-11/D-12, T-44-04/T-44-05)"

patterns-established:
  - "Right-side inspection rail is a layout extension (third Splitter.Panel) beside the transcript, not a Modal/Drawer"
  - "Untrusted tool and prompt content is capped, escaped plain-text data rendered collapsed by default — never auto-expanded, never interpreted as instructions"

requirements-completed: [UI-01, LOG-01]

coverage:
  - id: D1
    description: "A right-side rail with Timeline and Prompt log tabs renders live id-keyed tool-call rows with status icon+text, tool name (ellipsis+Tooltip), agent, HH:mm:ss timestamp and duration; rows are collapsed by default with aria-expanded/aria-controls"
    requirement: UI-01
    verification:
      - kind: component
        ref: "tests/components/ai/office/AgentActivityPanel.test.tsx#renders a done tool-call row collapsed by default and expands its capped preview"
        status: pass
    human_judgment: false
  - id: D2
    description: "Tabs expose role/aria-selected/aria-controls and switch panels; filter pills are grouped under 'Lọc theo agent' and narrow rows by agent id"
    requirement: UI-01
    verification:
      - kind: component
        ref: "tests/components/ai/office/AgentActivityPanel.test.tsx#renders both tabs with role/aria-selected/aria-controls and switches panels"
        status: pass
      - kind: component
        ref: "tests/components/ai/office/AgentActivityPanel.test.tsx#groups filter pills under a labelled group and narrows rows by agent"
        status: pass
    human_judgment: false
  - id: D3
    description: "Running explore_repo renders an elapsed/deadline progress card with accent Progress bar, question snippet and timeout note; deadline derived from serialized args (300 -> 05:00, 9999 clamps to 900 -> 15:00); no nested CLI steps"
    requirement: UI-01
    verification:
      - kind: component
        ref: "tests/components/ai/office/AgentActivityPanel.test.tsx#shows an elapsed/deadline progress card for a running explore_repo, derived from serialized args"
        status: pass
      - kind: component
        ref: "tests/components/ai/office/AgentActivityPanel.test.tsx#clamps an out-of-range serialized timeoutSeconds to the 60..900 window"
        status: pass
    human_judgment: false
  - id: D4
    description: "Empty Timeline/Prompt-log states, done/running/error status variants with icon+text, error copy and running placeholder all render with the pinned UI-SPEC copy"
    requirement: UI-01
    verification:
      - kind: component
        ref: "tests/components/ai/office/AgentActivityPanel.test.tsx#renders the empty Timeline and empty Prompt log copy"
        status: pass
      - kind: component
        ref: "tests/components/ai/office/AgentActivityPanel.test.tsx#shows status icon + text for done, running and error rows"
        status: pass
    human_judgment: false
  - id: D5
    description: "8000-char preview cap with truncation marker and wrapping/overflow styles; every flex child minWidth:0 so the rail cannot widen the document (4 overflow/long-text backstops)"
    requirement: UI-01
    verification:
      - kind: component
        ref: "tests/components/ai/office/AgentActivityPanel.test.tsx#caps an 8000+ char preview and wraps it in its own scrolling container"
        status: pass
    human_judgment: false
  - id: D6
    description: "Prompt log renders every preserved TeamDebugLog field, its empty-state copy, and a Popconfirm clear action with the exact confirmation text calling onClearLogs on confirm"
    requirement: LOG-01
    verification:
      - kind: component
        ref: "tests/components/ai/office/AgentActivityPanel.test.tsx#renders every preserved field of a prompt-history entry"
        status: pass
      - kind: component
        ref: "tests/components/ai/office/AgentActivityPanel.test.tsx#opens the Popconfirm with the exact copy and calls onClearLogs on confirm"
        status: pass
    human_judgment: false
  - id: D7
    description: "The Debug Prompt dropdown item and debug modal are absent; the settings item remains; the Activity affordance opens the rail (with synced aria attrs) to reach the Prompt log; AIDebugModal.tsx and TeamActivityIndicator.tsx byte-unchanged"
    requirement: LOG-01
    verification:
      - kind: component
        ref: "tests/components/ai/office/TeamWorkspaceDebugMenu.test.tsx#has no Debug Prompt menu item and no debug modal, while the settings item remains"
        status: pass
      - kind: component
        ref: "tests/components/ai/office/TeamWorkspaceDebugMenu.test.tsx#exposes the Activity affordance that opens the rail and shows the empty Prompt log"
        status: pass
    human_judgment: false

duration: 11min
completed: 2026-11-17
status: complete
---

# Phase 44 Plan 03: Agent Activity Panel & Prompt Log Summary

**A collapsible right-side rail now shows live tool-call rows and a Prompt log tab beside the transcript, with Debug Prompt fully migrated out of its old dropdown item and modal**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-11-17T05:48:36Z
- **Completed:** 2026-11-17T05:59:10Z
- **Tasks:** 3
- **Files created:** 3
- **Files modified:** 1

## Accomplishments

- Built `AgentActivityPanel.tsx`: header with "Live inspection" eyebrow and close control, agent filter pills, an accessible Timeline/Prompt-log tab strip, a running `explore_repo` progress card driven by the config-01 `timeoutSeconds`, reverse-chronological status-icon+text event rows, and collapsed-by-default capped `<pre>` previews rendered as escaped data.
- Added a third `Splitter.Panel` in `TeamWorkspace` with a runtime-only Activity affordance; the header close control and the affordance share one open state with synced `aria-expanded`/`aria-controls`.
- Migrated Debug Prompt presentation into the Prompt log tab with all preserved fields, a copy affordance, and an AntD `Popconfirm` destructive clear; removed the dropdown item, modal, `debugModalOpen` state and the dead `Modal`/`BugOutlined`/`Tag`/`Typography` imports while keeping `debugLogs` capture and the `TeamDebugLog` shape unchanged.
- Verified with `npx tsc --noEmit -p tsconfig.json` (exit 0) and two focused Vitest suites (14 tests): all UI-SPEC covered states and 4 overflow/long-text backstops have explicit test evidence.

## Task Commits

Each task was committed atomically:

1. **Task 1: Render one live tool call end-to-end in the new rail** - `d8096be5` (feat, tracer)
2. **Task 2: Complete the rail — filter, tabs, explore progress, overflow and a11y** - `c02e3b45` (test)
3. **Task 3: Migrate Debug Prompt into the Prompt log tab and remove the old surfaces** - `27a938a8` (feat)

**Commits measured:** 3 (`plan_head_before 5442228` -> `plan_head_after 27a938a8`).
**Plan metadata:** pending (docs commit by orchestrator).

_Note: production code landed across Tasks 1 and 3 (per the tracer's real-end-to-end-slice guidance); Task 2 adds the full UI-SPEC state/backstop verification. The Task 1 tracer has an automated-only `<verify>` and `human_verify_mode=end-of-phase`, so it was re-run and passed with no checkpoint._

## Files Created/Modified

- `src/components/ai/office/AgentActivityPanel.tsx` (NEW) - presentational rail; exports `AgentActivityPanel`, `TeamDebugLog`, `ACTIVITY_RAIL_ID`, `ACTIVITY_PREVIEW_CAP`.
- `src/components/ai/office/TeamWorkspace.tsx` - third Splitter.Panel + Activity affordance + rail open state; Debug Prompt menu/modal/state/dead imports removed; `TeamDebugLog` re-exported.
- `tests/components/ai/office/AgentActivityPanel.test.tsx` (NEW) - 12 fixture cases: single row, tabs/a11y, filter, progress/deadline, 8000-char cap, empty/status states, Prompt log fields + Popconfirm.
- `tests/components/ai/office/TeamWorkspaceDebugMenu.test.tsx` (NEW) - 2 mount-harness cases: menu/modal removal and Activity-affordance rail access to the Prompt log.

## Decisions Made

- Chose a custom accessible tab strip over AntD Tabs to match the approved draft exactly while keeping role/aria-selected/aria-controls and arrow/Home/End keyboard parity testable in jsdom.
- Kept the rail entirely runtime-only: no Dexie table, backup field or persistence for open/filter/tab state (D-07/D-10).
- Derived the `explore_repo` deadline from the serialized args string and clamped it to 60..900 (default 300), adding no unlisted `AgentLiveStep` field; the progress card shows the app-level call only, never nested remote CLI steps.
- Moved `TeamDebugLog` byte-identically to the panel and re-exported it from TeamWorkspace so one shape is shared; the `setDebugLogs` capture block is unchanged.
- No user-event (not installed): all component tests use `fireEvent`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Two minor test-time corrections, both resolved without changing behavior: (1) a UTC fixture rendered in the +07:00 test timezone, so timestamp fixtures now carry an explicit `+07:00` offset; (2) two `getByText` queries matched both the progress card and the event row and were scoped to the card. No production defects. Typecheck and both focused suites passed after each fix.

## User Setup Required

None - no external service configuration required.

## Threat Flags

None. The plan's STRIDE register is fully mitigated: all tool output and prompt text is escaped plain-text `<pre>` with no `dangerouslySetInnerHTML` (T-44-04), previews are capped at 8000 chars and collapsed by default, and every flex child uses `minWidth: 0` with internal scroll so untrusted output cannot widen the page (T-44-05). Prompt history stays runtime-only with no export/Dexie path, and removing the menu item reduces casual exposure (D-16). No new packages were installed (T-44-SC).

## Known Stubs

None. All tabs, filters, rows, progress and prompt content are wired to real runtime props (`snapshot.agents`, `roster`, `debugLogs`); no mock-only or empty data sources remain in the production panel.

## Next Phase Readiness

- Phase 44's three implementation plans are complete. The right rail, configurable explore timeout and prompt-log migration are ready for the phase-wide quality gates (/gsd-code-review, /gsd-ui-review, /gsd-verify-work) and the single final push to `feature/intellij-workbench` after verification is green (D-17/D-18).
- All 14 UI-SPEC covered states and 4 backstops have explicit automated test evidence; no held-out visual notes remain. A real-Tauri visual walkthrough is still the orchestrator's responsibility via /gsd-verify-work (jsdom cannot assert pixel layout).
- No blockers.

---
*Phase: 44-agent-activity-panel-configurable-explore-timeout-and-prompt*
*Completed: 2026-11-17*

## Self-Check: PASSED

- All 4 changed files exist on disk (3 created, 1 modified).
- All 3 task commits (d8096be5, c02e3b45, 27a938a8) are ancestors of HEAD; measured commit count from the persisted ledger is 3.
- `npx tsc --noEmit -p tsconfig.json` exits 0; the two focused suites pass (14 tests).
- `AIDebugModal.tsx` and `TeamActivityIndicator.tsx` are byte-unchanged; no PWA/GitHub Pages file changed.
