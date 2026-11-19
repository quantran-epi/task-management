---
phase: 46-configuration-profiles
plan: 02
subsystem: ui
tags: [configuration-profiles, authoring, defaults, ant-design, hash-route, tauri-workbench, export, telegram-excluded]

requires:
  - phase: 46-configuration-profiles
    provides: "46-01 service contract: buildDefaultProfileConfig, getProfiles/saveProfiles, catalog getSecretFields/getMachineSpecificFields, exportProfileToFile"
provides:
  - "Standalone ConfigProfilesView authoring screen seeded exclusively from DEFAULT_* constants with named profile CRUD"
  - "ConfigProfileExportButton that exports exactly the selected profile with blank secrets"
  - "'config-profiles' route registered in hash routing and the Tauri workbench (six registration points)"
  - "Focused tests proving no author-time db.settings read, full in-scope field coverage, Telegram exclusion, export safety, and SettingsView six-tab non-regression"
affects:
  - "46-03 import preview and post-import checklist"
  - "Any future navigation or workbench view-type additions"

actuals:
  tokens: 92000
  tasks: 2
  commits: 2
  plan_head_before: 4e73572629025a3377780647e0bdb5466ef88c5b
  plan_head_after: b65cda1d325c777b9748e11f4dd0c713cfe81ed8

tech-stack:
  added: []
  patterns:
    - "Local-useState authoring form fed only by buildDefaultProfileConfig(); no db-reading config cards mounted"
    - "Named profiles in the one-row-array configuration_profiles settings key with generateId() UUIDs"
    - "Secret fields rendered read-only blank with an export-blank placeholder; machine-specific fields carry a warning marker including ghostDevConfig.claudePath"
    - "One shared 'config-profiles' view-type string mirrored across six route/workbench registration points"

key-files:
  created:
    - "src/views/ConfigProfilesView.tsx"
    - "src/components/settings/ConfigProfileExportButton.tsx"
    - "tests/views/ConfigProfilesView.test.tsx"
    - "tests/components/settings/ConfigProfileExportButton.test.tsx"
  modified:
    - "src/types/navigation.ts"
    - "src/hooks/useHashRoute.ts"
    - "src/App.tsx"
    - "src/workbench/EditorArea.tsx"
    - "src/workbench/WorkbenchLayout.tsx"
    - "src/workbench/store/layoutStore.ts"

key-decisions:
  - "Authoring state is initialised only from buildDefaultProfileConfig(); the only db.settings.get call in the view is getProfiles() reading the configuration_profiles list, never the author's configuration"
  - "Telegram is absent from the authoring UI: no field, label, section or record control — owner-machine-only decision"
  - "AI-team template exposes only configuration defaults (budget, concurrency, toggles, threshold) with a 'Kế thừa global' (null) choice; no team ids, names, members, usage or folders"
  - "ConfigProfileExportButton takes the selected profile as a prop and never queries current settings; exportProfileToFile blanks secrets before the 3-layer save dialog"
  - "SettingsView's six tabs were left byte-identical; the new screen is a separate route and workbench tab"
  - "One-click export passes the selected profile directly; loading resets in finally on both success and failure"

patterns-established:
  - "ConfigProfilesView: standalone PageHeader + sectioned Card form, local useState seeded from defaults, with one-row-array named profile CRUD"
  - "Machine-specific and secret fields carry data-machine-specific / data-secret-field markers for deterministic UI assertions"
  - "Route additions require six synchronous edits; use the identical 'config-profiles' string in every list"

requirements-completed: [D-01, D-02, D-03, D-04, D-05, D-07]

