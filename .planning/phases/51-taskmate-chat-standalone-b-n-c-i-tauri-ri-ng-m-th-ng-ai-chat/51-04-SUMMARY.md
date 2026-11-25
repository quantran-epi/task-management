---
phase: 51
plan: 04
subsystem: standalone-chat-grounding
tags: [chat-standalone, grounding-suppression, task-actions, vitest, tauri, build-smoke]

requires:
  - phase: 51
    provides: Wave 03 standalone shell, seven-group settings drawer, and isStandaloneChat prop chain
provides:
  - isStandaloneChat gates on global conventions, global context, entity mentions, and task actions
  - Five zero-call/non-regression tests for standalone grounding plus legacy action regression
  - Phase-51 scoped gate green and chat build smoke producing `.app` plus verified `.dmg`
affects: [51-05, standalone chat verification, dual-app install re-check]

tech-stack:
  added: []
  patterns:
    - Guard every TaskMate grounding call at the turn-assembly site, not in shared services
    - Prove suppression with mocked service zero-call assertions and captured system prompts
    - Conditional object spread removes callbacks entirely instead of leaving invocable stubs

key-files:
  created:
    - tests/phase51/groundingSuppression.test.tsx
  modified:
    - src/components/ai/AIChatDrawer.tsx
    - tests/phase51/AIPopoutView.legacy.test.tsx
    - .planning/phases/51-taskmate-chat-standalone-b-n-c-i-tauri-ri-ng-m-th-ng-ai-chat/51-01-SUMMARY.md

key-decisions:
  - "Global conventions remains editable in the standalone Provider pane but is never read or injected into standalone turns (UI-SPEC resolution of D-08/D-10)."
  - "TaskMate mention grounding is skipped by clearing taskIds/crIds/systemIds and skipping the entity loops; file references still reach knowledge and SSH tools."
  - "Standalone messageListExtensions omits the three task callbacks via conditional spread so no undefined stub can be invoked."
  - "Repo conventions at the ordinary-turn path remain unchanged; Knowledge, MCP, Graphiti, Oracle and SSH service calls are untouched."
  - "Chat release binary, .app bundle, and .dmg built successfully; `tauri:build:chat` sets `CI=true` to skip Finder cosmetic AppleScript, and `hdiutil verify` reports VALID."

patterns-established:
  - "Flag-gated additive behavior: legacy path values stay byte-identical while standalone suppresses only TaskMate data grounding and task actions."
  - "Zero-call contract tests via vi.mock on real service modules plus aiDebugService.startTurn system-prompt capture."

requirements-completed: [P51-GROUND-01]

duration: 18min
completed: 2026-11-26
---

# Phase 51 Plan 04: Standalone grounding suppression Summary

**Standalone chat turns now exclude all TaskMate global/item grounding and task actions while knowledge-family tools and legacy popout behavior remain unchanged**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-11-25T17:34:29Z
- **Completed:** 2026-11-25T17:52:44Z
- **Tasks:** 3/3 (Task 3 build smoke completed with CI-safe DMG packaging)
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- Gated `getGlobalConventions`/`buildConventionsSegment({ global })`, `buildGlobalContextPrompt`, `extractMentionedEntityIds`, task/CR/system entity reads, `buildItemContextPrompt`, and `<mentioned_entities>` on `!isStandaloneChat` in `AIChatDrawer`.
- Gated `canAddToChecklist`, `canSaveStickyNote`, `canRunClaudeCode` and omitted all three task callbacks in standalone; legacy flags and callbacks remain identical.
- Added five tests covering zero-call suppression, prompt absence of `<global_context>`/`<mentioned_entities>`, legacy non-regression, knowledge-family non-regression, and task-action absence.
- Extended legacy popout regression to explicitly pass `standaloneChat={false}`; 6 phase-51 files / 28 tests pass with `npx tsc --noEmit` clean.
- Ran `npm run tauri:build:chat`: release binary, `TaskMate Chat.app`, and valid `.dmg` built with correct `com.personal.taskmate.chat` identity.

