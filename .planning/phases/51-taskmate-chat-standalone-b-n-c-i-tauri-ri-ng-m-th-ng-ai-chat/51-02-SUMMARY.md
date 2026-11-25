---
phase: 51
plan: 02
subsystem: standalone-chat-shell
tags: [chat-standalone, route, react, antd, tauri, listener-gating, vitest]

requires:
  - phase: 51
    provides: Wave 01 packaging with committed VITE_CHAT_STANDALONE marker and hash-seeded Tauri chat window
provides:
  - Standalone chat route branch with injectable flag and KnowledgeConfigProvider
  - Parent-coupling neutralizer for scope/draft listeners, postMessage and popout geometry
  - Gear-only standalone ChatHeader with right-side AI settings drawer host
  - Nine phase-51 contract tests covering route, standalone isolation and legacy regression
affects: [51-03, 51-04, standalone chat settings and tool-callback work]

tech-stack:
  added: []
  patterns:
    - Build-time flag read once at module level with injectable React prop for tests
    - Feature-gated useEffect early return keeps legacy effect body unchanged
    - Wrapped Ant Design components only (IconButton, Drawer, Tooltip) per GUARD-01/ADOPT-01/02

key-files:
  created:
    - tests/phase51/standaloneRoute.test.tsx
    - tests/phase51/AIPopoutView.standalone.test.tsx
    - tests/phase51/AIPopoutView.legacy.test.tsx
  modified:
    - src/AppIntelliJ.tsx
    - src/views/AIPopoutView.tsx
    - src/components/ai/AIChatDrawer.tsx
    - src/components/ai/ChatHeader.tsx

key-decisions:
  - "STANDALONE_CHAT reads import.meta.env.VITE_CHAT_STANDALONE === '1' once; AppIntelliJProps.standaloneChat overrides it for tests without rebuilding."
  - "The legacy ai-popout branch gains only KnowledgeConfigProvider plus standaloneChat pass-through; all other route branches and boot hooks stay untouched."
  - "AIPopoutView early-returns from the listener/geometry effect in standalone so no Tauri event, postMessage, geometry or always-on-top call can run."
  - "Standalone scope is initialized to literal { type: 'global' } and remote-target registration is skipped; hash scope params are ignored."
  - "ChatHeader branches on onOpenSettings presence: standalone gets gear and global chip only; legacy header markup remains unchanged."

patterns-established:
  - "Additive standalone gating: flag-driven props and early-return effects preserve byte-identical legacy behavior paths."
  - "Settings drawer host in AIPopoutView keeps AIChatDrawer mounted; plan 03 fills the drawer body in the same file."

requirements-completed: [P51-SHELL-01]

duration: 12min
completed: 2026-11-25
---

# Phase 51 Plan 02: Chat-only standalone shell Summary

**Standalone `#ai-popout` now renders chat-only with zero parent-window coupling, forced global scope, and a gear-hosted settings drawer while TaskMate popout behavior stays unchanged**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-11-25T23:36:00Z
- **Completed:** 2026-11-25T23:48:00Z
- **Tasks:** 2/2
- **Files modified:** 7 (3 created, 4 modified)

## Accomplishments

- Added `STANDALONE_CHAT` marker read and injectable `standaloneChat` prop in `AppIntelliJ`; chat route now wraps `KnowledgeConfigProvider` and forwards the flag on first render for both hash forms.
- Gated `AIPopoutView` listener/geometry effect behind `standaloneChat`, forced global scope from hash-at-mount, and mounted a right-side wrapped `Drawer` from a gear callback without remounting chat.
- Added `isStandaloneChat` to `AIChatDrawer` to skip remote-target registration and suppress scope picker, detach, pin, debug, instructions and popout callbacks; tab bar, composer and history untouched.
- Added `onOpenSettings` to `ChatHeader` with a wrapped `SettingOutlined` IconButton (`aria-label="Mở Cài đặt AI"`, `data-testid="chat-settings-gear"`) and a standalone header branch with no More/pin/close controls.
- Wrote nine tests across three files; RED observed for each task before implementation, all nine GREEN after.

## Task Commits

Each task was committed atomically:

1. **Task 1: Standalone route branch, provider and flag chain** - `e6b4e1ff` (feat; RED test authored and observed before implementation)
2. **Task 2: Neutralize popout parent coupling and add gear** - `f906f933` (feat; RED tests authored and observed before implementation)

