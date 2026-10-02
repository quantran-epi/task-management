import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProjectDetailModal } from '../../../src/components/projects/ProjectDetailModal';
import { TaskPlannerDatabase } from '../../../src/db';
import 'fake-indexeddb/auto';
import type { Project, Milestone, Task } from '../../../src/types/models';

describe('ProjectDetailModal', () => {
  let db: TaskPlannerDatabase;

  const sampleProject: Project = {
    id: 'proj-1',
    name: 'Website Redesign',
    description: 'Redesign company website',
    notes: 'Important notes about branding',
    status: 'In Progress',
    deadline: '2026-12-31',
    jiraEpicKey: 'WEB-100',
    opsOwners: ['Alice'],
    businessAnalysts: ['Bob'],
    documentLinks: ['https://figma.com/design'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(async () => {
    db = new TaskPlannerDatabase('test-project-detail-' + Math.random());
    await db.open();
  });

  it('renders project metadata, milestones, and task stats', async () => {
    // Seed milestone & task
    const milestone: Milestone = {
      id: 'm-1',
      projectId: 'proj-1',
      name: 'Phase 1 MVP',
      status: 'In Progress',
      deadline: '2026-06-30',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const task: Task = {
      id: 't-1',
      projectId: 'proj-1',
      milestoneId: 'm-1',
      name: 'Design landing page',
      status: 'Done',
      priority: 'High',
      progress: 100,
      estimateMinutes: 120,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    await db.milestones.add(milestone);
    await db.tasks.add(task);

    const onClose = vi.fn();
    const onEdit = vi.fn();
    const onNavigateToProjects = vi.fn();

    render(
      <ProjectDetailModal
        open={true}
        project={sampleProject}
        onClose={onClose}
        onEdit={onEdit}
        onNavigateToProjects={onNavigateToProjects}
        db={db}
      />
    );

    expect(screen.getByText('Website Redesign')).toBeInTheDocument();
    expect(screen.getByText('Redesign company website')).toBeInTheDocument();
    expect(screen.getByText('WEB-100')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Phase 1 MVP')).toBeInTheDocument();
      expect(screen.getByText('Design landing page')).toBeInTheDocument();
    });

    // Check navigator action
    const navBtn = screen.getByText('Mở trong trang Dự án');
    fireEvent.click(navBtn);
    expect(onNavigateToProjects).toHaveBeenCalledWith('proj-1');
    expect(onClose).toHaveBeenCalled();
  });

  it('triggers onEdit when editing button clicked', () => {
    const onClose = vi.fn();
    const onEdit = vi.fn();

    render(
      <ProjectDetailModal
        open={true}
        project={sampleProject}
        onClose={onClose}
        onEdit={onEdit}
        db={db}
      />
    );

    const editBtn = screen.getByText('Chỉnh sửa dự án');
    fireEvent.click(editBtn);

    expect(onEdit).toHaveBeenCalledWith(sampleProject);
    expect(onClose).toHaveBeenCalled();
  });
});
