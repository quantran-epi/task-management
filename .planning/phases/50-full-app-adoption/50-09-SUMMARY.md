---
phase: 50-full-app-adoption
plan: 09
subsystem: ui
tags: [antd, react, eslint, vitest, playwright, chrome-uat, light-dark, nyquist, adoption]

requires:
  - phase: 50-full-app-adoption
    provides: "50-08 wave summaries, 8 wave manifests, ThemeAppHolder, context hooks, scaffolded e2e/adoption.spec.ts"
provides:
  - "npm run lint = eslint src app-wide; lint:adoption removed with guardConfig test and IN-01 comment updated"
  - "Static API guard scans whole src outside ui/ with loading/open/destroy/warn receivers; 0 unbound calls"
  - "Inline token sweep asserts all 8 wave manifests independently"
  - "Six-flow Playwright UAT spec U1..U6 with focus/keyboard/aria and light/dark token parity; 6/6 pass Chrome 157"
  - "50-UAT.md 12-row evidence matrix plus 50-VALIDATION.md approved sign-off (nyquist_compliant true)"
affects: [50-verify-work, milestone v1.5 close, .planning/STATE.md, .planning/ROADMAP.md]

tech-stack:
  added: []
  patterns:
    - "Semantic hook-binding guard is the static-API source of truth; raw message.*( grep count is not a violation signal"
    - "Theme parity asserted on --accent (changes) and --font-size-ui/--radius-control (stable), never on pixel snapshots"

key-files:
  created:
    - .planning/phases/50-full-app-adoption/50-UAT.md
  modified:
    - package.json
    - eslint.config.mjs
    - src/components/ui/__tests__/guardConfig.test.ts
    - src/components/ui/__tests__/staticApiGuard.test.ts
    - src/components/ui/__tests__/inlineStyleSweep.test.ts
    - e2e/adoption.spec.ts
    - .planning/phases/50-full-app-adoption/50-VALIDATION.md

key-decisions:
  - "Kept legitimate hook-bound message.*/notification.* calls: semantic guard detects unbound receivers, so no notification behavior was deleted to satisfy a raw grep"
  - "U1 drives task-search-input for keyboard assertions because quick-add is disabled without a CR; quick-add aria-label still asserted"
  - "U4 closes the modal before toggling theme because the overlay blocks the TitleBar control; reopens to check the form under the new palette"

patterns-established:
  - "Every UAT flow asserts accessible name + focus() + keyboard action + light/dark token parity in one test"
  - "UAT defects that are correct app behavior (disabled input, modal overlay) are recorded, not 'fixed' in app code"

requirements-completed: [ADOPT-03, ADOPT-04]

metrics:
  duration: 14min
  completed: 2026-11-21
  started: 2026-11-21T14:36:07Z
  tasks: 2
  files: 8
  commits:
    - e7d7f5e2
    - 0e588c95
---

# Phase 50 Plan 09: Full App Adoption — Final Gate and UAT Sign-Off Summary

**App-wide `eslint src`, semantic static-API guard over whole src, and six-flow Chrome UAT with a signed 12-row light/dark evidence matrix**

## Performance

- **Duration:** 14 min
- **Started:** 2026-11-21T14:36:07Z
- **Completed:** 2026-11-21T14:56:49Z
- **Tasks:** 2/2
- **Files modified:** 8

## Accomplishments
- `npm run lint` promoted to `eslint src` with `lint:adoption` removed; `guardConfig.test.ts` and the IN-01 comment reflect the resolved state.
- Static API guard now scans all 596 `src` files outside `ui/` and reports 0 unbound `message`/`notification`/`Modal.confirm` calls; inline sweep asserts each of the 8 wave manifests separately.
- Six Playwright flows (U1..U6) run against the live Vite app in Chrome 157, asserting focus, keyboard activation, accessible names, and `--accent`/`--font-size-ui`/`--radius-control` parity across light/dark — 6/6 pass in 29.8s.
- `50-UAT.md` records the 12-row matrix, parity checks, 3 defects with verification, and gate exit codes; `50-VALIDATION.md` is approved with `nyquist_compliant: true` and per-task observed results for 50-01..50-09.
- All gates green: `tsc` 0, `lint` 0 (6 pre-existing unused-disable warnings), `test:foundation` 14 files/83 tests, `build` 0, Playwright 6/6.

## Task Commits

1. **Task 1: Nâng lint = eslint src, sửa guardConfig, chạy mọi cổng tĩnh (D-11/ADOPT-04)** - `e7d7f5e2` (feat)
2. **Task 2: Hoàn thiện e2e 6 luồng + ghi 50-UAT.md + ký VALIDATION (D-12/D-13)** - `0e588c95` (feat)

**Plan metadata:** pending — orchestrator owns the final metadata commit after the wave.

