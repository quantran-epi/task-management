import { describe, it, expect } from 'vitest';
import type { Task } from '../../src/types/models';
import {
  evaluateTaskSpentAlert,
  evaluateLiveTaskAlert,
  evaluateDailyCapacitySpentAlert,
  evaluateDailyFeasibilityAlert,
} from '../../src/utils/timerAlerts';

describe('timerAlerts 3-tier allocation & feasibility engine', () => {
  const baseTask: Task = {
    id: 'task-100',
    name: 'Implement OAuth Login',
    status: 'In Progress',
    progress: 40,
    priority: 'High',
    estimateMinutes: 60,
    workType: 'code',
    opsOwners: [],
    businessAnalysts: [],
    createdAt: '2026-09-20T00:00:00.000Z',
    updatedAt: '2026-09-20T00:00:00.000Z',
  };

  describe('Tier 1: Task Spent vs Estimate Alert (Toast)', () => {
    it('returns warning toast when spent time reaches or exceeds estimate', () => {
      // 60 minutes spent >= 60 minutes estimate
      const result = evaluateTaskSpentAlert(baseTask, 60);
      expect(result.shouldAlert).toBe(true);
      expect(result.severity).toBe('warning');
      expect(result.message).toBe(
        'Tác vụ "Implement OAuth Login" đã dùng 60m, vượt quá thời gian ước lượng (60m).'
      );

      // 75 minutes spent > 60 minutes estimate
      const resultOver = evaluateTaskSpentAlert(baseTask, 75);
      expect(resultOver.shouldAlert).toBe(true);
      expect(resultOver.message).toBe(
        'Tác vụ "Implement OAuth Login" đã dùng 75m, vượt quá thời gian ước lượng (60m).'
      );
    });

    it('does not alert when spent time is strictly below estimate', () => {
      const result = evaluateTaskSpentAlert(baseTask, 59);
      expect(result.shouldAlert).toBe(false);
      expect(result.message).toBe('');
    });

    it('does not alert when task has zero or negative estimate', () => {
      const taskNoEst: Task = { ...baseTask, estimateMinutes: 0 };
      const result = evaluateTaskSpentAlert(taskNoEst, 120);
      expect(result.shouldAlert).toBe(false);
    });

    it('handles negative or invalid spentMinutes gracefully', () => {
      const result = evaluateTaskSpentAlert(baseTask, -10);
      expect(result.shouldAlert).toBe(false);
    });

    it('evaluates live running timer alerts (evaluateLiveTaskAlert)', () => {
      // 0 historical spent + 60s elapsed = 1m >= 1m estimate
      const task1m: Task = { ...baseTask, estimateMinutes: 1 };
      const res60s = evaluateLiveTaskAlert(task1m, 0, 60);
      expect(res60s.shouldAlert).toBe(true);
      expect(res60s.severity).toBe('warning');
      expect(res60s.message).toContain('Implement OAuth Login');

      // 0 historical spent + 50s elapsed < 1m estimate
      const res50s = evaluateLiveTaskAlert(task1m, 0, 50);
      expect(res50s.shouldAlert).toBe(false);

      // 30m historical spent + 1800s (30m) = 60m >= 60m estimate
      const res60m = evaluateLiveTaskAlert(baseTask, 30, 1800);
      expect(res60m.shouldAlert).toBe(true);

      // 0 estimate returns shouldAlert: false
      const res0Est = evaluateLiveTaskAlert({ ...baseTask, estimateMinutes: 0 }, 10, 600);
      expect(res0Est.shouldAlert).toBe(false);
    });
  });

  describe('Tier 2: Daily Capacity Overload from Work Sessions (Drawer Notification)', () => {
    const testDate = '2026-09-29';

    it('returns overload notification item when daily spent exceeds daily capacity', () => {
      // 540m spent > 480m capacity
      const alert = evaluateDailyCapacitySpentAlert(testDate, 540, 480);
      expect(alert).not.toBeNull();
      expect(alert?.id).toBe(`overload:spent:${testDate}`);
      expect(alert?.category).toBe('overload');
      expect(alert?.title).toBe(
        `Thời gian làm việc ghi nhận ngày 2026-09-29 (540m) đã vượt quá công suất làm việc (480m).`
      );
      expect(alert?.tagColor).toBe('warning');
      expect(alert?.tagLabel).toBe('Vượt công suất 113%');
      expect(alert?.priorityOrder).toBe(2);
      expect(alert?.canDismiss).toBe(false);
    });

    it('returns null when daily spent does not exceed capacity', () => {
      const alertEqual = evaluateDailyCapacitySpentAlert(testDate, 480, 480);
      expect(alertEqual).toBeNull();

      const alertUnder = evaluateDailyCapacitySpentAlert(testDate, 300, 480);
      expect(alertUnder).toBeNull();
    });

    it('returns null when capacity is 0 (leave day or weekend)', () => {
      const alert = evaluateDailyCapacitySpentAlert(testDate, 60, 0);
      expect(alert).toBeNull();
    });
  });

  describe('Tier 3: Daily Feasibility Risk Alert', () => {
    const testDate = '2026-09-29';

    it('flags risk when remaining capacity is strictly less than pending tasks estimate', () => {
      // capacity: 480m, spent: 300m -> remaining capacity = 180m
      // pending tasks estimate: 240m -> deficit of 60m
      const result = evaluateDailyFeasibilityAlert({
        date: testDate,
        dailyCapacityMinutes: 480,
        dailySpentMinutes: 300,
        pendingTasksEstimateMinutes: 240,
      });

      expect(result.isAtRisk).toBe(true);
      expect(result.remainingCapacity).toBe(180);
      expect(result.pendingEstimate).toBe(240);
      expect(result.message).toBe(
        'Tổng thời gian còn lại của các tác vụ hôm nay (240m) vượt quá thời gian làm việc còn lại (180m).'
      );
    });

    it('returns isAtRisk false when remaining capacity is sufficient', () => {
      // capacity: 480m, spent: 200m -> remaining: 280m >= 200m pending
      const result = evaluateDailyFeasibilityAlert({
        date: testDate,
        dailyCapacityMinutes: 480,
        dailySpentMinutes: 200,
        pendingTasksEstimateMinutes: 200,
      });

      expect(result.isAtRisk).toBe(false);
      expect(result.remainingCapacity).toBe(280);
      expect(result.pendingEstimate).toBe(200);
      expect(result.message).toBeUndefined();
    });

    it('returns isAtRisk false when there are no pending tasks', () => {
      const result = evaluateDailyFeasibilityAlert({
        date: testDate,
        dailyCapacityMinutes: 480,
        dailySpentMinutes: 500, // already exceeded
        pendingTasksEstimateMinutes: 0,
      });

      expect(result.isAtRisk).toBe(false);
      expect(result.remainingCapacity).toBe(0);
      expect(result.pendingEstimate).toBe(0);
    });

    it('handles negative inputs and bounds capacity safely without NaN', () => {
      const result = evaluateDailyFeasibilityAlert({
        date: testDate,
        dailyCapacityMinutes: -100,
        dailySpentMinutes: -50,
        pendingTasksEstimateMinutes: 60,
      });

      expect(result.isAtRisk).toBe(true);
      expect(result.remainingCapacity).toBe(0);
      expect(result.pendingEstimate).toBe(60);
    });
  });
});
