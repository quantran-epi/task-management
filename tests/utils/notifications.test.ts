import { describe, it, expect } from 'vitest';
import type {
  Task,
  Project,
  Milestone,
  CapacityRule,
  CapacityOverride,
  PlannedAllocation,
} from '../../src/types/models';
import { evaluateNotifications, isReminderTriggered } from '../../src/utils/notifications';

describe('evaluateNotifications', () => {
  const todayDate = '2026-09-28';
  const tomorrowDate = '2026-09-29';

  const baseTask: Task = {
    id: 'task-1',
    name: 'Sample Task',
    status: 'Open',
    progress: 0,
    priority: 'Medium',
    estimateMinutes: 60,
    createdAt: '2026-09-20T00:00:00.000Z',
    updatedAt: '2026-09-20T00:00:00.000Z',
  };

  const defaultRules: CapacityRule[] = [
    { id: 'r-0', dayOfWeek: 0, workMinutes: 0 },
    { id: 'r-1', dayOfWeek: 1, workMinutes: 480 },
    { id: 'r-2', dayOfWeek: 2, workMinutes: 480 },
    { id: 'r-3', dayOfWeek: 3, workMinutes: 480 },
    { id: 'r-4', dayOfWeek: 4, workMinutes: 480 },
    { id: 'r-5', dayOfWeek: 5, workMinutes: 480 },
    { id: 'r-6', dayOfWeek: 6, workMinutes: 0 },
  ];

  it('Test 1: Identifies overdue tasks (deadline < todayDate) with status not Done/Cancelled, assigns priorityOrder: 1, tagColor: error, canDismiss: false', () => {
    const tasks: Task[] = [
      {
        ...baseTask,
        id: 't-overdue-1',
        name: 'Overdue Task 1',
        deadline: '2026-09-25',
        status: 'Open',
      },
      {
        ...baseTask,
        id: 't-overdue-done',
        name: 'Overdue Done Task',
        deadline: '2026-09-25',
        status: 'Done',
      },
      {
        ...baseTask,
        id: 't-overdue-cancelled',
        name: 'Overdue Cancelled Task',
        deadline: '2026-09-25',
        status: 'Cancelled',
      },
    ];

    const result = evaluateNotifications({
      tasks,
      projects: [],
      milestones: [],
      rules: defaultRules,
      overrides: [],
      allocations: [],
      dismissedMap: {},
      todayDate,
    });

    const overdue = result.filter((item) => item.category === 'overdue');
    expect(overdue).toHaveLength(1);
    expect(overdue[0]?.id).toBe('overdue:task:t-overdue-1');
    expect(overdue[0]?.priorityOrder).toBe(1);
    expect(overdue[0]?.tagColor).toBe('error');
    expect(overdue[0]?.tagLabel).toBe('Quá hạn 3 ngày');
    expect(overdue[0]?.canDismiss).toBe(false);
    expect(overdue[0]?.entityType).toBe('task');
    expect(overdue[0]?.entityId).toBe('t-overdue-1');
  });

  it('Test 2: Scans 14-day window (todayDate to todayDate + 14d) using capacity rules and overrides; flags overloaded days with priorityOrder: 2, tagColor: warning, canDismiss: false', () => {
    // 2026-09-28 is Monday (480m cap)
    // 2026-09-30 is Wednesday (override to 240m cap)
    const overrides: CapacityOverride[] = [
      { id: 'ov-1', date: '2026-09-30', workMinutes: 240 },
    ];

    const tasks: Task[] = [
      { ...baseTask, id: 't-work-1', status: 'In Progress' },
      { ...baseTask, id: 't-work-inactive', status: 'Done' },
    ];

    const allocations: PlannedAllocation[] = [
      // 2026-09-28: 540m active > 480m -> Overload!
      { id: 'al-1', taskId: 't-work-1', date: '2026-09-28', allocatedMinutes: 540 },
      // 2026-09-28: 100m inactive -> should not count toward active load
      { id: 'al-2', taskId: 't-work-inactive', date: '2026-09-28', allocatedMinutes: 100 },
      // 2026-09-30: 300m active > 240m -> Overload!
      { id: 'al-3', taskId: 't-work-1', date: '2026-09-30', allocatedMinutes: 300 },
      // 2026-10-01: 200m active <= 480m -> Not overload
      { id: 'al-4', taskId: 't-work-1', date: '2026-10-01', allocatedMinutes: 200 },
      // Beyond 14 days (2026-10-15): 600m -> Out of window, should not flag
      { id: 'al-5', taskId: 't-work-1', date: '2026-10-15', allocatedMinutes: 600 },
    ];

    const result = evaluateNotifications({
      tasks,
      projects: [],
      milestones: [],
      rules: defaultRules,
      overrides,
      allocations,
      dismissedMap: {},
      todayDate,
    });

    const overloads = result.filter((item) => item.category === 'overload');
    expect(overloads).toHaveLength(2);
    expect(overloads[0]?.id).toBe('overload:date:2026-09-28');
    expect(overloads[0]?.priorityOrder).toBe(2);
    expect(overloads[0]?.tagColor).toBe('warning');
    expect(overloads[0]?.canDismiss).toBe(false);
    expect(overloads[0]?.entityType).toBe('capacity');
    expect(overloads[0]?.tagLabel).toContain('Quá tải');

    expect(overloads[1]?.id).toBe('overload:date:2026-09-30');
    expect(overloads[1]?.priorityOrder).toBe(2);
  });

  it('Test 3: Identifies due-soon tasks (deadline === todayDate or deadline === tomorrowDate) with priorityOrder: 3, tagColor: processing for today and blue for tomorrow, canDismiss: false', () => {
    const tasks: Task[] = [
      {
        ...baseTask,
        id: 't-due-today',
        name: 'Task Due Today',
        deadline: todayDate,
        status: 'Open',
      },
      {
        ...baseTask,
        id: 't-due-tomorrow',
        name: 'Task Due Tomorrow',
        deadline: tomorrowDate,
        status: 'In Progress',
      },
      {
        ...baseTask,
        id: 't-due-today-done',
        name: 'Task Due Today Done',
        deadline: todayDate,
        status: 'Done',
      },
    ];

    const result = evaluateNotifications({
      tasks,
      projects: [],
      milestones: [],
      rules: defaultRules,
      overrides: [],
      allocations: [],
      dismissedMap: {},
      todayDate,
    });

    const dueSoon = result.filter((item) => item.category === 'due-soon');
    expect(dueSoon).toHaveLength(2);

    const todayItem = dueSoon.find((d) => d.entityId === 't-due-today');
    expect(todayItem).toBeDefined();
    expect(todayItem?.priorityOrder).toBe(3);
    expect(todayItem?.tagColor).toBe('processing');
    expect(todayItem?.tagLabel).toBe('Đến hạn hôm nay');
    expect(todayItem?.canDismiss).toBe(false);

    const tomorrowItem = dueSoon.find((d) => d.entityId === 't-due-tomorrow');
    expect(tomorrowItem).toBeDefined();
    expect(tomorrowItem?.priorityOrder).toBe(3);
    expect(tomorrowItem?.tagColor).toBe('blue');
    expect(tomorrowItem?.tagLabel).toBe('Đến hạn ngày mai');
    expect(tomorrowItem?.canDismiss).toBe(false);
  });

  it('Test 4: Flags stale tasks in In Progress or In Review untouched for > 5 days with priorityOrder: 4, tagColor: purple, canDismiss: true; skips if dismissed for todayDate', () => {
    const tasks: Task[] = [
      {
        ...baseTask,
        id: 't-stale-progress',
        name: 'Stale In Progress',
        status: 'In Progress',
        updatedAt: '2026-09-20T10:00:00.000Z', // 8 days ago
      },
      {
        ...baseTask,
        id: 't-stale-review',
        name: 'Stale In Review',
        status: 'In Review',
        updatedAt: '2026-09-22T08:00:00.000Z', // 6 days ago
      },
      {
        ...baseTask,
        id: 't-fresh',
        name: 'Fresh In Progress',
        status: 'In Progress',
        updatedAt: '2026-09-26T08:00:00.000Z', // 2 days ago
      },
      {
        ...baseTask,
        id: 't-stale-dismissed',
        name: 'Stale Dismissed',
        status: 'In Progress',
        updatedAt: '2026-09-18T08:00:00.000Z', // 10 days ago
      },
      {
        ...baseTask,
        id: 't-stale-open',
        name: 'Stale Open',
        status: 'Open', // Not In Progress or In Review
        updatedAt: '2026-09-18T08:00:00.000Z',
      },
    ];

    const dismissedMap: Record<string, string> = {
      'stale:task:t-stale-dismissed': todayDate,
    };

    const result = evaluateNotifications({
      tasks,
      projects: [],
      milestones: [],
      rules: defaultRules,
      overrides: [],
      allocations: [],
      dismissedMap,
      todayDate,
    });

    const staleItems = result.filter((item) => item.category === 'stale');
    expect(staleItems).toHaveLength(2);

    expect(staleItems[0]?.id).toBe('stale:task:t-stale-progress');
    expect(staleItems[0]?.priorityOrder).toBe(4);
    expect(staleItems[0]?.tagColor).toBe('purple');
    expect(staleItems[0]?.canDismiss).toBe(true);
    expect(staleItems[0]?.tagLabel).toBe('Chưa cập nhật 8 ngày');

    expect(staleItems[1]?.id).toBe('stale:task:t-stale-review');
    expect(staleItems[1]?.tagLabel).toBe('Chưa cập nhật 6 ngày');
  });

  it('Test 5: Flags active custom reminders on Project, Milestone, and Task where reminderDate <= todayDate and status not Done/Cancelled with priorityOrder: 5, tagColor: gold, canDismiss: true; skips if dismissed for todayDate', () => {
    const projects: Project[] = [
      {
        id: 'p-1',
        name: 'Project Reminder',
        status: 'In Progress',
        reminderDate: '2026-09-28',
        reminderNote: 'Review budget',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
      {
        id: 'p-dismissed',
        name: 'Project Dismissed',
        status: 'In Progress',
        reminderDate: '2026-09-25',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
      {
        id: 'p-done',
        name: 'Project Done',
        status: 'Done',
        reminderDate: '2026-09-28',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    ];

    const milestones: Milestone[] = [
      {
        id: 'm-1',
        projectId: 'p-1',
        name: 'Milestone Reminder',
        status: 'Open',
        reminderDate: '2026-09-27',
        reminderNote: 'Verify deliverable',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    ];

    const tasks: Task[] = [
      {
        ...baseTask,
        id: 't-rem-1',
        name: 'Task Reminder',
        status: 'Open',
        reminderDate: '2026-09-28',
        reminderNote: 'Follow up email',
      },
      {
        ...baseTask,
        id: 't-rem-future',
        name: 'Task Future Reminder',
        status: 'Open',
        reminderDate: '2026-10-05',
      },
    ];

    const dismissedMap: Record<string, string> = {
      'reminder:project:p-dismissed': todayDate,
    };

    const result = evaluateNotifications({
      tasks,
      projects,
      milestones,
      rules: defaultRules,
      overrides: [],
      allocations: [],
      dismissedMap,
      todayDate,
    });

    const reminders = result.filter((item) => item.category === 'reminder');
    expect(reminders).toHaveLength(3); // p-1, m-1, t-rem-1

    const projReminder = reminders.find((r) => r.id === 'reminder:project:p-1');
    expect(projReminder).toBeDefined();
    expect(projReminder?.priorityOrder).toBe(5);
    expect(projReminder?.tagColor).toBe('gold');
    expect(projReminder?.canDismiss).toBe(true);
    expect(projReminder?.subtitle).toBe('Review budget');

    const mileReminder = reminders.find((r) => r.id === 'reminder:milestone:m-1');
    expect(mileReminder).toBeDefined();
    expect(mileReminder?.entityType).toBe('milestone');

    const taskReminder = reminders.find((r) => r.id === 'reminder:task:t-rem-1');
    expect(taskReminder).toBeDefined();
    expect(taskReminder?.entityType).toBe('task');
  });

  it('Test 6: Verifies unified output sorts strictly by priorityOrder ascending (1: overdue, 2: overload, 3: due-soon, 4: stale, 5: reminder) per D-05', () => {
    const projects: Project[] = [
      {
        id: 'p-1',
        name: 'Project 1',
        status: 'Open',
        reminderDate: '2026-09-28',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    ];

    const tasks: Task[] = [
      {
        ...baseTask,
        id: 't-due',
        name: 'Due Soon Task',
        deadline: todayDate,
        status: 'Open',
      },
      {
        ...baseTask,
        id: 't-overdue',
        name: 'Overdue Task',
        deadline: '2026-09-20',
        status: 'Open',
      },
      {
        ...baseTask,
        id: 't-stale',
        name: 'Stale Task',
        status: 'In Progress',
        updatedAt: '2026-09-15T00:00:00.000Z',
      },
    ];

    const allocations: PlannedAllocation[] = [
      { id: 'al-overload', taskId: 't-due', date: todayDate, allocatedMinutes: 600 },
    ];

    const result = evaluateNotifications({
      tasks,
      projects,
      milestones: [],
      rules: defaultRules,
      overrides: [],
      allocations,
      dismissedMap: {},
      todayDate,
    });

    expect(result.length).toBeGreaterThanOrEqual(5);

    // Verify ordering
    const priorityOrders = result.map((r) => r.priorityOrder);
    for (let i = 0; i < priorityOrders.length - 1; i++) {
      expect(priorityOrders[i]!).toBeLessThanOrEqual(priorityOrders[i + 1]!);
    }

    expect(result[0]?.category).toBe('overdue');
    expect(result[0]?.priorityOrder).toBe(1);

    const overloadIndex = result.findIndex((r) => r.category === 'overload');
    expect(overloadIndex).toBeGreaterThan(0);
    expect(result[overloadIndex]?.priorityOrder).toBe(2);

    const dueIndex = result.findIndex((r) => r.category === 'due-soon');
    expect(dueIndex).toBeGreaterThan(overloadIndex);
    expect(result[dueIndex]?.priorityOrder).toBe(3);

    const staleIndex = result.findIndex((r) => r.category === 'stale');
    expect(staleIndex).toBeGreaterThan(dueIndex);
    expect(result[staleIndex]?.priorityOrder).toBe(4);

    const reminderIndex = result.findIndex((r) => r.category === 'reminder');
    expect(reminderIndex).toBeGreaterThan(staleIndex);
    expect(result[reminderIndex]?.priorityOrder).toBe(5);
  });

  describe('isReminderTriggered helper (D-06, D-08, NOTIF-06)', () => {
    it('returns false when reminder has no date', () => {
      expect(isReminderTriggered({ id: '1', date: '' }, '2026-09-28', '10:00')).toBe(false);
    });

    it('returns true when reminder date is in the past (overdue reminder per D-08)', () => {
      expect(isReminderTriggered({ id: '1', date: '2026-09-27' }, '2026-09-28', '10:00')).toBe(true);
    });

    it('returns false when reminder date is in the future', () => {
      expect(isReminderTriggered({ id: '1', date: '2026-09-29' }, '2026-09-28', '10:00')).toBe(false);
    });

    it('returns true when reminder date is today without time (triggers from 00:00)', () => {
      expect(isReminderTriggered({ id: '1', date: '2026-09-28' }, '2026-09-28', '08:00')).toBe(true);
    });

    it('returns false when reminder date is today but clock has not reached time', () => {
      expect(
        isReminderTriggered({ id: '1', date: '2026-09-28', time: '14:30' }, '2026-09-28', '10:00')
      ).toBe(false);
    });

    it('returns true when reminder date is today and clock has reached or passed time', () => {
      expect(
        isReminderTriggered({ id: '1', date: '2026-09-28', time: '10:00' }, '2026-09-28', '10:00')
      ).toBe(true);
      expect(
        isReminderTriggered({ id: '1', date: '2026-09-28', time: '09:30' }, '2026-09-28', '10:00')
      ).toBe(true);
    });
  });

  describe('Multi-reminder evaluation in evaluateNotifications (D-06, D-07, NOTIF-06)', () => {
    it('evaluates multiple reminders with time and handles independent dismissals', () => {
      const taskWithReminders: Task = {
        ...baseTask,
        id: 'task-multi-rem',
        name: 'Task with Multiple Reminders',
        status: 'In Progress',
        reminders: [
          { id: 'rem-past', date: '2026-09-25', note: 'Overdue reminder' },
          { id: 'rem-today-elapsed', date: '2026-09-28', time: '09:00', note: 'Morning sync' },
          { id: 'rem-today-future', date: '2026-09-28', time: '15:00', note: 'Afternoon wrap' },
          { id: 'rem-future-day', date: '2026-10-01', time: '10:00', note: 'Next month' },
          { id: 'rem-dismissed', date: '2026-09-28', time: '08:30', note: 'Already dismissed' },
        ],
      };

      const dismissedMap: Record<string, string> = {
        'reminder:task:task-multi-rem:rem-dismissed': todayDate,
      };

      const result = evaluateNotifications({
        tasks: [taskWithReminders],
        projects: [],
        milestones: [],
        rules: defaultRules,
        overrides: [],
        allocations: [],
        dismissedMap,
        todayDate,
        currentTime: '10:00',
      });

      const reminders = result.filter((item) => item.category === 'reminder');
      // Should trigger rem-past and rem-today-elapsed
      // rem-today-future (15:00 > 10:00) does not trigger
      // rem-future-day (2026-10-01 > 2026-09-28) does not trigger
      // rem-dismissed is dismissed for today
      expect(reminders).toHaveLength(2);

      const pastRem = reminders.find((r) => r.id === 'reminder:task:task-multi-rem:rem-past');
      expect(pastRem).toBeDefined();
      expect(pastRem?.id).toMatch(/^reminder:task:[^:]+:[^:]+$/);
      expect(pastRem?.date).toBe('2026-09-25');
      expect(pastRem?.tagLabel).toBe('Nhắc nhở');
      expect(pastRem?.subtitle).toBe('Overdue reminder');

      const elapsedRem = reminders.find(
        (r) => r.id === 'reminder:task:task-multi-rem:rem-today-elapsed'
      );
      expect(elapsedRem).toBeDefined();
      expect(elapsedRem?.id).toMatch(/^reminder:task:[^:]+:[^:]+$/);
      expect(elapsedRem?.date).toBe('09:00 2026-09-28');
      expect(elapsedRem?.tagLabel).toBe('Nhắc nhở (09:00)');
      expect(elapsedRem?.subtitle).toBe('Morning sync');
    });

    it('does not trigger reminders for Done or Cancelled entities', () => {
      const doneTask: Task = {
        ...baseTask,
        id: 'task-done-rem',
        name: 'Done Task',
        status: 'Done',
        reminders: [{ id: 'rem-1', date: '2026-09-28', time: '09:00' }],
      };
      const cancelledProject: Project = {
        id: 'proj-cancelled',
        name: 'Cancelled Project',
        status: 'Cancelled',
        reminders: [{ id: 'rem-2', date: '2026-09-28' }],
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      };

      const result = evaluateNotifications({
        tasks: [doneTask],
        projects: [cancelledProject],
        milestones: [],
        rules: defaultRules,
        overrides: [],
        allocations: [],
        dismissedMap: {},
        todayDate,
        currentTime: '12:00',
      });

      const reminders = result.filter((item) => item.category === 'reminder');
      expect(reminders).toHaveLength(0);
    });
  });
});
