---
phase: quick
plan: 261018-jrd
type: execute
wave: 1
depends_on: []
files_modified:
  - src/services/ai/dailyInsightService.ts
  - tests/services/dailyInsights.test.ts
  - src/components/dailyReview/DailyReviewModal.tsx
  - src/components/shell/AppShell.tsx
  - tests/components/dailyReview/DailyReviewModal.test.tsx
autonomous: true
requirements:
  - QUICK-261018-JRD-BRIEFING-DEBRIEFING-INSIGHTS
must_haves:
  truths:
    - "User can view deterministic Daily Briefing (planned workload, capacity, priority tasks) and Daily Debriefing (actual logged hours, completed vs incomplete tasks, rollover actions) in the header summary modal."
    - "User can click an on-demand AI insight button in both Briefing and Debriefing tabs to stream tailored insights via NineRouter."
    - "When AI is unconfigured or unreachable, all deterministic heuristics remain fully functional offline without errors."
  artifacts:
    - path: "src/services/ai/dailyInsightService.ts"
      provides: "Deterministic briefing/debriefing calculation and AI prompt construction"
    - path: "src/components/dailyReview/DailyReviewModal.tsx"
      provides: "Briefing and Debriefing tabs with hybrid deterministic metrics and on-demand AI streaming"
  key_links:
    - from: "src/components/dailyReview/DailyReviewModal.tsx"
      to: "src/services/ai/dailyInsightService.ts"
      via: "generateDeterministicBriefing, generateDeterministicDebriefing, prompt builders"
      pattern: "generateDeterministic"
    - from: "src/components/dailyReview/DailyReviewModal.tsx"
      to: "src/services/ai/nineRouterClient.ts"
      via: "streamChatCompletion on user demand"
      pattern: "streamChatCompletion"
---

<objective>
Add AI Briefing and Debriefing insights to header summary modal.

Purpose: Allow personal user to evaluate planned capacity and prioritize tasks at the start of day (Briefing) and analyze actual progress, time variance, and task rollover at the end of day (Debriefing), combining instant offline deterministic heuristics with on-demand streaming AI insights.
Output: `dailyInsightService.ts`, enhanced `DailyReviewModal.tsx`, header summary integration in `AppShell.tsx`, and comprehensive test suite.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@src/components/dailyReview/DailyReviewModal.tsx
@src/components/shell/AppShell.tsx
@src/services/ai/nineRouterClient.ts
@src/services/ai/nineRouterTokenService.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create daily insight service with deterministic heuristics and AI prompt builders</name>
  <files>src/services/ai/dailyInsightService.ts, tests/services/dailyInsights.test.ts</files>
  <behavior>
    - generateDeterministicBriefing calculates planned minutes vs capacity, load percentage, overload warning, high-priority task count, and heuristic recommendations.
    - generateDeterministicDebriefing calculates logged minutes vs capacity, completion rate, incomplete tasks count, and rollover suggestions.
    - buildBriefingPrompt produces concise system and user prompts instructing LLM to provide high-leverage morning focus advice.
    - buildDebriefingPrompt produces concise system and user prompts instructing LLM to analyze time variance and rollover plan.
  </behavior>
  <action>
    Create `src/services/ai/dailyInsightService.ts` implementing:
    - Data interfaces: `BriefingInput` (date, capacityMinutes, allocations with tasks) and `DebriefingInput` (date, capacityMinutes, loggedMinutes, allocations with tasks).
    - `generateDeterministicBriefing(input: BriefingInput)`: Pure function computing capacity ratio, workload status, top priority items, and actionable tips.
    - `generateDeterministicDebriefing(input: DebriefingInput)`: Pure function computing actual vs target ratio, completion counts, and rollover advice.
    - `buildBriefingPrompt(input: BriefingInput)`: Generates structured LLM messages without leaking sensitive credentials.
    - `buildDebriefingPrompt(input: DebriefingInput)`: Generates structured LLM messages for end-of-day review.
    Write unit tests in `tests/services/dailyInsights.test.ts` covering normal, overloaded, empty, and edge cases.
  </action>
  <verify>
    <automated>npx vitest run tests/services/dailyInsights.test.ts</automated>
  </verify>
  <done>Pure deterministic functions calculate accurate metrics and prompts format cleanly; all unit tests pass.</done>