## Task Commits

Each task was committed atomically:

1. **Task 1: Suppress TaskMate grounding at turn assembly** - `486a7d48` (feat, RED observed before implementation)
2. **Task 2: Remove task actions and extend legacy regression** - `ea682709` (test, task-action RED observed before implementation in task 1 commit cycle)
3. **Task 3: Verify TaskMate Chat builds and coexists with TaskMate** - auto-approved, no source commit; build result recorded in `51-01-SUMMARY.md`

**Plan metadata:** pending orchestrator metadata commit

_Note: RED was observed for each behavior before implementation; per this plan's atomic task protocol, tests and implementation for a task live in the same task commit where applicable._

## Files Created/Modified

- `src/components/ai/AIChatDrawer.tsx` - four grounding suppression gates and three task-action gates
- `tests/phase51/groundingSuppression.test.tsx` - five zero-call/non-regression tests and turn driver
- `tests/phase51/AIPopoutView.legacy.test.tsx` - explicit legacy flag on existing regression
- `.planning/phases/51-taskmate-chat-standalone-b-n-c-i-tauri-ri-ng-m-th-ng-ai-chat/51-01-SUMMARY.md` - final build smoke result and CI-safe DMG packaging note

## Decisions Made

- Kept `globalConvText`/`globalConventionsSegment` as empty local values in standalone instead of touching shared services, so global conventions can stay editable without entering prompts.
- Skipped only task/CR/system mention grounding; file paths remain separately available for knowledge/SSH tools and other knowledge-family paths are unchanged.
- Used conditional spread to omit task callbacks in standalone, avoiding undefined callbacks that could be invoked downstream.
- Recorded chat build result as full success: `.app` and `.dmg` built, identity verified, and DMG checksum verified.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test harness broke real AIDebugService when mocked wholesale**
- **Found during:** Task 1 (Wave 0 test authoring)
- **Issue:** Mocking `aiDebugService` with a partial object removed `getTurns`, breaking `AIDebugModal` at render time.
- **Fix:** Replaced whole-module mock with `vi.spyOn(aiDebugService, 'startTurn')`, preserving all other service methods.
- **Files modified:** `tests/phase51/groundingSuppression.test.tsx`
- **Verification:** Grounding suite advanced from harness error to the intended RED assertion.
- **Committed in:** `486a7d48`

**2. [Rule 1 - Bug] Task action test failed because composer send button stayed disabled**
- **Found during:** Task 1 (Wave 0 test authoring)
- **Issue:** `fireEvent.change` on the controlled AntD mentions textarea did not update the composer's internal value, so `Gửi tin nhắn` was disabled and no turn ran. Also, submitting while a turn was active unmounted the send control.
- **Fix:** Added a leading space to satisfy AntD's onChange path, asserted the send button was enabled before clicking, and awaited completion of the active turn before legacy assertions.
- **Files modified:** `tests/phase51/groundingSuppression.test.tsx`
- **Verification:** All tests reached the intended service-call assertions; final suite 5/5 green.
- **Committed in:** `486a7d48`

**3. [Rule 1 - Bug] Legacy mention test did not ground items because mocked repositories returned undefined**
- **Found during:** Task 1 (Wave 0 test authoring)
- **Issue:** Mocked `getTask`/`getChangeRequest` returned undefined, so no `buildItemContextPrompt` calls occurred; captured prompt lacked `<mentioned_entities>`.
- **Fix:** Returned minimal entity objects from those mocks and asserted task/CR buildItem calls specifically.
- **Files modified:** `tests/phase51/groundingSuppression.test.tsx`
- **Verification:** Legacy branch now records task/CR grounding and `<mentioned_entities>` as expected.
- **Committed in:** `486a7d48`