## Files Created/Modified

- `src/AppIntelliJ.tsx` - module-level standalone marker, injectable prop, `KnowledgeConfigProvider` on chat branch, `standaloneChat` pass-through
- `src/views/AIPopoutView.tsx` - prop contract, standalone effect early return, forced global scope, settings drawer host
- `src/components/ai/AIChatDrawer.tsx` - `isStandaloneChat` prop, skipped remote registration, suppressed ChatHeader affordances, forwarded gear callback
- `src/components/ai/ChatHeader.tsx` - `onOpenSettings` prop, standalone gear-only header, legacy header preserved
- `tests/phase51/standaloneRoute.test.tsx` - four route/provider contract tests
- `tests/phase51/AIPopoutView.standalone.test.tsx` - three isolation, scope and gear/drawer tests
- `tests/phase51/AIPopoutView.legacy.test.tsx` - two legacy regression tests

## Decisions Made

- Kept `AppIntelliJProps` additive with a default from the build-time marker so tests inject the flag without a rebuild or `.env` file (marker contract from 51-01).
- Used an effect early return for standalone instead of conditional dynamic imports, leaving the legacy listener/geometry body unchanged for regression safety (D-13, T-51-05/06/07).
- Forwarded `onOpenSettings` only for standalone; `ChatHeader` uses its presence as the single switch between standalone and legacy header shapes (D-05/D-07).
- Drawer body intentionally empty in this plan: plan 03 replaces it with the seven-group settings UI without remounting chat (D-06).

## Deviations from Plan

None - plan executed as written. Contract tests were authored first and observed failing before implementation per TDD; strict TypeScript `exactOptionalPropertyTypes` required explicit `| undefined` on three callback props plus a conditional pin menu item in `ChatHeader`.

## Issues Encountered

- Existing `tests/ai/AIChatDrawer.test.tsx` test "uses discovered Graphiti tools across model loops..." fails with `discoverAllMcpTools` called 0 times. Reproduced after temporarily restoring all three baseline source files — pre-existing failure, out of scope for this plan. Not fixed.
- Test mocks for `@tauri-apps/api/window` initially lacked `PhysicalPosition`, `PhysicalSize` and `currentMonitor`; corrected by sourcing those exports from a dedicated mock object.
- `useAntdToken` / Ant Design components emit `act(...)` warnings in jsdom; no assertion failure, left unchanged.

## Auth Gates

None.

## Known Stubs

- `src/views/AIPopoutView.tsx` - settings `Drawer` body intentionally empty in this plan; plan 03 fills it with the seven-group AI settings UI. Drawer shell, placement, width, mask and close behavior are functional.

## Threat Flags

None. Standalone path skips parent-scope/draft/postMessage listeners, ignores hash scope params, and never reads or writes popout geometry. No network endpoint, auth path, schema change or new dependency introduced (T-51-05/06/07/08/SC all mitigated in code and tests).

## User Setup Required

None - marker comes from committed `vite.chat.config.ts` (Wave 01); no external service configuration for this plan.

## Next Phase Readiness

- Plan 03 can replace the drawer body with the seven AI setting groups using the existing `settingsOpen` state and `KnowledgeConfigProvider` already on the branch.
- Plan 04 can wire task-specific message callbacks without touching standalone affordance gating.
- Full dual-app install smoke remains a phase-51 human checkpoint outside this plan.

## Verification

- `npx vitest run tests/phase51/standaloneRoute.test.tsx tests/phase51/AIPopoutView.standalone.test.tsx tests/phase51/AIPopoutView.legacy.test.tsx --bail=1` → 3 files, 9 tests passed.
- `npx tsc --noEmit` → exit 0.
- `tests/views/AIPopoutView.test.tsx` → 3 tests passed (existing popout draft handoff preserved).
- Scoped diff review: only additive flag/props/guards in chat route and popout/drawer/header; other route branches and boot/splash logic unchanged.

## Self-Check: PASSED

- All seven plan artifacts exist on disk.
- Commits `e6b4e1ff` (Task 1) and `f906f933` (Task 2) exist in git history.
- Three phase-51 test files and typecheck pass; no shared files touched (`.planning/STATE.md`, `.planning/config.json`, `.planning/debug/*` untouched by this plan).
- No file deletions in either task commit.

---
*Phase: 51-taskmate-chat-standalone*
*Completed: 2026-11-25*
