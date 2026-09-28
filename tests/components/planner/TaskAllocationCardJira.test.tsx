import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { TaskAllocationCard } from '../../../src/components/planner/TaskAllocationCard';
import type { Task, PlannedAllocation } from '../../../src/types/models';

describe('TaskAllocationCard Jira micro-tag (JIRA-04, D-15)', () => {
  const sampleTaskWithJira: Task = {
    id: 'task-alloc-1',
    name: 'Implement Core API Service',
    jiraKey: 'SHB-888',
    status: 'In Progress',
    priority: 'High',
    progress: 30,
    estimateMinutes: 180,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const sampleTaskWithoutJira: Task = {
    id: 'task-alloc-2',
    name: 'Write unit tests',
    status: 'Open',
    priority: 'Medium',
    progress: 0,
    estimateMinutes: 60,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const sampleAllocation: PlannedAllocation = {
    id: 'alloc-1',
    taskId: 'task-alloc-1',
    date: '2026-09-28',
    allocatedMinutes: 120,
  };

  it('renders compact Jira Key micro-tag when task has jiraKey', () => {
    render(
      <TaskAllocationCard
        allocation={sampleAllocation}
        task={sampleTaskWithJira}
        isActive={true}
      />
    );

    const jiraBadge = screen.getByText('SHB-888');
    expect(jiraBadge).toBeInTheDocument();
  });

  it('does not render Jira Key micro-tag when task does not have jiraKey', () => {
    render(
      <TaskAllocationCard
        allocation={sampleAllocation}
        task={sampleTaskWithoutJira}
        isActive={true}
      />
    );

    expect(screen.queryByText('SHB-888')).not.toBeInTheDocument();
  });

  it('clicking Jira micro-tag triggers window.open targeting Jira browse URL with stopPropagation', () => {
    const onEditTask = vi.fn();
    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(
      <TaskAllocationCard
        allocation={sampleAllocation}
        task={sampleTaskWithJira}
        isActive={true}
        onEditTask={onEditTask}
        jiraDomain="company.atlassian.net"
      />
    );

    const jiraBadge = screen.getByText('SHB-888');
    fireEvent.click(jiraBadge);

    expect(windowOpenSpy).toHaveBeenCalledWith(
      'https://company.atlassian.net/browse/SHB-888',
      '_blank',
      'noopener,noreferrer'
    );
    expect(onEditTask).not.toHaveBeenCalled();

    windowOpenSpy.mockRestore();
  });
});