coverage:
  - id: D1
    description: "Authoring screen seeds from DEFAULT_* constants and never reads the author's settings during authoring"
    requirement: D-01
    verification:
      - kind: unit
        ref: "tests/views/ConfigProfilesView.test.tsx#seeds the form from DEFAULT_* constants and NEVER reads db.settings during authoring"
        status: pass
    human_judgment: false
  - id: D2
    description: "All in-scope groups (capacity, Ghost Dev, AI global, AI-team template) render; Telegram and team bookkeeping do not"
    requirement: D-02
    verification:
      - kind: unit
        ref: "tests/views/ConfigProfilesView.test.tsx#renders capacity, Ghost Dev and AI-team template sections"
        status: pass
      - kind: unit
        ref: "tests/views/ConfigProfilesView.test.tsx#renders NO Telegram field/section and no team record controls"
        status: pass
    human_judgment: false
  - id: D3
    description: "Secret fields render blank with an export-blank placeholder; machine-specific fields including claudePath carry a review warning"
    requirement: D-03
    verification:
      - kind: unit
        ref: "tests/views/ConfigProfilesView.test.tsx#renders secret fields blank with an export-blank placeholder"
        status: pass
      - kind: unit
        ref: "tests/views/ConfigProfilesView.test.tsx#flags machine-specific fields including ghostDevConfig.claudePath with a warning marker"
        status: pass
    human_judgment: false
  - id: D4
    description: "Named profiles can be created, saved, selected and deleted through the one-row-array store"
    requirement: D-05
    verification:
      - kind: unit
        ref: "tests/views/ConfigProfilesView.test.tsx#creates, saves, selects and deletes named profiles through the one-row store"
        status: pass
    human_judgment: false
  - id: D5
    description: "One-click export passes exactly the selected profile with blank secrets and reports success; loading resets on failure"
    requirement: D-07
    verification:
      - kind: unit
        ref: "tests/components/settings/ConfigProfileExportButton.test.tsx#saves exactly the selected profile with blank secrets and reports success"
        status: pass
      - kind: unit
        ref: "tests/components/settings/ConfigProfileExportButton.test.tsx#resets loading state after a rejected save and reports the error"
        status: pass
    human_judgment: false
  - id: D6
    description: "'config-profiles' resolves in hash route and Tauri workbench while SettingsView remains six tabs"
    requirement: D-01
    verification:
      - kind: other
        ref: "npx tsc --noEmit -p tsconfig.json; npx vitest run tests/views/SettingsView.test.tsx --bail=1"
        status: pass
    human_judgment: false
  - id: D7
    description: "Visual adequacy of the new authoring screen in the real Tauri workbench"
    verification: []
    human_judgment: true
    rationale: "jsdom proves behaviour but not visual layout; the workbench UI needs a human visual walkthrough (deferred to phase validation)."

duration: 11min
completed: 2026-11-19
status: complete
---

# Phase 46 Plan 02: Configuration Profiles UI Summary

**Defaults-seeded authoring screen with named profile CRUD, one-click blank-secret export, and full hash/Tauri route registration**

## Performance

- **Duration:** 11 min
- **Started:** 2026-11-19T05:54:25Z
- **Completed:** 2026-11-19T06:05:41Z
- **Tasks:** 2
- **Files modified:** 10 (4 created, 6 modified)

## Accomplishments

- ConfigProfilesView seeds entirely from `buildDefaultProfileConfig()`, renders every in-scope setting group, and persists named profiles via the one-row-array store without ever reading current user settings.
- Secrets render as blank read-only fields with an explicit export-blank placeholder; machine-specific fields, including Ghost Dev `claudePath`, carry visible review warnings. Telegram is entirely absent.
- ConfigProfileExportButton exports exactly the selected profile with loading, notifications and screen-reader announcements; loading resets on both success and rejected saves.
- Route id `config-profiles` is registered in all six navigation/workbench points; SettingsView's six-tab lock stays untouched.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build the defaults-seeded authoring screen with named profile CRUD** - `72404a5a` (feat)
2. **Task 2: Wire one-click export and register the screen in every route list** - `b65cda1d` (feat)

**Plan metadata:** pending (this commit)

## Files Created/Modified

- `src/views/ConfigProfilesView.tsx` — standalone defaults-seeded authoring screen and named profile CRUD
- `src/components/settings/ConfigProfileExportButton.tsx` — one-click selected-profile export button
- `tests/views/ConfigProfilesView.test.tsx` — authoring purity, field coverage, Telegram exclusion, CRUD proof
- `tests/components/settings/ConfigProfileExportButton.test.tsx` — one-click export and loading reset proof
- `src/types/navigation.ts` — AppRoute union entry
- `src/hooks/useHashRoute.ts` — VALID_ROUTES entry
- `src/App.tsx` — `renderContent` case
- `src/workbench/EditorArea.tsx` — `renderViewContent` case (primary Tauri runtime)
- `src/workbench/WorkbenchLayout.tsx` — tab title for the new view
- `src/workbench/store/layoutStore.ts` — EditorViewType union entry

