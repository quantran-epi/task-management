import { describe, it, expect } from 'vitest';
import {
  inspectDateCapacity,
  findEarliestFeasibleDate,
} from '../../src/utils/feasibility';
import type { CapacityRule, CapacityOverride } from '../../src/types/models';

describe('Feasibility Engine - Date Capacity Inspection (CALC-01, CALC-02, CALC-04)', () => {
  const baseRules: CapacityRule[] = [
    { id: '1', dayOfWeek: 1, workMinutes: 480 }, // Mon: 8h
    { id: '2', dayOfWeek: 2, workMinutes: 480 }, // Tue: 8h
    { id: '3', dayOfWeek: 3, workMinutes: 480 }, // Wed: 8h
    { id: '4', dayOfWeek: 4, workMinutes: 480 }, // Thu: 8h
    { id: '5', dayOfWeek: 5, workMinutes: 480 }, // Fri: 8h
    { id: '6', dayOfWeek: 6, workMinutes: 0 },   // Sat: 0h
    { id: '7', dayOfWeek: 0, workMinutes: 0 },   // Sun: 0h
  ];

  const today = '2026-10-12'; // Monday

  it('CALC-01: inspectDateCapacity returns "excluded-past" when date < today', () => {
    // 2026-10-11 is Sunday before today
    const item = inspectDateCapacity('2026-10-11', today, 'task-1', baseRules, [], 0);
    expect(item.status).toBe('excluded-past');
    expect(item.date).toBe('2026-10-11');
    expect(item.dayOfWeek).toBe(0);
  });

  it('CALC-02: inspectDateCapacity returns "excluded-non-working" when effectiveCapacityMinutes === 0', () => {
    // 2026-10-17 is Saturday (0h by rule)
    const item = inspectDateCapacity('2026-10-17', today, 'task-1', baseRules, [], 0);
    expect(item.status).toBe('excluded-non-working');
    expect(item.capacityMinutes).toBe(0);
    expect(item.netBalanceMinutes).toBe(0);

    // 2026-10-13 is Tuesday (480m) but overridden to 0m (leave)
    const leaveOverride: CapacityOverride[] = [
      { id: 'o1', date: '2026-10-13', workMinutes: 0, note: 'Holiday' },
    ];
    const holidayItem = inspectDateCapacity('2026-10-13', today, 'task-1', baseRules, leaveOverride, 0);
    expect(holidayItem.status).toBe('excluded-non-working');
    expect(holidayItem.capacityMinutes).toBe(0);
  });

  it('CALC-02: inspectDateCapacity subtracts other tasks active load without double-counting', () => {
    // 2026-10-14 is Wednesday (480m capacity). Other tasks active load = 180m.
    const item = inspectDateCapacity('2026-10-14', today, 'task-1', baseRules, [], 180);
    expect(item.capacityMinutes).toBe(480);
    expect(item.activeLoadMinutes).toBe(180);
    expect(item.netBalanceMinutes).toBe(300);
    expect(item.status).toBe('available');
  });

  it('CALC-04: inspectDateCapacity classifies status as "full" when netBalance === 0', () => {
    // 2026-10-14 is Wednesday (480m capacity). Other tasks active load = 480m.
    const item = inspectDateCapacity('2026-10-14', today, 'task-1', baseRules, [], 480);
    expect(item.netBalanceMinutes).toBe(0);
    expect(item.status).toBe('full');
  });

  it('CALC-04: inspectDateCapacity classifies status as "overloaded" when activeLoad > capacity', () => {
    // 2026-10-14 is Wednesday (480m capacity). Other tasks active load = 540m.
    const item = inspectDateCapacity('2026-10-14', today, 'task-1', baseRules, [], 540);
    expect(item.netBalanceMinutes).toBe(0); // net balance clamped to Math.max(0, capacity - load)
    expect(item.status).toBe('overloaded');
  });
});

describe('Feasibility Engine - Earliest Feasible Date Projection (CALC-03, T-04-01, D-09)', () => {
  const baseRules: CapacityRule[] = [
    { id: '1', dayOfWeek: 1, workMinutes: 480 }, // Mon: 8h
    { id: '2', dayOfWeek: 2, workMinutes: 480 }, // Tue: 8h
    { id: '3', dayOfWeek: 3, workMinutes: 480 }, // Wed: 8h
    { id: '4', dayOfWeek: 4, workMinutes: 480 }, // Thu: 8h
    { id: '5', dayOfWeek: 5, workMinutes: 480 }, // Fri: 8h
    { id: '6', dayOfWeek: 6, workMinutes: 0 },   // Sat: 0h
    { id: '7', dayOfWeek: 0, workMinutes: 0 },   // Sun: 0h
  ];

  it('CALC-03: returns startDate immediately when requiredMinutes <= 0', () => {
    const result = findEarliestFeasibleDate('2026-10-12', 0, baseRules, [], () => 0);
    expect(result).toBe('2026-10-12');
  });

  it('CALC-03: projects earliest feasible date across working days', () => {
    // Starting Mon 2026-10-12 (480m). Need 1000m.
    // Mon 10-12: 480m accumulated (520m left)
    // Tue 10-13: 480m accumulated (40m left)
    // Wed 10-14: 480m accumulated (completed! total accumulated 1440 >= 1000)
    const result = findEarliestFeasibleDate('2026-10-12', 1000, baseRules, [], () => 0);
    expect(result).toBe('2026-10-14');
  });

  it('CALC-03: skips non-working days and accounts for other tasks active load', () => {
    // Starting Fri 2026-10-16. Need 600m.
    // Fri 10-16: 480m cap, otherLoad = 200m -> 280m available (accumulated 280m)
    // Sat 10-17: 0m cap -> 0m available
    // Sun 10-18: 0m cap -> 0m available
    // Mon 10-19: 480m cap, otherLoad = 0m -> 480m available (accumulated 760m >= 600m)
    const getOtherLoad = (date: string) => (date === '2026-10-16' ? 200 : 0);
    const result = findEarliestFeasibleDate('2026-10-16', 600, baseRules, [], getOtherLoad);
    expect(result).toBe('2026-10-19');
  });

  it('T-04-01: caps forward projection at maxHorizonDays (default 365) and returns undefined on timeout', () => {
    // Zero capacity on all days
    const zeroRules: CapacityRule[] = [
      { id: '1', dayOfWeek: 1, workMinutes: 0 },
      { id: '2', dayOfWeek: 2, workMinutes: 0 },
      { id: '3', dayOfWeek: 3, workMinutes: 0 },
      { id: '4', dayOfWeek: 4, workMinutes: 0 },
      { id: '5', dayOfWeek: 5, workMinutes: 0 },
      { id: '6', dayOfWeek: 6, workMinutes: 0 },
      { id: '7', dayOfWeek: 0, workMinutes: 0 },
    ];
    const result = findEarliestFeasibleDate('2026-10-12', 480, zeroRules, [], () => 0);
    expect(result).toBeUndefined();
  });

  it('T-04-01: respects custom maxHorizonDays parameter', () => {
    // Needs 2 days of work (960m), but horizon is only 1 day
    const result = findEarliestFeasibleDate('2026-10-12', 960, baseRules, [], () => 0, 1);
    expect(result).toBeUndefined();
  });
});
