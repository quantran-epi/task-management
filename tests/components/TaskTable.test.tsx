import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from 'antd';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../src/db';
import { TaskTable } from '../../src/components/tasks/TaskTable';
import { TaskFilterBar } from '../../src/components/tasks/TaskFilterBar';
import { BatchActionBar } from '../../src/components/tasks/BatchActionBar';
import type { Task, Project } from '../../src/types/models';
import { DEFAULT_TASK_FILTER_STATE } from '../../src/utils/filter';

describe('TaskTable Component', () => {
  let db: TaskPlannerDatabase;

  const sampleProjects: Project[] = [
    {
      id: 'proj-1',
      name: 'Project Alpha',
      status: 'In Progress',
      opsOwners: ['NamNV'],
      businessAnalysts: ['HuongTT'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];

  const sampleTasks: Task[] = [
    {
      id: 'task-1',
      name: 'Alpha Task One',
      projectId: 'proj-1',
      status: 'Open',
      priority: 'Urgent',
      workType: 'investigate',
      opsOwners: ['DucVA'],
      estimateMinutes: 90,
      progress: 25,
      deadline: '2025-01-01', // Overdue
      notes: 'Notes line 1\nNotes line 2',
      documentLinks: ['https://example.com/spec'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'task-2',
      name: 'Beta Standalone Task',
      status: 'In Progress',
      priority: 'Low',
      workType: 'code',
      estimateMinutes: 0,
      progress: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];

  beforeEach(async () => {
    db = new TaskPlannerDatabase('test-task-table-' + Math.random().toString(36).slice(2));
    await db.open();
    await db.projects.bulkAdd(sampleProjects);
    await db.tasks.bulkAdd(sampleTasks);
  });

  afterEach(async () => {
    await db.delete();
  });

  it('TaskFilterBar renders search input, segmented scope, project select, status tags, and horizon tags', () => {
    const onFilterChange = vi.fn();
    render(
      <TaskFilterBar
        filters={DEFAULT_TASK_FILTER_STATE}
        onFilterChange={onFilterChange}
        projects={sampleProjects}
      />
    );

    expect(screen.getByPlaceholderText(/Tìm kiếm tác vụ/i)).toBeInTheDocument();
    expect(screen.getAllByText('Tất cả').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Dự án')).toBeInTheDocument();
    expect(screen.getByText('Độc lập')).toBeInTheDocument();
    expect(screen.getByText(/Hoàn thành & Đã hủy/i)).toBeInTheDocument();
    expect(screen.getByText('Quá hạn')).toBeInTheDocument();
    expect(screen.getByText('Hôm nay')).toBeInTheDocument();
    expect(screen.getByText('Tuần này')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Bộ lọc nâng cao/i })).toBeInTheDocument();
  });

  it('TaskTable renders columns with tags, breadcrumbs, estimate format, link badges, and overdue styling', () => {
    const onOpenDrawer = vi.fn();
    render(
      <TaskTable
        tasks={sampleTasks}
        projects={sampleProjects}
        milestones={[]}
        selectedRowKeys={[]}
        onSelectRows={vi.fn()}
        onOpenDrawer={onOpenDrawer}
        db={db}
      />
    );

    // Task 1 checks
    expect(screen.getByText('Alpha Task One')).toBeInTheDocument();
    expect(screen.getByText('1h 30m')).toBeInTheDocument(); // 90 mins -> 1h 30m
    expect(screen.getByText(/Project Alpha/i)).toBeInTheDocument();
    expect(screen.getByText(/🔗 1/i)).toBeInTheDocument(); // Document link badge
    // WorkTypeBadge check for investigate
    expect(screen.getByText('Điều tra lỗi / R&D')).toBeInTheDocument();
    // Explicit tag for Task 1
    expect(screen.getByText('DucVA')).toBeInTheDocument();
    // Inherited BA tag from project for Task 1
    expect(screen.getByText('HuongTT')).toBeInTheDocument();

    // Task 2 checks
    expect(screen.getByText('Beta Standalone Task')).toBeInTheDocument();
    expect(screen.getByText('Độc lập')).toBeInTheDocument();
    expect(screen.getByText('Lập trình')).toBeInTheDocument();

    // Standup Export button check
    expect(screen.getByRole('button', { name: /Sao chép Standup/i })).toBeInTheDocument();
  });

  it('Table keyboard navigation handles Arrow navigation and Enter opening drawer', async () => {
    const onOpenDrawer = vi.fn();
    const onSelectRows = vi.fn();

    render(
      <TaskTable
        tasks={sampleTasks}
        projects={sampleProjects}
        milestones={[]}
        selectedRowKeys={[]}
        onSelectRows={onSelectRows}
        onOpenDrawer={onOpenDrawer}
        db={db}
      />
    );

    const tableContainer = screen.getByTestId('task-table-container');

    // Arrow down moves to first row
    fireEvent.keyDown(tableContainer, { key: 'ArrowDown' });
    // Press Enter to open drawer for active row
    fireEvent.keyDown(tableContainer, { key: 'Enter' });

    expect(onOpenDrawer).toHaveBeenCalledWith(sampleTasks[0]?.id);
  });

  it('BatchActionBar appears when tasks are selected and triggers batch actions', async () => {
    const onClear = vi.fn();
    const onBatchDelete = vi.fn();
    const onBatchStatus = vi.fn();

    render(
      <BatchActionBar
        selectedCount={2}
        selectedRowKeys={['task-1', 'task-2']}
        onClearSelection={onClear}
        onBatchDelete={onBatchDelete}
        onBatchStatus={onBatchStatus}
        projects={sampleProjects}
        milestones={[]}
      />
    );

    expect(screen.getByText('Đã chọn 2 tác vụ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Bỏ chọn/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Trạng thái/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Xóa/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Bỏ chọn/i }));
    expect(onClear).toHaveBeenCalled();
  });

  it('Empty state renders friendly message when no tasks match filters', () => {
    render(
      <TaskTable
        tasks={[]}
        projects={[]}
        milestones={[]}
        selectedRowKeys={[]}
        onSelectRows={vi.fn()}
        onOpenDrawer={vi.fn()}
        isFiltered={true}
        db={db}
      />
    );

    expect(screen.getByText(/Không có tác vụ phù hợp/i)).toBeInTheDocument();
  });

  it('clicking delete option in task dropdown triggers confirmation modal', async () => {
    const confirmSpy = vi.spyOn(Modal, 'confirm');
    render(
      <TaskTable
        tasks={sampleTasks}
        projects={sampleProjects}
        milestones={[]}
        selectedRowKeys={[]}
        onSelectRows={vi.fn()}
        onOpenDrawer={vi.fn()}
        db={db}
      />
    );

    const moreButtons = screen.getAllByRole('button', { name: /Thao tác khác/i });
    fireEvent.click(moreButtons[0]!);

    const deleteOption = await screen.findByText('Xóa');
    fireEvent.click(deleteOption);

    expect(confirmSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Xóa tác vụ',
        content: expect.stringContaining('Alpha Task One'),
      })
    );
    confirmSpy.mockRestore();
  });

  it('renders Jira Key tag and clicking it opens Jira issue with stopPropagation without opening drawer (JIRA-04, D-12)', async () => {
    const onOpenDrawer = vi.fn();
    const taskWithJira: Task = {
      id: 'task-jira-1',
      name: 'Jira Connected Task',
      jiraKey: 'SHB-567',
      status: 'In Progress',
      priority: 'High',
      progress: 0,
      estimateMinutes: 60,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(
      <TaskTable
        tasks={[taskWithJira]}
        projects={[]}
        milestones={[]}
        selectedRowKeys={[]}
        onSelectRows={vi.fn()}
        onOpenDrawer={onOpenDrawer}
        jiraDomain="test-company.atlassian.net"
        db={db}
      />
    );

    const jiraTag = screen.getByText('SHB-567');
    expect(jiraTag).toBeInTheDocument();

    fireEvent.click(jiraTag);

    expect(windowOpenSpy).toHaveBeenCalledWith(
      'https://test-company.atlassian.net/browse/SHB-567',
      '_blank',
      'noopener,noreferrer'
    );
    expect(onOpenDrawer).not.toHaveBeenCalled();

    windowOpenSpy.mockRestore();
  });
});
