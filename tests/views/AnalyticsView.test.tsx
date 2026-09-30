import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { AnalyticsView } from '../../src/views/AnalyticsView';
import { TaskPlannerDatabase } from '../../src/db/index';
import { initializeDatabaseDefaults } from '../../src/db/seeds';
import { createProject } from '../../src/db/repositories/projectRepo';
import { createMilestone } from '../../src/db/repositories/milestoneRepo';
import { createTask } from '../../src/db/repositories/taskRepo';
import dayjs from 'dayjs';

describe('AnalyticsView Dashboard (ANLT-01, ANLT-02, ANLT-03)', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase('TestAnalyticsView_' + Math.random().toString(36).slice(2));
    await testDb.open();
    await initializeDatabaseDefaults(testDb);
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('renders all 3 dashboard sections (Burndown, Velocity & Projects, Workload Allocation) in vertical layout per D-14', async () => {
    const proj = await createProject(
      {
        name: 'Dự án Alpha',
        status: 'Open',
      },
      testDb
    );

    const ms = await createMilestone(
      {
        projectId: proj.id,
        name: 'Cột mốc Alpha 1',
        deadline: '2026-10-15',
        status: 'Open',
      },
      testDb
    );

    await createTask(
      {
        projectId: proj.id,
        milestoneId: ms.id,
        name: 'Task 1 Alpha',
        status: 'In Progress',
        priority: 'High',
        estimateMinutes: 120,
      },
      testDb
    );

    render(<AnalyticsView db={testDb} />);

    // Section 1: Milestone Burndown
    expect(await screen.findByTestId('section-milestone-burndown')).toBeInTheDocument();
    expect(screen.getByText('Tiến độ Burndown Milestone')).toBeInTheDocument();

    // Section 2: Project Velocity & Status
    expect(screen.getByTestId('section-project-velocity')).toBeInTheDocument();
    expect(screen.getByText('Vận tốc bàn giao & Trạng thái Dự án')).toBeInTheDocument();

    // Section 3: Stakeholder Workload Allocation
    expect(screen.getByTestId('section-stakeholder-workload')).toBeInTheDocument();
    expect(screen.getByText('Phân bổ Tải Stakeholder & Hạng mục')).toBeInTheDocument();
  });

  it('Burndown section auto-selects open milestone with nearest deadline, handles dropdown change, and toggles unit per D-01, D-15', async () => {
    const proj = await createProject({ name: 'Dự án Beta', status: 'Open' }, testDb);

    // Far deadline milestone
    await createMilestone(
      {
        projectId: proj.id,
        name: 'Cột mốc Muộn',
        deadline: '2026-11-01',
        status: 'Open',
      },
      testDb
    );

    // Near deadline milestone (should be auto-selected)
    const msNear = await createMilestone(
      {
        projectId: proj.id,
        name: 'Cột mốc Gần',
        deadline: '2026-10-05',
        status: 'Open',
      },
      testDb
    );

    // Completed milestone with even earlier deadline (should be skipped because Done)
    await createMilestone(
      {
        projectId: proj.id,
        name: 'Cột mốc Đã Xong',
        deadline: '2026-09-01',
        status: 'Done',
      },
      testDb
    );

    await createTask(
      {
        projectId: proj.id,
        milestoneId: msNear.id,
        name: 'Tác vụ Gần 1',
        status: 'Open',
        priority: 'Medium',
        estimateMinutes: 180,
      },
      testDb
    );

    render(<AnalyticsView db={testDb} />);

    // Wait for data load and check auto-selected milestone
    await waitFor(() => {
      expect(screen.getByTestId('milestone-select')).toBeInTheDocument();
    });

    expect(await screen.findByText('Cột mốc Gần')).toBeInTheDocument();

    // Check SVG chart rendered
    expect(screen.getByRole('img', { name: /burndown/i })).toBeInTheDocument();

    // Unit toggle between hours and count
    const countToggleBtn = screen.getByText('Số tác vụ');
    fireEvent.click(countToggleBtn);

    // Verify unit changed
    await waitFor(() => {
      expect(screen.getByText('1 tác vụ')).toBeInTheDocument();
    });
  });

  it('honors initialMilestoneId prop when passed from route params per D-15', async () => {
    const proj = await createProject({ name: 'Dự án Route', status: 'Open' }, testDb);

    await createMilestone(
      {
        projectId: proj.id,
        name: 'Milestone One',
        deadline: '2026-10-01',
        status: 'Open',
      },
      testDb
    );

    const ms2 = await createMilestone(
      {
        projectId: proj.id,
        name: 'Milestone Two Targeted',
        deadline: '2026-10-20',
        status: 'Open',
      },
      testDb
    );

    await createTask(
      {
        projectId: proj.id,
        milestoneId: ms2.id,
        name: 'Targeted Task',
        status: 'In Progress',
        priority: 'High',
        estimateMinutes: 60,
      },
      testDb
    );

    render(<AnalyticsView db={testDb} initialMilestoneId={ms2.id} />);

    expect(await screen.findByText('Milestone Two Targeted')).toBeInTheDocument();
  });

  it('Project Velocity section allows switching rolling windows and renders project table with StackedStatusBar per D-05, D-06, D-07', async () => {
    const today = dayjs().format('YYYY-MM-DD');
    const proj = await createProject({ name: 'Dự án Gamma', status: 'Open' }, testDb);

    // Completed task in current week
    await createTask(
      {
        projectId: proj.id,
        name: 'Task Gamma Completed',
        status: 'Done',
        priority: 'High',
        estimateMinutes: 240,
        actualEndDate: today,
      },
      testDb
    );

    // Open task
    await createTask(
      {
        projectId: proj.id,
        name: 'Task Gamma Pending',
        status: 'In Progress',
        priority: 'Medium',
        estimateMinutes: 120,
      },
      testDb
    );

    render(<AnalyticsView db={testDb} />);

    // Project comparison table rendered
    expect(await screen.findByText('Dự án Gamma')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: /trạng thái/i })).toBeInTheDocument();

    // Check rolling window buttons exist
    expect(screen.getByText('2 tuần')).toBeInTheDocument();
    expect(screen.getByText('4 tuần')).toBeInTheDocument();
    expect(screen.getByText('8 tuần')).toBeInTheDocument();
    expect(screen.getByText('12 tuần')).toBeInTheDocument();

    // Switch rolling window to 8 weeks
    fireEvent.click(screen.getByText('8 tuần'));

    // Verify velocity metric summary rendered
    expect(screen.getByTestId('velocity-metric-summary')).toBeInTheDocument();
  });

  it('Workload section renders 3 tabs (Ops Owner, BA, Work Type) and supports active tasks scope toggle per D-09, D-11, D-12', async () => {
    const proj = await createProject(
      {
        name: 'Dự án Delta',
        status: 'Open',
        opsOwners: ['Alice Ops'],
        businessAnalysts: ['Bob BA'],
      },
      testDb
    );

    await createTask(
      {
        projectId: proj.id,
        name: 'Active Task Code',
        status: 'In Progress',
        priority: 'High',
        workType: 'code',
        estimateMinutes: 120,
      },
      testDb
    );

    await createTask(
      {
        projectId: proj.id,
        name: 'Done Task Meeting',
        status: 'Done',
        priority: 'Low',
        workType: 'meeting',
        estimateMinutes: 60,
      },
      testDb
    );

    render(<AnalyticsView db={testDb} />);

    // Verify 3 tabs
    expect(await screen.findByRole('tab', { name: 'Ops Owner' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Business Analyst' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Loại công việc' })).toBeInTheDocument();

    // Alice Ops inherited from project
    expect(await screen.findByText('Alice Ops')).toBeInTheDocument();

    // Workload proportion bar rendered
    expect(screen.getByRole('progressbar', { name: /phân bổ tải/i })).toBeInTheDocument();

    // Switch tab to Work Type
    fireEvent.click(screen.getByRole('tab', { name: 'Loại công việc' }));
    expect(await screen.findByText('Lập trình')).toBeInTheDocument();

    // Toggle scope to include all tasks (including Done)
    const scopeToggle = screen.getByTestId('workload-scope-toggle');
    fireEvent.click(scopeToggle);

    // After including Done, 'Họp hành' (meeting) should appear
    expect(await screen.findByText('Họp hành')).toBeInTheDocument();
  });

  it('displays designated EmptyState with action CTAs for sections without data per D-16 and UI-SPEC', async () => {
    const onNavigate = vi.fn();
    render(<AnalyticsView db={testDb} onNavigate={onNavigate} />);

    // Section 1: Milestone Burndown empty state
    expect(await screen.findByText('Chưa có dữ liệu Milestone')).toBeInTheDocument();
    expect(
      screen.getByText('Tạo milestone mới và thêm các tác vụ ước lượng để theo dõi tiến độ burndown.')
    ).toBeInTheDocument();

    const createMsBtn = screen.getByRole('button', { name: 'Tạo Milestone' });
    fireEvent.click(createMsBtn);
    expect(onNavigate).toHaveBeenCalledWith('projects');

    // Section 2: Project Velocity empty state
    expect(screen.getByText('Chưa có dữ liệu vận tốc')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Hoàn thành các tác vụ đầu tiên để hệ thống bắt đầu đo lường vận tốc bàn giao theo tuần.'
      )
    ).toBeInTheDocument();

    // Section 3: Workload empty state
    expect(screen.getByText('Chưa có tác vụ nào được phân công')).toBeInTheDocument();
    expect(
      screen.getByText('Thêm tác vụ hoặc gán Ops Owner / BA / Loại công việc để xem biểu đồ phân bổ tải.')
    ).toBeInTheDocument();
  });
});
