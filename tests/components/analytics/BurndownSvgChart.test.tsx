import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BurndownSvgChart } from '../../../src/components/analytics/BurndownSvgChart';
import type { MilestoneBurndownSeries } from '../../../src/types/analytics';

describe('BurndownSvgChart Component', () => {
  const mockSeriesHours: MilestoneBurndownSeries = {
    milestoneId: 'ms-1',
    startDate: '2026-09-20',
    endDate: '2026-09-25',
    totalScope: 50,
    unit: 'hours',
    points: [
      { date: '2026-09-20', dayIndex: 0, idealRemaining: 50, actualRemaining: 50 },
      { date: '2026-09-21', dayIndex: 1, idealRemaining: 40, actualRemaining: 42 },
      { date: '2026-09-22', dayIndex: 2, idealRemaining: 30, actualRemaining: 28 },
      { date: '2026-09-23', dayIndex: 3, idealRemaining: 20, actualRemaining: 15 },
      { date: '2026-09-24', dayIndex: 4, idealRemaining: 10, actualRemaining: null },
      { date: '2026-09-25', dayIndex: 5, idealRemaining: 0, actualRemaining: null },
    ],
  };

  const mockSeriesCount: MilestoneBurndownSeries = {
    ...mockSeriesHours,
    unit: 'count',
    totalScope: 10,
    points: [
      { date: '2026-09-20', dayIndex: 0, idealRemaining: 10, actualRemaining: 10 },
      { date: '2026-09-21', dayIndex: 1, idealRemaining: 8, actualRemaining: 7 },
      { date: '2026-09-22', dayIndex: 2, idealRemaining: 6, actualRemaining: 5 },
      { date: '2026-09-23', dayIndex: 3, idealRemaining: 4, actualRemaining: 3 },
      { date: '2026-09-24', dayIndex: 4, idealRemaining: 2, actualRemaining: null },
      { date: '2026-09-25', dayIndex: 5, idealRemaining: 0, actualRemaining: null },
    ],
  };

  it('renders responsive SVG with viewBox and zero external chart library imports', () => {
    const { container } = render(
      <BurndownSvgChart
        series={mockSeriesHours}
        todayStr="2026-09-23"
        unit="hours"
      />
    );

    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('viewBox', '0 0 600 260');
    expect(svg).toHaveAttribute('role', 'img');
  });

  it('renders ideal pace line (dashed line) and actual burndown polyline stopping at Today per D-03', () => {
    render(
      <BurndownSvgChart
        series={mockSeriesHours}
        todayStr="2026-09-23"
        unit="hours"
      />
    );

    const idealLine = screen.getByTestId('ideal-pace-line');
    expect(idealLine).toBeInTheDocument();
    expect(idealLine).toHaveAttribute('stroke-dasharray', '4 4');

    const actualLine = screen.getByTestId('actual-burndown-line');
    expect(actualLine).toBeInTheDocument();
    expect(actualLine).toHaveAttribute('stroke', '#1677ff');

    // Should render exactly 4 actual points up to 2026-09-23 (indices 0, 1, 2, 3)
    const actualPoints = screen.getAllByTestId(/^actual-point-/);
    expect(actualPoints).toHaveLength(4);
  });

  it('renders highlighted Today marker point and vertical Today line per D-03', () => {
    render(
      <BurndownSvgChart
        series={mockSeriesHours}
        todayStr="2026-09-23"
        unit="hours"
      />
    );

    const todayLine = screen.getByTestId('today-vertical-line');
    expect(todayLine).toBeInTheDocument();

    const todayMarker = screen.getByTestId('today-marker-point');
    expect(todayMarker).toBeInTheDocument();
    expect(todayMarker).toHaveAttribute('r', '4.5');
    expect(todayMarker).toHaveAttribute('fill', '#1677ff');
  });

  it('handles mousemove/touch events to display vertical crosshair line and interactive tooltip card per D-04', () => {
    const { container } = render(
      <BurndownSvgChart
        series={mockSeriesHours}
        todayStr="2026-09-23"
        unit="hours"
      />
    );

    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();

    // Before mousemove, tooltip is not visible
    expect(screen.queryByTestId('burndown-tooltip')).not.toBeInTheDocument();

    // Trigger mousemove on the SVG
    fireEvent.mouseMove(svg!, { clientX: 200, clientY: 100 });

    const crosshair = screen.getByTestId('crosshair-line');
    expect(crosshair).toBeInTheDocument();

    const tooltip = screen.getByTestId('burndown-tooltip');
    expect(tooltip).toBeInTheDocument();
    expect(tooltip).toHaveTextContent('Lý tưởng:');
    expect(tooltip).toHaveTextContent('Thực tế:');

    // Mouse leave removes crosshair and tooltip
    fireEvent.mouseLeave(svg!);
    expect(screen.queryByTestId('burndown-tooltip')).not.toBeInTheDocument();
    expect(screen.queryByTestId('crosshair-line')).not.toBeInTheDocument();
  });

  it('supports unit label display for hours (h) vs count (tác vụ) per D-01', () => {
    const { rerender, container } = render(
      <BurndownSvgChart
        series={mockSeriesHours}
        todayStr="2026-09-23"
        unit="hours"
      />
    );

    const svg = container.querySelector('svg');
    fireEvent.mouseMove(svg!, { clientX: 50, clientY: 50 });

    const tooltipHours = screen.getByTestId('burndown-tooltip');
    expect(tooltipHours).toHaveTextContent(/h/);

    // Rerender with count unit
    rerender(
      <BurndownSvgChart
        series={mockSeriesCount}
        todayStr="2026-09-23"
        unit="count"
      />
    );

    fireEvent.mouseMove(svg!, { clientX: 50, clientY: 50 });
    const tooltipCount = screen.getByTestId('burndown-tooltip');
    expect(tooltipCount).toHaveTextContent(/tác vụ/);
  });
});
