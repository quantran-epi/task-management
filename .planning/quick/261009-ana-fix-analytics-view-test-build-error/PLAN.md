---
task_id: 261009-ana
slug: fix-analytics-view-test-build-error
date: 2026-10-09
type: quick
status: planned
---

# Quick Plan: Fix build error in AnalyticsView.test.tsx

## Goal
Fix TypeScript build error TS2353 in `tests/views/AnalyticsView.test.tsx`:
`Object literal may only specify known properties, and 'date' does not exist in type '{ taskId: string; startTime: string; endTime?: string | undefined; durationMinutes: number; segments?: { startTime: string; endTime?: string | undefined; }[] | undefined; note?: string | undefined; }'`

## Root Cause
`createWorkSession` takes `WorkSessionInput` which derives `date` automatically from `startTime`. Passing an explicit `date` property fails strict type-checking in `AnalyticsView.test.tsx:55`.

## Proposed Changes
- In `tests/views/AnalyticsView.test.tsx`:
  - Remove `date: today,` from `createWorkSession` input.
- Verify with `npm run build` and `npx vitest run tests/views/AnalyticsView.test.tsx`.
