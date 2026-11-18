---
status: complete
runtime_uat: pending
---

# Chat reading position and compact assignment plan

User clarified opening position = last read message, not unconditional newest message. User authorized push after checks.

- Team derives saved last-read message from monotonically increasing durable cursor. Waits for log/cursor loads, restores position once per chat scope, opens at bottom when all read, at start when never read.
- Native IntersectionObserver rooted in transcript reports last visible message only while window focused/document visible. Cursor advances to observed message, not head of whole log. Removed mandatory mark-read button and bottom-only receipt logic. Observer ignores offscreen rows and cleans up on changes/unmount. Unit environment without observer does not crash or fabricate reads.
- Unread divider remains; read updates do not repeatedly reposition viewport. Scope key resets initial position when changing chats.
- Assignment plan has accessible collapse/expand button, summary job count, 240px detail ceiling, automatic collapse after decision and reopening for new pending plan. Approve/reject remain available collapsed.
- Included 5-line confirmed leader hidden-budget wait fix: expose paused before waiting on closed gate. User confirmed live cause by topping up above 80%, immediately resuming. No automatic budget bypass.

## Checks

Final focused UI run: 5 files, 39/39 tests passed. Final npx tsc --noEmit and git diff --check passed. Earlier run also 39/39 passed before final follow-position adjustment.

Prior leader budget red/green: baseline 2 failures at 600/750 and 601/750, below threshold passes; patched coordinator 7 tests passed, 129 skipped. No live providers/full suite/PWA changes. Native notification issue explicitly deferred, no notification patch included.

## Runtime follow-up

Confirm Tauri open at last-read anchor, partial-scroll receipts, hidden-window exclusion, compact plan toggling, and honest budget pause/top-up banner. Phase37.1 not marked complete; unresolved cancellation/DOM crash and deferred notification remain recorded separately.
