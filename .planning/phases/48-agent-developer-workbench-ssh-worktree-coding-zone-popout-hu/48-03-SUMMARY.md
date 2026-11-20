---
phase: 48-agent-developer-workbench-ssh-worktree-coding-zone-popout-hu
plan: 03
subsystem: ui
tags: [coding-zone, tauri, webview-window, broadcastchannel, echo-safety, ghost-dev, vietnamese]

requires:
  - phase: 48-01
    provides: "confined SSH worktree descriptor and applyHunk/revertHunk verbs"
  - phase: 48-02
    provides: "Coding Zone modal, tree, viewer tabs, diff panel and session-gated trigger"

provides:
  - "Real Tauri coding-zone-popout WebviewWindow with targeted emitTo handoff and safe browser fallback"
  - "Versioned, echo-safe cross-window state bus over BroadcastChannel plus Tauri emitTo"
  - "One CodingZoneModal state machine shared by the main modal and popout route"
  - "Live ghost-dev activity timeline and truthful connection-state derivation with exact Vietnamese copy"

affects: [48-04]

tech-stack:
  added: []
  patterns:
    - "Dedupe by exact WebviewWindow label; handoff state never travels in URL/hash"
    - "Every sync event carries originWindowId + monotonic revision; self/stale/malformed ignored"
    - "Test seams for dynamic Tauri imports (emit/listen overrides) in jsdom"

key-files:
  created:
    - src/utils/codingZonePopout.ts
    - src/hooks/useCodingZoneSync.ts
    - src/hooks/__tests__/useCodingZoneSync.test.ts
    - src/views/CodingZonePopoutView.tsx
    - src/components/agents/CodingZoneLiveState.ts
  modified:
    - src/components/agents/CodingZoneModal.tsx
    - src/components/agents/office/CodingZoneTrigger.tsx
    - src/components/agents/__tests__/CodingZoneModal.test.tsx
    - src/styles/coding-zone.css
    - src/types/navigation.ts
    - src/types/codingZone.ts
    - src/hooks/useHashRoute.ts
    - src/App.tsx

key-decisions:
  - "Popout is a dedicated Tauri WebviewWindow at #/coding-zone-popout; browser fallback uses same-origin BroadcastChannel only"
  - "No worktree path, token or passphrase appears in the popout hash; initial full state travels via emitTo/postMessage"
  - "One CodingZoneModal component renders in both windows; the popout is not a second viewer"
  - "Connection chip says 'Đồng bộ' only when session, SSH probe, worktree validity and popout presence all pass"
  - "Activity timeline is fed only by ghost-dev stream/session events and bounded to 50 items"

patterns-established:
  - "Dynamic Tauri import seams: setCodingZoneEmitterForTest / setCodingZoneListenerForTest / setActivityListenerForTest"
  - "Per-window BroadcastChannel instance keyed by windowId; receiver never self-delivers"

requirements-completed: [D-06, D-13, D-15, D-17, D-18]

duration: 29min
completed: 2026-11-20
---

# Phase 48 Plan 03: Coding Zone Popout and Cross-Window Sync Summary

**Real Tauri Coding Zone popout with revisioned echo-safe state sync, live ghost-dev activity, and connection states that never fake "Đồng bộ"**

## Performance

- **Duration:** 29 min
- **Started:** 2026-11-20T19:14:41Z
- **Completed:** 2026-11-20T19:44:32Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments
- `openCodingZonePopout` dedupes by label `coding-zone-popout`, focuses an existing window with `emitTo` handoff, or creates a real 1200x800 Tauri `WebviewWindow` at `#/coding-zone-popout`; browser fallback uses a same-origin popup and no state in the hash.
- `useCodingZoneSync` publishes typed `{originWindowId, revision, kind, payload}` events over BroadcastChannel and Tauri `emitTo`, ignoring self-origin, stale, and malformed events at receipt.
- `CodingZonePopoutView` renders the same `CodingZoneModal` at the draft's 210px|1fr|230px grid, with header `Coding Zone — Popout`, seeded by a validated full-state handoff.
- One modal state machine now owns tabs, active file, hunk decisions, tree query/scope, chat and connection for both windows; hunk/chat/file actions publish newer revisions and apply received ones.
- `useCodingZoneActivity` listens to `ghost-dev:stream-chunk`, `session-updated`, and `session-finished`, keeps a bounded 50-item timeline, and renders payload text as data only.
- `deriveConnectionState` enforces priority session-ended > invalid-worktree > disconnected > connecting > connected; exact Vietnamese error copy and chip labels are pinned by tests.
- SSH probe runs on modal open in `CodingZoneTrigger`; the main window does not claim `connected` from a config object alone.

## Task Commits
1. **Task 1: Build popout window util, route, and versioned cross-window sync** — `51a06771` (feat)
2. **Task 2: Wire popout button, live agent activity, and truthful connection states** — `aeb6e6d3` (feat)

