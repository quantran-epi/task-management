import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AttentionTodayList } from '../../src/components/dashboard/AttentionTodayList';
import type { AttentionTaskItem } from '../../src/types/dashboard';
import type { Task } from '../../src/types/models';
import * as taskRepo from '../../src/db/repositories/taskRepo';

vi.mock('../../src/db/repositories/taskRepo', () => ({
  updateTaskStatus: vi.fn().mockResolvedValue({}),
}));

function createMockTask(overrides?: Partial<Task>): Task {
  return {
    id: 'task-1',
    name: 'Sample Task',
    status: 'Open',
    progress: 0,
    priority: 'High',
    estimateMinutes: 60,
    createdAt: '2026-09-20T00:00:00.000Z',
    updatedAt: '2026-09-20T00:00:00.000Z',
    ...overrides,
  };
}

describe('AttentionTodayList (DASH-01, DASH-06, D-09, D-10, D-11, D-12, D-14)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders empty state when items array is empty', () => {
    const onViewAllTasks = vi.fn();
    const onTaskClick = vi.fn();

    render(
      <AttentionTodayList
        items={[]}
        onTaskClick={onTaskClick}
        onViewAllTasks={onViewAllTasks}
      />
    );

    expect(
      screen.getByText('Tuyệt vời! Bạn không có tác vụ quá hạn, đến hạn hôm nay hay lịch phân bổ nào còn dở dang.')
    ).toBeInTheDocument();
  });

  it('renders overdue, due-today, and scheduled-today badges with correct metadata', () => {
    const items: AttentionTaskItem[] = [
      {
        task: createMockTask({ id: 'task-overdue', name: 'Overdue Task', priority: 'Urgent' }),
        category: 'overdue',
        daysOverdue: 3,
        scheduledMinutes: 0,
      },
      {
        task: createMockTask({ id: 'task-due-today', name: 'Due Today Task', priority: 'High' }),
        category: 'due-today',
        scheduledMinutes: 0,
      },
      {
        task: createMockTask({ id: 'task-scheduled', name: 'Scheduled Task', priority: 'Medium' }),
        category: 'scheduled-today',
        scheduledMinutes: 90,
      },
    ];

    render(
      <AttentionTodayList
        items={items}
        onTaskClick={vi.fn()}
        onViewAllTasks={vi.fn()}
      />
    );

    // Overdue badge
    expect(screen.getByText('Quá hạn 3 ngày')).toBeInTheDocument();
    // Due today badge & priority
    expect(screen.getByText('Đến hạn hôm nay')).toBeInTheDocument();
    expect(screen.getByText('Cao')).toBeInTheDocument();
    // Scheduled today badge
    expect(screen.getByText('Lên lịch 1h 30m')).toBeInTheDocument();

    // Verify task names rendered
    expect(screen.getByText('Overdue Task')).toBeInTheDocument();
    expect(screen.getByText('Due Today Task')).toBeInTheDocument();
    expect(screen.getByText('Scheduled Task')).toBeInTheDocument();
  });

  it('has bounded scroll container with maxHeight 360px and overflowY auto (D-12, T-05-04)', () => {
    const items: AttentionTaskItem[] = [
      {
        task: createMockTask({ id: 'task-1', name: 'Task 1' }),
        category: 'scheduled-today',
        scheduledMinutes: 60,
      },
    ];

    render(
      <AttentionTodayList
        items={items}
        onTaskClick={vi.fn()}
        onViewAllTasks={vi.fn()}
      />
    );

    const body = screen.getByTestId('attention-list-body');
    expect(body).toHaveStyle({ maxHeight: '360px', overflowY: 'auto' });
  });

  it('clicking task title invokes onTaskClick callback with task ID (D-11, D-14)', () => {
    const onTaskClick = vi.fn();
    const items: AttentionTaskItem[] = [
      {
        task: createMockTask({ id: 'task-inspect', name: 'Inspectable Task' }),
        category: 'due-today',
      },
    ];

    render(
      <AttentionTodayList
        items={items}
        onTaskClick={onTaskClick}
        onViewAllTasks={vi.fn()}
      />
    );

    const titleEl = screen.getByText('Inspectable Task');
    fireEvent.click(titleEl);

    expect(onTaskClick).toHaveBeenCalledTimes(1);
    expect(onTaskClick).toHaveBeenCalledWith('task-inspect');
  });

  it('checking completion checkbox calls updateTaskStatus to mark task Done (D-11)', async () => {
    const items: AttentionTaskItem[] = [
      {
        task: createMockTask({ id: 'task-check', name: 'Unfinished Task', status: 'Open' }),
        category: 'overdue',
        daysOverdue: 1,
      },
    ];

    render(
      <AttentionTodayList
        items={items}
        onTaskClick={vi.fn()}
        onViewAllTasks={vi.fn()}
      />
    );

    const checkbox = screen.getByRole('checkbox', { name: /Đánh dấu hoàn thành cho Unfinished Task/i });
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(taskRepo.updateTaskStatus).toHaveBeenCalledTimes(1);
      expect(taskRepo.updateTaskStatus).toHaveBeenCalledWith('task-check', 'Done', undefined);
    });
  });

  it('checking completion checkbox on Done task calls updateTaskStatus to mark task Open', async () => {
    const items: AttentionTaskItem[] = [
      {
        task: createMockTask({ id: 'task-done', name: 'Finished Task', status: 'Done' }),
        category: 'scheduled-today',
        scheduledMinutes: 30,
      },
    ];

    render(
      <AttentionTodayList
        items={items}
        onTaskClick={vi.fn()}
        onViewAllTasks={vi.fn()}
      />
    );

    const checkbox = screen.getByRole('checkbox', { name: /Đánh dấu hoàn thành cho Finished Task/i });
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(taskRepo.updateTaskStatus).toHaveBeenCalledTimes(1);
      expect(taskRepo.updateTaskStatus).toHaveBeenCalledWith('task-done', 'Open', undefined);
    });
  });

  it('header extra action "Xem tất cả tác vụ" invokes onViewAllTasks (D-12)', () => {
    const onViewAllTasks = vi.fn();

    render(
      <AttentionTodayList
        items={[]}
        onTaskClick={vi.fn()}
        onViewAllTasks={onViewAllTasks}
      />
    );

    const viewAllBtn = screen.getByRole('button', { name: 'Xem tất cả tác vụ' });
    fireEvent.click(viewAllBtn);

    expect(onViewAllTasks).toHaveBeenCalledTimes(1);
  });
});
