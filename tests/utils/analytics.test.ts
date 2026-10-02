import { describe, it, expect } from 'vitest';
import {
  aggregateEstimateVsActual,
  aggregateWorkTypeBreakdown,
  aggregateProductivityHeatmap,
  calculateWorkTypeAccuracy,
  filterSessionsByPeriod,
} from '../../src/utils/analytics';
import type { Task, WorkSession } from '../../src/types/models';

describe('analytics utilities', () => {
  const mockTasks: Task[] = [
    {
      id: 'task-1',
      name: 'Viết tài liệu API',
      status: 'In Progress',
      priority: 'High',
      progress: 50,
      estimateMinutes: 120, // 2h
      workType: 'document',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    },
    {
      id: 'task-2',
      name: 'Lập trình tính năng đăng nhập',
      status: 'Done',
      priority: 'Urgent',
      progress: 100,
      estimateMinutes: 180, // 3h
      workType: 'code',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    },
    {
      id: 'task-3',
      name: 'Task không có estimate và session',
      status: 'Open',
      priority: 'Low',
      progress: 0,
      estimateMinutes: 0,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    },
  ];

  const mockSessions: WorkSession[] = [
    {
      id: 's-1',
      taskId: 'task-1',
      date: '2026-10-02',
      startTime: '2026-10-02T09:00:00.000Z',
      endTime: '2026-10-02T10:30:00.000Z',
      durationMinutes: 90, // 1.5h
      createdAt: '2026-10-02T10:30:00.000Z',
      updatedAt: '2026-10-02T10:30:00.000Z',
    },
    {
      id: 's-2',
      taskId: 'task-2',
      date: '2026-10-02',
      startTime: '2026-10-02T13:00:00.000Z',
      endTime: '2026-10-02T16:00:00.000Z',
      durationMinutes: 180, // 3h
      createdAt: '2026-10-02T16:00:00.000Z',
      updatedAt: '2026-10-02T16:00:00.000Z',
    },
    {
      id: 's-3',
      taskId: 'task-1',
      date: '2026-09-20', // older than 7d
      startTime: '2026-09-20T10:00:00.000Z',
      durationMinutes: 60,
      createdAt: '2026-09-20T11:00:00.000Z',
      updatedAt: '2026-09-20T11:00:00.000Z',
    },
  ];

  it('aggregates estimate vs actual correctly', () => {
    const data = aggregateEstimateVsActual(mockTasks, mockSessions);
    // Task 3 with 0 estimate and 0 actual is excluded
    expect(data.length).toBe(4);

    const task1Est = data.find((d) => d.task === 'Viết tài liệu API' && d.type === 'Ước tính (giờ)');
    const task1Act = data.find((d) => d.task === 'Viết tài liệu API' && d.type === 'Thực tế (giờ)');
    expect(task1Est?.hours).toBe(2);
    expect(task1Act?.hours).toBe(2.5); // 90m + 60m = 150m = 2.5h

    const task2Est = data.find((d) => d.task === 'Lập trình tính năng đăng nhập' && d.type === 'Ước tính (giờ)');
    const task2Act = data.find((d) => d.task === 'Lập trình tính năng đăng nhập' && d.type === 'Thực tế (giờ)');
    expect(task2Est?.hours).toBe(3);
    expect(task2Act?.hours).toBe(3);
  });

  it('aggregates work type breakdown correctly', () => {
    const breakdown = aggregateWorkTypeBreakdown(mockTasks, mockSessions);
    expect(breakdown.length).toBe(2);
    // task-2: code (180 mins), task-1: document (150 mins)
    expect(breakdown[0]?.type).toBe('Lập trình');
    expect(breakdown[0]?.minutes).toBe(180);
    expect(breakdown[0]?.hours).toBe(3);

    expect(breakdown[1]?.type).toBe('Tài liệu');
    expect(breakdown[1]?.minutes).toBe(150);
    expect(breakdown[1]?.hours).toBe(2.5);
  });

  it('aggregates productivity heatmap with only active cells', () => {
    const heatmap = aggregateProductivityHeatmap(mockSessions);
    // Only non-zero cells returned
    expect(heatmap.length).toBeGreaterThan(0);
    expect(heatmap.every((h) => h.minutes > 0)).toBe(true);
  });

  it('excludes items with 0 hours in estimate vs actual', () => {
    const taskOnlyEstimate: Task = {
      id: 'task-no-work',
      name: 'Task chưa làm',
      status: 'Open',
      priority: 'Low',
      progress: 0,
      estimateMinutes: 60,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    };
    const data = aggregateEstimateVsActual([taskOnlyEstimate], []);
    // Only estimate item, no 0-hour actual item
    expect(data.length).toBe(1);
    expect(data[0]?.type).toBe('Ước tính (giờ)');
    expect(data[0]?.hours).toBe(1);
  });

  it('filters sessions by period correctly', () => {
    const refDate = '2026-10-02';
    const last7d = filterSessionsByPeriod(mockSessions, '7d', refDate);
    expect(last7d.length).toBe(2); // s-1 and s-2
    expect(last7d.map((s) => s.id)).toEqual(['s-1', 's-2']);

    const all = filterSessionsByPeriod(mockSessions, 'all', refDate);
    expect(all.length).toBe(3);
  });

  describe('calculateWorkTypeAccuracy', () => {
    it('calculates estimation accuracy and bias per workType correctly', () => {
      const summary = calculateWorkTypeAccuracy(mockTasks, mockSessions, 'all');

      expect(summary.items.length).toBe(2);

      // Code: est 3h (180m), act 3h (180m) -> accurate
      const codeItem = summary.items.find((i) => i.workType === 'code');
      expect(codeItem).toBeDefined();
      expect(codeItem?.workTypeLabel).toBe('Lập trình');
      expect(codeItem?.estimateHours).toBe(3);
      expect(codeItem?.actualHours).toBe(3);
      expect(codeItem?.varianceHours).toBe(0);
      expect(codeItem?.variancePercent).toBe(0);
      expect(codeItem?.bias).toBe('accurate');
      expect(codeItem?.biasLabel).toContain('Chuẩn xác');
      expect(codeItem?.accuracyPercent).toBe(100);

      // Document: est 2h (120m), act 2.5h (150m) -> underestimate (actual > est)
      const docItem = summary.items.find((i) => i.workType === 'document');
      expect(docItem).toBeDefined();
      expect(docItem?.workTypeLabel).toBe('Tài liệu');
      expect(docItem?.estimateHours).toBe(2);
      expect(docItem?.actualHours).toBe(2.5);
      expect(docItem?.varianceHours).toBe(0.5);
      expect(docItem?.variancePercent).toBe(25);
      expect(docItem?.bias).toBe('underestimate');
      expect(docItem?.biasLabel).toContain('Ước tính non');
      expect(docItem?.accuracyPercent).toBe(80); // 2 / 2.5 = 80%

      // Chart data contains both estimate and actual items
      expect(summary.chartData.length).toBe(4);
      expect(summary.chartData.some((c) => c.workType === 'Lập trình' && c.type === 'Ước tính (giờ)')).toBe(true);

      // Insight tip should be populated
      expect(summary.insightTip.length).toBeGreaterThan(10);
    });

    it('identifies overestimate bias when actual is significantly less than estimate', () => {
      const overTasks: Task[] = [
        {
          id: 'task-over',
          name: 'Task dự tính già',
          status: 'Done',
          priority: 'Medium',
          progress: 100,
          estimateMinutes: 300, // 5h
          workType: 'configuration',
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z',
        },
      ];
      const overSessions: WorkSession[] = [
        {
          id: 's-over',
          taskId: 'task-over',
          date: '2026-10-02',
          startTime: '2026-10-02T10:00:00.000Z',
          durationMinutes: 120, // 2h
          createdAt: '2026-10-02T12:00:00.000Z',
          updatedAt: '2026-10-02T12:00:00.000Z',
        },
      ];

      const summary = calculateWorkTypeAccuracy(overTasks, overSessions, 'all');
      expect(summary.items.length).toBe(1);
      const item = summary.items[0];
      expect(item?.bias).toBe('overestimate');
      expect(item?.biasLabel).toContain('Ước tính già');
      expect(item?.variancePercent).toBe(-60); // (2 - 5) / 5 = -60%
      expect(item?.accuracyPercent).toBe(40); // 2 / 5 = 40%
      expect(summary.insightTip).toContain('ước tính già');
    });

    it('handles tasks without actual sessions or without estimate', () => {
      const mixedTasks: Task[] = [
        {
          id: 't-no-actual',
          name: 'Task chưa làm',
          status: 'Open',
          priority: 'Low',
          progress: 0,
          estimateMinutes: 60,
          workType: 'investigate',
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z',
        },
        {
          id: 't-no-est',
          name: 'Task không estimate',
          status: 'Done',
          priority: 'Low',
          progress: 100,
          estimateMinutes: 0,
          workType: 'meeting',
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z',
        },
      ];
      const mixedSessions: WorkSession[] = [
        {
          id: 's-mix',
          taskId: 't-no-est',
          date: '2026-10-02',
          startTime: '2026-10-02T10:00:00.000Z',
          durationMinutes: 60,
          createdAt: '2026-10-02T10:00:00.000Z',
          updatedAt: '2026-10-02T10:00:00.000Z',
        },
      ];

      const summary = calculateWorkTypeAccuracy(mixedTasks, mixedSessions, 'all');
      const invItem = summary.items.find((i) => i.workType === 'investigate');
      expect(invItem?.bias).toBe('no_actual');

      const meetItem = summary.items.find((i) => i.workType === 'meeting');
      expect(meetItem?.bias).toBe('no_estimate');
    });
  });
});

