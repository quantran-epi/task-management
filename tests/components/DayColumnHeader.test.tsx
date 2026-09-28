import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, renderHook, waitFor } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { DayColumnHeader } from '../../src/components/planner/DayColumnHeader';
import { useWeeklyPlanner, type DayPlannerData } from '../../src/hooks/useWeeklyPlanner';
import { TaskPlannerDatabase } from '../../src/db/index';
import { updateCapacityRule, setCapacityOverride } from '../../src/db/repositories/capacityRepo';
import { createTask } from '../../src/db/repositories/taskRepo';
import { upsertAllocation } from '../../src/db/repositories/allocationRepo';

function createMockDay(overrides?: Partial<DayPlannerData>): DayPlannerData {
  return {
    date: '2026-09-28',
    dayOfWeek: 1,
    dayName: 'Monday',
    isToday: false,
    metrics: {
      date: '2026-09-28',
      dayOfWeek: 1,
      effectiveCapacityMinutes: 480, // 8h
      activeAllocatedMinutes: 240, // 4h
      inactiveAllocatedMinutes: 0,
      netBalanceMinutes: 240, // +4h
      loadState: 'available',
      percent: 50,
      isOverloaded: false,
      activeTaskCount: 2,
      isHighContextSwitching: false,
    },
    allocations: [],
    ...overrides,
  };
}

describe('DayColumnHeader (PLAN-03, PLAN-04, UX-02, UX-04, D-07, D-13, D-14, D-15, D-17)', () => {
  it('renders all 3 core metrics: Capacity, Allocated, and Net Balance per D-17 and PLAN-03', () => {
    const day = createMockDay({
      metrics: {
        date: '2026-09-28',
        dayOfWeek: 1,
        effectiveCapacityMinutes: 480,
        activeAllocatedMinutes: 180,
        inactiveAllocatedMinutes: 0,
        netBalanceMinutes: 300,
        loadState: 'available',
        percent: 38,
        isOverloaded: false,
        activeTaskCount: 2,
        isHighContextSwitching: false,
      },
    });

    render(<DayColumnHeader day={day} />);

    expect(screen.getByText(/Sức chứa:\s*8h/i)).toBeInTheDocument();
    expect(screen.getByText(/Phân bổ:\s*3h/i)).toBeInTheDocument();
    expect(screen.getByText(/Còn lại:\s*\+5h/i)).toBeInTheDocument();
  });

  it('renders negative net balance with minus sign and overload styling when overloaded', () => {
    const day = createMockDay({
      metrics: {
        date: '2026-09-28',
        dayOfWeek: 1,
        effectiveCapacityMinutes: 480,
        activeAllocatedMinutes: 600,
        inactiveAllocatedMinutes: 0,
        netBalanceMinutes: -120,
        loadState: 'overloaded',
        percent: 125,
        isOverloaded: true,
        activeTaskCount: 3,
        isHighContextSwitching: false,
      },
    });

    render(<DayColumnHeader day={day} />);

    expect(screen.getByText(/Phân bổ:\s*10h/i)).toBeInTheDocument();
    expect(screen.getByText(/Còn lại:\s*-2h/i)).toBeInTheDocument();
  });

  it('renders distinct load tags with icon and text for all 4 load states (D-14, D-15, PLAN-04)', () => {
    // 1. Available
    const { rerender } = render(
      <DayColumnHeader day={createMockDay({ metrics: { ...createMockDay().metrics, loadState: 'available' } })} />
    );
    expect(screen.getByText('Khả dụng')).toBeInTheDocument();

    // 2. Busy
    rerender(
      <DayColumnHeader
        day={createMockDay({
          metrics: {
            ...createMockDay().metrics,
            loadState: 'busy',
            activeAllocatedMinutes: 420,
            percent: 88,
          },
        })}
      />
    );
    expect(screen.getByText('Bận')).toBeInTheDocument();

    // 3. Overloaded
    rerender(
      <DayColumnHeader
        day={createMockDay({
          metrics: {
            ...createMockDay().metrics,
            loadState: 'overloaded',
            activeAllocatedMinutes: 540,
            isOverloaded: true,
          },
        })}
      />
    );
    expect(screen.getByText('Quá tải')).toBeInTheDocument();

    // 4. No Capacity
    rerender(
      <DayColumnHeader
        day={createMockDay({
          metrics: {
            ...createMockDay().metrics,
            loadState: 'no-capacity',
            effectiveCapacityMinutes: 0,
            activeAllocatedMinutes: 0,
            netBalanceMinutes: 0,
            percent: 0,
          },
        })}
      />
    );
    expect(screen.getByText('Nghỉ')).toBeInTheDocument();
  });

  it('displays high context switching warning tag when active tasks exceed 4 per D-13', () => {
    const day = createMockDay({
      metrics: {
        ...createMockDay().metrics,
        activeTaskCount: 5,
        isHighContextSwitching: true,
      },
    });

    render(<DayColumnHeader day={day} />);

    expect(screen.getByText(/Chuyển ngữ cảnh cao \(5 tác vụ\)/i)).toBeInTheDocument();
  });

  it('clicking capacity tag invokes onEditCapacity for quick date override editing per D-07', () => {
    const onEditCapacity = vi.fn();
    const day = createMockDay({ date: '2026-09-30' });

    render(<DayColumnHeader day={day} onEditCapacity={onEditCapacity} />);

    const capTag = screen.getByRole('button', { name: /Sửa công suất cho 2026-09-30/i });
    fireEvent.click(capTag);

    expect(onEditCapacity).toHaveBeenCalledTimes(1);
    expect(onEditCapacity).toHaveBeenCalledWith('2026-09-30');
  });

  it('highlights today date with visually distinct indicator when isToday is true', () => {
    const day = createMockDay({ isToday: true });
    render(<DayColumnHeader day={day} />);

    const header = screen.getByTestId('day-column-header-2026-09-28');
    expect(header).toHaveAttribute('data-is-today', 'true');
  });

  it('renders date, today badge, and capacity without layout failure in constrained width container (03-04)', () => {
    const day = createMockDay({ isToday: true, date: '2026-09-28' });
    const { container } = render(
      <div style={{ width: 180 }}>
        <DayColumnHeader day={day} />
      </div>
    );

    const header = screen.getByTestId('day-column-header-2026-09-28');
    expect(header).toBeInTheDocument();
    expect(screen.getByText('T2, 28/09')).toBeInTheDocument();
    expect(screen.getByText('Hôm nay')).toBeInTheDocument();
    expect(screen.getByText(/Sức chứa:\s*8h/i)).toBeInTheDocument();
    expect(screen.getByText(/Phân bổ:\s*4h/i)).toBeInTheDocument();
    expect(screen.getByText(/Còn lại:\s*\+4h/i)).toBeInTheDocument();
    expect(container.querySelector('[role="button"]')).toBeInTheDocument();
  });

  it('renders with uniform minHeight for stable column header height across columns', () => {
    const day = createMockDay({ date: '2026-09-28' });
    render(<DayColumnHeader day={day} />);
    const header = screen.getByTestId('day-column-header-2026-09-28');
    expect(header).toHaveStyle({ minHeight: '142px' });
  });
});

