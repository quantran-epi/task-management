import { describe, it, expect } from 'vitest';
import {
  splitSegmentByMidnight,
  aggregateTaskActualMinutesByDate,
  computeVariance,
  formatVariance,
} from '../src/utils/worklog';
import type { WorkSession } from '../src/types/models';

describe('splitSegmentByMidnight', () => {
  it('returns single interval within the same calendar day', () => {
    // 09:00 to 11:30 local time on 2026-10-01
    const start = '2026-10-01T09:00:00.000Z';
    const end = '2026-10-01T11:30:00.000Z';
    // Using local date strings depends on local execution; test using Date object midnight logic
    const results = splitSegmentByMidnight(start, end);
    expect(results.length).toBe(1);
    expect(results[0]?.minutes).toBe(150);
  });

  it('splits segment crossing local midnight into distinct calendar dates (Test 1)', () => {
    // Construct local timestamps: 23:00 on Day 1 to 01:30 on Day 2
    const d1 = new Date(2026, 9, 1, 23, 0, 0); // 2026-10-01 23:00
    const d2 = new Date(2026, 9, 2, 1, 30, 0);  // 2026-10-02 01:30

    const results = splitSegmentByMidnight(d1.toISOString(), d2.toISOString());
    expect(results).toHaveLength(2);

    expect(results[0]?.date).toBe('2026-10-01');
    expect(results[0]?.minutes).toBe(60);

    expect(results[1]?.date).toBe('2026-10-02');
    expect(results[1]?.minutes).toBe(90);
  });

  it('caps loop at 30 days to mitigate DoS on corrupted dates (T-13.1-11)', () => {
    const d1 = new Date(2026, 0, 1, 0, 0, 0);
    const d2 = new Date(2026, 11, 31, 0, 0, 0); // ~365 days
    const results = splitSegmentByMidnight(d1.toISOString(), d2.toISOString());
    expect(results.length).toBeLessThanOrEqual(30);
  });

  it('handles start >= end gracefully returning empty array', () => {
    const start = '2026-10-01T10:00:00.000Z';
    const end = '2026-10-01T09:00:00.000Z';
    expect(splitSegmentByMidnight(start, end)).toEqual([]);
  });
});

describe('aggregateTaskActualMinutesByDate', () => {
  it('aggregates sessions with segments per task and date without double counting paused intervals (Test 2)', () => {
    const s1Start = new Date(2026, 9, 1, 10, 0, 0);
    const s1End = new Date(2026, 9, 1, 10, 30, 0); // 30m

    const s2Seg1Start = new Date(2026, 9, 1, 14, 0, 0);
    const s2Seg1End = new Date(2026, 9, 1, 14, 20, 0); // 20m
    // paused 14:20 to 14:40 (20m excluded)
    const s2Seg2Start = new Date(2026, 9, 1, 14, 40, 0);
    const s2Seg2End = new Date(2026, 9, 1, 15, 0, 0); // 20m

    const sessions: WorkSession[] = [
      {
        id: 'ws-1',
        taskId: 'task-1',
        startTime: s1Start.toISOString(),
        endTime: s1End.toISOString(),
        date: '2026-10-01',
        durationMinutes: 30,
        createdAt: s1Start.toISOString(),
        updatedAt: s1End.toISOString(),
      },
      {
        id: 'ws-2',
        taskId: 'task-1',
        startTime: s2Seg1Start.toISOString(),
        endTime: s2Seg2End.toISOString(),
        date: '2026-10-01',
        durationMinutes: 40,
        segments: [
          { startTime: s2Seg1Start.toISOString(), endTime: s2Seg1End.toISOString() },
          { startTime: s2Seg2Start.toISOString(), endTime: s2Seg2End.toISOString() },
        ],
        createdAt: s2Seg1Start.toISOString(),
        updatedAt: s2Seg2End.toISOString(),
      },
    ];

    const result = aggregateTaskActualMinutesByDate(sessions);
    const task1Map = result.get('task-1');
    expect(task1Map).toBeDefined();
    // 30m from ws-1 + (20m + 20m) from ws-2 = 70m
    expect(task1Map?.get('2026-10-01')).toBe(70);
  });

  it('aggregates multi-day segments correctly across dates', () => {
    const s1 = new Date(2026, 9, 1, 23, 30, 0);
    const s2 = new Date(2026, 9, 2, 0, 45, 0);

    const sessions: WorkSession[] = [
      {
        id: 'ws-cross',
        taskId: 'task-2',
        startTime: s1.toISOString(),
        endTime: s2.toISOString(),
        date: '2026-10-01',
        durationMinutes: 75,
        segments: [{ startTime: s1.toISOString(), endTime: s2.toISOString() }],
        createdAt: s1.toISOString(),
        updatedAt: s2.toISOString(),
      },
    ];

    const result = aggregateTaskActualMinutesByDate(sessions);
    const taskMap = result.get('task-2');
    expect(taskMap?.get('2026-10-01')).toBe(30);
    expect(taskMap?.get('2026-10-02')).toBe(45);
  });
});

describe('computeVariance', () => {
  it('returns positive variance with warning status when actual > planned (Test 3)', () => {
    const res = computeVariance(150, 120);
    expect(res.varianceMinutes).toBe(30);
    expect(res.isOver).toBe(true);
    expect(res.status).toBe('warning');
    expect(res.formatted).toBe('+30m');
  });

  it('returns zero variance with neutral status when actual === planned', () => {
    const res = computeVariance(120, 120);
    expect(res.varianceMinutes).toBe(0);
    expect(res.isOver).toBe(false);
    expect(res.status).toBe('neutral');
    expect(res.formatted).toBe('0m');
  });

  it('returns negative variance with neutral status when actual < planned', () => {
    const res = computeVariance(90, 120);
    expect(res.varianceMinutes).toBe(-30);
    expect(res.isOver).toBe(false);
    expect(res.status).toBe('neutral');
    expect(res.formatted).toBe('-30m');
  });

  it('formats variance with hours and minutes properly', () => {
    const res = computeVariance(210, 60); // +150m = +2h30m
    expect(res.varianceMinutes).toBe(150);
    expect(res.formatted).toBe('+2h30m');
  });

  it('handles planned = 0 and actual > 0 (Test 4)', () => {
    const res = computeVariance(45, 0);
    expect(res.varianceMinutes).toBe(45);
    expect(res.isOver).toBe(true);
    expect(res.status).toBe('warning');
    expect(res.formatted).toBe('+45m');
  });
});
