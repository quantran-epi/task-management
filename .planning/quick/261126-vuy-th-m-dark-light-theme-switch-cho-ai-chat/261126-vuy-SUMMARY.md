---
status: complete
phase: quick
plan: 261126-vuy
subsystem: ui
tags: [ai-chat, standalone, theme, antd, e2e, chrome, tokens]

requires:
  - phase: 51
    provides: "Standalone AI chat shell, AntdThemeAdapter, shared useThemeMode/themeBroadcast"
provides:
  - "Real light/dark toggle in standalone ChatHeader using shared useThemeMode"
  - "Component tests for icon/tooltip/persistence/geometry"
  - "Chrome E2E on real header control, token parity and 360px no-overlap screenshots"
affects: [phase-51, ai-chat-standalone, theme]

tech-stack:
  added: []
  patterns:
    - "Toggle delegates to shared useThemeMode().toggle; no second theme state or IPC subscription"

key-files:
  created:
    - tests/phase51/standaloneThemeToggle.test.tsx
  modified:
    - src/components/ai/ChatHeader.tsx
    - e2e/aiChatStandalone.tsx
    - e2e/aiChatSettings.spec.ts

key-decisions:
  - "Toggle is standalone-only; normal header unchanged to avoid duplicating TitleBar control"
  - "Moon icon + tooltip 'Giao diện: Tối' in light; Sun + 'Giao diện: Sáng' in dark, matching TitleBar"
  - "E2E harness no longer injects a theme button; spec clicks data-testid chat-theme-toggle"

patterns-established:
  - "Standalone header overflow: left group flex/minWidth 0, chip/status ellipsis, control group flexShrink 0"

requirements-completed:
  - AI-CHAT-STANDALONE-THEME-TOGGLE
  - SHARED-THEME-STATE
  - TOKEN-PARITY
  - E2E-REAL-CONTROL
  - NARROW-WIDTH-NO-OVERLAP
  - ZERO-REGRESSION

duration: ~22min
completed: 2026-11-26
---

# Quick 261126-vuy: Standalone AI chat theme switch Summary

**Standalone AI chat header now has a real shared-state light/dark toggle; Chrome E2E proves token parity and 360px geometry with zero console errors.**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-11-26T16:11:00Z
- **Completed:** 2026-11-26T16:33:17Z
- **Tasks:** 3/3
- **Files modified:** 4

## Accomplishments

- Standalone header has `chat-theme-toggle` using `useThemeMode().toggle`, Moon/Sun icons and TitleBar-equivalent tooltips and 28x28 geometry.
- Unit/component test covers icon direction, tooltip, click persistence, surrounding header controls and absence in the normal header.
- Harness fake theme button removed; spec asserts exactly one theme control and clicks the real header button.
- New 360px Chrome test measures header 34px, toggle 28x28, chip/control non-overlap in both themes, with light/dark screenshots.
- Final gates: 39 scoped vitest tests pass, `npx tsc --noEmit` clean, 9 Playwright Chrome tests pass.

## Task Commits

1. **Task 1: Theme toggle thật trong standalone ChatHeader + test hành vi** - `8c4b1660` (feat; TDD RED gate confirmed before implementation)
2. **Task 2: E2E bỏ nút giả, dùng control thật + kiểm tra token và 360px** - `22af7e23` (test)
3. **Task 3: Final gates + visual/diff review** - `817ff15b` (test); independent review/verification and direct Chrome DevTools interaction completed afterwards

## Files Created/Modified

- `src/components/ai/ChatHeader.tsx` - standalone header toggle, data-testid, ellipsis on chip/status
- `tests/phase51/standaloneThemeToggle.test.tsx` - TDD component coverage for toggle behavior
- `e2e/aiChatStandalone.tsx` - removes synthetic toggle button and theme broadcast import
- `e2e/aiChatSettings.spec.ts` - real control clicks, 360px theme test, fixture/keychain race stabilization

## Decisions Made

