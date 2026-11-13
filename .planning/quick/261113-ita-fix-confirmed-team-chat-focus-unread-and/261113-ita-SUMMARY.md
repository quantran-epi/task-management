---
status: complete
quick_id: 261113-ita
requirements: [G-37.1-6-notification, G-37.1-6-unread-divider, G-37.1-7]
committed: true
runtime_uat: pending
---

# Confirmed UI fixes

Implemented directly in task-management-intellij with explicit user approval after isolated executor guard stopped before edits.

- Notification suppression requires visible AND focused active team. Focus/blur/visibility/permission events reevaluate pending messages; async work rechecks active team, failed dispatch can retry, cleanup prevents stale dispatch.
- Workspace exposes permission state and explicit enable button using existing OS notification utilities; no lifecycle permission prompts, denied/unavailable guidance stays truthful.
- Opening/refocusing team no longer consumes unread backlog. Cursor waits for focused reading or explicit mark-read; saved cursors load before deriving first unread by sequence.
- Transcript anchors at first unread once, preserves viewport on later arrivals, does not auto-scroll past backlog; pointer/wheel/keyboard reading and explicit mark-read acknowledge it. Non-team lists retain initial follow behavior.
- NO_LEAD renders local group warning/settings action, excluded from provider outage card only. Other retry/draft error flows unchanged.

## Verification

- Focused notification hook, workspace receipts, workspace steering, typing-cost, shared ChatMessageList: 5 files, 41/41 passed.
- Added actual-user-scroll regression afterward; final receipts file 13/13 passed.
- Final `npx tsc --noEmit`: exit 0.
- Final `git diff --check`: exit 0.
- Earlier run had asynchronous lookup failures; receipts tests now allow 5 seconds for DB-backed rendering, retry lookup also 5 seconds. Fixed unread anchor effect that ran before message DOM mounted. No assertion weakened to claim automatic mount as reading.
- No full suite, live providers, runtime app launch or dependency changes. User requested commit/push after completion; final publication follows checks.

## Pending human validation

Rerun Tauri UAT 6 (blurred-window notification, permission action, unread divider/scroll on return) and 7 (leaderless warning). These UAT gaps remain open until runtime confirmation. Excluded unresolved items: cancellation test11, DOM crash, transient leader stall/seen timestamps, historical test3. Tool-round default remains 50.
