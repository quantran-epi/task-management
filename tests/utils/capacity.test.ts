import { describe, it, expect } from 'vitest';
import {
  CapacityRuleInputSchema,
  CapacityOverrideInputSchema,
  PlannedAllocationInputSchema,
} from '../../src/validation/schemas';
import {
  getEffectiveDailyCapacity,
  calculateDayMetrics,
} from '../../src/utils/capacity';
import type { CapacityRule, CapacityOverride } from '../../src/types/models';

describe('Capacity Schemas & Calculation Engine (CAP-01, CAP-02, CAP-03, CAP-04, D-13, D-14, D-17)', () => {
  describe('CapacityRuleInputSchema', () => {
    it('accepts valid weekday (0-6) and workMinutes (0-1440)', () => {
      const valid = CapacityRuleInputSchema.parse({ dayOfWeek: 1, workMinutes: 480 });
      expect(valid.dayOfWeek).toBe(1);
      expect(valid.workMinutes).toBe(480);
    });

    it('rejects invalid dayOfWeek and out-of-range workMinutes', () => {
      expect(() => CapacityRuleInputSchema.parse({ dayOfWeek: 7, workMinutes: 480 })).toThrow();
      expect(() => CapacityRuleInputSchema.parse({ dayOfWeek: -1, workMinutes: 480 })).toThrow();
      expect(() => CapacityRuleInputSchema.parse({ dayOfWeek: 1.5, workMinutes: 480 })).toThrow();
      expect(() => CapacityRuleInputSchema.parse({ dayOfWeek: 1, workMinutes: -1 })).toThrow();
      expect(() => CapacityRuleInputSchema.parse({ dayOfWeek: 1, workMinutes: 1441 })).toThrow();
    });
  });

  describe('CapacityOverrideInputSchema', () => {
    it('accepts valid date, workMinutes, and optional note', () => {
      const valid = CapacityOverrideInputSchema.parse({
        date: '2026-10-15',
        workMinutes: 240,
        note: 'Half-day doctor visit',
      });
      expect(valid.date).toBe('2026-10-15');
      expect(valid.workMinutes).toBe(240);
      expect(valid.note).toBe('Half-day doctor visit');
    });

    it('rejects invalid calendar dates and notes longer than 200 chars', () => {
      expect(() =>
        CapacityOverrideInputSchema.parse({ date: '2026-02-31', workMinutes: 0 })
      ).toThrow();
      expect(() =>
        CapacityOverrideInputSchema.parse({
          date: '2026-10-15',
          workMinutes: 0,
          note: 'a'.repeat(201),
        })
      ).toThrow();
      expect(() =>
        CapacityOverrideInputSchema.parse({ date: '2026-10-15', workMinutes: -5 })
      ).toThrow();
    });
  });

  describe('PlannedAllocationInputSchema', () => {
    it('accepts valid taskId, date, and allocatedMinutes', () => {
      const valid = PlannedAllocationInputSchema.parse({
        taskId: '123e4567-e89b-42d3-a456-426614174000',
        date: '2026-10-15',
        allocatedMinutes: 60,
      });
      expect(valid.allocatedMinutes).toBe(60);
    });

    it('rejects allocatedMinutes < 1 or > 1440', () => {
      expect(() =>
        PlannedAllocationInputSchema.parse({
          taskId: '123e4567-e89b-42d3-a456-426614174000',
          date: '2026-10-15',
          allocatedMinutes: 0,
        })
      ).toThrow();
      expect(() =>
        PlannedAllocationInputSchema.parse({
          taskId: '123e4567-e89b-42d3-a456-426614174000',
          date: '2026-10-15',
          allocatedMinutes: 1441,
        })
      ).toThrow();
    });
  });

  describe('getEffectiveDailyCapacity', () => {
    const rules: CapacityRule[] = [
      { id: '1', dayOfWeek: 1, workMinutes: 480 }, // Monday
      { id: '2', dayOfWeek: 2, workMinutes: 480 },
      { id: '3', dayOfWeek: 3, workMinutes: 480 },
      { id: '4', dayOfWeek: 4, workMinutes: 480 },
      { id: '5', dayOfWeek: 5, workMinutes: 480 },
      { id: '6', dayOfWeek: 6, workMinutes: 0 },   // Saturday
      { id: '7', dayOfWeek: 0, workMinutes: 0 },   // Sunday
    ];

    it('returns override minutes when date override exists (CAP-03, CAP-04)', () => {
      const overrides: CapacityOverride[] = [
        { id: 'o1', date: '2026-10-12', workMinutes: 0, note: 'Holiday' }, // 2026-10-12 is Monday
      ];
      // Monday default is 480, but override is 0
      const cap = getEffectiveDailyCapacity('2026-10-12', rules, overrides);
      expect(cap).toBe(0);

      const overtimeOverride: CapacityOverride[] = [
        { id: 'o2', date: '2026-10-17', workMinutes: 240, note: 'Saturday OT' }, // 2026-10-17 is Saturday
      ];
      // Saturday default is 0, but override is 240
      const otCap = getEffectiveDailyCapacity('2026-10-17', rules, overtimeOverride);
      expect(otCap).toBe(240);
    });

    it('falls back to weekly template rule when no override exists (CAP-04)', () => {
      // 2026-10-12 is a Monday (dayOfWeek = 1)
      const cap = getEffectiveDailyCapacity('2026-10-12', rules, []);
      expect(cap).toBe(480);

      // 2026-10-18 is a Sunday (dayOfWeek = 0)
      const sunCap = getEffectiveDailyCapacity('2026-10-18', rules, []);
      expect(sunCap).toBe(0);
    });

    it('returns 0 when no override and no matching rule exists', () => {
      const emptyRules: CapacityRule[] = [];
      const cap = getEffectiveDailyCapacity('2026-10-12', emptyRules, []);
      expect(cap).toBe(0);
    });
  });

  describe('calculateDayMetrics', () => {
    it('returns no-capacity state when capacity is 0 and active allocations is 0', () => {
      const metrics = calculateDayMetrics('2026-10-18', 0, 0, 0, 0);
      expect(metrics.loadState).toBe('no-capacity');
      expect(metrics.percent).toBe(0);
      expect(metrics.isOverloaded).toBe(false);
      expect(metrics.netBalanceMinutes).toBe(0);
    });

    it('returns overloaded state when capacity is 0 but active allocations > 0', () => {
      const metrics = calculateDayMetrics('2026-10-18', 0, 60, 0, 1);
      expect(metrics.loadState).toBe('overloaded');
      expect(metrics.percent).toBe(100);
      expect(metrics.isOverloaded).toBe(true);
      expect(metrics.netBalanceMinutes).toBe(-60);
    });

    it('returns available state when allocation < 80% of capacity', () => {
      // 480m capacity, 360m allocated = 75%
      const metrics = calculateDayMetrics('2026-10-12', 480, 360, 0, 3);
      expect(metrics.loadState).toBe('available');
      expect(metrics.percent).toBe(75);
      expect(metrics.isOverloaded).toBe(false);
      expect(metrics.netBalanceMinutes).toBe(120);
    });

    it('returns busy state when allocation is between 80% and 100% of capacity', () => {
      // 480m capacity, 400m allocated = 83.33% -> 83%
      const metrics = calculateDayMetrics('2026-10-12', 480, 400, 0, 3);
      expect(metrics.loadState).toBe('busy');
      expect(metrics.percent).toBe(83);
      expect(metrics.isOverloaded).toBe(false);
      expect(metrics.netBalanceMinutes).toBe(80);

      // Exactly 100% (480 / 480)
      const exact = calculateDayMetrics('2026-10-12', 480, 480, 0, 4);
      expect(exact.loadState).toBe('busy');
      expect(exact.percent).toBe(100);
      expect(exact.isOverloaded).toBe(false);
      expect(exact.netBalanceMinutes).toBe(0);
    });

    it('returns overloaded state when allocation exceeds 100% of capacity', () => {
      // 480m capacity, 540m allocated = 112.5% -> 113%
      const metrics = calculateDayMetrics('2026-10-12', 480, 540, 0, 4);
      expect(metrics.loadState).toBe('overloaded');
      expect(metrics.percent).toBe(113);
      expect(metrics.isOverloaded).toBe(true);
      expect(metrics.netBalanceMinutes).toBe(-60);
    });

    it('flags high context switching when active task count exceeds threshold', () => {
      // Default threshold is 4
      const normal = calculateDayMetrics('2026-10-12', 480, 240, 0, 4);
      expect(normal.isHighContextSwitching).toBe(false);

      const high = calculateDayMetrics('2026-10-12', 480, 240, 0, 5);
      expect(high.isHighContextSwitching).toBe(true);

      // Custom threshold
      const custom = calculateDayMetrics('2026-10-12', 480, 240, 0, 3, 2);
      expect(custom.isHighContextSwitching).toBe(true);
    });
  });
});