- No new dependency, theme state, broadcast path or hardcoded color; reuse `useThemeMode` / AntD tokens.
- Non-standalone header left untouched so TitleBar remains sole theme switch in workbench.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Q7J chat-history fixture collided with harness-seeded global thread**
- **Found during:** Task 2 (full E2E gate)
- **Issue:** The merged rfx harness seeds a default global `chatThreads` row before the test inserts its own unique `scopeKey: 'global'` fixture; the transaction failed with `page.evaluate: null`.
- **Fix:** Clear `chatThreads`, `chatTabs`, `chatMessages` before seeding the fixture inside the same transaction.
- **Files modified:** `e2e/aiChatSettings.spec.ts`
- **Verification:** `npm run test:e2e -- e2e/aiChatSettings.spec.ts --grep "chat history tools"` passed.
- **Committed in:** `22af7e23`

**2. [Rule 1 - Bug] Image-generation E2E timed out on API-key input**
- **Found during:** Task 2 (full E2E gate, reproduced 3 times); confirm flaky again during independent verification (8/9)
- **Issue:** Keychain read is async; `keyInput.count()` saw the password input before it was replaced by the "API Key đã được cấu hình" view, then `fill` hung on a detached node. Initial poll condition (`count > 0 || badge > 0`) was true on first render and did not wait for `loadData()`.
- **Fix:** Poll until the endpoint input has the value committed by `loadData()`, then assert the configured badge (fixture always seeds a key) instead of filling a node React is about to unmount. Also seed `taskmate_theme='light'` before the 360px screenshot test so artifact names always match the actual theme.
- **Files modified:** `e2e/aiChatSettings.spec.ts`
- **Verification:** Full spec re-run passed 9/9 in Chrome after fix; `npx tsc --noEmit` and `git diff --check` clean.
- **Committed in:** `22af7e23` (initial attempt), `817ff15b` (correct root-cause fix)

**3. [Rule 3 - Blocking] Scoped vitest gate denied symlinked pdf worker**
- **Found during:** Task 3 (final gate)
- **Issue:** In this worktree `node_modules` is symlinked from the main checkout; two scoped suites hit Vite `Denied ID .../pdf.worker.min.mjs?url`.
- **Fix:** Ran final scoped gate with a temporary untracked config adding Vite `server.fs.allow` for worktree and main `node_modules`, then removed it. No tracked config changed.
- **Files modified:** none (temporary `vitest.vuy.config.ts` created and deleted)
- **Verification:** 6 files / 39 tests passed with temp config.
- **Committed in:** n/a

## Verification Evidence

- TDD RED: `npx vitest run tests/phase51/standaloneThemeToggle.test.tsx --bail=1` failed on missing `chat-theme-toggle` before implementation.
- Task 1 gate: `npx vitest run tests/phase51/standaloneThemeToggle.test.tsx tests/phase51/standaloneConnectionStatus.test.tsx --bail=1` — 2 files / 9 tests passed; `npx tsc --noEmit` exit 0.
- Fake-button grep: `grep -v '^#' e2e/aiChatStandalone.tsx | grep -c 'broadcastThemeMode\|Chuyển đổi giao diện' | grep '^0$'` — output `0`.
- Final scoped vitest (with temporary worktree fs-allow config): 6 files / 39 tests passed.
- `npx tsc --noEmit` — exit 0, no output.
- `npm run test:e2e -- e2e/aiChatSettings.spec.ts` — 9 passed, 0 failed, Chrome channel `chrome`.
- Screenshots reviewed: `test-results/ai-chat-theme-light-360.png`, `test-results/ai-chat-theme-dark-360.png` — header compact, chip ellipsis, toggle Moon/Sun direction correct, no control overlap, accent/background changed while radius/font stayed stable.
- `git diff --name-only f039577b..HEAD` — exactly the four planned files; theme hook, broadcast, adapter, drawer, DB, PWA untouched.

## Known Stubs

None.

## Threat Flags

None. Toggle only calls validated shared hook; no new endpoint, secret path or schema boundary.

## Issues Encountered

- Three in-scope test-infrastructure bugs fixed as documented above. No remaining failures.

## User Setup Required

None. For manual confirmation, open `/task-management/e2e/aiChatStandalone.html?rfx=ui` in Chrome DevTools at 360px and click the header toggle.

## Next Phase Readiness

Ready. Standalone theme parity is covered by unit and Chrome E2E; no follow-up required.

## Self-Check: PASSED

All four planned files, summary, both screenshots and both task commits verified present.
