import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../src/db';
import { QuickAddBar } from '../../src/components/tasks/QuickAddBar';
import { TaskDrawer } from '../../src/components/tasks/TaskDrawer';
import type { Task, Project, Milestone } from '../../src/types/models';

describe('QuickAddBar and TaskDrawer Banking IT Fields', () => {
  let db: TaskPlannerDatabase;

  const sampleProjects: Project[] = [
    {
      id: 'proj-1',
      name: 'Core Banking Modernization',
      status: 'In Progress',
      opsOwners: ['NamNV'],
      businessAnalysts: ['HuongTT'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];

  const sampleMilestones: Milestone[] = [
    {
      id: 'ms-1',
      projectId: 'proj-1',
      name: 'Phase 1 SIT',
      status: 'In Progress',
      opsOwners: ['TuanLA'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];

  const sampleTask: Task = {
    id: 'task-1',
    name: 'Implement Interbank Transfer API',
    projectId: 'proj-1',
    milestoneId: 'ms-1',
    status: 'Open',
    priority: 'High',
    workType: 'code',
    estimateMinutes: 120,
    progress: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(async () => {
    db = new TaskPlannerDatabase('test-quickadd-drawer-' + Math.random().toString(36).slice(2));
    await db.open();
    await db.projects.bulkAdd(sampleProjects);
    await db.milestones.bulkAdd(sampleMilestones);
    await db.tasks.add(sampleTask);
  });

  afterEach(async () => {
    await db.delete();
  });

  it('QuickAddBar defaults workType to code and allows task creation with workType', async () => {
    const onTaskCreated = vi.fn();
    render(
      <QuickAddBar
        projects={sampleProjects}
        onTaskCreated={onTaskCreated}
        db={db}
      />
    );

    // Check default workType label "Lập trình" is rendered
    expect(screen.getByText('Lập trình')).toBeInTheDocument();

    const input = screen.getByPlaceholderText(/Thêm tác vụ nhanh/i);
    fireEvent.change(input, { target: { value: 'Fix payment gateway bug ~1h' } });

    const submitBtn = screen.getByRole('button', { name: 'Thêm' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onTaskCreated).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Fix payment gateway bug',
          estimateMinutes: 60,
          workType: 'code',
        })
      );
    });
  });

  it('TaskDrawer renders workType, opsOwners, and businessAnalysts form inputs with inheritance hints', async () => {
    render(
      <TaskDrawer
        taskId="task-1"
        open={true}
        onClose={vi.fn()}
        db={db}
      />
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Implement Interbank Transfer API')).toBeInTheDocument();
    });

    // Check workType label is present
    expect(screen.getByText('Loại công việc')).toBeInTheDocument();
    // Check Ops Owner and BA labels are present
    expect(screen.getByText('Ops Owner')).toBeInTheDocument();
    expect(screen.getByText('Business Analyst')).toBeInTheDocument();

    // Inheritance hint check: for ms-1, opsOwners has TuanLA from milestone, BA inherits HuongTT from project
    expect(screen.getByText(/Kế thừa: \[TuanLA\] \(từ Milestone\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Kế thừa: \[HuongTT\] \(từ Dự án\)/i)).toBeInTheDocument();
  });
});
