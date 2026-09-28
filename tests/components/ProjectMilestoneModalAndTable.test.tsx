import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import 'fake-indexeddb/auto';
import { ProjectModal } from '../../src/components/projects/ProjectModal';
import { MilestoneModal } from '../../src/components/projects/MilestoneModal';
import { ProjectTable } from '../../src/components/projects/ProjectTable';
import type { Project, Milestone } from '../../src/types/models';

describe('Project and Milestone Modals and ProjectTable Banking IT Fields', () => {
  const sampleProject: Project = {
    id: 'proj-1',
    name: 'OmniChannel Banking',
    status: 'In Progress',
    opsOwners: ['NamNV', 'TuanLA'],
    businessAnalysts: ['HuongTT'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const sampleMilestones: Milestone[] = [
    {
      id: 'ms-1',
      projectId: 'proj-1',
      name: 'Sprint 1',
      status: 'In Progress',
      opsOwners: ['DucVA'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];

  it('ProjectModal renders Ops Owner and BA tag select inputs', () => {
    render(
      <ProjectModal
        open={true}
        project={sampleProject}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(screen.getByText('Ops Owner')).toBeInTheDocument();
    expect(screen.getByText('Business Analyst')).toBeInTheDocument();
    expect(screen.getByText('NamNV')).toBeInTheDocument();
    expect(screen.getByText('HuongTT')).toBeInTheDocument();
  });

  it('MilestoneModal renders Ops Owner and BA inputs with inheritance placeholder from project', () => {
    render(
      <MilestoneModal
        open={true}
        projectId="proj-1"
        project={sampleProject}
        milestone={null}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(screen.getByText('Ops Owner')).toBeInTheDocument();
    expect(screen.getByText('Business Analyst')).toBeInTheDocument();
    expect(screen.getByText(/Kế thừa: \[NamNV, TuanLA\] \(từ Dự án\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Kế thừa: \[HuongTT\] \(từ Dự án\)/i)).toBeInTheDocument();
  });

  it('ProjectTable renders Ops Owner and BA tags in project row', () => {
    render(
      <ProjectTable
        projects={[sampleProject]}
        milestones={sampleMilestones}
        tasks={[]}
        onAddTask={vi.fn()}
        onEditProject={vi.fn()}
        onDeleteProject={vi.fn()}
        onAddMilestone={vi.fn()}
        onEditMilestone={vi.fn()}
        onDeleteMilestone={vi.fn()}
        onEditTask={vi.fn()}
      />
    );

    expect(screen.getByText('NamNV')).toBeInTheDocument();
    expect(screen.getByText('TuanLA')).toBeInTheDocument();
    expect(screen.getByText('HuongTT')).toBeInTheDocument();
  });

  it('ProjectModal renders documentLinks section and ProjectTable renders link badge', () => {
    const projWithLinks: Project = {
      ...sampleProject,
      documentLinks: ['https://example.com/spec', 'https://example.com/arch'],
    };

    render(
      <ProjectModal
        open={true}
        project={projWithLinks}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(screen.getByText('Tài liệu liên kết')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://example.com/spec')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://example.com/arch')).toBeInTheDocument();

    const { unmount } = render(
      <ProjectTable
        projects={[projWithLinks]}
        milestones={[]}
        tasks={[]}
        onAddTask={vi.fn()}
        onEditProject={vi.fn()}
        onDeleteProject={vi.fn()}
        onAddMilestone={vi.fn()}
        onEditMilestone={vi.fn()}
        onDeleteMilestone={vi.fn()}
        onEditTask={vi.fn()}
      />
    );

    expect(screen.getByText('2 links')).toBeInTheDocument();
    unmount();
  });
});