## Files Created/Modified
- `src/utils/codingZonePopout.ts` — dedicated window lifecycle, handoff and browser fallback
- `src/hooks/useCodingZoneSync.ts` — versioned echo-safe cross-window bus with test seams
- `src/hooks/__tests__/useCodingZoneSync.test.ts` — self/stale/malformed, handoff, revision, cleanup (5 tests)
- `src/views/CodingZonePopoutView.tsx` — popout route rendering the shared modal
- `src/components/agents/CodingZoneLiveState.ts` — connection derivation + live ghost-dev timeline
- `src/components/agents/CodingZoneModal.tsx` — shared state, sync publish/apply, activity pane, truthful footer
- `src/components/agents/office/CodingZoneTrigger.tsx` — SSH probe, popout open, derived connection
- `src/components/agents/__tests__/CodingZoneModal.test.tsx` — 7 new assertions for popout/sync/activity/state
- `src/styles/coding-zone.css` — activity timeline styles
- `src/types/navigation.ts`, `src/hooks/useHashRoute.ts`, `src/App.tsx` — `coding-zone-popout` route
- `src/types/codingZone.ts` — shared state types

## Decisions Made
- Popout passes the full shared snapshot through the handoff event rather than encoding state in the hash (T-48-11).
- Dynamic Tauri imports need explicit listener/emitter seams for jsdom; production path remains the real `@tauri-apps/api/event` dynamic import.
- SSH probe is per-modal-open and only overrides an incoming `connected` value; explicit `disconnected`/`invalid-worktree`/`session-ended` values from the host are preserved.
- Popout close is reflected as `session-ended` chip state in the popout itself; the main modal keeps working (D-18).

## Deviations from Plan
### Auto-fixed Issues
**1. [Rule 2 - Missing critical] SSH probe source for truthful connection**
- **Found during:** Task 2
- **Issue:** Plan 02 passed `connected` from SSH config presence alone; D-18 requires an actual probe.
- **Fix:** `CodingZoneTrigger` runs `testSshConnection` on modal open and derives state via `deriveConnectionState` with worktree validity and session activity; failed probe yields exact `Mất kết nối` copy.
- **Files modified:** `src/components/agents/office/CodingZoneTrigger.tsx`
- **Commit:** `aeb6e6d3`

**2. [Rule 3 - Blocking] Dynamic Tauri imports bypass jsdom mocks**
- **Found during:** Task 1/2 tests
- **Issue:** `vi.mock('@tauri-apps/api/event')` did not intercept `await import(...)` inside hooks, so `emitTo` hit real Tauri internals and failed.
- **Fix:** Added focused test seams in the sync hook and live-state hook; no production behavior changed.
- **Files modified:** `src/hooks/useCodingZoneSync.ts`, `src/components/agents/CodingZoneLiveState.ts`, both scoped test files
- **Commit:** `51a06771`, `aeb6e6d3`

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 blocking test seam).
**Impact:** Both necessary for D-18 truthfulness and green scoped tests; no scope creep.

## Issues Encountered
- No new npm packages; all work reuses existing `@tauri-apps/api`, React, Ant Design and Vitest.
- Full Vitest suite was not run (project rule D-20); only scoped paths with `--bail=1`.

## User Setup Required
None - no external service configuration required for this plan.

## Next Phase Readiness
- Plan 04 can run the focused gate, Chrome Playwright UAT for cross-window sync, and review closeout.
- SSH remote target availability remains a runtime preflight concern; the UI now shows explicit disconnected state instead of a fake chip.

## Verification
- `npx vitest run src/hooks/__tests__/useCodingZoneSync.test.ts src/components/agents/__tests__/CodingZoneModal.test.tsx --bail=1` — 17/17 passed.
- `npx vitest run src/components/agents/__tests__/CodingZoneDiffPanel.test.tsx --bail=1` — 3/3 passed (plan 02 regression).
- `npx tsc --noEmit` — clean.
- `grep -rn 'DỮ LIỆU MẪU\|mô phỏng' src/components/agents/CodingZone*` — no matches.
- Route check: `coding-zone-popout` present in navigation types, hash whitelist and App.tsx.

## Known Stubs
None. Popout view renders the same full modal; activity starts empty by design until real ghost-dev events arrive.

## Threat Flags
None. Cross-window payloads are validated at receipt; URL/hash carries no secrets or paths; ghost-dev payload text is rendered as escaped data and bounded.

## Self-Check: PASSED
- Created files verified: `codingZonePopout.ts`, `useCodingZoneSync.ts`, sync test, `CodingZonePopoutView.tsx`, `CodingZoneLiveState.ts`.
- Task commits `51a06771` and `aeb6e6d3` verified in git log.
- No file deletions in either task commit.

---
*Phase: 48-agent-developer-workbench-ssh-worktree-coding-zone-popout-hu*
*Completed: 2026-11-21*
