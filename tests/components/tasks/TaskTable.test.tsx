import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../../src/db';
import type { Task, Project, Milestone } from '../../../src/types/models';
import { TaskTable, STORAGE_COLUMNS_KEY, ALL_CUSTOMIZABLE_COLUMNS } from '../../../src/components/tasks/TaskTable';

// Mock TimerContext
vi.mock('../../../src/hooks/useTimer', () => ({
  useTimer: () => ({
    getTimerForTask: () => null,
    getElapsedSeconds: () => 0,
    startTimer: vi.fn(),
    pauseTimer: vi.fn(),
    finishTimer: vi.fn(),
  }),
}));

describe('TaskTable', () => {
  let testDb: TaskPlannerDatabase;

  const mockProjects: Project[] = [
    {
      id: 'proj-1',
      name: 'Project 1',
      status: 'In Progress',
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
    },
  ];

  const mockMilestones: Milestone[] = [
    {
      id: 'mile-1',
      projectId: 'proj-1',
      name: 'Milestone 1',
      status: 'Open',
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
    },
  ];

  const mockTasks: Task[] = [
    {
      id: 'task-1',
      name: 'Alpha Task',
      status: 'Open',
      priority: 'Low',
      progress: 0,
      estimateMinutes: 60,
      deadline: '2026-10-01',
      projectId: 'proj-1',
      milestoneId: 'mile-1',
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
    },
    {
      id: 'task-2',
      name: 'Beta Task',
      status: 'In Progress',
      priority: 'Urgent',
      progress: 50,
      estimateMinutes: 120,
      deadline: '2026-09-30',
      projectId: 'proj-1',
      milestoneId: 'mile-1',
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
    },
    {
      id: 'task-3',
      name: 'Gamma Task',
      status: 'Done',
      priority: 'High',
      progress: 100,
      estimateMinutes: 30,
      deadline: '2026-09-25',
      projectId: 'proj-1',
      milestoneId: 'mile-1',
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
    },
  ];

  beforeEach(async () => {
    localStorage.clear();
    testDb = new TaskPlannerDatabase(`test-task-table-${Math.random()}`);
    await testDb.open();
    vi.clearAllMocks();
  });

  it('renders default columns and task rows', () => {
    render(
      <TaskTable
        tasks={mockTasks}
        projects={mockProjects}
        milestones={mockMilestones}
        selectedRowKeys={[]}
        onSelectRows={vi.fn()}
        onOpenDrawer={vi.fn()}
        db={testDb}
      />
    );

    // Verify task names rendered
    expect(screen.getByText('Alpha Task')).toBeInTheDocument();
    expect(screen.getByText('Beta Task')).toBeInTheDocument();
    expect(screen.getByText('Gamma Task')).toBeInTheDocument();

    // Verify column headers rendered
    expect(screen.getByText('Tác vụ & Phân cấp')).toBeInTheDocument();
    expect(screen.getByText('Trạng thái')).toBeInTheDocument();
    expect(screen.getByText('Độ ưu tiên')).toBeInTheDocument();
  });

  it('opens column customization popover and shows all customizable columns', async () => {
    render(
      <TaskTable
        tasks={mockTasks}
        projects={mockProjects}
        milestones={mockMilestones}
        selectedRowKeys={[]}
        onSelectRows={vi.fn()}
        onOpenDrawer={vi.fn()}
        db={testDb}
      />
    );

    const customizeBtn = screen.getByRole('button', { name: 'Cột hiển thị' });
    fireEvent.click(customizeBtn);

    // Popover content should appear
    expect(await screen.findByText('Cột hiển thị', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText('Mặc định')).toBeInTheDocument();

    // Name column checkbox must be disabled inside the popover
    const nameCheckbox = screen.getByRole('checkbox', { name: /Tác vụ & Phân cấp/ });
    expect(nameCheckbox).toBeDisabled();
    expect(nameCheckbox).toBeChecked();
  });

  it('toggles column visibility and persists preference to localStorage', async () => {
    render(
      <TaskTable
        tasks={mockTasks}
        projects={mockProjects}
        milestones={mockMilestones}
        selectedRowKeys={[]}
        onSelectRows={vi.fn()}
        onOpenDrawer={vi.fn()}
        db={testDb}
      />
    );

    // Header "Ops Owner" initially present
    expect(screen.getByRole('columnheader', { name: /Ops Owner/i })).toBeInTheDocument();

    // Click customize button
    const customizeBtn = screen.getByRole('button', { name: 'Cột hiển thị' });
    fireEvent.click(customizeBtn);

    // Find Ops Owner checkbox in popover and uncheck it
    const opsCheckbox = await screen.findByLabelText(/Ops Owner/);
    expect(opsCheckbox).toBeChecked();

    fireEvent.click(opsCheckbox);

    // Ops Owner header should now be removed from table
    expect(screen.queryByRole('columnheader', { name: /Ops Owner/i })).not.toBeInTheDocument();

    // Verify saved to localStorage
    const saved = localStorage.getItem(STORAGE_COLUMNS_KEY);
    expect(saved).not.toBeNull();
    const parsed = JSON.parse(saved!);
    expect(parsed).not.toContain('opsOwners');
    expect(parsed).toContain('name'); // name always preserved
  });

  it('loads column visibility synchronously from localStorage on mount', () => {
    // Hide 'opsOwners' and 'businessAnalysts' in saved preferences
    const customCols = ['name', 'status', 'priority', 'deadline'];
    localStorage.setItem(STORAGE_COLUMNS_KEY, JSON.stringify(customCols));

    render(
      <TaskTable
        tasks={mockTasks}
        projects={mockProjects}
        milestones={mockMilestones}
        selectedRowKeys={[]}
        onSelectRows={vi.fn()}
        onOpenDrawer={vi.fn()}
        db={testDb}
      />
    );

    expect(screen.getByRole('columnheader', { name: /Tác vụ & Phân cấp/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Trạng thái/i })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /Ops Owner/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /Business Analyst/i })).not.toBeInTheDocument();
  });

  it('supports 3-state sorting on name header', async () => {
    render(
      <TaskTable
        tasks={mockTasks}
        projects={mockProjects}
        milestones={mockMilestones}
        selectedRowKeys={[]}
        onSelectRows={vi.fn()}
        onOpenDrawer={vi.fn()}
        db={testDb}
      />
    );

    const nameHeader = screen.getByRole('columnheader', { name: /Tác vụ & Phân cấp/i });
    expect(nameHeader).toHaveClass('ant-table-column-has-sorters');

    // Click 1: Ascending
    fireEvent.click(nameHeader);
    const rowLinksAsc = screen.getAllByText(/(Alpha|Beta|Gamma) Task/);
    expect(rowLinksAsc[0]).toHaveTextContent('Alpha Task');
    expect(rowLinksAsc[1]).toHaveTextContent('Beta Task');
    expect(rowLinksAsc[2]).toHaveTextContent('Gamma Task');

    // Click 2: Descending
    fireEvent.click(nameHeader);
    const rowLinksDesc = screen.getAllByText(/(Alpha|Beta|Gamma) Task/);
    expect(rowLinksDesc[0]).toHaveTextContent('Gamma Task');
    expect(rowLinksDesc[1]).toHaveTextContent('Beta Task');
    expect(rowLinksDesc[2]).toHaveTextContent('Alpha Task');

    // Click 3: Reset to default order
    fireEvent.click(nameHeader);
    const rowLinksReset = screen.getAllByText(/(Alpha|Beta|Gamma) Task/);
    expect(rowLinksReset[0]).toHaveTextContent('Alpha Task');
    expect(rowLinksReset[1]).toHaveTextContent('Beta Task');
    expect(rowLinksReset[2]).toHaveTextContent('Gamma Task');
  });

  it('supports sorting by priority', async () => {
    render(
      <TaskTable
        tasks={mockTasks}
        projects={mockProjects}
        milestones={mockMilestones}
        selectedRowKeys={[]}
        onSelectRows={vi.fn()}
        onOpenDrawer={vi.fn()}
        db={testDb}
      />
    );

    const priorityHeader = screen.getByRole('columnheader', { name: /Độ ưu tiên/i });
    expect(priorityHeader).toHaveClass('ant-table-column-has-sorters');

    // Click 1: Ascending (Low -> Medium -> High -> Urgent)
    fireEvent.click(priorityHeader);
    let rows = screen.getAllByText(/(Alpha|Beta|Gamma) Task/);
    expect(rows[0]).toHaveTextContent('Alpha Task'); // Low
    expect(rows[1]).toHaveTextContent('Gamma Task'); // High
    expect(rows[2]).toHaveTextContent('Beta Task');  // Urgent

    // Click 2: Descending (Urgent -> High -> Medium -> Low)
    fireEvent.click(priorityHeader);
    rows = screen.getAllByText(/(Alpha|Beta|Gamma) Task/);
    expect(rows[0]).toHaveTextContent('Beta Task');  // Urgent
    expect(rows[1]).toHaveTextContent('Gamma Task'); // High
    expect(rows[2]).toHaveTextContent('Alpha Task'); // Low
  });
});
