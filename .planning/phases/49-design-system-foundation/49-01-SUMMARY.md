---
phase: 49-design-system-foundation
plan: 01
subsystem: ui
tags: [shell-removal, intellij-workbench, pwa-removal, source-guard, vite, vitest]

requires:
  - phase: 48-agent-developer-workbench
    provides: AppIntelliJ workbench shell and coding-zone popout route to anchor the single-shell boot

provides:
  - Unconditional `AppIntelliJ` boot with zero shell flags or legacy AntD shell
  - Single owner for boot side effects: ghost notifications, global tool-task listener, notification deep links, timer alert, SQLite mirror, GitHub auto-sync, Telegram worker, team-run teardown
  - All four popout routes (timer, notes, ai, coding-zone) under one theme adapter
  - Zero PWA install/manifest/service-worker source, config, lockfile dependency or test
  - Source-scan guard test anchoring SHELL-01..03 against regression
affects:
  - Phase 50 app-wide wrapper migration (one shell/theme tree only)
  - Phase 49 plans 02-09 (unified tokens, wrappers, ESLint guard must target the single workbench tree)

tech-stack:
  added: []
  patterns:
    - Hard-boot a single shell with no runtime selection or migration (C-16 test-data rule)
    - Source-scan tests via readFileSync/existsSync for cross-file removal invariants
    - Runtime hooks relocated from the deleted shell to the workbench root, never into a tab

key-files:
  created:
    - src/workbench/__tests__/shellRemoval.test.ts
  modified:
    - src/main.tsx
    - src/AppIntelliJ.tsx
    - src/workbench/TitleBar.tsx
    - src/views/SettingsView.tsx
    - vite.config.ts
    - package.json
    - package-lock.json
    - src/workbench/__tests__/mainBoot.test.ts
    - tests/views/PlannerView.test.tsx
    - tests/views/SettingsView.test.tsx
    - tests/components/settings/BackupExportCard.test.tsx

key-decisions:
  - Boot flag removed entirely rather than defaulted: no `?ui=`, no `taskmate_ui_shell` reader/writer, no migration (D-13, SHELL-03, C-16)
  - `coding-zone-popout` renders inside `AntdThemeAdapter` with no domain provider, mirroring `notes-popout`
  - Global tool-task listener detached only on root teardown, with cancelled guard around the async Tauri import
  - PWA deleted at source/config/lockfile level; no compatibility shim, dead alias or inert runtime branch
  - Lockfile synced with `npm install --package-lock-only --ignore-scripts` (T-49-SC)

patterns-established:
  - Single-shell boot: `main.tsx` renders only `<AppIntelliJ />`
  - Guard-by-source-scan: explicit `toBe(true)`/`toBe(false)` per token and deleted path
  - Surviving runtime hooks live at the root shell, never in a chat tab or popout

requirements-completed: [SHELL-01, SHELL-02, SHELL-03]

duration: 10min
completed: 2026-11-21
---

# Phase 49 Plan 01: Design System Foundation — Single Workbench Shell Summary

**Hard-booted the IntelliJ workbench, deleted the legacy AntD shell and every PWA artifact, and anchored the invariant with source-scan guard tests**

## Performance

- **Duration:** 10 min
- **Started:** 2026-11-21T07:38:45Z
- **Completed:** 2026-11-21T07:47:49Z
- **Tasks:** 3/3
- **Files modified:** 35 across 3 commits

## Accomplishments

- `src/main.tsx` now renders `<AppIntelliJ />` unconditionally; `shouldBootIntelliJ`, `?ui=`, `taskmate_ui_shell` and the `./App` import are gone.
- `AppIntelliJ` owns ghost-dev OS notifications, the ONE global Tauri tool-task listener with cancelled guard, notification deep links, timer alert monitoring, SQLite mirror, team-run teardown, GitHub auto-sync, Telegram headless worker and the `coding-zone-popout` route.
- Deleted `src/App.tsx`, `AppShell.tsx`, `Navigation.tsx`, all PWA source/config and their tests; removed `VitePWA`, manifest/workbox config, the `virtual:pwa-register/react` alias and `vite-plugin-pwa`/`workbox-window` from `package.json` and lockfile.
- Removed the shell-switch control/tooltip from `TitleBar`, the PWA card from `SettingsView`, and added `shellRemoval.test.ts` (20 explicit assertions) plus a rewritten `mainBoot.test.ts`.
- Verification: `npx tsc --noEmit` clean; `npx vite build` succeeds; 6 focused test files / 37 tests pass including the guard pair; no full Vitest suite.

## Task Commits

1. **Task 1: Hard-boot IntelliJ shell and port App.tsx's surviving responsibilities** — `7e23cfa6` (feat)
2. **Task 2: Remove PWA install, manifest, service-worker and virtual-pwa sources plus config** — `2a3ad9c8` (refactor)
3. **Task 3: Remove workbench shell-switch UI, PWA tests, and add the shell-removal guard test** — `ee7b7b88` (test)

## Files Created/Modified