## Decisions Made

- The authoring form accepts a `db` prop solely for the named-profile list store; `getProfiles()` is the only settings read and it targets `configuration_profiles`, never a configuration key.
- Telegram was not added anywhere in the screen; the owner-machine-only decision takes precedence over the plan's broader "every group" wording.
- The AI-team template exposes only configuration defaults with a `null` "inherit global" threshold choice.
- One shared lowercase `config-profiles` literal is used at all six registration points.
- Verification used `--bail=1` (Vitest 5 rejects the plan's legacy `-x` flag).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Import-time TypeScript contract required adjacent files**
- **Found during:** Task 1 (authoring screen)
- **Issue:** Creating ConfigProfilesView before the export button produced a missing-module type error; strict `exactOptionalPropertyTypes` also rejected several draft-update object shapes.
- **Fix:** Added ConfigProfileExportButton in the same task commit, used explicit spread guards for optional fields, and imported `Fragment` directly.
- **Files modified:** `src/views/ConfigProfilesView.tsx`, `src/components/settings/ConfigProfileExportButton.tsx`
- **Verification:** `npx tsc --noEmit -p tsconfig.json` clean.
- **Committed in:** `72404a5a`

**2. [Rule 1 - Bug] Test selectors depended on prose labels and DOM nesting**
- **Found during:** Task 1 (authoring tests)
- **Issue:** Secret fields with key-specific Vietnamese labels and a warning icon rendered as a sibling made text/role selectors brittle.
- **Fix:** Added `data-secret-field`, `data-machine-specific` and `data-machine-specific-row` markers and asserted on those stable attributes.
- **Files modified:** `src/views/ConfigProfilesView.tsx`, `tests/views/ConfigProfilesView.test.tsx`
- **Verification:** `npx vitest run tests/views/ConfigProfilesView.test.tsx --bail=1` — 6/6 pass.
- **Committed in:** `72404a5a`

**3. [Rule 1 - Bug] Export button mock lacked a resolved return value**
- **Found during:** Task 2 (export button test)
- **Issue:** With `exportProfileToFile` mocked without a resolved value, the success notification never fired.
- **Fix:** Seeded `EXPORT_MOCK.mockResolvedValue({ saved: true })` in `beforeEach` and asserted blank secrets through the real payload builder via `vi.importActual`.
- **Files modified:** `tests/components/settings/ConfigProfileExportButton.test.tsx`
- **Verification:** `npx vitest run tests/components/settings/ConfigProfileExportButton.test.tsx --bail=1` — 2/2 pass.
- **Committed in:** `b65cda1d`

---

**Total deviations:** 3 auto-fixed (Rule 1 bugs in new code only)
**Impact on plan:** No scope change; all must-haves and acceptance criteria verified.

## Issues Encountered

- The unchanged `tests/views/SettingsView.test.tsx` emits a pre-existing `DatabaseClosedError` unhandled rejection from its own teardown when run in isolation or with the new suites. All 9 assertions pass and `git diff` confirms the file was not touched, so this is out of scope for this plan and recorded here for the verifier.
- No full suite was run (project rule: over an hour).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for 46-03 (import preview + post-import checklist): the authoring screen and export button are in place, with catalogue-driven secret/machine classifications available for the checklist.
- Native Tauri save-dialog visual walkthrough remains a manual-only validation item.
- No blockers for the next plan.

## Self-Check: PASSED

- All created files exist on disk.
- Task commits `72404a5a` and `b65cda1d` are present in HEAD history.
- All task acceptance criteria verified (source checks plus focused tests).
- Wave verification: `npx tsc --noEmit -p tsconfig.json` clean; 3 focused suites, 17 tests passed.

---
*Phase: 46-configuration-profiles*
*Completed: 2026-11-19*
