import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskDrawer } from '../../src/components/tasks/TaskDrawer';
import { TimerContext, type TimerContextValue } from '../../src/context/TimerContext';
import { FormGuardProvider } from '../../src/context/FormGuardContext';
import type { Task, WorkSession } from '../../src/types/models';
import type { TaskPlannerDatabase } from '../../src/db';

describe('TaskDrawerWorkSessions', () => {
  let mockDb: any;

  const mockTask: Task = {
    id: 'task-test-1',
    name: 'Tác vụ kiểm thử phiên làm việc',
    status: 'In Progress',
    progress: 25,
    priority: 'High',
    estimateMinutes: 120,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockSessions: WorkSession[] = [
    {
      id: 'session-1',
      taskId: 'task-test-1',
      date: '2026-09-29',
      startTime: '2026-09-29T08:00:00.000Z',
      endTime: '2026-09-29T09:30:00.000Z',
      durationMinutes: 90,
      note: 'Hoàn thành bản thiết kế kiến trúc phần mềm chi tiết',
      createdAt: '2026-09-29T09:30:00.000Z',
      updatedAt: '2026-09-29T09:30:00.000Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = {
      tasks: {
        get: vi.fn().mockResolvedValue(mockTask),
        put: vi.fn().mockResolvedValue('task-test-1'),
        toArray: vi.fn().mockResolvedValue([mockTask]),
      },
      projects: {
        toArray: vi.fn().mockResolvedValue([]),
      },
      milestones: {
        toArray: vi.fn().mockResolvedValue([]),
      },
      workSessions: {
        where: vi.fn().mockReturnValue({
          equals: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue(mockSessions),
          }),
        }),
        get: vi.fn().mockImplementation((id: string) =>
          Promise.resolve(mockSessions.find((s) => s.id === id))
        ),
        add: vi.fn().mockResolvedValue('session-new'),
        put: vi.fn().mockResolvedValue('session-updated'),
        delete: vi.fn().mockResolvedValue(undefined),
      },
      plannedAllocations: {
        where: vi.fn().mockReturnValue({
          equals: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue([]),
          }),
        }),
      },
      capacityRules: {
        toArray: vi.fn().mockResolvedValue([]),
      },
      capacityOverrides: {
        where: vi.fn().mockReturnValue({
          equals: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      },
      settings: {
        get: vi.fn().mockResolvedValue(undefined),
      },
      transaction: vi.fn().mockImplementation((_mode: string, _tables: any, cb: () => any) => {
        return cb();
      }),
    };
  });

  const renderDrawer = (
    open = true,
    sessionsOverride: WorkSession[] = mockSessions,
    contextOverride: Partial<TimerContextValue> = {}
  ) => {
    mockDb.workSessions.where = vi.fn().mockReturnValue({
      equals: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue(sessionsOverride),
      }),
    });

    const timerContextDefault: TimerContextValue = {
      activeTimers: [],
      getTimerForTask: vi.fn().mockReturnValue(undefined),
      getElapsedSeconds: vi.fn().mockReturnValue(0),
      startTimer: vi.fn(),
      pauseTimer: vi.fn(),
      finishTimer: vi.fn(),
      cancelTimer: vi.fn(),
      ...contextOverride,
    };

    return render(
      <FormGuardProvider>
        <TimerContext.Provider value={timerContextDefault}>
          <TaskDrawer
            taskId="task-test-1"
            open={open}
            onClose={vi.fn()}
            db={mockDb as TaskPlannerDatabase}
          />
        </TimerContext.Provider>
      </FormGuardProvider>
    );
  };

  it('renders Work Sessions tab and displays session logs with spent progress', async () => {
    renderDrawer();

    // Click on "Lịch sử làm việc" tab
    const sessionsTab = await screen.findByRole('tab', { name: 'Lịch sử làm việc' });
    expect(sessionsTab).toBeInTheDocument();
    fireEvent.click(sessionsTab);

    // Verify session table headers and rendered data
    await waitFor(() => {
      expect(screen.getByText('2026-09-29')).toBeInTheDocument();
      expect(screen.getAllByText('1h 30m').length).toBeGreaterThanOrEqual(1);
      expect(
        screen.getByText('Hoàn thành bản thiết kế kiến trúc phần mềm chi tiết')
      ).toBeInTheDocument();
    });

    // Check spent progress info
    expect(screen.getByText('/ 2h (75%)')).toBeInTheDocument();
  });

  it('renders Empty state when no work sessions recorded', async () => {
    renderDrawer(true, []);

    const sessionsTab = await screen.findByRole('tab', { name: 'Lịch sử làm việc' });
    fireEvent.click(sessionsTab);

    await waitFor(() => {
      expect(screen.getByText('Chưa có phiên làm việc nào')).toBeInTheDocument();
      expect(
        screen.getByText(
          'Bấm "Bắt đầu tính giờ" hoặc "Thêm phiên làm việc" để ghi nhận thời gian cho tác vụ này.'
        )
      ).toBeInTheDocument();
    });
  });

  it('opens ManualWorkSessionModal when clicking Thêm phiên làm việc', async () => {
    renderDrawer();

    const sessionsTab = await screen.findByRole('tab', { name: 'Lịch sử làm việc' });
    fireEvent.click(sessionsTab);

    const addBtn = await screen.findByRole('button', { name: 'Thêm phiên làm việc' });
    expect(addBtn).toBeInTheDocument();
    fireEvent.click(addBtn);

    // Modal should open
    expect(await screen.findByText('Thêm phiên làm việc', { selector: '.ant-modal-title' })).toBeInTheDocument();
    expect(screen.getByText('Lưu phiên làm việc', { selector: 'button *' })).toBeInTheDocument();
  });
});
