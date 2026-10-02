---
task_id: 261002-eac
title: Estimate vs actual accuracy analytics per task type
created: 2026-10-02
status: planned
---

# Quick Task Plan: Estimate vs actual accuracy analytics per task type

## Objective
Provide detailed analytics on estimation accuracy per task type (`workType`) so the user knows whether they tend to underestimate ("estimate non") or overestimate ("estimate già") for each type of work, helping improve future workload planning.

## Proposed Changes
1. **Types (`src/types/analytics.ts`)**:
   - Add `EstimationBias` ('underestimate' | 'overestimate' | 'accurate' | 'no_estimate' | 'no_actual')
   - Add `WorkTypeAccuracyItem` and `WorkTypeAccuracySummary` interfaces.

2. **Calculation Utility (`src/utils/analytics.ts`)**:
   - Implement `calculateWorkTypeAccuracy(tasks, sessions, period)` function:
     - Group tasks by `workType` (Lập trình, Tài liệu, Họp, Hỗ trợ & Kiểm thử, Nghiên cứu, Cấu hình, Đánh giá mã nguồn, Chưa phân loại).
     - Sum estimated hours and actual hours.
     - Calculate variance (`actual - estimate`), percentage diff, accuracy score (0-100%), and bias diagnosis (`underestimate` vs `overestimate` vs `accurate`).
     - Generate helpful takeaway advice/insight string for the user.

3. **UI Components (`src/components/analytics/WorkTypeAccuracyCard.tsx` & `AnalyticsView.tsx`)**:
   - Create `WorkTypeAccuracyCard` containing:
     - Insight banner highlighting overall bias trend and notable work types.
     - Grouped column chart (Ước tính vs Thực tế per work type).
     - Detailed Ant Design Table with work type, task count, estimate, actual, diff, accuracy progress, and bias Tag.
   - Integrate into `AnalyticsView.tsx`.

4. **Testing**:
   - Unit tests in `tests/utils/analytics.test.ts` for accuracy calculation and bias classification.
   - Component test in `tests/views/AnalyticsView.test.tsx` verifying accuracy card and table render properly.
   - Run ONLY targeted tests (`tests/utils/analytics.test.ts`, `tests/views/AnalyticsView.test.tsx`).
