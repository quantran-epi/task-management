import { describe, it, expect } from 'vitest';
import {
  inspectDateCapacity,
  findEarliestFeasibleDate,
  distributeBalancedSpread,
  distributeFrontLoad,
  distributeGreedyFill,
  evaluateTaskFeasibility,
} from '../../src/utils/feasibility';
import type { CapacityRule, CapacityOverride, Task, PlannedAllocation } from '../../src/types/models';

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

describe('Feasibility Engine - Workload Distribution Algorithms (CALC-05, D-05, D-06, D-07)', () => {
  it('distributeBalancedSpread: allocates 15m quanta favoring lowest load ratio and breaks ties with earlier dates', () => {
    // 3 days, each 480m capacity, 0 active load. Total 90m to distribute.
    const eligibleDays = [
      { date: '2026-10-12', capacityMinutes: 480, activeLoad: 0, maxMinutes: 480 },
      { date: '2026-10-13', capacityMinutes: 480, activeLoad: 0, maxMinutes: 480 },
      { date: '2026-10-14', capacityMinutes: 480, activeLoad: 0, maxMinutes: 480 },
    ];
    // With 90m and 15m quantum (6 quanta):
    // Quanta 1 -> 10-12 (tie broken by date)
    // Quanta 2 -> 10-13 (10-12 has 15/480 load, 10-13 and 10-14 have 0/480)
    // Quanta 3 -> 10-14
    // Quanta 4 -> 10-12
    // Quanta 5 -> 10-13
    // Quanta 6 -> 10-14
    // Each day gets 30m.
    const result = distributeBalancedSpread(eligibleDays, 90);
    expect(result.get('2026-10-12')).toBe(30);
    expect(result.get('2026-10-13')).toBe(30);
    expect(result.get('2026-10-14')).toBe(30);
  });

  it('distributeBalancedSpread: respects different initial active loads', () => {
    // Day 1 has 240m active load, Day 2 has 0m active load. 120m to distribute.
    const eligibleDays = [
      { date: '2026-10-12', capacityMinutes: 480, activeLoad: 240, maxMinutes: 240 },
      { date: '2026-10-13', capacityMinutes: 480, activeLoad: 0, maxMinutes: 480 },
    ];
    // Day 2 has 0% load initially vs Day 1 at 50%.
    // All 120m goes to Day 2 because even at 120m, Day 2 load is 120/480 = 25% < 50%.
    const result = distributeBalancedSpread(eligibleDays, 120);
    expect(result.get('2026-10-12')).toBe(0);
    expect(result.get('2026-10-13')).toBe(120);
  });

  it('distributeBalancedSpread: consolidates non-quantum remainder (<15m) into first eligible day with capacity (D-07)', () => {
    const eligibleDays = [
      { date: '2026-10-12', capacityMinutes: 480, activeLoad: 0, maxMinutes: 480 },
      { date: '2026-10-13', capacityMinutes: 480, activeLoad: 0, maxMinutes: 480 },
    ];
    // 37 minutes: 2 quanta of 15m (30m) + 7m remainder.
    // 15m to 10-12, 15m to 10-13.
    // Remainder 7m consolidated into first eligible day with room: 10-12.
    // 10-12: 22m, 10-13: 15m.
    const result = distributeBalancedSpread(eligibleDays, 37);
    expect(result.get('2026-10-12')).toBe(22);
    expect(result.get('2026-10-13')).toBe(15);
  });

  it('distributeFrontLoad: fills from earliest date forward up to maxMinutes', () => {
    const eligibleDays = [
      { date: '2026-10-12', capacityMinutes: 480, activeLoad: 120, maxMinutes: 200 },
      { date: '2026-10-13', capacityMinutes: 480, activeLoad: 0, maxMinutes: 480 },
    ];
    // 300 minutes to distribute.
    // Day 1 can take at most 200m -> takes 200m.
    // Day 2 takes remaining 100m.
    const result = distributeFrontLoad(eligibleDays, 300);
    expect(result.get('2026-10-12')).toBe(200);
    expect(result.get('2026-10-13')).toBe(100);
  });

  it('distributeGreedyFill: fills lowest-load days completely to minimize active days', () => {
    // 3 days: Day 1 (load 0.5), Day 2 (load 0.1), Day 3 (load 0.3).
    // Greedy fill sorts by initial load ascending: Day 2 (0.1), Day 3 (0.3), Day 1 (0.5).
    // Fills Day 2 completely first, then Day 3, etc.
    const eligibleDays = [
      { date: '2026-10-12', capacityMinutes: 400, activeLoad: 200, maxMinutes: 200 }, // 50% load
      { date: '2026-10-13', capacityMinutes: 400, activeLoad: 40, maxMinutes: 360 },  // 10% load
      { date: '2026-10-14', capacityMinutes: 400, activeLoad: 120, maxMinutes: 280 }, // 30% load
    ];
    // Distribute 400m:
    // Day 2 (lowest load) gets filled up to maxMinutes (360m).
    // Day 3 (next lowest load) gets remaining 40m.
    // Day 1 gets 0m.
    const result = distributeGreedyFill(eligibleDays, 400);
    expect(result.get('2026-10-13')).toBe(360);
    expect(result.get('2026-10-14')).toBe(40);
    expect(result.get('2026-10-12')).toBe(0);
  });
});

