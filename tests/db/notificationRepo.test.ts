// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db/index';
import {
  getDismissedAlerts,
  dismissAlertToday,
  clearDismissedAlerts,
  isAlertDismissible,
} from '../../src/db/repositories/notificationRepo';

describe('Notification Repository (D-14, D-15, D-16)', () => {
  let testDb: TaskPlannerDatabase;
  const todayDate = '2026-09-28';
  const yesterdayDate = '2026-09-27';

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase('TestNotificationRepoDB_' + Math.random().toString(36).slice(2));
    await testDb.open();
  });

  afterEach(async () => {
    await testDb.delete();
  });

  describe('isAlertDismissible', () => {
    it('returns false for overdue and overload alerts', () => {
      expect(isAlertDismissible('overdue:task:123')).toBe(false);
      expect(isAlertDismissible('overload:date:2026-09-28')).toBe(false);
      expect(isAlertDismissible('due-soon:task:456')).toBe(false);
    });

    it('returns true for stale tasks and custom reminders', () => {
      expect(isAlertDismissible('stale:task:123')).toBe(true);
      expect(isAlertDismissible('reminder:task:456')).toBe(true);
      expect(isAlertDismissible('reminder:project:789')).toBe(true);
      expect(isAlertDismissible('reminder:milestone:999')).toBe(true);
    });
  });

  describe('getDismissedAlerts', () => {
    it('returns empty record when no setting exists', async () => {
      const result = await getDismissedAlerts(testDb);
      expect(result).toEqual({});
    });

    it('returns stored map when present in db.settings', async () => {
      await testDb.settings.put({
        key: 'dismissedAlerts',
        value: { 'stale:task:1': todayDate },
      });
      const result = await getDismissedAlerts(testDb);
      expect(result).toEqual({ 'stale:task:1': todayDate });
    });
  });

  describe('dismissAlertToday', () => {
    it('sets alertKey to todayDate in settings.dismissedAlerts', async () => {
      await dismissAlertToday('stale:task:1', todayDate, testDb);
      const result = await getDismissedAlerts(testDb);
      expect(result['stale:task:1']).toBe(todayDate);
    });

    it('throws error when attempting to dismiss an overdue or overload alert', async () => {
      await expect(
        dismissAlertToday('overdue:task:1', todayDate, testDb)
      ).rejects.toThrow('Cảnh báo quá hạn và quá tải không thể bỏ qua.');

      await expect(
        dismissAlertToday('overload:date:2026-09-28', todayDate, testDb)
      ).rejects.toThrow('Cảnh báo quá hạn và quá tải không thể bỏ qua.');
    });

    it('automatically purges entries where dismissedDate !== todayDate', async () => {
      // Seed with yesterday's dismissal
      await testDb.settings.put({
        key: 'dismissedAlerts',
        value: {
          'stale:task:yesterday': yesterdayDate,
          'reminder:task:existing-today': todayDate,
        },
      });

      // Dismiss a new alert today
      await dismissAlertToday('stale:task:new-today', todayDate, testDb);

      const result = await getDismissedAlerts(testDb);
      // Yesterday's entry should be pruned
      expect(result['stale:task:yesterday']).toBeUndefined();
      // Today's existing and new entries should persist
      expect(result['reminder:task:existing-today']).toBe(todayDate);
      expect(result['stale:task:new-today']).toBe(todayDate);
    });
  });

  describe('clearDismissedAlerts', () => {
    it('empties the dismissedAlerts setting value', async () => {
      await dismissAlertToday('stale:task:1', todayDate, testDb);
      expect(Object.keys(await getDismissedAlerts(testDb))).toHaveLength(1);

      await clearDismissedAlerts(testDb);
      const cleared = await getDismissedAlerts(testDb);
      expect(cleared).toEqual({});
    });
  });
});
