---
status: resolved
trigger: "when i have a task with allocation for example 5 minutes for today, when i start timer for that task at today, if timer exceed allocated amount, browser notification pushed, it works, but if i start timer and go to other page, ddont stay on task pages, notification dont fire. And another issue is notification in-app also fire thats ok but 2 duplicate in-app notification fire, fix these"
created: 2026-09-29T00:00:00.000Z
updated: 2026-09-29T00:00:00.000Z
symptoms:
  expected: "1) Browser notification fires when timer exceeds allocated duration even if user navigates away from tasks page to another page in app. 2) In-app notification fires exactly once, not duplicate."
  actual: "1) Browser notification only fires if staying on task page; navigating to another page prevents notification from firing. 2) In-app notification fires twice (duplicate)."
  errors: "None reported"
  timeline: "Current implementation after recent timer alert changes"
  reproduction: "Create task with 5 min allocation today. Start timer. Navigate to another page (not task page). Wait for timer to exceed 5 min -> no browser notification. Also observe 2 duplicate in-app notifications firing."
---

## Evidence
- timestamp: 2026-09-29T16:30:00.000Z
  observation: "TaskTable.tsx contained its own useEffect evaluating evaluateLiveTaskDailyAllocationAlert and calling message.warning, while AppShell simultaneously ran useTimerAlertMonitor() calling message.warning and window.Notification."
- timestamp: 2026-09-29T16:36:00.000Z
  observation: "When staying on TaskTable, both effects fired simultaneously, generating 2 duplicate message.warning toast alerts."
- timestamp: 2026-09-29T16:40:00.000Z
  observation: "When navigating away from TasksView, TaskTable unmounted. Because useTimerAlertMonitor is mounted globally in AppShell, monitoring active timers at the AppShell level ensures background tracking and notification firing across all routes."
- timestamp: 2026-09-29T16:43:00.000Z
  observation: "Removed duplicate alert effect from TaskTable. Verified via TimerAlertNavigation.test.tsx that exactly 1 in-app alert fires when on tasks page, and exactly 1 in-app alert + 1 desktop notification fires when navigating away."

## Root Cause
Timer threshold alert was duplicated across both TaskTable component level and global AppShell level. Page unmount killed TaskTable's listener, and when mounted, both listeners fired causing duplicate in-app notifications.

## Resolution
1. Removed duplicate running timer alert effect and redundant todayAllocationMap from TaskTable.tsx.
2. Centralized running timer monitoring in `useTimerAlertMonitor` mounted globally in `AppShellInner`.
3. Added `evaluateLiveTaskDailyAllocationAlert` in `timerAlerts.ts` evaluating today's planned allocations with fallback to task estimate.
4. Added multi-route verification tests in `TimerAlertNavigation.test.tsx` ensuring exactly one toast alert and one desktop notification fire across navigation.
root_cause: "Timer alert logic was duplicated across TaskTable and AppShell; removing TaskTable listener eliminated duplicate notifications while AppShell monitor ensures alerts fire across all views."
fix: "Centralized live timer threshold and allocation monitoring into global useTimerAlertMonitor in AppShell and removed duplicate effect from TaskTable."