describe('Feasibility Engine - Master Evaluator (CALC-01 through CALC-05, D-01 through D-09)', () => {
  const baseRules: CapacityRule[] = [
    { id: '1', dayOfWeek: 1, workMinutes: 480 }, // Mon: 8h
    { id: '2', dayOfWeek: 2, workMinutes: 480 }, // Tue: 8h
    { id: '3', dayOfWeek: 3, workMinutes: 480 }, // Wed: 8h
    { id: '4', dayOfWeek: 4, workMinutes: 480 }, // Thu: 8h
    { id: '5', dayOfWeek: 5, workMinutes: 480 }, // Fri: 8h
    { id: '6', dayOfWeek: 6, workMinutes: 0 },   // Sat: 0h
    { id: '7', dayOfWeek: 0, workMinutes: 0 },   // Sun: 0h
  ];

  const sampleTask: Task = {
    id: 'task-100',
    name: 'Implement OAuth authentication',
    status: 'In Progress',
    priority: 'High',
    progress: 25,
    estimateMinutes: 600, // 10h
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  };

  it('CALC-01 & CALC-03: returns feasible with surplus when range has enough capacity', () => {
    // 2 existing allocations for this task: 120m on Mon 10-12
    const existingTaskAllocations: PlannedAllocation[] = [
      { id: 'a1', taskId: 'task-100', date: '2026-10-12', allocatedMinutes: 120 },
    ];
    // Remaining unallocated = 600 - 120 = 480m.
    // Mon 10-12 to Wed 10-14:
    // Mon 10-12: 480m cap, existingTask 120m. Other tasks = 0m. Available for candidate = 480 - 120 - 0 = 360m.
    // Tue 10-13: 480m cap, available = 480m.
    // Wed 10-14: 480m cap, available = 480m.
    // Total available = 360 + 480 + 480 = 1320m >= 480m. Feasible!
    const result = evaluateTaskFeasibility({
      task: sampleTask,
      existingTaskAllocations,
      startDate: '2026-10-12',
      endDate: '2026-10-14',
      rules: baseRules,
      overrides: [],
      activeAllocationsByDate: {},
      today: '2026-10-12',
      strategy: 'balanced-spread',
    });

    expect(result.isFeasible).toBe(true);
    expect(result.remainingTaskEstimateMinutes).toBe(480);
    expect(result.totalAvailableNetMinutes).toBe(1320);
    expect(result.surplusMinutes).toBe(840); // 1320 - 480
    expect(result.deficitMinutes).toBe(0);
    expect(result.candidateAllocations.length).toBeGreaterThan(0);

    // Existing allocation is reflected in candidate allocation for 2026-10-12
    const day1Candidate = result.candidateAllocations.find((c) => c.date === '2026-10-12');
    expect(day1Candidate?.existingAllocatedMinutes).toBe(120);
    expect(day1Candidate?.totalResultingMinutes).toBe(
      120 + (day1Candidate?.proposedAllocatedMinutes ?? 0)
    );
  });

  it('CALC-03: returns infeasible with deficit and calculates earliestFeasibleDate when range is short', () => {
    // Remaining unallocated = 600m.
    // Range is only Mon 10-12 (480m capacity). Available = 480m < 600m.
    const result = evaluateTaskFeasibility({
      task: sampleTask,
      existingTaskAllocations: [],
      startDate: '2026-10-12',
      endDate: '2026-10-12',
      rules: baseRules,
      overrides: [],
      activeAllocationsByDate: {},
      today: '2026-10-12',
    });

    expect(result.isFeasible).toBe(false);
    expect(result.remainingTaskEstimateMinutes).toBe(600);
    expect(result.totalAvailableNetMinutes).toBe(480);
    expect(result.deficitMinutes).toBe(120); // 600 - 480
    expect(result.surplusMinutes).toBe(0);
    expect(result.earliestFeasibleDate).toBe('2026-10-13'); // completes on Tue
  });

  it('CALC-01: returns remainingTaskEstimateMinutes = 0 and isFeasible = true when already 100% planned', () => {
    const fullyPlannedAllocations: PlannedAllocation[] = [
      { id: 'a1', taskId: 'task-100', date: '2026-10-12', allocatedMinutes: 300 },
      { id: 'a2', taskId: 'task-100', date: '2026-10-13', allocatedMinutes: 300 },
    ];

    const result = evaluateTaskFeasibility({
      task: sampleTask,
      existingTaskAllocations: fullyPlannedAllocations,
      startDate: '2026-10-12',
      endDate: '2026-10-14',
      rules: baseRules,
      overrides: [],
      activeAllocationsByDate: {},
      today: '2026-10-12',
    });

    expect(result.isFeasible).toBe(true);
    expect(result.remainingTaskEstimateMinutes).toBe(0);
    expect(result.candidateAllocations.every((c) => c.proposedAllocatedMinutes === 0)).toBe(true);
  });

  it('D-06: respects maxMinutesPerDay daily cap', () => {
    // 600m unallocated, maxMinutesPerDay = 120m (2h/day).
    const result = evaluateTaskFeasibility({
      task: sampleTask,
      existingTaskAllocations: [],
      startDate: '2026-10-12',
      endDate: '2026-10-16',
      rules: baseRules,
      overrides: [],
      activeAllocationsByDate: {},
      today: '2026-10-12',
      maxMinutesPerDay: 120,
    });

    for (const c of result.candidateAllocations) {
      expect(c.proposedAllocatedMinutes).toBeLessThanOrEqual(120);
    }
  });
});
