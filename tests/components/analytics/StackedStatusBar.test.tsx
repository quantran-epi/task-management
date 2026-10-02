import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StackedStatusBar } from '../../../src/components/analytics/StackedStatusBar';
import { VelocityTrendChart } from '../../../src/components/analytics/VelocityTrendChart';
import type { WeeklyVelocityBucket } from '../../../src/types/analytics';

describe('StackedStatusBar & VelocityTrendChart Components', () => {
  describe('StackedStatusBar', () => {
    it('computes proportional segment widths for task statuses per D-07', () => {
      const counts = {
        Open: 2,
        Pending: 1,
        'In Progress': 4,
        'In Review': 1,
        Resolved: 1,
        Done: 2,
        Cancelled: 0,
      };

      render(
        <StackedStatusBar counts={counts} totalTasks={11} />
      );

      const inProgressSegment = screen.getByTestId('status-segment-In Progress');
      expect(inProgressSegment).toBeInTheDocument();
      expect(inProgressSegment).toHaveStyle({ width: '36.36363636363637%' });

      const openSegment = screen.getByTestId('status-segment-Open');
      expect(openSegment).toHaveStyle({ width: '18.181818181818183%' });

      const pendingSegment = screen.getByTestId('status-segment-Pending');
      expect(pendingSegment).toHaveStyle({ width: '9.090909090909092%' });

      // Cancelled has 0 count so it should not render
      expect(screen.queryByTestId('status-segment-Cancelled')).not.toBeInTheDocument();
    });

    it('renders color-coded segments matching application status theme with Tooltip info', async () => {
      const counts = {
        Open: 1,
        Pending: 1,
        'In Progress': 1,
        'In Review': 1,
        Resolved: 1,
        Done: 1,
        Cancelled: 1,
      };

      render(<StackedStatusBar counts={counts} totalTasks={7} />);

      const inProgressSegment = screen.getByTestId('status-segment-In Progress');
      expect(inProgressSegment).toHaveStyle({ backgroundColor: '#1677ff' });

      const pendingSegment = screen.getByTestId('status-segment-Pending');
      expect(pendingSegment).toHaveStyle({ backgroundColor: '#faad14' });

      const doneSegment = screen.getByTestId('status-segment-Done');
      expect(doneSegment).toHaveStyle({ backgroundColor: '#52c41a' });

      const cancelledSegment = screen.getByTestId('status-segment-Cancelled');
      expect(cancelledSegment).toHaveStyle({ backgroundColor: '#ff4d4f' });
    });

    it('handles empty or zero-task projects cleanly without division by zero errors', () => {
      const counts = {
        Open: 0,
        Pending: 0,
        'In Progress': 0,
        Resolved: 0,
        'In Review': 0,
        Done: 0,
        Cancelled: 0,
      };

      render(
        <StackedStatusBar counts={counts} totalTasks={0} />
      );

      const emptyBar = screen.getByTestId('stacked-status-bar-empty');
      expect(emptyBar).toBeInTheDocument();
      expect(screen.queryByTestId(/^status-segment-/)).not.toBeInTheDocument();
    });
  });

  describe('VelocityTrendChart', () => {
    const mockBuckets: WeeklyVelocityBucket[] = [
      {
        weekLabel: '01/09 - 07/09',
        startDate: '2026-09-01',
        endDate: '2026-09-07',
        completedTasksCount: 3,
        completedHours: 12.5,
      },
      {
        weekLabel: '08/09 - 14/09',
        startDate: '2026-09-08',
        endDate: '2026-09-14',
        completedTasksCount: 5,
        completedHours: 20,
      },
      {
        weekLabel: '15/09 - 21/09',
        startDate: '2026-09-15',
        endDate: '2026-09-21',
        completedTasksCount: 2,
        completedHours: 8,
      },
      {
        weekLabel: '22/09 - 28/09',
        startDate: '2026-09-22',
        endDate: '2026-09-28',
        completedTasksCount: 6,
        completedHours: 24,
      },
    ];

    it('renders weekly mini bars showing completed tasks and hours per D-05', () => {
      const { container } = render(
        <VelocityTrendChart buckets={mockBuckets} />
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute('role', 'img');

      // 4 bars rendered for 4 buckets
      const bars = screen.getAllByTestId(/^velocity-bar-/);
      expect(bars).toHaveLength(4);

      // Verify max tasks bar has higher height than min tasks bar
      const maxBar = screen.getByTestId('velocity-bar-2026-09-22');
      const minBar = screen.getByTestId('velocity-bar-2026-09-15');

      const maxHeight = parseFloat(maxBar.getAttribute('height') || '0');
      const minHeight = parseFloat(minBar.getAttribute('height') || '0');
      expect(maxHeight).toBeGreaterThan(minHeight);
    });

    it('handles empty buckets list gracefully', () => {
      render(<VelocityTrendChart buckets={[]} />);
      expect(screen.getByTestId('velocity-chart-empty')).toBeInTheDocument();
    });
  });
});
