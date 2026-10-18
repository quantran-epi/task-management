// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db/index';
import {
  getDismissedAlerts,
  dismissAlertToday,
  clearDismissedAlerts,
  isAlertDismissible,
  completeReminderAlert,
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

  describe('completeReminderAlert', () => {
    it('removes specific reminder from task reminders array', async () => {
      const taskId = 'task-rem-1';
      const remId1 = '00000000-0000-4000-8000-000000000001';
      const remId2 = '00000000-0000-4000-8000-000000000002';
      await testDb.tasks.add({
        id: taskId,
        name: 'Task with reminders',
        status: 'Open',
        priority: 'High',
        progress: 0,
        estimateMinutes: 30,
        workType: 'code',
        reminders: [
          { id: remId1, date: '2026-09-28', note: 'First reminder' },
          { id: remId2, date: '2026-09-29', note: 'Second reminder' },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await completeReminderAlert(`reminder:task:${taskId}:${remId1}`, testDb);

      const updated = await testDb.tasks.get(taskId);
      expect(updated?.reminders).toHaveLength(1);
      expect(updated?.reminders?.[0]?.id).toBe(remId2);
    });

    it('clears legacy reminder from task', async () => {
      const taskId = 'task-rem-legacy';
      await testDb.tasks.add({
        id: taskId,
        name: 'Task with legacy reminder',
        status: 'Open',
        priority: 'Medium',
        progress: 0,
        estimateMinutes: 30,
        workType: 'code',
        reminderDate: '2026-09-28',
        reminderNote: 'Legacy note',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await completeReminderAlert(`reminder:task:${taskId}`, testDb);

      const updated = await testDb.tasks.get(taskId);
      expect(updated?.reminderDate).toBeUndefined();
      expect(updated?.reminderNote).toBeUndefined();
    });

    it('removes reminder from project', async () => {
      const projId = 'proj-rem-1';
      const remId = '00000000-0000-4000-8000-000000000003';
      await testDb.projects.add({
        id: projId,
        name: 'Project with reminder',
        status: 'Open',
        reminders: [{ id: remId, date: '2026-09-28' }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await completeReminderAlert(`reminder:project:${projId}:${remId}`, testDb);

      const updated = await testDb.projects.get(projId);
      expect(updated?.reminders).toHaveLength(0);
    });
  });
});
