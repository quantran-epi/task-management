import { describe, it, expect } from 'vitest';
import {
  aggregateEstimateVsActual,
  aggregateWorkTypeBreakdown,
  aggregateProductivityHeatmap,
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

  it('aggregates productivity heatmap with 7x24 grid', () => {
    const heatmap = aggregateProductivityHeatmap(mockSessions);
    expect(heatmap.length).toBe(7 * 24); // 168 cells
    const nonZero = heatmap.filter((h) => h.minutes > 0);
    expect(nonZero.length).toBeGreaterThan(0);
  });

  it('filters sessions by period correctly', () => {
    const refDate = '2026-10-02';
    const last7d = filterSessionsByPeriod(mockSessions, '7d', refDate);
    expect(last7d.length).toBe(2); // s-1 and s-2
    expect(last7d.map((s) => s.id)).toEqual(['s-1', 's-2']);

    const all = filterSessionsByPeriod(mockSessions, 'all', refDate);
    expect(all.length).toBe(3);
  });
});
