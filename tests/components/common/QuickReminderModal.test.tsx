import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QuickReminderModal } from '../../../src/components/common/QuickReminderModal';
import { TaskPlannerDatabase } from '../../../src/db/index';
import type { Task, Project } from '../../../src/types/models';

describe('QuickReminderModal', () => {
  let testDb: TaskPlannerDatabase;

  beforeEach(async () => {
    testDb = new TaskPlannerDatabase('TestQuickReminderDB_' + Math.random().toString(36).slice(2));
    await testDb.open();
  });

  afterEach(async () => {
    await testDb.delete();
  });

  it('renders modal and submits new reminder for task', async () => {
    const mockTask: Task = {
      id: 'task-test-rem',
      name: 'Task cần thêm nhắc nhở',
      status: 'Open',
      priority: 'Medium',
      progress: 0,
      estimateMinutes: 30,
      workType: 'code',
      reminders: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await testDb.tasks.add(mockTask);

    const handleClose = vi.fn();

    render(
      <QuickReminderModal
        open={true}
        onClose={handleClose}
        target={{ type: 'task', entity: mockTask }}
        db={testDb}
      />
    );

    expect(screen.getByText(/Thêm nhắc nhở: Tác vụ "Task cần thêm nhắc nhở"/i)).toBeDefined();

    const saveButton = screen.getByRole('button', { name: /lưu nhắc nhở/i });
    fireEvent.click(saveButton);

    await waitFor(async () => {
      const updated = await testDb.tasks.get('task-test-rem');
      expect(updated?.reminders?.length).toBe(1);
    });

    expect(handleClose).toHaveBeenCalled();
  });

  it('submits new reminder for project', async () => {
    const mockProj: Project = {
      id: 'proj-test-rem',
      name: 'Project cần nhắc nhở',
      status: 'Open',
      reminders: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await testDb.projects.add(mockProj);

    const handleClose = vi.fn();

    render(
      <QuickReminderModal
        open={true}
        onClose={handleClose}
        target={{ type: 'project', entity: mockProj }}
        db={testDb}
      />
    );

    const saveButton = screen.getByRole('button', { name: /lưu nhắc nhở/i });
    fireEvent.click(saveButton);

    await waitFor(async () => {
      const updated = await testDb.projects.get('proj-test-rem');
      expect(updated?.reminders?.length).toBe(1);
    });

    expect(handleClose).toHaveBeenCalled();
  });
});