- `src/main.tsx` — unconditional workbench boot with all CSS/font imports preserved byte-identical
- `src/AppIntelliJ.tsx` — single shell root, four popout routes, all surviving runtime hooks and provider tree
- `src/workbench/__tests__/mainBoot.test.ts` — source-scan proof of unconditional boot
- `src/workbench/__tests__/shellRemoval.test.ts` — source-scan guard for single shell and zero PWA residue
- `src/workbench/TitleBar.tsx` — shell-switch action and flag literals removed
- `src/views/SettingsView.tsx` — PWA status card removed
- `vite.config.ts` — `react()` plugin only, no VitePWA block or PWA alias
- `package.json` / `package-lock.json` — PWA dev dependencies removed, lockfile synced with scripts disabled
- Deleted: `src/App.tsx`, `src/components/shell/{AppShell,Navigation}.tsx`, eleven planned PWA paths, plus orphan PWA components/tests (`UpdateBanner`, `IosInstallModal`, `ActiveFormGuardModal`) and legacy-shell integration tests that imported the deleted `App`
- Trimmed: `tests/views/PlannerView.test.tsx`, `tests/views/SettingsView.test.tsx`, `tests/components/settings/BackupExportCard.test.tsx` — removed assertions tied to deleted surfaces

## Decisions Made

- No migration or compatibility shim for the old shell flag; stale `taskmate_ui_shell` values are inert test data per C-16.
- Runtime hooks previously mounted by `AppShell` were relocated to `AppIntelliJ` rather than dropped, preserving timer alerts, SQLite mirror, GitHub auto-sync and Telegram worker behavior in the only supported shell.
- PWA components with no remaining consumer after source removal were deleted as orphaned code, not left inert.
- Lockfile regenerated with `--ignore-scripts` per T-49-SC; no new packages introduced.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Relocated AppShell runtime hooks before deleting the file**
- **Found during:** Task 1 (grep for `AppShell` consumers)
- **Issue:** `AppShell.tsx` owned OS desktop notifications, timer alert monitoring, SQLite mirror, team-run teardown, GitHub auto-sync and the Telegram headless worker. Plan said delete it if no production consumer remained, but did not mention these hooks; deleting the file without relocation would silently kill those behaviors.
- **Fix:** Mounted all six hooks at the `AppIntelliJ` root alongside ghost notifications and the global tool-task listener.
- **Files modified:** `src/AppIntelliJ.tsx`
- **Verification:** `tsc --noEmit` clean; focused tests pass; all hook names present at workbench root
- **Committed in:** `7e23cfa6`

**2. [Rule 3 - Blocking] Removed legacy shell test imports before deleting `src/App.tsx`**
- **Found during:** Task 1 (grep for `from '../src/App'`)
- **Issue:** Four additional test files beyond the plan's list imported the deleted `App`; leaving them would break typecheck and test collection.
- **Fix:** Deleted `tests/views/Integration.test.tsx` and `tests/views/TimerAlertNavigation.test.tsx`, removed the App-specific block from `tests/views/PlannerView.test.tsx`, removed the AppShell block from `tests/components/settings/BackupExportCard.test.tsx`, and deleted `tests/components/shell/AppShell.test.tsx` after its source was removed.
- **Files modified:** listed files above
- **Verification:** `tsc --noEmit` clean; 4 focused test files / 26 tests pass
- **Committed in:** `7e23cfa6` and `ee7b7b88`

**3. [Rule 3 - Blocking] Removed orphan PWA update/install components and stale test expectation**
- **Found during:** Task 2/Task 3
- **Issue:** After deleting `AppShell.tsx` and `InstallButton.tsx`, `UpdateBanner`, `IosInstallModal` and `ActiveFormGuardModal` had no production consumer; `SettingsView.test.tsx` still expected the removed PWA card title.
- **Fix:** Deleted the three orphan components and their tests, and removed `'Trạng thái PWA & Ngoại tuyến'` from the expected-titles list.
- **Files modified:** `src/components/pwa/*`, `tests/components/pwa/*`, `tests/views/SettingsView.test.tsx`
- **Verification:** grep gate returns zero for all plan-listed PWA tokens in production source; `SettingsView` test passes
- **Committed in:** `2a3ad9c8` and `ee7b7b88`

---

**Total deviations:** 3 auto-fixed (1 missing critical, 2 blocking)
**Impact on plan:** Necessary consequences of deleting the legacy shell; no PWA or shell code was preserved, no scope creep.

## Issues Encountered

- Full `npm install --package-lock-only --ignore-scripts` produced a large lockfile diff (>4000 lines) because npm pruned the transitive workbox/vite-plugin-pwa dependency tree; script execution stayed disabled and no new packages appeared.
- `npx vite build` reports pre-existing chunk-size and ineffective-dynamic-import warnings; build still succeeds.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 49 plan 02 can build unified light/dark tokens and wrappers against exactly one `AntdThemeAdapter` tree and one shell root.
- Guard test is intentionally source-path coupled: future renames of `main.tsx`, `AppIntelliJ.tsx`, `TitleBar.tsx`, `vite.config.ts` or `package.json` must update `shellRemoval.test.ts`.
- Browser/PWA *copy* remains in unrelated informational strings and the browser notification fallback in `desktopNotification.ts`; no install prompt or manifest/service-worker code path remains. Per CLAUDE.md Tauri is the only supported runtime; leftover copy is inert and out of scope for this plan.

## Self-Check: PASSED

- All five named created/modified files exist on disk.
- All three task commits are present in `git log`.

---
*Phase: 49-design-system-foundation*
*Completed: 2026-11-21*
