import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WorkloadForecast } from '../../src/components/dashboard/WorkloadForecast';
import type { HorizonDayData } from '../../src/types/dashboard';

describe('WorkloadForecast component', () => {
  const mockHorizonDays: HorizonDayData[] = [
    {
      date: '2026-09-27',
      dayOfWeek: 0,
      dayName: 'CN',
      isToday: true,
      metrics: {
        date: '2026-09-27',
        dayOfWeek: 0,
        effectiveCapacityMinutes: 480,
        activeAllocatedMinutes: 240,
        inactiveAllocatedMinutes: 0,
        netBalanceMinutes: 240,
        loadState: 'available',
        percent: 50,
        isOverloaded: false,
        activeTaskCount: 2,
        isHighContextSwitching: false,
      },
      excessMinutes: 0,
    },
    {
      date: '2026-09-28',
      dayOfWeek: 1,
      dayName: 'Th 2',
      isToday: false,
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
        activeTaskCount: 4,
        isHighContextSwitching: false,
      },
      excessMinutes: 120,
    },
  ];

  const mockOverloadedDays = [{ date: '2026-09-28', excessMinutes: 120 }];

  it('renders horizon options in Segmented switcher and triggers callback', () => {
    const handleHorizonChange = vi.fn();
    const handleDateClick = vi.fn();

    render(
      <WorkloadForecast
        horizon={7}
        onHorizonChange={handleHorizonChange}
        horizonDays={mockHorizonDays}
        overloadedDays={[]}
        onDateClick={handleDateClick}
      />
    );

    expect(screen.getByText('7 ngày tới')).toBeInTheDocument();
    expect(screen.getByText('14 ngày tới')).toBeInTheDocument();
    expect(screen.getByText('30 ngày tới')).toBeInTheDocument();

    fireEvent.click(screen.getByText('14 ngày tới'));
    expect(handleHorizonChange).toHaveBeenCalledWith(14);
  });

  it('renders OverloadAlertBanner when overloaded days exist and triggers date click on chip', () => {
    const handleDateClick = vi.fn();

    render(
      <WorkloadForecast
        horizon={7}
        onHorizonChange={vi.fn()}
        horizonDays={mockHorizonDays}
        overloadedDays={mockOverloadedDays}
        onDateClick={handleDateClick}
      />
    );

    expect(screen.getByText('Phát hiện quá tải công suất')).toBeInTheDocument();
    expect(screen.getByText(/Có 1 ngày vượt quá sức chứa/)).toBeInTheDocument();

    const chip = screen.getByTestId('overload-chip-2026-09-28');
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveTextContent('2026-09-28: +2h');

    fireEvent.click(chip);
    expect(handleDateClick).toHaveBeenCalledWith('2026-09-28');
  });

  it('does not render OverloadAlertBanner when 0 overloaded days exist', () => {
    render(
      <WorkloadForecast
        horizon={7}
        onHorizonChange={vi.fn()}
        horizonDays={mockHorizonDays}
        overloadedDays={[]}
        onDateClick={vi.fn()}
      />
    );

    expect(screen.queryByText('Phát hiện quá tải công suất')).not.toBeInTheDocument();
  });

  it('renders mini day cards and clicking a card triggers onDateClick', () => {
    const handleDateClick = vi.fn();

    render(
      <WorkloadForecast
        horizon={7}
        onHorizonChange={vi.fn()}
        horizonDays={mockHorizonDays}
        overloadedDays={mockOverloadedDays}
        onDateClick={handleDateClick}
      />
    );

    const todayCard = screen.getByTestId('mini-day-card-2026-09-27');
    expect(todayCard).toBeInTheDocument();
    expect(screen.getByText('Hôm nay')).toBeInTheDocument();
    expect(screen.getByText('Khả dụng')).toBeInTheDocument();

    const overloadedCard = screen.getByTestId('mini-day-card-2026-09-28');
    expect(overloadedCard).toBeInTheDocument();
    expect(screen.getByText('Quá tải')).toBeInTheDocument();
    expect(screen.getByText('+2h vượt')).toBeInTheDocument();

    fireEvent.click(todayCard);
    expect(handleDateClick).toHaveBeenCalledWith('2026-09-27');
  });

  it('supports keyboard navigation (Enter and Space) on mini day cards', () => {
    const handleDateClick = vi.fn();

    render(
      <WorkloadForecast
        horizon={7}
        onHorizonChange={vi.fn()}
        horizonDays={mockHorizonDays}
        overloadedDays={[]}
        onDateClick={handleDateClick}
      />
    );

    const todayCard = screen.getByTestId('mini-day-card-2026-09-27');
    fireEvent.keyDown(todayCard, { key: 'Enter', code: 'Enter' });
    expect(handleDateClick).toHaveBeenCalledWith('2026-09-27');

    fireEvent.keyDown(todayCard, { key: ' ', code: 'Space' });
    expect(handleDateClick).toHaveBeenCalledTimes(2);
  });
});
