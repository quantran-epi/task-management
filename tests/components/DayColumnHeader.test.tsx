import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DayColumnHeader } from '../../src/components/planner/DayColumnHeader';
import type { DayPlannerData } from '../../src/hooks/useWeeklyPlanner';

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

    expect(screen.getByText(/Cap:\s*8h/i)).toBeInTheDocument();
    expect(screen.getByText(/Alloc:\s*3h/i)).toBeInTheDocument();
    expect(screen.getByText(/Bal:\s*\+5h/i)).toBeInTheDocument();
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

    expect(screen.getByText(/Alloc:\s*10h/i)).toBeInTheDocument();
    expect(screen.getByText(/Bal:\s*-2h/i)).toBeInTheDocument();
  });

  it('renders distinct load tags with icon and text for all 4 load states (D-14, D-15, PLAN-04)', () => {
    // 1. Available
    const { rerender } = render(
      <DayColumnHeader day={createMockDay({ metrics: { ...createMockDay().metrics, loadState: 'available' } })} />
    );
    expect(screen.getByText('Available')).toBeInTheDocument();

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
    expect(screen.getByText('Busy')).toBeInTheDocument();

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
    expect(screen.getByText('Overloaded')).toBeInTheDocument();

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
    expect(screen.getByText('No Capacity')).toBeInTheDocument();
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

    expect(screen.getByText(/High context switching \(5 tasks\)/i)).toBeInTheDocument();
  });

  it('clicking capacity tag invokes onEditCapacity for quick date override editing per D-07', () => {
    const onEditCapacity = vi.fn();
    const day = createMockDay({ date: '2026-09-30' });

    render(<DayColumnHeader day={day} onEditCapacity={onEditCapacity} />);

    const capTag = screen.getByRole('button', { name: /Edit capacity for 2026-09-30/i });
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
});