</task>

<task type="auto">
  <name>Task 2: Enhance DailyReviewModal with Briefing and Debriefing tabs and streaming AI insights</name>
  <files>src/components/dailyReview/DailyReviewModal.tsx, src/components/shell/AppShell.tsx</files>
  <action>
    In `src/components/dailyReview/DailyReviewModal.tsx`:
    - Add Segmented control or Tabs for mode selection: "Briefing (Đầu ngày)" and "Debriefing (Tổng kết)".
    - Briefing view:
      - Render deterministic KPI cards (Planned minutes, Capacity, Load status, High priority count).
      - Render scheduled tasks list with priority tags and estimates.
      - Add on-demand "Phân tích AI (Briefing)" button with RobotOutlined icon.
      - On click, fetch key via `getNineRouterApiKey(db)` and config via `getNineRouterConfig(db)`. Stream response via `streamChatCompletion`. Render with `renderSafeMarkdown`.
    - Debriefing view:
      - Preserve and polish existing actual vs target metrics, progress bar, incomplete task table with rollover actions, and completed tasks list.
      - Add on-demand "Phân tích AI (Debriefing)" button streaming end-of-day retrospective insights.
    - Handle abort controller on modal close or re-generation.
    - Show friendly warning banner if API key is not configured, directing to Settings without crashing.
    In `src/components/shell/AppShell.tsx`:
    - Update Header button tooltip and label to reflect "Tổng quan & Đánh giá ngày (Briefing & Debriefing)".
  </action>
  <verify>
    <automated>npx vitest run tests/components/dailyReview/DailyReviewModal.test.tsx</automated>
  </verify>
  <done>Modal supports both Briefing and Debriefing tabs; deterministic data renders offline; AI insights stream on demand.</done>
</task>

<task type="auto">
  <name>Task 3: Add component tests for Briefing and Debriefing modal flows</name>
  <files>tests/components/dailyReview/DailyReviewModal.test.tsx</files>
  <action>
    Update `tests/components/dailyReview/DailyReviewModal.test.tsx`:
    - Add test for Briefing tab rendering planned tasks, capacity metrics, and deterministic recommendations.
    - Add test for tab switching between Briefing and Debriefing.
    - Add test for clicking on-demand AI insight button invoking streaming completion.
    - Add test for graceful fallback message when AI API key is missing.
    - Ensure existing rollover tests continue passing without regression.
  </action>
  <verify>
    <automated>npx vitest run tests/components/dailyReview/DailyReviewModal.test.tsx</automated>
  </verify>
  <done>All daily review component tests pass with coverage of Briefing, Debriefing, and AI trigger states.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Client -> NineRouter API | Untrusted / external LLM endpoint receives task metadata |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-quick-01 | Information Disclosure | `dailyInsightService.ts` prompt builder | mitigate | Only include task name, priority, status, and duration numbers; exclude personal notes, credentials, and tokens. |
| T-quick-02 | Denial of Service | `DailyReviewModal.tsx` streaming | mitigate | Abort active streaming request using AbortController on modal close or unmount. |
</threat_model>

<verification>
npx vitest run tests/services/dailyInsights.test.ts tests/components/dailyReview/DailyReviewModal.test.tsx
npm run build
</verification>

<success_criteria>
- Header summary modal provides both Briefing (morning planning) and Debriefing (evening review) views.
- Deterministic heuristics provide instant, zero-cost, offline-first analysis.
- On-demand AI insight button streams contextual recommendations when NineRouter is configured.
- Existing rollover and daily review functionality works without regression.
</success_criteria>

<output>
Create `.planning/quick/261018-jrd-add-ai-briefing-and-debriefing-insights-/261018-jrd-SUMMARY.md` when done.
</output>
