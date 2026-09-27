import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { TaskPlannerDatabase } from '../../src/db';
import { ProjectTable } from '../../src/components/projects/ProjectTable';
import { ProjectModal } from '../../src/components/projects/ProjectModal';
import { MilestoneModal } from '../../src/components/projects/MilestoneModal';
import { CascadeDeleteModal } from '../../src/components/projects/CascadeDeleteModal';
import type { Project, Milestone, Task } from '../../src/types/models';

describe('ProjectsView & Hierarchy Components', () => {
  let db: TaskPlannerDatabase;

  const sampleProject: Project = {
    id: 'proj-1',
    name: 'Website Redesign',
    description: 'Revamp public marketing site',
    status: 'In Progress',
    deadline: '2026-12-31',
    notes: 'Primary quarterly goal',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const sampleMilestone: Milestone = {
    id: 'ms-1',
    projectId: 'proj-1',
    name: 'Phase 1 MVP',
    description: 'Initial public launch',
    status: 'Open',
    deadline: '2026-06-30',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const sampleTask: Task = {
    id: 'task-1',
    projectId: 'proj-1',
    milestoneId: 'ms-1',
    name: 'Design mockups',
    status: 'Open',
    priority: 'High',
    estimateMinutes: 120,
    progress: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(async () => {
    db = new TaskPlannerDatabase('test-hierarchy-' + Math.random().toString(36).slice(2));
    await db.open();
    await db.projects.add(sampleProject);
    await db.milestones.add(sampleMilestone);
    await db.tasks.add(sampleTask);
  });

  afterEach(async () => {
    await db.delete();
  });

  it('ProjectTable renders projects and contextual Add Task button', () => {
    const onAddTask = vi.fn();
    render(
      <ProjectTable
        projects={[sampleProject]}
        milestones={[sampleMilestone]}
        tasks={[sampleTask]}
        onAddTask={onAddTask}
        onEditProject={vi.fn()}
        onDeleteProject={vi.fn()}
        onAddMilestone={vi.fn()}
        onEditMilestone={vi.fn()}
        onDeleteMilestone={vi.fn()}
        onEditTask={vi.fn()}
      />
    );

    expect(screen.getByText('Website Redesign')).toBeInTheDocument();
    expect(screen.getByText('Đang làm')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tác vụ/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Tác vụ/i }));
    expect(onAddTask).toHaveBeenCalledWith('proj-1', undefined);
  });

  it('ProjectModal creates project on submission', async () => {
    const onSave = vi.fn();
    render(
      <ProjectModal
        open={true}
        onClose={vi.fn()}
        onSave={onSave}
      />
    );

    expect(screen.getByText('Dự án mới')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Tên dự án/i), { target: { value: 'Brand New System' } });
    fireEvent.click(screen.getByRole('button', { name: /Tạo dự án/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Brand New System',
          status: 'Open',
        })
      );
    });
  });

  it('MilestoneModal creates milestone for parent project', async () => {
    const onSave = vi.fn();
    render(
      <MilestoneModal
        open={true}
        projectId="proj-1"
        onClose={vi.fn()}
        onSave={onSave}
      />
    );

    expect(screen.getByText('Cột mốc mới')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Tên cột mốc/i), { target: { value: 'Sprint Alpha' } });
    fireEvent.click(screen.getByRole('button', { name: /Tạo cột mốc/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Sprint Alpha',
          projectId: 'proj-1',
          status: 'Open',
        })
      );
    });
  });

  it('CascadeDeleteModal presents choice between Delete All and Keep Tasks for Project', () => {
    const onConfirm = vi.fn();
    render(
      <CascadeDeleteModal
        open={true}
        targetType="project"
        targetName="Website Redesign"
        childMilestoneCount={1}
        childTaskCount={2}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByText(/Xóa dự án 'Website Redesign'/i)).toBeInTheDocument();
    expect(screen.getByText(/chứa 1 cột mốc và 2 tác vụ/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Xóa tất cả/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Giữ lại tác vụ \(Chuyển thành Độc lập\)/i })).toBeInTheDocument();

    // Default button preserves tasks
    fireEvent.click(screen.getByRole('button', { name: /Giữ lại tác vụ \(Chuyển thành Độc lập\)/i }));
    expect(onConfirm).toHaveBeenCalledWith('orphan');
  });

  it('CascadeDeleteModal presents choice for Milestone deletion', () => {
    const onConfirm = vi.fn();
    render(
      <CascadeDeleteModal
        open={true}
        targetType="milestone"
        targetName="Phase 1 MVP"
        childTaskCount={3}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByText(/Xóa cột mốc 'Phase 1 MVP'/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Xóa tất cả tác vụ con/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Giữ lại tác vụ \(Chuyển lên Cấp dự án\)/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Xóa tất cả tác vụ con/i }));
    expect(onConfirm).toHaveBeenCalledWith('cascade');
  });
});
