import { describe, it, expect } from 'vitest';
import { inspectDateCapacity } from '../../src/utils/feasibility';
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
