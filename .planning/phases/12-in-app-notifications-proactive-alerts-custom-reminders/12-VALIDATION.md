---
phase: 12
slug: in-app-notifications-proactive-alerts-custom-reminders
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-28
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 with `@testing-library/react` and `fake-indexeddb` |
| **Config file** | `vite.config.ts` |
| **Quick run command** | `npx vitest run tests/utils/notifications.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/utils/notifications.test.ts`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 1 | NOTIF-01 | — | Schema v4 adds reminder fields and indexes cleanly | unit / db | `npx vitest run tests/db/schemaV4.test.ts` | ❌ W0 | ⬜ pending |
| 12-01-02 | 01 | 1 | NOTIF-01 | V5 Input Validation | Zod validation ensures reminderDate YYYY-MM-DD format & reminderNote <= 500 chars | unit | `npx vitest run tests/validation/notificationSchemas.test.ts` | ❌ W0 | ⬜ pending |
| 12-02-01 | 02 | 2 | NOTIF-03 | — | Correctly identifies overdue tasks and tasks due today/tomorrow | unit | `npx vitest run tests/utils/notifications.test.ts` | ❌ W0 | ⬜ pending |
| 12-02-02 | 02 | 2 | NOTIF-04 | — | Accurately calculates 14-day capacity overload (>100%) | unit | `npx vitest run tests/utils/notifications.test.ts` | ❌ W0 | ⬜ pending |
| 12-02-03 | 02 | 2 | NOTIF-05 | — | Detects stale in-progress/in-review tasks (>5 days untouched) | unit | `npx vitest run tests/utils/notifications.test.ts` | ❌ W0 | ⬜ pending |
| 12-03-01 | 03 | 3 | NOTIF-02 | — | NotificationBell shows badge counter and toggles NotificationDrawer | component | `npx vitest run tests/components/notifications/NotificationBell.test.tsx` | ❌ W0 | ⬜ pending |
| 12-03-02 | 03 | 3 | NOTIF-02 | V5 / XSS | NotificationDrawer renders 5 tabs, navigates, handles quick-done and dismiss safely | component | `npx vitest run tests/components/notifications/NotificationDrawer.test.tsx` | ❌ W0 | ⬜ pending |
| 12-03-03 | 03 | 3 | NOTIF-01 | — | ProjectModal, MilestoneModal, and TaskModal permit setting/clearing reminders | component | `npx vitest run tests/components/ProjectMilestoneModalAndTable.test.tsx` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/utils/notifications.test.ts` — pure alert evaluation tests for overdue, overload, due-soon, stale, reminder
- [ ] `tests/db/schemaV4.test.ts` — Dexie schema v4 migration, index persistence, and backward compatibility
- [ ] `tests/components/notifications/NotificationDrawer.test.tsx` — drawer tabs, list rendering, quick Done, dismiss action
- [ ] `tests/components/notifications/NotificationBell.test.tsx` — bell badge display and drawer toggle behavior

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Native Web Notification permission prompt | NOTIF-02 | Browser permission UI requires user interaction | Toggle native notifications in Settings, grant permission in browser prompt, verify test notification fires |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
