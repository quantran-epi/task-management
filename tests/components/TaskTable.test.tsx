import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from 'antd';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../src/db';
import { TaskTable } from '../../src/components/tasks/TaskTable';
import { TaskFilterBar } from '../../src/components/tasks/TaskFilterBar';
import { BatchActionBar } from '../../src/components/tasks/BatchActionBar';
import type { Task, ChangeRequest, System } from '../../src/types/models';
import { DEFAULT_TASK_FILTER_STATE } from '../../src/utils/filter';

// QuickReminderModal still imports the retired projectRepo; plan 31.2-22 re-axes it.
// Stub it so this suite exercises TaskTable rather than that pending migration.
vi.mock('../../src/components/common/QuickReminderModal', () => ({
  QuickReminderModal: () => null,
}));

describe('TaskTable Component', () => {
  let db: TaskPlannerDatabase;

  const sampleSystems: System[] = [
    {
      id: 'sys-1',
      code: 'PAYMENT_SVC',
      name: 'Payment Service',
      type: 'SERVICE',
      parentId: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];

  const sampleChangeRequests: ChangeRequest[] = [
    {
      id: 'cr-1',
      code: 'CR-2026-001',
      name: 'Thanh toán QR',
      type: 'NEW_FEATURE',
      status: 'In Progress',
      targets: [{ systemId: 'sys-1' }],
      opsOwners: ['NamNV'],
      businessAnalysts: ['HuongTT'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];

  const sampleTasks: Task[] = [
    {
      id: 'task-1',
      crId: 'cr-1',
      systemId: 'sys-1',
      name: 'Alpha Task One',
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
      crId: 'cr-1',
      name: 'Beta Unattached Task',
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
    await db.systems.bulkAdd(sampleSystems);
    await db.changeRequests.bulkAdd(sampleChangeRequests);
    await db.tasks.bulkAdd(sampleTasks);
  });

  afterEach(async () => {
    await db.delete();
  });

  it('TaskFilterBar renders CR and Subsystem filters and no project or milestone filter', () => {
    const onFilterChange = vi.fn();
    render(
      <TaskFilterBar
        filters={DEFAULT_TASK_FILTER_STATE}
        onFilterChange={onFilterChange}
        changeRequests={sampleChangeRequests}
        systems={sampleSystems}
      />
    );

    expect(screen.getByPlaceholderText(/Tìm kiếm tác vụ/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Lọc theo CR')).toBeInTheDocument();
    expect(screen.getByLabelText('Lọc theo Subsystem')).toBeInTheDocument();
    expect(screen.queryByText('Lọc theo Dự án')).not.toBeInTheDocument();
    expect(screen.queryByText(/Milestone/i)).not.toBeInTheDocument();
    expect(screen.getByText('CR')).toBeInTheDocument();
    expect(screen.getByText('Độc lập')).toBeInTheDocument();
    expect(screen.getByText(/Hoàn thành & Đã hủy/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Bộ lọc nâng cao/i })).toBeInTheDocument();
  }, 15000);

  it('TaskFilterBar disables the Subsystem filter until a CR is chosen and limits options to that CR targets', async () => {
    const onFilterChange = vi.fn();
    const { rerender } = render(
      <TaskFilterBar
        filters={DEFAULT_TASK_FILTER_STATE}
        onFilterChange={onFilterChange}
        changeRequests={sampleChangeRequests}
        systems={sampleSystems}
      />
    );

    const subsystemSelect = screen.getByLabelText('Lọc theo Subsystem');
    expect(subsystemSelect).toBeDisabled();

    rerender(
      <TaskFilterBar
        filters={{ ...DEFAULT_TASK_FILTER_STATE, crId: 'cr-1' }}
        onFilterChange={onFilterChange}
        changeRequests={sampleChangeRequests}
        systems={sampleSystems}
      />
    );

    const enabledSelect = screen.getByLabelText('Lọc theo Subsystem');
    expect(enabledSelect).not.toBeDisabled();
    fireEvent.mouseDown(enabledSelect);
    expect(await screen.findByText('Payment Service')).toBeInTheDocument();
  }, 15000);

  it('TaskTable renders the leading columns in the order Task, CR, Subsystem, Status, Ước lượng, Hạn', () => {
    render(
      <TaskTable
        tasks={sampleTasks}
        changeRequests={sampleChangeRequests}
        systems={sampleSystems}
        selectedRowKeys={[]}
        onSelectRows={vi.fn()}
        onOpenDrawer={vi.fn()}
        db={db}
      />
    );

    const headers = screen
      .getAllByRole('columnheader')
      .map((th) => th.textContent?.replace(/\s+/g, ' ').trim() ?? '')
      .filter((text) => text.length > 0);

    const leading = headers.slice(0, 6);
    expect(leading[0]).toContain('Tác vụ');
    expect(leading[1]).toContain('CR');
    expect(leading[2]).toContain('Subsystem');
    expect(leading[3]).toContain('Trạng thái');
    expect(leading[4]).toContain('Ước lượng');
    expect(leading[5]).toContain('Hạn');
  }, 15000);

  it('TaskTable renders Chung in the Subsystem cell when the task has no systemId', () => {
    render(
      <TaskTable
        tasks={sampleTasks}
        changeRequests={sampleChangeRequests}
        systems={sampleSystems}
        selectedRowKeys={[]}
        onSelectRows={vi.fn()}
        onOpenDrawer={vi.fn()}
        db={db}
      />
    );

    expect(screen.getByText('PAYMENT_SVC')).toBeInTheDocument();
    expect(screen.getByText('Chung')).toBeInTheDocument();
  }, 15000);

  it('TaskTable renders the CR code tag in the CR type colour with the CR name as tooltip', () => {
    render(
      <TaskTable
        tasks={sampleTasks}
        changeRequests={sampleChangeRequests}
        systems={sampleSystems}
        selectedRowKeys={[]}
        onSelectRows={vi.fn()}
        onOpenDrawer={vi.fn()}
        db={db}
      />
    );

    const crTags = screen.getAllByText('CR-2026-001');
    expect(crTags.length).toBeGreaterThan(0);
    expect(crTags[0]).toHaveStyle({ color: '#1677ff' });
    expect(crTags[0]!.closest('[title]')).toHaveAttribute('title', 'Thanh toán QR');
  }, 15000);

  it('TaskTable renders estimates, link badges and inherited tags from the CR', () => {
    const onOpenDrawer = vi.fn();
    render(
      <TaskTable
        tasks={sampleTasks}
        changeRequests={sampleChangeRequests}
        systems={sampleSystems}
        selectedRowKeys={[]}
        onSelectRows={vi.fn()}
        onOpenDrawer={onOpenDrawer}
        db={db}
      />
    );

    expect(screen.getByText('Alpha Task One')).toBeInTheDocument();
    expect(screen.getByText('/ 1h 30m')).toBeInTheDocument();
    expect(screen.getByText(/🔗 1/i)).toBeInTheDocument();
    expect(screen.getByText('Điều tra lỗi / R&D')).toBeInTheDocument();
    expect(screen.getByText('DucVA')).toBeInTheDocument();
    // Inherited BA tag from the CR (both rows inherit it)
    expect(screen.getAllByText('HuongTT').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Sao chép Standup/i })).toBeInTheDocument();
  }, 15000);

  it('Table keyboard navigation handles Arrow navigation and Enter opening drawer', () => {
    const onOpenDrawer = vi.fn();
    const onSelectRows = vi.fn();

    render(
      <TaskTable
        tasks={sampleTasks}
        changeRequests={sampleChangeRequests}
        systems={sampleSystems}
        selectedRowKeys={[]}
        onSelectRows={onSelectRows}
        onOpenDrawer={onOpenDrawer}
        db={db}
      />
    );

    const tableContainer = screen.getByTestId('task-table-container');
    fireEvent.keyDown(tableContainer, { key: 'ArrowDown' });
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
        changeRequests={sampleChangeRequests}
        systems={sampleSystems}
      />
    );

    expect(screen.getByText('Đã chọn 2 tác vụ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Bỏ chọn/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Di chuyển/i }));

    expect(await screen.findByText('CR đích:')).toBeInTheDocument();
    expect(screen.getByText('Subsystem đích:')).toBeInTheDocument();
  });

  it('Empty state renders friendly message when no tasks match filters', () => {
    render(
      <TaskTable
        tasks={[]}
        changeRequests={[]}
        systems={[]}
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
        changeRequests={sampleChangeRequests}
        systems={sampleSystems}
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
      crId: 'cr-1',
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
        changeRequests={sampleChangeRequests}
        systems={sampleSystems}
        selectedRowKeys={[]}
        onSelectRows={vi.fn()}
        onOpenDrawer={onOpenDrawer}
        jiraDomain="test-company.atlassian.net"
        db={db}
      />
    );

    const jiraTag = screen.getByText('SHB-567');
    fireEvent.click(jiraTag);

    expect(windowOpenSpy).toHaveBeenCalledWith(
      'https://test-company.atlassian.net/browse/SHB-567',
      '_blank',
      'noopener,noreferrer'
    );
    expect(onOpenDrawer).not.toHaveBeenCalled();

    windowOpenSpy.mockRestore();
  });

  it('renders document links tag and clicking a local folder link invokes openDocumentLink', async () => {
    const documentLinksModule = await import('../../src/utils/documentLinks');
    const openDocSpy = vi.spyOn(documentLinksModule, 'openDocumentLink').mockImplementation(async () => {});

    render(
      <TaskTable
        tasks={[
          {
            id: 'task-doc-1',
            crId: 'cr-1',
            name: 'Task with doc link',
            status: 'Open',
            priority: 'Medium',
            workType: 'document',
            estimateMinutes: 30,
            progress: 0,
            documentLinks: ['/Users/test/workspace/project'],
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ]}
        changeRequests={sampleChangeRequests}
        systems={sampleSystems}
        selectedRowKeys={[]}
        onSelectRows={vi.fn()}
        onOpenDrawer={vi.fn()}
        db={db}
      />
    );

    const linkTag = screen.getByText('🔗 1');
    fireEvent.mouseEnter(linkTag);

    const docLinkAnchor = await screen.findByRole('link', { name: /\/Users\/test\/workspace\/project/ });
    expect(docLinkAnchor).toHaveAttribute('title', 'Mở trong File Explorer');

    fireEvent.click(docLinkAnchor);
    expect(openDocSpy).toHaveBeenCalledWith('/Users/test/workspace/project');

    openDocSpy.mockRestore();
  });

  it('renders long document links properly with word-break and tooltip on hover', async () => {
    const longLink = 'https://example.com/very/deeply/nested/path/to/some/resource/with/very/long/query?param1=value1&param2=value2&param3=value3';
    const taskWithLongLink: Task = {
      ...sampleTasks[0]!,
      id: 'task-long-link',
      name: 'Task with long link',
      documentLinks: [longLink],
    };

    render(
      <TaskTable
        tasks={[taskWithLongLink]}
        changeRequests={sampleChangeRequests}
        systems={sampleSystems}
        selectedRowKeys={[]}
        onSelectRows={vi.fn()}
        onOpenDrawer={vi.fn()}
        db={db}
      />
    );

    const linkTag = screen.getByText('🔗 1');
    fireEvent.mouseEnter(linkTag);

    const docLinkAnchor = await screen.findByRole('link');
    expect(docLinkAnchor).toHaveAttribute('title', 'Mở liên kết web');

    const spanElement = screen.getByTitle(longLink);
    expect(spanElement).toHaveTextContent(longLink);
    expect(spanElement).toHaveStyle({ wordBreak: 'break-all' });
  });
});
