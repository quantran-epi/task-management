---
phase: quick-261113-ita
plan: '01'
type: execute
requirements: [G-37.1-6-notification, G-37.1-6-unread-divider, G-37.1-7]
---

# Confirmed team-chat UI fixes

User authorized direct edits in task-management-intellij after isolated executor was blocked. No commits or pushes for this round without another request.

1. Notification: suppress only visible AND focused active team; recheck after async work, preserve dedup, expose permission status with explicit enable action using existing desktop notification utilities. No automatic permission prompts.
2. Unread: blur/hide unpins reading, mount/focus does not consume backlog. Anchor first unread by seq, do not auto-scroll past it. Actual reading or explicit mark-read clears unread through focused/visible cursor gate.
3. NO_LEAD: local warning and group settings action; exclude only this error from generic provider-outage card.

Checks: focused hook/receipt/composer/typing tests, TypeScript noEmit, git diff --check. Existing dependencies only, no live provider calls, full suite or PWA changes. Preserve dirty UAT/debug files. Do not claim runtime UAT passes from unit tests.

Excluded: unproven test11 plain cancellation, DOM crash, transient leader stall, historical test3, and configurable tool-round limits.
