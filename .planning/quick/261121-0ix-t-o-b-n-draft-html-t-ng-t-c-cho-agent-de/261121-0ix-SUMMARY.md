# Quick 261121-0ix Summary

**Plan:** 261121-0ix
**Subsystem:** UI draft / Agent Developer Workbench review prototype
**One-liner:** Self-contained interactive HTML mock of the Agent Developer workbench — SSH tree, multi-tab code/diff viewer, hunk accept/reject with live counters, Coding Zone popout with synced chat strip, light/dark palette — using the approved workbench tokens and clearly labelled sample data.

## Files

- Created: `.planning/quick/261121-0ix-t-o-b-n-draft-html-t-ng-t-c-cho-agent-de/agent-developer-workbench-draft.html` (~59 KB, 1130 lines)
- Created: `.planning/quick/261121-0ix-t-o-b-n-draft-html-t-ng-t-c-cho-agent-de/261121-0ix-SUMMARY.md`

No app source, tests or config touched. No git commits by executor (per constraint — orchestrator commits).

## Tasks

1. **Task 1 — HTML shell, palette, SSH tree:** done. Full-screen modal, 3-column grid `260px | 1fr | 300px`, light/dark CSS variables copied from `workbench-tokens.css` (accent `#2f62d8`/`#6a9bff`, surfaces, borders, status badges, diff add/del backgrounds, shadow, 24px rows, 30px tabs with 2px active accent), theme toggle without reload, SSH target card, search, Diff/Tất cả scope, collapsible folders, M/A/D badges and +/− counts.
2. **Task 2 — tabs + diff:** done. Four seeded tabs (pinned `Tổng quan`, two code tabs, one diff tab). Click file opens/activates tab; × closes and switches to neighbor (left on last index, right otherwise); drag reorder keeps pinned first; pinned has no ×. Code viewer has remote path, branch tag, Read-Only tag, Copy/Reveal/Reload toasts, line gutter and target-line highlight. Diff has Unified/Side-by-side, per-hunk header `@@ ... @@`, Accept/Reject toggles, Accept All/Revert All, live `+/-` counters computed only from pending hunks.
3. **Task 3 — chat + popout + notes:** done. Compact chat strip with 5 sample messages, one-participant/one-message model, plan/synthesis badges, composer. Popout is a **Coding Zone** floating div containing SSH tree, tabbar, file/diff content and a small chat strip. It shares `messages`, `activeTabId`, `hunkStates` and `treeScope` state with the modal; tree/tab/file clicks and Accept/Reject from either place mirror to both; sending from either place updates all three transcripts. Active file name mirrors across popout and chat perspective. Notes panel lists all simulated behaviors. Perspective switch between "Coding zone" and "Team chat + agent activity" keeps the same modal and state.

## Verification

- All three plan `automated` checks pass. Size 60,430 bytes < 100 KB. No `https?://`, no `<link`, no `<script src`, no module imports. `git status --short` shows only the quick-task directory as untracked (draft + this summary).
- Browser UAT with Playwright driving system Chrome: 40 assertions passed, zero page/console errors. Covered theme toggle, tree expand/search/scope, open/close/activate tabs, pinned rule, diff mode switch, per-hunk accept/reject and toggle back, Accept All / Revert All counters, chat send from strip and popout with cross-render sync, active-file sync, perspective switch, notes panel and toast.
- Follow-up correction verified with a focused Playwright check: 10 assertions passed for Coding Zone popout — title, tree rows, tabs, diff hunks, chat strip, hunk decision mirrored to main, and chat messages mirrored both ways. Zero page errors.
- Screenshots inspected for light code view, light Coding Zone popout, notes panel, dark diff view and dark chat perspective — layout and palette render as intended.

## Decisions

- Per-hunk counters represent **pending** lines (hunk state null); accepting or rejecting removes that hunk's lines from the live count. Accept All / Revert All therefore both drive counters to `+0/−0`. This is documented in the notes panel and was exercised in UAT.
- Non-diff files stay hidden in the default Diff scope; switching to "Tất cả" is required before opening them. Matches source `AgentDiffReviewer` scope behavior.
- Perspective switch is an extra layout affordance (explicitly allowed by the task constraints) and shares state with the coding zone rather than duplicating it.

## Deviations from Plan

None — plan executed as written. Constraint-driven adjustments: created the required `261121-0ix-SUMMARY.md` (orchestrator asked for it, plan output section said no per-task summary) and made no commits (orchestrator commits the single draft file).

## Known Stubs

None — this is an intentional prototype; every simulated behavior is labelled in the top HTML comment and the "Ghi chú" panel. Sample data is synthetic, with no tokens, passphrases or real machine paths.

## Threat Flags

None. No network endpoints, auth paths, filesystem calls or schema changes; threat-model T-Q-01 labelling and T-Q-SC no-install disposition honored.
