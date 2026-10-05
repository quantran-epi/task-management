---
phase: quick
plan: 261005-njn
subsystem: ai
tags: [ai, notifications, desktop, os]
requires: []
provides: [desktop-ai-turn-notification]
affects: [AIChatDrawer]
tech-stack:
  added: []
  patterns: [unified-desktop-notification-on-blur]
key-files:
  created:
    - tests/components/ai/AIChatDrawerNotification.test.ts
  modified:
    - src/components/ai/AIChatDrawer.tsx
decisions:
  - "Gracefully request notification permission when AIChatDrawer opens and upon user sending message"
  - "Trigger desktop notification when AI turn finishes if document is hidden or window has no focus"
metrics:
  duration: 4m
  completed_date: "2026-10-05"
status: complete
actuals:
  tokens: 12000
  tasks: 1
  commits: 1
---

# Quick Plan 261005-njn: Notify OS When AI Finishes Response While Window Is Blurred Summary

Integrated desktop notification dispatch when AI finishes generating a response while PlannerMate is blurred or hidden in the background.

## Key Changes

1. **Permission Request**:
   - `src/components/ai/AIChatDrawer.tsx`: Requests notification permission using `requestNotificationPermission` when the chat drawer opens or when the user sends a message.

2. **Completion Trigger on Blur / Hidden**:
   - `src/components/ai/AIChatDrawer.tsx`: Upon receiving the complete AI response, checks `document.hidden || !document.hasFocus?.()`.
   - If blurred/hidden and content is present, dispatches notification via `sendDesktopNotification` with a truncated preview (120 chars) and tag `ai-turn-finished`.

3. **Unit Tests**:
   - `tests/components/ai/AIChatDrawerNotification.test.ts`: Added unit tests verifying permission request on drawer open, notification dispatch when hidden/blurred (with preview truncation), and no notification when document is visible and focused.

## Deviations from Plan

None - executed as planned.

## Verification

Targeted vitest suite passed cleanly:
```bash
npx vitest run tests/components/ai/AIChatDrawerNotification.test.ts
```
Result: 4 tests passed (100%).
Typecheck passed with no errors.