**4. [Rule 2 - Missing Critical] Test 5 task-action coverage was initially removed from Task 1**
- **Found during:** Task 2 (task-action test authoring)
- **Issue:** Early test asserted sticky-note button absence in global scope, which did not uniquely prove task-action callbacks were removed; it was removed before the Task 1 commit and re-added in Task 2 with task scope plus callback spies.
- **Fix:** Added a task-scoped turn, asserted all three action buttons absent, and asserted `updateTask`/`createNote`/`launchClaudeTerminal` never called; legacy path asserts sticky-note button present.
- **Files modified:** `tests/phase51/groundingSuppression.test.tsx`
- **Verification:** 5/5 grounding tests pass and 28/28 phase-51 tests pass.
- **Committed in:** `ea682709`

**5. [Rule 1 - Bug] Legacy popout regression relied on an implicit default flag**
- **Found during:** Task 2 (legacy regression extension)
- **Issue:** The first legacy test omitted `standaloneChat`, so it did not explicitly prove the marker-false path.
- **Fix:** Passed `standaloneChat={false}` to the legacy `AIPopoutView` render; all existing assertions unchanged.
- **Files modified:** `tests/phase51/AIPopoutView.legacy.test.tsx`
- **Verification:** Legacy test passes inside the combined phase gate.
- **Committed in:** `ea682709`

---

**Total deviations:** 5 auto-fixed (4 bug, 1 missing critical test coverage)
**Impact on plan:** All fixes were inside the new test harness or explicit legacy flag; production behavior follows the plan with no new dependency, schema, keyring namespace, or network surface.

## Issues Encountered

- Initial DMG attempt failed on macOS Finder Apple Events (`-1743`). Tauri's create-dmg script skips only cosmetic Finder AppleScript when `CI=true`, so `tauri:build:chat` now sets that env; full `.app` + `.dmg` build passes and `hdiutil verify` reports VALID. Details recorded in `51-01-SUMMARY.md`.
- Auto-approved checkpoint (auto-mode): `⚡ Auto-approved checkpoint (auto-mode)`. Build smoke completed; manual dual-app install/coexistence remains a human check because no second install was performed in this environment.
- Ant Design deprecation and jsdom `act`/pseudo-element warnings remain from existing components; no assertion failure and no changes to unrelated files.
- No full Vitest suite run per project rule. No stash, reset, force-push, or touched concurrent-session files.

## Auth Gates

None.

## Known Stubs

None in production code. `globalConvText`/`globalConventionsSegment` intentionally stay empty in standalone turns; this is the required D-08 suppression, not an unwired data source.

## Threat Flags

None. Threat register mitigations T-51-13..T-51-16 upheld by zero-call tests and unchanged knowledge-family paths. No new network endpoint, auth path, file access pattern, or schema change.

## User Setup Required

None for automated behavior. Manual DMG install/coexistence verification remains pending as a human check; the built `.app` and verified `.dmg` are available for manual installation.

## Next Phase Readiness

- Standalone chat no longer leaks TaskMate task/CR/system/document grounding and exposes no task actions.
- Legacy TaskMate and popout behavior remains unchanged and covered.
- `npm run tauri:build:chat` now produces both bundles; dual-app install verification remains the phase-51 human checkpoint.

## Verification

- `npx vitest run tests/phase51/groundingSuppression.test.tsx --bail=1` - 1 file, 5 tests passed.
- `npx vitest run tests/phase51 --bail=1` - 6 files, 28 tests passed.
- `npx tsc --noEmit` - exit 0.
- `node -e "package.json + tauri.conf.chat.json identity check"` - `chat bundle inputs OK`.
- `npm run tauri:build:chat` - release binary, `.app`, and `.dmg` built; `hdiutil verify` reports VALID.
- Protected shared files (`.planning/STATE.md`, `.planning/config.json`, `.planning/debug/*`, other branches) untouched by this plan.

## Self-Check: PASSED

- Five plan artifacts exist on disk.
- Commits `486a7d48` and `ea682709` exist in git history.
- Verification commands above recorded from actual runs.
- Protected shared files (`.planning/STATE.md`, `.planning/config.json`, `.planning/debug/*`) untouched by this plan.
