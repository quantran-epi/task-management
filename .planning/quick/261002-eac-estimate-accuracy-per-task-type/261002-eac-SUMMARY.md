---
task_id: 261002-eac
title: Estimate vs actual accuracy analytics per task type
created: 2026-10-02
status: complete
---

# Quick Task Summary: Estimate vs actual accuracy analytics per task type

## Overview
Implemented comprehensive analytics on estimation accuracy per task type (`workType`), diagnosing whether the user tends to underestimate ("ước tính non") or overestimate ("ước tính già") for each type of work.

## Deliverables
1. **Types (`src/types/analytics.ts`)**:
   - `EstimationBias`: `'underestimate' | 'overestimate' | 'accurate' | 'no_estimate' | 'no_actual'`
   - `WorkTypeAccuracyItem`, `WorkTypeAccuracyChartItem`, `WorkTypeAccuracySummary` interfaces.

2. **Utility (`src/utils/analytics.ts`)**:
   - `calculateWorkTypeAccuracy`: aggregates tasks and work sessions by work type, calculates variance, percentage discrepancy, accuracy percentage (0-100%), bias diagnosis, and generates actionable advice.

3. **UI Components (`src/components/analytics/WorkTypeAccuracyCard.tsx` & `src/views/AnalyticsView.tsx`)**:
   - `WorkTypeAccuracyCard`: displays insight alert, overall bias tags, grouped Column chart (Estimate vs Actual per work type), and an Ant Design Table with work type, task count, estimate, actual, diff (hours & %), accuracy progress bar, and tendency status tag.
   - Integrated directly into `AnalyticsView.tsx`.

4. **Testing**:
   - Unit tests in `tests/utils/analytics.test.ts` covering accurate, underestimate, overestimate, and unestimated cases.
   - Component test in `tests/views/AnalyticsView.test.tsx` verifying card and table rendering.