## Files Created/Modified
- `package.json` — lint script promoted to `eslint src`, `lint:adoption` deleted
- `eslint.config.mjs` — IN-01 comment states resolved app-wide guard coverage
- `src/components/ui/__tests__/guardConfig.test.ts` — asserts `lint === 'eslint src'`, no `lint:adoption`
- `src/components/ui/__tests__/staticApiGuard.test.ts` — whole-src scan outside `ui/`; `loading/open/destroy/warn` receivers blocked
- `src/components/ui/__tests__/inlineStyleSweep.test.ts` — per-manifest assertion over all 8 wave manifests
- `e2e/adoption.spec.ts` — six U1..U6 flows with focus/keyboard/aria and light/dark parity
- `.planning/phases/50-full-app-adoption/50-UAT.md` — evidence matrix, parity, defects, gates, human-check status
- `.planning/phases/50-full-app-adoption/50-VALIDATION.md` — approved sign-off with nyquist true

## Decisions Made
- Raw grep cannot be the static-API source of truth: 490 `message.*(` matches are legitimate `useMessage()` instances, and the single remaining `message.loading` in `DocumentSetDetail.tsx:443` is hook-bound with `duration: 0`. The semantic guard that distinguishes bound from unbound receivers stays authoritative.
- UAT parity checks measure CSS custom properties on `document.documentElement`, not pixel snapshots, so font/size/radius stability is provable without a visual-regression dependency.
- Human verification stays pending at end-of-phase per `human_verify_mode: end-of-phase`; automated evidence is recorded without claiming sếp observed the flows.

## Deviations from Plan

### Adjustments to plan instructions

**1. [D-11 acceptance: raw static-API grep] Raw grep target of 0 is unachievable without deleting valid notifications**
- **Found during:** Task 1 verification
- **Issue:** The plan's `<automated>` check requires raw `grep -rnE 'message\\.(success|...)'` outside `ui/` to equal 0, but 490 calls are context-bound instances from `useMessage()`/`useNotification()` — required by D-05, not static API. One legitimate `message.loading` remains in `DocumentSetDetail.tsx`.
- **Fix:** Kept the semantic `staticApiGuard.test.ts` (0 unbound calls) as the source of truth per D-07 and recorded the raw-grep nuance in `50-VALIDATION.md`. Did not delete working notification code to satisfy a literal grep.
- **Files modified:** `src/components/ui/__tests__/staticApiGuard.test.ts`, `.planning/phases/50-full-app-adoption/50-VALIDATION.md`
- **Verification:** `guardedPaths()` 596 files, `violations()` 0; `npm run test:foundation` green.
- **Committed in:** `e7d7f5e2`, `0e588c95`

**2. [D-12 UAT selectors] Skeleton selectors and raw grep assumptions did not match the live DOM**
- **Found during:** Task 2 (`npx playwright test e2e/adoption.spec.ts` initial run: 6 failures)
- **Issue:** `.taskmate-workbench-theme` resolved to 3 elements (strict-mode violation); quick-add input is disabled without a CR; modal overlay blocks the TitleBar theme toggle.
- **Fix:** Used `.first()` on the root, drove `task-search-input` for keyboard checks while still asserting quick-add's aria-label, and closed the modal before toggling theme then reopened it to verify the form under the new palette. No app code changed.
- **Files modified:** `e2e/adoption.spec.ts`
- **Verification:** 6/6 Playwright tests pass in Chrome 157 (29.8s).
- **Committed in:** `0e588c95`

**Total deviations:** 2 plan-instruction adjustments. No Rule 1-4 auto-fixes, no package installs, no scope creep.

## Issues Encountered
- Six `Unused eslint-disable directive` warnings (0 errors) remain in pre-existing files; recorded as D-UAT-03, not fixed per plan (`--max-warnings 0` deliberately not used).
- Build emits Vite inefficiency/chunk-size advisories (exit 0); out of scope for this UI-adoption close-out.

## User Setup Required
None. Chrome 157 was available locally; Playwright webServer starts Vite automatically. Sếp still needs to perform the end-of-phase manual Chrome walkthrough recorded in `50-UAT.md` §Human check before milestone close — this is a verification step, not configuration.

## Next Phase Readiness
All automated gates for milestone v1.5 are green and ADOPT-03/04 evidence is recorded. Only the end-of-phase human Chrome observation remains (end-of-phase mode, not a plan checkpoint). STATE.md and ROADMAP.md were intentionally not touched by this executor; the orchestrator owns those writes after the wave completes.

## Self-Check: PASSED

- `50-UAT.md` created with 12 matrix rows (`grep -c '^| U[1-6] '` = 12) and `nyquist_compliant: true` in `50-VALIDATION.md`.
- Both task commits present in git history: `e7d7f5e2`, `0e588c95`.
- Files exist: package.json, eslint.config.mjs, all three guard tests, `e2e/adoption.spec.ts`, `50-UAT.md`, `50-VALIDATION.md`.
- Final gates re-run: tsc 0, lint 0, foundation 14/83, build 0, Playwright 6/6.

---
*Phase: 50-full-app-adoption*
*Completed: 2026-11-21*
