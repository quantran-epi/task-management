import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../src/db';
import { createTask } from '../../src/db/repositories/taskRepo';
import { createChangeRequest } from '../../src/db/repositories/changeRequestRepo';
import { InlineStatusTag } from '../../src/components/tasks/InlineStatusTag';
import { InlineProgress } from '../../src/components/tasks/InlineProgress';
import { HierarchyBreadcrumb } from '../../src/components/tasks/HierarchyBreadcrumb';
import { message } from 'antd';

vi.mock('antd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('antd')>();
  return {
    ...actual,
    message: {
      success: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
    },
  };
});

describe('InlineControls', () => {
  let testDb: TaskPlannerDatabase;
  let crId: string;

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase(`test-inline-${Math.random()}`);
    await testDb.open();
    // `Task.crId` is required (D-27), so every fixture hangs off a real CR.
    const cr = await createChangeRequest(
      { code: 'CR-INLINE', name: 'Inline CR', status: 'Open', type: 'ENHANCEMENT', targets: [] },
      testDb
    );
    crId = cr.id;
    vi.clearAllMocks();
  });

  describe('InlineStatusTag', () => {
    it('renders current status and updates status on dropdown selection per D-06, D-32, TASK-03', async () => {
      const task = await createTask({ name: 'Test task', status: 'Open', crId }, testDb);

      const onStatusChange = vi.fn();
      render(
        <InlineStatusTag
          taskId={task.id}
          status={task.status}
          onStatusChange={onStatusChange}
          db={testDb}
        />
      );

      const tag = screen.getByText(/Mở/i);
      expect(tag).toBeInTheDocument();

      // Click tag to open dropdown
      fireEvent.click(tag);

      // Ant Design renders dropdown menu items
      const inProgressItem = await screen.findByText('Đang làm');
      fireEvent.click(inProgressItem);

      await waitFor(() => {
        expect(onStatusChange).toHaveBeenCalledWith('In Progress');
      });

      const updated = await testDb.tasks.get(task.id);
      expect(updated?.status).toBe('In Progress');
      expect(message.success).toHaveBeenCalledWith(
        expect.objectContaining({ content: 'Đã cập nhật trạng thái' })
      );
    });

    it('displays reminder if switched to In Progress with 0 estimate per D-24', async () => {
      const task = await createTask(
        { name: 'Zero estimate task', status: 'Open', estimateMinutes: 0, crId },
        testDb
      );

      render(
        <InlineStatusTag
          taskId={task.id}
          status={task.status}
          estimateMinutes={0}
          db={testDb}
        />
      );

      fireEvent.click(screen.getByText(/Mở/i));
      const inProgressItem = await screen.findByText('Đang làm');
      fireEvent.click(inProgressItem);

      await waitFor(() => {
        expect(message.info).toHaveBeenCalledWith(
          expect.objectContaining({ content: expect.stringContaining('ước tính') })
        );
      });
    });

    it('renders Cancelled with line-through styling per D-15', () => {
      render(
        <InlineStatusTag
          taskId="cancel-task"
          status="Cancelled"
          db={testDb}
        />
      );

      const tag = screen.getByText(/Đã hủy/i);
      expect(tag).toHaveStyle({ textDecoration: 'line-through' });
    });
  });

  describe('InlineProgress', () => {
    it('renders progress and updates on slider / input change per D-07, TASK-06', async () => {
      const task = await createTask(
        { name: 'Progress task', status: 'In Progress', progress: 20, crId },
        testDb
      );

      const onProgressChange = vi.fn();
      render(
        <InlineProgress
          taskId={task.id}
          progress={20}
          onProgressChange={onProgressChange}
          db={testDb}
        />
      );

      // Progress bar rendered with 20%
      const trigger = screen.getByRole('button', { name: /tiến độ 20%/i });
      fireEvent.click(trigger);

      // Popover shows input with 20
      const input = await screen.findByRole('spinbutton');
      expect(input).toHaveValue('20%');

      // Change input to 75
      fireEvent.change(input, { target: { value: '75' } });
      fireEvent.blur(input);

      // Close popover to trigger persistence
      fireEvent.click(trigger);

      await waitFor(() => {
        expect(onProgressChange).toHaveBeenCalledWith(75);
      });

      const updated = await testDb.tasks.get(task.id);
      expect(updated?.progress).toBe(75);
      expect(message.success).toHaveBeenCalledWith(
        expect.objectContaining({ content: 'Đã cập nhật tiến độ' })
      );
    });
  });

  // D-46/D-47: the only hierarchy above a task is `CR > Subsystem`.
  describe('HierarchyBreadcrumb', () => {
    it('renders the unattached marker when no CR is provided per D-02', () => {
      render(<HierarchyBreadcrumb />);
      expect(screen.getByText('Chưa gắn CR')).toBeInTheDocument();
    });

    it('renders the CR code when only a CR is given', () => {
      const onSelect = vi.fn();
      render(
        <HierarchyBreadcrumb crId="cr-1" crCode="CR-2026-001" crName="CR Aurora" onSelectCr={onSelect} />
      );

      const chip = screen.getByText('CR-2026-001');
      expect(chip).toBeInTheDocument();

      fireEvent.click(chip);
      expect(onSelect).toHaveBeenCalledWith('cr-1');
    });

    it('renders CR > Subsystem when a subsystem is given', () => {
      const onSelect = vi.fn();
      render(
        <HierarchyBreadcrumb
          crId="cr-1"
          crCode="CR-2026-001"
          crName="CR Aurora"
          systemCode="PAY-API"
          systemName="Payments API"
          onSelectCr={onSelect}
        />
      );

      const chip = screen.getByText('CR-2026-001 > PAY-API');
      expect(chip).toBeInTheDocument();

      fireEvent.click(chip);
      expect(onSelect).toHaveBeenCalledWith('cr-1');
    });
  });
});
