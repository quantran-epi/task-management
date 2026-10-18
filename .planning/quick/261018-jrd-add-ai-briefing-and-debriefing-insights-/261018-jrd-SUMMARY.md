# Quick Task 261018-jrd: Add AI Briefing and Debriefing Insights Summary

## Executive Summary
Integrated deterministic heuristics and on-demand streaming AI insights into the daily review workflow (`DailyReviewModal`), allowing users to perform morning planning (**Briefing**) and evening review (**Debriefing** / Standup) with zero cloud dependency for offline metrics, while providing contextual recommendations via local/remote NineRouter when enabled.

## Key Changes
1. **Daily Insight Service (`src/services/ai/dailyInsightService.ts`)**:
   - `generateDeterministicBriefing`: Pure offline computation of planned duration vs capacity ratio, overload status, and actionable recommendations.
   - `generateDeterministicDebriefing`: Pure offline calculation of actual logged hours, capacity utilization, completion rate, and task rollover suggestions.
   - `buildBriefingPrompt` & `buildDebriefingPrompt`: Structured LLM prompt generators strictly avoiding credential or note leakage.
   - Unit tests covering all edge cases (`tests/services/dailyInsights.test.ts`).

2. **Daily Review Modal Redesign (`src/components/dailyReview/DailyReviewModal.tsx`)**:
   - Segmented switch for **Briefing (Đầu ngày)** and **Debriefing (Tổng kết)**.
   - Briefing tab: Displays planned hours, capacity, workload ratio, priority tags, scheduled tasks table, and an on-demand "Nhận diện & Gợi ý AI" streaming button.
   - Debriefing tab: Preserves actual vs target stats, progress bar, rollover table ("Sang mai"), and completed tasks list, with an on-demand "Đánh giá cuối ngày" AI streaming button.
   - Full abort-controller lifecycle cleanup upon modal close, tab switch, or re-generation.
   - Safe Markdown rendering via `renderSafeMarkdown`.

3. **App Shell Integration (`src/components/shell/AppShell.tsx`)**:
   - Updated header tooltip to "Tổng quan & Đánh giá ngày (Briefing & Debriefing)" and button label to "Tổng quan ngày".

4. **Automated Test Suite (`tests/components/dailyReview/DailyReviewModal.test.tsx`)**:
   - Verified initial Briefing render, tab switching, empty state, task rollover to next day, missing API key fallback alert, and mock AI streaming completion.

## Verification
- `npx vitest run tests/services/dailyInsights.test.ts tests/components/dailyReview/DailyReviewModal.test.tsx`: 15 passed across 2 test files.
- `npm run build`: TypeScript compiler check and Vite PWA build succeeded with zero errors.

## Self-Check: PASSED
- `src/services/ai/dailyInsightService.ts` exists.
- `tests/services/dailyInsights.test.ts` exists.
- `src/components/dailyReview/DailyReviewModal.tsx` exists and verified.
- `src/components/shell/AppShell.tsx` updated and verified.
- `tests/components/dailyReview/DailyReviewModal.test.tsx` exists and passes.
- Commits created atomically.
