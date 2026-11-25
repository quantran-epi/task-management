---
phase: 261126-1kz
plan: 01
subsystem: ui
tags: [react, ant-design, vitest, tdd, standalone-chat, copywriting]

requires:
  - phase: 51
    provides: "standalone Tauri chat surface and UI-SPEC copy contract"
provides:
  - "Gate AIChatDrawer quick prompts and empty-state copy by isStandaloneChat"
  - "Scoped phase51 regression test for standalone neutral copy and legacy copy preservation"
affects: [phase-51, standalone-chat, T17-verification]

tech-stack:
  added: []
  patterns: ["constant-level gating at prop owner", "TDD RED/GREEN with scoped Vitest"]

key-files:
  created: [tests/phase51/standaloneCopy.test.tsx]
  modified: [src/components/ai/AIChatDrawer.tsx]

key-decisions:
  - "Gate copy at AIChatDrawer (owner of quickPrompts/emptyState props); do not add standalone awareness to AiChatWidget"
  - "Standalone quick prompts are exactly 'Giải thích mã' and 'Tra cứu tài liệu'; legacy DRAWER_QUICK_PROMPTS unchanged"

patterns-established:
  - "Standalone copy constants exported at module scope so tests can import them"

requirements-completed: []

duration: 3min
completed: 2026-11-26
---

# Quick 261126-1kz Plan 01: Fix Phase 51 Blocker T17 Standalone Copy Summary

**Standalone AI chat now renders UI-SPEC neutral empty state and two neutral quick prompts while legacy TaskMate copy stays byte-identical**

## Performance

- **Duration:** 3 min
- **Started:** 2026-11-25T18:10:45Z
- **Completed:** 2026-11-25T18:13:30Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- TDD RED test pinned standalone empty-state heading/body, absence of four TaskMate quick prompts and legacy copy, presence of two neutral prompts, and legacy preservation.
- GREEN implementation exported `STANDALONE_QUICK_PROMPTS` and `STANDALONE_EMPTY_STATE` in `AIChatDrawer.tsx` and selected them only when `isStandaloneChat` is true.
- Scoped verification: `npx vitest run tests/phase51 --bail=1` — 7 files / 30 tests passed; `npx tsc --noEmit` exit 0.

## Task Commits

1. **Task 1 (RED): test cho copy trung tính standalone / legacy không đổi** — `17f62fdc` (test)
2. **Task 2 (GREEN): gate quickPrompts và emptyState theo isStandaloneChat** — `ecf24db4` (feat)

## Files Created/Modified

- `tests/phase51/standaloneCopy.test.tsx` — scoped TDD test for standalone/legacy copy branches
- `src/components/ai/AIChatDrawer.tsx` — neutral constants and prop gating at the owner

## Decisions Made

- Copy gating lives in `AIChatDrawer`, not `AiChatWidget`: widget already forwards props; adding standalone awareness there would be a band-aid.
- Legacy branch keeps the original heading template and body string verbatim, including punctuation.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. RED failed at the expected standalone empty-state assertion (`findByText('Chưa có hội thoại')`); legacy case passed. `51-VERIFICATION.md` was left untouched so verifier still reads the original T17 result.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- T17 copy fix is test-backed; verifier can re-run `npx vitest run tests/phase51/standaloneCopy.test.tsx` to confirm.
- No full Vitest suite run (project rule); no new dependencies; no other files touched.

## Self-Check: PASSED

- Files exist: `tests/phase51/standaloneCopy.test.tsx`, `src/components/ai/AIChatDrawer.tsx`, this SUMMARY.
- Commits found: `17f62fdc` (RED), `ecf24db4` (GREEN), plus docs commit for this SUMMARY.
- Verification: RED failed at expected standalone assertion; scoped suite 7 files / 30 tests green; `npx tsc --noEmit` exit 0.
- Scope: only the two source files plus this quick SUMMARY changed; no new dependencies, no full suite, no push.

---
*Quick: 261126-1kz*
*Completed: 2026-11-26*
