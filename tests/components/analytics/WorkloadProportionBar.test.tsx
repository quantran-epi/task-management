import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WorkloadProportionBar } from '../../../src/components/analytics/WorkloadProportionBar';
import type { WorkloadDistributionItem } from '../../../src/types/analytics';

describe('WorkloadProportionBar Component', () => {
  const mockItems: WorkloadDistributionItem[] = [
    {
      key: 'user-1',
      label: 'Alice',
      taskCount: 5,
      hours: 20,
      percentage: 50,
      taskIds: ['t1', 't2'],
    },
    {
      key: 'user-2',
      label: 'Bob',
      taskCount: 3,
      hours: 12,
      percentage: 30,
      taskIds: ['t3'],
    },
    {
      key: 'unassigned',
      label: 'Chưa phân công',
      taskCount: 2,
      hours: 8,
      percentage: 20,
      taskIds: ['t4'],
    },
  ];

  it('calculates proportional widths across workload items per D-12 for hours metric', () => {
    render(<WorkloadProportionBar items={mockItems} metric="hours" />);

    const aliceSegment = screen.getByTestId('proportion-segment-user-1');
    expect(aliceSegment).toBeInTheDocument();
    // 20 out of 40 = 50%
    expect(aliceSegment).toHaveStyle({ width: '50%' });

    const bobSegment = screen.getByTestId('proportion-segment-user-2');
    expect(bobSegment).toHaveStyle({ width: '30%' });

    const unassignedSegment = screen.getByTestId('proportion-segment-unassigned');
    expect(unassignedSegment).toHaveStyle({ width: '20%' });
  });

  it('calculates proportional widths for task count metric per D-12', () => {
    render(<WorkloadProportionBar items={mockItems} metric="count" />);

    // Total tasks = 5 + 3 + 2 = 10
    const aliceSegment = screen.getByTestId('proportion-segment-user-1');
    // 5 out of 10 = 50%
    expect(aliceSegment).toHaveStyle({ width: '50%' });

    const bobSegment = screen.getByTestId('proportion-segment-user-2');
    // 3 out of 10 = 30%
    expect(bobSegment).toHaveStyle({ width: '30%' });
  });

  it('assigns distinct thematic colors to categories and neutral gray for Chưa phân công per D-10', () => {
    render(<WorkloadProportionBar items={mockItems} />);

    const aliceSegment = screen.getByTestId('proportion-segment-user-1');
    expect(aliceSegment).toHaveStyle({ backgroundColor: '#1677ff' });

    const unassignedSegment = screen.getByTestId('proportion-segment-unassigned');
    expect(unassignedSegment).toHaveStyle({ backgroundColor: '#8c8c8c' });
  });

  it('assigns predefined work type colors when workType is defined', () => {
    const workTypeItems: WorkloadDistributionItem[] = [
      {
        key: 'code',
        label: 'Lập trình',
        workType: 'code',
        taskCount: 4,
        hours: 16,
        percentage: 80,
        taskIds: [],
      },
      {
        key: 'document',
        label: 'Tài liệu',
        workType: 'document',
        taskCount: 1,
        hours: 4,
        percentage: 20,
        taskIds: [],
      },
    ];

    render(<WorkloadProportionBar items={workTypeItems} />);

    const codeSegment = screen.getByTestId('proportion-segment-code');
    expect(codeSegment).toHaveStyle({ backgroundColor: '#1677ff' });

    const docSegment = screen.getByTestId('proportion-segment-document');
    expect(docSegment).toHaveStyle({ backgroundColor: '#52c41a' });
  });

  it('handles empty list or 0 total value gracefully', () => {
    const { rerender } = render(<WorkloadProportionBar items={[]} />);
    expect(screen.getByTestId('workload-proportion-bar-empty')).toBeInTheDocument();

    const zeroItems: WorkloadDistributionItem[] = [
      {
        key: 'zero-1',
        label: 'No Hours',
        taskCount: 0,
        hours: 0,
        percentage: 0,
        taskIds: [],
      },
    ];

    rerender(<WorkloadProportionBar items={zeroItems} metric="hours" />);
    expect(screen.getByTestId('workload-proportion-bar-empty')).toBeInTheDocument();
  });
});
