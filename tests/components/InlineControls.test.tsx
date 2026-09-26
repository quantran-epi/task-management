import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPlannerDatabase } from '../../src/db';
import { createTask } from '../../src/db/repositories/taskRepo';
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

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase(`test-inline-${Math.random()}`);
    await testDb.open();
    vi.clearAllMocks();
  });

  describe('InlineStatusTag', () => {
    it('renders current status and updates status on dropdown selection per D-06, D-32, TASK-03', async () => {
      const task = await createTask({ name: 'Test task', status: 'Open' }, testDb);

      const onStatusChange = vi.fn();
      render(
        <InlineStatusTag
          taskId={task.id}
          status={task.status}
          onStatusChange={onStatusChange}
          db={testDb}
        />
      );

      const tag = screen.getByText(/Open/i);
      expect(tag).toBeInTheDocument();

      // Click tag to open dropdown
      fireEvent.click(tag);

      // Ant Design renders dropdown menu items
      const inProgressItem = await screen.findByText('In Progress');
      fireEvent.click(inProgressItem);

      await waitFor(() => {
        expect(onStatusChange).toHaveBeenCalledWith('In Progress');
      });

      const updated = await testDb.tasks.get(task.id);
      expect(updated?.status).toBe('In Progress');
      expect(message.success).toHaveBeenCalledWith(
        expect.objectContaining({ content: 'Status updated' })
      );
    });

    it('displays reminder if switched to In Progress with 0 estimate per D-24', async () => {
      const task = await createTask(
        { name: 'Zero estimate task', status: 'Open', estimateMinutes: 0 },
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

      fireEvent.click(screen.getByText(/Open/i));
      const inProgressItem = await screen.findByText('In Progress');
      fireEvent.click(inProgressItem);

      await waitFor(() => {
        expect(message.info).toHaveBeenCalledWith(
          expect.objectContaining({ content: expect.stringContaining('estimate') })
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

      const tag = screen.getByText(/Cancelled/i);
      expect(tag).toHaveStyle({ textDecoration: 'line-through' });
    });
  });

  describe('InlineProgress', () => {
    it('renders progress and updates on slider / input change per D-07, TASK-06', async () => {
      const task = await createTask(
        { name: 'Progress task', status: 'In Progress', progress: 20 },
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
      const trigger = screen.getByRole('button', { name: /progress 20%/i });
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
        expect.objectContaining({ content: 'Progress updated' })
      );
    });
  });

  describe('HierarchyBreadcrumb', () => {
    it('renders Standalone when no projectId is provided per D-02', () => {
      render(<HierarchyBreadcrumb />);
      expect(screen.getByText('Standalone')).toBeInTheDocument();
    });

    it('renders ProjectName when only project is given', () => {
      const onSelect = vi.fn();
      render(
        <HierarchyBreadcrumb
          projectId="p1"
          projectName="Project Aurora"
          onSelectProject={onSelect}
        />
      );

      const chip = screen.getByText('Project Aurora');
      expect(chip).toBeInTheDocument();

      fireEvent.click(chip);
      expect(onSelect).toHaveBeenCalledWith('p1');
    });

    it('renders ProjectName > MilestoneName when milestone is given', () => {
      const onSelect = vi.fn();
      render(
        <HierarchyBreadcrumb
          projectId="p1"
          projectName="Project Aurora"
          milestoneName="Sprint 1"
          onSelectProject={onSelect}
        />
      );

      const chip = screen.getByText('Project Aurora > Sprint 1');
      expect(chip).toBeInTheDocument();

      fireEvent.click(chip);
      expect(onSelect).toHaveBeenCalledWith('p1');
    });
  });
});
