import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskPlannerDatabase } from '../../src/db/index';
import { initializeDatabaseDefaults } from '../../src/db/seeds';
import {
  getCapacityRules,
  updateCapacityRule,
  getCapacityOverrides,
  setCapacityOverride,
  removeCapacityOverride,
  getEffectiveCapacityForDate,
} from '../../src/db/repositories/capacityRepo';

describe('Capacity Repository (CAP-01, CAP-02, CAP-03, CAP-04, D-06, D-08)', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase('TestCapacityDB_' + Math.random().toString(36).slice(2));
    await testDb.open();
    await initializeDatabaseDefaults(testDb);
  });

  afterEach(async () => {
    await testDb.delete();
  });

  describe('Weekly Capacity Rules (CAP-01, CAP-02)', () => {
    it('returns all 7 weekday rules sorted Monday (1) to Sunday (0)', async () => {
      const rules = await getCapacityRules(testDb);
      expect(rules).toHaveLength(7);
      // Sorted Mon(1), Tue(2), Wed(3), Thu(4), Fri(5), Sat(6), Sun(0)
      expect(rules.map((r) => r.dayOfWeek)).toEqual([1, 2, 3, 4, 5, 6, 0]);

      // Seeded with 8h (480m) M-F and 0h Sa-Su
      expect(rules[0]?.workMinutes).toBe(480); // Monday
      expect(rules[4]?.workMinutes).toBe(480); // Friday
      expect(rules[5]?.workMinutes).toBe(0);   // Saturday
      expect(rules[6]?.workMinutes).toBe(0);   // Sunday
    });

    it('updates workMinutes for a weekday validating bounds (0-1440)', async () => {
      // Update Wednesday (3) to 4h (240m)
      await updateCapacityRule(3, 240, testDb);
      const rules = await getCapacityRules(testDb);
      const wed = rules.find((r) => r.dayOfWeek === 3);
      expect(wed?.workMinutes).toBe(240);

      // Rejects invalid dayOfWeek
      await expect(updateCapacityRule(7, 480, testDb)).rejects.toThrow();

      // Rejects invalid minutes
      await expect(updateCapacityRule(1, -10, testDb)).rejects.toThrow();
      await expect(updateCapacityRule(1, 1500, testDb)).rejects.toThrow();
    });
  });

  describe('Capacity Overrides (CAP-03, CAP-04, D-08)', () => {
    it('sets and gets capacity overrides with optional date range filter', async () => {
      await setCapacityOverride('2026-10-12', 0, 'Columbus Day / Indigenous Peoples Day', testDb);
      await setCapacityOverride('2026-10-15', 240, 'Half day doctor visit', testDb);
      await setCapacityOverride('2026-10-20', 600, 'Project release overtime', testDb);

      const all = await getCapacityOverrides(undefined, undefined, testDb);
      expect(all).toHaveLength(3);
      expect(all[0]?.date).toBe('2026-10-12');
      expect(all[0]?.workMinutes).toBe(0);
      expect(all[0]?.note).toBe('Columbus Day / Indigenous Peoples Day');

      // Date range filter
      const range = await getCapacityOverrides('2026-10-13', '2026-10-18', testDb);
      expect(range).toHaveLength(1);
      expect(range[0]?.date).toBe('2026-10-15');
    });

    it('upserts override when called again for the same date', async () => {
      const first = await setCapacityOverride('2026-10-12', 0, 'Leave', testDb);
      expect(first.workMinutes).toBe(0);

      const second = await setCapacityOverride('2026-10-12', 120, 'Updated to 2h', testDb);
      expect(second.workMinutes).toBe(120);
      expect(second.id).toBe(first.id);

      const all = await getCapacityOverrides(undefined, undefined, testDb);
      expect(all).toHaveLength(1);
      expect(all[0]?.workMinutes).toBe(120);
    });

    it('removes override and restores weekly default immediately (CAP-04, D-08)', async () => {
      // 2026-10-12 is Monday (weekly default: 480)
      await setCapacityOverride('2026-10-12', 0, 'Off', testDb);
      let effective = await getEffectiveCapacityForDate('2026-10-12', testDb);
      expect(effective).toBe(0);

      await removeCapacityOverride('2026-10-12', testDb);

      // Immediately falls back to weekly template (480)
      effective = await getEffectiveCapacityForDate('2026-10-12', testDb);
      expect(effective).toBe(480);

      const overrides = await getCapacityOverrides(undefined, undefined, testDb);
      expect(overrides).toHaveLength(0);
    });

    it('resolves effective capacity for Saturday with and without override', async () => {
      // 2026-10-17 is Saturday (weekly default: 0)
      const baseSat = await getEffectiveCapacityForDate('2026-10-17', testDb);
      expect(baseSat).toBe(0);

      await setCapacityOverride('2026-10-17', 300, 'Saturday sprint', testDb);
      const otSat = await getEffectiveCapacityForDate('2026-10-17', testDb);
      expect(otSat).toBe(300);
    });
  });
});
