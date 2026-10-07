import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

  it('ProjectModal renders Ops Owner, BA, and Pending status option', () => {
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
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /Trạng thái/i }));
    expect(screen.getByText('Chờ xử lý')).toBeInTheDocument();
  });

  it('ProjectModal saves empty notes when existing note is cleared', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <ProjectModal
        open={true}
        project={{ ...sampleProject, notes: 'old note' }}
        onClose={vi.fn()}
        onSave={onSave}
      />
    );

    fireEvent.change(screen.getByLabelText('Ghi chú'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await screen.findByText('Ghi chú');
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ notes: '' }));
  });

  it('MilestoneModal renders Ops Owner, BA, inheritance placeholder, and Pending status option', () => {
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
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /Trạng thái/i }));
    expect(screen.getByText('Chờ xử lý')).toBeInTheDocument();
  });

  it('ProjectTable renders Ops Owner, BA tags, and Pending status label in project row', () => {
    render(
      <ProjectTable
        projects={[{ ...sampleProject, status: 'Pending' }]}
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
    expect(screen.getByText('Chờ xử lý')).toBeInTheDocument();
    expect(screen.getByText('1-1 / 1 dự án')).toBeInTheDocument();
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

  it('changes project page size immediately when selecting 10', async () => {
    const projects = Array.from({ length: 12 }, (_, index) => ({
      ...sampleProject,
      id: `proj-page-${index}`,
      name: `Project Page ${index + 1}`,
    }));

    render(
      <ProjectTable
        projects={projects}
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

    expect(screen.getByText('1-12 / 12 dự án')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /page size/i }));
    fireEvent.click(await screen.findByText('10 / page'));
    expect(screen.getByText('1-10 / 12 dự án')).toBeInTheDocument();
    expect(screen.queryByText('Project Page 11')).not.toBeInTheDocument();
  });

  it('ProjectTable renders local folder link with File Explorer title and dispatches openDocumentLink', async () => {
    const documentLinksModule = await import('../../src/utils/documentLinks');
    const openDocSpy = vi.spyOn(documentLinksModule, 'openDocumentLink').mockImplementation(async () => {});

    const projWithLocalLink: Project = {
      ...sampleProject,
      id: 'proj-local-link',
      documentLinks: ['/Users/test/workspace/banking-app'],
    };

    render(
      <ProjectTable
        projects={[projWithLocalLink]}
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

    const linkTag = screen.getByText('1 link');
    expect(linkTag).toBeInTheDocument();

    fireEvent.mouseEnter(linkTag);

    const docLinkAnchor = await screen.findByRole('link', { name: /\/Users\/test\/workspace\/banking-app/ });
    expect(docLinkAnchor).toBeInTheDocument();
    expect(docLinkAnchor).toHaveAttribute('title', 'Mở trong File Explorer');

    fireEvent.click(docLinkAnchor);
    expect(openDocSpy).toHaveBeenCalledWith('/Users/test/workspace/banking-app');

    openDocSpy.mockRestore();
  });

  it('renders action dropdown and supports contextmenu on project row with Ask AI', () => {
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

    // Context menu via right-click on project row
    const projectText = screen.getByText('OmniChannel Banking');
    fireEvent.contextMenu(projectText, { clientX: 150, clientY: 250 });
    expect(screen.getByText('Hỏi Trợ lý AI')).toBeInTheDocument();
    expect(screen.getByText('Sửa dự án')).toBeInTheDocument();
    expect(screen.getByText('Xóa dự án')).toBeInTheDocument();

    // Action dropdown button
    const actionBtns = screen.getAllByLabelText('Thao tác khác');
    expect(actionBtns.length).toBeGreaterThan(0);
    fireEvent.click(actionBtns[0]!);
    expect(screen.getAllByText('Hỏi Trợ lý AI').length).toBeGreaterThan(0);
  });
});