describe('useWeeklyPlanner hook (PLAN-03, D-01, D-16)', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase('TestWeeklyPlanner_' + Math.random().toString(36).slice(2));
    await testDb.open();
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('computes 7 days Monday to Sunday for any target date', async () => {
    // Wednesday 2026-09-30 -> week should be Monday 2026-09-28 to Sunday 2026-10-04
    const { result } = renderHook(() => useWeeklyPlanner('2026-09-30', testDb));

    expect(result.current.weekStartDate).toBe('2026-09-28');
    expect(result.current.weekEndDate).toBe('2026-10-04');
    expect(result.current.days).toHaveLength(7);
    expect(result.current.days[0]?.date).toBe('2026-09-28');
    expect(result.current.days[0]?.dayName).toBe('Monday');
    expect(result.current.days[6]?.date).toBe('2026-10-04');
    expect(result.current.days[6]?.dayName).toBe('Sunday');
  });

  it('joins capacity rules, date overrides, task allocations, and task entities reactively', async () => {
    // 1. Monday rule = 480m (8h)
    await updateCapacityRule(1, 480, testDb);
    // 2. Tuesday override = 240m (4h)
    await setCapacityOverride('2026-09-29', 240, 'Doctor appointment', testDb);

    // 3. Create active task and allocate 120m to Monday
    const task1 = await createTask({ name: 'Active Spec', estimateMinutes: 120, status: 'In Progress' }, testDb);
    await upsertAllocation(task1.id, '2026-09-28', 120, testDb);

    // 4. Create done task and allocate 60m to Monday (excluded from active metrics)
    const task2 = await createTask({ name: 'Done Task', estimateMinutes: 60, status: 'Done' }, testDb);
    await upsertAllocation(task2.id, '2026-09-28', 60, testDb);

    const { result } = renderHook(() => useWeeklyPlanner('2026-09-28', testDb));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      const monday = result.current.days[0]!;
      expect(monday.metrics.effectiveCapacityMinutes).toBe(480);
      expect(monday.metrics.activeAllocatedMinutes).toBe(120);
      expect(monday.metrics.inactiveAllocatedMinutes).toBe(60);
      expect(monday.metrics.netBalanceMinutes).toBe(360);
      expect(monday.allocations).toHaveLength(2);

      const tuesday = result.current.days[1]!;
      expect(tuesday.metrics.effectiveCapacityMinutes).toBe(240);
      expect(tuesday.override?.note).toBe('Doctor appointment');
    });
  });
});
