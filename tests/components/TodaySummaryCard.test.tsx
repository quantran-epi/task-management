import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TodaySummaryCard } from '../../src/components/dashboard/TodaySummaryCard';
import type { DayCapacityMetrics } from '../../src/utils/capacity';

function createMockMetrics(overrides?: Partial<DayCapacityMetrics>): DayCapacityMetrics {
  return {
    date: '2026-09-28',
    dayOfWeek: 1,
    effectiveCapacityMinutes: 480, // 8h
    activeAllocatedMinutes: 240, // 4h
    inactiveAllocatedMinutes: 0,
    netBalanceMinutes: 240,
    loadState: 'available',
    percent: 50,
    isOverloaded: false,
    activeTaskCount: 2,
    isHighContextSwitching: false,
    ...overrides,
  };
}

describe('TodaySummaryCard (DASH-02, D-03, D-04, D-15)', () => {
  it('renders standard capacity metrics with planned vs capacity time and progress', () => {
    const metrics = createMockMetrics({
      activeAllocatedMinutes: 240,
      effectiveCapacityMinutes: 480,
      percent: 50,
      loadState: 'available',
    });
    const onOpenPlanner = vi.fn();

    render(
      <TodaySummaryCard
        metrics={metrics}
        scheduledCount={3}
        todayDate="2026-09-28"
        onOpenPlanner={onOpenPlanner}
      />
    );

    expect(screen.getByText('4h / 8h')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('3 tác vụ hôm nay')).toBeInTheDocument();
    expect(screen.getByText('Khả dụng')).toBeInTheDocument();
  });

  it('renders busy load badge when loadState is busy', () => {
    const metrics = createMockMetrics({
      activeAllocatedMinutes: 450,
      effectiveCapacityMinutes: 480,
      percent: 94,
      loadState: 'busy',
    });

    render(
      <TodaySummaryCard
        metrics={metrics}
        scheduledCount={4}
        todayDate="2026-09-28"
        onOpenPlanner={vi.fn()}
      />
    );

    expect(screen.getByText('7h 30m / 8h')).toBeInTheDocument();
    expect(screen.getByText('Bận')).toBeInTheDocument();
  });

  it('renders overloaded badge and styling when capacity is exceeded', () => {
    const metrics = createMockMetrics({
      activeAllocatedMinutes: 600,
      effectiveCapacityMinutes: 480,
      percent: 125,
      isOverloaded: true,
      loadState: 'overloaded',
    });

    render(
      <TodaySummaryCard
        metrics={metrics}
        scheduledCount={5}
        todayDate="2026-09-28"
        onOpenPlanner={vi.fn()}
      />
    );

    expect(screen.getByText('10h / 8h')).toBeInTheDocument();
    expect(screen.getByText('Quá tải')).toBeInTheDocument();
  });

  it('renders rest day notice without crashing when effective capacity is zero', () => {
    const metrics = createMockMetrics({
      activeAllocatedMinutes: 0,
      effectiveCapacityMinutes: 0,
      percent: 0,
      loadState: 'no-capacity',
    });

    render(
      <TodaySummaryCard
        metrics={metrics}
        scheduledCount={0}
        todayDate="2026-09-27"
        onOpenPlanner={vi.fn()}
      />
    );

    expect(screen.getByText('Nghỉ')).toBeInTheDocument();
    expect(screen.getByTestId('rest-day-alert')).toBeInTheDocument();
    expect(screen.getByText('Ngày nghỉ / Không có giờ làm việc')).toBeInTheDocument();
  });

  it('renders clear schedule alert with CTA when working day has zero allocations', () => {
    const metrics = createMockMetrics({
      activeAllocatedMinutes: 0,
      effectiveCapacityMinutes: 480,
      percent: 0,
      loadState: 'available',
    });
    const onOpenPlanner = vi.fn();

    render(
      <TodaySummaryCard
        metrics={metrics}
        scheduledCount={0}
        todayDate="2026-09-28"
        onOpenPlanner={onOpenPlanner}
      />
    );

    expect(screen.getByTestId('clear-schedule-alert')).toBeInTheDocument();
    expect(screen.getByText(/Lịch trình trống — 8h khả dụng hôm nay/i)).toBeInTheDocument();

    const planBtn = screen.getByRole('button', { name: 'Lên kế hoạch hôm nay' });
    fireEvent.click(planBtn);
    expect(onOpenPlanner).toHaveBeenCalledTimes(1);
  });

  it('handles null metrics safely and clicking main CTA triggers onOpenPlanner', () => {
    const onOpenPlanner = vi.fn();

    render(
      <TodaySummaryCard
        metrics={null}
        scheduledCount={0}
        onOpenPlanner={onOpenPlanner}
      />
    );

    expect(screen.getByText('0m / 0m')).toBeInTheDocument();
    expect(screen.getByText('Nghỉ')).toBeInTheDocument();

    const mainBtn = screen.getByTestId('open-today-planner-btn');
    fireEvent.click(mainBtn);
    expect(onOpenPlanner).toHaveBeenCalledTimes(1);
  });
});
