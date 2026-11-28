---
phase: quick
plan: 261128-eb6
status: complete
type: execute
requirement_completed: COMMAND-DECK-CR-TASK-DETAIL
files_modified:
  - src/views/ChangeRequestDetailView.tsx
  - src/views/ItemInsightView.tsx
  - tests/views/ChangeRequestDetailView.test.tsx
  - tests/views/ItemInsightView.test.tsx
---

# Quick 261128-eb6 — Command Deck CR detail & task insight

## Changes

- CR detail: mission header with single status signal chip, progress rail derived from already-loaded tasks, metadata row preserved, two-column grid `minmax(0, 2.4fr) minmax(280px, 1fr)` with task table left and reminders/links/notes/Jira cards right. Task name cells ellipsis with full `title` and CR/subsystem subtitle.
- Task insight: task-specific mission header with status chip beside title, action toolbar at right, metrics rail (estimate/spent/remaining/deadline/checklist), checklist converted to AntD `Table`, diagram moved to left column, right column has surface background and border with reminders/links/notes cards.
- Fixed dark-mode contrast for both the metrics rail and right column: replaced undefined `--bg-island-soft` fallback with theme-aware `var(--surface)`.
- Tests: replaced CR detail stacked-column assertion with grid assertion; added task insight grid assertion covering checklist left and secondary cards right.

## Verification

- `npx tsc --noEmit -p tsconfig.json` — clean at time of check.
- `npx vitest run tests/views/ItemInsightView.test.tsx --bail=1` — 10/10 passed after dark-mode fix.
- `npx vitest run tests/views/ChangeRequestDetailView.test.tsx --bail=1` — baseline has 7 pre-existing failures unrelated to layout (test selectors for `Spec` button role, search wrapper input, `seedLinkView()` link URL testid). Confirmed identical failures on stashed HEAD baseline before this quick; layout assertion itself passes.
- Chrome UAT: task insight opened with sample task; header actions top-right, status beside title, checklist/diagram left, cards right; light and dark modes verified. Dark mode initially showed a light rail because `--bg-island-soft` is undefined; after switching to `var(--surface)`, rail background is `rgb(23,29,39)` in dark and `rgb(248,250,252)` in light with readable text.

## Coordination

- Code was committed by the Phase 52 workstream as `eef54006 feat(261128-eb6): apply approved Command Deck layout to CR detail and task insight`. `git diff eef54006 -- <4 quick files>` was empty after commit.
- Dark-mode `var(--surface)` fix landed after that commit in `src/views/ItemInsightView.tsx`; Phase 52 owns `ChangeRequestDetailView.tsx` afterwards and quick task made no further edits there.
- `.planning/STATE.md` is intentionally not edited by this quick: Phase 52 orchestrator owns it and will add the completed quick row plus Last activity.
