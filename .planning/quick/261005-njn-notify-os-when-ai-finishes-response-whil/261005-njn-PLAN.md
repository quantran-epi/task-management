---
phase: quick
plan: 261005-njn
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/ai/AIChatDrawer.tsx
  - tests/components/ai/AIChatDrawerNotification.test.ts
autonomous: true
requirements: [QUICK-NOTIFY-AI-FINISHED]
estimate:
  tokens: 15000
  raw_tokens: 10000
  tasks: 1
  confidence: high
must_haves:
  truths:
    - "When AI finishes generating response and window/document is blurred or hidden, a desktop notification is dispatched to the OS"
    - "Notification requests permission gracefully if not granted yet"
    - "Clicking notification focuses window"
  artifacts:
    - src/components/ai/AIChatDrawer.tsx
    - tests/components/ai/AIChatDrawerNotification.test.ts
  key_links:
    - src/utils/desktopNotification.ts
---

<objective>
Notify OS when AI assistant finishes response while PlannerMate window is blurred or document is hidden.

Purpose: Alert user when an AI generation completes so they can switch back to PlannerMate without staring at the loading spinner.
Output: Integrated notification trigger in `src/components/ai/AIChatDrawer.tsx` and unit tests in `tests/components/ai/AIChatDrawerNotification.test.ts`.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
</execution_context>

<context>
@src/utils/desktopNotification.ts
@src/components/ai/AIChatDrawer.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Request permission and dispatch desktop notification when AI turn finishes while app is blurred/hidden</name>
  <files>src/components/ai/AIChatDrawer.tsx, tests/components/ai/AIChatDrawerNotification.test.ts</files>
  <action>
1. In `src/components/ai/AIChatDrawer.tsx`:
   - Import `sendDesktopNotification`, `isNotificationPermissionGranted`, and `requestNotificationPermission` from `../../utils/desktopNotification`.
   - In `useEffect` or upon user interaction (such as opening the drawer or submitting message in `handleSendMessage`), check if notification permission is granted; if not, request permission so notifications can be shown without being blocked later.
   - When AI finishes generating a response (around line 885 `aiDebugService.finishTurn(turnId, { finalResponse: fullResponse })` or in the completion block before `finally`), check if the document is not active/visible:
     ```ts
     const isBlurred = typeof document !== 'undefined' && (document.hidden || !document.hasFocus?.());
     ```
   - If `isBlurred` is true and `fullResponse.trim()` has content:
     Call `sendDesktopNotification`:
     ```ts
     const snippet = fullResponse.trim().slice(0, 120);
     sendDesktopNotification({
       title: 'PlannerMate AI',
       body: snippet + (fullResponse.trim().length > 120 ? '...' : ''),
       tag: 'ai-turn-finished',
     });
     ```
   - Ensure clicking the notification focuses the window (already handled by `sendDesktopNotification` in browser, but verify or pass data/tag).

2. Create `tests/components/ai/AIChatDrawerNotification.test.ts`:
   - Mock `../../src/utils/desktopNotification`.
   - Verify that when document is blurred (`document.hidden = true` or `document.hasFocus = () => false`), notification dispatch is triggered with appropriate title and body.
   - Verify that when document has focus and is visible (`document.hidden = false` and `document.hasFocus = () => true`), desktop notification is NOT triggered.

DO NOT run unrelated tests. Only run `npx vitest run tests/components/ai/AIChatDrawerNotification.test.ts` or `npm run typecheck`.
  </action>
  <verify>
    <automated>npx vitest run tests/components/ai/AIChatDrawerNotification.test.ts</automated>
  </verify>
  <done>
Desktop notification is sent when AI finishes response while PlannerMate is blurred/hidden, and unit test passes.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries
| Boundary | Description |
|----------|-------------|
| AI Response Content -> OS Notification Banner | Untrusted AI output / user content rendered into OS notification |

## STRIDE Threat Register
| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-quick-01 | Tampering / Info Disclosure | Desktop notification | low | mitigate | Truncate snippet to 120 chars, plain text string without HTML markup |
| T-quick-SC | Tampering | npm packages | high | mitigate | No new packages added; standard existing utils used |
</threat_model>

<verification>
Automated unit tests for notification behavior pass via `npx vitest run tests/components/ai/AIChatDrawerNotification.test.ts`.
</verification>

<success_criteria>
AI chat drawer triggers desktop notification when AI response concludes while document is hidden or window is not focused.
</success_criteria>

<output>
Plan ready for execution in .planning/quick/261005-njn-notify-os-when-ai-finishes-response-whil/261005-njn-PLAN.md
</output>
