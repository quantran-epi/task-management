---
status: diagnosed
trigger: "OS desktop notification banner does not appear on Chrome macOS when clicking test button or triggering reminder; only in-app notification fires"
created: 2026-09-29T00:00:00Z
updated: 2026-09-29T23:36:00Z
---

## Current Focus

hypothesis: OS desktop notifications are dispatched and delivered through Chrome, PWA app_mode_loader, and usernoted, but are suppressed from displaying as banners on macOS because macOS Focus / Do Not Disturb "Sleep" mode is actively enabled (22:15 to 07:05).
test: check macOS unified logs for usernoted, donotdisturbd, and NotificationCenter.
expecting: find exact suppression reason in system event resolver.
next_action: report confirmed root cause.

## Symptoms

expected: OS desktop notification banner appears immediately and stays docked on desktop until explicitly clicked or dismissed by user when desktop notifications and persist are enabled
actual: its just fire in-app notification, failed, no browser push notification, on chrome macos
errors: None reported
reproduction: Test 1 in UAT: Navigate to Settings -> Thông báo, enable "Bật thông báo màn hình" and "Giữ thông báo trên màn hình". Click "Gửi thông báo thử nghiệm" button. Only in-app notification appears, no browser/desktop notification banner.
started: Discovered during Phase 12.2 UAT on Chrome macOS

## Eliminated

- hypothesis: Browser permission is denied or missing
  evidence: Chrome Preferences has http://localhost:4173 notifications setting: 1 (granted). Notification.permission === 'granted'.
  timestamp: 2026-09-29T23:20:00Z

- hypothesis: Service Worker registration or window.Notification JavaScript error in app code
  evidence: Vitest tests pass for sendDesktopNotification and useDesktopNotification. App successfully dispatches request to macOS usernoted via Chrome.
  timestamp: 2026-09-29T23:22:00Z

- hypothesis: PWA bundle or Service Worker dropped notifications
  evidence: macOS unified system logs show Chrome PWA app_mode_loader and usernoted receiving each request and successfully delivering to NotificationCenter.
  timestamp: 2026-09-29T23:28:00Z

## Evidence

- timestamp: 2026-09-29T23:20:00Z
  checked: Chrome profile preferences (/Users/tranducquan/Library/Application Support/Google/Chrome/Default/Preferences)
  found: `http://localhost:4173,*` has `notifications.setting = 1` (granted). `notification_interactions` records 45 notification displays today.
  implication: Browser permission is fully granted and not blocked by Chrome.

- timestamp: 2026-09-29T23:25:00Z
  checked: macOS unified logs (`log show --predicate 'message CONTAINS[c] "localhost"'`)
  found: `usernoted` delivered notification requests with `Presenting <NotificationRecord ...> as banner (["badge", "sound", "alert"])`, followed by `donotdisturbd` resolving:
    `interruptionSuppression: delay delivery; resolutionReason: mode configuration type; activeModeUUID: AA1444ED-1142-4C29-9059-1AB48C4192B6; outcome: suppressed; reason: mode configuration type`.
  implication: OS received the notification and attempted banner presentation, but OS Do Not Disturb / Focus suppressed the banner.

- timestamp: 2026-09-29T23:27:00Z
  checked: macOS `donotdisturbd` state update logs for active mode UUID `AA1444ED-1142-4C29-9059-1AB48C4192B6`
  found: Active mode is `name: Sleep; modeIdentifier: com.apple.sleep.sleep-mode; symbolImageName: bed.double.fill; suppressionState: while UI locked; startDate: 2026-09-29 15:15:08 +0000 (22:15 local); userVisibleTransitionDate: 2026-09-30 00:05:00 +0000 (07:05 local)`.
  implication: macOS scheduled Sleep Focus mode turned on automatically at 22:15 (current time is ~23:30).

- timestamp: 2026-09-29T23:28:00Z
  checked: NotificationCenter logs for `com.google.Chrome.app.ocpokbmeoiipmpfgdpfinbfpcmahcfde` (the installed PWA)
  found: `NotificationCenter` logged:
    `559F-B14F (com.google.Chrome.app.ocpokbmeoiipmpfgdpfinbfpcmahcfde) muted by DND suppression: delay`
    `[com.google.Chrome.app.ocpokbmeoiipmpfgdpfinbfpcmahcfde:EF91EB5F:559F-B14F] added to history with groupingIdentifier <private>, readCount: 0`
    Total 64 banners muted and routed to Notification Center history without showing on screen.
  implication: The web app and browser correctly delivered the notification to macOS, but macOS Focus / Sleep mode muted the banner and filed it directly into the Notification Center drawer.

## Resolution

root_cause: |
  The application code, Service Worker, and Chrome browser are functioning correctly and successfully passing desktop notifications to the macOS notification subsystem (`usernoted`).
  However, macOS **Focus / Do Not Disturb** mode ("Sleep" Focus mode, scheduled from 22:15 to 07:05) is currently active on the host machine.
  Under this Focus mode, macOS `donotdisturbd` and `NotificationCenter` suppress all non-whitelisted app banners (`interruptionSuppression: delay delivery; outcome: suppressed; muted by DND suppression: delay`), preventing banners from popping up on screen and silently routing them directly to the macOS Notification Center history drawer.
fix: 
verification: 
files_changed: []
